export function handleInsertToMP() {
  let pendingCandidate = null;
  let capturedCvUrl = null;

  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action !== "send_candidate_data") {
      sendResponse({ status: "error", message: `action inconnue ${message.action}` });
      return;
    }

    pendingCandidate = message.scrapedData;

    // If CV URL already captured, send everything now
    if (capturedCvUrl) {
      const binaryCv = await fetchPdfAsUint8Array(capturedCvUrl);
      if (!binaryCv) return;

      if (pendingCandidate && binaryCv) {
        const base64 = uint8ArrayToBase64(binaryCv);
        if (base64) {
          pendingCandidate.cvBase64 = base64;
          await openOrSendToMp(pendingCandidate);
        }
      }
      
      capturedCvUrl = null;
      pendingCandidate = null;
      sendResponse({ status: "success" });
      return;
    }

    // Else: wait for CV capture, so response is deferred
    sendResponse({ status: "success", message: "Waiting for CV URL..."  });
  });

  let isHandlingCv = false;
  // Intercept CV link
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (
        details.url.includes("linkedin.com/dms/prv/document/media") &&
        details.url.includes("recruiter-candidate-document-pdf-analyzed")
      ) {
        if (isHandlingCv) return;
        isHandlingCv = true;
        capturedCvUrl = details.url;
        console.log("CV URL intercepted:", capturedCvUrl);

        (async () => {
          const binaryCv = await fetchPdfAsUint8Array(capturedCvUrl);
          if (!binaryCv) return;

          if (pendingCandidate && binaryCv) {
            const base64 = uint8ArrayToBase64(binaryCv);
            if (base64) {
              pendingCandidate.cvBase64 = base64;
              await openOrSendToMp(pendingCandidate);
            }

            capturedCvUrl = null;
            pendingCandidate = null;
          }
        })();
      }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
}

async function fetchPdfAsUint8Array(pdfUrl) {
  try {
    const response = await fetch(pdfUrl, {
      credentials: 'include' // optional, only if the URL requires authentication cookies
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    console.log("status response : ", response.status);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.warn("Pb : ", error);
  }
}

// Reusable MP tab opening logic
async function openOrSendToMp(scrapedData) {
  const mpFormUrl = "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N";

  let tab_id = await findExistingTab(mpFormUrl);
  if (!tab_id) {
    tab_id = await createTab(mpFormUrl);
  }

  if (tab_id) {
    await sendToPage(tab_id, "submit_candidate_data", scrapedData);
  } else {
    console.error("Impossible d'ouvrir l'onglet MP");
  }
}

// tout bon a partir d'ici, le reste **peut** etre refacto
function findExistingTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const existingTab = tabs.find(tab => tab.url && tab.url.includes(url));
      resolve(existingTab?.id);
    });
  });
}

function createTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: true }, (new_tab) => {
      const listener = (id, { status }) => {
        if (id === new_tab.id && status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(id);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

function sendToPage(tabId, action, payload) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (action, payload) => {
      window.dispatchEvent(new CustomEvent("FROM_EXTENSION", {
        detail: { action, payload }
      }));
    },
    args: [action, payload]
  });
}

function uint8ArrayToBase64(uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}
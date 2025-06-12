export function handleInsertToMP() {
  let pendingCandidate = null;
  let capturedCvUrl = null;

  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action !== "send_candidate_data") {
      sendResponse({ success: false, message: `action inconnue ${message.action}` });
      return;
    }

    pendingCandidate = message.scrapedData;

    // If CV URL already captured, send everything now
    if (capturedCvUrl) {
      pendingCandidate.cvUrl = capturedCvUrl;
      await openOrSendToMp(pendingCandidate);
      capturedCvUrl = null;
      pendingCandidate = null;
      sendResponse({ success: true });
      return;
    }

    // Else: wait for CV capture, so response is deferred
    sendResponse({ success: true, message: "Waiting for CV URL..." });
  });

  // Intercept CV link
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (
        details.url.includes("linkedin.com/dms/prv/document/media") &&
        details.url.includes("recruiter-candidate-document-pdf-analyzed")
      ) {
        capturedCvUrl = details.url;
        console.log("CV URL intercepted:", capturedCvUrl);

        // If candidate data was already received
        if (pendingCandidate) {
          pendingCandidate.cvUrl = capturedCvUrl;
          openOrSendToMp(pendingCandidate);
          capturedCvUrl = null;
          pendingCandidate = null;
        }
      }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
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

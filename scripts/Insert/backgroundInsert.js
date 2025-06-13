let pendingCandidate = null;
let capturedCvUrl = null;
let isHandlingCv = false;

export function handleInsertToMP() {
  chrome.runtime.onMessage.addListener(handleCandidateMessage);
  chrome.webRequest.onBeforeRequest.addListener(handleWebRequest, { urls: ["<all_urls>"] }, ["requestBody"]);
}

async function handleCandidateMessage(message, sender, sendResponse) {
  if (message.action !== "send_candidate_data") {
    sendResponse({ status: "error", message: `action inconnue ${message.action}` });
    return;
  }

  pendingCandidate = message.scrapedData;

  if (capturedCvUrl) {
    await handleCvAndSendToMP();
    sendResponse({ status: "success" });
    return;
  }

  sendResponse({ status: "success", message: "Waiting for CV URL..." });
}

function handleWebRequest(details) {
  if (!shouldCapture(details.url)) return;

  isHandlingCv = true;
  capturedCvUrl = details.url;
  console.log("CV URL intercepted:", capturedCvUrl);
  processCvIfCandidatePending();
}

function shouldCapture(url) {
  return (
    url.includes("linkedin.com/dms/prv/document/media") &&
    url.includes("recruiter-candidate-document-pdf-analyzed") &&
    !isHandlingCv
  );
}

async function processCvIfCandidatePending() {
  if (!pendingCandidate) return;
  await handleCvAndSendToMP();
}

async function handleCvAndSendToMP() {
  const binaryCv = await fetchPdfAsUint8Array(capturedCvUrl);
  if (!binaryCv || !pendingCandidate) return;

  const base64 = uint8ArrayToBase64(binaryCv);
  if (!base64) return;

  pendingCandidate.cvBase64 = base64;
  await openOrSendToMp(pendingCandidate);

  resetState();
}

function resetState() {
  capturedCvUrl = null;
  pendingCandidate = null;
  isHandlingCv = false;
}

async function fetchPdfAsUint8Array(pdfUrl) {
  try {
    const response = await fetch(pdfUrl, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.warn("Pb : ", error);
  }
}

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

// --- Utility functions (no refactor needed) ---

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
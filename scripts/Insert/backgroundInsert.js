/**
 * @file Manages candidate data insertion, including CV interception.
 */

let capturedUrlsByTab = {};
let pendingWaitersByTab = {};
let isProcessing = false;

const CV_INTERCEPTION_CONFIG = {
  linkedin: {
    urlPattern: "https://www.linkedin.com/dms/prv/document/media*"
  },
  hellowork: {
    urlPattern: "https://api-hwrecruteur.hellowork.com/api/hw-ats-public/api/cache/document/marvin/pdf/*"
  }
};

export function handleInsertToMP() {
  const allUrlPatterns = Object.values(CV_INTERCEPTION_CONFIG).map(c => c.urlPattern);
  if (allUrlPatterns.length > 0) {
    chrome.webRequest.onBeforeRequest.addListener(handleWebRequest, { urls: allUrlPatterns });
    console.log("[BackgroundInsert] Persistent CV interceptor is active.");
  }
}

/**
 * Handles messages related to candidate data.
 * @returns A promise that resolves with the response, or a symbol if not handled.
 */
export async function handleCandidateMessage(message, sender) {
  // Only act on the "send_candidate_data" action.
  if (message.action === "send_candidate_data") {
    try {
      await processCandidateMessage(message.scrapedData, sender);
      return { status: "success", message: "Candidate processed" };
    } catch (error) {
      console.error("Error processing candidate:", error);
      return { status: "error", message: error.message };
    }
  }
  return Symbol.for('messageNotHandled');
}

async function processCandidateMessage(scrapedData, sender) {
  await waitIfProcessing();
  isProcessing = true;
  const tabId = sender.tab.id;
  console.log(`[BackgroundInsert] Lock acquired for tab ${tabId}. Processing:`, scrapedData.firstName);
  try {
    await maybeAttachCv(scrapedData, tabId);
    await openOrSendToMp(scrapedData);
  } finally {
    cleanupTabState(tabId);
  }
}

async function waitIfProcessing() {
  while (isProcessing) {
    console.log("[BackgroundInsert] Another process is running, waiting...");
    await delay(200);
  }
}

function cleanupTabState(tabId) {
  delete capturedUrlsByTab[tabId];
  delete pendingWaitersByTab[tabId];
  isProcessing = false;
  console.log(`[BackgroundInsert] Lock released for tab ${tabId}. Ready for next candidate.`);
}

async function maybeAttachCv(scrapedData, tabId) {
  const source = scrapedData.source;
  const interceptionConfig = CV_INTERCEPTION_CONFIG[source];
  if (interceptionConfig && scrapedData.attachmentCount > 0) {
    await attachCvData(scrapedData, tabId);
  }
}

async function attachCvData(scrapedData, tabId) {
  console.log(`[BackgroundInsert] Attachment required for tab ${tabId}. Checking for CV.`);
  try {
    const cvUrl = await getCvUrl(tabId);
    console.log(`[BackgroundInsert] Using CV URL for tab ${tabId}:`, cvUrl);
    const binaryCv = await fetchPdfAsUint8Array(cvUrl);
    if (binaryCv) {
      scrapedData.cvBase64 = uint8ArrayToBase64(binaryCv);
    }
  } catch (error) {
    console.warn(`[BackgroundInsert] Could not attach CV for tab ${tabId}:`, error.message);
  }
}

function getCvUrl(tabId) {
  return capturedUrlsByTab[tabId] || waitForCvOnTab(tabId);
}

function waitForCvOnTab(tabId, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      delete pendingWaitersByTab[tabId];
      reject(new Error(`Timeout waiting for CV on tab ${tabId}`));
    }, timeoutMs);
    pendingWaitersByTab[tabId] = { resolve, reject, timeout };
  });
}

function handleWebRequest(details) {
  const { tabId, url } = details;
  if (tabId < 0) return;
  capturedUrlsByTab[tabId] = url;
  const waiter = pendingWaitersByTab[tabId];
  if (waiter) {
    clearTimeout(waiter.timeout);
    waiter.resolve(url);
    delete pendingWaitersByTab[tabId];
  }
}

async function fetchPdfAsUint8Array(pdfUrl) {
  const response = await fetch(pdfUrl, { credentials: 'include' });
  if (!response.ok) {
    console.log(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    return;
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function openOrSendToMp(scrapedData) {
  const mpFormUrl = "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N";
  let tabId = await findExistingTab(mpFormUrl);
  if (!tabId) tabId = await createTab(mpFormUrl);
  if (tabId) {
    await sendToPage(tabId, "submit_candidate_data", scrapedData);
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
    chrome.tabs.create({ url, active: true }, (newTab) => {
      const listener = (id, { status }) => {
        if (id === newTab.id && status === "complete") {
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
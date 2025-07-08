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
      const result = await processCandidateMessage(message.scrapedData, sender);
      if (result?.loginRequired) {
        return { status: "login_required" };
      }
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
    return await openOrSendToMp(scrapedData, tabId);
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

async function openOrSendToMp(scrapedData, originalScraperTabId) {
  const mpFormUrl = "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N";
  const loginUrlPart = "/servlet/LoginMeilleurPilotage";

  let formTabId = await findExistingTab(mpFormUrl);

  if (formTabId) {
    // An existing tab was found, assume it's valid and send data.
    await chrome.tabs.update(formTabId, { active: true });
    await sendToPage(formTabId, "submit_candidate_data", scrapedData);
  } else {
    // No existing tab, create a new one.
    const newTab = await createTab(mpFormUrl);
    console.log(`[BackgroundInsert] New tab created. Final URL is: ${newTab.url}`);
    if (newTab.url.includes(loginUrlPart)) {
      // The new tab is the login page.
      console.log("[BackgroundInsert] Login page detected. Aborting submission.");
      chrome.tabs.sendMessage(originalScraperTabId, { action: 'login_required' }, () => {
        if (chrome.runtime.lastError) {
          // This can happen if the original tab was closed or is a page that can't host content scripts.
          console.warn(`[BackgroundInsert] Could not send 'login_required' message: ${chrome.runtime.lastError.message}`);
        }
      });
      // Don't close the tab, let the user log in.
      // Return a status to gracefully stop the current process.
      return { loginRequired: true };
    } else {
      await sendToPage(newTab.id, "submit_candidate_data", scrapedData);
    }
  }
  return { loginRequired: false };
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
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      let navigationTimer;
      const navigationTimeout = 200;

      const listener = (tabId, changeInfo, updatedTab) => {
        if (tabId !== tab.id) {
          return; // Not our tab
        }

        // If a new navigation starts (e.g., a redirect), clear any pending resolution timer.
        if (changeInfo.status === 'loading') {
            clearTimeout(navigationTimer);
        }

        if (tabId === tab.id && changeInfo.status === "complete") {
          // The tab finished loading. Wait a moment to see if a JS redirect occurs.
          clearTimeout(navigationTimer);
          navigationTimer = setTimeout(async () => {
            chrome.tabs.onUpdated.removeListener(listener);
            try {
              // Get the most up-to-date tab information to ensure we have the final URL.
              const finalTab = await chrome.tabs.get(tabId);
              resolve(finalTab);
            } catch (e) {
              // This can happen if the tab was closed before the timer fired.
              console.warn(`[BackgroundInsert/createTab] Could not get final tab info for ${tabId}: ${e.message}`);
              reject(new Error(`Tab ${tabId} was closed before it could be processed.`));
            }
          }, navigationTimeout);
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
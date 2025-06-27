let pendingCandidate = null;
let capturedCvUrl = null;
let hasCapturedCv = false;

/**
 * Configuration for sites that support CV interception.
 * The key is the 'source' name sent from the content script.
 * The 'urlPattern' is used by the webRequest listener.
 */
const CV_INTERCEPTION_CONFIG = {
  linkedin: {
    urlPattern: "https://www.linkedin.com/dms/prv/document/media*"
  },
  hellowork: {
    urlPattern: "https://api-hwrecruteur.hellowork.com/api/hw-ats-public/api/cache/document/marvin/pdf/*"
  }
};

/**
 * Initialise les écouteurs pour :
 * - Réception de messages contenant les données candidat
 * - Interception des requêtes réseau pour détecter les téléchargements de CV
 */
export function handleInsertToMP() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "send_candidate_data") {
      processCandidateMessage(message.scrapedData)
        .then(() => {
          sendResponse({ status: "success", message: "Candidate processed" });
        })
        .catch((error) => {
          console.error("Error processing candidate:", error);
          sendResponse({ status: "error", message: error.message });
        });
      return true;
    }
  });
}

/**
 * Gère la réception des données d’un candidat depuis un content script.
 * 
 * @param {Object} scrapedData - Les données candidat
 */
async function processCandidateMessage(scrapedData) {
  pendingCandidate = scrapedData;
  const source = pendingCandidate.source;
  const interceptionConfig = CV_INTERCEPTION_CONFIG[source];

  if (interceptionConfig && pendingCandidate.attachmentCount > 0) {
    console.log(`[BackgroundInsert] Candidate from '${source}' with attachments detected. Setting up CV interceptor.`);
    chrome.webRequest.onBeforeRequest.addListener(
      handleWebRequest,
      { urls: [interceptionConfig.urlPattern] },
      ["requestBody"]
    );
    await waitForCvInterception();
    await handleCvAndSendToMP();
  }

  await openOrSendToMp(pendingCandidate);
  resetState();
}

function waitForCvInterception(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn("Timeout waiting for CV interception");
      resolve();
    }, timeoutMs);

    const checkInterval = setInterval(() => {
      if (hasCapturedCv && capturedCvUrl) {
        console.error("hasCapturedCv :", hasCapturedCv);
        console.error("capturedCvUrl :", capturedCvUrl);

        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

/**
 * Intercepte les requêtes réseau pour capturer l’URL du CV PDF téléchargé.
 * 
 * @param {Object} details - Détails de la requête interceptée.
 */
function handleWebRequest(details) {
  capturedCvUrl = details.url;
  hasCapturedCv = true;
  console.log(`CV URL intercepted for source '${pendingCandidate?.source}':`, capturedCvUrl);
}

/**
 * Télécharge le PDF, le convertit en base64, l’ajoute au candidat, puis l’envoie à MP.
 */
async function handleCvAndSendToMP() {
  if (!pendingCandidate) return;

  if (capturedCvUrl) {
    const binaryCv = await fetchPdfAsUint8Array(capturedCvUrl);
    const base64 = uint8ArrayToBase64(binaryCv);
    if (base64) {
      pendingCandidate.cvBase64 = base64;
    }
  }
}

/**
 * Réinitialise l’état interne (CV intercepté et candidat en cours).
 */
function resetState() {
  if (chrome.webRequest.onBeforeRequest.hasListener(handleWebRequest)) {
    chrome.webRequest.onBeforeRequest.removeListener(handleWebRequest);
  }
  capturedCvUrl = null;
  hasCapturedCv = false;
  pendingCandidate = null;
}

/**
 * Télécharge un PDF via fetch et le convertit en Uint8Array.
 * 
 * @param {string} pdfUrl - URL du fichier PDF à télécharger.
 * @returns {Promise<Uint8Array|null>} - Contenu du PDF ou null en cas d’erreur.
 */
async function fetchPdfAsUint8Array(pdfUrl) {
  const response = await fetch(pdfUrl, {
    credentials: 'include'
  });

  if (!response.ok) {
    console.log(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Ouvre un onglet MeilleurPilotage ou utilise un existant, puis y envoie les données candidat.
 * 
 * @param {Object} scrapedData - Données du candidat à insérer dans MP.
 */
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

// --- Fonctions utilitaires ---

/**
 * Recherche un onglet existant contenant une URL spécifique.
 * 
 * @param {string} url - URL à rechercher dans les onglets ouverts.
 * @returns {Promise<number|undefined>} - ID de l’onglet trouvé ou undefined.
 */
function findExistingTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const existingTab = tabs.find(tab => tab.url && tab.url.includes(url));
      resolve(existingTab?.id);
    });
  });
}

/**
 * Crée un nouvel onglet et attend qu’il soit complètement chargé.
 * 
 * @param {string} url - URL à ouvrir dans un nouvel onglet.
 * @returns {Promise<number>} - ID du nouvel onglet.
 */
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

/**
 * Exécute un script dans un onglet spécifique pour envoyer les données au DOM.
 * 
 * @param {number} tabId - ID de l’onglet cible.
 * @param {string} action - Nom de l’action à envoyer.
 * @param {Object} payload - Données à envoyer à la page.
 * @returns {Promise<void>}
 */
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

/**
 * Convertit un tableau d’octets (Uint8Array) en chaîne base64.
 * 
 * @param {Uint8Array} uint8Array - Données binaires à encoder.
 * @returns {string} - Chaîne base64.
 */
function uint8ArrayToBase64(uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Crée un délai asynchrone basé sur un timeout en millisecondes.
 * @param {number} ms - Durée du délai en millisecondes.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
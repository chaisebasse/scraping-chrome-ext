// Variables globales pour stocker l’état temporaire du candidat et du CV
let pendingCandidate = null;
let capturedCvUrl = null;
let isHandlingCv = false;

/**
 * Point d'entrée pour gérer l'insertion des candidats dans MeilleurPilotage.
 * Initialise les écouteurs des messages runtime et des requêtes web.
 */
export function handleInsertToMP() {
  chrome.runtime.onMessage.addListener(handleCandidateMessage);
  chrome.webRequest.onBeforeRequest.addListener(handleWebRequest, { urls: ["<all_urls>"] }, ["requestBody"]);
}

/**
 * Gestionnaire des messages reçus depuis d'autres parties de l'extension.
 * Accepte uniquement l'action "send_candidate_data".
 * @param {Object} message - Message reçu.
 * @param {Object} sender - Expéditeur du message.
 * @param {Function} sendResponse - Fonction pour répondre.
 */
async function handleCandidateMessage(message, sender, sendResponse) {
  if (message.action !== "send_candidate_data") {
    sendResponse({ status: "error", message: `action inconnue ${message.action}` });
    return;
  }

  pendingCandidate = message.scrapedData;

  // Wait a short time to allow potential CV interception
  setTimeout(async () => {
    if (capturedCvUrl) {
      await handleCvAndSendToMP();
    } else {
      console.warn("No CV URL captured — sending candidate without CV.");
      await openOrSendToMp(pendingCandidate);
      resetState();
    }

    sendResponse({ status: "success" });
  }, 500); // Adjust delay if needed
  return true;
}

/**
 * Intercepte les requêtes réseau pour détecter les URLs de CV.
 * @param {Object} details - Détails de la requête.
 */
function handleWebRequest(details) {
  if (shouldCapture(details.url)) {
    isHandlingCv = true;
    capturedCvUrl = details.url;
    console.log("CV URL intercepted:", capturedCvUrl);
    processCvIfCandidatePending();
  }
}

/**
 * Détermine si une URL doit être capturée comme URL de CV.
 * Filtre sur des patterns spécifiques LinkedIn Recruiter.
 * @param {string} url - URL à tester.
 * @returns {boolean} - Vrai si l’URL doit être capturée.
 */
function shouldCapture(url) {
  return (
    url.includes("linkedin.com/dms/prv/document/media") &&
    url.includes("recruiter-candidate-document-pdf-analyzed") &&
    !isHandlingCv
  );
}

/**
 * Lance le traitement du CV si un candidat est en attente.
 * @returns {Promise<void>}
 */
async function processCvIfCandidatePending() {
  if (!pendingCandidate) return;
  await handleCvAndSendToMP();
}

/**
 * Télécharge, encode en base64, puis envoie les données complètes au MP.
 * Réinitialise l'état après envoi.
 * @returns {Promise<void>}
 */
async function handleCvAndSendToMP() {
  const binaryCv = await fetchPdfAsUint8Array(capturedCvUrl);
  if (!binaryCv || !pendingCandidate) return;

  const base64 = uint8ArrayToBase64(binaryCv);
  if (!base64) return;

  pendingCandidate.cvBase64 = base64;
  await openOrSendToMp(pendingCandidate);

  resetState();
}

/**
 * Réinitialise les variables globales pour préparer un prochain candidat.
 */
function resetState() {
  capturedCvUrl = null;
  pendingCandidate = null;
  isHandlingCv = false;
}

/**
 * Télécharge un PDF via fetch avec les credentials et retourne un Uint8Array.
 * @param {string} pdfUrl - URL du PDF à télécharger.
 * @returns {Promise<Uint8Array|undefined>}
 */
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

/**
 * Ouvre un onglet MP existant ou en crée un nouveau,
 * puis envoie les données du candidat à la page MP via script.
 * @param {Object} scrapedData - Données du candidat à envoyer.
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

/**
 * Recherche un onglet Chrome ouvert dont l'URL contient la chaîne donnée.
 * @param {string} url - URL à chercher.
 * @returns {Promise<number|undefined>} - ID de l'onglet trouvé ou undefined.
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
 * Crée un nouvel onglet Chrome sur l'URL spécifiée et attend son chargement complet.
 * @param {string} url - URL à ouvrir.
 * @returns {Promise<number>} - ID de l'onglet créé.
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
 * Injecte un script dans l'onglet donné pour transmettre un événement personnalisé
 * contenant l'action et les données à traiter côté page.
 * @param {number} tabId - ID de l'onglet cible.
 * @param {string} action - Action à dispatcher.
 * @param {Object} payload - Données à transmettre.
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
 * Convertit un Uint8Array en chaîne Base64.
 * @param {Uint8Array} uint8Array - Tableau d'octets à convertir.
 * @returns {string} - Chaîne encodée en base64.
 */
function uint8ArrayToBase64(uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

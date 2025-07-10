/**
 * @file Gère l'insertion des données des candidats, y compris l'interception des CV.
 */

let capturedUrlsByTab = {};
let pendingWaitersByTab = {};
let isProcessing = false;

/**
 * Configuration pour l'interception des CV par source.
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
 * Initialise l'intercepteur de requêtes web pour capturer les URLs des CV.
 * Met en place un écouteur persistant basé sur les configurations dans `CV_INTERCEPTION_CONFIG`.
 */
export function handleInsertToMP() {
  const allUrlPatterns = Object.values(CV_INTERCEPTION_CONFIG).map(c => c.urlPattern);
  if (allUrlPatterns.length > 0) {
    chrome.webRequest.onBeforeRequest.addListener(handleWebRequest, { urls: allUrlPatterns });
    console.log("[BackgroundInsert] Persistent CV interceptor is active.");
  }
}

/**
 * Formate la réponse à envoyer au script de contenu après le traitement d'un candidat.
 * @param {object} result - L'objet de résultat de `openOrSendToMp`.
 * @param {boolean} [result.loginRequired] - Indique si une connexion est requise.
 * @returns {{status: string, message?: string}} Un objet de statut pour la réponse.
 */
function handleProcessingResult(result) {
  if (result?.loginRequired) {
    return { status: "login_required" };
  }
  return { status: "success", message: "Candidate processed" };
}

/**
 * Gère les messages entrants pour le traitement des données de candidats.
 * Point d'entrée principal pour les messages `send_candidate_data`.
 * @param {object} message - Le message reçu du script de contenu.
 * @param {string} message.action - L'action à effectuer.
 * @param {object} message.scrapedData - Les données du candidat.
 * @param {chrome.runtime.MessageSender} sender - L'objet contenant des informations sur l'expéditeur.
 * @returns {Promise<object|Symbol>} Une promesse qui se résout avec la réponse, ou un symbole si le message n'est pas géré.
 */
export async function handleCandidateMessage(message, sender) {
  if (message.action !== "send_candidate_data") {
    return Symbol.for('messageNotHandled');
  }
  try {
    const result = await processCandidateMessage(message.scrapedData, sender);
    return handleProcessingResult(result);
  } catch (error) {
    console.error("Error processing candidate:", error);
    return { status: "error", message: error.message };
  }
}

/**
 * Exécute le processus de traitement principal pour un candidat.
 * Attache le CV si nécessaire, puis ouvre ou envoie les données à MeilleurPilotage.
 * @param {object} scrapedData - Les données du candidat.
 * @param {number} tabId - L'ID de l'onglet d'origine.
 * @returns {Promise<object>} Le résultat de l'opération d'envoi à MP.
 */
async function executeCandidateProcessing(scrapedData, tabId) {
  await maybeAttachCv(scrapedData, tabId);
  return await openOrSendToMp(scrapedData, tabId);
}

/**
 * Traite les données d'un candidat en s'assurant qu'un seul traitement est actif à la fois.
 * Gère le verrouillage (`isProcessing`) pour éviter les conditions de concurrence.
 * @param {object} scrapedData - Les données du candidat.
 * @param {chrome.runtime.MessageSender} sender - L'expéditeur du message.
 * @returns {Promise<object>} Le résultat de `executeCandidateProcessing`.
 */
async function processCandidateMessage(scrapedData, sender) {
  await waitIfProcessing();
  isProcessing = true;
  const tabId = sender.tab.id;
  console.log(`[BackgroundInsert] Lock acquired for tab ${tabId}. Processing:`, scrapedData.firstName);
  try {
    return await executeCandidateProcessing(scrapedData, tabId);
  } finally {
    cleanupTabState(tabId);
  }
}

/**
 * Met en pause l'exécution si un autre processus de scraping est déjà en cours.
 * Vérifie la variable `isProcessing` et attend par intervalles courts.
 * @returns {Promise<void>}
 */
async function waitIfProcessing() {
  while (isProcessing) {
    console.log("[BackgroundInsert] Another process is running, waiting...");
    await delay(200);
  }
}

/**
 * Nettoie l'état associé à un onglet après la fin du traitement.
 * Réinitialise le verrou `isProcessing` et supprime les données en cache pour l'onglet.
 * @param {number} tabId - L'ID de l'onglet à nettoyer.
 */
function cleanupTabState(tabId) {
  delete capturedUrlsByTab[tabId];
  delete pendingWaitersByTab[tabId];
  isProcessing = false;
  console.log(`[BackgroundInsert] Lock released for tab ${tabId}. Ready for next candidate.`);
}

/**
 * Détermine s'il faut attacher un CV aux données du candidat et lance le processus si nécessaire.
 * Se base sur la source du candidat et le nombre de pièces jointes attendues.
 * @param {object} scrapedData - Les données du candidat.
 * @param {number} tabId - L'ID de l'onglet d'origine.
 * @returns {Promise<void>}
 */
async function maybeAttachCv(scrapedData, tabId) {
  const source = scrapedData.source;
  const interceptionConfig = CV_INTERCEPTION_CONFIG[source];
  if (interceptionConfig && scrapedData.attachmentCount > 0) {
    await attachCvData(scrapedData, tabId);
  }
}

/**
 * Récupère un CV depuis une URL, le lit en tant que tableau d'octets et l'encode en base64.
 * @param {string} cvUrl - L'URL du fichier PDF du CV.
 * @returns {Promise<string|null>} Le CV encodé en base64, ou null en cas d'échec.
 */
async function fetchAndEncodeCv(cvUrl) {
  const binaryCv = await fetchPdfAsUint8Array(cvUrl);
  if (binaryCv) {
    return uint8ArrayToBase64(binaryCv);
  }
  return null;
}

/**
 * Gère le processus d'attachement du CV.
 * Attend l'URL du CV, le télécharge et l'ajoute aux données du candidat.
 * @param {object} scrapedData - Les données du candidat, qui seront mutées.
 * @param {number} tabId - L'ID de l'onglet où le CV est intercepté.
 * @returns {Promise<void>}
 */
async function attachCvData(scrapedData, tabId) {
  console.log(`[BackgroundInsert] Attachment required for tab ${tabId}. Checking for CV.`);
  try {
    const cvUrl = await getCvUrl(tabId);
    console.log(`[BackgroundInsert] Using CV URL for tab ${tabId}:`, cvUrl);
    scrapedData.cvBase64 = await fetchAndEncodeCv(cvUrl);
  } catch (error) {
    console.warn(`[BackgroundInsert] Could not attach CV for tab ${tabId}:`, error.message);
  }
}

/**
 * Récupère l'URL du CV pour un onglet donné.
 * Si l'URL n'est pas déjà capturée, elle met en place une attente.
 * @param {number} tabId - L'ID de l'onglet.
 * @returns {Promise<string>} Une promesse qui se résout avec l'URL du CV.
 */
function getCvUrl(tabId) {
  return capturedUrlsByTab[tabId] || waitForCvOnTab(tabId);
}

/**
 * Crée un timeout pour l'attente d'un CV.
 * Rejette la promesse si le CV n'est pas intercepté dans le temps imparti.
 * @param {number} tabId - L'ID de l'onglet.
 * @param {function} reject - La fonction de rejet de la promesse d'attente.
 * @param {number} timeoutMs - La durée du timeout en millisecondes.
 * @returns {number} L'ID du timeout.
 */
function createCvWaiterTimeout(tabId, reject, timeoutMs) {
  return setTimeout(() => {
    delete pendingWaitersByTab[tabId];
    reject(new Error(`Timeout waiting for CV on tab ${tabId}`));
  }, timeoutMs);
}

/**
 * Met en place une promesse en attente pour l'URL d'un CV sur un onglet spécifique.
 * Stocke les fonctions `resolve` et `reject` pour une résolution ultérieure par `handleWebRequest`.
 * @param {number} tabId - L'ID de l'onglet.
 * @param {number} [timeoutMs=5000] - Le délai d'attente maximum.
 * @returns {Promise<string>} Une promesse qui se résout avec l'URL du CV.
 */
function waitForCvOnTab(tabId, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = createCvWaiterTimeout(tabId, reject, timeoutMs);
    pendingWaitersByTab[tabId] = { resolve, reject, timeout };
  });
}

/**
 * Résout la promesse en attente pour un CV avec l'URL capturée.
 * @param {number} tabId - L'ID de l'onglet.
 * @param {string} url - L'URL du CV capturée.
 */
function resolvePendingCvWaiter(tabId, url) {
  const waiter = pendingWaitersByTab[tabId];
  if (waiter) {
    clearTimeout(waiter.timeout);
    waiter.resolve(url);
    delete pendingWaitersByTab[tabId];
  }
}

/**
 * Le gestionnaire d'événements pour `chrome.webRequest.onBeforeRequest`.
 * Capture l'URL du CV et résout toute promesse en attente pour cet onglet.
 * @param {object} details - Les détails de la requête web.
 * @param {number} details.tabId - L'ID de l'onglet d'origine de la requête.
 * @param {string} details.url - L'URL de la requête.
 */
function handleWebRequest(details) {
  const { tabId, url } = details;
  if (tabId < 0) return;
  capturedUrlsByTab[tabId] = url;
  resolvePendingCvWaiter(tabId, url);
}

/**
 * Télécharge un fichier PDF depuis une URL et le retourne sous forme de `Uint8Array`.
 * @param {string} pdfUrl - L'URL du PDF.
 * @returns {Promise<Uint8Array|undefined>} Le contenu du PDF sous forme de `Uint8Array`, ou `undefined` en cas d'échec.
 */
async function fetchPdfAsUint8Array(pdfUrl) {
  const response = await fetch(pdfUrl, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Gère le cas où un onglet MeilleurPilotage est déjà ouvert.
 * Active l'onglet et envoie les données du candidat.
 * @param {number} tabId - L'ID de l'onglet MP existant.
 * @param {object} scrapedData - Les données du candidat.
 * @returns {Promise<{loginRequired: boolean}>} Un objet indiquant que la connexion n'est pas requise.
 */
async function handleExistingMpTab(tabId, scrapedData) {
  await chrome.tabs.update(tabId, { active: true });
  await sendToPage(tabId, "submit_candidate_data", scrapedData);
  return { loginRequired: false };
}

/**
 * Gère le cas où l'ouverture de l'onglet MP redirige vers la page de connexion.
 * Envoie un message au script de contenu d'origine pour signaler la nécessité de se connecter.
 * @param {number} originalScraperTabId - L'ID de l'onglet du scraper qui a initié la demande.
 * @returns {Promise<{loginRequired: boolean}>} Un objet indiquant que la connexion est requise.
 */
async function handleMpLoginRedirect(originalScraperTabId) {
  console.log("[BackgroundInsert] Login page detected. Aborting submission.");
  const message = { action: 'login_required' };
  chrome.tabs.sendMessage(originalScraperTabId, message, () => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message;
      console.warn(`[BackgroundInsert] Could not send 'login_required' message: ${msg}`);
    }
  });
  return { loginRequired: true };
}

/**
 * Gère la création d'un nouvel onglet pour le formulaire MeilleurPilotage.
 * Crée l'onglet, vérifie les redirections vers la page de connexion et envoie les données.
 * @param {string} url - L'URL du formulaire MP à ouvrir.
 * @param {object} scrapedData - Les données du candidat.
 * @param {number} originalScraperTabId - L'ID de l'onglet du scraper d'origine.
 * @returns {Promise<{loginRequired: boolean}>} Un objet indiquant si une connexion est requise.
 */
async function handleNewMpTab(url, scrapedData, originalScraperTabId) {
  const loginUrlPart = "/servlet/LoginMeilleurPilotage";
  const newTab = await createTab(url);
  console.log(`[BackgroundInsert] New tab created. Final URL is: ${newTab.url}`);

  if (newTab.url.includes(loginUrlPart)) {
    return await handleMpLoginRedirect(originalScraperTabId);
  }

  await sendToPage(newTab.id, "submit_candidate_data", scrapedData);
  return { loginRequired: false };
}

/**
 * Ouvre un nouvel onglet vers le formulaire de création de candidat de MeilleurPilotage ou réutilise un onglet existant.
 * Envoie ensuite les données du candidat à cet onglet.
 * @param {object} scrapedData - Les données du candidat à soumettre.
 * @param {number} originalScraperTabId - L'ID de l'onglet d'où provient la demande de scraping.
 * @returns {Promise<{loginRequired: boolean}>} Un objet indiquant si une connexion à MP est requise.
 */
async function openOrSendToMp(scrapedData, originalScraperTabId) {
  const mpFormUrl = "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N";
  const formTabId = await findExistingTab(mpFormUrl);
  if (formTabId) return await handleExistingMpTab(formTabId, scrapedData);
  return await handleNewMpTab(mpFormUrl, scrapedData, originalScraperTabId);
}

/**
 * Recherche un onglet existant qui correspond à une partie de l'URL donnée.
 * @param {string} url - La partie de l'URL à rechercher.
 * @returns {Promise<number|undefined>} L'ID de l'onglet trouvé, ou `undefined` si aucun onglet ne correspond.
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
 * Finalise la création d'un onglet en résolvant la promesse avec les détails finaux de l'onglet.
 * Supprime l'écouteur d'événements et gère les erreurs si l'onglet est fermé prématurément.
 * @param {number} tabId - L'ID de l'onglet.
 * @param {function} listener - La fonction d'écoute à supprimer.
 * @param {function} resolve - La fonction de résolution de la promesse.
 * @param {function} reject - La fonction de rejet de la promesse.
 */
async function resolveWithFinalTab(tabId, listener, resolve, reject) {
  chrome.tabs.onUpdated.removeListener(listener);
  try {
    const finalTab = await chrome.tabs.get(tabId);
    resolve(finalTab);
  } catch (e) {
    const errorMsg = `Tab ${tabId} was closed before it could be processed.`;
    console.warn(`[BackgroundInsert/createTab] ${errorMsg}: ${e.message}`);
    reject(new Error(errorMsg));
  }
}

/**
 * Crée un écouteur d'événements `onUpdated` pour un onglet spécifique.
 * Attend que le statut de l'onglet soit 'complete' et utilise un petit délai pour gérer les redirections.
 * @param {chrome.tabs.Tab} tab - L'objet onglet initialement créé.
 * @param {function} resolve - La fonction de résolution de la promesse.
 * @param {function} reject - La fonction de rejet de la promesse.
 * @returns {function} La fonction d'écouteur à attacher.
 */
function createTabUpdateListener(tab, resolve, reject) {
  let navigationTimer;
  const navigationTimeout = 200;

  const listener = (tabId, changeInfo) => {
    if (tabId !== tab.id) return;

    if (changeInfo.status === 'loading') {
      clearTimeout(navigationTimer);
    }

    if (changeInfo.status === 'complete') {
      clearTimeout(navigationTimer);
      navigationTimer = setTimeout(
        () => resolveWithFinalTab(tabId, listener, resolve, reject),
        navigationTimeout
      );
    }
  };
  return listener;
}

/**
 * Crée un nouvel onglet et attend qu'il soit complètement chargé, y compris après d'éventuelles redirections.
 * @param {string} url - L'URL à ouvrir dans le nouvel onglet.
 * @returns {Promise<chrome.tabs.Tab>} Une promesse qui se résout avec l'objet Tab final.
 */
function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      const listener = createTabUpdateListener(tab, resolve, reject);
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * Exécute un script dans un onglet pour distribuer un événement personnalisé.
 * C'est la méthode pour communiquer avec les scripts de contenu qui s'exécutent dans le `MAIN` world.
 * @param {number} tabId - L'ID de l'onglet cible.
 * @param {string} action - Le nom de l'action à effectuer.
 * @param {object} payload - Les données à envoyer avec l'action.
 * @returns {Promise<any>}
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
 * Convertit un `Uint8Array` en une chaîne de caractères encodée en base64.
 * @param {Uint8Array} uint8Array - Le tableau d'octets à convertir.
 * @returns {string} La chaîne encodée en base64.
 */
function uint8ArrayToBase64(uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Met en pause l'exécution pendant une durée spécifiée.
 * @param {number} ms - Le nombre de millisecondes à attendre.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
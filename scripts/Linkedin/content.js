/**
 * @fileoverview Script de contenu pour LinkedIn Recruiter.
 * Scrape les données des candidats depuis les pages de profil et de liste.
 */

window.isScrapingPaused = false;

/**
 * Affiche un message indiquant que le scraping est en pause.
 */
function showPauseMessage() {
  const message = 'Scraping en PAUSE. Appuyez sur Ctrl+Alt+P pour reprendre.';
  console.log(`%c[LinkedIn Recruiter] ${message}`, 'color: orange; font-weight: bold;');
  alert(message);
}

/**
 * Affiche un message indiquant que le scraping a repris.
 */
function showResumeMessage() {
  console.log('%c[LinkedIn Recruiter] Scraping REPRIS.', 'color: green; font-weight: bold;');
}

/**
 * Bascule l'état de pause du scraping et affiche une alerte.
 */
function togglePauseScraping() {
  window.isScrapingPaused = !window.isScrapingPaused;
  window.isScrapingPaused ? showPauseMessage() : showResumeMessage();
}

/**
 * Gère les événements de raccourcis clavier (Ctrl+Alt+P).
 * @param {KeyboardEvent} event - L'événement clavier.
 */
function handleKeydown(event) {
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    togglePauseScraping();
  }
}

/**
 * Gère le message pour lancer le scraper LinkedIn.
 * @param {object} message - Le message reçu de l'extension.
 * @param {function} sendResponse - La fonction pour répondre à l'extension.
 */
function handleLinkedinScraperMessage(message, sendResponse) {
  console.log(`[LinkedIn Recruiter] Requête de scraping reçue avec max candidats : ${message.maxCandidates}, type de source : ${message.sourceType}. Routage...`);
  routeScraperBasedOnPage(message.maxCandidates, message.sourceType);
  sendResponse({ status: 'success' });
}

/**
 * Gère le message indiquant qu'une connexion est requise.
 */
function handleLoginRequiredMessage() {
  alert("Connexion à MeilleurPilotage requise. Veuillez vous connecter à MP puis relancer le scraper.");
}

/**
 * Gère les messages entrants de l'extension.
 * @param {object} message - Le message reçu.
 * @param {object} sender - L'expéditeur du message.
 * @param {function} sendResponse - La fonction pour envoyer une réponse.
 */
function handleMessage(message, sender, sendResponse) {
  if (message.action === "runLinkedinScraper") {
    handleLinkedinScraperMessage(message, sendResponse);
  } else if (message.action === 'login_required') {
    handleLoginRequiredMessage();
  }
  return true;
}

/**
 * Met en place les écouteurs de messages et d'événements clavier.
 */
function setupListeners() {
  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener('keydown', handleKeydown);
}

// === Page Routing & Identification ===

/**
 * Détermine quelle fonction de scraping appeler en fonction de la page actuelle.
 * @param {number} maxCandidates - Le nombre maximum de candidats à scraper.
 * @param {string} sourceType - L'origine des candidats (annonce, chasse).
 */
function routeScraperBasedOnPage(maxCandidates, sourceType) {
  if (isOnLinkedInProfilePage()) {
    scrapeLinkedInProfile(sourceType);
  } else if (isOnLinkedInListPage()) {
    scrapeListOfProfiles(maxCandidates, sourceType);
  } else {
    alert('[LinkedIn Recruiter] Page non supportée pour le scraping.');
  }
}

/**
 * Vérifie si la page actuelle est une fiche candidat LinkedIn Recruiter.
 * @returns {boolean} Vrai si c'est une page de profil, sinon faux.
 */
function isOnLinkedInProfilePage() {
  const href = location.href;
  return href.startsWith("https://www.linkedin.com/talent/hire/") &&
         (href.includes("/manage/all/profile/") || href.includes("/discover/applicants/profile/"));
}

/**
 * Vérifie si la page actuelle est une liste de candidats LinkedIn Recruiter.
 * @returns {boolean} Vrai si c'est une page de liste, sinon faux.
 */
function isOnLinkedInListPage() {
  const href = location.href;
  const isProjectListPage = href.includes("/manage/all") && !href.includes("/profile/");
  const isApplicantListPage = href.includes("/discover/applicants?jobId") && !href.includes("/profile/");

  return href.startsWith("https://www.linkedin.com/talent/hire/") && (isProjectListPage || isApplicantListPage);
}

/**
 * Point d'entrée principal pour le script de contenu LinkedIn.
 */
if (!window.linkedinScraperListenerRegistered) {
  window.linkedinScraperListenerRegistered = true;
  setupListeners();
}

/**
 * Extrait les données du profil, y compris les informations de contact et les pièces jointes.
 * @param {string} sourceType - L'origine du candidat (ex: 'annonce', 'chasse').
 * @returns {Promise<Object>} Un objet contenant les données du candidat.
 */
async function extractProfileDataWithAttachments(sourceType) {
  const { firstName, lastName } = extractNameFromNoteButton();
  const profileTab = await waitForElement('[data-live-test-profile-index-tab]');
  const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');

  await openProfileTab(profileTab);
  const contactInfo = extractContactInfo(firstName, lastName);

  await openAttachmentsTab(attachmentsTab);

  return buildCandidateDataObject(firstName, lastName, contactInfo, sourceType);
}

/**
 * Construit l'objet de données final pour le candidat.
 * @param {string} firstName - Le prénom du candidat.
 * @param {string} lastName - Le nom de famille du candidat.
 * @param {object} contactInfo - L'objet contenant l'email et le téléphone.
 * @param {string} sourceType - L'origine du candidat (annonce, chasse).
 * @returns {object} L'objet de données du candidat prêt à être envoyé.
 */
function buildCandidateDataObject(firstName, lastName, contactInfo, sourceType) {
  const data = {
    firstName,
    lastName,
    ...contactInfo,
    source: 'linkedin',
    sourceType: sourceType,
    profileUrl: location.href
  };
  console.log("[LinkedIn Recruiter] Données extraites :", data);
  return data;
}

/**
 * Extrait les informations de contact (email, téléphone, URL) du profil.
 * @param {string} firstName - Le prénom du candidat.
 * @param {string} lastName - Le nom de famille du candidat.
 * @returns {{email: string, phone: string|null}} Un objet contenant l'email et le téléphone.
 */
function extractContactInfo(firstName, lastName) {
  const email = document.querySelector("span[data-test-contact-email-address]")?.textContent.trim() || `@linkedin.com ${firstName}_${lastName}`;
  const rawPhone = document.querySelector("span[data-test-contact-phone][data-live-test-contact-phone]")?.textContent.trim() || null;
  const phone = normalizeFrenchNumber(rawPhone);
  return { email, phone };
}

/**
 * Trouve le bouton de note et retourne son titre.
 * @returns {string|null} Le titre du bouton, ou null s'il n'est pas trouvé.
 */
function getNoteButtonTitle() {
  const noteButton = document.querySelector("button[title^='Ajouter une note sur']") ||
                     document.querySelector("button[title^='Add Note about']");
  return noteButton?.getAttribute("title");
}

/**
 * Analyse le nom complet à partir du titre du bouton de note.
 * @param {string} title - Le titre du bouton.
 * @returns {{firstName: string, lastName: string}|null} Un objet avec le prénom et le nom, ou null.
 */
function parseNameFromTitle(title) {
  if (!title) return null;
  const match = title.match(/^Ajouter une note sur (.+)$/) ||
                title.match(/^Add Note about (.+)$/);
  if (!match) return null;

  const [firstName, ...lastParts] = match[1].trim().split(" ");
  return { firstName, lastName: lastParts.join(" ") };
}

/**
 * Extrait le prénom et le nom à partir du bouton de note.
 * Gère les versions anglaises et françaises de LinkedIn Recruiter.
 * @returns {{firstName: string, lastName: string}} Un objet contenant le prénom et le nom.
 */
function extractNameFromNoteButton() {
  const title = getNoteButtonTitle();
  const name = parseNameFromTitle(title);
  if (!name) {
    console.error("ATTENTION : Prénom et nom non trouvés !");
    return { firstName: null, lastName: null };
  }
  return name;
}

/**
 * Ouvre l'onglet Profil pour s'assurer que les informations de contact sont visibles.
 * @param {HTMLElement} tabElement - L'élément de l'onglet profil.
 */
async function openProfileTab(tabElement) {
  await clickTab(tabElement);
}

/**
 * Ouvre l'onglet des pièces jointes uniquement si des pièces jointes sont présentes.
 * @param {HTMLElement} tabElement - L'élément HTML de l'onglet des pièces jointes.
 */
async function openAttachmentsTab(tabElement) {
  const count = extractAttachmentCount(tabElement);
  if (count === 0) {
    console.log(`[LinkedIn Recruiter] Aucune pièce jointe détectée (count = ${count}). Onglet non cliqué.`);
    return;
  }
  await clickTab(tabElement, count);
}

/**
 * Extrait le nombre de pièces jointes à partir du texte d'un onglet.
 * @param {HTMLElement} tabElement - L'élément de l'onglet.
 * @returns {number} Le nombre de pièces jointes, ou 0 si non trouvé.
 */
function extractAttachmentCount(tabElement) {
  const labelText = tabElement?.querySelector('div')?.innerText?.trim() || '';
  const match = labelText.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Clique sur un onglet du profil après un délai aléatoire.
 * @param {HTMLElement} tab - L'élément de l'onglet à cliquer.
 * @param {number|null} [count=null] - Le nombre de pièces jointes (pour le logging).
 */
async function clickTab(tab, count = null) {
  const rDelay = getRandomInRange();
  if (count !== null) {
    console.log(`[LinkedIn Recruiter] ${count} pièce(s) jointe(s) détectée(s). Attente de ${rDelay}ms avant clic...`);
  }
  await delay(rDelay);
  clickRandomSpotInside(tab);
}

/**
 * Envoie les données extraites au script background pour insertion différée.
 * @param {Object} scrapedData - Les données du candidat à envoyer.
 * @returns {Promise<Object>} La réponse du script background.
 */
function sendScrapedDataToBackground(scrapedData) {
  const message = { action: "send_candidate_data", scrapedData };
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      handleBackgroundResponse(response, resolve, reject);
    });
  });
}

/**
 * Gère la réponse du background script après une tentative d'envoi de données.
 * @param {object} response - La réponse reçue du script background.
 * @param {Function} resolve - La fonction de résolution de la promesse.
 * @param {Function} reject - La fonction de rejet de la promesse.
 */
function handleBackgroundResponse(response, resolve, reject) {
  if (chrome.runtime.lastError) {
    console.error("Message failed:", chrome.runtime.lastError.message);
    return reject(chrome.runtime.lastError);
  }
  if (response?.status === "success" || response?.status === "login_required") {
    return resolve(response);
  }
  reject(new Error(response?.message || "Unknown error from background"));
}

/**
 * Orchestre le scraping d'un profil LinkedIn individuel.
 * @param {string} sourceType - L'origine du candidat (annonce, chasse).
 * @returns {Promise<Object|null>} Le résultat de l'envoi des données, ou null.
 */
async function scrapeLinkedInProfile(sourceType) {
  if (!isOnLinkedInProfilePage()) return;
  console.log("[LinkedIn Recruiter] Scraper lancé");
  
  try {
    const scrapedData = await extractProfileDataWithAttachments(sourceType);
    await addAttachmentCount(scrapedData);
    return await maybeSendData(scrapedData);
  } catch (error) {
    console.error("[LinkedIn Recruiter] Échec du scraping :", error.message || error);
  }
}

/**
 * Ajoute le nombre de pièces jointes aux données scrapées.
 * @param {Object} scrapedData - L'objet de données du candidat (sera muté).
 */
async function addAttachmentCount(scrapedData) {
  const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');
  scrapedData.attachmentCount = extractAttachmentCount(attachmentsTab);
}

/**
 * Envoie les données si le prénom et le nom ont été trouvés.
 * @param {Object} scrapedData - Les données complètes du candidat.
 */
async function maybeSendData(scrapedData) {
  if (scrapedData.firstName && scrapedData.lastName) {
    return await sendScrapedDataToBackground(scrapedData);
  }
  return null;
}

/**
 * Navigue vers la page suivante de la liste de candidats.
 * @returns {Promise<boolean>} Vrai si la navigation a réussi, sinon faux.
 */
async function goToNextPage() {
  const nextButton = document.querySelector('a[data-test-pagination-next]');
  const isDisabled = nextButton?.getAttribute('aria-disabled') === 'true';

  if (!nextButton || isDisabled) {
    console.log("[LinkedIn Recruiter] Plus de pages à scraper.");
    return false;
  }

  console.log("[LinkedIn Recruiter] Bouton 'Page suivante' trouvé. Clic pour passer à la page suivante...");
  clickRandomSpotInside(nextButton);
  await waitForNextPageLoad();
  return true;
}

/**
 * Boucle principale qui traite les pages de candidats jusqu'à la limite.
 * @param {number} maxCandidates - Le nombre maximum de candidats à scraper.
 * @param {string|null} sourceType - L'origine des candidats.
 * @returns {Promise<number>} Le nombre total de candidats effectivement traités.
 */
async function processPagesUntilLimit(maxCandidates, sourceType) {
  let pageNumber = 1;
  let processedCount = 0;

  while (processedCount < maxCandidates) {
    const result = await processListPage(pageNumber, processedCount, maxCandidates, sourceType);
    processedCount += result.newlyProcessed;

    if (result.stop) break;
    if (!(await goToNextPage())) break;

    pageNumber++;
  }
  return processedCount;
}
/**
 * Traite une seule page de la liste de candidats.
 * @param {number} pageNumber - Le numéro de la page actuelle.
 * @param {number} processedCount - Le nombre de candidats déjà traités.
 * @param {number} maxCandidates - Le nombre maximum de candidats à traiter.
 * @param {string|null} sourceType - Le type de source des candidats.
 * @returns {Promise<{newlyProcessed: number, stop: boolean}>}
 */
async function processListPage(pageNumber, processedCount, maxCandidates, sourceType) {
  console.log(`[LinkedIn Recruiter] Traitement de la page ${pageNumber}...`);
  await prepareForListScraping();
  const candidateLinks = getCandidateListLinks();

  if (candidateLinks.length === 0) {
    console.warn(`[LinkedIn Recruiter] Aucun candidat trouvé sur la page ${pageNumber}. Arrêt.`);
    return { newlyProcessed: 0, stop: true };
  }

  console.log(`[LinkedIn Recruiter] ${candidateLinks.length} candidats détectés sur la page ${pageNumber}.`);
  return await processCandidateList(candidateLinks, processedCount, maxCandidates, sourceType);
}

/**
 * Orchestre le scraping d'une liste de profils LinkedIn.
 * @param {number} [maxCandidates=25] - Le nombre maximum de candidats à scraper.
 * @param {string|null} [sourceType=null] - L'origine des candidats.
 */
async function scrapeListOfProfiles(maxCandidates = 25, sourceType = null) {
  const logPrefix = `[LinkedIn Recruiter]`;
  console.log(`${logPrefix} Démarrage du scraping de liste avec un maximum de ${maxCandidates} candidats et type de source '${sourceType || 'Non spécifié'}'...`);
  const totalProcessed = await processPagesUntilLimit(maxCandidates, sourceType);
  console.log(`${logPrefix} Le scraping de toutes les pages est terminé. ${totalProcessed} candidats traités.`);
}

/**
 * Prépare la page pour le scraping en scrollant pour charger tous les candidats.
 */
async function prepareForListScraping() {
  console.log("[LinkedIn Recruiter] Début du scroll pour charger tous les candidats...");
  await fastScrollToTop();
  await scrollToBottom();
  await fastScrollToTop();
  console.log("[LinkedIn Recruiter] Scroll terminé. Début du scraping...");
}

/**
 * Met en pause l'exécution tant que le scraping est en état de pause.
 */
async function waitForUnpause() {
  while (window.isScrapingPaused) {
    await delay(1000); // Wait 1 second before checking again
  }
}

/**
 * Gère le cas où une connexion est requise pendant le scraping de liste.
 */
function handleLoginRequiredDuringListScrape() {
  console.log('[LinkedIn Recruiter] Connexion requise. Arrêt du scraping de la page.');
  alert("Connexion à MeilleurPilotage requise. Le scraping de la liste est arrêté.");
}

/**
 * Traite un seul lien de candidat de la liste.
 * @param {Element} link - L'élément <a> du candidat.
 * @param {number} currentCount - Le numéro du candidat dans le décompte global (pour le logging).
 * @param {string|null} sourceType - L'origine du candidat.
 * @returns {Promise<{shouldStop: boolean}>} Un objet indiquant si le scraping doit s'arrêter.
 */
async function processLink(link, currentCount, sourceType) {
  await waitForUnpause();
  const result = await processSingleCandidateFromList(link, currentCount, sourceType);
  if (result?.status === 'login_required') {
    handleLoginRequiredDuringListScrape();
    return { shouldStop: true };
  }
  await delay(getRandomInRange(500, 3100));
  return { shouldStop: false };
}

/**
 * Itère sur la liste des liens de candidats et traite chaque profil.
 * @param {Array<Element>} links - Les éléments <a> des candidats à traiter.
 * @param {number} processedCount - Le nombre de candidats déjà traités avant cette page.
 * @param {number} maxCandidates - Le nombre maximum de candidats à traiter au total.
 * @param {string|null} sourceType - L'origine des candidats.
 * @returns {Promise<{newlyProcessed: number, stop: boolean}>} Le nombre de candidats traités sur cette page et un indicateur d'arrêt.
 */
async function processCandidateList(links, processedCount, maxCandidates, sourceType) {
  let newlyProcessed = 0;
  for (const link of links) {
    if (processedCount + newlyProcessed >= maxCandidates) {
      console.log(`[LinkedIn Recruiter] Limite de ${maxCandidates} atteinte pendant le traitement de la page.`);
      break;
    }
    const result = await processLink(link, processedCount + newlyProcessed + 1, sourceType);
    if (result.shouldStop) {
      return { newlyProcessed, stop: true };
    }
    newlyProcessed++;
  }
  return { newlyProcessed, stop: false };
}

/**
 * Scrape les données du profil et ferme le panneau.
 * @param {number} index - Le numéro du candidat (pour le logging).
 * @param {string|null} sourceType - L'origine du candidat.
 * @returns {Promise<object>} Le résultat de l'envoi des données au background script.
 */
async function scrapeAndCloseProfile(index, sourceType) {
  const result = await scrapeLinkedInProfile(sourceType);
  logScrapingResult(result, index);
  await closeProfile();
  console.log(`[LinkedIn Recruiter] Profil ${index} traité avec succès.`);
  return result;
}

/**
 * Ouvre un profil à partir d'un lien dans la liste et attend son chargement.
 * @param {Element} link - L'élément <a> à cliquer.
 */
async function openProfileFromList(link) {
  link.scrollIntoView({ behavior: "smooth", block: "center" });
  await delay(getRandomInRange(200, 500));
  clickRandomSpotInside(link);
  await waitForProfileOpen();

  await waitForElement("button[title^='Ajouter une note sur'], button[title^='Add Note about']", 7000); // Increased timeout
  await delay(getRandomInRange(300, 700));
  console.log("[LinkedIn Recruiter] Profile content loaded.");
}

/**
 * Gère les erreurs survenant lors du traitement d'un candidat de la liste.
 * @param {Error} error - L'objet d'erreur capturé.
 * @param {number} index - Le numéro du candidat (pour le logging).
 * @returns {Promise<object>} Un objet d'erreur standard.
 */
async function handleCandidateProcessingError(error, index) {
  console.warn(`[LinkedIn Recruiter] Échec du traitement du candidat ${index} :`, error.message);
  await tryCloseWithButton(); // Attempt to close to unblock the UI
  return { status: 'error', message: error.message };
}

/**
 * Traite un seul candidat de la liste : ouvre, scrape, et ferme le profil.
 * @param {Element} link - L'élément <a> du candidat.
 * @param {number} index - Le numéro du candidat dans la liste (pour le logging).
 * @param {string|null} sourceType - L'origine du candidat.
 */
async function processSingleCandidateFromList(link, index, sourceType) {
  console.log(`[LinkedIn Recruiter] Traitement du profil ${index}...`);
  try {
    await openProfileFromList(link);
    return await scrapeAndCloseProfile(index, sourceType);
  } catch (e) {
    return await handleCandidateProcessingError(e, index);
  }
}

/**
 * Attend qu'un élément spécifique disparaisse du DOM.
 * @param {Element} element - L'élément à surveiller.
 * @param {number} timeout - Le délai d'attente maximum en millisecondes.
 * @param {string} errorMessage - Le message d'erreur à lancer en cas de timeout.
 */
async function waitForElementToDisappear(element, timeout, errorMessage) {
  const start = Date.now();
  while (document.body.contains(element)) {
    if (Date.now() - start > timeout) {
      throw new Error(errorMessage);
    }
    await delay(200);
  }
}

/**
 * Attend que la page suivante de candidats se charge en vérifiant que l'ancienne liste a disparu.
 * @param {number} [timeout=15000] - Le délai d'attente maximum en millisecondes.
 */
async function waitForNextPageLoad(timeout = 15000) {
  const firstCandidateElement = document.querySelector('ol[data-test-paginated-list] li');
  if (!firstCandidateElement) {
    return await delay(getRandomInRange(500, 1000));
  }
  const errorMsg = "Timeout waiting for next page to load. The old content is still present.";
  await waitForElementToDisappear(firstCandidateElement, timeout, errorMsg);
  console.log("[LinkedIn Recruiter] New page content detected.");
  await delay(getRandomInRange(500, 1000));
}

/**
 * Affiche le résultat du scraping pour un candidat dans la console.
 * @param {object} result - L'objet de résultat de l'envoi au background script.
 * @param {number} index - Le numéro du candidat (pour le logging).
 */
function logScrapingResult(result, index) {
  if (result?.status === 'success') {
    console.log(`[LinkedIn Recruiter] Candidat ${index} envoyé avec succès`);
  } else if (result?.status !== 'login_required') {
    console.warn(`[LinkedIn Recruiter] Candidat ${index} non envoyé correctement`);
  }
}

/**
 * Attend que la vue du profil soit ouverte en vérifiant l'URL.
 * @param {number} [timeout=5000] - Le délai d'attente maximum en millisecondes.
 */
async function waitForProfileOpen(timeout = 5000) {
  const start = Date.now();
  while (!isOnLinkedInProfilePage()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timeout : le profil ne s'est pas chargé dans le temps imparti.");
    }
    await delay(300);
  }
  await delay(getRandomInRange(500, 1000)); // Délai supplémentaire pour la stabilisation de l'UI
}

/**
 * Tente de fermer la vue détaillée du profil, soit en cliquant à l'extérieur,
 * soit en utilisant le bouton de fermeture.
 */
async function closeProfile() {
  // Tenter de fermer avec le bouton est plus fiable.
  const closedWithButton = await tryCloseWithButton();
  if (closedWithButton) return;

  await tryCloseByClickingOutside();
}

/**
 * Tente de fermer le profil en cliquant sur l'overlay.
 * @returns {Promise<boolean>} Vrai si l'overlay a été trouvé et cliqué, sinon faux.
 */
async function tryCloseByClickingOutside() {
  const overlay = document.querySelector("base-slidein-container:not([data-test-base-slidein])");
  if (overlay) {
    clickRandomSpotInside(overlay);
    console.log("[LinkedIn Recruiter] Fermeture du profil via clic en dehors.");
    await delay(getRandomInRange(300, 800));
    return true;
  }
  return false;
}

/**
 * Tente de fermer le profil en utilisant le bouton de fermeture dédié. C'est la méthode préférée.
 * @returns {Promise<boolean>} Vrai si le bouton a été trouvé et cliqué, sinon faux.
 */
async function tryCloseWithButton() {
  const closeBtn = document.querySelector("a[data-test-close-pagination-header-button]");
  if (closeBtn) {
    clickRandomSpotInside(closeBtn);
    console.log("[LinkedIn Recruiter] Fermeture du profil via bouton de fermeture.");
    await delay(getRandomInRange(300, 800));
    return true;
  }
  return false;
}

/**
 * Met en pause l'exécution pendant une durée spécifiée.
 * @param {number} ms - La durée de la pause en millisecondes.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Génère un nombre aléatoire dans un intervalle donné.
 * @param {number} [min=300] - La borne minimale.
 * @param {number} [max=1500] - La borne maximale.
 * @returns {number} Un entier aléatoire.
 */
function getRandomInRange(min = 300, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Crée un timeout pour un observateur, rejetant une promesse s'il est atteint.
 * @param {MutationObserver} observer - L'instance de l'observateur à déconnecter.
 * @param {string} selector - Le sélecteur CSS, utilisé pour le message d'erreur.
 * @param {number} timeout - La durée du timeout en millisecondes.
 * @param {Function} reject - La fonction de rejet de la promesse à appeler.
 */
function createObserverTimeout(observer, selector, timeout, reject) {
  return setTimeout(() => {
    observer.disconnect();
    reject(new Error(`Timeout: Élément ${selector} introuvable`));
  }, timeout);
}

/**
 * Met en place un observateur pour attendre l'apparition d'un élément.
 * @param {string} selector - Le sélecteur CSS de l'élément.
 * @param {Function} resolve - La fonction de résolution de la promesse parente.
 * @param {Function} reject - La fonction de rejet de la promesse parente.
 * @param {number} timeout - Le délai d'attente maximum en millisecondes.
 */
function setupElementObserver(selector, resolve, reject, timeout) {
  let timeoutId;
  const observer = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (el) {
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  timeoutId = createObserverTimeout(observer, selector, timeout, reject);
}

/**
 * Attend qu'un élément apparaisse dans le document.
 * @param {string} selector - Le sélecteur CSS de l'élément cible.
 * @param {number} [timeout=5000] - Le délai d'attente en millisecondes.
 * @returns {Promise<Element>} Une promesse qui se résout avec l'élément trouvé.
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) resolve(el);
    else setupElementObserver(selector, resolve, reject, timeout);
  });
}

/**
 * Simule un clic utilisateur réaliste à l'intérieur du cadre de délimitation d'un élément.
 * @param {Element} element - L'élément sur lequel cliquer.
 */
function clickRandomSpotInside(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + (rect.width * Math.random());
  const y = rect.top + (rect.height * Math.random());
  const eventOpts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  ["mousedown", "mouseup", "click"].forEach(type => {
    element.dispatchEvent(new MouseEvent(type, eventOpts));
  });
}

/**
 * Fait défiler la page rapidement vers le haut.
 * @returns {Promise<void>}
 */
async function fastScrollToTop() {
  window.scrollTo({ top: 0, behavior: "auto" });
  await delay(300);
}

/**
 * Vérifie si le scroll a atteint le bas de la page.
 * @returns {boolean} Vrai si le bas de la page est atteint, sinon faux.
 */
function isAtPageBottom() {
  const scrollHeight = document.documentElement.scrollHeight;
  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;
  return scrollTop + windowHeight >= scrollHeight - 10;
}

/**
 * Effectue une série de petits scrolls pour simuler un défilement fluide.
 * @param {number} count - Le nombre de petits défilements à effectuer.
 * @returns {Promise<void>}
 */
async function performMiniScrolls(count) {
  for (let i = 0; i < count; i++) {
    window.scrollBy(0, getRandomInRange(1, 15));
    await delay(getRandomInRange(1, 2));
  }
}

/**
 * Scrolle la page jusqu'en bas de manière "humaine" pour charger tous les éléments.
 * @returns {Promise<void>}
 */
async function scrollToBottom() {
  while (!isAtPageBottom()) {
    await performMiniScrolls(getRandomInRange(130, 280));
    await delay(getRandomInRange(300, 1200));
  }
}

/**
 * Récupère les éléments de la liste de candidats.
 * @returns {NodeListOf<Element>} Une liste des éléments `li` contenant les candidats.
 */
function getCandidateListItems() {
  return document.querySelectorAll('ol[data-test-paginated-list] li div[data-test-paginated-list-item]');
}

/**
 * Extrait le lien <a> d'un élément de la liste.
 * @param {Element} item - L'élément de la liste.
 * @returns {Element|null} L'élément <a> trouvé, ou null.
 */
function extractLinkFromItem(item) {
  return item.querySelector("a");
}

/**
 * Récupère les éléments <a> des candidats dans la liste.
 * @returns {Array<Element>} Un tableau des éléments <a> des candidats.
 */
function getCandidateListLinks() {
  const listItems = getCandidateListItems();
  return Array.from(listItems).map(extractLinkFromItem).filter(Boolean);
}

/**
 * Normalise un numéro de téléphone français.
 * @param {string|null} rawPhone Le numéro de téléphone brut.
 * @returns {string|null} Le numéro normalisé (ex: 0612345678) ou null si invalide.
 */
function normalizeFrenchNumber(rawPhone) {
  if (!rawPhone) return null;

  const cleaned = rawPhone.replace(/[\s\-().]/g, '');
  const internationalMatch = /^(?:\+33|0033)([167]\d{8})$/.exec(cleaned);
  if (internationalMatch) {
    return '0' + internationalMatch[1];
  }
  if (/^0[167]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}
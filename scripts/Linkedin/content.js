window.isScrapingPaused = false;

/**
 * Bascule l'état de pause du scraping et affiche une alerte.
 */
function togglePauseScraping() {
  window.isScrapingPaused = !window.isScrapingPaused;
  if (window.isScrapingPaused) {
    const message = 'Scraping en PAUSE. Appuyez sur Ctrl+Alt+P pour reprendre.';
    console.log(`%c[LinkedIn Recruiter] ${message}`, 'color: orange; font-weight: bold;');
    alert(message);
  } else {
    console.log('%c[LinkedIn Recruiter] Scraping REPRIS.', 'color: green; font-weight: bold;');
  }
}

/**
 * Gère le message pour lancer le scraper LinkedIn.
 * @param {object} message - Le message reçu.
 * @param {function} sendResponse - La fonction pour répondre.
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
 * Met en place les écouteurs de messages et d'événements clavier.
 */
function setupListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runLinkedinScraper") handleLinkedinScraperMessage(message, sendResponse);
    else if (message.action === 'login_required') handleLoginRequiredMessage();
    return true; // Indique une réponse asynchrone pour certains cas.
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'p') togglePauseScraping();
  });
}

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
 * Point d'entrée principal pour le script de contenu LinkedIn.
 */
if (!window.linkedinScraperListenerRegistered) {
  window.linkedinScraperListenerRegistered = true;
  setupListeners();
}
/**
 * Vérifie si la page actuelle est une fiche candidat LinkedIn Recruiter.
 * @returns {boolean}
 */
function isOnLinkedInProfilePage() {
  const href = location.href;
  return href.startsWith("https://www.linkedin.com/talent/hire/") &&
         (href.includes("/manage/all/profile/") || href.includes("/discover/applicants/profile/"));
}

/**
 * Vérifie si la page actuelle est une liste de candidats LinkedIn Recruiter.
 * @returns {boolean}
 */
function isOnLinkedInListPage() {
  const href = location.href;
  const isProjectListPage = href.includes("/manage/all") && !href.includes("/profile/");
  const isApplicantListPage = href.includes("/discover/applicants?jobId") && !href.includes("/profile/");

  return href.startsWith("https://www.linkedin.com/talent/hire/") && (isProjectListPage || isApplicantListPage);
}

/**
 * Extrait les données de profil ainsi que les pièces jointes.
 * @returns {Promise<Object>}
 */
async function extractProfileDataWithAttachments(sourceType) {
  const { firstName, lastName } = extractNameFromNoteButton();
  const profileTab = await waitForElement('[data-live-test-profile-index-tab]');
  const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');
    
  await openProfileTab(profileTab);
  const contactInfo = extractContactInfo(firstName, lastName);
  
  await openAttachmentsTab(attachmentsTab);
  
  const scrapedData = {
    firstName,
    lastName,
    ...contactInfo,
    source: 'linkedin',
    sourceType: sourceType,
    profileUrl: location.href // Use the current Recruiter URL for direct navigation
  };

  console.log("[LinkedIn Recruiter] Données extraites :", scrapedData);
  return scrapedData;
}

/**
 * Extrait les informations de contact (email, téléphone, URL) du profil.
 * @param {string} firstName - Le prénom du candidat.
 * @param {string} lastName - Le nom de famille du candidat.
 * @returns {{email: string, phone: string|null}}
 */
function extractContactInfo(firstName, lastName) {
  const email = document.querySelector("span[data-test-contact-email-address]")?.textContent.trim() || `${firstName}_${lastName}@linkedin.com`;
  const rawPhone = document.querySelector("span[data-test-contact-phone][data-live-test-contact-phone]")?.textContent.trim() || null;
  const phone = normalizeFrenchNumber(rawPhone);
  return { email, phone };
}

/**
 * Extrait le prénom et le nom à partir du bouton de note.
 * Gère les versions anglaises et françaises de LinkedIn Recruiter.
 * @returns {{firstName: string|null, lastName: string|null}}
 */
function extractNameFromNoteButton() {
  const noteButton = document.querySelector("button[title^='Ajouter une note sur']") ||
                     document.querySelector("button[title^='Add Note about']");
  const title = noteButton?.getAttribute("title");
  const match = title?.match(/^Ajouter une note sur (.+)$/) ||
                title?.match(/^Add Note about (.+)$/);
  if (!match) {
    console.error("ATTENTION : Prénom et nom non trouvés !");
    return { firstName: null, lastName: null };
  }

  const [firstName, ...lastParts] = match[1].trim().split(" ");
  return { firstName, lastName: lastParts.join(" ") };
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
 * @param {HTMLElement} tabElement - L'élément de l'onglet pièces jointes.
 */
async function openAttachmentsTab(tabElement) {
  const count = extractAttachmentCount(tabElement);
  if (count === 0) {
    console.log(`[LinkedIn Recruiter] Aucune pièce jointe détectée (count = ${count}). Onglet non cliqué.`);
    return;
  }
  await clickTab(tabElement, count);
}

function extractAttachmentCount(tabElement) {
  const labelText = tabElement?.querySelector('div')?.innerText?.trim() || '';
  const match = labelText.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function clickTab(tab, count = null) {
  const rDelay = getRandomInRange();
  if (count !== null) {
    console.log(`[LinkedIn Recruiter] ${count} pièce(s) jointe(s) détectée(s). Attente de ${rDelay}ms avant clic...`);
  }
  await delay(rDelay);
  clickRandomSpotInside(tab);
}

// === Communication avec le background ===

/**
 * Envoie les données extraites au script background pour insertion différée.
 * @param {Object} scrapedData
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
 * @param {object} response - La réponse reçue.
 * @param {Function} resolve - La fonction resolve de la promesse.
 * @param {Function} reject - La fonction reject de la promesse.
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
 * Lance le scraping automatique si on est sur une fiche candidat.
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

async function addAttachmentCount(scrapedData) {
  const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');
  scrapedData.attachmentCount = extractAttachmentCount(attachmentsTab);
}

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
 * Orchestre le scraping d'une liste de profils.
 */
async function scrapeListOfProfiles(maxCandidates = 25, sourceType = null) {
  console.log(`[LinkedIn Recruiter] Démarrage du scraping de liste avec un maximum de ${maxCandidates} candidats et type de source '${sourceType || 'Non spécifié'}'...`);
  let pageNumber = 1;
  let processedCount = 0;

  while (processedCount < maxCandidates) {
    const { newlyProcessed, stop } = await processListPage(pageNumber, processedCount, maxCandidates, sourceType);
    processedCount += newlyProcessed;

    if (stop || !(await goToNextPage())) {
      break;
    }
    pageNumber++;
  }
  console.log(
    `[LinkedIn Recruiter] Le scraping de toutes les pages est terminé. ${processedCount} candidats traités.`
  );
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
 * Itère sur la liste des liens de candidats et traite chaque profil.
 * @param {Array<Element>} links - Les éléments <a> des candidats.
 */
async function processCandidateList(links, processedCount, maxCandidates, sourceType) {
  let newlyProcessed = 0;
  for (let i = 0; i < links.length; i++) {
    if (processedCount + newlyProcessed >= maxCandidates) {
      console.log(`[LinkedIn Recruiter] Limite de ${maxCandidates} atteinte pendant le traitement de la page.`);
      break;
    }
    while (window.isScrapingPaused) {
      await delay(1000); // Wait 1 second before checking again
    }
    const result = await processSingleCandidateFromList(links[i], processedCount + newlyProcessed + 1, sourceType);
    if (result?.status === 'login_required') {
      console.log('[LinkedIn Recruiter] Connexion requise. Arrêt du scraping de la page.');
      alert("Connexion à MeilleurPilotage requise. Le scraping de la liste est arrêté.");
      return { newlyProcessed, stop: true };
    }
    newlyProcessed++;
    await delay(getRandomInRange(500, 3100));
  }
  return { newlyProcessed, stop: false };
}

/**
 * Traite un seul candidat de la liste : ouvre, scrape, et ferme le profil.
 * @param {Element} link - L'élément <a> du candidat.
 * @param {number} index - L'index du candidat dans la liste (pour le logging).
 */
async function processSingleCandidateFromList(link, index, sourceType) {
  console.log(`[LinkedIn Recruiter] Traitement du profil ${index}...`);
  try {
    await openProfileFromList(link);
    const result = await scrapeLinkedInProfile(sourceType);
    logScrapingResult(result, index);
    await closeProfile();
    console.log(`[LinkedIn Recruiter] Profil ${index} traité avec succès.`);
    return result;
  } catch (e) {
    console.warn(`[LinkedIn Recruiter] Échec du traitement du candidat ${index} :`, e.message);
    await tryCloseWithButton(); // Attempt to close the profile to unblock the process
    return { status: 'error', message: e.message };
  }
}

/**
 * Ouvre un profil à partir d'un lien dans la liste et attend son chargement.
 * @param {Element} link - L'élément <a> à cliquer.
 */
async function openProfileFromList(link) {
  link.scrollIntoView({ behavior: "smooth", block: "center" });
  await delay(getRandomInRange(200, 500)); // Brief pause after scrolling
  clickRandomSpotInside(link);
  await waitForProfileOpen();
  await waitForElement('[data-live-test-profile-attachments-tab]');
  await waitForElement('[data-live-test-row-lockup-full-name]');
}

/**
 * Waits for the next page of candidates to load by checking for the old list to disappear.
 * @param {number} [timeout=15000] - Timeout in milliseconds.
 */
async function waitForNextPageLoad(timeout = 15000) {
  console.log("[LinkedIn Recruiter] Waiting for next page to load...");
  // A simple but effective way for SPAs is to wait for a key element to be stale.
  const firstCandidateElement = document.querySelector('ol[data-test-paginated-list] li');
  if (!firstCandidateElement) {
    // If there's no list, maybe it's just loading. Wait a bit.
    await delay(1000);
    return;
  }

  const start = Date.now();
  while (document.body.contains(firstCandidateElement)) {
    if (Date.now() - start > timeout) {
      throw new Error("Timeout waiting for next page to load. The old content is still present.");
    }
    await delay(200); // Check every 200ms
  }
  console.log("[LinkedIn Recruiter] New page content detected.");
  // Add an extra delay for content to fully render
  await delay(getRandomInRange(1000, 2000));
}

/**
 * Affiche le résultat du scraping pour un candidat dans la console.
 * @param {object} result - Le résultat de l'envoi au background.
 * @param {number} index - L'index du candidat.
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
 * @param {number} [timeout=5000] - Délai d'attente maximum.
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

  // Si cela échoue, tenter de cliquer à l'extérieur comme solution de repli.
  await tryCloseByClickingOutside();
}

/**
 * Tente de fermer le profil en cliquant sur l'overlay.
 * @returns {Promise<boolean>} Vrai si la fermeture a réussi, sinon faux.
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
 * @returns {Promise<boolean>} Vrai si la fermeture a réussi, sinon faux.
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

// === Fonctions utilitaires ===

/**
 * Met en pause l'exécution pendant une durée spécifiée.
 * @param {number} ms - Le nombre de millisecondes à attendre.
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
 * Attend qu'un élément apparaisse dans le document.
 * @param {string} selector - Le sélecteur CSS de l'élément cible.
 * @param {number} [timeout=5000] - Le délai d'attente en millisecondes.
 * @returns {Promise<Element>}
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

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
    timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: Élément ${selector} introuvable`));
    }, timeout);
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
 */
async function fastScrollToTop() {
  window.scrollTo({ top: 0, behavior: "auto" });
  await delay(300);
}

/**
 * Vérifie si le scroll a atteint le bas de la page.
 * @returns {boolean}
 */
function isAtPageBottom() {
  const scrollHeight = document.documentElement.scrollHeight;
  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;
  return scrollTop + windowHeight >= scrollHeight - 10;
}

/**
 * Effectue une série de petits scrolls pour simuler un défilement fluide.
 * @param {number} count - Le nombre de petits scrolls à effectuer.
 */
async function performMiniScrolls(count) {
  for (let i = 0; i < count; i++) {
    window.scrollBy(0, getRandomInRange(1, 15));
    await delay(getRandomInRange(1, 2));
  }
}

/**
 * Scrolle la page jusqu'en bas de manière "humaine" pour charger tous les éléments.
 */
async function scrollToBottom() {
  while (!isAtPageBottom()) {
    await performMiniScrolls(getRandomInRange(130, 280));
    await delay(getRandomInRange(300, 1200));
  }
}

/**
 * Récupère les éléments <a> des candidats dans la liste.
 * @returns {Array<Element>}
 */
function getCandidateListLinks() {
  const listItems = document.querySelectorAll('ol[data-test-paginated-list] li div[data-test-paginated-list-item]');
  return Array.from(listItems)
    .map(item => item.querySelector("a"))
    .filter(link => link);
}

/**
 * Normalise un numéro de téléphone français.
 * @param {string} rawPhone Le numéro de téléphone brut.
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
window.isScrapingPaused = false;

function togglePauseScraping() {
  window.isScrapingPaused = !window.isScrapingPaused;
  if (window.isScrapingPaused) {
    const message = 'Scraping PAUSED. Press Ctrl+Alt+P to resume.';
    console.log(`%c[LinkedIn Recruiter] ${message}`, 'color: orange; font-weight: bold;');
    alert(message);
  } else {
    console.log('%c[LinkedIn Recruiter] Scraping RESUMED.', 'color: green; font-weight: bold;');
  }
}

if (!window.linkedinScraperListenerRegistered) {
  window.linkedinScraperListenerRegistered = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runLinkedinScraper") {
      console.log(`[LinkedIn Recruiter] Received scraping request with max candidates: ${message.maxCandidates}. Routing...`);
      routeScraperBasedOnPage(message.maxCandidates);
      sendResponse({ status: 'success' });
      return true;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      togglePauseScraping();
    }
  });
}

function routeScraperBasedOnPage(maxCandidates) {
  if (isOnLinkedInProfilePage()) {
    scrapeLinkedInProfile();
  } else if (isOnLinkedInListPage()) {
    scrapeListOfProfiles(maxCandidates);
  } else {
    console.warn("[LinkedIn] Page non supportée pour le scraping.");
  }
}

/**
 * Vérifie si la page actuelle est une fiche candidat LinkedIn Recruiter.
 * @returns {boolean}
 */
function isOnLinkedInProfilePage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         location.href.includes("/manage/all/profile/");
}

/**
 * Vérifie si la page actuelle est une liste de candidats LinkedIn Recruiter.
 * @returns {boolean}
 */
function isOnLinkedInListPage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         !location.href.includes("/profile/");
}

/**
 * Extrait les données de profil ainsi que les pièces jointes.
 * @returns {Promise<Object>}
 */
async function extractProfileDataWithAttachments() {
  const { firstName, lastName } = extractNameFromNoteButton();
  const profileTab = await waitForElement('[data-live-test-profile-index-tab]');
  const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');
    
  await openTab(profileTab);
  const contactInfo = extractContactInfo(firstName, lastName);
  
  await openTab(attachmentsTab);
  console.log("[LinkedIn Recruiter] Onglet pièces jointes cliqué.");
  
  const scrapedData = {
    firstName,
    lastName,
    ...contactInfo,
    source: 'linkedin',
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
  const phone = document.querySelector("span[data-test-contact-phone][data-live-test-contact-phone]")?.textContent.trim() || null;
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
 * Ouvre l’onglet des pièces jointes et attend qu’elles soient chargées.
 */
async function openTab(element) {
  if (!element) {
    console.warn("[LinkedIn Recruiter] Tab element not found.");
    return;
  }

  if (isAttachmentsTab(element) && !hasAttachments(element)) {
    return; // Ne pas cliquer si c'est l'onglet des PJ sans PJ
  }

  const count = isAttachmentsTab(element) ? extractAttachmentCount(element) : null;
  await clickTab(element, count);
}

function isAttachmentsTab(element) {
  return element.hasAttribute('data-live-test-profile-attachments-tab');
}

function hasAttachments(tabElement) {
  const count = extractAttachmentCount(tabElement);
  if (count > 0) return true;
  console.log(`[LinkedIn Recruiter] Aucune pièce jointe détectée (count = ${count}). Onglet non cliqué.`);
  return false;
}

function extractAttachmentCount(tabElement) {
  const labelText = tabElement?.querySelector('div')?.innerText?.trim() || '';
  const match = labelText.match(/\((\d+)\)/);
  const number = match ? parseInt(match[1], 10) : 0;
  return number;
}

async function clickTab(tab, count) {
  const rDelay = getRandomInRange();
  console.log(`[LinkedIn Recruiter] ${count} pièce(s) jointe(s) détectée(s). Attente de ${rDelay}ms avant clic...`);
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
  if (response?.status === "success") return resolve(response);
  reject(new Error(response?.message || "Unknown error from background"));
}

/**
 * Lance le scraping automatique si on est sur une fiche candidat.
 */
async function scrapeLinkedInProfile() {
  if (!isOnLinkedInProfilePage()) return;
  console.log("[LinkedIn Recruiter] Scraper lancé");
  
  try {
    const scrapedData = await extractProfileDataWithAttachments();
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
 * Orchestre le scraping d'une liste de profils.
 */
async function scrapeListOfProfiles(maxCandidates = 25) {
  console.log(`[LinkedIn Recruiter] Starting list scraping with a max of ${maxCandidates} candidates...`);
  let pageNumber = 1;
  let processedCount = 0;

  while (processedCount < maxCandidates) {
    console.log(`[LinkedIn Recruiter] Processing page ${pageNumber}...`);
    await prepareForListScraping();
    const candidateLinks = getCandidateListLinks();

    if (candidateLinks.length === 0) {
      console.warn(`[LinkedIn Recruiter] No candidates found on page ${pageNumber}. Stopping.`);
      break;
    }

    console.log(`[LinkedIn Recruiter] ${candidateLinks.length} candidats détectés on page ${pageNumber}.`);
    const newlyProcessedCount = await processCandidateList(candidateLinks, processedCount, maxCandidates);
    processedCount += newlyProcessedCount;

    if (processedCount >= maxCandidates) {
      console.log(`[LinkedIn Recruiter] Reached user limit of ${maxCandidates}. Stopping.`);
      break;
    }

    const nextButton = document.querySelector('a[data-test-pagination-next]');
    const isDisabled = nextButton?.getAttribute('aria-disabled') === 'true';

    if (!nextButton || isDisabled) {
      console.log("[LinkedIn Recruiter] No more pages to scrape.");
      break;
    }

    console.log("[LinkedIn Recruiter] Next page button found. Clicking to go to next page...");
    clickRandomSpotInside(nextButton);
    await waitForNextPageLoad();
    pageNumber++;
  }
  console.log(
    `[LinkedIn Recruiter] Scraping of all pages is complete. Processed ${processedCount} candidates.`
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
async function processCandidateList(links, processedCount, maxCandidates) {
  let newlyProcessedCount = 0;
  for (let i = 0; i < links.length; i++) {
    if (processedCount + newlyProcessedCount >= maxCandidates) {
      console.log(`[LinkedIn Recruiter] Limit of ${maxCandidates} reached during page processing.`);
      break;
    }
    while (window.isScrapingPaused) {
      await delay(1000); // Wait 1 second before checking again
    }
    await processSingleCandidateFromList(links[i], processedCount + newlyProcessedCount + 1);
    newlyProcessedCount++;
    await delay(getRandomInRange(500, 3100));
  }
  return newlyProcessedCount;
}

/**
 * Traite un seul candidat de la liste : ouvre, scrape, et ferme le profil.
 * @param {Element} link - L'élément <a> du candidat.
 * @param {number} index - L'index du candidat dans la liste (pour le logging).
 */
async function processSingleCandidateFromList(link, index) {
  try {
    await openProfileFromList(link);
    const result = await scrapeLinkedInProfile();
    logScrapingResult(result, index);
    await closeProfile();
    console.log(`[LinkedIn Recruiter] Profil ${index} traité.`);
  } catch (e) {
    console.warn(`[LinkedIn Recruiter] Erreur pour le candidat ${index} :`, e);
  }
}

/**
 * Ouvre un profil à partir d'un lien dans la liste et attend son chargement.
 * @param {Element} link - L'élément <a> à cliquer.
 */
async function openProfileFromList(link) {
  link.scrollIntoView({ behavior: "smooth", block: "center" });
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
    await delay(3000);
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
  } else {
    console.warn(`[LinkedIn Recruiter] Candidat ${index} non envoyé correctement`);
  }
}

/**
 * Scrolle la page jusqu'en bas de manière "humaine" pour charger tous les éléments.
 */
async function scrollToBottom() {
  return new Promise(resolve => scrollLoop(resolve));
}

function getRandomInRange(min=300, max=1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fastScrollToTop() {
  return new Promise(resolve => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setTimeout(resolve, 300);
  });
}

/**
 * Boucle de scroll principale qui s'arrête quand le bas de la page est atteint.
 * @param {Function} resolve - La fonction resolve de la promesse parente.
 */
function scrollLoop(resolve) {
  if (isAtPageBottom()) {
    return resolve();
  }
  const miniScrollCount = getRandomInRange(130, 280);
  performMiniScrolls(miniScrollCount, () => {
    const pause = getRandomInRange(300, 1200);
    setTimeout(() => scrollLoop(resolve), pause);
  });
}

/**
 * Effectue une série de petits scrolls pour simuler un défilement fluide.
 * @param {number} count - Le nombre de petits scrolls à effectuer.
 * @param {Function} onComplete - Callback à appeler une fois terminé.
 */
function performMiniScrolls(count, onComplete) {
  let scrolled = 0;
  function miniScroll() {
    if (scrolled >= count) return onComplete();
    window.scrollBy(0, getRandomInRange(1, 15));
    scrolled++;
    setTimeout(miniScroll, getRandomInRange(1, 2));
  }
  miniScroll();
}

function getCandidateListLinks() {
  const listItems = document.querySelectorAll(
    'ol[data-test-paginated-list] li div[data-test-paginated-list-item]'
  );

  const links = [];
  listItems.forEach((item) => {
    const firstLink = item.querySelector("a");
    if (firstLink) {
      links.push(firstLink);
    }
  });

  return links;
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

async function waitForProfileOpen(timeout = 1000) {
  const start = Date.now();
  while (!isOnLinkedInProfilePage()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timeout: profil non chargé");
    }
    await delay(300);
  }
  await delay(1000);
}

/**
 * Tente de fermer la vue détaillée du profil, soit en cliquant à l'extérieur,
 * soit en utilisant le bouton de fermeture.
 */
async function closeProfile() {
  const closed = await tryCloseByClickingOutside();
  if (closed) return;

  await tryCloseWithButton();
}

/**
 * Tente de fermer le profil en cliquant sur l'overlay.
 * @returns {Promise<boolean>} Vrai si la fermeture a été tentée, sinon faux.
 */
async function tryCloseByClickingOutside() {
  if (Math.random() < 0.5) return false; // 50% de chance de ne pas utiliser cette méthode

  const overlay = document.querySelector("base-slidein-container:not([data-test-base-slidein])");
  if (overlay) {
    clickRandomSpotInside(overlay);
    console.log("[LinkedIn Recruiter] Fermeture du profil via clic en dehors.");
    await delay(300);
    return true;
  }
  return false;
}

/**
 * Tente de fermer le profil en utilisant le bouton de fermeture dédié.
 */
async function tryCloseWithButton() {
  const closeBtn = document.querySelector("a[data-test-close-pagination-header-button]");
  if (closeBtn) {
    clickRandomSpotInside(closeBtn);
    console.log("[LinkedIn Recruiter] Fermeture du profil via bouton de fermeture.");
    await delay(300);
  }
}
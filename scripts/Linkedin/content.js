/**
 * Enregistre un listener pour écouter les messages envoyés par le background script.
 * Si l'action reçue est "runLinkedinScraper", lance le routeur de scraping.
 */
if (!window.scraperListenerRegistered) {
  window.scraperListenerRegistered = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runLinkedinScraper") {
      routeScraperBasedOnPage();
      sendResponse({ status: 'success' });
      return true; // Indique une réponse asynchrone
    }
  });
}

/**
 * Redirige le scraping selon la page LinkedIn courante : profil ou liste.
 */
function routeScraperBasedOnPage() {
  if (isOnLinkedInProfilePage()) {
    scrapeLinkedInProfile();
  } else if (isOnLinkedInListPage()) {
    scrapeListOfProfiles();
  } else {
    console.warn("[LinkedIn] Page non supportée pour le scraping.");
  }
}

/**
 * Vérifie si l'URL actuelle correspond à une page de profil LinkedIn Recruiter.
 * @returns {boolean}
 */
function isOnLinkedInProfilePage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         location.href.includes("/manage/all/profile/");
}

/**
 * Vérifie si l'URL actuelle correspond à une liste de candidats LinkedIn Recruiter.
 * @returns {boolean}
 */
function isOnLinkedInListPage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         !location.href.includes("/profile/");
}

/**
 * Extrait les données du profil LinkedIn, y compris les pièces jointes.
 * @returns {Promise<Object>} - Données extraites : prénom, nom, email, téléphone, URL publique.
 */
async function extractProfileDataWithAttachments() {
  const { firstName, lastName } = extractNameFromNoteButton();
  await openAttachmentsTab();

  const email = document.querySelector("span[data-test-contact-email-address]")?.textContent.trim() || `${firstName}_${lastName.replace(/\s+/g, "_")}@linkedin.com`;
  const phone = document.querySelector("span[data-test-contact-phone][data-live-test-contact-phone]")?.textContent.trim() || null;
  const publicProfileUrl = document.querySelector("a[data-test-public-profile-link]")?.href || null;

  const scrapedData = {
    name: firstName,
    lastName,
    email,
    phone,
    publicProfileUrl
  };

  console.log("[LinkedIn Recruiter] Données extraites :", scrapedData);
  return scrapedData;
}

/**
 * Extrait le prénom et le nom à partir du bouton "Ajouter une note sur ...".
 * @returns {{firstName: string|null, lastName: string|null}}
 */
function extractNameFromNoteButton() {
  const noteButton = document.querySelector("#note-list-title + button[title^='Ajouter une note sur']");
  const title = noteButton?.getAttribute("title");
  const match = title?.match(/^Ajouter une note sur (.+)$/);
  if (!match) return { firstName: null, lastName: null };

  const [firstName, ...lastParts] = match[1].trim().split(" ");
  return { firstName, lastName: lastParts.join(" ") };
}

/**
 * Ouvre l’onglet des pièces jointes si des pièces sont disponibles.
 * @returns {Promise<void>}
 */
async function openAttachmentsTab() {
  const attachmentsTab = document.querySelector('[data-live-test-profile-attachments-tab]');
  if (!attachmentsTab) {
    console.warn("[LinkedIn Recruiter] Tab not found.");
    return;
  }

  const count = extractAttachmentCount(attachmentsTab);
  if (count < 1) {
    console.log(`[LinkedIn Recruiter] Aucune pièce jointe détectée (count = ${count}). Onglet non cliqué.`);
    return;
  }

  await clickAttachmentsTab(attachmentsTab, count);
}

/**
 * Extrait le nombre de pièces jointes affiché dans l'onglet.
 * @param {Element} tabElement
 * @returns {number}
 */
function extractAttachmentCount(tabElement) {
  const labelText = tabElement?.querySelector('div')?.innerText?.trim() || '';
  const match = labelText.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Simule un clic sur l'onglet des pièces jointes après un délai aléatoire.
 * @param {Element} tab - Élément HTML de l’onglet.
 * @param {number} count - Nombre de pièces jointes.
 */
async function clickAttachmentsTab(tab, count) {
  const rDelay = getRandomInRange();
  console.log(`[LinkedIn Recruiter] ${count} pièce(s) jointe(s) détectée(s). Attente de ${rDelay}ms avant clic...`);
  await delay(rDelay);
  clickRandomSpotInside(tab);
  console.log("[LinkedIn Recruiter] Onglet pièces jointes cliqué.");
}

/**
 * Envoie les données extraites au background script de l'extension.
 * @param {Object} scrapedData - Données extraites à envoyer.
 */
function sendScrapedDataToBackground(scrapedData) {
  chrome.runtime.sendMessage({
    action: "send_candidate_data",
    scrapedData,
    deferInsert: true
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Message failed:", chrome.runtime.lastError.message);
    } else if (response.status === "success") {
      console.log("[content] Candidat envoyé avec succès : ", response.message);
    } else {
      console.error("[content] Échec de l'envoi :", response.message);
    }
  });
  console.log("bien envoyé !");
}

/**
 * Fonction principale qui déclenche le scraping d’un profil LinkedIn.
 */
async function scrapeLinkedInProfile() {
  if (!isOnLinkedInProfilePage()) return;
  try {
    const scrapedData = await extractProfileDataWithAttachments();
    if (scrapedData.name && scrapedData.lastName) {
      sendScrapedDataToBackground(scrapedData);
    }
  } catch (error) {
    console.error("[LinkedIn Recruiter] Échec du scraping :", error);
  }
}

/**
 * Crée une promesse avec un délai d’attente en millisecondes.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scrape tous les profils présents dans une liste LinkedIn Recruiter.
 * Scrolle lentement pour charger, puis scrolle vers le haut, et traite chaque lien.
 */
async function scrapeListOfProfiles() {
  console.log("[LinkedIn Recruiter] Début du scroll pour charger tous les candidats...");

  await fastScrollToTop();
  await scrollToBottom();
  await fastScrollToTop();

  console.log("[LinkedIn Recruiter] Scroll terminé. Début du scraping...");

  const candidateLinks = getCandidateListLinks();
  console.log(`[LinkedIn Recruiter] ${candidateLinks.length} candidats détectés.`);

  for (let i = 0; i < candidateLinks.length; i++) {
    const link = candidateLinks[i];
    link.scrollIntoView({ behavior: "smooth", block: "center" });
    await delay(300);
    clickRandomSpotInside(link);

    try {
      await waitForProfileOpen();
      await scrapeLinkedInProfile();
    } catch (e) {
      console.warn(`[LinkedIn Recruiter] Erreur pour le candidat ${i + 1} :`, e);
    }

    await closeProfile();
    await delay(getRandomInRange(500, 3100));
  }

  console.log("[LinkedIn Recruiter] Scraping de la liste terminé.");
}

/**
 * Scrolle lentement jusqu'en bas de la page pour forcer le chargement dynamique.
 * @returns {Promise<void>}
 */
async function scrollToBottom() {
  return new Promise(resolve => {
    function performMiniScrolls(count, done) {
      let scrolled = 0;

      function miniScroll() {
        if (scrolled >= count) {
          done();
          return;
        }

        const amount = getRandomInRange(1, 15);
        window.scrollBy(0, amount);
        scrolled++;

        setTimeout(miniScroll, getRandomInRange(1, 2));
      }

      miniScroll();
    }

    function scrollLoop() {
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const windowHeight = window.innerHeight;

      if (scrollTop + windowHeight >= scrollHeight - 10) {
        resolve();
        return;
      }

      const miniScrollCount = getRandomInRange(130, 280);
      performMiniScrolls(miniScrollCount, () => {
        const pause = getRandomInRange(300, 1200);
        setTimeout(scrollLoop, pause);
      });
    }

    scrollLoop();
  });
}

/**
 * Scrolle instantanément en haut de la page.
 * @returns {Promise<void>}
 */
async function fastScrollToTop() {
  return new Promise(resolve => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setTimeout(resolve, 300);
  });
}

/**
 * Renvoie un nombre aléatoire dans une plage donnée.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function getRandomInRange(min = 300, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Extrait les liens vers les profils candidats dans la liste.
 * @returns {HTMLElement[]} - Tableau de liens.
 */
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
 * Attend que la navigation vers un profil soit complète.
 * @param {number} timeout - Temps maximum d'attente (ms).
 * @returns {Promise<void>}
 */
async function waitForProfileOpen(timeout = 10000) {
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
 * Ferme le profil LinkedIn ouvert, soit par clic extérieur soit via le bouton.
 * @returns {Promise<void>}
 */
async function closeProfile() {
  const useClickOutside = Math.random() < 0.5;

  if (useClickOutside) {
    const overlay = document.querySelector("base-slidein-container:not([data-test-base-slidein])");
    if (overlay) {
      clickRandomSpotInside(overlay);
      console.log("[LinkedIn Recruiter] Fermeture du profil via clic en dehors.");
      await delay(300);
      return;
    }
  }

  const closeBtn = document.querySelector("a[data-test-close-pagination-header-button]");
  if (closeBtn) {
    clickRandomSpotInside(closeBtn);
    console.log("[LinkedIn Recruiter] Fermeture du profil via bouton de fermeture.");
    await delay(300);
  }
}

/**
 * Simule un clic à un endroit aléatoire dans un élément.
 * @param {Element} element - Élément cible.
 */
function clickRandomSpotInside(element) {
  const rect = element.getBoundingClientRect();

  const x = rect.left + getRandomOffset(rect.width);
  const y = rect.top + getRandomOffset(rect.height);

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y
  };

  ["mousedown", "mouseup", "click"].forEach(type => {
    element.dispatchEvent(new MouseEvent(type, eventOpts));
  });
}

/**
 * Génère un décalage aléatoire avec biais vers des zones spécifiques.
 * @param {number} length - Longueur ou hauteur disponible.
 * @returns {number}
 */
function getRandomOffset(length) {
  const biasZones = [0.1, 0.5, 0.9];
  const bias = biasZones[Math.floor(Math.random() * biasZones.length)];
  const offset = length * bias;
  const variance = Math.random() * length * 0.05;
  return offset + variance;
}

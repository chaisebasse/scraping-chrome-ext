if (!window.linkedinScraperListenerRegistered) {
  window.linkedinScraperListenerRegistered = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runLinkedinScraper") {
      routeScraperBasedOnPage();
      sendResponse({ status: 'success' });
      return true;
    }
  });
}

function routeScraperBasedOnPage() {
  if (isOnLinkedInProfilePage()) {
    scrapeLinkedInProfile();
  } else if (isOnLinkedInListPage()) {
    scrapeListOfProfiles();
  } else {
    console.warn("[LinkedIn] Page non supportée pour le scraping.");
  }
}

// === Utilitaires pour attendre des éléments ===

/**
 * Crée un MutationObserver qui résout la promesse une fois que l’élément apparaît.
 * @param {string} selector - Sélecteur CSS de l’élément à attendre.
 * @param {Function} resolve - Fonction à appeler quand l’élément est trouvé.
 * @returns {MutationObserver}
 */
function createObserver(selector, resolve) {
  const observer = new MutationObserver(() => {
    const element = document.querySelector(selector);
    if (element) {
      observer.disconnect();
      resolve(element);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

/**
 * Vérifie si la page actuelle est une fiche candidat LinkedIn Recruiter.
 * @returns {boolean}
 */
function isOnLinkedInProfilePage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         location.href.includes("/manage/all/profile/");
}

function isOnLinkedInListPage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         !location.href.includes("/profile/");
}

/**
 * Pause asynchrone.
 * @param {number} ms - Durée en millisecondes.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === Scraping de données de profil LinkedIn ===

/**
 * Extrait les données de profil ainsi que les pièces jointes.
 * @returns {Promise<Object>}
 */
async function extractProfileDataWithAttachments() {
  const { firstName, lastName } = extractNameFromNoteButton();
  await openTab(document.querySelector('data-live-test-profile-index-tab'));
  await openTab(document.querySelector('data-live-test-profile-attachments-tab'));
  
  const email = document.querySelector("span[data-test-contact-email-address]")?.textContent.trim() || `${firstName}_${lastName}@linkedin.com`;
  const phone = document.querySelector("span[data-test-contact-phone][data-live-test-contact-phone]")?.textContent.trim() || null;
  const publicProfileUrl = document.querySelector("a[data-test-public-profile-link]")?.href || null;

  const scrapedData = {
    firstName,
    lastName,
    email,
    phone,
    publicProfileUrl,
    source: 'linkedin'
  };

  console.log("[LinkedIn Recruiter] Données extraites :", scrapedData);
  return scrapedData;
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
  const attachmentsTab = element;
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

function extractAttachmentCount(tabElement) {
  const labelText = tabElement?.querySelector('div')?.innerText?.trim() || '';
  const match = labelText.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function clickAttachmentsTab(tab, count) {
  const rDelay = getRandomInRange();
  console.log(`[LinkedIn Recruiter] ${count} pièce(s) jointe(s) détectée(s). Attente de ${rDelay}ms avant clic...`);
  await delay(rDelay);
  clickRandomSpotInside(tab);
  console.log("[LinkedIn Recruiter] Onglet pièces jointes cliqué.");
}

// === Communication avec le background ===

/**
 * Envoie les données extraites au script background pour insertion différée.
 * @param {Object} scrapedData
 */
function sendScrapedDataToBackground(scrapedData) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "send_candidate_data",
        scrapedData,
        deferInsert: true
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Message failed:", chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else if (response?.status === "success") {
          console.log("[content] Candidat envoyé avec succès :", response.message);
          resolve(response);
        } else {
          console.error("[content] Échec de l'envoi :", response?.message);
          reject(new Error(response?.message || "Unknown error"));
        }
      }
    );
  });
}

/**
 * Gère la réponse après l’envoi au background.
 * @param {Object} response
 */
function handleResponse(response) {
  if (chrome.runtime.lastError) {
    console.error("Message failed:", chrome.runtime.lastError.message);
  } else if (response.status === "success") {
    console.log("[content] Candidat envoyé avec succès : ", response.message);
  } else {
    console.error("[content] Échec de l'envoi :", response.message);
  }
}

// === Script principal ===

/**
 * Lance le scraping automatique si on est sur une fiche candidat.
 */
async function scrapeLinkedInProfile() {
  if (!isOnLinkedInProfilePage()) return;
  console.log("[LinkedIn Recruiter] Scraper lancé");

  const attachmentsTab = document.querySelector('[data-live-test-profile-attachments-tab]');
  if (!attachmentsTab) {
    console.warn("[LinkedIn Recruiter] Tab not found.");
    return;
  }
  
  try {
    const scrapedData = await extractProfileDataWithAttachments();
    scrapedData.attachmentCount = extractAttachmentCount(attachmentsTab);
    if (scrapedData.firstName && scrapedData.lastName) {
      return await sendScrapedDataToBackground(scrapedData);
    }
  } catch (error) {
    console.error("[LinkedIn Recruiter] Échec du scraping :", error.message || error);
  }

  return true;
}

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
    clickRandomSpotInside(link);

    try {
      await waitForProfileOpen();
      await waitForElement('[data-live-test-profile-attachments-tab]');
      await waitForElement('[data-live-test-row-lockup-full-name]');

      const result = await scrapeLinkedInProfile();
      if (result?.status === 'success') {
        console.log(`[LinkedIn Recruiter] Candidat ${i + 1} envoyé avec succès`);
      } else {
        console.warn(`[LinkedIn Recruiter] Candidat ${i + 1} non envoyé correctement`);
      }
      await closeProfile();

      console.log(`[LinkedIn Recruiter] Profil ${i + 1} traité.`);
    } catch (e) {
      console.warn(`[LinkedIn Recruiter] Erreur pour le candidat ${i + 1} :`, e);
    }

    await delay(getRandomInRange(500, 3100));
  }

  console.log("[LinkedIn Recruiter] Scraping de la liste terminé.");
}

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

function getRandomInRange(min=300, max=1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fastScrollToTop() {
  return new Promise(resolve => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setTimeout(resolve, 300);
  });
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

function getRandomOffset(length) {
  const biasZones = [0.1, 0.5, 0.9];
  const bias = biasZones[Math.floor(Math.random() * biasZones.length)];
  const fuzz = (Math.random() - 0.5) * 20; // ±10px
  return Math.max(1, Math.min(length - 1, length * bias + fuzz));
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const existingElements = document.querySelectorAll(selector);
    if (existingElements.length > 0) {
      return resolve(existingElements);
    }

    const observer = createObserver(selector, resolve);
    createTimeout(selector, timeout, observer, reject);
  });
}

function createObserver(selector, resolve) {
  const observer = new MutationObserver(() => {
    const element = document.querySelectorAll(selector);
    if (element) {
      observer.disconnect();
      resolve(element);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

function createTimeout(selector, timeout, observer, reject) {
  return setTimeout(() => {
    observer.disconnect();
    reject(new Error(`Timeout: Élément ${selector} introuvable`));
  }, timeout);
}
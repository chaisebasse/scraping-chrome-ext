if (!window.scraperListenerRegistered) {
  window.scraperListenerRegistered = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runLinkedinScraper") {
      document.addEventListener("DOMContentLoaded", () => {
        scrapeLinkedInProfile();
      });
      sendResponse({ status: 'ok' });
      return true; // Indique une réponse asynchrone
    }
  });
}

/**
 * Vérifie si la page actuelle est une page de profil LinkedIn Recruiter.
 * @returns {boolean} - Vrai si l'URL correspond à une page profil LinkedIn Recruiter.
 */
function isOnLinkedInProfilePage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         location.href.includes("/manage/all/profile/");
}

/**
 * Extrait les données du profil LinkedIn, y compris les pièces jointes.
 * Attend que les éléments nécessaires soient présents avant extraction.
 * @returns {Promise<Object>} - Objet contenant les données extraites (nom, email, téléphone, URL publique).
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
 * Extrait le prénom et le nom à partir du titre du bouton "Ajouter une note sur ...".
 * @returns {{firstName: string|null, lastName: string|null}} - Prénom et nom extraits.
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
 * Ouvre l'onglet "Pièces jointes" dans l'interface LinkedIn Recruiter
 * et attend que les pièces jointes soient chargées.
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

function extractAttachmentCount(tabElement) {
  const labelText = tabElement?.querySelector('div')?.innerText?.trim() || '';
  const match = labelText.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function clickAttachmentsTab(tab, count) {
  const rDelay = getRandomDelay();
  console.log(`[LinkedIn Recruiter] ${count} pièce(s) jointe(s) détectée(s). Attente de ${rDelay}ms avant clic...`);
  await delay(rDelay);
  tab.click();
  console.log("[LinkedIn Recruiter] Onglet pièces jointes cliqué.");
}

/**
 * Envoie les données extraites au background script de l'extension.
 * Gère la réponse et log les succès ou erreurs.
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
 * Fonction principale auto-exécutée qui lance le scraping si on est sur la bonne page.
 * Elle gère les erreurs et attend une seconde avant de terminer.
 */
(async function scrapeLinkedInProfile() {
  if (!isOnLinkedInProfilePage()) return;
  try {
    const scrapedData = await extractProfileDataWithAttachments();
    if (scrapedData.name && scrapedData.lastName) {
      sendScrapedDataToBackground(scrapedData);
    }
  } catch (error) {
    console.error("[LinkedIn Recruiter] Échec du scraping :", error);
  }
})();

/**
 * Crée un délai asynchrone basé sur un timeout en millisecondes.
 * @param {number} ms - Durée du délai en millisecondes.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(min = 0, max = 1000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
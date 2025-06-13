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
  await waitForRequiredProfileElements();

  const { firstName, lastName } = extractNameFromNoteButton();
  await openAttachmentsTab();

  const email = document.querySelector("span[data-test-contact-email-address]")?.textContent.trim() || null;
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
 * Attend que tous les éléments nécessaires au scraping soient chargés dans le DOM.
 * Utilise waitForElement pour chaque sélecteur clé.
 * @returns {Promise<void>}
 */
async function waitForRequiredProfileElements() {
  await Promise.all([
    waitForElement("span[data-test-contact-email-address]"),
    waitForElement("span[data-test-contact-phone][data-live-test-contact-phone]"),
    waitForElement("a[data-test-public-profile-link]"),
    waitForElement('button[title^="Ajouter une note sur"]')
  ]);
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
  await waitForElement('[data-test-navigation-list-item]');
  const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');
  attachmentsTab.click();
  console.log("[LinkedIn Recruiter] Onglet 'Pièces jointes' cliqué");

  await waitForElement("[data-test-previewable-attachment]");
  console.log("[LinkedIn Recruiter] Pièces jointes détectées");
}

/**
 * Envoie les données extraites au background script de l'extension.
 * Gère la réponse et log les succès ou erreurs.
 * @param {Object} scrapedData - Données extraites à envoyer.
 */
function sendScrapedDataToBackground(scrapedData) {
  console.log("Envoi des données...");

  chrome.runtime.sendMessage({
    action: "send_candidate_data",
    scrapedData,
    deferInsert: true
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Message failed:", chrome.runtime.lastError.message);
    } else if (response.status === "success") {
      console.log("[content] Candidat envoyé avec succès !");
    } else {
      console.error("[content] Échec de l'envoi :", response.message);
    }
  });
}

/**
 * Fonction principale auto-exécutée qui lance le scraping si on est sur la bonne page.
 * Elle gère les erreurs et attend une seconde avant de terminer.
 */
(async function scrapeLinkedInProfile() {
  if (!isOnLinkedInProfilePage()) return;
  console.log("[LinkedIn Recruiter] Scraper lancé");

  try {
    const scrapedData = await extractProfileDataWithAttachments();
    if (scrapedData.name && scrapedData.lastName) {
      sendScrapedDataToBackground(scrapedData);
    }
  } catch (error) {
    console.error("[LinkedIn Recruiter] Échec du scraping :", error);
  }

  console.log("Bien arrivé");
})();

/**
 * Attend l'apparition d'un élément dans le DOM correspondant au sélecteur donné.
 * Utilise un MutationObserver et un timeout par défaut de 20 secondes.
 * @param {string} selector - Sélecteur CSS de l'élément attendu.
 * @param {number} [timeout=20000] - Durée maximale d'attente en ms.
 * @returns {Promise<Element>} - Résout avec l'élément trouvé, rejette si timeout.
 */
function waitForElement(selector, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: Élément ${selector} introuvable`));
    }, timeout);
  });
}

/**
 * Crée un délai asynchrone basé sur un timeout en millisecondes.
 * @param {number} ms - Durée du délai en millisecondes.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function isOnLinkedInProfilePage() {
  return location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
         location.href.includes("/manage/all/profile/");
}

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

async function waitForRequiredProfileElements() {
  await Promise.all([
    waitForElement("span[data-test-contact-email-address]"),
    waitForElement("span[data-test-contact-phone][data-live-test-contact-phone]"),
    waitForElement("a[data-test-public-profile-link]"),
    waitForElement('button[title^="Ajouter une note sur"]')
  ]);
}

function extractNameFromNoteButton() {
  const noteButton = document.querySelector("#note-list-title + button[title^='Ajouter une note sur']");
  const title = noteButton?.getAttribute("title");
  const match = title?.match(/^Ajouter une note sur (.+)$/);
  if (!match) return { firstName: null, lastName: null };

  const [firstName, ...lastParts] = match[1].trim().split(" ");
  return { firstName, lastName: lastParts.join(" ") };
}

async function openAttachmentsTab() {
  await waitForElement('[data-test-navigation-list-item]');
  const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');
  attachmentsTab.click();
  console.log("[LinkedIn Recruiter] Onglet 'Pièces jointes' cliqué");

  await waitForElement("[data-test-previewable-attachment]");
  console.log("[LinkedIn Recruiter] Pièces jointes détectées");
}

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

  await delay(1000);
  console.log("Bien arrivé");
})();

// Attends l'apparition d'un élément DOM donné
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

// Délai simple basé sur des millisecondes
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
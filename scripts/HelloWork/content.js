/**
 * @fileoverview Content script for Hellowork.
 * Scrapes candidate data from profile and list pages, formatting it
 * consistently with other sources like LinkedIn.
 */

if (!window.hwScraperListenerRegistered) {
  window.hwScraperListenerRegistered = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runHwScraper") {
      console.log("[HelloWork] Received scraping request. Routing...");
      routeScraperBasedOnPage();
      sendResponse({ status: 'success', from: 'hellowork' });
      return true;
    }
  });
}

/**
 * Determines which scraping function to call based on the current page URL.
 */
function routeScraperBasedOnPage() {
  if (isOnHwProfilePage()) {
    scrapeHwProfile();
  } else if (isOnHwListPage()) {
    scrapeHwList();
  } else {
    console.warn("[HelloWork] Page non supportée pour le scraping.");
  }
}

// --- URL Checkers (You will need to implement the logic) ---

/**
 * Vérifie si la page actuelle est une fiche candidat Hellowork Recruiter.
 * @returns {boolean}
 */
function isOnHwProfilePage() {
  return location.href.startsWith("https://app-recruteur.hellowork.com/applicant/detail/");
}

function isOnHwListPage() {
  return location.href.startsWith("https://app-recruteur.hellowork.com/campaign/detail/") &&
         location.href.includes("&searchGuid=");
}

// --- Scraping Logic ---

async function scrapeHwProfile() {
  if (!isOnHwProfilePage()) return;
  console.log("[Hellowork] Scraper lancé");
  
  try {
    await awaitPdfViewerReady();
    const scrapedData = await formatScrapedData();
    console.log("[Hellowork] Données extraites :", scrapedData);
    if (scrapedData.firstName && scrapedData.lastName) {
      return sendScrapedDataToBackground(scrapedData);
    }
  } catch (error) {
    console.error("[Hellowork] Échec du scraping :", error.message || error);
  }

  return true;
}

async function scrapeHwList() {
  // TODO: Implement your logic for scraping a list of profiles.
  console.log("[HelloWork] List scraping not yet implemented.");
}

/**
 * Sends the consistently formatted data to the background script.
 * This message is generic and will be handled by the 'Insert' module.
 * @param {object} data - The scraped candidate data.
 */
function sendScrapedDataToBackground(data) {
  chrome.runtime.sendMessage({ action: "send_candidate_data", scrapedData: data });
}

async function formatScrapedData() {
  const { firstName, lastName } = await extractProfileName();
  console.error("name :", firstName, lastName);
  const { email, phone } = await extractProfileData();
  console.error("e and p :", email, phone);
  return { firstName, lastName, email, phone, source: 'hellowork', attachmentCount: 1 };
}

async function extractProfileName() {
  const timeout = 2000;
  const interval = 300;
  const start = Date.now();

  const nameRegex = /^(.+?)\s+(.+)\s+-/;

  while (true) {
    const title = document.title.trim();

    if (nameRegex.test(title)) {
      const namePart = title.split(' - ')[0].trim();
      const nameMatch = namePart.match(/^(.+?)\s+(.+)$/u);
      if (nameMatch) {
        return { firstName: nameMatch[1], lastName: nameMatch[2] };
      }
    }

    if (Date.now() - start > timeout) {
      throw new Error("Timeout: Le titre de la page n'a pas atteint le format attendu");
    }

    await delay(interval);
  }
}


async function extractProfileData() {
  await clickApplicantDetail("#contactEmail");
  const emailElement = await waitForElementInsideShadow('#tools > contact-workflow', '#emailToApplicant');
  const email = emailElement.getAttribute("to").trim() || "";

  await closeDetail();

  await clickApplicantDetail("hw-button#contactTel");
  const phoneElement = await waitForElement("tel-contact#telContact");
  const phone = normalizeFrenchNumber(
    phoneElement.getAttribute("tel").trim() || ""
  );

  return { email, phone };
}

async function clickApplicantDetail(id) {
  const button = await waitForElementInsideShadow('#tools > contact-workflow', `${id}`);

  clickRandomSpotInside(button);

  if (id === "contactEmail") {
    await waitForElementInsideShadow('#tools > contact-workflow', '#emailToApplicant');
  } else if (id === "contactTel") {
    await waitForElement('#telContact');
  }

  return true;
}

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

/**
 * Waits for the nested PDF viewer component to be fully rendered.
 * This ensures the page is ready before scraping begins.
 * @param {number} [timeout=5000] - Timeout for the entire check.
 */
async function awaitPdfViewerReady(timeout = 5000) {
  console.log("[Hellowork] Waiting for PDF viewer to be ready...");

  const docViewer = await waitForElement("#documentViewer", timeout);
  if (!docViewer.shadowRoot) throw new Error("documentViewer shadowRoot not found.");
  
  const pdfHost = await waitForElementInRoot(docViewer.shadowRoot, "div > hw-pdf-viewer", timeout);
  if (!pdfHost.shadowRoot) throw new Error("hw-pdf-viewer shadowRoot not found.");

  await waitForElementInRoot(pdfHost.shadowRoot, "#viewer", timeout);
  console.log("[Hellowork] PDF viewer is ready.");
}

function waitForElementInsideShadow(shadowHostSelector, innerSelector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const host = document.querySelector(shadowHostSelector);
    if (!host || !host.shadowRoot) return reject(new Error(`Shadow host not found: ${shadowHostSelector}`));
    resolve(waitForElementInRoot(host.shadowRoot, innerSelector, timeout));
  });
}

function waitForElementGone(selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(selector)) return resolve();
    // Note: We need a local createObserver here just for the checkGone functionality
    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element to be gone: ${selector}`));
    }, timeout);
  });
}

async function closeDetail() {
  const closeBtn = await waitForElementInsideShadow(
    "#tools > contact-workflow",
    "#emailToApplicant"
  ).then(el => el.shadowRoot.querySelector("#close"));
  
  clickRandomSpotInside(closeBtn);
  await waitForElementGone('#emailToApplicant');
}
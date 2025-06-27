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
  await waitForElement("title");
  const title = document.title;

  const namePart = title.split(' - ')[0].trim();

  const nameMatch = namePart.match(/^(.+?)\s+(.+)$/u);

  return { firstName, lastName } = nameMatch
    ? { firstName: nameMatch[1], lastName: nameMatch[2] }
    : { firstName: '', lastName: '' };
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

async function closeDetail() {
  const closeBtn = document
    .querySelector("#tools > contact-workflow")
    .shadowRoot.querySelector("#emailToApplicant")
    .shadowRoot.querySelector("#close");
  
  clickRandomSpotInside(closeBtn);

  await waitForElementGone('#emailToApplicant');
}

function clickRandomSpotInside(element) {
  rect = element.getBoundingClientRect();

  const x = rect.left + getRandomOffset(rect.width);
  const y = rect.top + getRandomOffset(rect.height);

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  };

  ["mousedown", "mouseup", "click"].forEach((type) => {
    element.dispatchEvent(new MouseEvent(type, eventOpts));
  });
}

function getRandomOffset(length) {
  const biasZones = [0.1, 0.5, 0.9];
  const bias = biasZones[Math.floor(Math.random() * biasZones.length)];
  const fuzz = (Math.random() - 0.5) * 20; // ±10px
  return Math.max(1, Math.min(length - 1, length * bias + fuzz));
}

function createObserver({ root, selector, resolve, reject, timeout, checkGone = false }) {
  let timeoutId;
  const observer = new MutationObserver(() => {
    const el = root.querySelector(selector);
    if ((checkGone && !el) || (!checkGone && el)) {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
      resolve(el);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  if (timeout) timeoutId = createTimeout(selector, timeout, observer, reject);
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    createObserver({ root: document.body, selector, resolve, reject, timeout });
  });
}

function waitForElementInsideShadow(shadowHostSelector, innerSelector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const host = document.querySelector(shadowHostSelector);
    if (!host || !host.shadowRoot) return reject(new Error(`Shadow host not found: ${shadowHostSelector}`));
    const el = host.shadowRoot.querySelector(innerSelector);
    if (el) return resolve(el);
    createObserver({ root: host.shadowRoot, selector: innerSelector, resolve, reject, timeout });
  });
}

function waitForElementGone(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(selector)) return resolve();
    createObserver({ root: document.body, selector, resolve, reject, timeout, checkGone: true });
  });
}

function createTimeout(selector, timeout, observer, reject) {
  return setTimeout(() => {
    observer.disconnect();
    reject(new Error(`Timeout: Élément ${selector} introuvable`));
  }, timeout);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
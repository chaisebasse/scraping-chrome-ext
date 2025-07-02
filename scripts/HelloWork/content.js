/**
 * @fileoverview Content script for Hellowork.
 * Scrapes candidate data from profile and list pages, formatting it
 * consistently with other sources like LinkedIn.
 */

if (!window.hwScraperListenerRegistered) {
  window.hwScraperListenerRegistered = true;

  checkAndContinueListScrape();

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
 * On every page load, checks if a list scrape is in progress and acts accordingly.
 * This is the core of the state management for list scraping.
 */
function checkAndContinueListScrape() {
  const state = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
  if (!state?.inProgress) return;

  if (isOnHwProfilePage()) {
    processProfilePageInListScrape(state);
  } else if (isOnHwListPage() && window.location.href === state.returnUrl) {
    sessionStorage.removeItem('hwListScrapeState');
  }
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
         location.href.includes("searchGuid=");
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
      await sendScrapedDataToBackground(scrapedData);
    }
  } catch (error) {
    console.error("[Hellowork] Échec du scraping :", error.message || error);
  }
}

/**
 * Initiates the scraping of a list of candidates.
 * It gathers all profile links, saves the state, and navigates to the first profile.
 */
async function scrapeHwList() {
  console.log('[HelloWork] Starting list scraping...');
  const candidateUrls = await scrollToBottomAndCollectLinks();
  if (candidateUrls.length === 0) {
    return console.warn('[HelloWork] No candidate links found on the list page.');
  }

  const state = {
    inProgress: true,
    urls: candidateUrls,
    currentIndex: 0,
    returnUrl: window.location.href
  };

  sessionStorage.setItem('hwListScrapeState', JSON.stringify(state));
  console.log(`[HelloWork] Stored state for ${state.urls.length} candidates. Navigating...`);
  window.location.href = state.urls[0];
}

/**
 * Scrolls down the list page to reveal all candidates and collects their profile URLs.
 * @returns {string[]} An array of URLs.
 */
async function scrollToBottomAndCollectLinks() {
  console.log("[HelloWork] Scrolling to collect all candidate links...");
  const allLinks = new Set();
  let lastLinkCount = -1;
  let idleCycles = 0;
  const maxIdleCycles = 5; // Stop after 5 cycles with no new links and no button click

  while (idleCycles < maxIdleCycles) {
    collectLinksFromVisibleCards(allLinks);

    // If we found new links, reset the idle counter
    if (allLinks.size > lastLinkCount) {
      idleCycles = 0;
      lastLinkCount = allLinks.size;
    } else {
      idleCycles++;
    }

    // Try to find and click the "show more" button
    const showMoreButton = getShowMoreButton();
    if (showMoreButton) {
      console.log("[HelloWork] 'Show more' button found. Clicking...");
      clickRandomSpotInside(showMoreButton);
      await delay(getRandomInRange(500, 1000)); // Wait for new candidates to load
      idleCycles = 0; // Reset idle counter after a successful click
      continue; // Restart the loop to collect new links
    }

    // If no button, scroll down
    window.scrollBy(0, window.innerHeight * 0.8);
    await delay(getRandomInRange(400, 800));

    // Check if we've reached the bottom of the scrollable area
    if ((window.innerHeight + window.scrollY) >= document.body.scrollHeight - 10) {
        console.log("[HelloWork] Reached bottom of the page.");
        break;
    }
  }

  collectLinksFromVisibleCards(allLinks); // One final collection pass
  console.log(`[HelloWork] Finished scrolling. Collected ${allLinks.size} unique links.`);
  return Array.from(allLinks);
}

function getShowMoreButton() {
  const resultList = document.querySelector("#result-list");
  if (!resultList?.shadowRoot) return null;
  return resultList.shadowRoot.querySelector("article > div.pagination > hw-button");
}

/**
 * Finds all visible candidate cards and extracts the profile link by traversing
 * from a stable anchor element within each card's shadow DOM.
 * @param {Set<string>} allLinks - A Set to which the found URLs will be added.
 */
function collectLinksFromVisibleCards(allLinks) {
  const resultList = document.querySelector("#result-list");
  if (!resultList?.shadowRoot) return;

  const cards = resultList.shadowRoot.querySelectorAll("article > div.result-items.virtualizer > applicant-card");
  for (const card of cards) {
    if (!card.shadowRoot) continue;
    const avatarDiv = card.shadowRoot.querySelector("#avatarCheckboxDiv");
    if (!avatarDiv) continue;

    for (let sibling = avatarDiv.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      const link = sibling.tagName === 'A' ? sibling : sibling.querySelector('a[href*="/applicant/detail/"]');
      if (link?.href) {
        allLinks.add(link.href);
        break;
      }
    }
  }
}

/**
 * Handles the scraping of a single profile page as part of a list scrape,
 * then navigates to the next profile or returns to the list.
 * @param {object} state - The current scraping state from sessionStorage.
 */
async function processProfilePageInListScrape(state) {
  await scrapeHwProfile();
  const nextIndex = state.currentIndex + 1;

  if (nextIndex < state.urls.length) {
    const newState = { ...state, currentIndex: nextIndex };
    sessionStorage.setItem('hwListScrapeState', JSON.stringify(newState));
    window.location.href = newState.urls[nextIndex];
  } else {
    window.location.href = state.returnUrl;
  }
}

/**
 * Sends the consistently formatted data to the background script.
 * This message is generic and will be handled by the 'Insert' module.
 * @param {object} data - The scraped candidate data.
 */
function sendScrapedDataToBackground(data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "send_candidate_data", scrapedData: data }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[HelloWork] Message to background failed:", chrome.runtime.lastError.message);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response?.status === "success") {
        console.log("[HelloWork] Background script confirmed data receipt.");
        resolve(response);
      } else {
        const errorMessage = response?.message || "Unknown error from background script.";
        console.error("[HelloWork] Background script reported an error:", errorMessage);
        reject(new Error(errorMessage));
      }
    });
  });
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

function getRandomInRange(min = 300, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
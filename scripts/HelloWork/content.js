/**
 * @fileoverview Content script for Hellowork.
 * Scrapes candidate data from profile and list pages, formatting it
 * consistently with other sources like LinkedIn.
 */

/**
 * Main initialization function for the Hellowork content script.
 * Sets up listeners and checks for ongoing scraping processes.
 */
function initializeHwContentScript() {
  window.hwScraperListenerRegistered = true;

  checkAndContinueListScrape();
  setupStopShortcutListener();
  setupMessageListener();
}

/**
 * Sets up a keyboard shortcut (Ctrl+Alt+S) to stop an ongoing list scrape.
 */
function setupStopShortcutListener() {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      stopScraping();
    }
  });
}

/**
 * Sets up a listener for messages from the extension popup (e.g., to start scraping).
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runHwScraper") {
      console.log("[HelloWork] Received scraping request. Routing...");
      routeScraperBasedOnPage();
      sendResponse({ status: 'success', from: 'hellowork' });
      return true;
    }
  });
}

if (!window.hwScraperListenerRegistered) {
  initializeHwContentScript();
}

/**
 * If on a profile page during a list scrape, continues the process.
 */
function handleProfilePageContinuation(state) {
  if (state.inProgress) {
    processProfilePageInListScrape();
  }
}

/**
 * If returning to the list page after a scrape, cleans up the state.
 */
function handleListPageReturn(state) {
  if (window.location.href === state.returnUrl) {
    console.log('[HelloWork] Returned to list page. Clearing scraping state.');
    sessionStorage.removeItem('hwListScrapeState');
  }
}

function checkAndContinueListScrape() {
  const state = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
  if (!state) return;

  if (isOnHwProfilePage()) handleProfilePageContinuation(state);
  else if (isOnHwListPage()) {
    handleListPageReturn(state);
  }
}

/**
 * Sets the scraping state to 'stopped' in sessionStorage.
 */
function stopScraping() {
  const state = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
  if (!state?.inProgress) return;

  console.log('[HelloWork] Stop command received. Halting scraping process.');
  state.inProgress = false;
  sessionStorage.setItem('hwListScrapeState', JSON.stringify(state));
  alert(`Le scraping de la liste Hellowork s'arrêtera après le candidat actuel.`);
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
 * Creates and stores the initial state for a list scrape in sessionStorage.
 */
function createAndStoreScrapeState(urls) {
  const state = {
    inProgress: true,
    urls: urls,
    currentIndex: 0,
    returnUrl: window.location.href
  };
  sessionStorage.setItem('hwListScrapeState', JSON.stringify(state));
  return state;
}

/**
 * Initiates the scraping of a list of candidates.
 * It gathers all profile links, saves the state, and navigates to the first profile.
 */
async function scrapeHwList() {
  console.log('[HelloWork] Starting list scraping...');
  await fastScrollToTop();
  const candidateUrls = await scrollToBottomAndCollectLinks();
  if (candidateUrls.length === 0) {
    return console.warn('[HelloWork] No candidate links found on the list page.');
  }

  const state = createAndStoreScrapeState(candidateUrls);
  console.log(`[HelloWork] Stored state for ${state.urls.length} candidates. Navigating...`);
  window.location.href = state.urls[0];
}

function getShowMoreButton() {
  const resultList = document.querySelector("#result-list");
  if (!resultList?.shadowRoot) return null;
  return resultList.shadowRoot.querySelector("article > div.pagination > hw-button");
}

/**
 * Tries to find and click the "Show More" button. Returns true if clicked.
 */
async function clickShowMoreButton() {
  const showMoreButton = getShowMoreButton();
  if (!showMoreButton) return false;

  console.log("[HelloWork] 'Afficher les candidats suivants' button found. Clicking...");
  clickRandomSpotInside(showMoreButton);
  await delay(getRandomInRange(500, 1000));
  return true;
}

async function fastScrollToTop() {
  return new Promise(resolve => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setTimeout(resolve, 300);
  });
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
 * Performs a series of small scrolls to simulate smooth, human-like scrolling.
 * @param {number} count - The number of small scrolls to perform.
 */
async function performMiniScrolls(count) {
    for (let i = 0; i < count; i++) {
        const scrollFraction = getRandomInRange(20, 30) / 100;
        window.scrollBy(0, window.innerHeight * scrollFraction);
        await delay(getRandomInRange(50, 150));
    }
}

/**
 * Performs a human-like scroll cycle and returns whether the bottom has been reached.
 * @returns {Promise<boolean>} - True if the bottom of the page is reached.
 */
async function performScroll() {
  const previousScrollY = window.scrollY;

  // Perform a burst of small, random scrolls to appear more human.
  // This will perform 3-7 small scrolls, each moving 5-20% of the screen,
  // resulting in a human-like scroll gesture.
  const miniScrollCount = getRandomInRange(3, 10);
  await performMiniScrolls(miniScrollCount);

  // A longer pause after the scroll burst, like a human reading.
  await delay(getRandomInRange(300, 1200));

  // Check if we are at the bottom.
  // The second condition handles cases where the scroll didn't move, meaning we're stuck at the bottom.
  const atBottom = isAtPageBottom() || window.scrollY === previousScrollY;
  if (atBottom) {
    console.log("[HelloWork] Reached bottom of the page.");
  }
  return atBottom;
}

/**
 * Gets the total number of candidates from the result list element's 'nbresult' attribute.
 * @returns {number|null} The total number of candidates, or null if not found or invalid.
 */
function getTotalCandidateCount() {
  const resultList = document.querySelector("applicant-result#result-list");
  if (!resultList || !resultList.hasAttribute("nbresult")) {
    console.warn("[HelloWork] Could not find the total number of candidates (nbresult attribute).");
    return null;
  }
  const count = parseInt(resultList.getAttribute("nbresult"), 10);
  if (isNaN(count)) {
    console.warn("[HelloWork] 'nbresult' attribute is not a valid number.");
    return null;
  }
  return count;
}

async function scrollToBottomAndCollectLinks() {
  console.log("[HelloWork] Scrolling to collect all candidate links...");
  const allLinks = new Set();
  const totalCandidates = getTotalCandidateCount();

  logTargetCount(totalCandidates);

  while (true) {
    if (hasCollectedAll(allLinks, totalCandidates)) {
      break;
    }
    
    const { shouldBreak } = await executeScrollCycle(allLinks);
    if (shouldBreak) break;
  }

  collectLinksFromVisibleCards(allLinks);
  logFinalCount(allLinks);
  return Array.from(allLinks);
}

function logTargetCount(total) {
  if (total !== null) {
    console.log(`[HelloWork] Target: ${total} candidates.`);
  }
}

function hasCollectedAll(allLinks, total) {
  if (total !== null && allLinks.size >= total) {
    console.log(
      `[HelloWork] Collected ${allLinks.size} links, meeting target of ${total}.`
    );
    return true;
  }
  return false;
}

function logFinalCount(allLinks) {
  console.log(
    `[HelloWork] Finished scrolling. Collected ${allLinks.size} unique links.`
  );
}

/**
 * Executes one cycle of the scroll loop: collects links, updates idle state,
 * and attempts to scroll or click "show more".
 * @returns {Promise<{shouldBreak: boolean, newIdleCycles: number}>}
 */
async function executeScrollCycle(allLinks) {
  collectLinksFromVisibleCards(allLinks);

  if (await clickShowMoreButton()) {
    return { shouldBreak: false };
  }

  if (await performScroll()) {
    return { shouldBreak: true };
  }

  return { shouldBreak: false };
}

/**
 * Finds the profile link within a single candidate card's shadow DOM.
 */
function findLinkInCard(card) {
  if (!card.shadowRoot) return null;
  const avatarDiv = card.shadowRoot.querySelector("#avatarCheckboxDiv");
  if (!avatarDiv) return null;

  for (let sibling = avatarDiv.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    const link = sibling.tagName === 'A' ? sibling : sibling.querySelector('a[href*="/applicant/detail/"]');
    if (link?.href) {
      return link.href;
    }
  }
  return null;
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
    const link = findLinkInCard(card);
    if (link) {
      // Normalize the URL by removing query parameters to prevent adding
      // the same profile multiple times due to different tracking IDs.
      const baseUrl = link.split('?')[0];
      allLinks.add(baseUrl);
    }
  }
}

/**
 * Checks if the scraping process was stopped by the user and navigates back if so.
 * @returns {boolean} - True if the process was stopped, otherwise false.
 */
function wasScrapingStopped(currentState) {
  if (currentState?.inProgress) return false;

  console.log('[HelloWork] Scraping was stopped by user. Returning to list page.');
  if (currentState.returnUrl) {
    window.location.href = currentState.returnUrl;
  }
  return true;
}

/**
 * Navigates back to the original list page when scraping is complete.
 */
function returnToListPage(state) {
  console.log('[HelloWork] List scraping complete. Returning to list page.');
  window.location.href = state.returnUrl;
}

async function processProfilePageInListScrape() {
  await scrapeHwProfile();

  const currentState = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
  if (wasScrapingStopped(currentState)) return;

  const nextIndex = currentState.currentIndex + 1;
  if (nextIndex < currentState.urls.length) {
    const newState = { ...currentState, currentIndex: nextIndex };
    sessionStorage.setItem('hwListScrapeState', JSON.stringify(newState));
    console.log(`[HelloWork] Navigating to next profile, index ${nextIndex}.`);
    window.location.href = newState.urls[nextIndex];
  } else {
    returnToListPage(currentState);
  }
}

/**
 * Handles the response from the background script after sending data.
 */
function handleBackgroundResponse(response, resolve, reject) {
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
}

function sendScrapedDataToBackground(data) {
  return new Promise((resolve, reject) => {
    const message = { action: "send_candidate_data", scrapedData: data };
    chrome.runtime.sendMessage(message, (response) => {
      handleBackgroundResponse(response, resolve, reject);
    });
  });
}

/**
 * Parses the first and last name from a formatted page title string.
 * e.g., "John DOE - Candidate" -> { firstName: "John", lastName: "DOE" }
 * @returns {{firstName: string, lastName: string}|null}
 */
function parseNameFromTitle(title) {
  const nameRegex = /^(.+?)\s+(.+)\s+-/;
  if (!nameRegex.test(title)) return null;

  const namePart = title.split(' - ')[0].trim();
  const nameMatch = namePart.match(/^(.+?)\s+(.+)$/u);
  if (nameMatch) {
    return { firstName: nameMatch[1], lastName: nameMatch[2] };
  }
  return null;
}

async function formatScrapedData() {
  const { firstName, lastName } = await extractProfileName();
  const { email, phone } = await extractProfileData();
  return { firstName, lastName, email, phone, source: 'hellowork', attachmentCount: 1 };
}

async function extractProfileName() {
  const timeout = 2000;
  const interval = 300;
  const start = Date.now();

  while (Date.now() - start <= timeout) {
    const name = parseNameFromTitle(document.title.trim());
    if (name) return name;
    await delay(interval);
  }

  throw new Error("Timeout: Le titre de la page n'a pas atteint le format attendu");
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function setupGoneObserver(root, selector, resolve, reject, timeout) {
  let timeoutId;
  const observer = new MutationObserver(() => {
    if (!root.querySelector(selector)) {
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve();
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  timeoutId = setTimeout(() => {
    observer.disconnect();
    reject(new Error(`Timeout waiting for element to be gone: ${selector}`));
  }, timeout);
}

function waitForElementGoneInRoot(root, selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    if (!root.querySelector(selector)) return resolve();
    setupGoneObserver(root, selector, resolve, reject, timeout);
  });
}

function waitForElementGone(selector, timeout = 2000) {
  return waitForElementGoneInRoot(document.body, selector, timeout);
}

async function closeDetail() {
  const contactWorkflow = await waitForElement("#tools > contact-workflow");
  if (!contactWorkflow.shadowRoot) throw new Error("contact-workflow shadowRoot not found.");

  const emailComponent = await waitForElementInRoot(contactWorkflow.shadowRoot, "#emailToApplicant");
  if (!emailComponent.shadowRoot) throw new Error("#emailToApplicant shadowRoot not found.");

  const closeBtn = emailComponent.shadowRoot.querySelector("#close");
  if (!closeBtn) throw new Error("Close button not found.");

  clickRandomSpotInside(closeBtn);
  await waitForElementGoneInRoot(contactWorkflow.shadowRoot, '#emailToApplicant');
}
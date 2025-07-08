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
  setupShortcutListeners();
  setupMessageListener();
}

/**
 * Sets up keyboard shortcuts (Ctrl+Alt+S to stop, Ctrl+Alt+P to pause/resume).
 */
function setupShortcutListeners() {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.altKey) {
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        updateScrapeState('stop');
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        updateScrapeState('togglePause');
      }
    }
  });
}

/**
 * Updates the scraping state in sessionStorage for pausing or stopping.
 * @param {'togglePause' | 'stop'} action - The action to perform.
 */
function updateScrapeState(action) {
  const state = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
  if (!state?.inProgress) return;

  if (action === 'togglePause') {
    state.isPaused = !state.isPaused;
    const message = state.isPaused ? 'Scraping PAUSED' : 'Scraping RESUMED';
    const color = state.isPaused ? 'orange' : 'green';
    console.log(`%c[HelloWork] ${message}. Press Ctrl+Alt+P to toggle.`, `color: ${color}; font-weight: bold;`);
    alert(`${message}. Press Ctrl+Alt+P to toggle.`);
  } else if (action === 'stop') {
    state.inProgress = false;
    console.log('[HelloWork] Stop command received. Halting scraping process.');
    alert(`Le scraping de la liste Hellowork s'arrêtera après le candidat actuel.`);
  }

  sessionStorage.setItem('hwListScrapeState', JSON.stringify(state));
}

/**
 * Sets up a listener for messages from the extension popup (e.g., to start scraping).
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runHwScraper") {
      console.log(`[HelloWork] Received scraping request with max candidates: ${message.maxCandidates}, source type: ${message.sourceType}. Routing...`);
      routeScraperBasedOnPage(message.maxCandidates, message.sourceType);
      sendResponse({ status: 'success', from: 'hellowork' });
      return true;
    } else if (message.action === 'login_required') {
      alert("Connexion à MeilleurPilotage requise. Veuillez vous connecter à MP puis relancer le scraper.");
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
async function handleListPageReturn(state) {
  // Compare URLs without query parameters for robustness.
  if (window.location.href.split('?')[0] === state.returnUrl.split('?')[0]) {
    // Check for a specific stop reason before clearing the state.
    if (state.stopReason === 'login_required') {
      try {
        // Wait for the main list component to be stable before showing the alert
        // to prevent it from disappearing during page load.
        await waitForElement(".filters.filters-columns.filters-min-width", 3000);
        await delay(1500);
        alert("Connexion à MeilleurPilotage requise. Le scraping de la liste a été arrêté.");
      } catch (e) {
        console.warn("[HelloWork] Could not show login alert because #result-list was not found.", e.message);
      }
    }
    console.log('[HelloWork] Returned to list page. Clearing scraping state.');
    sessionStorage.removeItem('hwListScrapeState');
  }
}

async function checkAndContinueListScrape() {
  const state = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
  if (!state) return;

  if (isOnHwProfilePage()) handleProfilePageContinuation(state);
  else if (isOnHwListPage()) {
    await handleListPageReturn(state);
  }
}

/**
 * Determines which scraping function to call based on the current page URL.
 */
function routeScraperBasedOnPage(maxCandidates, sourceType) {
  if (isOnHwProfilePage()) {
    scrapeHwProfile(sourceType);
  } else if (isOnHwListPage()) {
    scrapeHwList(maxCandidates, sourceType);
  } else {
    alert('[HelloWork] Page non supportée pour le scraping.');
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

async function scrapeHwProfile(sourceType) {
  if (!isOnHwProfilePage()) return;
  console.log("[Hellowork] Scraper lancé");

  // If part of a list scrape, get sourceType from state.
  // This handles page navigations during a list scrape.
  const state = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
  const finalSourceType = sourceType ?? state?.sourceType;

  try {
    await awaitPdfViewerReady();
    const scrapedData = await formatScrapedData(finalSourceType);
    console.log("[Hellowork] Données extraites :", scrapedData);
    if (scrapedData.firstName && scrapedData.lastName) {
      return await sendScrapedDataToBackground(scrapedData);
    }
    // If no data to send (e.g., missing name), consider it a success for list scraping purposes
    // to avoid breaking the loop on a single bad profile.
    return { status: 'success' };
  } catch (error) {
    console.error("[Hellowork] Échec du scraping :", error.message || error);
    return { status: 'error', message: error.message };
  }
}

/**
 * Creates and stores the initial state for a list scrape in sessionStorage.
 */
function createAndStoreScrapeState(urls, sourceType) {
  const state = {
    inProgress: true,
    isPaused: false,
    urls: urls,
    currentIndex: 0,
    returnUrl: window.location.href,
    sourceType: sourceType
  };
  sessionStorage.setItem('hwListScrapeState', JSON.stringify(state));
  return state;
}

/**
 * Initiates the scraping of a list of candidates.
 * It gathers all profile links, saves the state, and navigates to the first profile.
 */
async function scrapeHwList(maxCandidates = 50, sourceType = null) {
  console.log(`[HelloWork] Starting list scraping with a max of ${maxCandidates} candidates and source type '${sourceType || 'Non spécifié'}'...`);

  // 1. Find the shadowRoot where cards live. This is the key insight you provided!
  const resultList = document.querySelector("#result-list");
  const shadowRoot = resultList?.shadowRoot;
  const cardSelector = "article > div.result-items.virtualizer > applicant-card";

  // 2. Find visible cards within the shadowRoot.
  const visibleCards = shadowRoot ? getStrictlyVisibleElements(cardSelector, shadowRoot) : [];

  let candidateUrls;

  if (visibleCards.length > 0) {
    console.log(`[HelloWork] Found ${visibleCards.length} visible candidate(s). Starting scrape from current position.`);
    // scrollToBottomAndCollectLinks() starts from the current scroll position and proceeds downwards.
    // This correctly implements the desired behavior of starting from what the user sees.
    candidateUrls = await scrollToBottomAndCollectLinks(maxCandidates);
  } else {
    // No candidates in view, so do the normal routine.
    console.log('[HelloWork] No visible candidates. Starting from the top.');
    await fastScrollToTop();
    candidateUrls = await scrollToBottomAndCollectLinks(maxCandidates);
  }

  if (!candidateUrls || candidateUrls.length === 0) {
    return console.warn('[HelloWork] No candidate links found.');
  }

  // Apply the final limit to the collected URLs before saving the state.
  const limitedUrls = candidateUrls.slice(0, maxCandidates);
  const state = createAndStoreScrapeState(limitedUrls, sourceType);
  console.log(`[HelloWork] Stored state for ${state.urls.length} candidates. Navigating...`);
  window.location.href = state.urls[0];
}

function getShowMoreButton() {
  const resultList = document.querySelector("#result-list");
  if (!resultList?.shadowRoot) return null;
  return resultList.shadowRoot.querySelector("article > div.pagination > hw-button");
}

/**
 * Extracts links from a pre-filtered list of candidate cards.
 */
async function collectLinksFromCards(cards) {
  const urls = new Set();
  for (const card of cards) {
    const link = findLinkInCard(card);
    if (link) {
      const baseUrl = link.split('?')[0]; // Normalize URL
      urls.add(baseUrl);
    }
  }
  return Array.from(urls);
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

async function scrollToBottomAndCollectLinks(maxCandidates) {
  console.log("[HelloWork] Scrolling to collect all candidate links...");
  const allLinks = new Set();
  const totalCandidates = getTotalCandidateCount();

  logTargetCount(totalCandidates, maxCandidates);

  while (true) {
    // 1. Collect links from currently visible cards.
    // This is done on each iteration to capture newly loaded cards.
    getLinksFromVisibleCards().forEach(link => allLinks.add(link));

    // 2. Check if we have met the target or finished scrolling.
    if (hasCollectedAll(allLinks, totalCandidates, maxCandidates)) {
      break;
    }
    
    // 3. Try to load more content (scroll or click button).
    const { shouldBreak } = await executeScrollCycle();
    if (shouldBreak) break;
  }

  // A final collection to ensure no cards are missed after the last action.
  getLinksFromVisibleCards().forEach(link => allLinks.add(link));
  logFinalCount(allLinks);
  return Array.from(allLinks);
}

function logTargetCount(total, maxCandidates) {
  if (total !== null) {
    console.log(`[HelloWork] Page has ${total} candidates. User limit is ${maxCandidates}.`);
  } else {
    console.log(`[HelloWork] User limit is ${maxCandidates}.`);
  }
}

function hasCollectedAll(allLinks, total, maxCandidates) {
  if (allLinks.size >= maxCandidates) {
    console.log(
      `[HelloWork] Collected ${allLinks.size} links, reaching user limit of ${maxCandidates}.`
    );
    return true;
  }
  if (total !== null && allLinks.size >= total) {
    console.log(
      `[HelloWork] Collected ${allLinks.size} links, meeting page total of ${total}.`
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
async function executeScrollCycle() {
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
 * Finds all rendered candidate cards and extracts their profile links.
 * @returns {Set<string>} A Set containing the URLs of visible candidate profiles.
 */
function getLinksFromVisibleCards() {
  const urls = new Set();
  const resultList = document.querySelector("#result-list");
  if (!resultList?.shadowRoot) return urls;

  const cards = resultList.shadowRoot.querySelectorAll("article > div.result-items.virtualizer > applicant-card");
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    // A card is a candidate for scraping if its bottom edge is below the top of the viewport.
    // This correctly ignores cards that have been fully scrolled past.
    if (rect.bottom > 0) {
      const link = findLinkInCard(card);
      if (link) {
        const baseUrl = link.split('?')[0];
        urls.add(baseUrl);
      }
    }
  }
  return urls;
}

/**
 * Retrieves elements that are strictly visible within the viewport.
 * This function checks if an element is at least partially within the viewport's bounds.
 */
function getStrictlyVisibleElements(selector, root = document) {
  // Query within the provided root (e.g., a shadowRoot) instead of the whole document.
  const elements = Array.from(root.querySelectorAll(selector));
  return elements.filter(el => {
    const rect = el.getBoundingClientRect();
    return (rect.bottom > 0 && rect.top < window.innerHeight);
  });
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
  const result = await scrapeHwProfile();

  let currentState = JSON.parse(sessionStorage.getItem('hwListScrapeState'));

  // If login is required, we need to stop the whole process.
  if (result?.status === 'login_required') {
    console.log('[HelloWork] Login required, halting list scrape.');
    // By setting inProgress to false, the next check will stop everything.
    currentState.inProgress = false;
    currentState.stopReason = 'login_required';
    // We still need to save this state change.
    sessionStorage.setItem('hwListScrapeState', JSON.stringify(currentState));
  }

  if (wasScrapingStopped(currentState)) return;

  // Pause check loop
  while (currentState.isPaused) {
    console.log("[HelloWork] Scraping is paused. Checking again in 2 seconds...");
    await delay(2000);
    currentState = JSON.parse(sessionStorage.getItem('hwListScrapeState'));
    // Also check if it was stopped while paused
    if (wasScrapingStopped(currentState)) return;
  }

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
  if (response?.status === "success" || response?.status === "login_required") {
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

async function formatScrapedData(sourceType) {
  const { firstName, lastName } = await extractProfileName();
  const { email, phone } = await extractProfileData();
  return {
    firstName,
    lastName,
    email: email || `${firstName}_${lastName}@hellowork.com`,
    phone,
    source: 'hellowork',
    sourceType: sourceType,
    attachmentCount: 1,
    profileUrl: location.href
  };
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
  const email = (emailElement.getAttribute("to") || "").trim();
  await closeDetail();

  await clickApplicantDetail("hw-button#contactTel");
  const phoneElement = await waitForElement("tel-contact#telContact");
  const phone = normalizeFrenchNumber(
    (phoneElement.getAttribute("tel") || "").trim()
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
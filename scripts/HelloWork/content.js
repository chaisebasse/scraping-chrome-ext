/**
 * @fileoverview Script de contenu pour Hellowork.
 * Scrape les données des candidats depuis les pages de profil et de liste.
 */

/**
 * Fonction d'initialisation principale pour le script de contenu Hellowork.
 */
function initializeHwContentScript() {
  window.hwScraperListenerRegistered = true;

  checkAndContinueListScrape();
  setupShortcutListeners();
  setupMessageListener();
}

/**
 * Gère les événements de raccourcis clavier (Ctrl+Alt+S/P).
 * @param {KeyboardEvent} event The keyboard event.
 */
function handleShortcut(event) {
  if (event.ctrlKey && event.altKey) {
    const key = event.key.toLowerCase();
    if (key === 's' || key === 'p') {
      event.preventDefault();
      updateScrapeState(key === 's' ? 'stop' : 'togglePause');
    }
  }
}

/**
 * Met en place un écouteur pour les raccourcis clavier.
 */
function setupShortcutListeners() {
  document.addEventListener('keydown', handleShortcut);
}

/**
 * Récupère l'état actuel du scraping depuis sessionStorage.
 * @returns {object | null} L'objet d'état parsé ou null.
 */
function getScrapeState() {
  const stateString = sessionStorage.getItem('hwListScrapeState');
  if (!stateString) return null;
  try {
    return JSON.parse(stateString);
  } catch (e) {
    console.error("[HelloWork] Échec de l'analyse de l'état du scraping:", e);
    return null;
  }
}

/**
 * Sauvegarde l'état du scraping dans sessionStorage.
 * @param {object} state L'objet d'état à sauvegarder.
 */
function saveScrapeState(state) {
  sessionStorage.setItem('hwListScrapeState', JSON.stringify(state));
}

/**
 * Bascule l'état de pause du scraping et affiche une alerte.
 * @param {object} state L'état actuel du scraping.
 */
function togglePauseState(state) {
  state.isPaused = !state.isPaused;
  const message = state.isPaused ? 'Scraping en PAUSE' : 'Scraping REDÉMARRÉ';
  const color = state.isPaused ? 'orange' : 'green';
  console.log(`%c[HelloWork] ${message}. Cliquer Ctrl+Alt+P pour mettre en pause/continuer.`, `color: ${color}; font-weight: bold;`);
  alert(`${message}. Cliquer Ctrl+Alt+P pour mettre en pause/continuer.`);
}

/**
 * Arrête le processus de scraping et affiche une alerte.
 * @param {object} state L'état actuel du scraping.
 */
function stopScrapingState(state) {
  state.inProgress = false;
  console.log("[HelloWork] Commande d'arrêt reçue. Arrêt du processus de scraping.");
  alert(`Le scraping de la liste Hellowork s'arrêtera après le candidat actuel.`);
}

/**
 * Met à jour l'état du scraping dans sessionStorage pour la pause ou l'arrêt.
 * @param {'togglePause' | 'stop'} action - L'action à executr.
 */
function updateScrapeState(action) {
  const state = getScrapeState();
  if (!state?.inProgress) return;

  if (action === 'togglePause') {
    togglePauseState(state);
  } else if (action === 'stop') {
    stopScrapingState(state);
  }

  saveScrapeState(state);
}

/**
 * Gère la réception du message pour lancer le scraper.
 * @param {object} message Le message reçu de l'extension.
 * @param {function} sendResponse La fonction pour répondre à l'extension.
 * @returns {boolean} True pour indiquer une réponse asynchrone.
 */
function handleRunScraperMessage(message, sendResponse) {
  console.log(`[HelloWork] Received request: ${message.action}. Routing...`);
  routeScraperBasedOnPage(message.maxCandidates, message.sourceType);
  sendResponse({ status: 'success', from: 'hellowork' });
  return true;
}

/**
 * Affiche une alerte lorsque la connexion à MeilleurPilotage est requise.
 * @returns {boolean} True pour indiquer une réponse asynchrone.
 */
function handleLoginRequiredMessage() {
  alert("Connexion à MeilleurPilotage requise. Veuillez vous connecter à MP puis relancer le scraper.");
  return true;
}

/**
 * Met en place un écouteur pour les messages provenant de la popup de l'extension.
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
    if (message.action === "runHwScraper") return handleRunScraperMessage(message, sendResponse);
    if (message.action === 'login_required') return handleLoginRequiredMessage();
  });
}

/**
 * S'assure que le script de contenu est initialisé une seule fois.
 */
if (!window.hwScraperListenerRegistered) {
  initializeHwContentScript();
}

/**
 * Si sur une page de profil pendant un scraping de liste, continue le processus.
 * @param {object} state L'état actuel du scraping.
 */
function handleProfilePageContinuation(state) {
  if (state.inProgress) {
    processProfilePageInListScrape();
  }
}

/**
 * Affiche une alerte de connexion requise après avoir attendu que la page soit stable.
 */
async function showLoginAlertAfterWait() {
  try {
    // Attend qu'un élément clé soit stable avant d'afficher l'alerte.
    await waitForElement(".filters.filters-columns.filters-min-width", 3000);
    await delay(1500);
    alert("Connexion à MeilleurPilotage requise. Le scraping de la liste a été arrêté.");
  } catch (e) {
    console.warn("[HelloWork] Impossible d'afficher l'alerte de connexion:", e.message);
  }
}

/**
 * Si de retour sur la page de liste après un scraping, nettoie l'état.
 * @param {object} state L'état actuel du scraping.
 */
async function handleListPageReturn(state) {
  // Compare URLs sans paramètres de requête pour la robustesse.
  if (window.location.href.split('?')[0] === state.returnUrl.split('?')[0]) {
    if (state.stopReason === 'login_required') {
      await showLoginAlertAfterWait();
    }
    console.log("[HelloWork] Retour à la page de liste. Effacement de l'état de récupération.");
    sessionStorage.removeItem('hwListScrapeState');
  }
}

/**
 * Vérifie s'il y a un scraping de liste en cours et le continue si nécessaire.
 */
async function checkAndContinueListScrape() {
  const state = getScrapeState();
  if (!state) return;

  if (isOnHwProfilePage()) handleProfilePageContinuation(state);
  else if (isOnHwListPage()) {
    await handleListPageReturn(state);
  }
}

/**
 * Détermine le type de la page actuelle (profil, liste, ou non supportée).
 * @returns {string} Le type de page.
 */
function getPageType() {
  if (isOnHwProfilePage()) return 'profile';
  if (isOnHwListPage()) return 'list';
  return 'unsupported';
}

/**
 * Détermine quelle fonction de scraping appeler en fonction de l'URL de la page actuelle.
 * @param {number} maxCandidates Le nombre maximum de candidats à scraper.
 * @param {string} sourceType L'origine des candidats (annonce, chasse).
 */
function routeScraperBasedOnPage(maxCandidates, sourceType) {
  const pageType = getPageType();
  const scraperActions = {
    'profile': () => scrapeHwProfile(sourceType),
    'list': () => scrapeHwList(maxCandidates, sourceType),
  };

  if (scraperActions[pageType]) {
    scraperActions[pageType]();
  } else {
    alert('[HelloWork] Page non supportée pour le scraping.');
  }
}

/**
 * Vérifie si la page actuelle est une fiche candidat Hellowork Recruiter.
 * @returns {boolean}
 */
function isOnHwProfilePage() {
  return location.href.startsWith("https://app-recruteur.hellowork.com/applicant/detail/");
}

/**
 * Vérifie si la page actuelle est une page de liste de candidats Hellowork.
 * @returns {boolean}
 */
function isOnHwListPage() {
  return location.href.startsWith("https://app-recruteur.hellowork.com/campaign/detail/") &&
         location.href.includes("searchGuid=");
}

/**
 * Détermine le type de source pour un profil, en se basant sur l'état de scraping si disponible.
 * @param {string} initialSourceType Le type de source initial.
 * @returns {string} Le type de source final.
 */
function getSourceTypeForProfile(initialSourceType) {
  const state = getScrapeState();
  return initialSourceType ?? state?.sourceType;
}

/**
 * Extrait les données du profil, les formate et les envoie au background script.
 * @param {string} sourceType L'origine du candidat.
 * @returns {Promise<object>} La réponse du background script.
 */
async function scrapeAndSendData(sourceType) {
  try {
    await awaitPdfViewerReady();
    const scrapedData = await formatScrapedData(sourceType);
    console.log("[Hellowork] Données extraites :", scrapedData);

    if (scrapedData.firstName && scrapedData.lastName) {
      return await sendScrapedDataToBackground(scrapedData);
    }
    return { status: 'success' };
  } catch (error) {
    console.error("[Hellowork] Échec du scraping :", error.message || error);
    return { status: 'error', message: error.message };
  }
}

/**
 * Lance le scraping d'un profil Hellowork individuel.
 * @param {string} sourceType L'origine du candidat.
 */
async function scrapeHwProfile(sourceType) {
  if (!isOnHwProfilePage()) return;
  console.log("[Hellowork] Scraper lancé");

  const finalSourceType = getSourceTypeForProfile(sourceType);
  return await scrapeAndSendData(finalSourceType);
}

/**
 * Crée et stocke l'état initial pour un scraping de liste dans sessionStorage.
 * @param {string[]} urls La liste des URLs des profils à scraper.
 * @param {string} sourceType L'origine des candidats.
 * @returns {object} L'état de scraping créé.
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
  saveScrapeState(state);
  return state;
}

/**
 * Collecte les URLs des profils de candidats sur la page de liste en scrollant si nécessaire.
 * @param {number} maxCandidates Le nombre maximum de liens à collecter.
 * @returns {Promise<string[]>} Une liste d'URLs de profils.
 */
async function collectCandidateUrls(maxCandidates) {
  const resultList = document.querySelector("#result-list");
  const shadowRoot = resultList?.shadowRoot;
  const cardSelector = "article > div.result-items.virtualizer > applicant-card";

  const visibleCards = shadowRoot ? getStrictlyVisibleElements(cardSelector, shadowRoot) : [];

  if (visibleCards.length > 0) {
    console.log(`[HelloWork] ${visibleCards.length} candidats visibles trouvés. Départ à partir de la position actuelle.`);
    return await scrollToBottomAndCollectLinks(maxCandidates);
  } else {
    console.log('[HelloWork] Aucun candidat visible. Début par le haut.');
    await fastScrollToTop();
    return await scrollToBottomAndCollectLinks(maxCandidates);
  }
}

/**
 * Récupère le bouton "Afficher les candidats suivants" depuis le shadow DOM.
 * @returns {HTMLElement|null} Le bouton ou null s'il n'est pas trouvé.
 */
function getShowMoreButton() {
  const resultList = document.querySelector("#result-list");
  if (!resultList?.shadowRoot) return null;
  return resultList.shadowRoot.querySelector("article > div.pagination > hw-button");
}

/**
 * Tente de trouver et de cliquer sur le bouton "Afficher les candidats suivants".
 * @returns {Promise<boolean>} True si le bouton a été cliqué, sinon false.
 */
async function clickShowMoreButton() {
  const showMoreButton = getShowMoreButton();
  if (!showMoreButton) return false;

  console.log("[HelloWork] Bouton 'Afficher les candidats suivants' trouvé. En train de cliquer...");
  clickRandomSpotInside(showMoreButton);
  await delay(getRandomInRange(500, 1000));
  return true;
}

/**
 * Fait défiler la page rapidement vers le haut.
 */
async function fastScrollToTop() {
  return new Promise(resolve => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setTimeout(resolve, 300);
  });
}

/**
 * Vérifie si le défilement a atteint le bas de la page.
 * @returns {boolean}
 */
function isAtPageBottom() {
  const scrollHeight = document.documentElement.scrollHeight;
  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;
  return scrollTop + windowHeight >= scrollHeight - 10;
}

/**
 * Vérifie si le défilement est bloqué en bas de la page.
 * @param {number} previousScrollY La position de défilement verticale précédente.
 * @returns {boolean} True si le défilement est bloqué.
 */
function isStuckAtBottom(previousScrollY) {
  const atBottom = isAtPageBottom() || window.scrollY === previousScrollY;
  if (atBottom) {
    console.log("[HelloWork] Bas de la page atteint ou le défilement est bloqué.");
  }
  return atBottom;
}

/**
 * Initialise la navigation pour un scraping de liste en sauvegardant l'état et en allant vers la première URL.
 * @param {string[]} urls La liste des URLs des profils.
 * @param {string} sourceType L'origine des candidats.
 */
function initiateListScrapeNavigation(urls, sourceType) {
  if (!urls || urls.length === 0) {
    return console.warn('[HelloWork] Aucun lien candidat trouvé pour démarrer la navigation.');
  }
  const state = createAndStoreScrapeState(urls, sourceType);
  console.log(`[HelloWork] État stocké pour ${state.urls.length} candidats. Navigation...`);
  window.location.href = state.urls[0];
}

/**
 * Lance le scraping d'une liste de candidats.
 * Rassemble tous les liens de profils, sauvegarde l'état, et navigue vers le premier profil.
 * @param {number} [maxCandidates=50] Le nombre maximum de candidats à scraper.
 * @param {string|null} [sourceType=null] L'origine des candidats.
 */
async function scrapeHwList(maxCandidates = 50, sourceType = null) {
  console.log(`[HelloWork] Liste de départ avec un maximum de ${maxCandidates} candidats et type de source '${sourceType || 'Non spécifié'}'...`);
  const candidateUrls = await collectCandidateUrls(maxCandidates);
  initiateListScrapeNavigation(candidateUrls, sourceType);
}

/**
 * Effectue une série de petits défilements pour simuler un scroll fluide et humain.
 * @param {number} count Le nombre de petits défilements à effectuer.
 */
async function performMiniScrolls(count) {
  for (let i = 0; i < count; i++) {
    const scrollFraction = getRandomInRange(20, 30) / 100;
    window.scrollBy(0, window.innerHeight * scrollFraction);
    await delay(getRandomInRange(50, 150));
  }
}

/**
 * Effectue un cycle de défilement de type humain et retourne si le bas de la page a été atteint.
 * @returns {Promise<boolean>} True si le bas de la page est atteint.
 */
async function performScroll() {
  const previousScrollY = window.scrollY;
  const miniScrollCount = getRandomInRange(3, 10);
  await performMiniScrolls(miniScrollCount);

  // Une pause plus longue après la rafale de défilement, comme un humain qui lit.
  await delay(getRandomInRange(300, 1200));
  return isStuckAtBottom(previousScrollY);
}

/**
 * Récupère le nombre total de candidats à partir de l'attribut 'nbresult' de la liste de résultats.
 * @returns {number|null} Le nombre total de candidats, ou null si non trouvé ou invalide.
 */
function getTotalCandidateCount() {
  const resultList = document.querySelector("applicant-result#result-list");
  if (!resultList || !resultList.hasAttribute("nbresult")) {
    console.warn("[HelloWork] Impossible de trouver le nombre total de candidats (attribut nbresult).");
    return null;
  }
  const count = parseInt(resultList.getAttribute("nbresult"), 10);
  if (isNaN(count)) {
    console.warn("[HelloWork] L' attribut 'nbresult' n'est pas un nombre valide.");
    return null;
  }
  return count;
}

/**
 * Collecte les liens des fiches candidats actuellement visibles à l'écran.
 * @param {Set<string>} linkSet Le Set où ajouter les liens collectés.
 */
function collectVisibleLinks(linkSet) {
  getLinksFromVisibleCards().forEach(link => linkSet.add(link));
}

/**
 * Fait défiler la page jusqu'en bas pour collecter tous les liens de profils de candidats.
 * @param {number} maxCandidates Le nombre maximum de liens à collecter.
 */
async function scrollToBottomAndCollectLinks(maxCandidates) {
  console.log("[HelloWork] Défilement pour collecter tous les liens candidats...");
  const allLinks = new Set();
  const totalCandidates = getTotalCandidateCount();
  logTargetCount(totalCandidates, maxCandidates);
  let lastClickCount = 0; // Suivre quand nous avons cliqué sur "Afficher plus" pour la dernière fois.
  const clickThreshold = 15; // Cliquer tous les 15 nouveaux candidats.

  while (true) {
    collectVisibleLinks(allLinks);
    if (hasCollectedAll(allLinks, totalCandidates, maxCandidates)) {
      break;
    }

    const { shouldBreak, clicked } = await executeScrollCycle(allLinks, lastClickCount, clickThreshold);
    if (clicked) {
      lastClickCount = allLinks.size; // Mettre à jour le compteur au dernier clic.
    }
    if (shouldBreak) break;
  }

  const finalLinks = Array.from(allLinks).slice(0, maxCandidates);
  logFinalCount({ size: finalLinks.length });
  return finalLinks;
}

/**
 * Affiche dans la console le nombre de candidats ciblés.
 * @param {number|null} total Le nombre total de candidats sur la page.
 * @param {number} maxCandidates La limite définie par l'utilisateur.
 */
function logTargetCount(total, maxCandidates) {
  if (total !== null) {
    console.log(`[HelloWork] La page a ${total} candidats. La limite utilisateur est ${maxCandidates}.`);
  } else {
    console.log(`[HelloWork] La limite utilisateur est ${maxCandidates}.`);
  }
}

/**
 * Vérifie si la limite de candidats définie par l'utilisateur a été atteinte.
 * @param {Set<string>} links Le Set des liens collectés.
 * @param {number} max La limite maximale.
 */
function hasReachedUserLimit(links, max) {
  if (links.size >= max) {
    console.log(`[HelloWork] Collecté ${links.size} liens, atteinte de la limite utilisateur de ${max}.`);
    return true;
  }
  return false;
}

/**
 * Vérifie si le nombre total de candidats de la page a été atteint.
 * @param {Set<string>} links Le Set des liens collectés.
 * @param {number|null} total Le nombre total de candidats sur la page.
 */
function hasReachedPageTotal(links, total) {
  if (total !== null && links.size >= total) {
    console.log(`[HelloWork] Collecté ${links.size} liens, total de candidats sur la page de ${total}.`);
    return true;
  }
  return false;
}

/**
 * Vérifie si la collecte de liens doit s'arrêter.
 * @param {Set<string>} allLinks Le Set de tous les liens collectés.
 * @param {number|null} total Le nombre total de candidats sur la page.
 * @param {number} maxCandidates La limite définie par l'utilisateur.
 */
function hasCollectedAll(allLinks, total, maxCandidates) {
  return hasReachedUserLimit(allLinks, maxCandidates) || hasReachedPageTotal(allLinks, total);
}

/**
 * Affiche le décompte final des liens collectés dans la console.
 */
function logFinalCount(linksCollection) {
  console.log(
    `[HelloWork] Défilement terminé. ${linksCollection.size} liens uniques collectés..`
  );
}

/**
 * Exécute un cycle de la boucle de défilement/clic.
 * Priorise le clic sur "Afficher plus" tous les 15 candidats, sinon fait défiler.
 * @param {Set<string>} allLinks Le Set de tous les liens collectés.
 * @param {number} lastClickCount Le nombre de liens collectés lors du dernier clic.
 * @param {number} clickThreshold Le seuil pour déclencher un clic.
 */
async function executeScrollCycle(allLinks, lastClickCount, clickThreshold) {
  // Stratégie 1: Si nous avons collecté assez de nouveaux liens, cliquer sur "Afficher plus".
  if (allLinks.size > 0 && allLinks.size >= lastClickCount + clickThreshold) {
    const clicked = await clickShowMoreButton();
    if (clicked) {
      await delay(1000); // Attendre le chargement du nouveau contenu après le clic.
      return { shouldBreak: false, clicked: true };
    }
  }

  // Stratégie 2: Si aucun clic n'était nécessaire, faire défiler pour trouver plus de candidats.
  const isAtBottom = await performScroll();

  if (isAtBottom) {
    // Si en bas, notre seul espoir est de cliquer sur le bouton. Si impossible, c'est terminé.
    const clicked = await clickShowMoreButton();
    return { shouldBreak: !clicked, clicked: false };
  }

  // Si nous ne sommes pas en bas, nous pouvons continuer à faire défiler.
  return { shouldBreak: false, clicked: false };
}

/**
 * Trouve le lien du profil à l'intérieur du shadow DOM d'une fiche candidat.
 * @param {HTMLElement} card La fiche candidat.
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
 * Récupère toutes les fiches candidats depuis le shadow DOM de la liste de résultats.
 */
function getCandidateCardsFromShadowRoot() {
  const resultList = document.querySelector("#result-list");
  if (!resultList?.shadowRoot) return [];
  return resultList.shadowRoot.querySelectorAll("article > div.result-items.virtualizer > applicant-card");
}

/**
 * Vérifie si une fiche candidat est visible à l'écran.
 * @param {HTMLElement} card La fiche candidat.
 */
function isCardVisible(card) {
  const rect = card.getBoundingClientRect();
  // Une fiche est candidate au scraping si son bord inférieur est sous le haut de la fenêtre.
  return rect.bottom > 0;
}

/**
 * Trouve toutes les fiches candidats rendues et extrait les liens de leurs profils.
 * @returns {Set<string>} Un Set contenant les URLs des profils de candidats visibles.
 */
function getLinksFromVisibleCards() {
  const urls = new Set();
  const cards = getCandidateCardsFromShadowRoot();

  for (const card of cards) {
    if (isCardVisible(card)) {
      const link = findLinkInCard(card);
      if (link) {
        urls.add(link.split('?')[0]); // Normaliser l'URL
      }
    }
  }
  return urls;
}

/**
 * Récupère les éléments qui sont strictement visibles dans la fenêtre d'affichage.
 * Cette fonction vérifie si un élément est au moins partiellement dans les limites de la fenêtre.
 * @param {string} selector Le sélecteur CSS de l'élément cible.
 * @param {Document|ShadowRoot} [root=document] La racine DOM dans laquelle chercher.
 * @returns {Element[]} Un tableau des éléments visibles.
 */
function getStrictlyVisibleElements(selector, root = document) {
  const elements = Array.from(root.querySelectorAll(selector));
  return elements.filter(el => {
    const rect = el.getBoundingClientRect();
    return (rect.bottom > 0 && rect.top < window.innerHeight);
  });
}

/**
 * Vérifie si le processus de scraping a été arrêté par l'utilisateur et navigue en arrière si c'est le cas.
 * @param {object} currentState L'état actuel du scraping.
 * @returns {boolean} True si le processus a été arrêté, sinon false.
 */
function wasScrapingStopped(currentState) {
  if (currentState?.inProgress) return false;

  console.log("[HelloWork] Scraping a été arrêté par l'utilisateur. Retour à la page de liste de candidats.");
  if (currentState.returnUrl) {
    window.location.href = currentState.returnUrl;
  }
  return true;
}

/**
 * Gère le cas où une connexion est requise pendant un scraping de liste.
 * @param {object} state L'état actuel du scraping.
 */
function handleLoginRequiredInList(state) {
  console.log('[HelloWork] Connexion requise, arrêt du list scrape.');
  state.inProgress = false;
  state.stopReason = 'login_required';
  saveScrapeState(state);
}

/**
 * Attend que l'état de pause soit levé, en vérifiant périodiquement.
 * @param {object} initialState L'état initial lors de l'appel.
 * @returns {Promise<object|null>} L'état non-pausé, ou null si le scraping a été arrêté.
 */
async function waitForUnpause(initialState) {
  let currentState = initialState;
  while (currentState.isPaused) {
    console.log("[HelloWork] Scraping est en pause. Reprise dans 2 secondes...");
    await delay(2000);
    currentState = getScrapeState();
    if (wasScrapingStopped(currentState)) return null; // Signale que le processus a été arrêté
  }
  return currentState;
}

/**
 * Met à jour l'état et navigue vers le profil suivant dans la liste.
 * @param {object} state L'état actuel du scraping.
 */
function navigateToNextProfile(state) {
  const nextIndex = state.currentIndex + 1;
  const newState = { ...state, currentIndex: nextIndex };
  saveScrapeState(newState);
  console.log(`[HelloWork] Navigation vers le profil suivant, index ${nextIndex}.`);
  window.location.href = newState.urls[nextIndex];
}

/**
 * Gère la réponse du script d'arrière-plan après une tentative d'envoi de données.
 * @param {object} response - La réponse reçue.
 * @param {function} resolve - La fonction resolve de la promesse.
 * @param {function} reject - La fonction reject de la promesse.
 */
function handleBackgroundResponse(response, resolve, reject) {
  if (chrome.runtime.lastError) {
    console.error("[HelloWork] Envoi du message au background a échoué:", chrome.runtime.lastError.message);
    return reject(new Error(chrome.runtime.lastError.message));
  }

  if (response?.status === "success" || response?.status === "login_required") {
    console.log("[HelloWork] Background script a confirmé la réception des données.");
    resolve(response);
  } else {
    const errorMessage = response?.message || "Erreur inconnue du background script.";
    console.error("[HelloWork] Background script a signalé une erreur:", errorMessage);
    reject(new Error(errorMessage));
  }
}

/**
 * Envoie les données scrapées au background script.
 * @param {object} data Les données du candidat à envoyer.
 * @returns {Promise<object>} La réponse du background script.
 */
function sendScrapedDataToBackground(data) {
  return new Promise((resolve, reject) => {
    const message = { action: "send_candidate_data", scrapedData: data };
    chrome.runtime.sendMessage(message, (response) => {
      handleBackgroundResponse(response, resolve, reject);
    });
  });
}

/**
 * Analyse le prénom et le nom à partir du titre formaté de la page.
 * @param {string} title Le titre de la page.
 * @returns {{firstName: string, lastName: string}|null} Un objet avec le prénom et le nom, ou null.
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

/**
 * Formate les données extraites du profil dans un objet standardisé.
 * @param {string} sourceType L'origine du candidat.
 * @returns {Promise<object>} Un objet contenant les données formatées du candidat.
 */
async function formatScrapedData(sourceType) {
  const { firstName, lastName } = await extractProfileName();
  const { email, phone } = await extractProfileData();
  return {
    firstName,
    lastName,
    email: email || `@hellowork.com ${firstName}_${lastName}`,
    phone,
    source: 'hellowork',
    sourceType: sourceType,
    attachmentCount: 1,
    profileUrl: location.href
  };
}

/**
 * Extrait le nom et le prénom du profil en se basant sur le titre de la page.
 * @returns {Promise<{firstName: string, lastName: string}>}
 */
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

/**
 * Extrait l'email du candidat en interagissant avec l'interface.
 * @returns {Promise<string>} L'email extrait.
 */
async function extractEmail() {
  await clickApplicantDetail("#contactEmail");
  const emailElement = await waitForElementInsideShadow('#tools > contact-workflow', '#emailToApplicant');
  const email = (emailElement.getAttribute("to") || "").trim();
  await closeDetail();
  return email;
}

/**
 * Extrait le numéro de téléphone du candidat et le normalise.
 * @returns {Promise<string|null>} Le numéro de téléphone normalisé ou null.
 */
async function extractPhone() {
  await clickApplicantDetail("hw-button#contactTel");
  const phoneElement = await waitForElement("tel-contact#telContact");
  return normalizeFrenchNumber(
    (phoneElement.getAttribute("tel") || "").trim()
  );
}

/**
 * Extrait les données de contact (email et téléphone) du profil.
 * @returns {Promise<{email: string, phone: string|null}>}
 */
async function extractProfileData() {
  const email = await extractEmail();
  const phone = await extractPhone();
  return { email, phone };
}

/**
 * Navigue vers la page de liste d'origine une fois le scraping terminé.
 * @param {object} state L'état actuel du scraping.
 */
function returnToListPage(state) {
  console.log('[HelloWork] List scraping terminé. Retour à la page de liste de candidats.');
  window.location.href = state.returnUrl;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomInRange(min = 300, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Clique sur un bouton de détail du contact et attend que l'information apparaisse.
 * @param {string} id L'ID du bouton à cliquer.
 */
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

/**
 * Normalise un numéro de téléphone français.
 * @param {string} rawPhone Le numéro de téléphone brut.
 * @returns {string|null} Le numéro normalisé (ex: 0612345678) ou null si invalide.
 */
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
 * Gère le traitement d'une page de profil dans le cadre d'un scraping de liste.
 * Scrape les données, gère la pause/l'arrêt, et navigue vers le profil suivant ou retourne à la liste.
 */
async function processProfilePageInListScrape() {
  const result = await scrapeHwProfile();
  let currentState = getScrapeState();
  if (!currentState) return;
  if (result?.status === 'login_required') {
    handleLoginRequiredInList(currentState);
  }

  if (wasScrapingStopped(currentState)) return;
  const unpausedState = await waitForUnpause(currentState);
  if (!unpausedState) return;
  if (unpausedState.currentIndex + 1 < unpausedState.urls.length) {
    navigateToNextProfile(unpausedState);
  } else {
    returnToListPage(unpausedState);
  }
}

/**
 * Attend que le composant de visionneuse PDF soit entièrement rendu.
 * Cela garantit que la page est prête avant le début du scraping.
 * @param {number} [timeout=5000] Le temps d'attente maximum en millisecondes.
 */
async function awaitPdfViewerReady(timeout = 5000) {
  console.log("[Hellowork] Attente du viualisateur de PDF...");

  const docViewer = await waitForElement("#documentViewer", timeout);
  if (!docViewer.shadowRoot) throw new Error("documentViewer shadowRoot pas trouvé.");
  
  const pdfHost = await waitForElementInRoot(docViewer.shadowRoot, "div > hw-pdf-viewer", timeout);
  if (!pdfHost.shadowRoot) throw new Error("hw-pdf-viewer shadowRoot pas trouvé.");

  await waitForElementInRoot(pdfHost.shadowRoot, "#viewer", timeout);
  console.log("[Hellowork] Visualisateur de PDF prêt.");
}

/**
 * Attend qu'un élément apparaisse à l'intérieur d'un shadow DOM.
 * @param {string} shadowHostSelector Le sélecteur de l'hôte du shadow DOM.
 * @param {string} innerSelector Le sélecteur de l'élément à l'intérieur du shadow DOM.
 * @param {number} [timeout=2000] Le temps d'attente maximum.
 */
function waitForElementInsideShadow(shadowHostSelector, innerSelector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const host = document.querySelector(shadowHostSelector);
    if (!host || !host.shadowRoot) return reject(new Error(`Shadow host non trouvé: ${shadowHostSelector}`));
    resolve(waitForElementInRoot(host.shadowRoot, innerSelector, timeout));
  });
}

/**
 * Met en place un observateur pour détecter la disparition d'un élément.
 * @param {Node} root La racine où observer.
 * @param {string} selector Le sélecteur de l'élément.
 * @param {function} resolve La fonction de résolution de la promesse.
 * @param {function} reject La fonction de rejet de la promesse.
 */
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
    reject(new Error(`Timeout en attendant que l'élément disparaisse: ${selector}`));
  }, timeout);
}

/**
 * Attend que l'élément disparaisse d'une racine DOM spécifique (ex: shadowRoot).
 * @param {Node} root La racine où chercher.
 * @param {string} selector Le sélecteur de l'élément.
 */
function waitForElementGoneInRoot(root, selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    if (!root.querySelector(selector)) return resolve();
    setupGoneObserver(root, selector, resolve, reject, timeout);
  });
}

/**
 * Attend que l'élément disparaisse du document principal.
 * @param {string} selector Le sélecteur de l'élément.
 */
function waitForElementGone(selector, timeout = 2000) {
  return waitForElementGoneInRoot(document.body, selector, timeout);
}

/**
 * Gère la fermeture de la modale de contact après l'extraction des informations.
 */
async function closeDetail() {
  const contactWorkflow = await waitForElement("#tools > contact-workflow");
  if (!contactWorkflow.shadowRoot) throw new Error("contact-workflow shadowRoot pas trouvé.");

  const emailComponent = await waitForElementInRoot(contactWorkflow.shadowRoot, "#emailToApplicant");
  if (!emailComponent.shadowRoot) throw new Error("#emailToApplicant shadowRoot pas trouvé.");

  const closeBtn = emailComponent.shadowRoot.querySelector("#close");
  if (!closeBtn) throw new Error("Bouton fermeture pas trouvé.");

  clickRandomSpotInside(closeBtn);
  await waitForElementGoneInRoot(contactWorkflow.shadowRoot, '#emailToApplicant');
}
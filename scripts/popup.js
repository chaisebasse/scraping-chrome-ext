/**
 * @fileoverview Gère l'interface utilisateur de la popup de l'extension.
 * @description Ce script contrôle la navigation entre les pages de la popup,
 * la configuration des options de scraping (source, nombre de candidats),
 * la récupération des recherches associées depuis MP, et l'affichage des erreurs.
 */

document.addEventListener("DOMContentLoaded", () => {
  /**
   * @typedef {Object} ui Dictionnaire des éléments de l'interface utilisateur.
   */
  const ui = {
    mainPage: document.getElementById("mainPage"),
    choixRecherchePage: document.getElementById("choixRecherche"),
    errorsPage: document.getElementById("pageErreurs"),
    hwButton: document.getElementById("runHwBtn"),
    linkedInButton: document.getElementById("choixRecrBtn"),
    showErrorsBtn: document.getElementById("showErrorsBtn"),
    runWithJobIdBtn: document.getElementById("runWithJobIdBtn"),
    refreshJobIdsBtn: document.getElementById("refreshJobIdsBtn"),
    backBtn: document.getElementById("backBtn"),
    clearErrorsBtn: document.getElementById("clearErrorsBtn"),
    jobInput: document.getElementById("recrAssocInput"),
    jobDatalist: document.getElementById("recrAssocList"),
    maxCandidatesInput: document.getElementById("maxCandidatesInput"),
    maxCandidatesLabel: document.querySelector('label[for="maxCandidatesInput"]'),
    sourceAnnonceRadio: document.getElementById("sourceAnnonce"),
    sourceChasseRadio: document.getElementById("sourceChasse"),
    errorListDiv: document.getElementById("errorList"),
  };

  /**
   * @typedef {Object} state L'état interne de la popup.
   */
  const state = {
    jobLabelToIdMap: {},
    pendingScraperAction: null,
    maxCandidatesValueBeforeChange: null,
  };

  // === Initialisation de l'UI ===

  /**
   * Met à jour l'interface en fonction de l'URL de l'onglet actif.
   * Affiche les boutons pertinents (LinkedIn/Hellowork) et présélectionne le type de source.
   */
  async function updateUserInterface() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";

    const { hwButton, linkedInButton, sourceAnnonceRadio, sourceChasseRadio } = ui;

    hwButton.style.display = "none";
    linkedInButton.style.display = "none";
    sourceAnnonceRadio.checked = false;
    sourceChasseRadio.checked = false;

    if (url.includes("app-recruteur.hellowork.com")) {
      hwButton.style.display = "block";
      if (url.includes("campaign/detail") || url.includes("applicant/detail")) {
        sourceAnnonceRadio.checked = true;
      }
    } else if (url.includes("linkedin.com/talent/")) {
      linkedInButton.style.display = "block";
      if (url.includes("discover/applicants")) {
        sourceAnnonceRadio.checked = true;
      } else if (url.includes("manage/all")) {
        sourceChasseRadio.checked = true;
      }
    }
  }

  /**
   * Remplit la datalist des recherches associées avec les données stockées.
   * Présélectionne la dernière recherche utilisée.
   */
  async function populateJobDatalist() {
    const jobIds = await Storage.getJobIds();
    const lastSelectedId = await Storage.getLastSelectedJobId();

    ui.jobDatalist.innerHTML = "";
    state.jobLabelToIdMap = {};
    let lastSelectedLabel = "";

    jobIds.forEach(({ label, value }) => {
      const option = document.createElement("option");
      option.value = label;
      ui.jobDatalist.appendChild(option);
      state.jobLabelToIdMap[label] = value;

      if (value === lastSelectedId) {
        lastSelectedLabel = label;
      }
    });

    if (lastSelectedLabel) {
      ui.jobInput.value = lastSelectedLabel;
    }
  }

  // === Gestion du Stockage ===

  const Storage = {
    getJobIds: async () => (await chrome.storage.local.get("jobIds")).jobIds || [],
    saveJobIds: (jobIds) => chrome.storage.local.set({ jobIds }),
    getLastSelectedJobId: async () => (await chrome.storage.local.get("lastJobId")).lastJobId || "",
    setLastSelectedJobId: (jobId) => chrome.storage.local.set({ lastJobId: jobId }),
  };

  // === Initialisation ===
  updateUserInterface();
  populateJobDatalist();

  // === Gestion des Champs de Formulaire ===

  /**
   * Applique la logique de pas personnalisée pour LinkedIn (2, 25, 50, 75, 100).
   * @param {number} currentValue - La valeur avant le pas.
   * @param {'up' | 'down'} direction - La direction du pas.
   * @returns {number} La nouvelle valeur après application du pas personnalisé.
   */
  function getNewSteppedValue(currentValue, direction) {
    let newValue = currentValue;
    if (direction === 'up') {
      newValue = (currentValue === 2) ? 25 : currentValue + 25;
    } else {
      newValue = (currentValue === 25) ? 2 : currentValue - 25;
    }
    return Math.min(100, Math.max(2, newValue));
  }

  /**
   * Valide et bride la valeur de l'input du nombre maximum de candidats.
   */
  function handleMaxCandidatesChange() {
    const value = parseInt(ui.maxCandidatesInput.value, 10);
    const min = parseInt(ui.maxCandidatesInput.min, 10) || 2;
    if (value > 100) {
      alert("Le nombre maximum de candidats à scraper est de 100.");
      ui.maxCandidatesInput.value = 100;
    }
    if (value < min) {
      ui.maxCandidatesInput.value = min;
    }
  }

  /**
   * Capture la valeur de l'input avant un changement pour la logique de pas personnalisé.
   */
  function handleMaxCandidatesMouseDown() {
    if (ui.maxCandidatesInput.getAttribute('data-custom-step') === 'true') {
      state.maxCandidatesValueBeforeChange = parseInt(ui.maxCandidatesInput.value, 10);
    }
  }

  /**
   * Gère l'événement 'input' pour appliquer le pas personnalisé lors d'un clic sur les flèches.
   */
  function handleMaxCandidatesInput() {
    if (ui.maxCandidatesInput.getAttribute('data-custom-step') !== 'true' || state.maxCandidatesValueBeforeChange === null) {
      return;
    }

    const currentValue = parseInt(ui.maxCandidatesInput.value, 10);
    if (Math.abs(currentValue - state.maxCandidatesValueBeforeChange) === 1) {
      const direction = currentValue > state.maxCandidatesValueBeforeChange ? 'up' : 'down';
      ui.maxCandidatesInput.value = getNewSteppedValue(state.maxCandidatesValueBeforeChange, direction);
    }
    state.maxCandidatesValueBeforeChange = null;
  }

  /**
   * Gère les touches fléchées pour appliquer le pas personnalisé.
   * @param {KeyboardEvent} event - L'événement clavier.
   */
  function handleMaxCandidatesKeyDown(event) {
    if (ui.maxCandidatesInput.getAttribute('data-custom-step') !== 'true') {
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const currentValue = parseInt(ui.maxCandidatesInput.value, 10) || 2;
      const direction = event.key === 'ArrowUp' ? 'up' : 'down';
      ui.maxCandidatesInput.value = getNewSteppedValue(currentValue, direction);
    }
  }

  /**
   * Sauvegarde l'ID de la recherche associée sélectionnée lorsqu'elle change.
   */
  function handleJobIdInput() {
    const currentLabel = ui.jobInput.value;
    const selectedId = state.jobLabelToIdMap[currentLabel];
    if (selectedId) {
      Storage.setLastSelectedJobId(selectedId);
    }
  }

  /**
   * Attache les écouteurs d'événements aux champs du formulaire.
   */
  function setupFormListeners() {
    ui.maxCandidatesInput.addEventListener("change", handleMaxCandidatesChange);
    ui.maxCandidatesInput.addEventListener('mousedown', handleMaxCandidatesMouseDown);
    ui.maxCandidatesInput.addEventListener('input', handleMaxCandidatesInput);
    ui.maxCandidatesInput.addEventListener('keydown', handleMaxCandidatesKeyDown);
    ui.jobInput.addEventListener("input", handleJobIdInput);
  }

  setupFormListeners();

  // === Logique de Rafraîchissement des Recherches Associées ===

  /**
   * Trouve un onglet MP existant ou en crée un nouveau.
   * @param {string} targetUrl - L'URL du formulaire de création de candidat MP.
   * @returns {Promise<{tab: chrome.tabs.Tab, created: boolean}>} Un objet contenant l'onglet et un booléen indiquant s'il a été créé.
   */
  async function findOrCreateMpTab(targetUrl) {
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find(tab => tab.url && tab.url.includes(targetUrl));

    if (existingTab) {
      return { tab: existingTab, created: false };
    }

    const newTab = await chrome.tabs.create({ url: targetUrl, active: false });
    await waitForTabLoad(newTab.id);
    return { tab: newTab, created: true };
  }

  /**
   * Attend que le chargement d'un onglet soit terminé.
   * @param {number} tabId - L'ID de l'onglet à surveiller.
   */
  function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /**
   * Gère la réponse contenant les recherches associées.
   * @param {object} response - La réponse du content script.
   * @param {boolean} shouldCloseTab - Indique si l'onglet MP doit être fermé.
   * @param {number} tabId - L'ID de l'onglet MP.
   */
  async function handleJobIdResponse(response, shouldCloseTab, tabId) {
    if (chrome.runtime.lastError) {
      console.error("Erreur de communication avec l'onglet MP :", chrome.runtime.lastError.message);
      return;
    }

    if (response?.jobIds?.length) {
      await Storage.saveJobIds(response.jobIds);
      await populateJobDatalist();
      if (shouldCloseTab) {
        chrome.tabs.remove(tabId);
      }
    } else {
      alert("Aucune recherche associée active n'a été trouvée sur MeilleurPilotage.");
    }
  }

  /**
   * Gère le clic sur le bouton de rafraîchissement des recherches associées.
   */
  async function handleRefreshJobIdsClick() {
    const targetUrl = "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N";
    const { tab, created } = await findOrCreateMpTab(targetUrl);

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["scripts/MP/content.js"],
      });
      chrome.tabs.sendMessage(tab.id, { action: "get_job_ids" }, (response) => handleJobIdResponse(response, created, tab.id));
    } catch (err) {
      console.error("Erreur d'injection sur l'onglet MP :", err);
    }
  }

  ui.refreshJobIdsBtn.addEventListener("click", handleRefreshJobIdsClick);

  // === Logique de Lancement du Scraper ===

  /**
   * Récupère la configuration du scraper depuis l'UI.
   * @returns {{maxCandidates: number, sourceType: string|null}}
   */
  function getScraperConfig() {
    const maxCandidates = parseInt(ui.maxCandidatesInput.value, 10) || 50;
    const sourceType = document.querySelector('input[name="sourceType"]:checked')?.value || null;
    return { maxCandidates, sourceType };
  }

  /**
   * Recharge une page de profil Hellowork avant de scraper pour garantir un état propre.
   * @param {chrome.tabs.Tab} tab - L'onglet actif.
   */
  async function reloadHelloworkProfilePage(tab) {
    const isHelloworkProfile = tab.url?.includes("app-recruteur.hellowork.com/applicant/detail/");
    if (isHelloworkProfile) {
      console.log(`[Popup] Rechargement de l'onglet Hellowork ${tab.id} avant le scraping...`);
      chrome.tabs.reload(tab.id);
      await waitForTabLoad(tab.id);
      console.log(`[Popup] Onglet Hellowork ${tab.id} rechargé.`);
    }
  }

  /**
   * Injecte les scripts nécessaires et envoie le message pour démarrer le scraping.
   * @param {number} tabId - L'ID de l'onglet cible.
   * @param {object} action - L'objet d'action en attente.
   * @param {object} config - La configuration du scraper.
   */
  async function injectAndRunScraper(tabId, action, config) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          "scripts/common/domUtils.js",
          action.scriptPath,
        ],
      });

      chrome.tabs.sendMessage(tabId, { action: action.messageAction, ...config }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Erreur lors de l'envoi du message :", chrome.runtime.lastError.message);
        }
      });
    } catch (err) {
      console.error("Échec de l'injection du script :", err);
    }
  }

  /**
   * Gère le clic sur le bouton "Démarrer récolte données".
   * Orchestre le rechargement (si nécessaire), l'injection et le lancement du scraper.
   */
  async function handleRunScraperClick() {
    if (!state.pendingScraperAction) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const config = getScraperConfig();
    const isHelloworkScraper = state.pendingScraperAction.scriptPath.includes("HelloWork");

    if (isHelloworkScraper) {
      await reloadHelloworkProfilePage(tab);
    }

    await injectAndRunScraper(tab.id, state.pendingScraperAction, config);
  }

  ui.runWithJobIdBtn.addEventListener("click", handleRunScraperClick);

  // === Navigation & Configuration des Scrapers ===

  /**
   * Affiche la page de configuration du scraper, en masquant l'input du nombre max si sur une page de profil.
   * @param {boolean} isProfilePage - Vrai si l'onglet actif est une page de profil.
   */
  function showScraperOptions(isProfilePage) {
    ui.maxCandidatesInput.style.display = isProfilePage ? 'none' : 'block';
    ui.maxCandidatesLabel.style.display = isProfilePage ? 'none' : 'block';
    showPage(ui.choixRecherchePage, ui.mainPage);
  }

  /**
   * Configure les options du scraper pour une source spécifique (LinkedIn ou Hellowork).
   * @param {object} config - La configuration de la source.
   * @param {number} config.min - La valeur minimale pour maxCandidates.
   * @param {number} config.value - La valeur par défaut pour maxCandidates.
   * @param {boolean} config.customStep - Si le pas personnalisé doit être activé.
   */
  function configureScraperSource({ min, value, customStep }) {
    ui.maxCandidatesInput.min = min;
    ui.maxCandidatesInput.value = value;
    ui.maxCandidatesInput.setAttribute('data-custom-step', customStep.toString());
    ui.maxCandidatesInput.step = 1;
  }

  /**
   * Gère la sélection d'un type de scraper (LinkedIn ou Hellowork).
   * @param {object} action - L'action de scraping à mettre en attente.
   * @param {object} config - La configuration UI pour cette source.
   * @param {function(string): boolean} isProfilePageCheck - Une fonction pour vérifier si c'est une page de profil.
   */
  async function handleScraperSelection(action, config, isProfilePageCheck) {
    state.pendingScraperAction = action;
    configureScraperSource(config);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isProfilePage = isProfilePageCheck(tab?.url || "");
    showScraperOptions(isProfilePage);
  }

  /**
   * Attache les écouteurs aux boutons de sélection de scraper.
   */
  function setupScraperSelectionListeners() {
    ui.hwButton.addEventListener("click", () => {
      handleScraperSelection(
        { scriptPath: "scripts/HelloWork/content.js", messageAction: "runHwScraper" },
        { min: 2, value: 50, customStep: false },
        (url) => url.includes("app-recruteur.hellowork.com/applicant/detail/")
      );
    });

    ui.linkedInButton.addEventListener("click", () => {
      handleScraperSelection(
        { scriptPath: "scripts/LinkedIn/content.js", messageAction: "runLinkedinScraper" },
        { min: 2, value: 25, customStep: true },
        (url) => url.includes("/manage/all/profile/") || url.includes("/discover/applicants/profile/")
      );
    });
  }

  setupScraperSelectionListeners();

  // === Navigation entre les Pages de la Popup ===

  function showPage(pageToShow, pageToHide) {
    pageToHide.classList.remove("active");
    pageToShow.classList.add("active");
  }

  ui.showErrorsBtn.addEventListener("click", async () => {
    try {
      const errors = await chrome.runtime.sendMessage({ type: "getInsertionErrors" });
      showErrorsInPopup(errors || []);
    } catch (error) {
      console.warn("Aucune réponse du background:", error.message);
      showErrorsInPopup([]);
    }
    showPage(ui.errorsPage, ui.mainPage);
  });

  ui.backBtn.addEventListener("click", () => {
    showPage(ui.mainPage, ui.errorsPage);
  });

  ui.clearErrorsBtn.addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "clearInsertionErrors" });
      console.log("Erreurs effacées avec succès.");
      showErrorsInPopup([]);
    } catch (error) {
      console.error("Impossible d'effacer les erreurs:", error.message);
    }
  });

  // === Gestion de l'Affichage des Erreurs ===

  /**
   * Regroupe les erreurs par type (doublon, manquant, etc.).
   * @param {Array<object>} errors - La liste des erreurs brutes.
   * @returns {{duplicate: Array, mandatoryMissing: Array, optionalMissing: Array}}
   */
  function groupErrorsByType(errors) {
    const grouped = {
      duplicate: [],
      mandatoryMissing: [],
      optionalMissing: []
    };
    errors.forEach(err => grouped[err.type]?.push(err));
    return grouped;
  }

  /**
   * Crée un lien cliquable pour une erreur (profil ou onglet).
   * @param {string} text - Le texte du lien.
   * @param {function} onClick - La fonction à exécuter au clic.
   * @returns {HTMLAnchorElement}
   */
  function createErrorLink(text, onClick) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = text;
    link.className = "error-link";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
    });
    return link;
  }

  /**
   * Crée le contenu textuel d'un item d'erreur, y compris les liens.
   * @param {object} err - L'objet d'erreur.
   * @returns {HTMLSpanElement}
   */
  function createErrorContentSpan(err) {
    const { name, reason, profileUrl, source, tabId } = err;
    const contentSpan = document.createElement("span");
    contentSpan.className = "error-text";
    contentSpan.appendChild(document.createTextNode(`${name} - ${reason} (`));

    if (profileUrl && source) {
      contentSpan.appendChild(createErrorLink(`Voir profil ${source}`, () => chrome.tabs.create({ url: profileUrl })));
    }
    if (profileUrl && tabId) {
      contentSpan.appendChild(document.createTextNode(" / "));
    }
    if (tabId) {
      contentSpan.appendChild(createErrorLink("Aller à l'onglet", () => chrome.tabs.update(tabId, { active: true })));
    }

    contentSpan.appendChild(document.createTextNode(")"));
    return contentSpan;
  }

  /**
   * Crée les boutons d'action (supprimer, confirmer, annuler) pour une erreur.
   * @param {string} errorId - L'ID de l'erreur.
   * @returns {HTMLSpanElement}
   */
  function createErrorActionsSpan(errorId) {
    const actionsSpan = document.createElement('span');
    actionsSpan.className = 'error-actions';
    actionsSpan.innerHTML = `
      <span class="delete-initiate" title="Supprimer">&times;</span>
      <span class="delete-confirm" title="Confirmer" style="display: none;">&#10003;</span>
      <span class="delete-cancel" title="Annuler" style="display: none;">&times;</span>
    `;
    setupErrorDeletionListeners(actionsSpan, errorId);
    return actionsSpan;
  }

  /**
   * Attache les écouteurs d'événements pour la logique de suppression d'une erreur.
   * @param {HTMLSpanElement} actionsSpan - Le conteneur des boutons d'action.
   * @param {string} errorId - L'ID de l'erreur à supprimer.
   */
  function setupErrorDeletionListeners(actionsSpan, errorId) {
    const delInitiate = actionsSpan.querySelector('.delete-initiate');
    const delConfirm = actionsSpan.querySelector('.delete-confirm');
    const delCancel = actionsSpan.querySelector('.delete-cancel');

    delInitiate.addEventListener('click', () => {
      delInitiate.style.display = 'none';
      delConfirm.style.display = 'inline';
      delCancel.style.display = 'inline';
    });

    delCancel.addEventListener('click', () => {
      delInitiate.style.display = 'inline';
      delConfirm.style.display = 'none';
      delCancel.style.display = 'none';
    });

    delConfirm.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({ type: "removeSingleError", payload: { errorId } });
        const errors = await chrome.runtime.sendMessage({ type: "getInsertionErrors" });
        showErrorsInPopup(errors || []);
      } catch (error) {
        console.error("Erreur lors de la suppression de l'erreur :", error.message);
      }
    });
  }

  /**
   * Affiche la liste des erreurs dans la popup.
   * @param {Array<object>} errors - La liste des erreurs à afficher.
   */
  function showErrorsInPopup(errors) {
    ui.errorListDiv.innerHTML = "";
    if (!errors || errors.length === 0) return;

    const groupedErrors = groupErrorsByType(errors);

    Object.entries(groupedErrors).forEach(([type, list]) => {
      if (list.length === 0) return;

      const titleText = {
        duplicate: "Candidats déjà existants :",
        mandatoryMissing: "Données impératives manquantes :",
        optionalMissing: "Données facultatives manquantes :",
      }[type];

      const groupDiv = document.createElement("div");
      groupDiv.innerHTML = `<strong>${titleText}</strong><ul style="margin-top: 4px;"></ul>`;
      const ul = groupDiv.querySelector("ul");

      list.forEach(err => {
        const li = document.createElement("li");
        li.appendChild(createErrorContentSpan(err));
        li.appendChild(createErrorActionsSpan(err.id));
        ul.appendChild(li);
      });

      ui.errorListDiv.appendChild(groupDiv);
    });
  }
});
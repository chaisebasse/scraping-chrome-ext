// Attend que le DOM soit complètement chargé avant d'exécuter le script
document.addEventListener("DOMContentLoaded", () => {
    /**
   * Updates the visibility of buttons in the popup based on the current tab's URL.
   */
  async function updateUserInterface() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";

    // Get all buttons
    const mpButton = document.getElementById("runMPBtn");
    const hwButton = document.getElementById("runHwBtn");
    const linkedInButton = document.getElementById("choixRecrBtn");

    // Hide all by default
    mpButton.style.display = "none";
    hwButton.style.display = "none";
    linkedInButton.style.display = "none";

    // Show the relevant button
    if (url.includes("s-tom-1:90/MeilleurPilotage")) {
      mpButton.style.display = "block";
    } else if (url.includes("app-recruteur.hellowork.com")) {
      hwButton.style.display = "block";
    } else if (url.includes("linkedin.com/talent/")) {
      linkedInButton.style.display = "block";
    }
  }

  async function getStoredJobIds() {
    const result = await chrome.storage.local.get(["jobIds"]);
    return result.jobIds || [];
  }

  async function saveJobIds(jobIds) {
    await chrome.storage.local.set({ jobIds });
  }

  async function getLastSelectedJobId() {
    const result = await chrome.storage.local.get(["lastJobId"]);
    return result.lastJobId || "";
  }

  async function setLastSelectedJobId(jobId) {
    await chrome.storage.local.set({ lastJobId: jobId });
  }

  const jobInput = document.getElementById("recrAssocInput");
  const jobDatalist = document.getElementById("recrAssocList");
  let jobLabelToIdMap = {};

  async function populateJobDatalist() {
    const jobIds = await getStoredJobIds();
    const lastSelectedId = await getLastSelectedJobId();

    jobDatalist.innerHTML = "";
    jobLabelToIdMap = {};
    let lastSelectedLabel = "";

    jobIds.forEach(({ label, value }) => {
      const option = document.createElement("option");
      option.value = label;
      jobDatalist.appendChild(option);
      jobLabelToIdMap[label] = value;

      if (value === lastSelectedId) {
        lastSelectedLabel = label;
      }
    });

    if (lastSelectedLabel) {
      jobInput.value = lastSelectedLabel;
    }
  }

  updateUserInterface();
  populateJobDatalist();

  jobInput.addEventListener("input", () => {
    const currentLabel = jobInput.value;
    const selectedId = jobLabelToIdMap[currentLabel];
    if (selectedId) {
      setLastSelectedJobId(selectedId);
    }
  });

  const refreshJobIdsBtn = document.getElementById("refreshJobIdsBtn");

  refreshJobIdsBtn.addEventListener("click", async () => {
    const targetUrl = "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N";

    let targetTab;

    // 1. Try to find an open tab with the right URL
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && tab.url.includes(targetUrl)) {
        targetTab = tab;
        break;
      }
    }

    // 2. If not found, open a new one
    if (!targetTab) {
      targetTab = await chrome.tabs.create({ url: targetUrl, active: false });

      // Wait for the tab to load before injecting
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === targetTab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    // 3. Inject script and scrape
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        files: ["scripts/MP/jobScraper.js"],
      });

      chrome.tabs.sendMessage(targetTab.id, { action: "get_job_ids" }, async (response) => {
        if (chrome.runtime.lastError) {
          console.error("Erreur:", chrome.runtime.lastError.message);
          return;
        }

        if (response?.jobIds?.length) {
          await saveJobIds(response.jobIds);
          await populateJobDatalist();

          // 4. Optional: close tab if we opened it
          if (targetTab.url !== tabs.find(t => t.id === targetTab.id)?.url) {
            chrome.tabs.remove(targetTab.id);
          }
        } else {
          alert("Aucune recherche trouvée.");
        }
      });
    } catch (err) {
      console.error("Erreur d'injection sur l'onglet MP :", err);
    }
  });

  // Récupération des éléments HTML de l'interface : champ de saisie et bouton d'exécution
  const runMPButton = document.getElementById("runMPBtn");
  const runHwButton = document.getElementById("runHwBtn");
  const choixRecrBtn = document.getElementById("choixRecrBtn");
  const runWithJobIdBtn = document.getElementById("runWithJobIdBtn");
  const choixRecherche = document.getElementById("choixRecherche");

  // Variable pour stocker l'action de scraping en attente après le choix du Job ID
  let pendingScraperAction = null;

  // Lors du clic sur le bouton, on déclenche l'injection du script + le scraping
  function injectAndSend(scriptPath, messageAction) {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab?.id) return;
 
      const isHelloworkScraper = scriptPath.startsWith("scripts/HelloWork/");
      // Only reload if starting a scrape from a single candidate's detail page.
      // This avoids reloading the list page unnecessarily.
      const isHelloworkProfileUrl = tab.url && tab.url.includes("app-recruteur.hellowork.com/applicant/detail/");
 
      try {
        if (isHelloworkScraper && isHelloworkProfileUrl) {
          console.log(`[Popup] Reloading Hellowork tab ${tab.id} before scraping...`);
          // 1. Reload the current tab
          chrome.tabs.reload(tab.id);

          // 2. Wait for the tab to finish loading after reload
          await new Promise((resolve) => {
            const listener = (tabId, changeInfo) => {
              if (tabId === tab.id && changeInfo.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                console.log(`[Popup] Hellowork tab ${tab.id} reloaded. Proceeding with script injection.`);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });
        }

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [
            "scripts/common/domUtils.js", // Inject the helpers first
            scriptPath
          ],
        });

        chrome.tabs.sendMessage(tab.id, { action: messageAction }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Erreur lors de l'envoi du message :", chrome.runtime.lastError.message);
          }
        });
      } catch (err) {
        console.error("Échec de l'injection du script :", err);
      }
    });
  }

  // Bouton pour MP
  runMPButton.addEventListener("click", () => {
    injectAndSend("scripts/MP/content.js", "runMPScraper");
  });

  // Bouton pour Hellowork - Affiche la page de sélection du Job ID
  runHwButton.addEventListener("click", () => {
    pendingScraperAction = {
      scriptPath: "scripts/HelloWork/content.js",
      messageAction: "runHwScraper"
    };
    showPage(choixRecherche, mainPage);
  });

  // Bouton pour LinkedIn - Affiche la page de sélection du Job ID
  choixRecrBtn.addEventListener("click", () => {
    pendingScraperAction = {
      scriptPath: "scripts/LinkedIn/content.js",
      messageAction: "runLinkedinScraper"
    };
    showPage(choixRecherche, mainPage);
  });

  // Bouton pour démarrer le scraping (LinkedIn ou Hellowork) après le choix
  runWithJobIdBtn.addEventListener("click", () => {
    if (pendingScraperAction) {
      injectAndSend(pendingScraperAction.scriptPath, pendingScraperAction.messageAction);
    }
  });

  const mainPage = document.getElementById("mainPage");
  const errorPage = document.getElementById("pageErreurs");
  const showErrorsBtn = document.getElementById("showErrorsBtn");
  const backBtn = document.getElementById("backBtn");
  const clearErrorsBtn = document.getElementById("clearErrorsBtn");
  
  function showPage(pageToShow, pageToHide) {
    pageToHide.classList.remove("active");
    pageToShow.classList.add("active");
  }

  showErrorsBtn.addEventListener("click", async () => {
    try {
      const errors = await chrome.runtime.sendMessage({ type: "getInsertionErrors" });
      showErrorsInPopup(errors || []);
    } catch (error) {
      console.warn("No response from background:", error.message);
      showErrorsInPopup([]);
    }
    showPage(errorPage, mainPage);
  });

  backBtn.addEventListener("click", () => {
    showPage(mainPage, errorPage);
  });

  clearErrorsBtn.addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "clearInsertionErrors" });
      console.log("Errors cleared.");
      showErrorsInPopup([]);
    } catch (error) {
      console.error("Could not clear errors:", error.message);
    }
  });

  function showErrorsInPopup(errors) {
    const errorList = document.getElementById("errorList");
    errorList.innerHTML = "";

    if (!errors) return;

    const grouped = {
      duplicate: [],
      mandatoryMissing: [],
      optionalMissing: []
    };

    for (const err of errors) {
      grouped[err.type].push(err);
    }

    for (const [type, list] of Object.entries(grouped)) {
      if (list.length === 0) continue;

      const title = {
        duplicate: "Candidats déjà existants :",
        mandatoryMissing: "Données impératives manquantes :",
        optionalMissing: "Données facultatives manquantes :"
      }[type];

      const groupDiv = document.createElement("div");
      groupDiv.innerHTML = `<strong>${title}</strong><ul style="margin-top: 4px;"></ul>`;
      const ul = groupDiv.querySelector("ul");

      for (const err of list) {
        const { id, name, reason, profileUrl, source, tabId } = err;

        const li = document.createElement("li");
        const contentSpan = document.createElement("span");
        contentSpan.className = "error-text";

        contentSpan.appendChild(document.createTextNode(`${name} - ${reason} (`));

        // 1. Create link to the candidate's profile
        if (profileUrl && source) {
          const profileLink = document.createElement("a");
          profileLink.href = "#"; // Use JS for navigation
          profileLink.textContent = `Voir profil ${source}`;
          profileLink.className = "error-link";
          profileLink.addEventListener("click", (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: profileUrl, active: true });
          });
          contentSpan.appendChild(profileLink);
        }

        // Add a separator if both links are present
        if (profileUrl && tabId) {
          contentSpan.appendChild(document.createTextNode(" / "));
        }

        // 2. Create link to switch to the form tab
        if (tabId) {
          const tabLink = document.createElement("a");
          tabLink.href = "#"; // Use JS for navigation
          tabLink.textContent = "Aller à l'onglet";
          tabLink.className = "error-link";
          tabLink.addEventListener("click", (e) => {
            e.preventDefault();
            chrome.tabs.update(tabId, { active: true });
            chrome.tabs.get(tabId, (tab) => {
              if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true });
            });
          });
          contentSpan.appendChild(tabLink);
        }

        contentSpan.appendChild(document.createTextNode(")"));
        li.appendChild(contentSpan);

        // 3. Create the action buttons for deletion
        const actionsSpan = document.createElement('span');
        actionsSpan.className = 'error-actions';
        actionsSpan.innerHTML = `
          <span class="delete-initiate" title="Supprimer">&times;</span>
          <span class="delete-confirm" title="Confirmer" style="display: none;">&#10003;</span>
          <span class="delete-cancel" title="Annuler" style="display: none;">&times;</span>
        `;

        const deleteInitiate = actionsSpan.querySelector('.delete-initiate');
        const deleteConfirm = actionsSpan.querySelector('.delete-confirm');
        const deleteCancel = actionsSpan.querySelector('.delete-cancel');

        deleteInitiate.addEventListener('click', () => {
          deleteInitiate.style.display = 'none';
          deleteConfirm.style.display = 'inline';
          deleteCancel.style.display = 'inline';
        });

        deleteCancel.addEventListener('click', () => {
          deleteInitiate.style.display = 'inline';
          deleteConfirm.style.display = 'none';
          deleteCancel.style.display = 'none';
        });

        deleteConfirm.addEventListener('click', async () => {
          deleteConfirm.style.pointerEvents = 'none';
          deleteCancel.style.pointerEvents = 'none';

          try {
            const response = await chrome.runtime.sendMessage({ type: "removeSingleError", payload: { errorId: id } });
            if (response?.status === 'success') {
              const errors = await chrome.runtime.sendMessage({ type: "getInsertionErrors" });
              showErrorsInPopup(errors || []);
            }
          } catch (error) {
            console.error("Error removing single error:", error.message);
            deleteConfirm.style.pointerEvents = 'auto';
            deleteCancel.style.pointerEvents = 'auto';
          }
        });

        li.appendChild(actionsSpan);
        ul.appendChild(li);
      }

      errorList.appendChild(groupDiv);
    }
  }
});
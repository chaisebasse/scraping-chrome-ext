// Attend que le DOM soit complètement chargé avant d'exécuter le script
document.addEventListener("DOMContentLoaded", () => {
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

  const jobSelect = document.getElementById("recrAssoc");

  async function populateJobSelect() {
    const jobIds = await getStoredJobIds();
    const lastSelected = await getLastSelectedJobId();

    jobSelect.innerHTML = "";

    jobIds.forEach(({ label, value }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (value === lastSelected) {
        option.selected = true;
      }
      jobSelect.appendChild(option);
    });
  }

  populateJobSelect();
  jobSelect.addEventListener("change", () => {
    setLastSelectedJobId(jobSelect.value);
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
          await populateJobSelect();

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
  const runMPButton = document.getElementById("runBtn");
  const choixRecrBtn = document.getElementById("choixRecrBtn");
  const runLinkedInButton = document.getElementById("runLinkedInBtn");
  const choixRecherche = document.getElementById("choixRecherche");

  // Lors du clic sur le bouton, on déclenche l'injection du script + le scraping
  function injectAndSend(scriptPath, messageAction) {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab?.id) return;

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [scriptPath],
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
    injectAndSend("scripts/MP/content.js", "runScraper");
  });

  // Bouton pour LinkedIn
  runLinkedInButton.addEventListener("click", () => {
    injectAndSend("scripts/Linkedin/content.js", "runLinkedinScraper");
  });

  choixRecrBtn.addEventListener("click", () => {
    showPage(choixRecherche, mainPage);
  });

  const mainPage = document.getElementById("mainPage");
  const errorPage = document.getElementById("errorPage");
  const showErrorsBtn = document.getElementById("showErrorsBtn");
  const backBtn = document.getElementById("backBtn");
  
  function showPage(pageToShow, pageToHide) {
    pageToHide.classList.remove("active");
    pageToShow.classList.add("active");
  }

  showErrorsBtn.addEventListener("click", () => {
    showPage(errorPage, mainPage);
  });

  backBtn.addEventListener("click", () => {
    showPage(mainPage, errorPage);
  });
});
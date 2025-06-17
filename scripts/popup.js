// Attend que le DOM soit complètement chargé avant d'exécuter le script
document.addEventListener("DOMContentLoaded", () => {
  const runMPButton = document.getElementById("runBtn");
  const runLinkedInButton = document.getElementById("runLinkedInBtn");
  
  // Fonction générique pour injecter un script et envoyer un message
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

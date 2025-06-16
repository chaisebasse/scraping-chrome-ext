// Attend que le DOM soit complètement chargé avant d'exécuter le script
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("indexInput");
  const runMPButton = document.getElementById("runBtn");
  const runLinkedInButton = document.getElementById("runLinkedInBtn");

  // Chargement de l'index sauvegardé dans le stockage Chrome (si existant)
  chrome.storage.sync.get("idIndex", (data) => {
    if (typeof data.idIndex === "number") {
      input.value = data.idIndex;
    }
  });

  // Sauvegarde automatique de l'index dès que l'utilisateur modifie la saisie
  input.addEventListener("input", () => {
    const index = parseInt(input.value, 10);
    if (!isNaN(index)) {
      console.log("Sauvegarde de l'index :", index);
      chrome.storage.sync.set({ idIndex: index });
    }
  });

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
});

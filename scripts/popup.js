// Attend que le DOM soit complètement chargé avant d'exécuter le script
document.addEventListener("DOMContentLoaded", () => {
  // Récupération des éléments HTML de l'interface : champ de saisie et bouton d'exécution
  const input = document.getElementById("indexInput");
  const button = document.getElementById("runBtn");

  // Chargement de l'index sauvegardé dans le stockage Chrome (si existant)
  chrome.storage.sync.get("idIndex", (data) => {
    if (typeof data.idIndex === "number") {
      // Pré-remplit le champ avec l'index sauvegardé
      input.value = data.idIndex;
    }
  });

  // Sauvegarde automatique de l'index dès que l'utilisateur modifie la saisie
  input.addEventListener("input", () => {
    const index = parseInt(input.value, 10); // Convertit la saisie en nombre entier
    if (!isNaN(index)) {
      console.log("Sauvegarde de l'index :", index);
      chrome.storage.sync.set({ idIndex: index }); // Enregistre la valeur dans le stockage Chrome
    }
  });

  // Lors du clic sur le bouton, on déclenche l'injection du script + le scraping
  button.addEventListener("click", async () => {
    // Recherche de l'onglet actif dans la fenêtre courante
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return; // Si aucun onglet actif trouvé, on interrompt

    try {
      // Injection dynamique du script content.js dans la page active
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["scripts/MP/content.js"],
      });

      // Envoie un message au script injecté pour déclencher l'extraction des données
      chrome.tabs.sendMessage(tab.id, { action: "runScraper" }, (response) => {
        // Vérifie si une erreur s’est produite lors de l’envoi du message
        if (chrome.runtime.lastError) {
          console.error("Erreur lors de l'envoi du message :", chrome.runtime.lastError.message);
        }
      });
    } catch (err) {
      // Gestion des erreurs d'injection (ex : permissions, mauvais contexte, etc.)
      console.error("Échec de l'injection du script :", err);
    }
  });
});
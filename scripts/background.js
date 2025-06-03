import { handleLinkedinDownloads } from './Linkedin/backgroundLinkedin.js';
import { handleInsertToMP } from './Insert/backgroundInsert.js';

// Initialize LinkedIn-specific background handlers
handleLinkedinDownloads();
handleInsertToMP();

// Événement déclenché lors de l'installation ou la mise à jour de l'extension
chrome.runtime.onInstalled.addListener(() => {
  // Enregistre le script de contenu pour qu'il soit injecté automatiquement
  chrome.scripting.registerContentScripts([
    {
      id: "scraper-script", // Identifiant unique du script de contenu
      matches: ["http://s-tom-1:90/MeilleurPilotage/servlet/ListeEtats*"], // URL(s) ciblée(s)
      js: ["scripts/MP/content.js"], // Fichier JS à injecter
      runAt: "document_idle" // Moment d'injection : une fois que la page est "presque" totalement chargée
    }
  ]);
});

// Événement déclenché lorsque l'utilisateur clique sur l'icône de l'extension
chrome.action.onClicked.addListener((tab) => {
  // Envoie un message au script de contenu (déjà injecté) pour lancer le scraping
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "runScraper" });
  }
});
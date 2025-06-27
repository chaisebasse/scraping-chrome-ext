/**
 * @file background.js
 * @description Main background script, acts as a router on extension icon click.
 */

import { handleInsertToMP } from './Insert/backgroundInsert.js';
import { handleErrors } from './Redirect/backgroundRedirect.js';

handleInsertToMP();
handleErrors();

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
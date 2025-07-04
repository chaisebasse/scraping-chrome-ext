/**
 * @file background.js
 * @description Main background script, handles extension state and routing.
 */

import { handleInsertToMP, handleCandidateMessage } from './Insert/backgroundInsert.js';
import { handleErrorMessage } from './Redirect/backgroundRedirect.js';

// Set initial state of the action icon based on stored errors on startup
(async () => {
  const { storedErrors } = await chrome.storage.session.get(['storedErrors']);
  if (storedErrors && storedErrors.length > 0) {
    chrome.action.enable();
    console.log("Errors found on startup. Enabling action icon globally.");
  } else {
    chrome.action.disable();
    console.log("No errors on startup. Action icon will be controlled by page rules.");
  }
})();

handleInsertToMP(); // Sets up the webRequest listener for CVs

// Central message router to prevent listener conflicts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    // Try the candidate handler
    let result = await handleCandidateMessage(message, sender);
    if (result !== Symbol.for('messageNotHandled')) {
      sendResponse(result);
      return;
    }

    // If not handled, try the error handler
    result = await handleErrorMessage(message, sender);
    if (result !== Symbol.for('messageNotHandled')) {
      sendResponse(result);
    }
  })();
  return true; // Indicates that the response will be sent asynchronously.
});

// Événement déclenché lors de l'installation ou la mise à jour de l'extension
chrome.runtime.onInstalled.addListener(() => {
  // These rules are persistent across browser restarts.
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 's-tom-1' },
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'app-recruteur.hellowork.com' },
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {
              hostEquals: 'www.linkedin.com',
              pathPrefix: '/talent/'
            },
          }),
        ],
        // Show the action icon on matching pages.
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });

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
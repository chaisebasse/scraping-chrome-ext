/**
 * @fileoverview Script d'arrière-plan principal de l'extension.
 * @description Gère l'état global de l'extension, le routage des messages,
 * l'interception des requêtes et les règles d'activation de l'icône.
 */

import { handleInsertToMP, handleCandidateMessage } from './Insert/backgroundInsert.js';
import { handleErrorMessage } from './Redirect/backgroundRedirect.js';

/**
 * Initialise l'état de l'icône de l'extension au démarrage.
 * L'icône est activée s'il y a des erreurs stockées, sinon elle est désactivée
 * (et son affichage sera géré par les règles `declarativeContent`).
 */
(async () => {
  const { storedErrors } = await chrome.storage.session.get(['storedErrors']);
  if (storedErrors && storedErrors.length > 0) {
    chrome.action.enable();
    console.log("Erreurs détectées au démarrage. Activation globale de l'icône d'action.");
  } else {
    chrome.action.disable();
    console.log("Aucune erreur au démarrage. L'icône d'action sera contrôlée par les règles de la page.");
  }
})();

/**
 * Met en place l'intercepteur de requêtes web pour capturer les CVs.
 * Cette fonction est définie dans `backgroundInsert.js`.
 */
handleInsertToMP();

/**
 * Routeur de messages central pour l'extension.
 * Écoute tous les messages et les délègue aux gestionnaires appropriés
 * pour éviter les conflits entre plusieurs écouteurs `onMessage`.
 * @returns {boolean} Vrai pour indiquer que la réponse sera envoyée de manière asynchrone.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    let result = await handleCandidateMessage(message, sender);
    if (result !== Symbol.for('messageNotHandled')) {
      sendResponse(result);
      return;
    }

    result = await handleErrorMessage(message, sender);
    if (result !== Symbol.for('messageNotHandled')) {
      sendResponse(result);
    }
  })();
  return true;
});

/**
 * Met en place les règles d'affichage de l'icône de l'extension lors de l'installation.
 * Utilise `declarativeContent` pour afficher l'icône uniquement sur les pages cibles
 * (MeilleurPilotage, Hellowork, LinkedIn Recruiter).
 */
chrome.runtime.onInstalled.addListener(() => {
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
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
});
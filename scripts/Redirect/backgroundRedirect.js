/**
 * @fileoverview Gère les erreurs d'insertion et les redirections post-soumission.
 */

/**
 * Récupère les erreurs stockées depuis `chrome.storage.session`.
 * @returns {Promise<Array>} Une promesse qui se résout avec le tableau des erreurs.
 */
async function getStoredErrors() {
  const { storedErrors } = await chrome.storage.session.get(['storedErrors']);
  return storedErrors || [];
}

/**
 * Sauvegarde un tableau d'erreurs dans `chrome.storage.session`.
 * @param {Array} errors - Le tableau des erreurs à sauvegarder.
 * @returns {Promise<void>}
 */
async function setStoredErrors(errors) {
  await chrome.storage.session.set({ storedErrors: errors });
}

/**
 * Active l'icône de l'extension si c'était la première erreur ajoutée.
 * @param {Array} currentErrors - Les erreurs avant l'ajout.
 * @param {Array} newErrors - Les erreurs après l'ajout.
 */
function maybeEnableActionIcon(currentErrors, newErrors) {
  const wasEmpty = currentErrors.length === 0;
  if (wasEmpty && newErrors.length > 0) {
    chrome.action.enable(); // Activer globalement
    console.log("Erreurs détectées. Activation globale de l'icône d'action.");
  }
}

/**
 * Ajoute de nouvelles erreurs d'insertion au stockage.
 * @param {Array} errorsPayload - Le tableau des nouvelles erreurs.
 * @param {chrome.runtime.MessageSender} sender - L'expéditeur du message.
 */
async function addInsertionErrors(errorsPayload, sender) {
  if (!errorsPayload || errorsPayload.length === 0) return;

  const currentErrors = await getStoredErrors();

  const errorsWithContext = errorsPayload.map((err) => ({
    ...err,
    id: `err_${Date.now()}_${Math.random()}`, // Ajoute un ID unique
    tabId: sender.tab.id,
  }));

  const newErrors = [...currentErrors, ...errorsWithContext];
  await setStoredErrors(newErrors);
  maybeEnableActionIcon(currentErrors, newErrors);
}

/**
 * Efface toutes les erreurs d'insertion stockées.
 * @returns {Promise<{status: string}>} Un objet de statut.
 */
async function clearInsertionErrors() {
  await setStoredErrors([]);
  chrome.action.disable();
  console.log("Erreurs effacées. Réinitialisation de l'icône d'action à l'état par défaut.");
  return { status: 'cleared' };
}

/**
 * Désactive l'icône de l'extension si la dernière erreur a été supprimée.
 * @param {Array} currentErrors - Les erreurs avant la suppression.
 * @param {Array} newErrors - Les erreurs après la suppression.
 */
function maybeDisableActionIcon(currentErrors, newErrors) {
  if (newErrors.length === 0 && currentErrors.length > 0) {
    chrome.action.disable();
    console.log("Erreurs effacées. Réinitialisation de l'icône d'action à l'état par défaut.");
  }
}

/**
 * Supprime une seule erreur d'insertion du stockage.
 * @param {string} errorId - L'ID unique de l'erreur à supprimer.
 * @returns {Promise<{status: string}>} Un objet de statut.
 */
async function removeSingleError(errorId) {
  const currentErrors = await getStoredErrors();
  const newErrors = currentErrors.filter(err => err.id !== errorId);
  await setStoredErrors(newErrors);
  maybeDisableActionIcon(currentErrors, newErrors);
  return { status: 'success' };
}

/**
 * Ferme l'onglet de soumission après une insertion réussie.
 * @param {chrome.runtime.MessageSender} sender - L'expéditeur du message, contenant l'ID de l'onglet.
 */
function closeSuccessfulSubmissionTab(sender) {
  chrome.tabs.remove(sender.tab.id);
}

/**
 * Gère les messages liés aux erreurs d'insertion et aux redirections.
 * C'est le point d'entrée pour les messages routés depuis `background.js`.
 * @param {object} message - Le message reçu.
 * @param {chrome.runtime.MessageSender} sender - L'expéditeur du message.
 * @returns {Promise<any>} La réponse à renvoyer, ou un symbole si le message n'est pas géré.
 */
export async function handleErrorMessage(message, sender) {
  switch (message.type) {
    case "addInsertionErrors":
      await addInsertionErrors(message.payload, sender);
      return; // Pas de réponse attendue
    case "getInsertionErrors":
      return getStoredErrors();
    case "clearInsertionErrors":
      return clearInsertionErrors();
    case "removeSingleError":
      return removeSingleError(message.payload.errorId);
    case "close_successful_submission_tab":
      closeSuccessfulSubmissionTab(sender);
      return; // Pas de réponse attendue
    default:
      return Symbol.for('messageNotHandled');
  }
}

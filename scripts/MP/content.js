/**
 * @fileoverview Script de contenu pour les pages MeilleurPilotage.
 * @description Ce script est injecté dynamiquement pour extraire les "Recherches Associées" actives.
 */

/**
 * Extrait les recherches associées actives depuis le menu déroulant du formulaire.
 * @returns {Array<{label: string, value: string}>} Une liste d'objets contenant le libellé et la valeur de chaque recherche active.
 */
function scrapeActiveJobIds() {
  try {
    return Array.from(document.querySelectorAll('select[name="MP:ID_RECH"] option'))
      .filter(opt => opt.value && /active\s*:\s*oui/i.test(opt.textContent))
      .map(opt => ({
        label: opt.textContent.trim(),
        value: opt.value.trim()
      }));
  } catch (e) {
    console.error("Erreur dans jobScraper :", e);
    return [];
  }
}

/**
 * Gère les messages entrants de l'extension, spécifiquement pour récupérer les recherches associées.
 * @param {object} request - La requête reçue.
 * @param {object} sender - L'expéditeur du message.
 * @param {function} sendResponse - La fonction pour envoyer une réponse.
 */
function handleMessage(request, sender, sendResponse) {
  if (request.action === "get_job_ids") {
    const jobIds = scrapeActiveJobIds();
    sendResponse({ jobIds: jobIds });
  }
}

// Met en place l'écouteur de messages pour répondre aux demandes de l'extension.
chrome.runtime.onMessage.addListener(handleMessage);
/**
 * @file Pont de communication pour le script de contenu `Insert/content.js`.
 * @description Ce script s'exécute dans le contexte de la page web (monde isolé)
 * et agit comme un pont pour permettre au script de contenu principal (exécuté dans le monde MAIN)
 * d'accéder aux APIs de l'extension comme `chrome.storage`.
 */

/**
 * Gère les messages postés depuis le script de contenu principal (`content.js`).
 * Écoute spécifiquement la demande pour l'ID de la recherche associée.
 * @param {MessageEvent} event - L'événement de message reçu.
 */
async function handleBridgeMessage(event) {
  if (event.source !== window) return;

  if (event.data.type === "GET_SELECTED_JOB_ID") {
    const { lastJobId } = await chrome.storage.local.get("lastJobId");
    console.log("[Bridge] lastJobId récupéré : ", lastJobId);
    window.postMessage({
      type: "FROM_EXTENSION_SELECTED_JOB_ID",
      lastJobId: lastJobId || null,
    }, "*");
  }
}

// Met en place l'écouteur d'événements pour faire le pont entre les mondes.
window.addEventListener("message", handleBridgeMessage);
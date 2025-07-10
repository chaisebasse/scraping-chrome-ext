/**
 * @fileoverview Fonctions utilitaires DOM et asynchrones partagées pour les scripts de contenu.
 * Ce script est destiné à être injecté avant les autres scripts de contenu
 * qui dépendent de ces fonctions.
 */

/**
 * Met en pause l'exécution pendant une durée spécifiée.
 * @param {number} ms - Le nombre de millisecondes à attendre.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attend qu'un élément apparaisse dans le document.
 * @param {string} selector - Le sélecteur CSS de l'élément cible.
 * @param {number} [timeout=2000] - Le délai d'attente en millisecondes.
 * @returns {Promise<Element>}
 */
function waitForElement(selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    createObserver({ root: document.body, selector, resolve, reject, timeout });
  });
}

/**
 * Attend qu'un élément apparaisse à l'intérieur d'une racine donnée (ex: un shadowRoot).
 * @param {Document|ShadowRoot} root - La racine DOM dans laquelle chercher.
 * @param {string} selector - Le sélecteur CSS de l'élément cible.
 * @param {number} [timeout=2000] - Le délai d'attente en millisecondes.
 * @returns {Promise<Element>} L'élément trouvé.
 */
function waitForElementInRoot(root, selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    if (!root) return reject(new Error("La racine fournie pour l'attente est nulle ou non définie."));
    const el = root.querySelector(selector);
    if (el) return resolve(el);
    createObserver({ root, selector, resolve, reject, timeout });
  });
}

/**
 * Crée un MutationObserver pour surveiller l'apparition ou la disparition d'un élément.
 * @param {object} options - La configuration de l'observateur.
 */
function createObserver({ root, selector, resolve, reject, timeout, checkGone = false }) {
  let timeoutId;
  const observer = new MutationObserver(() => {
    const el = root.querySelector(selector);
    if ((checkGone && !el) || (!checkGone && el)) {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
      resolve(el);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  if (timeout) timeoutId = createTimeout(selector, timeout, observer, reject);
}

/**
 * Crée un délai d'attente pour un observateur.
 * @param {string} selector - Le sélecteur surveillé, pour les messages d'erreur.
 * @param {number} timeout - La durée du délai d'attente en millisecondes.
 * @param {MutationObserver} observer - L'observateur à déconnecter à l'expiration du délai.
 * @param {Function} reject - La fonction reject de la promesse.
 * @returns {number} L'ID du timeout.
 */
function createTimeout(selector, timeout, observer, reject) {
  return setTimeout(() => {
    observer.disconnect();
    reject(new Error(`Timeout: Élément ${selector} introuvable`));
  }, timeout);
}

/**
 * Simule un clic utilisateur réaliste à l'intérieur du cadre de délimitation d'un élément.
 * @param {Element} element - L'élément sur lequel cliquer.
 */
function clickRandomSpotInside(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + (rect.width * Math.random());
  const y = rect.top + (rect.height * Math.random());
  const eventOpts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  ["mousedown", "mouseup", "click"].forEach(type => {
    element.dispatchEvent(new MouseEvent(type, eventOpts));
  });
}
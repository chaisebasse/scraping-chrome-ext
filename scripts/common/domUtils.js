/**
 * @fileoverview Shared DOM and async utility functions for content scripts.
 * This script is intended to be injected before other content scripts
 * that depend on these helpers.
 */

/**
 * Pauses execution for a specified duration.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for an element to appear in the document.
 * @param {string} selector - The CSS selector for the target element.
 * @param {number} [timeout=2000] - The timeout in milliseconds.
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
 * Waits for an element to appear within a given root (e.g., a shadowRoot).
 * @param {Document|ShadowRoot} root - The DOM root to search within.
 * @param {string} selector - The CSS selector for the target element.
 * @param {number} [timeout=2000] - The timeout in milliseconds.
 * @returns {Promise<Element>} The found element.
 */
function waitForElementInRoot(root, selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    if (!root) return reject(new Error("Provided root for waiting is null or undefined."));
    const el = root.querySelector(selector);
    if (el) return resolve(el);
    createObserver({ root, selector, resolve, reject, timeout });
  });
}

/**
 * Creates a MutationObserver to watch for an element's appearance or disappearance.
 * @param {object} options - The observer configuration.
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
 * Creates a timeout for an observer.
 * @param {string} selector - The selector being watched, for error messages.
 * @param {number} timeout - The timeout duration in milliseconds.
 * @param {MutationObserver} observer - The observer to disconnect on timeout.
 * @param {Function} reject - The promise's reject function.
 * @returns {number} The timeout ID.
 */
function createTimeout(selector, timeout, observer, reject) {
  return setTimeout(() => {
    observer.disconnect();
    reject(new Error(`Timeout: Élément ${selector} introuvable`));
  }, timeout);
}

/**
 * Simulates a realistic user click inside an element's bounding box.
 * @param {Element} element - The element to click.
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
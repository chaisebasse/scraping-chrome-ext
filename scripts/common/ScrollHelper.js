/**
 * Extrait le nombre total de lignes attendues, à partir de l'élément affichant le total sur la page.
 * Exemple : si un élément contient "Résultats : 123", la fonction retournera 123.
 *
 * @returns {number|null} - Nombre total de lignes attendues ou null si non trouvé.
 */
function getTotalExpectedRows() {
  const el = document.querySelector('.resultats.bold');
  if (!el) return null;
  const match = el.textContent.match(/\d+/); // Extrait le premier nombre
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Trouve le parent scrollable d'un élément donné.
 * Parcourt les parents DOM jusqu'à trouver un overflowY 'scroll' ou 'auto'.
 * 
 * @param {HTMLElement} element - L'élément de départ.
 * @returns {HTMLElement|Window} - Le parent scrollable ou la fenêtre (window) par défaut.
 */
export function getScrollableParent(element) {
  let el = element.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY)) {
      return el;
    }
    el = el.parentElement;
  }
  return window;
}

/**
 * Fait défiler verticalement un conteneur (ou la fenêtre) vers le bas.
 * 
 * @param {HTMLElement|Window} container - Élément scrollable ou fenêtre.
 * @param {number} amount - Nombre de pixels à défiler (par défaut : 1000).
 */
export function scrollDown(container, amount = 1000) {
  if (container === window) {
    window.scrollBy(0, amount);
  } else {
    container.scrollBy(0, amount);
  }
}

/**
 * Remonte tout en haut du conteneur ou de la fenêtre.
 * 
 * @param {HTMLElement|Window} container - Élément scrollable ou fenêtre.
 */
export function scrollToTop(container) {
  if (container === window) {
    window.scrollTo(0, 0);
  } else {
    container.scrollTop = 0;
  }
}

/**
 * Lance un MutationObserver pour détecter les nouvelles lignes <tr> ajoutées dans un <tbody>.
 * Utile pour suivre un chargement dynamique de contenu (ex : lazy loading infini).
 * 
 * @param {HTMLElement} tbody - Le corps du tableau à observer.
 * @param {Function} onRowsAdded - Fonction callback appelée avec les lignes ajoutées.
 * @returns {MutationObserver} - L'observateur (pensez à .disconnect() pour arrêter).
 */
export function observeNewRows(tbody, onRowsAdded) {
  const observer = new MutationObserver(mutations => {
    const newRows = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === 'TR') {
          newRows.push(node);
        }
      }
    }

    if (newRows.length > 0) {
      onRowsAdded(newRows);
    }
  });

  observer.observe(tbody, { childList: true });
  return observer;
}

/**
 * Défile automatiquement dans un tableau, détecte les nouvelles lignes via MutationObserver,
 * applique une fonction de traitement, et s'arrête lorsqu'on atteint un seuil ou un timeout.
 * 
 * Cette fonction est optimisée pour éviter les doublons, détecter la fin du chargement, et limiter les ressources.
 * 
 * @param {Object} options - Paramètres de configuration.
 * @param {HTMLElement} options.tbody - <tbody> du tableau à observer.
 * @param {HTMLElement|Window} options.scrollContainer - Conteneur scrollable.
 * @param {Function} options.processRowFn - Fonction appelée pour chaque ligne nouvelle ou unique.
 * @param {number} [options.timeout=50] - Délai avant de considérer l'inactivité (ms).
 * @param {number} [options.maxWait=1500] - Délai d'exécution global maximum (ms).
 * @param {number} [options.maxScrolls=50] - Nombre max de scrolls autorisés.
 * @param {number} [options.maxIdleScrolls=10] - Scrolls consécutifs sans nouvelles lignes.
 * @param {number} [options.scrollDelay=15] - Délai entre deux scrolls (ms).
 * @param {string[]} [options.lines] - Liste de résultats textuels (ligne par ligne).
 * @returns {Promise<string[]>} - Promesse résolue avec toutes les lignes collectées.
 */
export async function scrollAndCollectRows({
  tbody,
  scrollContainer,
  processRowFn,
  timeout = 50,
  maxWait = 1500,
  maxScrolls = 50,
  maxIdleScrolls = 10,
  scrollDelay = 15,
  lines = []
}) {
  return new Promise((resolve) => {
    let timeoutId;
    let maxWaitTimerId;
    let scrollCount = 0;
    let idleScrolls = 0;
    let isScrolling = false;
    const totalExpectedRows = getTotalExpectedRows();
    let newRowDetected = false;
    const seenRowNumbers = new Set(); // Pour éviter les doublons basés sur le numéro de ligne

    function finish() {
      clearTimeout(timeoutId);
      clearTimeout(maxWaitTimerId);
      observer.disconnect();
      resolve(lines);
    }

    function hasReachedTarget() {
      return totalExpectedRows && seenRowNumbers.size >= totalExpectedRows;
    }

    const resetIdleTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(finish, maxWait);
    };

    function handleRow(row) {
      const rowNumberCell = row.querySelector('td');
      const text = rowNumberCell?.textContent?.trim();
      const rowNumber = text && /^\d+$/.test(text) ? parseInt(text, 10) : null;
      if (!rowNumber || seenRowNumbers.has(rowNumber)) return;

      seenRowNumbers.add(rowNumber);
      processRowFn(row, lines);
      newRowDetected = true;
      resetIdleTimer();
    }

    // 1. Traitement initial des lignes déjà visibles dans le DOM
    tbody.querySelectorAll('tr').forEach(handleRow);

    // 2. Activation de l'observateur pour détecter les nouvelles lignes
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'TR') {
            handleRow(node);
          }
        }
      }

      if (isScrolling) {
        isScrolling = false;

        const sawNewRow = newRowDetected;
        newRowDetected = false;

        if (sawNewRow) {
          idleScrolls = 0;
        } else {
          idleScrolls++;
        }

        if (hasReachedTarget()) {
          finish();
        } else if (scrollCount >= maxScrolls || idleScrolls >= maxIdleScrolls) {
          finish();
        } else {
          setTimeout(doScroll, scrollDelay);
        }
      }
    });

    observer.observe(tbody, { childList: true });

    // 3. Fonction de défilement automatique cyclique
    const doScroll = () => {
      scrollCount++;
      isScrolling = true;

      scrollContainer.scrollBy(0, 1000);

      resetIdleTimer();

      setTimeout(() => {
        if (isScrolling) {
          isScrolling = false;
          idleScrolls++;
          if (hasReachedTarget() || scrollCount >= maxScrolls || idleScrolls >= maxIdleScrolls) {
            finish();
          } else {
            setTimeout(doScroll, scrollDelay);
          }
        }
      }, timeout);
    };

    resetIdleTimer();
    doScroll();
  });
}

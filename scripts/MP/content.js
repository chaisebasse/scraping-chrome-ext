/**
 * Charge dynamiquement un module et l'attache à l'objet `window` pour éviter les rechargements multiples.
 * Permet d'utiliser des helpers sans les déclarer statiquement dans le manifest.json.
 * @param {string} name - Nom de la variable globale à utiliser (ex: 'HighlightHelper')
 * @param {string} path - Chemin relatif du module dans le dossier `scripts/common/`
 * @param {boolean} isClassInstance - Si vrai, instancie automatiquement la classe (utile pour Parameter)
 * @returns {Promise<void>}
 */
async function loadHelper(name, path, isClassInstance = false) {
  if (!window[`${name}Ready`]) {
    window[`${name}Ready`] = (async () => {
      try {
        const module = await import(chrome.runtime.getURL(`scripts/common/${path}`));
        if (!module) {
          console.error(`Le module ${path} est vide ou invalide.`);
          return;
        }

        if (isClassInstance) {
          const ClassRef = module[name];
          if (!ClassRef) {
            console.error(`Le module ${path} ne contient pas l'export '${name}'.`);
            return;
          }
          window[name.toLowerCase()] = new ClassRef(); // Par exemple: window.parameterHandler
        } else {
          window[name] = module;
        }
      } catch (err) {
        console.error(`Erreur lors du chargement du module ${path}:`, err);
      }
    })();
  }
}

// ========== Chargement dynamique des modules auxiliaires ==========

loadHelper('HighlightHelper', 'HighlightHelper.js');
loadHelper('ScrollHelper', 'ScrollHelper.js');
loadHelper('Parameter', 'Parameter.js', true); // Instancie la classe Parameter automatiquement

// ========== Chargement manuel de Parameter (exemple avec import test de CSV) ==========

/**
 * Charge manuellement le module Parameter, instancie la classe et importe des données CSV de test.
 * Utile pour tester l'import/export de paramètres sans utiliser loadHelper.
 */
if (!window.parameterHandlerReady) {
  window.parameterHandlerReady = (async () => {
    try {
      const module = await import(chrome.runtime.getURL('scripts/common/Parameter.js'));
      if (!module?.Parameter) {
        console.error("Le module Parameter.js ne contient pas l'export 'Parameter'. Vérifier le fichier.");
        return;
      }

      const Parameter = module.Parameter;
      window.parameterHandler = new Parameter(); // Assignation globale

      // Données de test importées en CSV (à supprimer en production)
      const exampleCSV = `Recherche / Demande de poste;Id
                          Développeur;123
                          Designer;456
                          Analyste;789`;

      window.parameterHandler.import(exampleCSV);
      console.log('CSV importé :', window.parameterHandler.getAll());

      const csvExport = window.parameterHandler.export();
      console.log('CSV exporté :\n', csvExport);
    } catch (err) {
      console.error("Échec de l'import du module Parameter.js:", err);
    }
  })();
}

/**
 * Enregistre un listener global pour les messages runtime.
 * Écoute l'action "runScraper" et lance la fonction runScraper avec l'index de colonne stocké.
 */
if (!window.scraperListenerRegistered) {
  window.scraperListenerRegistered = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runScraper") {
      chrome.storage.sync.get("idIndex", ({ idIndex }) => {
        if (typeof idIndex !== "number" || isNaN(idIndex)) {
          alert("Index de colonne invalide ou non défini.");
          sendResponse({ status: 'error', message: 'Invalid index' });
          return;
        }
        runScraper(idIndex);
        sendResponse({ status: 'ok' });
      });
      return true; // Indique une réponse asynchrone
    }
  });
}

/**
 * Détecte l'index de la colonne contenant le numéro de ligne dans un tableau.
 * Recherche l'en-tête 'n°' (insensible à la casse).
 * @param {HTMLTableElement} table - Le tableau HTML à analyser.
 * @returns {number} - Index de la colonne numéro de ligne, 0 par défaut.
 */
function detectRowNumberColIndex(table) {
  const headers = table.querySelectorAll('thead th');
  for (let i = 0; i < headers.length; i++) {
    const label = headers[i].textContent?.trim().toLowerCase();
    if (label === 'n°') return i;
  }
  return 0;
}

// ========== Refactorisation de runScraper en fonctions plus petites ==========

/**
 * Prépare l'environnement de scraping en chargeant et validant les helpers requis.
 * @returns {Promise<{parameterHandler: object, HighlightHelper: object, ScrollHelper: object}|null>}
 */
async function prepareScraper() {
  await window.parameterHandlerReady;
  const parameterHandler = window.parameterHandler;
  if (!parameterHandler) {
    console.error("parameterHandler non initialisé.");
    return null;
  }
  await window.highlightHelperReady;
  const HighlightHelper = window.HighlightHelper;
  if (!HighlightHelper) {
    console.error("HighlightHelper est undefined.");
    return null;
  }
  await window.scrollHelperReady;
  const ScrollHelper = window.ScrollHelper;
  if (!ScrollHelper) {
    console.error("ScrollHelper est undefined.");
    return null;
  }
  return { parameterHandler, HighlightHelper, ScrollHelper };
}

/**
 * Récupère les éléments clés du tableau HTML et valide leur présence.
 * @returns {{table: HTMLTableElement, thead: HTMLElement, tbody: HTMLElement}|null}
 */
function getTableElements() {
  const table = document.getElementById('DataTables_Table_0');
  if (!table) {
    console.error('Tableau introuvable.');
    return null;
  }
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (!thead || !tbody) {
    console.error("Structure du tableau invalide (thead ou tbody manquant).");
    return null;
  }
  return { table, thead, tbody };
}

/**
 * Construit un dictionnaire associant les noms des colonnes à leurs index.
 * @param {HTMLElement} thead - Élément thead du tableau.
 * @returns {Object} - Map { nomColonne: index }
 */
function buildHeaderMap(thead) {
  const headerMap = {};
  thead.querySelectorAll('th').forEach((th, index) => {
    headerMap[th.innerText.trim()] = index;
  });
  return headerMap;
}

/**
 * Prépare le système de surlignage des colonnes et des en-têtes spécifiques.
 * Injecte les styles et applique les surlignages.
 * @param {object} HighlightHelper - Helper pour la gestion du surlignage.
 * @param {number} idIndex - Index de la colonne à surligner.
 * @param {string[]} headersOfInterest - Liste des en-têtes à surligner.
 * @returns {object} - Fonctions de nettoyage des surlignages.
 */
function prepareHighlighting(HighlightHelper, idIndex, headersOfInterest) {
  const {
    injectHighlightStyles,
    clearAllHighlights,
    highlightByHeaderLabel,
    applyColumnHighlight,
    fadeOutHighlightByHeaderLabel,
    fadeOutColumnHighlight
  } = HighlightHelper;

  injectHighlightStyles();
  applyColumnHighlight(idIndex);
  highlightByHeaderLabel(headersOfInterest);

  return {
    clearAllHighlights,
    fadeOutHighlightByHeaderLabel,
    fadeOutColumnHighlight
  };
}

/**
 * Récupère le conteneur scrollable parent du tableau et les helpers de scroll.
 * @param {object} ScrollHelper - Helper pour la gestion du scroll.
 * @param {HTMLTableElement} table - Le tableau HTML.
 * @returns {object} - Conteneur scrollable et fonctions de scroll.
 */
function getScrollContainerAndHelpers(ScrollHelper, table) {
  const {
    getScrollableParent,
    scrollToTop,
    scrollAndCollectRows
  } = ScrollHelper;

  const scrollContainer = getScrollableParent(table) || window;
  return { scrollContainer, scrollToTop, scrollAndCollectRows };
}

/**
 * Crée une fonction pour traiter chaque ligne du tableau et extraire les données importantes.
 * @param {number} rowNumberColIndex - Index de la colonne numéro de ligne.
 * @param {number} idIndex - Index de la colonne ID.
 * @param {Object} headerMap - Map des noms de colonnes vers index.
 * @param {string} HEADER_RECHERCHE - Nom de la colonne "Recherche / Demande de poste".
 * @param {Array} data - Tableau où stocker les objets extraits.
 * @param {Array} lines - Tableau où stocker les lignes texte exportées.
 * @returns {Function} - Fonction qui traite une ligne HTML.
 */
function createProcessRowFn(rowNumberColIndex, idIndex, headerMap, HEADER_RECHERCHE, data, lines) {
  return (row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0) return;
    const rowNumberCell = cells[rowNumberColIndex];
    const rowNumber = rowNumberCell?.textContent?.trim() || (data.length + 1);
    const idCell = cells[idIndex];
    if (!idCell || !idCell.innerText.trim()) return;
    const id = idCell.innerText.trim();
    const recherche = cells[headerMap[HEADER_RECHERCHE]]?.innerText.trim() || '?';

    lines.push(`${rowNumber}. ${recherche} | ${id}`);
    data.push({ [HEADER_RECHERCHE]: recherche, ID: id });
  };
}

/**
 * Exporte les résultats du scraping en fichiers CSV et TXT téléchargeables.
 * @param {object} parameterHandler - Handler pour l'export CSV.
 * @param {Array<string>} lines - Lignes texte brutes à exporter en TXT.
 */
function exportResults(parameterHandler, lines) {
  const csvText = parameterHandler.export();
  const blob = new Blob([csvText], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'scraped_results.csv';
  link.click();

  const txtBlob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const txtLink = document.createElement('a');
  txtLink.href = URL.createObjectURL(txtBlob);
  txtLink.download = 'raw_output_lines.txt';
  txtLink.click();
}

/**
 * Fonction principale de scraping : charge l'environnement, collecte et exporte les données du tableau.
 * @param {number} idIndex - Index de la colonne ID à scraper.
 */
async function runScraper(idIndex) {
  const prepared = await prepareScraper();
  if (!prepared) return;
  const { parameterHandler, HighlightHelper, ScrollHelper } = prepared;

  const tableElements = getTableElements();
  if (!tableElements) return;
  const { table, thead, tbody } = tableElements;

  const headerMap = buildHeaderMap(thead);
  const rowNumberColIndex = detectRowNumberColIndex(table);
  const HEADER_RECHERCHE = 'Recherche / Demande de poste';
  const data = [];
  const lines = [];

  parameterHandler.nomColonnes = [HEADER_RECHERCHE, 'ID'];
  parameterHandler.donnees = data;

  const headersOfInterest = [HEADER_RECHERCHE];

  const {
    clearAllHighlights,
    fadeOutHighlightByHeaderLabel,
    fadeOutColumnHighlight
  } = prepareHighlighting(HighlightHelper, idIndex, headersOfInterest);

  const { scrollContainer, scrollToTop, scrollAndCollectRows } = getScrollContainerAndHelpers(ScrollHelper, table);

  scrollToTop(scrollContainer);
  await new Promise(r => setTimeout(r, 50));

  const processRowFn = createProcessRowFn(rowNumberColIndex, idIndex, headerMap, HEADER_RECHERCHE, data, lines);

  const seenRows = new WeakSet();

  await scrollAndCollectRows({ tbody, scrollContainer, processRowFn, seenRows, lines });

  await new Promise(r => setTimeout(r, 30));

  fadeOutHighlightByHeaderLabel(headersOfInterest);
  fadeOutColumnHighlight(idIndex);
  clearAllHighlights();

  if (data.length === 0) {
    alert("Aucune donnée n'a été collectée. Vérifier que le tableau soit chargé et que l'index de colonne soit correct.");
    return;
  }

  exportResults(parameterHandler, lines);
}

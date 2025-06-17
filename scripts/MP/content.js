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
      runScraper();
      sendResponse({ status: 'ok' });
      return true; // Indique une réponse asynchrone
    }
  });
}
// === UTILS =======================================================

/**
 * Détecte l'index de la colonne contenant le numéro de ligne dans un tableau.
 */
function detectRowNumberColIndex(table) {
  const headers = table.querySelectorAll('thead th');
  for (let i = 0; i < headers.length; i++) {
    const label = headers[i].textContent?.trim().toLowerCase();
    if (label === 'n°') return i;
  }
  return 0;
}

/**
 * Récupère l'index d'une colonne en fonction de son data-tri-code.
 */
function getColumnIndexByTriCode(thead, triCode) {
  const headers = thead.querySelectorAll('th');
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].getAttribute('data-tri-code') === triCode) return i;
  }
  return -1;
}

/**
 * Crée un délai.
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === SCRAPER PREP ================================================

async function prepareScraper() {
  await Promise.all([
    window.parameterHandlerReady,
    window.highlightHelperReady,
    window.scrollHelperReady,
  ]);

  const { parameterHandler, HighlightHelper, ScrollHelper } = window;
  console.log("bim bam boum : ", parameterHandler, HighlightHelper, ScrollHelper);

  if (!parameterHandler || !HighlightHelper || !ScrollHelper) {
    console.error("Un ou plusieurs helpers sont undefined.");
    return null;
  }

  return { parameterHandler, HighlightHelper, ScrollHelper };
}

function getTableElements() {
  const table = document.getElementById('DataTables_Table_0');
  const thead = table?.querySelector('thead');
  const tbody = table?.querySelector('tbody');

  if (!table || !thead || !tbody) {
    console.error("Structure du tableau invalide.");
    return null;
  }

  return { table, thead, tbody };
}

function getRequiredColumnIndices(thead) {
  const colRechercheIndex = getColumnIndexByTriCode(thead, 'LIBE_RECH_LIEN');
  const colIdIndex = getColumnIndexByTriCode(thead, 'ID_EMPL');

  return { colRechercheIndex, colIdIndex };
}

// === HIGHLIGHTING ================================================

function prepareHighlighting(HighlightHelper, columnIndices, headersOfInterest) {
  const {
    injectHighlightStyles,
    clearAllHighlights,
    highlightByHeaderLabel,
    applyColumnHighlight,
    fadeOutHighlightByHeaderLabel,
    fadeOutColumnHighlight,
  } = HighlightHelper;

  injectHighlightStyles();

  const indices = Array.isArray(columnIndices) ? columnIndices : [columnIndices];
  indices.forEach(applyColumnHighlight);

  highlightByHeaderLabel(headersOfInterest);

  return {
    clearAllHighlights,
    fadeOutHighlightByHeaderLabel,
    fadeOutColumnHighlight,
  };
}

// === SCROLLING ===================================================

function getScrollContainerAndHelpers(ScrollHelper, table) {
  const {
    getScrollableParent,
    scrollToTop,
    scrollAndCollectRows,
  } = ScrollHelper;

  return {
    scrollContainer: getScrollableParent(table) || window,
    scrollToTop,
    scrollAndCollectRows,
  };
}

// === EXPORT ======================================================

function exportResults(parameterHandler, lines) {
  const csvText = parameterHandler.export();

  const createAndClickDownloadLink = (blob, filename) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  createAndClickDownloadLink(new Blob([csvText], { type: 'text/csv' }), 'scraped_results.csv');
  createAndClickDownloadLink(new Blob([lines.join('\n')], { type: 'text/plain' }), 'raw_output_lines.txt');
}

// === ROW PROCESSING ==============================================

function makeProcessRowFn({ rowNumberColIndex, colIdIndex, colRechercheIndex, data, lines }) {
  return (row) => {
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;

    const rowNumber = cells[rowNumberColIndex]?.textContent?.trim() || (data.length + 1);
    const id = cells[colIdIndex]?.textContent?.trim() || '';
    const recherche = cells[colRechercheIndex]?.textContent?.trim() || '?';

    if (!id) return;

    lines.push(`${rowNumber}. ${recherche} | ${id}`);
    data.push({ LIBE_RECH_LIEN: recherche, ID_EMPL: id });
  };
}

// === MAIN SCRAPER ================================================

async function runScraper() {
  const prepared = await prepareScraper();
  if (!prepared) return;
  const { parameterHandler, HighlightHelper, ScrollHelper } = prepared;

  const tableElements = getTableElements();
  if (!tableElements) return;
  const { table, thead, tbody } = tableElements;

  const { colRechercheIndex, colIdIndex } = getRequiredColumnIndices(thead);
  if (colRechercheIndex === -1 || colIdIndex === -1) {
    console.error("Colonnes requises non trouvées.");
    alert("Colonnes LIBE_RECH_LIEN ou ID_EMPL manquantes.");
    return;
  }

  const rowNumberColIndex = detectRowNumberColIndex(table);
  const columnIndices = [colIdIndex, colRechercheIndex];
  const triCodes = ['LIBE_RECH_LIEN', 'ID_EMPL'];
  const data = [], lines = [];

  parameterHandler.nomColonnes = triCodes;
  parameterHandler.donnees = data;

  const {
    clearAllHighlights,
    fadeOutHighlightByHeaderLabel,
    fadeOutColumnHighlight,
  } = prepareHighlighting(HighlightHelper, columnIndices, triCodes);

  const {
    scrollContainer,
    scrollToTop,
    scrollAndCollectRows,
  } = getScrollContainerAndHelpers(ScrollHelper, table);

  scrollToTop(scrollContainer);
  await wait(50);

  const seenRows = new WeakSet();
  const processRowFn = makeProcessRowFn({
    rowNumberColIndex,
    colIdIndex,
    colRechercheIndex,
    data,
    lines,
  });

  await scrollAndCollectRows({ tbody, scrollContainer, processRowFn, seenRows, lines });
  await wait(30);

  fadeOutHighlightByHeaderLabel(triCodes);
  columnIndices.forEach(fadeOutColumnHighlight);
  clearAllHighlights();

  if (data.length === 0) {
    alert("Aucune donnée n'a été trouvée.");
    return;
  }

  exportResults(parameterHandler, lines);
}
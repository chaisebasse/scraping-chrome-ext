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

// ========== Enregistrement de l'écouteur principal ==========

// Évite l'enregistrement multiple du listener en cas d'injections répétées du script
if (!window.scraperListenerRegistered) {
  window.scraperListenerRegistered = true;

  // Réception du message depuis popup.js pour lancer le scraping
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runScraper") {
      chrome.storage.sync.get("idIndex", ({ idIndex }) => {
        if (typeof idIndex !== "number" || isNaN(idIndex)) {
          alert("Index de colonne invalide ou non défini.");
          sendResponse({ status: 'error', message: 'Invalid index' });
          return;
        }

        runScraper(idIndex); // Lancement du scraping avec l'index défini
        sendResponse({ status: 'ok' });
      });

      return true; // Permet une réponse asynchrone
    }
  });
}

// ========== Fonction utilitaire : Détection dynamique de la colonne "Numéro de ligne" ==========

/**
 * Détecte dynamiquement l'index de la colonne contenant un numéro de ligne (ex: 'N°').
 * Fallback à la colonne 0 si aucun intitulé connu n’est trouvé.
 * @param {HTMLTableElement} table
 * @returns {number} index de la colonne, ou 0 par défaut
 */
function detectRowNumberColIndex(table) {
  const headers = table.querySelectorAll('thead th');
  for (let i = 0; i < headers.length; i++) {
    const label = headers[i].textContent?.trim().toLowerCase();
    if (label === 'n°') {
      return i;
    }
  }
  return 0; // Fallback si aucun intitulé détecté
}

// ========== Fonction principale de scraping ==========

/**
 * Fonction principale qui extrait les données du tableau HTML et les exporte en CSV + TXT.
 * S'appuie sur les helpers pour gérer le scroll, la détection des lignes et les surbrillances visuelles.
 * @param {number} idIndex - Index de la colonne contenant l'ID à extraire.
 */
async function runScraper(idIndex) {
  await window.parameterHandlerReady;
  const parameterHandler = window.parameterHandler;
  if (!parameterHandler) {
    console.error("parameterHandler non initialisé.");
    return;
  }

  // Chargement des modules utilitaires (Highlight + Scroll)
  await window.highlightHelperReady;
  const HighlightHelper = window.HighlightHelper;
  if (!HighlightHelper) {
    console.error("HighlightHelper est undefined. Vérifier le chargement du module.");
    return;
  }

  await window.scrollHelperReady;
  const ScrollHelper = window.ScrollHelper;
  if (!ScrollHelper) {
    console.error("ScrollHelper est undefined. Vérifier le chargement du module.");
    return;
  }

  const {
    injectHighlightStyles,
    clearAllHighlights,
    highlightByHeaderLabel,
    applyColumnHighlight,
    fadeOutHighlightByHeaderLabel,
    fadeOutColumnHighlight
  } = HighlightHelper;

  const {
    getScrollableParent,
    scrollToTop,
    scrollAndCollectRows
  } = ScrollHelper;

  console.log("Running scraper with index:", idIndex);

  const HEADER_RECHERCHE = 'Recherche / Demande de poste';
  const data = []; // Résultats collectés

  injectHighlightStyles(); // Ajoute les styles CSS pour la surbrillance

  // Configuration de la structure des données à exporter
  parameterHandler.nomColonnes = [HEADER_RECHERCHE, 'ID'];
  parameterHandler.donnees = data;

  // Récupération du tableau cible
  const table = document.getElementById('DataTables_Table_0');
  if (!table) {
    console.error('Tableau introuvable.');
    return;
  }

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (!thead || !tbody) {
    console.error("Structure du tableau invalide (thead ou tbody manquant).");
    return;
  }

  // Création d'une map des en-têtes vers leurs index
  const headerMap = {};
  thead.querySelectorAll('th').forEach((th, index) => {
    const headerName = th.innerText.trim();
    headerMap[headerName] = index;
  });

  // Détection automatique de la colonne numéro de ligne
  const rowNumberColIndex = detectRowNumberColIndex(table);

  const headersOfInterest = [HEADER_RECHERCHE];

  // Surbrillance visuelle des colonnes ciblées
  applyColumnHighlight(idIndex);
  highlightByHeaderLabel(headersOfInterest);

  // Scroll vers le haut avant de démarrer le scraping
  const scrollContainer = getScrollableParent(table) || window;
  scrollToTop(scrollContainer);
  await new Promise(resolve => setTimeout(resolve, 50)); // Laisse le temps aux mutations

  const lines = [];
  const seenRows = new WeakSet(); // Pour éviter les doublons DOM

  /**
   * Traite chaque ligne <tr> pour extraire les données nécessaires.
   */
  const processRowFn = (row, lines) => {
    const cells = row.querySelectorAll('td');
    const rowNumberCell = cells[rowNumberColIndex];
    const rowNumber = rowNumberCell?.textContent?.trim() || (data.length + 1);

    const idCell = cells[idIndex];
    if (!idCell || !idCell.innerText.trim()) return;

    const id = idCell.innerText.trim();
    const recherche = cells[headerMap[HEADER_RECHERCHE]]?.innerText.trim() || '?';

    lines.push(`${rowNumber}. ${recherche} | ${id}`);
    data.push({ [HEADER_RECHERCHE]: recherche, ID: id });
  };

  // Scroll + collecte des lignes à l’aide d’un MutationObserver
  await scrollAndCollectRows({
    tbody,
    scrollContainer,
    processRowFn,
    seenRows,
    lines,
  });

  // Pause finale après la dernière mutation
  await new Promise(resolve => setTimeout(resolve, 30));

  // Nettoyage des effets visuels
  fadeOutHighlightByHeaderLabel(headersOfInterest);
  fadeOutColumnHighlight(idIndex);
  clearAllHighlights();

  if (data.length === 0) {
    alert("Aucune donnée n'a été collectée. Vérifier que le tableau soit chargé et que l'index de colonne soit correct.");
    return;
  }

  // === Export CSV ===
  const csvText = parameterHandler.export();
  const blob = new Blob([csvText], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'scraped_results.csv';
  link.click();

  // === Export TXT brut ===
  const txtBlob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const txtLink = document.createElement('a');
  txtLink.href = URL.createObjectURL(txtBlob);
  txtLink.download = 'raw_output_lines.txt';
  txtLink.click();
}




/*
AMELIORATIONS :

- Afficher une notification (ou Toast) plutôt qu’un alert pour une meilleure UX.

*/
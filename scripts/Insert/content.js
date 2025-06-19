/**
 * Retourne la correspondance entre les clés des données extraites et les noms des champs du formulaire.
 * @returns {Object} Mapping clé donnée → nom champ input
 */
function getFormInputMapping() {
  return {
    lastName: "MP:NOM",
    name: "MP:PREN",
    phone: "MP:TELE",
    email: "MP:MAIL",
    jobId: "MP:ID_RECH",
    // publicProfileUrl: "MP:COMM_CV",
  };
}

/**
 * Remplit un champ de formulaire (input ou textarea) avec une valeur si le champ existe et que la valeur est définie.
 * Envoie les événements "input" et "change" pour déclencher les réactions éventuelles liées au formulaire.
 * @param {string} fieldName - Nom du champ (name=...)
 * @param {string} value - Valeur à insérer
 */
function populateInput(inputName, value) {
  if (!value) return;

  const element = document.querySelector(`[name="${inputName}"]`);
  if (!element) {
    console.warn(`No input/select/textarea found with name="${inputName}"`);
    return;
  }

  if (element.tagName.toLowerCase() === "select") {
    const option = [...element.options].find(opt => opt.value === value);
    if (option) {
      element.value = value;
      triggerFormEvents(element);
    } else {
      console.warn(`No option with value "${value}" found in select[name="${inputName}"]`);
    }
  } else {
    element.value = value;
    triggerFormEvents(element);
  }
}

function triggerFormEvents(element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Parcourt toutes les paires clé → nom input du mapping et remplit chaque champ avec la donnée correspondante.
 * En mode test, utilise des valeurs test à la place des données réelles (commenter/décommenter selon usage).
 * @param {Object} scrapedData - Données extraites à insérer dans le formulaire
 */
function fillFormFields(scrapedData) {
  const mapping = getFormInputMapping();

  const testValues = {
    lastName: "TestNom",
    name: "TestPrenom",
    phone: "0600000000",
    email: "test@example.com",
    jobId: "759",
    publicProfileUrl: "https://linkedin.com/in/test",
  };

  return requestSelectedJobId()
    .then((selectedJobId) => {
      if (selectedJobId) {
        scrapedData.jobId = selectedJobId;
      }

      for (const [dataKey, inputName] of Object.entries(mapping)) {
        // populateInput(inputName, testValues[dataKey]);
        populateInput(inputName, scrapedData[dataKey]);
      }
    })
    .catch((error) => {
      console.error("Could not get job ID:", error);
    });
}

function requestSelectedJobId() {
  return new Promise((resolve) => {
    window.addEventListener("message", function handler(event) {
      if (event.source !== window) return;
      if (event.data.type === "FROM_EXTENSION_SELECTED_JOB_ID") {
        window.removeEventListener("message", handler);
        resolve(event.data.lastJobId);
      }
    });

    window.postMessage({ type: "GET_SELECTED_JOB_ID" }, "*");
  });
}

/**
 * Finalise l'interaction avec le formulaire en déclenchant la soumission via oF.submit() si disponible.
 * Enregistre dans sessionStorage un indicateur pour signaler la soumission.
 */
function finalizeFormSubmission() {
  if (window.oF && typeof window.oF.submit === "function") {
    window.oF.submit();
    sessionStorage.setItem("justSubmittedCandidateForm", "true");
  } else {
    console.warn("oF.submit() non disponible.");
  }
}

/**
 * Renvoie une promesse qui se résout après un délai donné en millisecondes.
 * Utile pour temporiser des actions asynchrones.
 * @param {number} ms - Durée du délai en millisecondes
 * @returns {Promise}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gère la soumission des données candidates reçues en remplissant le formulaire puis en le soumettant.
 * @param {Object} payload - Données candidates extraites à insérer et soumettre
 */
function handleCandidateDataSubmission(payload) {
  fillFormFields(payload)
    .then(() => finalizeFormSubmission())
    .catch((error) => console.error("Error during candidate submission:", error));
}

/**
 * Configure l'écouteur d'événements "FROM_EXTENSION" pour recevoir les données candidates envoyées par l'extension.
 * Si un CV en base64 est présent, il est stocké dans sessionStorage.
 * Lance la soumission du formulaire avec les données reçues.
 */
function setupExtensionListener() {
  window.addEventListener("FROM_EXTENSION", async (event) => {
    const { action, payload } = event.detail || {};

    if (action === "submit_candidate_data") {
      if (payload.cvBase64) storeCvBase64(payload.cvBase64);
      handleCandidateDataSubmission(payload);
    }
  });
}

function storeCvBase64(base64) {
  try {
    sessionStorage.setItem('linkedinCvBase64', base64);
    console.log("PDF base64 stocké dans sessionStorage");
  } catch (error) {
    console.error("Erreur lors du stockage du PDF base64 :", error);
  }
}


// Initialisation du listener à l'exécution du script
setupExtensionListener();

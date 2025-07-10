/**
 * Retourne la correspondance entre les clés de données extraites et les noms des champs du formulaire MP.
 *
 * @returns {Object} Un objet associant chaque clé de donnée à un nom d'input HTML
 */
function getFormInputMapping() {
  return {
    lastName: "MP:NOM",
    firstName: "MP:PREN",
    phone: "MP:TELE",
    email: "MP:MAIL",
    jobId: "MP:ID_RECH",
    // publicProfileUrl: "MP:COMM_CV",
  };
}

/**
 * Remplit un champ de formulaire si celui-ci est trouvé et que la valeur est définie.
 *
 * @param {string} inputName - Le nom de l'attribut `name` de l'input HTML.
 * @param {string} value - La valeur à insérer dans le champ.
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

/**
 * Parcourt la table de correspondance et remplit les champs du formulaire avec les données fournies.
 *
 * @param {Object} scrapedData - Les données extraites à insérer dans le formulaire.
 */
function fillFormFields(scrapedData) {
  const mapping = getFormInputMapping();

  const testValues = {
    lastName: "TestNom",
    firstName: "TestPrenom",
    phone: "0600000000",
    email: "test@example.com",
    jobId: "759",
    // publicProfileUrl: "https://linkedin.com/in/test",
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

      // Statically set the candidate status to "A traiter" (value 2) for every candidate.
      populateInput("MP:ID_STAT", "2");

      // Dynamically set the candidate origin based on source and sourceType.
      const originMapping = {
        linkedin: { annonce: '4', chasse: '11' },
        hellowork: { annonce: '17', chasse: '14' }
      };
      const { source, sourceType } = scrapedData;
      const originCvValue = originMapping[source]?.[sourceType];

      if (originCvValue) {
        console.log(`[MP Insert] Setting 'Origine CV' to value: ${originCvValue} for source: ${source}/${sourceType}`);
        populateInput("MP:ID_ORIG_CV", originCvValue);
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

function triggerFormEvents(element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Finalise la soumission du formulaire en appelant la méthode `oF.submit()`.
 * Utilise sessionStorage pour marquer la soumission.
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
 * Retourne une promesse qui se résout après un certain délai.
 *
 * @param {number} ms - Le nombre de millisecondes à attendre.
 * @returns {Promise<void>} Une promesse qui se résout après `ms` millisecondes.
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gère la réception des données d’un candidat et déclenche le remplissage + la soumission du formulaire.
 *
 * @param {Object} payload - Les données du candidat à insérer.
 */
function handleCandidateDataSubmission(payload) {
  if (payload.profileUrl && payload.source) {
    const context = {
      profileUrl: payload.profileUrl,
      source: payload.source,
      attachmentCount: payload.attachmentCount || 0,
    };
    sessionStorage.setItem("submissionContext", JSON.stringify(context));
  }

  fillFormFields(payload)
    .then(() => finalizeFormSubmission())
    .catch((error) => console.error("Error during candidate submission:", error));
}

/**
 * Met en place un écouteur d’événement pour recevoir les messages envoyés depuis l’extension.
 * Attend l’action "submit_candidate_data" et, si un CV est présent en base64, le stocke.
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
    sessionStorage.setItem('scrapedCvBase64', base64);
    console.log("PDF base64 stocké dans sessionStorage");
  } catch (error) {
    console.error("Erreur lors du stockage du PDF base64 :", error);
  }
}

// Initialisation de l'écouteur
setupExtensionListener();
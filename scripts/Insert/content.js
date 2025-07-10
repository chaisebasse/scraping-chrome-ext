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
  };
}

/**
 * Remplit un champ de type 'select'.
 * @param {HTMLSelectElement} element - L'élément select à remplir.
 * @param {string} value - La valeur à sélectionner.
 */
function populateSelectInput(element, value) {
  const option = [...element.options].find(opt => opt.value === value);
  if (option) {
    element.value = value;
    triggerFormEvents(element);
  } else {
    console.warn(`Aucune option avec la valeur "${value}" trouvée dans select[name="${element.name}"]`);
  }
}

/**
 * Remplit un champ de formulaire simple (input, textarea).
 * @param {HTMLInputElement|HTMLTextAreaElement} element - L'élément à remplir.
 * @param {string} value - La valeur à insérer.
 */
function populateSimpleInput(element, value) {
  element.value = value;
  triggerFormEvents(element);
}

/**
 * Remplit un champ de formulaire, en déléguant aux fonctions spécialisées.
 * @param {string} inputName - Le nom de l'attribut `name` de l'input.
 * @param {string} value - La valeur à insérer.
 */
function populateInput(inputName, value) {
  if (!value) return;
  const element = document.querySelector(`[name="${inputName}"]`);
  if (!element) {
    console.warn(`Aucun champ trouvé avec le nom="${inputName}"`);
    return;
  }

  if (element.tagName.toLowerCase() === "select") {
    populateSelectInput(element, value);
  } else {
    populateSimpleInput(element, value);
  }
}

/**
 * Récupère la valeur pour le champ 'Origine CV' en fonction de la source.
 * @param {string} source - La source du candidat (ex: 'linkedin').
 * @param {string} sourceType - Le type de source (ex: 'annonce').
 * @returns {string|undefined} La valeur correspondante.
 */
function getOriginCvValue(source, sourceType) {
  const originMapping = {
    linkedin: { annonce: '4', chasse: '11' },
    hellowork: { annonce: '17', chasse: '14' }
  };
  return originMapping[source]?.[sourceType];
}

/**
 * Remplit le champ 'Origine CV' du formulaire.
 * @param {Object} scrapedData - Les données du candidat.
 */
function populateOriginField(scrapedData) {
  const { source, sourceType } = scrapedData;
  const originCvValue = getOriginCvValue(source, sourceType);

  if (originCvValue) {
    console.log(`[MP Insert] Définition de 'Origine CV' à la valeur : ${originCvValue} pour la source : ${source}/${sourceType}`);
    populateInput("MP:ID_ORIG_CV", originCvValue);
  }
}

/**
 * Remplit les champs principaux du formulaire (nom, email, etc.).
 * @param {Object} scrapedData - Les données du candidat.
 * @param {Object} mapping - La table de correspondance des champs.
 */
function populateMainFields(scrapedData, mapping) {
  for (const [dataKey, inputName] of Object.entries(mapping)) {
    populateInput(inputName, scrapedData[dataKey]);
  }
}

/**
 * Orchestre le remplissage de tous les champs du formulaire.
 * @param {Object} scrapedData - Les données extraites à insérer.
 */
async function fillFormFields(scrapedData) {
  scrapedData.jobId = await requestSelectedJobId();
  const mapping = getFormInputMapping();
  populateMainFields(scrapedData, mapping);
  populateInput("MP:ID_STAT", "2");
  populateOriginField(scrapedData);
}

/**
 * Crée le gestionnaire de réponse pour la promesse `requestSelectedJobId`.
 * @param {function} resolve - La fonction de résolution de la promesse.
 * @returns {function} Le gestionnaire d'événement.
 */
function createJobIdResponseHandler(resolve) {
  const handler = (event) => {
    if (event.source !== window || event.data.type !== "FROM_EXTENSION_SELECTED_JOB_ID") {
      return;
    }
    window.removeEventListener("message", handler);
    resolve(event.data.lastJobId);
  };
  return handler;
}

/**
 * Demande l'ID de la recherche associée sélectionnée au script de pont.
 * @returns {Promise<string|null>} L'ID de la recherche.
 */
function requestSelectedJobId() {
  return new Promise((resolve) => {
    const handler = createJobIdResponseHandler(resolve);
    window.addEventListener("message", handler);
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
  if (window.oF?.submit) {
    window.oF.submit();
    sessionStorage.setItem("justSubmittedCandidateForm", "true");
  } else {
    console.warn("oF.submit() n'est pas disponible.");
  }
}

/**
 * Sauvegarde le contexte de la soumission dans sessionStorage.
 * @param {Object} payload - Les données du candidat.
 */
function saveSubmissionContext(payload) {
  if (!payload.profileUrl || !payload.source) return;
  const context = {
    profileUrl: payload.profileUrl,
    source: payload.source,
    attachmentCount: payload.attachmentCount || 0,
  };
  sessionStorage.setItem("submissionContext", JSON.stringify(context));
}

/**
 * Gère la réception des données d’un candidat et déclenche le remplissage + la soumission du formulaire.
 * @param {Object} payload - Les données du candidat à insérer.
 */
async function handleCandidateDataSubmission(payload) {
  saveSubmissionContext(payload);
  try {
    await fillFormFields(payload);
    finalizeFormSubmission();
  } catch (error) {
    console.error("Erreur lors de la soumission du candidat :", error);
  }
}

/**
 * Gère les événements personnalisés provenant de l'extension.
 * @param {CustomEvent} event - L'événement reçu.
 */
function handleExtensionEvent(event) {
  const { action, payload } = event.detail || {};
  if (action !== "submit_candidate_data") return;

  if (payload.cvBase64) {
    storeCvBase64(payload.cvBase64);
  }
  handleCandidateDataSubmission(payload);
}

/**
 * Met en place un écouteur d’événement pour recevoir les messages envoyés depuis l’extension.
 */
function setupExtensionListener() {
  window.addEventListener("FROM_EXTENSION", handleExtensionEvent);
}

function storeCvBase64(base64) {
  try {
    sessionStorage.setItem('scrapedCvBase64', base64);
    console.log("PDF en base64 stocké dans sessionStorage");
  } catch (error) {
    console.error("Erreur lors du stockage du PDF en base64 :", error);
  }
}

// Initialisation de l'écouteur
setupExtensionListener();
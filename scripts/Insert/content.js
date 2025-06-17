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

  const input = document.querySelector(`input[name="${inputName}"]`);
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    console.warn(`No input or textarea found with name="${inputName}"`);
  }
}

/**
 * Parcourt toutes les paires clé → nom input du mapping et remplit chaque champ avec la donnée correspondante.
 * En mode test, utilise des valeurs test à la place des données réelles (commenter/décommenter selon usage).
 * @param {Object} scrapedData - Données extraites à insérer dans le formulaire
 */
function fillFormFields(scrapedData) {
  const mapping = getFormInputMapping();

  // Valeurs de test, à remplacer par les vraies données lors du déploiement
  const testValues = {
    lastName: "TestNom",
    name: "TestPrenom",
    phone: "0600000000",
    email: "test@example.com",
    publicProfileUrl: "https://linkedin.com/in/test",
  };

  for (const [dataKey, inputName] of Object.entries(mapping)) {
    // Remplacer testValues par scrapedData pour l'usage réel
    populateInput(inputName, testValues[dataKey]);
    // populateInput(inputName, scrapedData[dataKey]);
  }
  debugger;

  setTimeout(() => {
    console.log("Continuing after delay...");
  }, 10000);  // 10 seconds pause
}

/**
 * Finalise l'interaction avec le formulaire en déclenchant la soumission via oF.submit() si disponible.
 * Enregistre dans sessionStorage un indicateur pour signaler la soumission.
 */
async function finalizeFormSubmission() {
  if (window.oF && typeof window.oF.submit === "function") {
    console.log("Soumission du formulaire via oF.submit()");
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
async function handleCandidateDataSubmission(payload) {
  fillFormFields(payload);
  await finalizeFormSubmission();
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
      if (payload.cvBase64) {
        try {
          sessionStorage.setItem('linkedinCvBase64', payload.cvBase64);
          console.log("PDF base64 stocké dans sessionStorage");
        } catch (error) {
          console.error("Erreur lors du stockage du PDF base64 :", error);
        }
      }

      handleCandidateDataSubmission(payload);
    }
  });
}

// Initialisation du listener à l'exécution du script
setupExtensionListener();

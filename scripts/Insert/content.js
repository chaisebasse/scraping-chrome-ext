/**
 * Retourne la correspondance entre les clés de données extraites et les noms des champs du formulaire MP.
 *
 * @returns {Object} Un objet associant chaque clé de donnée à un nom d'input HTML
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
 * Remplit un champ de formulaire si celui-ci est trouvé et que la valeur est définie.
 *
 * @param {string} inputName - Le nom de l'attribut `name` de l'input HTML.
 * @param {string} value - La valeur à insérer dans le champ.
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
 * Parcourt la table de correspondance et remplit les champs du formulaire avec les données fournies.
 *
 * @param {Object} scrapedData - Les données extraites à insérer dans le formulaire.
 */
function fillFormFields(scrapedData) {
  const mapping = getFormInputMapping();

  const testValues = {
    lastName: "TestNom",
    name: "TestPrenom",
    phone: "0600000000",
    email: "test@example.com",
    // publicProfileUrl: "https://linkedin.com/in/test",
  };

  for (const [dataKey, inputName] of Object.entries(mapping)) {
    populateInput(inputName, testValues[dataKey]);
    // populateInput(inputName, scrapedData[dataKey]);
  }
}

/**
 * Finalise la soumission du formulaire en appelant la méthode `oF.submit()`.
 * Utilise sessionStorage pour marquer la soumission.
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
async function handleCandidateDataSubmission(payload) {
  fillFormFields(payload);
  await finalizeFormSubmission();
}

/**
 * Met en place un écouteur d’événement pour recevoir les messages envoyés depuis l’extension.
 * Attend l’action "submit_candidate_data" et, si un CV est présent en base64, le stocke.
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
          console.error("Erreur lors du stockage du PDF base64:", error);
        }
      } else {
        console.warn("Aucun cvBase64 trouvé dans le payload; le PDF ne sera pas stocké.");
      }

      handleCandidateDataSubmission(payload); 
    }
  });
}

// Initialisation de l'écouteur
setupExtensionListener();
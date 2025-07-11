/**
 * @fileoverview Gère les actions post-soumission sur MeilleurPilotage.
 * @description Ce script s'exécute après la soumission du formulaire de création de candidat.
 * Il vérifie les erreurs d'insertion, et en cas de succès, extrait le numéro interne
 * du candidat pour uploader le CV associé.
 */

// === Point d'Entrée & Logique Principale ===

/**
 * Point d'entrée principal du script post-soumission.
 * S'exécute uniquement si le formulaire vient d'être soumis.
 */
(async function main() {
  if (!wasFormJustSubmitted()) return;

  await handlePostSubmissionLogic();
})();

/**
 * Orchestre la logique post-soumission : gestion des erreurs ou upload du CV.
 */
async function handlePostSubmissionLogic() {
  const insertionErrors = getInsertionErrors();

  if (insertionErrors.length > 0) {
    handleInsertionFailure(insertionErrors);
  } else {
    await handleInsertionSuccess();
  }

  sessionStorage.removeItem('submissionContext');
}

/**
 * Gère le cas d'une insertion réussie.
 * Extrait le FK, upload le CV si nécessaire, et demande la fermeture de l'onglet.
 */
async function handleInsertionSuccess() {
  const fk = extractFk();
  if (!fk) {
    console.warn("Échec de l'extraction du numéro interne. Le CV ne peut pas être uploadé et l'onglet ne sera pas fermé.");
    return;
  }

  const submissionContext = JSON.parse(sessionStorage.getItem("submissionContext") || "{}");
  if (submissionContext.attachmentCount > 0) {
    console.log("CV attendu, tentative d'upload...");
    await uploadCandidateCv(fk);
  }

  console.log("Candidat inséré avec succès. Fermeture de l'onglet...");
  chrome.runtime.sendMessage({ type: "close_successful_submission_tab" });
}

/**
 * Gère le cas d'une insertion échouée en envoyant les erreurs au background script.
 * @param {Array<object>} errors - Le tableau des erreurs d'insertion.
 */
function handleInsertionFailure(errors) {
  chrome.runtime.sendMessage({
    type: "addInsertionErrors",
    payload: errors
  });
}

// === Extraction des Erreurs ===

/**
 * Vérifie si un texte d'erreur contient un type d'erreur spécifique.
 * @param {string} text - Le texte à vérifier.
 * @param {'duplicate' | 'mandatoryMissing'} errorType - Le type d'erreur à rechercher.
 * @returns {boolean} Vrai si l'erreur est trouvée, sinon faux.
 */
function includesError(text, errorType) {
  if (errorType === "duplicate") {
    return text.includes("a déjà été créé");
  } else if (errorType === "mandatoryMissing") {
    return text.includes("Vous devez saisir le");
  }
  return false;
}

/**
 * Extrait et formate les erreurs d'insertion depuis la page de résultat.
 * @returns {Array<object>} Un tableau d'objets d'erreur.
 */
function getInsertionErrors() {
  const errors = [];
  const submissionContext = JSON.parse(
    sessionStorage.getItem("submissionContext") || "{}"
  );

  const mailErrorText = document.querySelector("mp\\:err_mail")?.innerText.trim() || "";
  const lastNameErrorText = document.querySelector("mp\\:err_nom")?.innerText.trim() || "";
  const firstNameErrorText = document.querySelector("mp\\:err_pren")?.innerText.trim() || "";
  const fullName = getFormName();

  if (includesError(mailErrorText, "duplicate") || includesError(lastNameErrorText, "duplicate")) {
    errors.push({
      type: "duplicate",
      name: fullName,
      reason: "Même mail ou nom déjà utilisé.",
      ...submissionContext
    });
  }

  if (includesError(firstNameErrorText, "mandatoryMissing") || includesError(lastNameErrorText, "mandatoryMissing")) {
    errors.push({
      type: "mandatoryMissing",
      name: fullName,
      reason: "Prénom ou nom manquant.",
      ...submissionContext
    });
  }

  return errors;
}

/**
 * Extrait le nom complet du candidat depuis le titre de la page.
 * @returns {string} Le nom complet formaté, ou "Nom inconnu".
 */
function getFormName() {
  const titleText = document.title;
  const prefix = "Candidat";
  const index = titleText.indexOf(prefix);

  if (index === -1) return "Nom inconnu";

  const namePart = titleText.slice(index + prefix.length).trim();

  if (!namePart) return "Nom inconnu";

  const parts = namePart.split(/\s+/);

  if (parts.length < 2) return namePart;

  const nom = parts.pop();
  const prenom = parts.join(" ");

  return `${prenom} ${nom}`.trim();
}

// === Logique d'Upload de CV ===

/**
 * Vérifie si le formulaire vient d’être soumis en consultant un flag dans sessionStorage.
 * @returns {boolean} Vrai si le formulaire vient d'être soumis, sinon faux.
 */
function wasFormJustSubmitted() {
  const flag = sessionStorage.getItem("justSubmittedCandidateForm");
  if (flag) {
    sessionStorage.removeItem("justSubmittedCandidateForm");
    return true;
  }
  return false;
}

/**
 * Extrait le numéro interne (fk) du candidat affiché sur la page après soumission.
 * @returns {string|null} Le numéro interne extrait, ou null si non trouvé.
 */
function extractFk() {
  const container = document.querySelector("#FORM_PRIN");
  const firstDiv = container?.querySelector("div");
  const text = firstDiv?.textContent || "";
  const match = text.match(/Numéro interne:\s*(\d+)/i);
  return match?.[1] || null;
}

/**
 * Orchestre la récupération et l'envoi du CV à MeilleurPilotage.
 * @param {string} fk - Le numéro interne du candidat (foreign key).
 */
async function uploadCandidateCv(fk) {
  const cvBlob = await getScrapedCv();
  if (!cvBlob) {
    console.warn("Aucun CV trouvé dans sessionStorage pour l'upload.");
    return;
  }

  try {
    const pk = await uploadPdfToMP(cvBlob, fk);
    console.log("PDF uploadé avec succès. PK reçu :", pk);
  } catch (err) {
    console.error("Erreur lors de l'upload du PDF :", err);
  }
}

// === Utilitaires de Gestion du CV ===

/**
 * Convertit une chaîne de caractères base64 en un objet Blob.
 * @param {string} base64 - Les données du fichier encodées en base64.
 * @param {string} [contentType='application/pdf'] - Le type MIME du fichier.
 * @returns {Blob} Un objet Blob contenant les données décodées.
 */
function base64ToBlob(base64, contentType = 'application/pdf') {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

/**
 * Tente de manière sécurisée de convertir le base64 en Blob et de résoudre la promesse.
 * @param {string} base64 - Les données du CV encodées en base64.
 * @param {Function} resolve - La fonction de résolution de la promesse parente.
 * @param {Function} reject - La fonction de rejet de la promesse parente.
 */
function resolveSafeBlob(base64, resolve, reject) {
  try {
    const blob = base64ToBlob(base64);
    resolve(blob);
  } catch (err) {
    console.error("Erreur lors de la conversion base64 vers Blob :", err);
    reject(err);
  }
}

/**
 * Attend l’apparition du CV encodé en base64 dans `sessionStorage`.
 * @param {number} [timeout=5000] - Temps maximal d’attente en millisecondes.
 * @returns {Promise<Blob>} Une promesse qui se résout avec le Blob du CV.
 */
function getScrapedCv(timeout = 5000) {
  const deadline = Date.now() + timeout;

  return new Promise((resolve, reject) => {
    const tryResolveCv = () => {
      const base64 = sessionStorage.getItem("scrapedCvBase64");
      if (base64) {
        return resolveSafeBlob(base64, resolve, reject);
      }

      if (Date.now() < deadline) {
        setTimeout(tryResolveCv, 300);
      } else {
        reject(new Error("Timeout: Le CV n'a pas été trouvé dans sessionStorage."));
      }
    };

    tryResolveCv();
  });
}

// === Communication avec MeilleurPilotage ===

/**
 * Envoie le fichier PDF au serveur MP via une requête POST multipart/form-data.
 * @param {Blob} pdfBlob - Le fichier PDF (CV) à uploader.
 * @param {string} fk - Le numéro interne (foreign key) du candidat auquel lier le CV.
 * @returns {Promise<string|null>} Une promesse qui se résout avec le `pk` (primary key) du CV uploadé, ou `null`.
 */
async function uploadPdfToMP(pdfBlob, fk) {
  const formData = buildCvFormData(pdfBlob, fk);
  const response = await fetch("http://s-tom-1:90/MeilleurPilotage/servlet/UG", {
    method: "POST",
    body: formData,
    credentials: "include"
  });

  return extractPkFromHtml(await response.text());
}

/**
 * Construit l’objet `FormData` nécessaire pour la requête d'upload du CV.
 * @param {Blob} pdfBlob - Le fichier PDF à inclure dans le formulaire.
 * @param {string} fk - Le numéro interne du candidat.
 * @returns {FormData} L’objet FormData prêt à être envoyé.
 */
function buildCvFormData(pdfBlob, fk) {
  const formData = new FormData();
  formData.append("del", "false");
  formData.append("type", "MT__RECR_CANDIDAT_CV");
  formData.append("fk", fk);
  formData.append("pk", "");
  formData.append("fichier", new File([pdfBlob], "cv.pdf", { type: "application/pdf" }));
  return formData;
}

/**
 * Extrait la valeur de la clé primaire (`pk`) du CV depuis la réponse HTML du serveur.
 * @param {string} html - Le contenu HTML complet de la réponse du serveur.
 * @returns {string|null} La valeur du champ `pk`, ou `null` si non trouvée.
 */
function extractPkFromHtml(html) {
  const match = html.match(/<input[^>]+name="pk"[^>]+value="(\d+)"/);
  return match?.[1] || null;
}

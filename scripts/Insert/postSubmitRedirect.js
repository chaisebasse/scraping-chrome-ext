// === Extraction du numéro interne et envoi du CV ===
(function () {
  if (!wasFormJustSubmitted()) return;

  const fk = extractFk();
  if (fk) {
    console.log("fk extrait :", fk);
    uploadCandidateCv(fk);
  } else {
    console.warn("Échec de l'extraction du numéro interne.");
  }
})();

/**
 * Vérifie si le formulaire vient d’être soumis (via sessionStorage).
 *
 * @returns {boolean} `true` si le formulaire vient juste d’être soumis, sinon `false`.
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
 * Extrait le numéro interne (fk) affiché sur la page après soumission du formulaire.
 *
 * @returns {string|null} Le numéro interne extrait, ou `null` si non trouvé.
 */
function extractFk() {
  const container = document.querySelector("#FORM_PRIN");
  const firstDiv = container?.querySelector("div");
  const text = firstDiv?.textContent || "";
  const match = text.match(/Numéro interne:\s*(\d+)/i);
  return match?.[1] || null;
}

// === Logique principale d'upload ===

/**
 * Récupère le CV LinkedIn depuis le `sessionStorage` et l'envoie à MeilleurPilotage.
 *
 * @param {string} fk - Le numéro interne du candidat (foreign key).
 */
async function uploadCandidateCv(fk) {
  const cvBlob = await getLinkedinCv();
  if (!cvBlob) {
    return;
  }
  try {
    const pk = await uploadPdfToMP(cvBlob, fk);
    console.log("PDF uploadé, pk reçu :", pk);
  } catch (err) {
    console.error("Erreur lors de l'upload du PDF :", err);
  }
}

// === Fonctions utilitaires ===

/**
 * Convertit une chaîne base64 en objet Blob.
 *
 * @param {string} base64 - Données encodées en base64.
 * @param {string} [contentType='application/pdf'] - Le type MIME du fichier.
 * @returns {Blob} Un objet Blob contenant le fichier décodé.
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
 * Attend l’apparition du CV encodé en base64 dans le `sessionStorage`.
 *
 * @param {number} [timeout=15000] - Temps maximal d’attente en millisecondes.
 * @returns {Promise<Blob>} Une promesse qui se résout avec le Blob du CV.
 */
function getLinkedinCv(timeout = 5000) {
  const deadline = Date.now() + timeout;

  return new Promise((resolve, reject) => {
    const tryResolveCv = () => {
      const base64 = sessionStorage.getItem("linkedinCvBase64");
      if (base64) return resolveSafeBlob(base64, resolve, reject);

      if (Date.now() < deadline) setTimeout(tryResolveCv, 300);
    };

    tryResolveCv();
  });
}

/**
 * Tente de convertir le base64 en Blob et de le retourner via `resolve`, sinon rejette.
 *
 * @param {string} base64 - Données encodées en base64.
 * @param {Function} resolve - Fonction à appeler en cas de succès.
 * @param {Function} reject - Fonction à appeler en cas d’erreur.
 */
function resolveSafeBlob(base64, resolve, reject) {
  try {
    const blob = base64ToBlob(base64);
    resolve(blob);
  } catch (err) {
    reject(err);
  }
}

/**
 * Envoie le fichier PDF au serveur MP via un POST multipart/form-data.
 *
 * @param {Blob} pdfBlob - Le fichier PDF à envoyer.
 * @param {string} fk - Le numéro interne du candidat (foreign key).
 * @returns {Promise<string|null>} Le `pk` renvoyé par le serveur ou `null`.
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
 * Construit l’objet `FormData` utilisé pour l’upload du CV.
 *
 * @param {Blob} pdfBlob - Le fichier PDF à inclure.
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
 * Extrait la valeur du champ `pk` depuis la réponse HTML retournée par le serveur.
 *
 * @param {string} html - Le HTML complet de la réponse.
 * @returns {string|null} La valeur du champ `pk`, ou `null` si non trouvée.
 */
function extractPkFromHtml(html) {
  const match = html.match(/<input[^>]+name="pk"[^>]+value="(\d+)"/);
  return match?.[1] || null;
}

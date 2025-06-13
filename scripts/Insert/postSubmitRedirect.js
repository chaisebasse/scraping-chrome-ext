// === Extraction du numéro interne et lancement de l’upload du CV ===
(function () {
  if (!wasFormJustSubmitted()) return;

  const fk = extractFk();
  if (fk) {
    console.log("fk extrait :", fk);
    uploadCandidateCv(fk);
  } else {
    console.warn("Échec de l’extraction du numéro interne.");
  }
})();

/**
 * Vérifie si le formulaire a été soumis juste avant (flag en sessionStorage).
 * Supprime ensuite ce flag pour éviter les doublons.
 * @returns {boolean} true si formulaire soumis récemment, sinon false
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
 * Extrait le numéro interne (fk) depuis la page, à partir du conteneur #FORM_PRIN.
 * Cherche le texte "Numéro interne: <nombre>" dans le premier div enfant.
 * @returns {string|null} Le numéro interne extrait ou null si non trouvé
 */
function extractFk() {
  const container = document.querySelector("#FORM_PRIN");
  const firstDiv = container?.querySelector("div");
  const text = firstDiv?.textContent || "";
  const match = text.match(/Numéro interne:\s*(\d+)/i);
  return match?.[1] || null;
}

// === Logique principale pour l’envoi du CV ===

/**
 * Télécharge le CV LinkedIn depuis sessionStorage, puis l’envoie au serveur MP avec la fk.
 * Gère les erreurs de façon sécurisée.
 * @param {string} fk Le numéro interne à associer au CV
 */
async function uploadCandidateCv(fk) {
  try {
    const cvBlob = await getLinkedinCv();
    const pk = await uploadPdfToMP(cvBlob, fk);
    console.log("PDF uploadé, pk reçu :", pk);
  } catch (err) {
    console.error("Erreur lors de l’upload du PDF :", err);
  }
}

// === Fonctions utilitaires ===

/**
 * Convertit une chaîne base64 en Blob (par défaut PDF).
 * @param {string} base64 Le contenu encodé en base64
 * @param {string} [contentType='application/pdf'] Le type MIME du Blob
 * @returns {Blob} Le Blob résultant
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
 * Récupère le CV LinkedIn stocké en base64 dans sessionStorage.
 * Attends jusqu’à 15s (par défaut) que le base64 soit disponible.
 * @param {number} [timeout=15000] Timeout en millisecondes
 * @returns {Promise<Blob>} Résout avec un Blob PDF ou rejette en cas de timeout
 */
function getLinkedinCv(timeout = 15000) {
  const deadline = Date.now() + timeout;

  return new Promise((resolve, reject) => {
    const tryResolveCv = () => {
      const base64 = sessionStorage.getItem("linkedinCvBase64");
      if (base64) return resolveSafeBlob(base64, resolve, reject);

      if (Date.now() < deadline) {
        setTimeout(tryResolveCv, 300);
      } else {
        reject(new Error("Timeout: base64 linkedinCvBase64 introuvable dans sessionStorage"));
      }
    };

    tryResolveCv();
  });
}

/**
 * Essaye de convertir le base64 en Blob et appelle resolve ou reject selon le résultat.
 * @param {string} base64
 * @param {function} resolve
 * @param {function} reject
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
 * Envoie le PDF au serveur MP via un POST multipart/form-data.
 * @param {Blob} pdfBlob Le Blob PDF à envoyer
 * @param {string} fk Le numéro interne lié au CV
 * @returns {Promise<string|null>} Résout avec la clé primaire (pk) extraite ou null
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
 * Construit les données du formulaire multipart/form-data pour l’upload.
 * @param {Blob} pdfBlob Le Blob PDF
 * @param {string} fk Le numéro interne
 * @returns {FormData} Le FormData prêt à être envoyé
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
 * Extrait la clé primaire (pk) depuis la réponse HTML du serveur MP.
 * Cherche dans un input nommé "pk".
 * @param {string} html Le contenu HTML en string
 * @returns {string|null} La valeur de pk ou null si non trouvée
 */
function extractPkFromHtml(html) {
  const match = html.match(/<input[^>]+name="pk"[^>]+value="(\d+)"/);
  return match?.[1] || null;
}

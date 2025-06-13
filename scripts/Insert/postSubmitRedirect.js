// === Extract internal number and upload CV ===
(function () {
  if (!wasFormJustSubmitted()) return;

  const fk = extractFk();
  if (fk) {
    console.log("fk extracted:", fk);
    uploadCandidateCv(fk);
  } else {
    console.warn("Failed to extract internal number.");
  }
})();

function wasFormJustSubmitted() {
  const flag = sessionStorage.getItem("justSubmittedCandidateForm");
  if (flag) {
    sessionStorage.removeItem("justSubmittedCandidateForm");
    return true;
  }
  return false;
}

function extractFk() {
  const container = document.querySelector("#FORM_PRIN");
  const firstDiv = container?.querySelector("div");
  const text = firstDiv?.textContent || "";
  const match = text.match(/Numéro interne:\s*(\d+)/i);
  return match?.[1] || null;
}

// === Main Upload Logic ===
async function uploadCandidateCv(fk) {
  try {
    const cvBlob = await getLinkedinCv();
    const pk = await uploadPdfToMP(cvBlob, fk);
    console.log("PDF uploaded, got pk:", pk);
  } catch (err) {
    console.error("Error uploading PDF:", err);
  }
}

// === Helpers ===
function base64ToBlob(base64, contentType = 'application/pdf') {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

function getLinkedinCv(timeout = 15000) {
  const deadline = Date.now() + timeout;

  return new Promise((resolve, reject) => {
    const tryResolveCv = () => {
      const base64 = sessionStorage.getItem("linkedinCvBase64");
      if (base64) return resolveSafeBlob(base64, resolve, reject);

      if (Date.now() < deadline) {
        setTimeout(tryResolveCv, 300);
      } else {
        reject(new Error("Timeout waiting for linkedinCvBase64 in storage"));
      }
    };

    tryResolveCv();
  });
}

function resolveSafeBlob(base64, resolve, reject) {
  try {
    const blob = base64ToBlob(base64);
    resolve(blob);
  } catch (err) {
    reject(err);
  }
}

async function uploadPdfToMP(pdfBlob, fk) {
  const formData = buildCvFormData(pdfBlob, fk);
  const response = await fetch("http://s-tom-1:90/MeilleurPilotage/servlet/UG", {
    method: "POST",
    body: formData,
    credentials: "include"
  });

  return extractPkFromHtml(await response.text());
}

function buildCvFormData(pdfBlob, fk) {
  const formData = new FormData();
  formData.append("del", "false");
  formData.append("type", "MT__RECR_CANDIDAT_CV");
  formData.append("fk", fk);
  formData.append("pk", "");
  formData.append("fichier", new File([pdfBlob], "cv.pdf", { type: "application/pdf" }));
  return formData;
}

function extractPkFromHtml(html) {
  const match = html.match(/<input[^>]+name="pk"[^>]+value="(\d+)"/);
  return match?.[1] || null;
}

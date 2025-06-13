// === Phase 1: Extract internal number and upload CV ===
(function () {
  const cameFromFormSubmission = sessionStorage.getItem("justSubmittedCandidateForm");
  if (!cameFromFormSubmission) return;

  sessionStorage.removeItem("justSubmittedCandidateForm");

  const container = document.querySelector("#FORM_PRIN");
  const firstDiv = container?.querySelector("div");
  const text = firstDiv?.textContent || "";
  const match = text.match(/Numéro interne:\s*(\d+)/i);
  const internalNumber = match?.[1];

  if (internalNumber) {
    console.log("Internal number extracted:", internalNumber);
    uploadCandidateCv(internalNumber);
  } else {
    console.warn("Failed to extract internal number.");
  }
})();

// === Main Upload Logic ===
async function uploadCandidateCv(fk) {
  try {
    console.log("Waiting for CV in session storage...");
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
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function check() {
      const base64 = sessionStorage.getItem("linkedinCvBase64");
      if (base64) {
        try {
          const blob = base64ToBlob(base64);
          resolve(blob);
        } catch (err) {
          reject(err);
        }
      } else if (Date.now() < deadline) {
        setTimeout(check, 300);
      } else {
        reject(new Error("Timeout waiting for linkedinCvBase64 in storage"));
      }
    }

    check();
  });
}

async function uploadPdfToMP(pdfBlob, fk) {
  const formData = new FormData();
  formData.append("del", "false");
  formData.append("type", "MT__RECR_CANDIDAT_CV");
  formData.append("fk", fk);
  formData.append("pk", "");
  formData.append("fichier", new File([pdfBlob], "cv.pdf", { type: "application/pdf" }));

  const response = await fetch("http://s-tom-1:90/MeilleurPilotage/servlet/UG", {
    method: "POST",
    body: formData,
    credentials: "include"
  });

  const html = await response.text();
  const match = html.match(/<input[^>]+name="pk"[^>]+value="(\d+)"/);
  return match?.[1] || null;
}

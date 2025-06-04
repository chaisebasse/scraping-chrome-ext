// Wait for an input element by its name attribute
function waitForInput(name, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(`[name="${name}"]`);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: [name="${name}"] not found`));
    }, timeout);
  });
}

// Wait until linkedinCv is available in storage
function waitForLinkedinCv(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function check() {
      chrome.storage.local.get("linkedinCv", (data) => {
        if (data.linkedinCv) {
          const binary = new Uint8Array(data.linkedinCv.data);
          const blob = new Blob([binary], { type: "application/pdf" });
          resolve(blob);
        } else if (Date.now() < deadline) {
          setTimeout(check, 300);
        } else {
          reject(new Error("Timeout waiting for linkedinCv in storage"));
        }
      });
    }

    check();
  });
}

// Helper to upload the PDF to MP
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

// Récupère les données envoyées par le background (injection automatique par tab creation)
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "insertLinkedinData") {
    const { name, lastName, phone, email } = message;

    console.log("[Insert] Données reçues :", message);

    try {
      // 🕒 Wait until CV is available in local storage
      const cvBlob = await waitForLinkedinCv();

      // Fill form fields
      const [nomInput, prenomInput] = await Promise.all([
        waitForInput("MP:NOM"),
        waitForInput("MP:PREN")
      ]);
      nomInput.value = lastName;
      prenomInput.value = name;

      if (phone) {
        const phoneInput = await waitForInput("MP:TELE");
        phoneInput.value = phone;
      }

      if (email) {
        const emailInput = await waitForInput("MP:MAIL");
        emailInput.value = email;
      }

      // Open CV upload section
      const toggle = await waitForInput('ATTACHMENTS_SHOW_MT__RECR_CANDIDAT_CV$');
      toggle.click();
      console.log("[Insert] Pièce jointe: section dépliée");

      // Get fk (usually candidate ID or similar)
      const fkInput = await waitForInput("MP:ID");
      const fk = fkInput.value;
      console.log("[Insert] Found fk:", fk);

      // Upload the PDF directly via POST
      const pk = await uploadPdfToMP(cvBlob, fk);
      if (pk) {
        console.log("[Insert] ✅ PDF uploaded successfully with pk:", pk);
        // Optional: insert pk into a hidden input if needed
        // const pkInput = document.createElement("input");
        // pkInput.type = "hidden";
        // pkInput.name = "uploaded_cv_pk";
        // pkInput.value = pk;
        // document.body.appendChild(pkInput);
      } else {
        console.warn("[Insert] ⚠️ PDF upload failed");
        alert("⚠️ Le CV n'a pas pu être téléversé automatiquement.");
      }

    } catch (err) {
      console.error("[Insert] ❌ Erreur pendant le remplissage ou le téléversement :", err);
    }
  }
});
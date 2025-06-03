// Wait for an input element by its name attribute
function waitForInput(name, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(`input[name="${name}"]`);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(`input[name="${name}"]`);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: input[name="${name}"] not found`));
    }, timeout);
  });
}

// Récupère les données envoyées par le background (injection automatique par tab creation)
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "insertLinkedinData") {
    const { name, lastName, phone, email } = message;

    console.log("[Insert] Données reçues :", message);

    try {
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

      // Simulate uploading the CV
      const fileInput = document.querySelector("#MG_FILE");
      if (fileInput) {
        const fileName = `LinkedIn/LinkedIn_${name.replace(/\s+/g, "_")}_${lastName.replace(/\s+/g, "_")}.pdf`;
        const filePath = `C:\\Users\\${navigator.userAgent.includes("Windows") ? "${user}" : ""}\\Downloads\\LinkedIn\\${fileName}`;

        // NOTE: For security reasons, browser extensions cannot programmatically set <input type="file"> values
        // Users must manually upload the file.
        console.warn(`[Insert] Veuillez téléverser manuellement le fichier : ${filePath}`);
        alert(`Veuillez téléverser le fichier depuis :\n${filePath}`);
      }

    } catch (err) {
      console.error("[Insert] Erreur pendant le remplissage du formulaire :", err);
    }
  }
});
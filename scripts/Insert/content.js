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

/**
 * Simulates a key press (default: ArrowDown) on the last name input to trigger autocomplete.
 */
function pressKeyOnLastNameInput(key = "ArrowDown") {
  const input = document.querySelector('input[name="MP\\:NOM"]');
  if (!input) return;
  input.focus();
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

/**
 * Returns a mapping of scraped data keys to form input names.
 */
function getFormInputMapping() {
  return {
    lastName: "MP:NOM",
    name: "MP:PREN",
    phone: "MP:TELE",
    email: "MP:MAIL",
    publicProfileUrl: "MP:COMM_CV",
  };
}

/**
 * Populates an individual input field if found.
 */
function populateInput(inputName, value) {
  const input = document.querySelector(`input[name="${inputName}"]`);
  if (input && value) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 * Iterates over the mapping and fills in the form inputs.
 */
function fillFormFields(scrapedData) {
  const mapping = getFormInputMapping();

  const testValues = {
    lastName: "TestNom",
    name: "TestPrenom",
    phone: "0600000000",
    email: "test@example.com",
    publicProfileUrl: "https://linkedin.com/in/test",
  };

  for (const [dataKey, inputName] of Object.entries(mapping)) {
    populateInput(inputName, testValues[dataKey]);
    // populateInput(inputName, scrapedData[dataKey]);
  }

  console.log("Form fields populated.");
}

/**
 * Finalizes the form interaction: triggers key event then submits.
 */
async function finalizeFormSubmission() {
  pressKeyOnLastNameInput();
  await wait(1000); // Wait for any autocomplete/ajax logic to settle

  if (window.oF && typeof window.oF.submit === "function") {
    console.log("Submitting form via oF.submit()");
    window.oF.submit();
  } else {
    console.warn("oF.submit() not available.");
  }
}

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles the main logic when data is received from the background script.
 */
async function handleCandidateDataSubmission(payload) {
  fillFormFields(payload);
  await finalizeFormSubmission();
}

/**
 * Listen for messages from the extension.
 */
function setupExtensionListener() {
  window.addEventListener("FROM_EXTENSION", (event) => {
    const { action, payload } = event.detail || {};
    if (action === "submit_candidate_data") {
      handleCandidateDataSubmission(payload);
    }
  });
}

// Initialize
setupExtensionListener();
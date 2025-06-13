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
}

/**
 * Finalizes the form interaction: triggers key event then submits.
 */
async function finalizeFormSubmission() {
  if (window.oF && typeof window.oF.submit === "function") {
    console.log("Submitting form via oF.submit()");
    window.oF.submit();
    sessionStorage.setItem("justSubmittedCandidateForm", "true");
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
  window.addEventListener("FROM_EXTENSION", async (event) => {
    const { action, payload } = event.detail || {};

    if (action === "submit_candidate_data") {
      if (payload.cvBase64) {
        try {
          sessionStorage.setItem('linkedinCvBase64', payload.cvBase64);
          console.log("PDF base64 stored in sessionStorage");
        } catch (error) {
          console.error("Error storing PDF base64:", error);
        }
      } else {
        console.warn("No cvBase64 found in payload; PDF will not be stored.");
      }

      handleCandidateDataSubmission(payload); 
    }
  });
}

// Initialize
setupExtensionListener();
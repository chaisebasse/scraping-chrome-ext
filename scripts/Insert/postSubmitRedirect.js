(function () {
  const cameFromFormSubmission = sessionStorage.getItem("justSubmittedCandidateForm");

  if (!cameFromFormSubmission) return;

  // Clear the flag right away so it doesn’t persist on further reloads
  sessionStorage.removeItem("justSubmittedCandidateForm");

  const container = document.querySelector("#FORM_PRIN");
  const firstDiv = container?.querySelector("div");
  const text = firstDiv?.textContent || "";
  const match = text.match(/Numéro interne:\s*(\d+)/i);
  const internalNumber = match?.[1];

  if (internalNumber) {
    const targetUrl = `http://s-tom-1:90/MeilleurPilotage/servlet/UG?type=MT__RECR_CANDIDAT_CV&fk=${internalNumber}`;
    console.log("Redirecting to:", targetUrl);
    window.location.href = targetUrl;
  } else {
    console.warn("Failed to extract internal number.");
  }
})();

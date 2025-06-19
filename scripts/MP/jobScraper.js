chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_job_ids") {
    try {
      const options = Array.from(document.querySelectorAll('select[name="MP:ID_RECH"] option'))
        .filter(opt => opt.value && opt.textContent.includes("Active:Oui"))
        .map(opt => ({
          label: opt.textContent.trim(),
          value: opt.value.trim()
        }));

      sendResponse({ jobIds: options });
    } catch (e) {
      console.error("Erreur dans jobScraper :", e);
      sendResponse({ jobIds: [] });
    }
  }
});
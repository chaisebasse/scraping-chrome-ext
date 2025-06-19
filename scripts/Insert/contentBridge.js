window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  if (event.data.type === "GET_SELECTED_JOB_ID") {
    const { lastJobId } = await chrome.storage.local.get("lastJobId");
    console.log("lastJobId : ", lastJobId);
    window.postMessage({
      type: "FROM_EXTENSION_SELECTED_JOB_ID",
      lastJobId: lastJobId || null,
    }, "*");
  }
});
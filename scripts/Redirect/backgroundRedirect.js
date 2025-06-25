let storedErrors = [];

export function handleErrors() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "addInsertionErrors") {
      storedErrors = message.payload || [];
      return true;
    }

    if (message.type === "getInsertionErrors") {
      sendResponse(storedErrors);
      return true;
    }
  });
}

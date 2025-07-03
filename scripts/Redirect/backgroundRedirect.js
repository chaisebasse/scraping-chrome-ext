let storedErrors = [];

export function handleErrors() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "addInsertionErrors") {
      // Append new errors to the existing list instead of overwriting.
      if (message.payload && message.payload.length > 0) {
        storedErrors.push(...message.payload);
      }
      return true;
    }

    if (message.type === "getInsertionErrors") {
      sendResponse(storedErrors);
      return true;
    }

    if (message.type === "clearInsertionErrors") {
      storedErrors = [];
      sendResponse({ status: 'cleared' });
      return true;
    }
  });
}

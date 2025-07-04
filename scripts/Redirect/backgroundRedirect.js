async function getStoredErrors() {
  const { storedErrors } = await chrome.storage.session.get(['storedErrors']);
  return storedErrors || [];
}

async function setStoredErrors(errors) {
  // To see the content of an object in the console instead of "[object Object]",
  // you can use JSON.stringify() to convert it to a readable string.
  // This will give you a clear view of the error objects being stored.
  console.log("Setting stored errors:", JSON.stringify(errors, null, 2));
  await chrome.storage.session.set({ storedErrors: errors });
}

export async function handleErrorMessage(message, sender) {
    if (message.type === "addInsertionErrors") {
      if (!message.payload || message.payload.length === 0) return;

      const currentErrors = await getStoredErrors();

      const wasEmpty = currentErrors.length === 0;

      const errorsWithContext = message.payload.map((err) => ({
        ...err,
        id: `err_${Date.now()}_${Math.random()}`, // Add a unique ID
        tabId: sender.tab.id,
      }));

      const newErrors = [...currentErrors, ...errorsWithContext];
      await setStoredErrors(newErrors);

      if (wasEmpty && newErrors.length > 0) {
        chrome.action.enable(); // Enable globally
        console.log("Errors detected. Enabling action icon globally.");
      }
    }

    if (message.type === "getInsertionErrors") {
      return getStoredErrors();
    }

    if (message.type === "clearInsertionErrors") {
      await setStoredErrors([]);
      chrome.action.disable();
      console.log("Errors cleared. Resetting action icon to default state.");
      return { status: 'cleared' };
    }

    if (message.type === "removeSingleError") {
      const { errorId } = message.payload;
      const currentErrors = await getStoredErrors();
      const newErrors = currentErrors.filter(err => err.id !== errorId);
      await setStoredErrors(newErrors);
      if (newErrors.length === 0 && currentErrors.length > 0) {
        chrome.action.disable();
      }
      return { status: 'success' };
    }

    if (message.type === "close_successful_submission_tab") {
      // Close the tab from which the message was sent.
      chrome.tabs.remove(sender.tab.id);
    }

    return Symbol.for('messageNotHandled');
}

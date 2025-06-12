export function handleInsertToMP() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Case 1: Open MP form and inject LinkedIn data into it
    if (message.action === "openMPAndInsertData") {
      const { scrapedData } = message;

      console.log("[backgroundInsert] Received data for MP insertion:", scrapedData);

      chrome.tabs.create({
        url: "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N"
      }, (newTab) => {
        if (!newTab.id) return;

        chrome.scripting.executeScript({
          target: { tabId: newTab.id },
          files: ["scripts/Insert/content.js"]
        }, () => {
          chrome.tabs.sendMessage(newTab.id, {
            action: "insertLinkedinData",
            ...scrapedData
          });
        });
      });

      return true; // keeps sendResponse valid
    }

    // Case 2: Submit candidate data via POST
    if (message.action === "send_candidate_data") {
      const scrapedData = message.scrapedData;

      const mpFormUrl = "s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N";

      // Step 1: Look for already open tab
      chrome.tabs.query({}, (tabs) => {
        const existingTab = tabs.find(tab => tab.url && tab.url.includes("s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N"));

        if (existingTab?.id) {
          console.log("Tab trouvé")
          sendResponse({ status: "success" });
          // Tab already exists — send data
          chrome.tabs.sendMessage(existingTab.id, {
            action: "submit_candidate_data",
            payload: scrapedData
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("Message failed:", chrome.runtime.lastError.message);
            } else {
              console.log("Response from MP content script:", response);
              sendResponse({ status: "success" });
            }
          });
        } else {
          // Step 2: Open new tab
          chrome.tabs.create({ url: mpFormUrl, active: false }, (newTab) => {
            // Step 3: Wait for tab to finish loading
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
              if (tabId === newTab.id && changeInfo.status === "complete") {
                // Step 4: Send message
                chrome.tabs.sendMessage(tabId, {
                  action: "submit_candidate_data",
                  payload: scrapedData
                }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error("Message failed (after tab load):", chrome.runtime.lastError.message);
                  } else {
                    console.log("Response from new MP tab:", response);
                    sendResponse({ status: "success" });
                  }
                });

                // Step 5: Clean up the listener
                chrome.tabs.onUpdated.removeListener(listener);
              }
            });
          });
        }
      });
    }
  });
}
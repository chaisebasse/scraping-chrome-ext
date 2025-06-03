export function handleInsertToMP() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

      return true;
    }
  });
}

function encodeForm(data) {
  return Object.entries(data)
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    .join("&");
}

async function submitCandidate(scrapedData, fk) {
  const today = new Date().toLocaleDateString("fr-FR");

  const payload = {
    CONVERSATION: "RECR_GestionCandidat",
    ACTION: "CREE",
    MAJ: "O",
    ID_VISI_POIN: fk, // or set as needed
    "MP:ECRAN": "EcanTaches",
    "MP:ACTION": "CREE",
    "MP:SUPP_FICH": 'N',
    "MP:ID_RECH": scrapedData.recruitmentId,
    "MP:CIVI": scrapedData.civility || "Mr",
    "MP:NOM": scrapedData.lastName,
    "MP:PREN": scrapedData.firstName,
    "MP:TELE": scrapedData.phone,
    "MP:MAIL": scrapedData.email,
    "MP:ID_STAT": 5,
    "MP:DATE_RECE_CV": today,
    "MP:COMM_CV": scrapedData.cvNote || "",

    // Optional placeholders
    "MP:COMM_ENTR_OPER": "{MP:COMM_ENTR_OPER}",
    "MP:COMM_ENTR_MANA": "{MP:COMM_ENTR_MANA}",
    "MP:COMM_ENTR_CHAR": "{MP:COMM_ENTR_CHAR}",
    "MP:COMM_ENTR_FINA": "{MP:COMM_ENTR_FINA}",
  };

  const encodedBody = encodeForm(payload);

  const response = await fetch("http://s-tom-1:90/MeilleurPilotage/servlet/Gestion", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N"
    },
    body: encodedBody,
    credentials: "include", // important for session cookies
  });

  const result = await response.text();
  console.log("MP form response:", result);

  if (!response.ok) throw new Error("MP form submission failed");
}

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
    if (message.action === "submit_candidate_data") {
      const scrapedData = message.scrapedData;
      const fk = 13606;

      // Open the MP page before submitting
      chrome.tabs.create({
        url: "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N"
      }, (tab) => {
        console.log("MP form tab opened with ID:", tab.id);

        // Now submit the candidate
        submitCandidate(scrapedData, fk)
          .then(() => {
            console.log("bien envoyé");
            sendResponse({ status: "success" });
          })
          .catch(err => {
            console.error("[backgroundInsert] Submission error:", err);
            sendResponse({ status: "error", message: err.message });
          });
      });

      return true; // keep sendResponse valid asynchronously
    }
  });
}

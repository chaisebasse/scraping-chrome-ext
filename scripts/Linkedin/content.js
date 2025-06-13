// Fonction utilitaire pour attendre l'apparition d'un élément dans le DOM
function waitForElement(selector, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: Élément ${selector} introuvable`));
    }, timeout);
  });
}

// Logique principale du scraping
(async () => {
  const isProfilePage = location.href.startsWith("https://www.linkedin.com/talent/hire/") &&
                        location.href.includes("/manage/all/profile/");

  if (!isProfilePage) return;

  console.log("[LinkedIn Recruiter] Scraper lancé");

  try {
    // Attente des éléments clés dans la page
    await waitForElement("span[data-test-contact-email-address]");
    await waitForElement("span[data-test-contact-phone][data-live-test-contact-phone ]");
    await waitForElement("a[data-test-public-profile-link]");
    await waitForElement('button[title^="Ajouter une note sur"]');

    const noteButton = document.querySelector("#note-list-title + button[title^='Ajouter une note sur']");

    let firstName = null;
    let lastName = null;

    if (noteButton) {
      const title = noteButton.getAttribute("title");
      const match = title.match(/^Ajouter une note sur (.+)$/);
      if (match) {
        const fullName = match[1].trim().split(" ");
        firstName = fullName[0];
        lastName = fullName.slice(1).join(" "); // Rest of the array
      }
    }

    // Étape 1 : Attendre et cliquer sur l'onglet "Pièces jointes"
    await waitForElement('[data-test-navigation-list-item]');
    const attachmentsTab = await waitForElement('[data-live-test-profile-attachments-tab]');
    attachmentsTab.click();
    console.log("[LinkedIn Recruiter] Onglet 'Pièces jointes' cliqué");

    // Étape 2 : Attendre que les pièces jointes apparaissent
    await waitForElement("[data-test-previewable-attachment]");
    console.log("[LinkedIn Recruiter] Pièces jointes détectées");

    // Récupération des données de profil
    const emailSpan = document.querySelector("span[data-test-contact-email-address]");
    const phoneSpan = document.querySelector("span[data-test-contact-phone][data-live-test-contact-phone]");
    const publicProfileLink = document.querySelector("a[data-test-public-profile-link]");

    const scrapedData = {
      name: firstName || null,
      lastName: lastName || null,
      phone: phoneSpan?.textContent.trim() || null,
      email: emailSpan?.textContent.trim() || null,
      publicProfileUrl: publicProfileLink?.href || null
    };

    console.log("[LinkedIn Recruiter] Données extraites :", scrapedData);

    // Envoi au background pour insertion dans le formulaire MP
    if (firstName && lastName) {

      console.log("sending...");

      // Open MP tab immediately (data will be injected later)

      chrome.runtime.sendMessage({
        action: "send_candidate_data",
        scrapedData,
        deferInsert: true
      }, (response) => {
        console.log("Répnse de back", response);
        console.log("echo toto");
        if (chrome.runtime.lastError) {
          console.error("Message failed:", chrome.runtime.lastError.message);
        } else if (response.status === "success") {
          console.log("[content] Candidate submitted successfully!");
        } else {
          console.error("[content] Submission failed:", response.message);
        }
      });
    }
  } catch (error) {
    console.error("[LinkedIn Recruiter] Échec du scraping :", error);
  }

  await new Promise(r => setTimeout(r, 7000));

  console.log("Bien arrivé");

  return true;
})();

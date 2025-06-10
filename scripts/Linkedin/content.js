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

// Envoie une requête de téléchargement au script d'arrière-plan avec l'URL blob et le nom de fichier
function sendDownloadRequest(blobUrl, filename) {
  chrome.runtime.sendMessage({
    action: "downloadPdf",
    url: blobUrl,
    filename,
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[LinkedIn Recruiter] Erreur d'envoi de message de téléchargement :", chrome.runtime.lastError.message);
    } else {
      console.log("[LinkedIn Recruiter] Réponse du message de téléchargement :", response);
    }
  });
}

// Observe les mutations DOM pour détecter une URL blob générée après le clic sur le bouton de téléchargement
function watchForBlobUrl(firstName, lastName, callback) {
  const observer = new MutationObserver((mutations, obs) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        const blobCandidate = node.matches?.("a[download], iframe, object, embed") ? node : node.querySelector?.("a[download], iframe, object, embed");
        const src = blobCandidate?.src || blobCandidate?.data || blobCandidate?.href;

        if (src?.startsWith("blob:")) {
          console.log("[LinkedIn Recruiter] Blob URL detected:", src);

          // Fetch + convert to base64
          fetch(src)
            .then(response => response.blob())
            .then(blob => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64Data = reader.result;
                chrome.storage.local.set({ linkedinCv: base64Data }, () => {
                  console.log("[LinkedIn Recruiter] CV saved in chrome.storage.local");

                  if (typeof callback === "function") callback();
                });
              };
              reader.readAsDataURL(blob);
            })
            .catch(err => {
              console.error("[LinkedIn Recruiter] Failed to fetch blob:", err);
            });

          obs.disconnect();
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Simule un clic sur le bouton de téléchargement du CV
function simulateResumeDownloadClick() {
  const previewableAttachments = document.querySelectorAll('[data-test-previewable-attachment]');

  for (const attachment of previewableAttachments) {
    const rowTypeSpan = attachment.querySelector('[data-test-attachment-row-type]');
    const rowTypeText = rowTypeSpan?.textContent?.trim();

    if (rowTypeText === "(CV)") {
      const downloadBtn = attachment.querySelector('button[data-test-attachment-download-btn]');

      if (downloadBtn) {
        downloadBtn.click();
        console.log('[LinkedIn Recruiter] Clic simulé sur le bouton de téléchargement du CV "(CV)"');
      } else {
        console.warn('[LinkedIn Recruiter] Bouton de téléchargement introuvable dans la pièce jointe "(CV)"');
      }

      return; // On s'arrête après le premier CV trouvé
    }
  }

  console.warn('[LinkedIn Recruiter] Aucun CV "(CV)" trouvé dans les pièces jointes');
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

    // Étape 3 : Simuler le téléchargement du CV
    // simulateResumeDownloadClick();

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
      // Watch for the blob, and insert data *after* resume is fully downloaded
      // watchForBlobUrl(firstName, lastName, () => {
      //   chrome.runtime.sendMessage({
      //     action: "openMPAndInsertData",
      //     scrapedData: scrapedData,
      //     deferInsert: true
      //   });
      // });

      console.log("sending...");

      // Open MP tab immediately (data will be injected later)

      chrome.runtime.sendMessage({
        action: "submit_candidate_data",
        scrapedData,
        deferInsert: true
      }, (response) => {
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
})();

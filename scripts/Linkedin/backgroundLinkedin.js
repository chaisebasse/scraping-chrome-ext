// Variable pour stocker le nom du candidat, formaté pour l'utilisation dans le nom de fichier
let latestCandidateName = null;

/**
 * Fonction principale pour gérer les téléchargements de CV sur LinkedIn.
 * Cette fonction écoute les messages envoyés depuis le content script pour récupérer
 * le nom du candidat, puis modifie dynamiquement le nom de fichier lors du téléchargement d'un CV.
 */
export function handleLinkedinDownloads() {
  // Écoute les messages du content script
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "downloadPdf" && message.name) {
      // Formate le nom du candidat pour l'utiliser dans le nom du fichier
      latestCandidateName = formatLinkedinName(message.name);
    }
  });

  // Intercepte l'événement de détermination du nom de fichier lors d'un téléchargement
  chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    // Vérifie si l'URL appartient à LinkedIn, si le type MIME correspond à un PDF, et si nous avons un nom à utiliser
    if (
      downloadItem.url.includes("linkedin.com") &&
      downloadItem.mime === "application/pdf" &&
      latestCandidateName
    ) {
      // Crée le nouveau nom de fichier dans le dossier "Linkedin"
      const newFilename = `LinkedIn/LinkedIn_${latestCandidateName}.pdf`;
      console.log("[LinkedIn Recruiter] Renommage du téléchargement :", newFilename);

      // Propose le nouveau nom de fichier via la fonction 'suggest'
      suggest({ filename: newFilename, conflictAction: "uniquify" });
      
      // Réinitialise la variable pour éviter de réutiliser le même nom
      latestCandidateName = null;
    } else {
      // Si les conditions ne sont pas remplies, on ne modifie pas le nom de fichier
      suggest();
    }
  });
}

/**
 * Formate le nom du candidat pour le rendre compatible avec un nom de fichier :
 * - Supprime les espaces en les remplaçant par des underscores.
 * - Remplace les caractères non alphanumériques par des underscores.
 * @param {string} name - Le nom original du candidat.
 * @returns {string} Le nom formaté pour une utilisation dans un nom de fichier.
 */
function formatLinkedinName(name) {
  return name
    .trim()
    .split(/\s+/)
    .map(part => part.replace(/[^a-zA-Z0-9]/g, "_"))
    .join("_");
}

# Documentation de l'Extension d'Extraction de Données

## 1. Aperçu

Cette extension Chrome automatise le processus d'extraction des données de candidats depuis des sites de recrutement et leur insertion dans MeilleurPilotage (MP).

### Fonctionnalités Clés

- **Scraping des Données Candidat :** Extrait les données depuis :
  - LinkedIn Recruiter (profils uniques et listes multi-pages).
  - HelloWork Recruteur (profils uniques et listes multi-pages).
- **Capture Automatique des CV :** Intercepte et joint les CV (PDF) durant le processus de scraping.
- **Remplissage Automatisé de Formulaire :** Ouvre le formulaire de création de candidat dans MP et remplit toutes les données scrapées.
- **Gestion Robuste des Erreurs :** Si une soumission échoue dans MP (ex: un candidat en double), l'erreur est capturée et affichée dans la popup de l'extension, permettant à l'utilisateur de trouver et corriger facilement le problème.
- **Association aux Recherches :** Scrape les recherches d'emploi actives depuis MP pour associer correctement les nouveaux candidats au bon projet de recrutement.

---

## Installation

Pour installer et utiliser l'extension en mode développeur, suivez ces étapes :

1.  Cliquez sur l'icône en forme de pièce de puzzle en haut à droite de votre navigateur Chrome.
2.  Dans le menu qui s'affiche, cliquez sur **"Gérer les extensions"**.
3.  Sur la page des extensions, activez le **"Mode développeur"** à l'aide de la bascule en haut à droite.
4.  Une nouvelle barre d'outils apparaît. Cliquez sur le bouton **"Charger l'extension non empaquetée"**.
5.  Une fenêtre de l'explorateur de fichiers s'ouvrira. Naviguez jusqu'au dossier contenant les fichiers de cette extension, sélectionnez-le, puis cliquez sur "Sélectionner un dossier".
6.  L'extension est maintenant installée. Vous pouvez fermer l'onglet des extensions.
7.  Pour un accès facile, cliquez à nouveau sur l'icône de la pièce de puzzle, trouvez l'extension "Data extraction" dans la liste, et cliquez sur l'icône en forme d'**épingle** à côté de son nom. L'icône de l'extension sera désormais toujours visible dans votre barre d'outils.

---

## 2. Guide d'Utilisation

1.  Naviguer vers une page supportée (LinkedIn Recruiter, HelloWork, ou la liste des recherches MP).
2.  Cliquer sur l'icône de l'extension dans la barre d'outils de Chrome.
3.  La popup affichera un bouton correspondant au site web sur lequel l'utilisateur se trouve.
    - **Sur MP :** Cliquer sur "Run MP Scraper" pour rafraîchir la liste des recherches d'emploi disponibles pour l'association.
    - **Sur LinkedIn/HelloWork :** Cliquer sur le bouton du scraper. Cela amène l'utilisateur à un écran d'options.
4.  **Écran d'options :**
    - **Recherche Associée :** Sélectionner la recherche MP à laquelle associer le ou les candidats. La liste peut être rafraîchie en utilisant le bouton en dessous.
    - **Origine du candidat :** Spécifier si le candidat provient d'une "Annonce" ou de la "Chasse". Cette option est souvent pré-sélectionnée en fonction du contexte de la page.
    - **Nombre max de candidats :** Si sur une page de liste, définir le nombre maximum de profils à scraper.
        > - **Minimum :** 2 candidats. Pour un seul candidat, il faut lancer le scraper directement depuis sa page de profil.
        > - **Maximum :** 100 candidats, pour limiter les risques de détection par les systèmes anti-scraping.
        > - **Comportement sur HelloWork :** Le scraping commence à partir des candidats visibles à l'écran. Si aucun n'est visible, il remonte en haut de la liste et commence depuis le début. L'incrémentation dans le champ se fait de 1 en 1.
        > - **Comportement sur LinkedIn :** Le scraping commence au début de la page actuelle et peut continuer sur les pages suivantes jusqu'à atteindre la limite fixée, mais ne revient jamais en arrière. L'incrémentation dans le champ se fait par pas de 25 (correspondant au nombre de candidats par page).
5.  Cliquer sur "Démarrer récolte données" pour commencer.
6.  Pour voir les erreurs de soumission, cliquer sur le bouton "Voir erreurs" sur l'écran principal de la popup.
7.  Dans la page des erreurs, les erreurs peuvent être supprimées une par une ou toutes en même temps.

---

## 3. Architecture et Choix de Conception

Cette section explique le *pourquoi* derrière la structure de l'extension. Comprendre ces concepts est crucial pour la maintenance.

### Manifest V3 et le Service Worker

L'extension utilise le Manifest V3, le standard moderne des extensions Chrome.

- **Service Worker (`scripts/background.js`) :** C'est le cœur de l'extension. Contrairement aux anciens scripts d'arrière-plan, un service worker est **piloté par les événements et non-persistant**. Chrome peut l'arrêter à tout moment pour économiser de la mémoire lorsqu'il ne gère pas activement un événement (comme un message ou une requête web).
- **Implication :** **Ne pas se fier** aux variables globales dans le service worker pour stocker un état. Tout état persistant **doit** être sauvegardé dans `chrome.storage`.

### Flux de Communication (Passage de Messages)

Les composants de l'extension sont isolés et communiquent via un système clair de passage de messages.

1.  **Popup (`popup.js`) :** Le contrôleur visible par l'utilisateur. Il envoie un message au content script de l'onglet actif pour démarrer un scrape (`runHwScraper`, `runLinkedinScraper`).
2.  **Content Scripts (`HelloWork/content.js`, `LinkedIn/content.js`) :** Ces scripts s'exécutent sur les sites web cibles. Ils sont responsables de toute l'interaction avec le DOM (trouver et extraire les données).
3.  **Données vers le Background :** Une fois les données collectées, le content script les envoie au **Service Worker (`background.js`)**.
4.  **Traitement en arrière-plan :** Le Service Worker (`background.js` et `Insert/backgroundInsert.js`) traite les données, intercepte le CV (voir ci-dessous), ouvre un nouvel onglet pour le formulaire MeilleurPilotage, et envoie le paquet de données final au content script de MP.
5.  **Remplissage du formulaire (`Insert/content.js`) :** Ce script s'exécute sur la page du formulaire MP et remplit les champs.
6.  **Gestion post-soumission (`Redirect/postSubmitRedirect.js`) :** Après la soumission du formulaire MP, ce script s'exécute sur la page de redirection. Il détecte les succès ou les erreurs, et envoie un message au Service Worker pour stocker les erreurs ou fermer l'onglet en cas de succès.

### Gestion de l'État

L'extension utilise deux types de stockage principaux : `chrome.storage` (API de l'extension) et `sessionStorage` (API web standard). Il est crucial de comprendre leurs différences :

-   **`chrome.storage`** : C'est le stockage de l'extension. Il est accessible depuis tous les composants (popup, service worker, content scripts). Il est asynchrone (il faut utiliser `await` ou des promesses).
    -   **`chrome.storage.local`** : Les données persistent même si le navigateur est fermé et rouvert. Idéal pour les préférences utilisateur ou les données qui changent peu.
    -   **`chrome.storage.session`** : Les données sont conservées tant que le navigateur est ouvert. Elles sont effacées à sa fermeture. Parfait pour les données de session comme les erreurs en cours.
-   **`sessionStorage`** : C'est le stockage du navigateur lié à un onglet spécifique. Il est accessible uniquement par les content scripts sur la page où ils s'exécutent. Il est synchrone et ses données sont effacées dès que l'onglet est fermé. Il ne peut pas être lu directement par le service worker.

Voici comment ils sont utilisés dans le projet :

- **`chrome.storage.local` est utilisé pour :**
  - `jobIds` : La liste des recherches d'emploi disponibles scrapées depuis MP.
  - `lastJobId` : La dernière recherche sélectionnée par l'utilisateur, pour plus de commodité.
- **`chrome.storage.session` est utilisé pour :**
  - `storedErrors` : La liste des soumissions de candidats qui ont échoué.
- **`sessionStorage` est utilisé pour deux astuces intelligentes :**
  - **Scraping multi-pages (`hwListScrapeState`) :** Lors du scraping d'une liste sur HelloWork, l'extension navigue de la page de liste à une page de profil, puis revient. `sessionStorage` est utilisé pour maintenir l'état de ce processus (ex: quels profils restent à visiter, si le processus est en pause).
  - **Contexte inter-redirection (`submissionContext`, `scrapedCvBase64`) :** Lorsque le formulaire MP est soumis, la page se recharge. Pour savoir quel candidat vient d'échouer ou de réussir, nous stockons son contexte (URL de profil, source) et les données de son CV dans `sessionStorage` *avant* la soumission. Le script sur la page rechargée (`postSubmitRedirect.js`) lit ensuite ces données pour signaler les erreurs avec précision ou pour téléverser le CV.

### Interception des CV (API `chrome.webRequest`)

C'est un choix de conception critique et robuste.

- **Comment ça marche :** Le script `scripts/Insert/backgroundInsert.js` met en place un écouteur `chrome.webRequest.onBeforeRequest`. Cet écouteur surveille tout le trafic réseau du navigateur.
- **Correspondance de motifs d'URL :** Il est configuré avec des motifs d'URL pour les téléchargements de CV depuis LinkedIn et HelloWork (voir l'objet `CV_INTERCEPTION_CONFIG`).
- **Pourquoi c'est mieux :** Lorsque le content script sur la page de profil déclenche un téléchargement de CV, cet écouteur en arrière-plan intercepte la *requête réseau réelle* pour le fichier PDF. Il capture directement les données du fichier. C'est beaucoup plus fiable que d'essayer de simuler une boîte de dialogue "Enregistrer sous..." ou d'interagir avec des éléments d'interface complexes, qui se cassent fréquemment.

### Système de Gestion des Erreurs et des Cas Limites

Le flux de gestion des erreurs est conçu pour être convivial et récupérable.

#### Erreurs de soumission dans MeilleurPilotage

1.  **Détection :** Après une soumission de formulaire dans MP, `scripts/Redirect/postSubmitRedirect.js` s'exécute sur la page résultante. Il inspecte le DOM à la recherche de messages d'erreur connus (ex: "candidat déjà créé").
2.  **Contextualisation :** Il récupère le contexte du candidat (nom, URL du profil) depuis `sessionStorage`.
3.  **Rapport :** Il empaquette l'erreur et le contexte dans un objet et l'envoie au script d'arrière-plan.
4.  **Stockage :** Le script d'arrière-plan (`Redirect/backgroundRedirect.js`) reçoit ce message et sauvegarde l'objet d'erreur dans `chrome.storage.session`.
5.  **Affichage :** La popup (`popup.js`) peut alors demander ces erreurs au background et les afficher à l'utilisateur, avec des liens directs vers le profil source et l'onglet MP en échec, facilitant ainsi leur correction.

#### Autres cas gérés

- **Utilisateur non connecté à MeilleurPilotage :** Si l'extension tente d'ouvrir le formulaire de création de candidat et est redirigée vers la page de connexion de MP, le processus est interrompu. Le script d'arrière-plan (`backgroundInsert.js`) détecte cette redirection et envoie un message (`login_required`) au script du site source (LinkedIn ou HelloWork). Une alerte est alors affichée à l'utilisateur, l'invitant à se connecter avant de relancer le scraping. Le scraping de liste est également stoppé proprement.
- **Aucune recherche d'emploi (Job ID) trouvée :** Lorsque l'utilisateur clique sur "Vous ne trouvez pas votre recherche ?" dans la popup, l'extension scrape la page de création de candidat sur MP pour récupérer la liste des recherches actives. Si le script (`content.js`) ne trouve aucune recherche active, la popup (`popup.js`) affiche une alerte informant l'utilisateur qu'aucune recherche n'a été trouvée.

---

## 4. Explication de la Structure des Fichiers

- `manifest.json` : Le plan directeur de l'extension. Définit les permissions, les content scripts, le service worker et les icônes.
- `popup.html` / `popup.js` : Le code de la fenêtre popup. Il adapte son interface en fonction du site web actuel et gère les entrées de l'utilisateur.
- `scripts/background.js` : Le routeur central. Il écoute tous les messages et les délègue aux gestionnaires appropriés.
- **`scripts/Insert/`** : Toute la logique liée à l'insertion de données dans MeilleurPilotage.
  - `backgroundInsert.js` : Gère la file d'attente de traitement, l'interception des CV, et l'ouverture/communication avec l'onglet du formulaire MP.
  - `content.js` : Injecté dans la page du formulaire MP pour remplir les champs.
  - `contentBridge.js` : Un petit script vital pour faire le pont entre le monde isolé du content script et le contexte JavaScript de la page principale dans MP, utilisé pour obtenir l'ID de la recherche sélectionnée.
- **`scripts/Redirect/`** : Logique pour gérer la page *après* une soumission de formulaire MP.
  - `backgroundRedirect.js` : Gère le stockage et la récupération des erreurs d'insertion.
  - `postSubmitRedirect.js` : Vérifie le succès ou l'échec sur la page post-soumission, signale les erreurs et déclenche le téléversement du CV.
- **`scripts/LinkedIn/`** : Scraper spécifique au site pour LinkedIn Recruiter.
  - `content.js` : Contient toute la logique pour trouver et extraire les données des pages LinkedIn.
- **`scripts/HelloWork/`** : Scraper spécifique au site pour HelloWork.
  - `content.js` : Contient toute la logique pour trouver et extraire les données des pages HelloWork.
- **`scripts/MP/`** : Scripts liés à MeilleurPilotage.
  - `content.js` : Script injecté pour extraire les ID des recherches depuis l'élément `<select>` du formulaire.
- **`scripts/common/`** : Scripts d'aide réutilisables.
  - `domUtils.js` : Fonctions essentielles comme `waitForElement` utilisées par plusieurs scrapers.

---

## 5. Maintenance et Dépannage

Les sites web changent leur mise en page. Quand cela arrive, les scrapers ne fonctionneront plus. Ce guide explique comment résoudre les problèmes les plus courants. **Il faut utiliser les Outils de Développement du navigateur (F12 ou Clic droit -> Inspecter).**

### Scénario 1 : Le scraper est cassé car un site web a changé son design.

C'est la panne la plus fréquente. Elle se produit lorsque les sélecteurs CSS utilisés pour trouver des éléments (comme le nom ou l'email du candidat) ne sont plus valides.

1.  **Identifier le site :** Est-ce LinkedIn ou HelloWork ?
2.  **Localiser le fichier :**
    - Pour LinkedIn : `scripts/LinkedIn/content.js`
    - Pour HelloWork : `scripts/HelloWork/content.js`
3.  **Trouver le sélecteur cassé :** Le code est plein de sélecteurs dans des fonctions comme `document.querySelector(...)` ou `waitForElement(...)`. La console affichera probablement une erreur indiquant la ligne où un élément n'a pas été trouvé.
    - *Exemple de `LinkedIn/content.js`* : `const email = document.querySelector("span[data-test-contact-email-address]")?.textContent.trim()`
    - *Exemple de `HelloWork/content.js`* : `const emailElement = await waitForElementInsideShadow('#tools > contact-workflow', '#emailToApplicant');`
4.  **Comment réparer :**
    - **Aller** sur le site web et ouvrir les Outils de Développement (F12).
    - **Utiliser** l'outil "Inspecteur" (généralement une icône avec un pointeur de souris sur un carré) pour cliquer sur l'élément qui n'est plus trouvé (ex: le nom du candidat).
    - **Examiner** le HTML pour trouver un nouveau sélecteur fiable.
        - **Attention aux classes dynamiques** : Certains sites utilisent des noms de classes générés automatiquement (ex: `css-1a2b3c`). Ces classes changent à chaque mise à jour et ne sont **pas fiables**. Il faut toujours privilégier un attribut `id`, `data-test-id`, ou un autre attribut stable qui décrit la fonction de l'élément.
        - **Cas particulier du Shadow DOM (HelloWork)** : HelloWork utilise beaucoup le "Shadow DOM". Ce sont des parties de la page encapsulées, inaccessibles avec un `document.querySelector` classique. Dans les Outils de Développement, on les voit avec `#shadow-root (open)`. Pour interroger ces éléments, le code utilise des fonctions spéciales comme `waitForElementInsideShadow`. La réparation reste la même : trouver le bon sélecteur à l'intérieur du shadow root et mettre à jour l'appel de fonction correspondant dans le code.
    - **Mettre à jour** la chaîne du sélecteur dans le code avec le nouveau sélecteur identifié.
    - **Recharger** l'extension et tester.

### Scénario 2 : Les CV ne sont plus joints.

Ce problème a deux causes possibles : le moment où le CV est téléchargé a changé, ou l'URL de téléchargement a changé.

-   **Timing du téléchargement :** L'extension est conçue pour attendre et intercepter la requête du CV, que ce soit à l'ouverture du profil (HelloWork) ou en cliquant sur l'onglet des pièces jointes (LinkedIn). Cette partie est robuste, mais si le *déclencheur* change fondamentalement (ex: un nouveau bouton à cliquer), il faudra adapter le *content script* correspondant (`LinkedIn/content.js` ou `HelloWork/content.js`).
-   **Changement de l'URL (le plus probable) :** C'est le cas le plus fréquent. Le site web a changé le format de l'URL utilisée pour télécharger les CV.

Voici comment corriger un changement d'URL :

1.  **Localiser le fichier :** Ouvrir `scripts/Insert/backgroundInsert.js`.
2.  **Trouver l'objet `CV_INTERCEPTION_CONFIG`.** Cet objet contient les motifs d'URL que l'extension écoute.
    ```javascript
    const CV_INTERCEPTION_CONFIG = {
      linkedin: {
        urlPattern: "https://www.linkedin.com/dms/prv/document/media*"
      },
      hellowork: {
        urlPattern: "https://api-hwrecruteur.hellowork.com/api/hw-ats-public/api/cache/document/marvin/pdf/*"
      }
    };
    ```
3.  **Comment réparer :**
    - **Aller** sur LinkedIn ou HelloWork et effectuer l'action qui télécharge un CV.
    - Dans les Outils de Développement (F12), **ouvrir** l'onglet "Réseau" (ou "Network").
    - Dans la liste des requêtes, **trouver** celle qui correspond au fichier PDF. On peut filtrer par "pdf" pour la trouver plus facilement.
    - **Cliquer** sur cette requête pour l'inspecter. Dans le panneau qui s'ouvre, aller dans l'onglet "En-têtes" (ou "Headers").
    - **Copier** l'URL complète depuis la section "En-têtes de la requête" (Request Headers).
    - **Comparer** la nouvelle URL au `urlPattern` dans le code. **Mettre à jour** le motif pour qu'il corresponde à la nouvelle structure de l'URL. Utiliser des astérisques (`*`) pour les parties de l'URL qui sont dynamiques (comme les ID).

### Scénario 3 : Les données ne sont plus remplies correctement dans le formulaire MeilleurPilotage.

Cela signifie que les attributs `name` des champs du formulaire dans MP ont changé.

1.  **Localiser le fichier :** Ouvrir `scripts/Insert/content.js`.
2.  **Trouver la fonction `getFormInputMapping()`.** Cette fonction fait correspondre nos clés de données aux attributs `name` des champs du formulaire MP.
    ```javascript
    function getFormInputMapping() {
      return {
        lastName: "MP:NOM",
        firstName: "MP:PREN",
        phone: "MP:TELE",
        // ...
      };
    }
    ```
3.  **Comment réparer :**
    - Aller sur la page de création de candidat dans MP.
    - Utiliser les Outils de Développement pour inspecter les champs du formulaire (ex: Nom, Prénom).
    - Trouver l'attribut `name="..."` pour chaque champ dans le HTML.
    - Mettre à jour les valeurs dans l'objet de correspondance dans le code pour qu'elles correspondent aux nouveaux attributs `name`. Par exemple, si le nom du champ "Nom" passe de `MP:NOM` à `MP:NOM_CANDIDAT`, mettre à jour la ligne pour qu'elle soit `lastName: "MP:NOM_CANDIDAT"`.

    **Cas plus complexe :** Si les `name` des champs sont corrects mais que les données n'apparaissent toujours pas correctement sur le profil du candidat après création, il faut vérifier la requête de soumission elle-même.
    - Dans les Outils de Développement (F12), aller dans l'onglet "Réseau" (Network).
    - Lancer la soumission via l'extension.
    - Trouver la requête POST nommée `Gestion` dans la liste.
    - Cliquer dessus et inspecter l'onglet "Charge utile" (Payload). Cela montre les données exactes envoyées au serveur (ex: `MP:NOM=Dupont&MP:PREN=Jean`).
    - Comparer ces données avec ce qui est attendu et ce qui est visible sur le profil du candidat dans MP. Cela permet de déterminer si le problème vient des données envoyées par l'extension ou de leur traitement par MeilleurPilotage.
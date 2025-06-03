/**
 * Classe Parameter
 * Sert à importer, stocker, manipuler et exporter des données tabulaires au format CSV.
 * Chaque ligne est représentée comme un objet JS : { colonne1: valeur1, colonne2: valeur2, ... }
 */
export class Parameter {
  constructor() {
    /** @type {string[]} Liste des noms de colonnes (en-têtes CSV) */
    this.nomColonnes = [];

    /** @type {Object[]} Données importées, chaque objet représentant une ligne */
    this.donnees = []; 
  }

  /**
   * Importe des données CSV (séparateur `;`) à partir d'un texte brut.
   * Les lignes vides ou ne contenant que des séparateurs sont ignorées.
   * @param {string} csvText - Le contenu brut d’un fichier CSV
   */
  import(csvText) {
    const [firstLine, ...lines] = csvText.trim().split('\n');

    // Extraction et nettoyage des noms de colonnes
    this.nomColonnes = firstLine.split(';').map(h => h.trim());

    // Traitement des lignes non vides en objets { col1: val1, ... }
    this.donnees = lines
      .filter(line => 
        line.trim().split(';').some(cell => cell.trim() !== '') // au moins une cellule non vide
      )
      .map(line => {
        const values = line.split(';');
        return this.nomColonnes.reduce((obj, col, i) => {
          obj[col] = values[i]?.trim() ?? ''; // valeur vide si manquante
          return obj;
        }, {});
      });
  }

  /**
   * Exporte les données stockées dans l'objet sous forme de texte CSV.
   * @returns {string} - Représentation CSV des données (séparateur `;`)
   */
  export() {
    const header = this.nomColonnes.join(';');

    // Chaque ligne est reconstituée en respectant l'ordre des colonnes
    const rows = this.donnees.map(row =>
      this.nomColonnes.map(col => row[col] ?? '').join(';')
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Renvoie toutes les lignes sous forme de tableau d’objets JS.
   * @returns {Object[]} - Données brutes
   */
  getAll() {
    return this.donnees;
  }
}

// Rend la classe disponible globalement (pour content.js notamment)
window.Parameter = Parameter;

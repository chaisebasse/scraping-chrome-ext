/**
 * Supprime tous les surlignages appliqués (couleur + animation).
 */
export function clearAllHighlights() {
	document.querySelectorAll('.highlight-color').forEach(el => el.classList.remove('highlight-color'));
	setTimeout(() => {
		document.querySelectorAll('.with-transition').forEach(el => el.classList.remove('with-transition'));
	}, 500);
}

/**
 * Injecte dynamiquement le CSS de surlignage (une seule fois par page).
 */
export function injectHighlightStyles() {
	clearAllHighlights();

	const styleId = 'scraper-highlight-style';
	if (!document.getElementById(styleId)) {
		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			th.highlight-color {
				background-color: gold !important;
				color: black !important;
			}
			th.with-transition {
				transition: background-color 0.4s ease-in-out;
			}
		`;
		document.head.appendChild(style);
	}
}

/**
 * Retourne l'en-tête (ligne <tr>) visible à surligner.
 */
function getVisibleHeaderRow() {
	const table = document.querySelector("table:not(#DataTables_Table_0)");
	if (!table) return null;
	const thead = table.querySelector("thead");
	if (!thead) return null;

	// Choisit la dernière ligne de l'en-tête (la plus probable pour les vrais libellés)
	const rows = thead.querySelectorAll("tr");
	return rows.length ? rows[rows.length - 1] : null;
}

/**
 * Récupère toutes les cellules <th> visibles de l'en-tête.
 */
function getVisibleHeaderCells() {
	const headerRow = getVisibleHeaderRow();
	return headerRow ? [...headerRow.querySelectorAll("th")] : [];
}

/**
 * Surligne les colonnes dont l'en-tête correspond à un ou plusieurs libellés donnés.
 * 
 * @param {string[]} headers - Liste des intitulés à surligner.
 */
export function highlightByHeaderLabel(headers) {
	const thElements = getVisibleHeaderCells();
	thElements.forEach(th => {
		const text = th.textContent?.trim();
		if (headers.includes(text)) {
			th.classList.add("with-transition", "highlight-color");
		}
	});
}

/**
 * Supprime le surlignage basé sur les libellés des colonnes.
 * 
 * @param {string[]} headers - Liste des en-têtes à désactiver.
 */
export function fadeOutHighlightByHeaderLabel(headers) {
	const thElements = getVisibleHeaderCells();
	thElements.forEach(th => {
		const text = th.textContent?.trim();
		if (headers.includes(text)) {
			th.classList.remove("highlight-color");
			setTimeout(() => th.classList.remove("with-transition"), 1000);
		}
	});
}

/**
 * Surligne une colonne spécifique selon son index (0 = première colonne).
 * 
 * @param {number} colIndex - Index de la colonne à surligner.
 */
export function applyColumnHighlight(colIndex) {
	const thElements = getVisibleHeaderCells();
	const th = thElements[colIndex];
	if (th) {
		th.classList.add("with-transition", "highlight-color");
	}
}

/**
 * Supprime le surlignage d'une colonne spécifique par son index.
 * 
 * @param {number} colIndex - Index de la colonne à désactiver.
 */
export function fadeOutColumnHighlight(colIndex) {
	const thElements = getVisibleHeaderCells();
	const th = thElements[colIndex];
	if (th) {
		th.classList.remove("highlight-color");
		setTimeout(() => th.classList.remove("with-transition"), 1000);
	}
}
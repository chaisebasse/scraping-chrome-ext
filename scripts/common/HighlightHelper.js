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
 * Ce CSS permet d'ajouter un fond doré et une transition douce.
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
 * Surligne les colonnes dont l'en-tête correspond à un ou plusieurs libellés donnés.
 * 
 * @param {string[]} headers - Liste des intitulés à surligner.
 */
export function highlightByHeaderLabel(headers) {
	const visibleHeaderTable = document.querySelector("table:not(#DataTables_Table_0)");
	if (!visibleHeaderTable) return;

	const visibleHeaders = visibleHeaderTable.querySelectorAll("thead th");

	visibleHeaders.forEach((th, i) => {
		const text = th.textContent?.trim();
		if (headers.includes(text)) {
			th.classList.add("with-transition", "highlight-color");
		}
	});
}

/**
 * Surligne une colonne spécifique selon son index (0 = première colonne).
 * 
 * @param {number} colIndex - Index de la colonne à surligner.
 */
export function applyColumnHighlight(colIndex) {
	const visibleHeaderTable = document.querySelector('table:not(#DataTables_Table_0)');
	if (visibleHeaderTable) {
		const headerCell = visibleHeaderTable.querySelector(`thead th:nth-child(${colIndex + 1})`);
		if (headerCell) {
			headerCell.classList.add('with-transition', 'highlight-color');
		}
	}
}

/**
 * Supprime le surlignage basé sur les libellés des colonnes.
 * 
 * @param {string[]} headers - Liste des en-têtes à désactiver.
 */
export function fadeOutHighlightByHeaderLabel(headers) {
	const visibleHeaderTable = document.querySelector("table:not(#DataTables_Table_0)");
	if (!visibleHeaderTable) return;

	const visibleHeaders = visibleHeaderTable.querySelectorAll("thead th");

	visibleHeaders.forEach((th, i) => {
		const text = th.textContent?.trim();
		if (headers.includes(text)) {
			th.classList.remove("highlight-color");
			setTimeout(() => th.classList.remove("with-transition"), 1000);
		}
	});
}

/**
 * Supprime le surlignage d'une colonne spécifique par son index.
 * 
 * @param {number} colIndex - Index de la colonne à désactiver.
 */
export function fadeOutColumnHighlight(colIndex) {
	const visibleHeaderTable = document.querySelector('table:not(#DataTables_Table_0)');
	if (visibleHeaderTable) {
		const headerCell = visibleHeaderTable.querySelector(`thead th:nth-child(${colIndex + 1})`);
		if (headerCell) {
			headerCell.classList.remove('highlight-color');
			setTimeout(() => headerCell.classList.remove('with-transition'), 1000);
		}
	}
}

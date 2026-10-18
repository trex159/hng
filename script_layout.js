/* =====================================================================
 * Layout: Seitenspalte
 *
 * Arena und Steuerung (#game-container) sind "sticky". Chrome begrenzt
 * Sticky-Elemente, die direkt im Grid liegen, nur durch den ganzen Body
 * und nicht durch ihren Grid-Bereich - das Fenster ragte deshalb über
 * den Footer. In einer eigenen Spalte (#side-column) endet der
 * Sticky-Bereich dort, wo auch der linke Inhalt endet.
 * Das Wrapping passiert hier, damit index.html unverändert bleibt.
 * ===================================================================== */

(function wrapSidePanel() {
    const container = document.getElementById('game-container');
    if (!container || container.parentElement.id === 'side-column') return;
    const column = document.createElement('aside');
    column.id = 'side-column';
    container.parentNode.insertBefore(column, container);
    column.appendChild(container);
})();

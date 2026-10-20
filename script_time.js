/* =====================================================================
 * Zeitpunkte
 *
 * Ein einfacher Zähler, der pro Simulationsschritt um 1 steigt (simTick).
 * Er hängt nicht an der echten Uhr: unabhängig vom Geschwindigkeits-
 * Regler, und bei Pause bleibt er stehen.
 * ===================================================================== */

// Ausführlich, z. B. "Zeitpunkt 42" (Anzeige über der Arena)
function formatGameTime(tick = simTick) {
    return `Zeitpunkt ${tick}`;
}

// Kurz, z. B. "Zp 42" (Log-Präfix und Zeitspannen)
function formatGameTimeShort(tick = simTick) {
    return `Zp ${tick}`;
}

// Abstand zwischen zwei Zeitpunkten, z. B. "30 Zeitpunkte"
function formatGameDuration(fromTick, toTick) {
    const n = Math.max(0, toTick - fromTick);
    return n === 1 ? '1 Zeitpunkt' : `${n} Zeitpunkte`;
}

function updateClockDisplay() {
    const el = document.getElementById('game-clock-value');
    if (el) el.textContent = formatGameTime() + (typeof ultraMode !== 'undefined' && ultraMode ? ' ⚡ Ultra' : '');
}

// Pro Simulationsschritt aufrufen (direkt nach simTick++)
function advanceGameClock() {
    updateClockDisplay();
}
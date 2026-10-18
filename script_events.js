/* =====================================================================
 * Ereignis-Bus
 *
 * Entkoppelt die Simulation von Darstellung und Auswertung: die Logik
 * meldet nur, was passiert ist; Partikel (script_fx.js), Statistik
 * (script_stats.js) und Vollbild-Ticker (script_fullscreen.js) hören zu.
 *
 *   damage      { source, target, amount, kind }  kind: melee | counter | animal
 *   death       { tribute, reason, killer }
 *   animalDeath { animal }
 *   heal        { tribute, amount }
 *   moved       { tribute, move: {dx, dy} }       einmal pro Tick und Tribut
 *   tick        { tick }                          Ende eines Simulationsschritts
 *   simStart    {}                                Simulation beginnt
 *   log         { message, type, tick }           neuer Log-Eintrag
 * ===================================================================== */

const SimEvents = (() => {
    const handlers = {};
    return {
        on(type, fn) {
            (handlers[type] = handlers[type] || []).push(fn);
        },
        emit(type, data) {
            (handlers[type] || []).forEach(fn => {
                try {
                    fn(data);
                } catch (e) {
                    console.error(`SimEvents "${type}":`, e);
                }
            });
        }
    };
})();

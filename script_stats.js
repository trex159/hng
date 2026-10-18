/* =====================================================================
 * Statistik-Erfassung
 *
 * Sammelt während der Simulation alles, was die Auswertung braucht:
 *   - Laufweg jedes Tributs (ein Punkt pro Zeitpunkt, solange er lebt)
 *   - Treffer (Ort, Menge, Angreifer) und Todesorte
 *   - Momentaufnahme der Arena vor dem Start, also ohne Endspiel-Lava
 *
 * Die Anzeige liegt in script_stats_ui.js.
 * ===================================================================== */

const SimStats = (() => {
    let startGrid = null;
    let startTerrain = null; // Gelände-Bild der Start-Arena (wird beim ersten Bedarf gemalt)
    let running = false;
    const paths = new Map(); // Tribut-ID -> [x0, y0, x1, y1, ...]; Index i/2 = Zeitpunkt
    const hits = []; // {tick, x, y, amount, srcId, tgtId}
    const deaths = []; // {id, name, color, x, y, tick, reason}
    const deathTick = new Map();

    function begin() {
        startGrid = grid.map(row => row.slice());
        startTerrain = null;
        paths.clear();
        hits.length = 0;
        deaths.length = 0;
        deathTick.clear();
        running = true;
        tributes.forEach(t => paths.set(t.id, [t.x, t.y]));
    }

    function recordTick() {
        if (!running) return;
        tributes.forEach(t => {
            if (!t.alive) return;
            let path = paths.get(t.id);
            if (!path) {
                path = [t.x, t.y];
                paths.set(t.id, path);
            }
            path.push(t.x, t.y);
        });
    }

    function recordHit({
        source,
        target,
        amount
    }) {
        if (!running || !target || !(amount > 0)) return;
        hits.push({
            tick: simTick,
            x: target.x,
            y: target.y,
            amount,
            srcId: source instanceof Tribute ? source.id : null,
            tgtId: target instanceof Tribute ? target.id : null
        });
    }

    function recordDeath({
        tribute,
        reason
    }) {
        if (!running || !tribute) return;
        deathTick.set(tribute.id, simTick);
        deaths.push({
            id: tribute.id,
            name: tribute.name,
            color: tribute.color,
            x: tribute.x,
            y: tribute.y,
            tick: simTick,
            reason
        });
        // Letzten Wegpunkt auf die Todesposition setzen
        const path = paths.get(tribute.id);
        if (path) path.push(tribute.x, tribute.y);
    }

    SimEvents.on('simStart', begin);
    SimEvents.on('tick', recordTick);
    SimEvents.on('damage', recordHit);
    SimEvents.on('death', recordDeath);

    return {
        hasData: () => running && startGrid !== null,
        getPath: id => paths.get(id) || null,
        hits,
        deaths,
        getDeathTick: id => deathTick.get(id),
        // Längster Weg = letzter Zeitpunkt, der aufgezeichnet wurde
        maxTick() {
            let max = 0;
            paths.forEach(p => {
                max = Math.max(max, p.length / 2 - 1);
            });
            return max;
        },
        // Überlebenszeit in Zeitpunkten
        survivalOf(tribute) {
            const d = deathTick.get(tribute.id);
            return d !== undefined ? d : simTick;
        },
        // Gelände der Arena vor dem Start (ohne Endspiel-Lava), 8 px je Feld
        getStartTerrain() {
            if (!startGrid) return null;
            if (!startTerrain) startTerrain = Renderer.buildTerrainCanvas(startGrid, 8);
            return startTerrain;
        }
    };
})();

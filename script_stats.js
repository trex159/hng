/* =====================================================================
 * Statistik-Erfassung
 *
 * Sammelt während der Simulation alles, was die Auswertung braucht:
 *   - Laufweg jedes Tributs (ein Punkt pro Zeitpunkt, solange er lebt)
 *   - Treffer (Ort, Menge, Angreifer) und Todesorte
 *   - Momentaufnahme der Arena vor dem Start, also ohne Endspiel-Lava
 *   - Spielende und Platzierung (Siegerpodest, gleichzeitige Tode teilen sich den Platz)
 *
 * Die Anzeige liegt in script_stats_ui.js.
 * ===================================================================== */

const SimStats = (() => {
    let startGrid = null;
    let startTerrain = null; // Gelände-Bild der Start-Arena (wird beim ersten Bedarf gemalt)
    let running = false;
    let finished = false; // Sieger steht fest bzw. niemand hat überlebt
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
        finished = false;
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
        reason,
        killer
    }) {
        if (!running || !tribute) return;
        // Wie im Log: bei Kampf zählt der Killer, sonst der letzte Angreifer
        const responsible = reason === 'combat' ? (killer || tribute.lastAttacker) : null;
        deathTick.set(tribute.id, simTick);
        deaths.push({
            id: tribute.id,
            name: tribute.name,
            color: tribute.color,
            x: tribute.x,
            y: tribute.y,
            tick: simTick,
            reason,
            killerName: responsible ? responsible.name : null
        });
        // Letzten Wegpunkt auf die Todesposition setzen
        const path = paths.get(tribute.id);
        if (path) path.push(tribute.x, tribute.y);
    }

    function causeOf(id) {
        const d = deaths.find(entry => entry.id === id);
        if (!d || !d.reason) return null;
        if (d.reason === 'combat' && d.killerName) return I18N.t('death.combatBy', { killer: d.killerName });
        return I18N.t('death.' + d.reason);
    }

    // Plätze 1 bis 3. Überlebende stehen vor allen Toten; wer im selben Zeitpunkt stirbt, teilt sich
    // den Platz, der nächste Platz wird dann übersprungen (zwei Zweite -> kein Dritter, danach Platz 4).
    function buildPodium() {
        const groups = new Map(); // Ausscheide-Zeitpunkt (Infinity = überlebt) -> Tribute
        tributes.forEach(t => {
            const key = t.alive ? Infinity : (deathTick.get(t.id) ?? 0);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(t);
        });
        const podium = [];
        let place = 1;
        const keys = [...groups.keys()].sort((a, b) => a === b ? 0 : (b > a ? 1 : -1));
        for (const key of keys) {
            if (place > 3) break;
            const members = groups.get(key);
            podium.push({
                place,
                members: members.map(t => ({
                    tribute: t,
                    kills: t.kills || 0,
                    survived: t.alive,
                    cause: t.alive ? null : causeOf(t.id)
                }))
            });
            place += members.length;
        }
        return podium;
    }

    SimEvents.on('simStart', begin);
    SimEvents.on('simEnd', () => {
        if (running) finished = true;
    });
    SimEvents.on('tick', recordTick);
    SimEvents.on('damage', recordHit);
    SimEvents.on('death', recordDeath);

    return {
        hasData: () => running && startGrid !== null,
        isFinished: () => finished,
        getPodium: buildPodium,
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

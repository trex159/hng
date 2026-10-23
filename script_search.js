/* =====================================================================
 * Suchverhalten der Tribute
 *
 * Ersetzt den Random Walk bzw. das ziellose Herumlaufen (idleStep() wird
 * nur aufgerufen, wenn der Tribut gerade nicht kämpft, flieht oder auf
 * etwas wie eine Waffe zuläuft).
 *
 * Jeder Tribut führt eine eigene "Gesehen"-Karte (grobe Zellen mit dem
 * Zeitpunkt der letzten Sichtung). Beim Suchen läuft er lange, gerade
 * Linien und wählt die Linie, die am meisten ungesehene bzw. lange nicht
 * mehr gesehene Fläche aufdeckt.
 *
 * Modi (ai.mode):
 *   hunt    aggressiv + viel Leben: sucht Nicht-Freunde, um Kämpfe anzufangen
 *   friends keine Freunde in der Nähe: sucht Freunde, meidet Nicht-Freunde
 *   wander  sucht ohne festes Ziel, meidet Nicht-Freunde
 *   rest    Ruheplatz aufsuchen, dort bleiben/im Kreis laufen und regenerieren
 *   follow  Gruppe: folgt dem Anführer
 *   guard   bleibt bei einem geschwächten Freund
 *   attack  greift ein (ehemaliges) Gruppenmitglied an
 * ===================================================================== */

const SEARCH_CONFIG = {
    CELL: 5, // Kantenlänge einer Zelle der "Gesehen"-Karte (Felder)
    AGE_CAP: 800, // Ticks, ab denen eine Zelle als völlig unbekannt gilt
    HEADINGS: 16, // Anzahl Richtungen, die pro Planung bewertet werden
    LINE_LENGTHS: [35, 55, 80], // Kandidatenlängen der Suchlinien (Felder)
    MIN_LINE: 20,
    EDGE_MARGIN: 8, // Suchlinien enden mindestens so weit vom Rand
    REST_EDGE_MARGIN: 14,
    SEARCH_MIN: 80, // Dauer eines Suchmodus (Ticks), danach wird neu entschieden
    SEARCH_MAX: 190,
    REST_MIN: 100,
    REST_MAX: 220,
    EVAL_INTERVAL: 15, // Takt der sozialen Prüfung (Ticks)
    ENEMY_MEMORY: 220, // so lange erinnert man sich an die letzte Position eines Nicht-Freundes
    HUNT_MEMORY: 100,
    FRIEND_MEMORY: 220,
    HUNT_MIN_HEALTH: 75,
    WEAK_HEALTH: 35, // darunter gilt ein Tribut als geschwächt
    WEAK_REACT_MIN_HEALTH: 55, // nur ab so viel Leben kümmert man sich um Schwache
    WEAK_RECHECK: 80,
    GROUP_MAX_SIZE: 8,
    FOLLOW_LIFETIME: 100000,
    FLEE_COMMIT: 8, // so viele Ticks läuft man nach einer Flucht weiter, auch wenn der Feind schon außer Sicht ist
    BREAKOUT_TICKS: 30, // Dauer des erzwungenen Ausbruchs aus einer Pendelbewegung
    TRAIL_LENGTH: 8 // Positionen, die für die Pendel-Erkennung betrachtet werden
};

function clampInt(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(value)));
}

function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / lenSq);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Gruppenbildung: a (Initiator, selbst kein Mitläufer) trifft den Freund b
function formGroup(a, b) {
    const rootB = b.getGroupRoot();
    if (rootB === a) return false;
    const sizeA = a.getGroupMembers().length;
    const sizeB = rootB.getGroupMembers().length;
    if (sizeA + sizeB > SEARCH_CONFIG.GROUP_MAX_SIZE) return false;

    const aSolo = sizeA === 1;
    const bSolo = sizeB === 1;
    let leader, follower;
    if (aSolo && bSolo) {
        [leader, follower] = a.leadScore() >= b.leadScore() ? [a, b] : [b, a];
    } else if (aSolo) {
        [leader, follower] = [b, a]; // a schließt sich der Gruppe von b an
    } else if (bSolo) {
        [leader, follower] = [a, b]; // b schließt sich der Gruppe von a an
    } else if (rootB === b) {
        [leader, follower] = a.leadScore() >= b.leadScore() ? [a, b] : [b, a];
    } else {
        return false;
    }
    follower.getAI().leaderId = leader.id;
    follower.setMode('follow', SEARCH_CONFIG.FOLLOW_LIFETIME);
    logInfo(I18N.t('log.groupUp', { a: a.name, b: b.name }));
    return true;
}

Object.assign(Tribute.prototype, {

    /* ------------------------------------------------------------------
     * Zustand
     * ------------------------------------------------------------------ */

    // KI-Zustand lazy anlegen; nicht aufzählbar, damit er nicht im Tributen-Code landet
    getAI() {
        if (!this._ai) {
            const cols = Math.ceil(WIDTH / SEARCH_CONFIG.CELL);
            const rows = Math.ceil(HEIGHT / SEARCH_CONFIG.CELL);
            Object.defineProperty(this, '_ai', {
                value: {
                    cols,
                    rows,
                    seen: new Int32Array(cols * rows).fill(-SEARCH_CONFIG.AGE_CAP * 2),
                    known: {}, // id -> {x, y, tick}: letzte gesehene Position anderer Tribute
                    mode: null,
                    modeUntil: 0,
                    nextEval: 0,
                    plan: null,
                    planPos: null,
                    heading: null,
                    rest: null,
                    leaderId: null,
                    guardId: null,
                    targetId: null,
                    ignore: {}, // id -> Tick, bis zu dem dieser Freund ignoriert wird
                    weakCheck: {},
                    fleeFrom: null, // {x, y, until}: Fluchtpunkt, vor dem man noch ein Stück weiterläuft
                    breakout: null, // {tx, ty, until}: erzwungenes Ziel nach erkannter Pendelbewegung
                    trail: [], // letzte Positionen (Pendel-Erkennung)
                    friendStay: 0
                },
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
        return this._ai;
    },

    setMode(mode, duration) {
        const ai = this.getAI();
        ai.mode = mode;
        ai.modeUntil = simTick + duration;
        ai.plan = null;
        ai.planPos = null;
        ai.rest = null;
        if (mode !== 'guard') ai.guardId = null;
        if (mode !== 'attack') ai.targetId = null;
    },

    // Karte aktualisieren: was sehe ich gerade, wer ist in Sichtweite?
    updateVision() {
        const ai = this.getAI();
        const cell = SEARCH_CONFIG.CELL;
        const range = this.getViewDistance(false);
        const reach = Math.ceil(range / cell) + 1;
        const cx0 = Math.floor(this.x / cell);
        const cy0 = Math.floor(this.y / cell);
        for (let cy = Math.max(0, cy0 - reach); cy <= Math.min(ai.rows - 1, cy0 + reach); cy++) {
            for (let cx = Math.max(0, cx0 - reach); cx <= Math.min(ai.cols - 1, cx0 + reach); cx++) {
                const mx = cx * cell + cell / 2;
                const my = cy * cell + cell / 2;
                if (Math.abs(mx - this.x) + Math.abs(my - this.y) <= range) {
                    ai.seen[cy * ai.cols + cx] = simTick;
                }
            }
        }
        for (const t of tributes) {
            if (t !== this && t.alive && this.getDistance(t) <= range) {
                ai.known[t.id] = {
                    x: t.x,
                    y: t.y,
                    tick: simTick
                };
            }
        }
    },

    // Letzte bekannte Positionen lebender Tribute
    getRecentSightings() {
        const ai = this.getAI();
        const result = [];
        for (const id in ai.known) {
            const other = tributes.find(t => t.id === Number(id));
            if (!other || !other.alive) continue;
            result.push({
                ...ai.known[id],
                friend: this.isFriend(other)
            });
        }
        return result;
    },

    aliveFriends() {
        return tributes.filter(t => t !== this && t.alive && this.isFriend(t));
    },

    visibleFriends() {
        const range = this.getViewDistance(false);
        return this.aliveFriends().filter(f => this.getDistance(f) <= range);
    },

    /* ------------------------------------------------------------------
     * Gruppen
     * ------------------------------------------------------------------ */

    getLeader() {
        const ai = this.getAI();
        if (ai.leaderId === null) return null;
        const leader = tributes.find(t => t.id === ai.leaderId);
        if (!leader || !leader.alive || this.bondWith(leader) <= 0) {
            ai.leaderId = null;
            return null;
        }
        return leader;
    },

    getGroupRoot() {
        let current = this;
        for (let depth = 0; depth < 8; depth++) {
            const leader = current.getLeader();
            if (!leader) return current;
            current = leader;
        }
        return current;
    },

    getGroupMembers() {
        const root = this.getGroupRoot();
        return tributes.filter(t => t.alive && t.getGroupRoot() === root);
    },

    leadScore() {
        const behaviorScore = this.behavior === 'aggressiv' ? 2 : (this.behavior === 'defensiv' ? 1 : 0);
        return behaviorScore + this.health / 50 + (this.attributes.stark ? 1 : 0) + (this.attributes.schlau ? 0.5 : 0);
    },

    // Sieht der Tribut Freunde, kann er sich ihnen anschließen
    tryFormGroup() {
        const ai = this.getAI();
        if (this.getLeader()) return;
        for (const friend of this.visibleFriends()) {
            if ((ai.ignore[friend.id] || 0) > simTick) continue;
            if (friend.getGroupRoot() === this) continue;
            if (this.getDistance(friend) > 10) continue;
            const chance = 0.1 + 0.5 * Math.min(this.bondWith(friend), friend.bondWith(this));
            if (Math.random() < chance && formGroup(this, friend)) return;
            ai.ignore[friend.id] = simTick + 120;
        }
    },

    // Reaktion auf geschwächte Freunde/Freundes-Freunde: beschützen, zurücklassen oder angreifen
    reactToWeakFriend() {
        const ai = this.getAI();
        const cfg = SEARCH_CONFIG;
        const range = Math.min(this.getViewDistance(false), 14);
        for (const weak of tributes) {
            if (weak === this || !weak.alive || weak.health >= cfg.WEAK_HEALTH) continue;
            if (this.getDistance(weak) > range) continue;
            const bond = this.bondWith(weak);
            if (bond <= 0 || (ai.weakCheck[weak.id] || 0) > simTick) continue;
            ai.weakCheck[weak.id] = simTick + cfg.WEAK_RECHECK;

            const hostility = this.social.hostility[weak.id] || 0;
            if (this.isFriend(weak) && (bond < 0.22 || hostility > 0.6)) {
                breakFriendship(this, weak, I18N.t('log.burden', { name: this.name, weak: weak.name }));
                this.social.hostility[weak.id] = Math.max(this.social.hostility[weak.id] || 0, 0.8);
                weak.social.fear[this.id] = Math.max(weak.social.fear[this.id] || 0, 0.8);
                this.setMode('attack', 50);
                ai.targetId = weak.id;
                logInfo(I18N.t('log.attacksFormer', { name: this.name, weak: weak.name }));
                return true;
            }

            const stayChance = Math.min(1, bond * (this.behavior === 'aggressiv' ? 0.8 : 1.1));
            if (bond >= 0.5 && Math.random() < stayChance) {
                ai.leaderId = null;
                this.setMode('guard', randomInt(120, 200));
                ai.guardId = weak.id;
                logInfo(I18N.t('log.guards', { name: this.name, weak: weak.name }));
                return true;
            }

            // Bindung zu schwach: zurücklassen und eine Weile ignorieren
            ai.ignore[weak.id] = simTick + 300;
            if (ai.leaderId === weak.id) ai.leaderId = null;
            logInfo(I18N.t('log.abandons', { name: this.name, weak: weak.name }));
        }
        return false;
    },

    /* ------------------------------------------------------------------
     * Moduswahl
     * ------------------------------------------------------------------ */

    socialCheck() {
        const ai = this.getAI();
        const cfg = SEARCH_CONFIG;
        if (this.health >= cfg.WEAK_REACT_MIN_HEALTH && this.reactToWeakFriend()) return true;
        this.tryFormGroup();

        const leader = this.getLeader();
        if (leader && this.health < cfg.WEAK_HEALTH && Math.random() < 0.7) {
            ai.leaderId = null;
            this.setMode('rest', randomInt(cfg.REST_MIN, cfg.REST_MAX));
            logInfo(I18N.t('log.restsAlone', { name: this.name }));
            return true;
        }
        if (leader && ai.mode !== 'follow') {
            this.setMode('follow', cfg.FOLLOW_LIFETIME);
            return true;
        }
        return false;
    },

    chooseMode() {
        const cfg = SEARCH_CONFIG;
        if (this.getLeader()) {
            this.setMode('follow', cfg.FOLLOW_LIFETIME);
            return;
        }
        const hasFollowers = tributes.some(t => t.alive && t !== this && t.getAI().leaderId === this.id);
        const hunter = this.behavior === 'aggressiv' && this.health >= cfg.HUNT_MIN_HEALTH;

        if (!hunter) {
            // Geschwächte Einzelgänger und Ängstliche ziehen sich eher zurück, um in Ruhe zu regenerieren
            let restChance = (MAX_HEALTH - this.health) / MAX_HEALTH * 0.5;
            if (!hasFollowers && this.health < 40) restChance += 0.3;
            if (this.behavior === 'ängstlich') restChance += 0.3;
            else if (this.behavior === 'defensiv') restChance += 0.1;
            if ((Math.random() < Math.min(0.45, restChance)) || (this.health < 22 && Math.random() < 0.95)) {
                this.setMode('rest', randomInt(cfg.REST_MIN, cfg.REST_MAX));
                return;
            }
        }

        const duration = randomInt(cfg.SEARCH_MIN, cfg.SEARCH_MAX);
        if (hunter) this.setMode('hunt', duration);
        else if (!hasFollowers && this.aliveFriends().length > 0) this.setMode('friends', duration);
        else this.setMode('wander', duration);
    },

    evaluateSearchMode() {
        const ai = this.getAI();
        if (simTick >= ai.nextEval) {
            ai.nextEval = simTick + SEARCH_CONFIG.EVAL_INTERVAL + randomInt(0, 5);
            if (this.socialCheck()) return;
        }
        if (ai.mode && simTick < ai.modeUntil) return;
        this.chooseMode();
    },

    /* ------------------------------------------------------------------
     * Ersatz für Random Walk / Herumstehen
     * ------------------------------------------------------------------ */

    idleStep() {
        // Im Endspiel gilt das alte Verhalten
        if (lavaStart || (lavashouldstart && !endgamePaused)) {
            this.randomWalk();
            return;
        }
        const ai = this.getAI();
        // Nach einer Flucht noch ein Stück weiterlaufen. Ohne das springt der Tribut an der
        // Sichtgrenze zurück, sieht den Feind wieder und flieht erneut (Pendeln auf zwei Feldern).
        if (ai.fleeFrom) {
            if (simTick < ai.fleeFrom.until) {
                this.moveAwayFrom(ai.fleeFrom.x, ai.fleeFrom.y);
                return;
            }
            ai.fleeFrom = null;
        }
        this.evaluateSearchMode();
        switch (ai.mode) {
            case 'rest':
                this.restStep();
                break;
            case 'follow':
                this.followStep();
                break;
            case 'guard':
                this.guardStep();
                break;
            case 'attack':
                this.attackStep();
                break;
            default:
                this.searchStep();
        }
    },

    /* ------------------------------------------------------------------
     * Suchen (hunt / friends / wander)
     * ------------------------------------------------------------------ */

    searchStep() {
        const ai = this.getAI();
        const cfg = SEARCH_CONFIG;
        // Jäger, die stark verletzt wurden, geben die Jagd auf
        if (ai.mode === 'hunt' && this.health < cfg.HUNT_MIN_HEALTH - 10) {
            ai.modeUntil = 0;
        }
        if (ai.mode === 'friends') {
            const target = this.visibleFriends()
                .filter(f => (ai.ignore[f.id] || 0) <= simTick)
                .sort((a, b) => this.getDistance(a) - this.getDistance(b))[0];
            if (target && this.getDistance(target) > 3) {
                this.moveTowards(target.x, target.y);
                ai.plan = null;
                ai.friendStay = 0;
                return;
            }
            if (target) {
                // Beim Freund angekommen: stehen bleiben statt wegzuplanen und wieder heranzulaufen
                ai.plan = null;
                if (++ai.friendStay > 30) {
                    ai.ignore[target.id] = simTick + 150;
                    ai.friendStay = 0;
                }
                return;
            }
            ai.friendStay = 0;
        }
        this.followPlan();
    },

    followPlan() {
        const ai = this.getAI();
        // Wurde der Tribut zwischendurch anderweitig bewegt (Flucht, Kampf), Linie vom neuen Standort neu ansetzen
        if (ai.plan && ai.planPos && (ai.planPos.x !== this.x || ai.planPos.y !== this.y)) {
            ai.plan.sx = this.x;
            ai.plan.sy = this.y;
        }
        if (!ai.plan || simTick > ai.plan.expires || (this.x === ai.plan.tx && this.y === ai.plan.ty)) {
            ai.plan = this.planSearchLine();
        }
        this.stepAlongPlan(ai.plan);
        ai.planPos = {
            x: this.x,
            y: this.y
        };
    },

    // Ein Schritt entlang der Ideallinie (Start -> Ziel), Achsen abwechselnd wie bei Bresenham
    stepAlongPlan(plan) {
        const dxTotal = plan.tx - plan.sx;
        const dyTotal = plan.ty - plan.sy;
        const fx = dxTotal === 0 ? 1 : Math.abs(this.x - plan.sx) / Math.abs(dxTotal);
        const fy = dyTotal === 0 ? 1 : Math.abs(this.y - plan.sy) / Math.abs(dyTotal);
        if (fx >= 1 && fy >= 1) {
            plan.expires = 0;
            return;
        }
        let stepX;
        if (fx >= 1) stepX = false;
        else if (fy >= 1) stepX = true;
        else stepX = fx < fy || (fx === fy && Math.abs(dxTotal) >= Math.abs(dyTotal));
        if (stepX) this.x += Math.sign(dxTotal);
        else this.y += Math.sign(dyTotal);
        this.x = Math.max(0, Math.min(WIDTH - 1, this.x));
        this.y = Math.max(0, Math.min(HEIGHT - 1, this.y));
    },

    // Wählt unter vielen geraden Linien die mit dem größten Entdeckungswert
    planSearchLine() {
        const ai = this.getAI();
        const cfg = SEARCH_CONFIG;
        const sightings = this.getRecentSightings();
        let best = null;
        for (let h = 0; h < cfg.HEADINGS; h++) {
            const angle = (h + Math.random() * 0.4 - 0.2) * 2 * Math.PI / cfg.HEADINGS;
            for (const length of cfg.LINE_LENGTHS) {
                const tx = clampInt(this.x + Math.cos(angle) * length, cfg.EDGE_MARGIN, WIDTH - 1 - cfg.EDGE_MARGIN);
                const ty = clampInt(this.y + Math.sin(angle) * length, cfg.EDGE_MARGIN, HEIGHT - 1 - cfg.EDGE_MARGIN);
                if (Math.max(Math.abs(tx - this.x), Math.abs(ty - this.y)) < cfg.MIN_LINE) continue;
                const score = this.scoreSearchLine(tx, ty, sightings);
                if (!best || score > best.score) best = {
                    tx,
                    ty,
                    score
                };
            }
        }
        if (!best || best.score === -Infinity) {
            best = {
                tx: randomInt(cfg.EDGE_MARGIN, WIDTH - 1 - cfg.EDGE_MARGIN),
                ty: randomInt(cfg.EDGE_MARGIN, HEIGHT - 1 - cfg.EDGE_MARGIN)
            };
        }
        const dx = best.tx - this.x;
        const dy = best.ty - this.y;
        const len = Math.hypot(dx, dy) || 1;
        ai.heading = {
            x: dx / len,
            y: dy / len
        };
        return {
            sx: this.x,
            sy: this.y,
            tx: best.tx,
            ty: best.ty,
            expires: simTick + (Math.abs(dx) + Math.abs(dy)) * 1.6 + 10
        };
    },

    // Wie unbekannt ist die Zelle an dieser Position? 0 = gerade gesehen, 1 = lange/nie gesehen
    unseenAt(x, y) {
        const ai = this.getAI();
        const cell = SEARCH_CONFIG.CELL;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        if (cx < 0 || cy < 0 || cx >= ai.cols || cy >= ai.rows) return 0;
        return clamp01((simTick - ai.seen[cy * ai.cols + cx]) / SEARCH_CONFIG.AGE_CAP);
    },

    scoreSearchLine(tx, ty, sightings) {
        const ai = this.getAI();
        const cfg = SEARCH_CONFIG;
        const range = this.getViewDistance(false);
        const dx = tx - this.x;
        const dy = ty - this.y;
        const length = Math.hypot(dx, dy);
        const ux = dx / length;
        const uy = dy / length;
        const sideOffset = Math.max(2, range * 0.6);
        const samples = Math.max(1, Math.floor(length / 4));

        let gain = 0;
        let count = 0;
        let penalty = 0;
        for (let i = 1; i <= samples; i++) {
            const px = this.x + dx * i / samples;
            const py = this.y + dy * i / samples;
            const tile = grid[Math.round(py)] && grid[Math.round(py)][Math.round(px)];
            if (tile === 'lava') return -Infinity;
            if (tile === 'trap' && this.attributes.schlau) return -Infinity;
            if (tile === 'water') penalty += 0.01;
            for (const offset of [-sideOffset, 0, sideOffset]) {
                gain += this.unseenAt(px - uy * offset, py + ux * offset);
                count++;
            }
        }

        // Entdeckungswert, lange Linien leicht bevorzugt
        let score = gain / count;
        score *= 0.7 + 0.3 * Math.min(1, length / 80);
        // Kurskonstanz: Kehrtwenden vermeiden
        if (ai.heading) {
            const cos = ux * ai.heading.x + uy * ai.heading.y;
            score *= 0.85 + 0.15 * cos;
            if (cos < -0.5) score *= 0.75;
        }

        for (const s of sightings) {
            const age = simTick - s.tick;
            const dist = distanceToSegment(s.x, s.y, this.x, this.y, tx, ty);
            if (s.friend) {
                if (ai.mode === 'friends' && age < cfg.FRIEND_MEMORY && dist < range) {
                    score += 0.7 * (1 - dist / range) * (1 - age / cfg.FRIEND_MEMORY);
                }
            } else if (ai.mode === 'hunt') {
                if (age < cfg.HUNT_MEMORY && dist < range) {
                    score += 0.6 * (1 - dist / range) * (1 - age / cfg.HUNT_MEMORY);
                }
            } else if (age < cfg.ENEMY_MEMORY && dist < range + 12) {
                // nicht von Nicht-Freunden gesehen werden: Gebiete um deren letzte Position meiden
                score -= 1.6 * (1 - dist / (range + 12)) * (1 - age / cfg.ENEMY_MEMORY);
            }
        }
        return (score - penalty) * (0.9 + Math.random() * 0.2);
    },

    /* ------------------------------------------------------------------
     * Ruhen
     * ------------------------------------------------------------------ */

    chooseRestSpot() {
        const cfg = SEARCH_CONFIG;
        const enemies = this.getRecentSightings().filter(s => !s.friend && simTick - s.tick < 200);
        let best = {
            x: this.x,
            y: this.y,
            score: -Infinity
        };
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const dist = i === 0 ? 0 : randomInt(10, 50);
            const x = clampInt(this.x + Math.cos(angle) * dist, cfg.REST_EDGE_MARGIN, WIDTH - 1 - cfg.REST_EDGE_MARGIN);
            const y = clampInt(this.y + Math.sin(angle) * dist, cfg.REST_EDGE_MARGIN, HEIGHT - 1 - cfg.REST_EDGE_MARGIN);
            const tile = grid[y][x];
            if (tile === 'lava' || tile === 'water' || tile === 'trap') continue;
            // Wald bevorzugt, weg vom Zentrum, nicht zu weit weg, weg von bekannten Feinden
            let score = tile === 'forest' ? 2 : 0;
            score += Math.min(Math.abs(x - middleofarena.x) + Math.abs(y - middleofarena.y), 80) / 80 * 2;
            score -= Math.hypot(x - this.x, y - this.y) / 60;
            for (const e of enemies) {
                const d = Math.hypot(x - e.x, y - e.y);
                if (d < 40) score -= (1 - d / 40) * 3;
            }
            score += Math.random() * 0.3;
            if (score > best.score) best = {
                x,
                y,
                score
            };
        }
        return {
            x: best.x,
            y: best.y,
            arrived: false,
            style: Math.random() < 0.5 ? 'stay' : 'circle',
            radius: randomInt(2, 4),
            angle: Math.random() * 2 * Math.PI,
            startHealth: this.health
        };
    },

    restStep() {
        const ai = this.getAI();
        if (!ai.rest) ai.rest = this.chooseRestSpot();
        const spot = ai.rest;
        const away = Math.abs(this.x - spot.x) + Math.abs(this.y - spot.y);
        if (spot.arrived && away > spot.radius + 6) spot.arrived = false; // weggedrängt: zurückgehen
        if (!spot.arrived) {
            if (away <= 2) spot.arrived = true;
            else {
                this.moveTowards(spot.x, spot.y);
                return;
            }
        }
        // Wer sich erholt hat, beendet die Pause vorzeitig
        if (this.health >= 98 && spot.startHealth < 95) {
            ai.modeUntil = 0;
            return;
        }
        if (spot.style === 'circle') {
            spot.angle += 0.45;
            this.moveTowards(Math.round(spot.x + Math.cos(spot.angle) * spot.radius), Math.round(spot.y + Math.sin(spot.angle) * spot.radius));
        }
    },

    // Regeneriert der Tribut gerade in Ruhe (stärkere Regeneration)?
    isRestingNow() {
        const ai = this.getAI();
        if (ai.mode === 'guard') return true;
        if (ai.mode === 'rest') return !!(ai.rest && ai.rest.arrived);
        if (ai.mode === 'follow') {
            const leader = this.getLeader();
            if (!leader || this.getDistance(leader) > 6) return false;
            const leaderAI = leader.getAI();
            return leaderAI.mode === 'rest' && !!(leaderAI.rest && leaderAI.rest.arrived);
        }
        return false;
    },

    /* ------------------------------------------------------------------
     * Gruppe / Beschützen / Angreifen
     * ------------------------------------------------------------------ */

    followStep() {
        const leader = this.getLeader();
        if (!leader) {
            this.setMode('wander', 1);
            this.searchStep();
            return;
        }
        const dist = this.getDistance(leader);
        if (dist > 4) {
            this.moveTowards(leader.x, leader.y);
            return;
        }
        // Gruppe zieht als Pulk: gleiche Bewegung wie der Anführer, solange nicht direkt daneben
        // und bleibt dabei mindestens 2 Felder (auch diagonal) vom Anführer entfernt, um nicht ständig Kämpfe unter Freunden auszulösen
        const m = leader.lastMove;
        if (m && (m.dx !== 0 || m.dy !== 0)) {
            const nx = Math.max(0, Math.min(WIDTH - 1, this.x + m.dx));
            const ny = Math.max(0, Math.min(HEIGHT - 1, this.y + m.dy));
            if (Math.max(Math.abs(nx - leader.x), Math.abs(ny - leader.y)) >= 2) {
                this.x = nx;
                this.y = ny;
            }
        }
    },

    guardStep() {
        const ai = this.getAI();
        const weak = tributes.find(t => t.id === ai.guardId);
        if (!weak || !weak.alive || weak.health >= 65 || this.health < 40 || simTick >= ai.modeUntil) {
            ai.modeUntil = 0;
            return;
        }
        if (this.getDistance(weak) > 3) this.moveTowards(weak.x, weak.y);
    },

    attackStep() {
        const ai = this.getAI();
        const target = tributes.find(t => t.id === ai.targetId);
        if (!target || !target.alive || simTick >= ai.modeUntil) {
            ai.modeUntil = 0;
            return;
        }
        this.moveTowards(target.x, target.y);
    },

    /* ------------------------------------------------------------------
     * Flucht und Pendel-Erkennung
     * ------------------------------------------------------------------ */

    // Flucht vor einem Feind: Schritt weg, alten Suchplan verwerfen (der führte oft zum Feind zurück)
    // und merken, wohin weiterzulaufen ist, auch wenn der Feind gleich außer Sicht gerät.
    fleeFrom(x, y) {
        const ai = this.getAI();
        this.moveAwayFrom(x, y);
        ai.plan = null;
        ai.planPos = null;
        ai.fleeFrom = {
            x,
            y,
            until: simTick + SEARCH_CONFIG.FLEE_COMMIT
        };
        const dx = this.x - x;
        const dy = this.y - y;
        const len = Math.hypot(dx, dy);
        if (len > 0) ai.heading = {
            x: dx / len,
            y: dy / len
        };
    },

    // Wird einmal pro Tick nach der Bewegung aufgerufen: erkennt A,B,A,B,... und erzwingt einen Ausbruch
    trackOscillation() {
        const ai = this.getAI();
        const trail = ai.trail;
        trail.push(this.x * 1000 + this.y);
        if (trail.length > SEARCH_CONFIG.TRAIL_LENGTH) trail.shift();
        if (trail.length < SEARCH_CONFIG.TRAIL_LENGTH || ai.breakout) return;
        if (trail[0] === trail[1]) return;
        for (let i = 2; i < trail.length; i++) {
            if (trail[i] !== trail[i - 2]) return;
        }
        this.startBreakout();
    },

    startBreakout() {
        const ai = this.getAI();
        const cfg = SEARCH_CONFIG;
        let best = null;
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const tx = clampInt(this.x + Math.cos(angle) * 45, cfg.EDGE_MARGIN, WIDTH - 1 - cfg.EDGE_MARGIN);
            const ty = clampInt(this.y + Math.sin(angle) * 45, cfg.EDGE_MARGIN, HEIGHT - 1 - cfg.EDGE_MARGIN);
            const tile = grid[ty][tx];
            if (tile === 'lava' || tile === 'trap') continue;
            const score = this.unseenAt(tx, ty) + Math.random() * 0.5;
            if (!best || score > best.score) best = {
                tx,
                ty,
                score
            };
        }
        if (!best) return;
        ai.breakout = {
            tx: best.tx,
            ty: best.ty,
            until: simTick + cfg.BREAKOUT_TICKS
        };
        ai.plan = null;
        ai.planPos = null;
        ai.fleeFrom = null;
        ai.heading = null;
        ai.trail.length = 0;
    },

    // true, wenn der Tribut in diesem Tick dem Ausbruchsziel folgt
    breakoutStep() {
        const ai = this.getAI();
        const b = ai.breakout;
        if (!b) return false;
        if (simTick >= b.until || (this.x === b.tx && this.y === b.ty)) {
            ai.breakout = null;
            ai.trail.length = 0;
            return false;
        }
        this.moveTowards(b.tx, b.ty);
        return true;
    },

    // Aggressive Tribute mit viel Leben gehen auf gesichtete Nicht-Freunde los
    wantsToHunt(target) {
        if (this.behavior !== 'aggressiv' || this.health < SEARCH_CONFIG.HUNT_MIN_HEALTH) return false;
        return target.health <= this.health + 25 || this.attributes.stark || Math.random() < 0.1;
    }
});

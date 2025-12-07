const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 5;
const WIDTH = canvas.width / TILE_SIZE;
const HEIGHT = canvas.height / TILE_SIZE;
let grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('grass'));
let tributes = [];
let animals = [];
let weapons = []; // {x, y, power}
let simulationRunning = false;
let lavaStart = false;
let simulationSpeed = 5;
let drawing = false;
let lavaRadius = 0;
let winnerDeclared = false;
let profilesLocked = false;
let middleofarena = { x: Math.floor(WIDTH / 2), y: Math.floor(HEIGHT / 2) };

let evilnumberoflava = 0;
let lavashouldstart = false;

let showprofilelist = true;

let lastmsg;
let secondlastmsg;
let thirtlastmsg;
let fourthlastmsg;
let fifthlastmsg;
let sixtlastmsg;

const MAX_VIEW_DISTANCE = 5;
const LAVA_SPEED = 0.4;

// Hilfsfunktion: sichtbar/nicht sichtbar schalten je nach State
function setUIForState(state) {
    const pre = document.querySelector('.pre-Game');
    const mid = document.querySelector('.mid-game');
    const editor = document.querySelector('.arena-editor');
    const exit = document.querySelector('.exitmode');

    if (!pre || !mid || !editor || !exit) return;

    switch (state) {
        case 'running': // während Simulation läuft
            pre.style.display = 'none';
            editor.style.display = 'none';
            mid.style.display = 'block';
            exit.style.display = 'none';
            break;
        case 'stopped': // nach Simulation
            pre.style.display = 'none';
            editor.style.display = 'none';
            mid.style.display = 'none';
            exit.style.display = 'block';
            break;
        case 'paused': // Pause: wie running
            pre.style.display = 'none';
            editor.style.display = 'none';
            mid.style.display = 'block';
            exit.style.display = 'none';
            break;
        case 'ready': // vor der Simulation
            pre.style.display = 'block';
            editor.style.display = 'block';
            mid.style.display = 'none';
            exit.style.display = 'none';

        default:
            // fallback, vor der simulation
            pre.style.display = 'black';
            editor.style.display = 'block';
            mid.style.display = 'none';
            exit.style.display = 'none';
    }
}

function saveArena() {
    const arenaCode = JSON.stringify(grid);
    return btoa(arenaCode);
}

function saveTributes() {
    // Exportiere auch Freunde-IDs
    const tributeCode = JSON.stringify(tributes.map(t => ({
        ...t,
        friends: t.friends ? [...t.friends] : []
    })));
    return btoa(tributeCode);
}

function showArenaCode() {
    document.getElementById('load-code').value = saveArena();
}

function showTributesCode() {
    document.getElementById('load-code').value = saveTributes();
}

function toggleProfiles() {
    if (showprofilelist) {
        document.getElementById('profiles-container').style.display = 'none';
        showprofilelist = false;
    } else {
        document.getElementById('profiles-container').style.display = 'flex';
        showprofilelist = true;
    }
}

function loadFromCode() {
    const code = document.getElementById('load-code').value.trim();
    if (!code) return;

    try {
        const decoded = atob(code);
        const data = JSON.parse(decoded);

        // ...im try-Block von loadFromCode()
        if (Array.isArray(data) && data[0] && data[0].name !== undefined) {
            // Tribute laden
            tributes = data.map(t => {
                // Falls Tribute plain object, in Tribute-Objekt umwandeln
                let tr = new Tribute(t.id, { x: t.x, y: t.y });
                Object.assign(tr, t);
                // Sicherstellen, dass social-Struktur existiert
                tr.social = tr.social || { trust: {}, fear: {}, hostility: {} };
                // Freunde initial mit hohem Vertrauen versehen
                if (Array.isArray(tr.friends)) {
                    tr.friends.forEach(fid => {
                        tr.social.trust[fid] = 1;
                    });
                }
                // Freunde als Array von IDs sicherstellen
                tr.friends = Array.isArray(t.friends) ? t.friends.slice() : [];
                if (!tr.weapon) tr.weapon = null;
                if (!tr.weakWeapons) tr.weakWeapons = [];
                return tr;
            });
            updateProfiles();
            updateStatsTable();
        } else {
            // Arena laden
            grid = data;
            drawGrid();
        }
    } catch (e) {
        alert('Ungültiger Code.');
    }

    document.getElementById('load-code').value = '';
}

function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            switch (grid[y][x]) {
                case 'grass':
                    ctx.fillStyle = '#4caf50';
                    break;
                case 'water':
                    ctx.fillStyle = '#2196f3';
                    break;
                case 'lava':
                    ctx.fillStyle = '#f44336';
                    break;
                case 'forest':
                    ctx.fillStyle = '#2e7d32';
                    break;
                case 'rock':
                    ctx.fillStyle = '#616161';
                    break;
                case 'trap':
                    ctx.fillStyle = '#8B4513';
                    break;
                // case 'animal': // entfällt, Tiere werden separat gezeichnet
                //     ctx.fillStyle = '#FF4500';
                //     break;
            }
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // Zeichne Waffen
    weapons.forEach(w => {
        ctx.fillStyle = "#03FAFF";
        ctx.fillRect(w.x * TILE_SIZE + 1, w.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    });

    // Zeichne Wildtiere mit Rahmen
    animals.forEach(animal => {
        if (animal.alive) {
            ctx.save();
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1;
            ctx.fillStyle = '#FF4500';
            ctx.fillRect(animal.x * TILE_SIZE, animal.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.strokeRect(animal.x * TILE_SIZE + 0.5, animal.y * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
            ctx.restore();
        }
    });

    // Zeichne Tribute mit Rahmen
    tributes.forEach(tribute => {
        if (tribute.alive) {
            ctx.save();
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 1;
            ctx.fillStyle = tribute.color;
            ctx.fillRect(tribute.x * TILE_SIZE, tribute.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.strokeRect(tribute.x * TILE_SIZE + 0.5, tribute.y * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
            ctx.restore();
        }
    });
}

class Tribute {
    constructor(id, spawnPos) {
        this.id = id;
        this.name = `Tribut ${id}`;
        this.x = Math.floor(WIDTH / 2) + randomInt(-5, 5);
        this.y = Math.floor(HEIGHT / 2) + randomInt(-5, 5);
        this.age = randomInt(12, 18);
        this.behavior = ['aggressiv', 'defensiv', 'ängstlich'][randomInt(0, 2)];
        this.gender = ['männlich', 'weiblich'][randomInt(0, 1)];
        this.attributes = {
            stark: Math.random() < 0.33,
            schlau: Math.random() < 0.33,
            beliebt: Math.random() < 0.33
        };
        this.color = hslToHex(randomInt(0, 360), 100, 50);
        this.alive = true;
        this.health = 100;
        this.direction = randomInt(0, 3);
        this.damageDealt = 0;
        this.damageTaken = 0;
        this.distanceMoved = 0;
        this.walkDirection = null;      // Persistente Richtung für randomWalk
        this.kills = 0;
        this.lastAttacker = null;
        this.weapon = null; // {power}
        this.weakWeapons = []; // Waffen mit power < 11
        this.friends = []; // Array von Tribut-IDs
        // Soziale Parameter: Vertrauen, Angst, Feindseligkeit (Rache)
        this.social = {
            trust: {},      // trust[otherId] = 0..1
            fear: {},       // fear[otherId] = 0..1
            hostility: {}   // hostility[otherId] = 0..1
        };
        if (spawnPos) {
            this.x = spawnPos.x;
            this.y = spawnPos.y;
        } else {
            this.x = Math.floor(WIDTH / 2);
            this.y = Math.floor(HEIGHT / 2);
        }
    }

    move() {
        if (!this.alive) return;

        let oldX = this.x;
        let oldY = this.y;
        let target;

        // Sichtweite je nach Terrain
        let viewDistance = MAX_VIEW_DISTANCE;
        const tile = this.getCurrentTile();
        if (tile === 'forest') viewDistance = 2;
        else if (tile === 'rock') viewDistance = 7;
        // (Wasser: Sichtweite bleibt gleich, aber Bewegung wird langsamer)

        // --- Neue Priorität: Lava-Check zuerst ---
        const lavaTile = this.findNearbyLava(viewDistance);
        // Fallen-Check für schlaue Tribute
        let trapTile = null;
        if (this.attributes.schlau) {
            trapTile = this.findNearbyTrap(viewDistance);
        }

        // Bewegung verlangsamen im Wasser
        let isWater = (tile === 'water');
        if (isWater && Math.random() > 0.5) {
            // Tribut bleibt mit 50% Wahrscheinlichkeit stehen
            // (Effekt: ca. halb so schnell)
            return;
        }

        if (lavaTile) {
            this.moveAwayFrom(lavaTile.x, lavaTile.y);
        } else if (trapTile) {
            this.moveAwayFrom(trapTile.x, trapTile.y);
        } else {
            // --- Waffen-Logik je nach Verhalten ---
            const nearestWeapon = this.findNearestWeapon();
            const enemyNearby = this.isEnemyNearby();

            if (this.behavior === 'aggressiv' && nearestWeapon) {
                this.moveTowards(nearestWeapon.x, nearestWeapon.y);
            } else if ((this.behavior === 'defensiv' || this.behavior === 'ängstlich') && nearestWeapon) {
                if (!enemyNearby) {
                    this.moveTowards(nearestWeapon.x, nearestWeapon.y);
                } else if (
                    this.behavior === 'defensiv' &&
                    Math.random() < 0.2
                ) {
                    this.moveTowards(nearestWeapon.x, nearestWeapon.y);
                } else {
                    // Normales Verhalten, wenn sie nicht zur Waffe laufen
                    if (this.behavior === 'defensiv') {
                        target = this.findNearestEnemy();
                        if (target && this.getDistance(target) < 5) {
                            this.moveAwayFrom(target.x, target.y);
                            this.hide();
                        } else {
                            if (this.x > middleofarena.x - 30 && this.x < middleofarena.x + 30 && this.y > middleofarena.y - 30 && this.y < middleofarena.y + 30 && !lavaStart) {
                                this.moveAwayFrom(middleofarena.x, middleofarena.y);
                            }
                            this.randomWalk();
                        }
                    } else if (this.behavior === 'ängstlich') {
                        this.hide();
                    }
                }
            } else {
                switch (this.behavior) {
                    case 'aggressiv':
                        target = this.findNearestEnemy();
                        if (target && this.isFriend(target)) {
                            target = null;
                        }
                        if (target && this.getDistance(target) < 6 && ((this.health >= target.health + 5 && this.attributes.schlau) || (this.health >= target.health - 10 && !this.attributes.schlau) || Math.random() >= 0.9) || (this.attributes.stark && this.health >= 15)) {
                            this.moveTowards(target.x, target.y);
                        } else if (target) {
                            this.moveAwayFrom(target.x, target.y);
                        } else if (lavaStart) {
                            this.moveTowards(middleofarena.x, middleofarena.y)
                        } else if (this.health >= 45) {
                            this.moveTowards(middleofarena.x, middleofarena.y)
                        } else {
                            this.randomWalk()
                        }
                        break;
                    case 'defensiv':
                        target = this.findNearestEnemy();
                        if (target && this.isFriend(target)) {
                            target = null;
                        }
                        if (target && this.getDistance(target) < 5 && ((this.health >= target.health + 10 && this.attributes.schlau) || (this.health >= target.health && !this.attributes.schlau) || Math.random() >= 0.91)) {
                            this.moveTowards(target.x, target.y);
                        } else if (lavaStart) {
                            this.moveTowards(middleofarena.x, middleofarena.y)
                        } else if (target) {
                            this.moveAwayFrom(target.x, target.y);
                        } else {
                            if (Math.random() >= 0.5) {
                                this.moveAwayFrom(middleofarena.x, middleofarena.y)
                            } else {
                                this.randomWalk()
                            }
                        }
                        break;
                    case 'ängstlich':
                        if (lavaStart) {
                            this.moveTowards(middleofarena.x, middleofarena.y)
                        }
                        if (Math.random() >= 0.5) {
                            this.hide();
                        } else {
                            if (Math.random() >= 0.5) {
                                this.moveAwayFrom(middleofarena.x, middleofarena.y)
                            } else {
                                this.randomWalk()
                            }
                        }
                        break;
                }
                if (!target && this.behavior !== 'ängstlich') this.randomWalk();
            }
        }

        // Statistiken: Distanz
        this.distanceMoved += Math.abs(this.x - oldX) + Math.abs(this.y - oldY);

        this.checkEnvironment();
        this.pickUpWeapon();

        // --- NEU: Angriff auf angrenzende Tribute ---
        if (!this.alive) return; // Falls durch Umgebung gestorben
        for (const t of tributes) {
            if (
                t !== this &&
                t.alive &&
                Math.abs(t.x - this.x) <= 1 &&
                Math.abs(t.y - this.y) <= 1
            ) {
                this.fight(t);
                break; // Nur einen Angriff pro Zug
            }
        }
    }

    // In der Tribute Klasse, nach der move() Methode einfügen:

    updateSocialRelations() {
        if (!this.alive) return;

        // Nur wenn keine Feinde in der Nähe sind
        const nearbyEnemies = tributes.filter(t =>
            t !== this &&
            t.alive &&
            !this.isFriend(t) &&
            Math.abs(t.x - this.x) <= MAX_VIEW_DISTANCE &&
            Math.abs(t.y - this.y) <= MAX_VIEW_DISTANCE
        );

        if (nearbyEnemies.length > 0) return;

        // Finde Freunde in der Nähe
        const nearbyFriends = tributes.filter(t =>
            t !== this &&
            t.alive &&
            this.isFriend(t) &&
            Math.abs(t.x - this.x) <= 2 &&  // Engerer Radius für Gespräche
            Math.abs(t.y - this.y) <= 2
        );

        if (nearbyFriends.length === 0) return;

        // Für jeden Freund: Teile Informationen über andere
        for (const friend of nearbyFriends) {
            // Zähle gemeinsame Freunde in der Nähe
            const commonFriendsNearby = tributes.filter(t =>
                t !== this &&
                t !== friend &&
                t.alive &&
                this.isFriend(t) &&
                friend.isFriend(t) &&
                Math.abs(t.x - this.x) <= 2 &&
                Math.abs(t.y - this.y) <= 2
            ).length;

            // Gerüchte-Stärke reduziert sich mit Anzahl anwesender gemeinsamer Freunde
            const gossipStrength = Math.max(0.1, 0.3 - (commonFriendsNearby * 0.05));

            // Teile negative Erfahrungen
            for (const otherId in this.social.fear) {
                if (this.social.fear[otherId] > 0.4) { // Nur relevante Ängste teilen
                    const fearValue = this.social.fear[otherId] * gossipStrength;
                    friend.social.fear[otherId] = Math.max(
                        friend.social.fear[otherId] || 0,
                        fearValue
                    );

                    const warnedAbout = tributes.find(t => t.id === parseInt(otherId));
                    if (warnedAbout) {
                        logInfo(`${this.name} warnt ${friend.name} vor ${warnedAbout.name}`);
                    }

                }
            }

            // Teile Misstrauen
            for (const otherId in this.social.trust) {
                if (this.social.trust[otherId] < 0.3) { // Nur relevantes Misstrauen teilen
                    const distrustValue = (1 - this.social.trust[otherId]) * gossipStrength;
                    friend.social.trust[otherId] = Math.min(
                        friend.social.trust[otherId] || 1,
                        1 - distrustValue
                    );
                }
            }

            // Teile Feindschaften
            for (const otherId in this.social.hostility) {
                if (this.social.hostility[otherId] > 0.5) { // Nur starke Feindschaften
                    const hostilityValue = this.social.hostility[otherId] * gossipStrength;
                    friend.social.hostility[otherId] = Math.max(
                        friend.social.hostility[otherId] || 0,
                        hostilityValue * 0.7  // Feindschaft überträgt sich schwächer
                    );
                }
            }
        }
    }

    getCurrentTile() {
        if (
            this.x < 0 || this.x >= WIDTH ||
            this.y < 0 || this.y >= HEIGHT ||
            isNaN(this.x) || isNaN(this.y)
        ) return null;
        return grid[this.y][this.x];
    }



    // Sichtweite-abhängige Fallen-Suche (nur für schlaue Tribute)
    findNearbyTrap(viewDist = MAX_VIEW_DISTANCE) {
        let minDist = Infinity;
        let nearestTrap = null;
        for (let dx = -viewDist; dx <= viewDist; dx++) {
            for (let dy = -viewDist; dy <= viewDist; dy++) {
                let nx = this.x + dx;
                let ny = this.y + dy;
                if (
                    nx >= 0 && nx < WIDTH &&
                    ny >= 0 && ny < HEIGHT &&
                    grid[ny][nx] === 'trap'
                ) {
                    let dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestTrap = { x: nx, y: ny };
                    }
                }
            }
        }
        return nearestTrap;
    }

    // In die Klasse Tribute einfügen:
    checkEnvironment() {
        // Prüfe, ob die aktuelle Position im Spielfeld liegt, bevor auf grid[y][x] zugegriffen wird
        if (
            this.x < 0 || this.x >= WIDTH ||
            this.y < 0 || this.y >= HEIGHT ||
            isNaN(this.x) || isNaN(this.y)
        ) {
            // teleportiere Tribut zurück ins Spielfeld
            while (this.x < 0) this.x += 1;
            while (this.x >= WIDTH) this.x -= 1;
            while (this.y < 0) this.y += 1;
            while (this.y >= HEIGHT) this.y -= 1;

            // falls immer noch außerhalb (NaN), töten
            if (
                this.x < 0 || this.x >= WIDTH ||
                this.y < 0 || this.y >= HEIGHT ||
                isNaN(this.x) || isNaN(this.y)
            ) {
                if (this.alive) {
                    this.die('verunglückt');
                }
                return;

            }
        }
        let tileType = grid[this.y][this.x];
        if (tileType === 'lava') {
            // Sofortiger Tod durch Lava
            if (this.alive) {
                this.die('Lava');
            }
            return;
        }

        if (tileType === 'trap') {
            if (this.alive && Math.random() < 0.7) { // 70% Chance, in Falle sofort zu sterben
                this.die('in eine tödliche Falle getappt');
            } else {
                this.health -= 50;
                if (this.health <= 0) {
                    this.die('von einer Falle getötet');
                } else {
                    logInfo(`${this.name} wurde in einer Falle verletzt (-20 Gesundheit)!`);
                }
            }
            return;
        }


        // Optional: Weitere Umgebungsgefahren können hier ergänzt werden
        // z.B. Fallen, Wasser, etc.
    }

    // In die Klasse Tribute einfügen:
    getSurroundings() {
        // Gibt ein Array aller angrenzenden Felder mit Typ und Koordinaten zurück
        const tiles = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = this.x + dx;
                const ny = this.y + dy;
                if (
                    nx >= 0 && nx < WIDTH &&
                    ny >= 0 && ny < HEIGHT
                ) {
                    tiles.push({
                        x: nx,
                        y: ny,
                        type: grid[ny][nx]
                    });
                }
            }
        }
        return tiles;
    }

    // In die Klasse Tribute einfügen:
    getDistance(other) {
        return Math.abs(this.x - other.x) + Math.abs(this.y - other.y);
    }

    pickUpWeapon() {
        for (let i = 0; i < weapons.length; i++) {
            if (weapons[i].x === this.x && weapons[i].y === this.y) {
                const w = weapons[i];

                // Wenn starke Waffe gefunden
                if (w.power >= 11) {
                    // Nur aufheben wenn keine andere Waffe vorhanden
                    if (!this.weapon && this.weakWeapons.length === 0) {
                        this.weapon = { power: w.power };
                        logInfo(`${this.name} hat eine starke Waffe gefunden (+${w.power} Schaden)!`);
                        weapons.splice(i, 1);
                        drawGrid();
                    }
                } else {
                    // Schwache Waffe gefunden
                    // Nur aufheben wenn keine starke Waffe und weniger als 2 schwache
                    if (!this.weapon && this.weakWeapons.length < 2) {
                        this.weakWeapons.push({ power: w.power });
                        logInfo(`${this.name} hat eine schwache Waffe gefunden (+${w.power} Schaden)!`);
                        weapons.splice(i, 1);
                        drawGrid();
                    }
                }
                break;
            }
        }
    }

    randomWalk() {
        // geringe chance auf richtungswechsel
        const nearEdge = this.x < 3 || this.x >= WIDTH - 3 || this.y < 3 || this.y >= HEIGHT - 3;
        if (!this.walkDirection || Math.random() < 0.04 || nearEdge) {
            this.walkDirection = randomInt(0, 3);
        }

        // Soziale Einflüsse: wenn in der Nähe ein Feind mit hoher Hostility ist, gezielt auf ihn zugehen
        const nearby = tributes.filter(t => t !== this && t.alive && Math.abs(t.x - this.x) + Math.abs(t.y - this.y) <= 6);
        let specialTarget = null;
        for (const t of nearby) {
            const hostility = this.social.hostility[t.id] || 0;
            const fear = this.social.fear[t.id] || 0;
            const trust = this.social.trust[t.id] || 0;
            if (hostility > 0.3 && hostility > fear && trust < 0.6) {
                specialTarget = t;
                break;
            }
            if (fear > 0.6 && trust < 0.4) {
                // flüchten vor demjenigen - aber danach weiterlaufen in Fluchtrichtung
                this.moveAwayFrom(t.x, t.y);
                this.walkDirection = null;  // Reset um neue Fluchtrichtung zu finden
                return;
            }
        }
        if (specialTarget) {
            this.moveTowards(specialTarget.x, specialTarget.y);
            this.walkDirection = null;  // Zielgerichtete Bewegung, dann zurück zu randomWalk
            return;
        }

        if (lavaStart) {
            this.moveTowards(0, 0);
            return;
        }

        // Normale persistente Bewegung
        let newX = this.x + (this.walkDirection === 0 ? 1 : this.walkDirection === 1 ? -1 : 0);
        let newY = this.y + (this.walkDirection === 2 ? 1 : this.walkDirection === 3 ? -1 : 0);

        newX = Math.max(0, Math.min(WIDTH - 1, newX));
        newY = Math.max(0, Math.min(HEIGHT - 1, newY));

        this.x = newX;
        this.y = newY;
    }

    moveTowards(targetX, targetY) {
        // Zielkoordinaten normalisieren (falls Objekt übergeben wird)
        if (typeof targetX === 'object' && targetX !== null) {
            targetY = targetX.y;
            targetX = targetX.x;
        }

        let dx = targetX - this.x;
        let dy = targetY - this.y;

        let newX = this.x;
        let newY = this.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            newX += Math.sign(dx);
        } else {
            newY += Math.sign(dy);
        }

        // Grenzen beachten
        newX = Math.max(0, Math.min(WIDTH - 1, newX));
        newY = Math.max(0, Math.min(HEIGHT - 1, newY));

        this.x = newX;
        this.y = newY;
    }

    moveAwayFrom(targetX, targetY) {
        // Zielkoordinaten normalisieren (falls Objekt übergeben wird)
        if (typeof targetX === 'object' && targetX !== null) {
            targetY = targetX.y;
            targetX = targetX.x;
        }

        let dx = this.x - targetX;
        let dy = this.y - targetY;

        let newX = this.x;
        let newY = this.y;

        // Prüfe, ob am Rand: wenn ja, ändere Strategie
        const atEdge = this.x < 2 || this.x >= WIDTH - 2 || this.y < 2 || this.y >= HEIGHT - 2;

        if (atEdge) {
            // Am Rand: Laufe zur Mitte statt weg vom Feind
            dx = middleofarena.x - this.x;
            dy = middleofarena.y - this.y;
        }

        if (Math.abs(dx) > Math.abs(dy)) {
            newX += Math.sign(dx);
        } else {
            newY += Math.sign(dy);
        }

        // Grenzen beachten
        newX = Math.max(0, Math.min(WIDTH - 1, newX));
        newY = Math.max(0, Math.min(HEIGHT - 1, newY));

        this.x = newX;
        this.y = newY;
    }

    hide() {
        let surroundings = this.getSurroundings();
        let forestTiles = surroundings.filter(tile => tile.type === 'forest');

        if (forestTiles.length > 0) {
            let tile = forestTiles[randomInt(0, forestTiles.length - 1)];
            this.x = tile.x;
            this.y = tile.y;
        } else {
            this.moveAwayFrom(middleofarena.x, middleofarena.y);
        }
    }

    findNearestEnemy() {
        let bestScore = Infinity;
        let nearestEnemy = null;
        for (const t of tributes) {
            if (!t.alive || t === this || this.isFriend(t)) continue;
            const dist = Math.abs(this.x - t.x) + Math.abs(this.y - t.y);
            const hostility = this.social.hostility[t.id] || 0;
            const fear = this.social.fear[t.id] || 0;
            const trust = this.social.trust[t.id] || 0;
            // Score: geringe Distanz gut; hohe Hostility reduziert Score (wichtiges Ziel),
            // hohe Fear erhöht Score (meide), hohe Trust erhöht Score (meide)
            const score = dist - hostility * 6 + fear * 5 + trust * 4;
            if (score < bestScore) {
                bestScore = score;
                nearestEnemy = t;
            }
        }
        return nearestEnemy;
    }

    isFriend(other) {
        // Freundschaft ist immer gegenseitig
        return this.friends.includes(other.id) && other.friends.includes(this.id);
    }

    isFriendOfFriend(other) {
        // Gibt true zurück, wenn sie einen gemeinsamen Freund in der Nähe haben
        for (const fid of this.friends) {
            const friend = tributes.find(t => t.id === fid && t.alive);
            if (
                friend &&
                friend.friends.includes(other.id) &&
                this.getDistance(friend) <= 3 &&
                other.getDistance(friend) <= 3
            ) {
                return true;
            }
        }
        return false;
    }

    helpFriend(opponent) {
        logInfo(`${this.name} passt und greift ${opponent.name} nicht an.`);
        // Falls der Freund (opponent) gerade angegriffen wird, greife dessen Angreifer an
        const attacker = opponent.lastAttacker;
        if (
            attacker &&
            attacker !== this &&
            attacker.alive &&
            !this.isFriend(attacker) // Nicht auf eigene Freunde losgehen
        ) {
            logInfo(`${this.name} verteidigt ${opponent.name} und greift ${attacker.name} an!`);
            this.fight(attacker);
        }
    }

    fight(opponent) {
        if (!this.alive || !opponent.alive) return;

        // --- wieder eingebaute Freund-/FOF-Logik (wie gewünscht) ---
        const aliveTributes = tributes.filter(t => t.alive);
        // Prüfe, ob alle lebenden Tribute Freunde oder FOF sind
        let onlyFriendsLeft = aliveTributes.every(t =>
            t === this ||
            this.isFriend(t) ||
            this.isFriendOfFriend(t)
        );

        if (this.ängstlich && Math.random() < 0.5 && opponent.health + 20 > this.health) {
            this.moveAwayFrom(opponent.x, opponent.y);
            logInfo(`${this.name} ist ängstlich und vermeidet den Kampf mit ${opponent.name}.`);
            return;
        }
        // Freunde greifen sich nicht an, solange mehr als 2 Tribute leben und nicht nur Freunde übrig
        const aliveCount = aliveTributes.length;
        if (
            !onlyFriendsLeft &&
            this.isFriend(opponent) && aliveCount > 2
        ) {
            logInfo(`${this.name} weigert sich, Freund ${opponent.name} anzugreifen.`);
            this.helpFriend(opponent);
            return;
        }
        // Freund eines Freundes: tolerieren, solange gemeinsamer Freund in der Nähe und mehr als 2 leben und nicht nur Freunde übrig
        if (
            !onlyFriendsLeft &&
            this.isFriendOfFriend(opponent) && aliveCount > 2
        ) {
            logInfo(`${this.name} toleriert ${opponent.name} wegen gemeinsamer Freundschaft.`);
            return;
        }

        // 1️⃣ Vertrauen prüfen: hohes Vertrauen verhindert Angriff (soziale Bindung)
        const trustLevel = this.social.trust[opponent.id] || 0;
        if (trustLevel > 0.7 && aliveCount > 3 && !onlyFriendsLeft) {
            logInfo(`${this.name} weigert sich, Freund ${opponent.name} anzugreifen.`);
            this.helpFriend(opponent);
            return;
        }

        // 2️⃣ Angst prüfen: bei hoher Angst zieht sich Tribut zurück
        const fearLevel = this.social.fear[opponent.id] || 0;
        if (fearLevel > 0.5 && Math.random() < fearLevel) {
            logInfo(`${this.name} zieht sich vor ${opponent.name} zurück.`);
            this.moveAwayFrom(opponent.x, opponent.y);
            return;
        }

        //altersunterschied fürt zu rückzug
        const ageDiff = Math.abs(this.age - opponent.age);
        if (ageDiff >= 3 && fearLevel > 0.1 && !this.aggressive && Math.random() < (fearLevel + (ageDiff * 0.1) - 0.2) && opponent.health > (this.health + (fearLevel * 5))) {
            logInfo(`${this.name} zieht sich vor ${opponent.name} zurück.`);
            this.moveAwayFrom(opponent.x, opponent.y);
            return;
        }

        if (opponent.attributes.beliebt && Math.random() < 0.5 && opponent.health >= this.health - 10 && opponent.damageDealt < this.damageDealt + 20) {
            logInfo(`${this.name} zieht sich vor ${opponent.name} zurück.`);
            this.moveAwayFrom(opponent.x, opponent.y);
            return;
        }

        // 3️⃣ Rache / Aggression verstärkt Angriffskraft
        const hostilityLevel = this.social.hostility[opponent.id] || 0;
        let attackPower;
        if (hostilityLevel > 0.5) {
            attackPower = Math.round(this.calculateAttackPower(opponent) * (1 + hostilityLevel));
            logInfo(`${this.name} ist wütend auf ${opponent.name} und greift mit erhöhter Kraft an!`);
        } else {
            attackPower = Math.round(this.calculateAttackPower(opponent))
        }
        opponent.health -= attackPower;
        this.damageDealt += attackPower;
        opponent.damageTaken += attackPower;
        opponent.lastAttacker = this;


        // Angst/Hostility Effekte bei Opfer setzen
        opponent.social.fear[this.id] = Math.min(1, (opponent.social.fear[this.id] || 0) + attackPower / 100 + (Math.random() * 0.25));
        this.social.hostility[opponent.id] = Math.min(1, (this.social.hostility[opponent.id] || 0) + 0.02 + Math.random() * 0.05);

        if (attackPower > 0) {
            logAttack(`${this.name} greift ${opponent.name} an und fügt ${Math.round(attackPower)} Schaden zu!`);
        }

        if (opponent.health <= 0) {
            this.kills += 1;
            opponent.die('Kampf', this);
            // Sozialnetz beeinflussen: Freunde des Opfers erhöhen Vertrauen zum Killer leicht
            if (typeof this.increaseTrustFromDeath === 'function') this.increaseTrustFromDeath(opponent);
        } else {
            opponent.counterAttack(this);
        }
    }

    // --- NEU: Gegenangriffsmethode für Tribute ---
    counterAttack(attacker) {
        if (!this.alive || !attacker.alive) return;
        // Optional: Chance auf Gegenangriff, z.B. 60%
        if (Math.random() < 0.6) {
            let attackPower = Math.round(this.calculateAttackPower(attacker));
            attacker.health -= attackPower;
            this.damageDealt += attackPower;
            attacker.damageTaken += attackPower;
            attacker.lastAttacker = this;
            if (attackPower > 0) {
                logAttack(`${this.name} kontert gegen ${attacker.name} und fügt ${attackPower} Schaden zu!`);
            }
            if (attacker.health <= 0) {
                this.kills += 1;
                attacker.die('Kampf', this);
            }
        }
    }

    die(reason, killer = null) {
        this.alive = false;
        if (reason === 'Kampf' && (killer || this.lastAttacker)) {
            const killerName = (killer ? killer.name : (this.lastAttacker ? this.lastAttacker.name : 'Unbekannt'));
            logDeath(`${this.name} ist gestorben (${reason} durch ${killerName})`);
        } else {
            logDeath(`${this.name} ist gestorben (${reason})`);
        }
        updateTributeProfile(this);
        updateStatsTable();
    }

    calculateAttackPower(opponent) {
        let attackPower = randomInt(5, 20);
        const aliveCount = tributes.filter(t => t.alive).length;

        if (this.attributes.stark) attackPower += 5;
        if (this.attributes.schlau) attackPower += 1;

        let Waffenvorteil = 0

        // Waffen-Bonus
        if (this.weapon) {
            Waffenvorteil += this.weapon.power;
        }
        if (this.weakWeapons && this.weakWeapons.length > 0) {
            // Addiere alle schwachen Waffen
            for (const w of this.weakWeapons) Waffenvorteil += w.power;
        }

        // Schlaue wissen besser die Waffen anzuwenden
        if (this.attributes.schlau) {
            attackPower += Waffenvorteil * 1.2
        } else {
            attackPower += Waffenvorteil
        }

        if (this.gender === 'männlich' && opponent.gender === 'weiblich' && opponent.health + 20 < this.health && !this.aggressive) {
            if (Math.random() < 0.2) { // 20% Chance, zurückzuweichen
                logInfo(`${this.name} versucht ${opponent.name} aus dem Weg zu gehen.`);
                this.moveAwayFrom(opponent.x, opponent.y);
                return 0;
            }
        }

        if (this.gender === 'weiblich' && opponent.gender === 'männlich') {
            attackPower -= 3;
        } else if (this.gender === 'männlich' && opponent.gender === 'weiblich') {
            attackPower += 5;
        }

        //Angst vor Killern
        if (opponent.kills >= 4 && this.kills < 3 && opponent.health >= this.health + 15) {
            //Angst macht stärker
            attackPower += 3;
            //Trotzdem gibt es einen Fluchtversuch
            this.moveAwayFrom(opponent.x, opponent.y);
            if (this.ängstlich) {
                this.social.fear[opponent.id] += 0.8;
            } else {
                this.social.fear[opponent.id] += 0.5;
            }

        }

        //Nicht selbst zum Killer werden wollen
        if (aliveCount >= 5 && !this.aggressive && Math.random() >= 0.8 && this.health > (opponent.health * 1.2)) {
            logInfo(`${this.name} versucht ${opponent.name} aus dem Weg zu gehen.`)
            return 0;
        }

        // verletzte machen weniger schaden
        if (opponent.health >= this.health && this.health < 75) {
            let verhältniss = opponent.health / this.health;
            let weakness = attackPower * verhältniss;
            // zwischen 5 und 15 begrenzen
            weakness = Math.min(Math.max(weakness, 5), 15);
            attackPower -= weakness;
        }

        // dauerhafte Angst kann stärken aber auch zu größeren Nachteilen führen
        if (this.ängstlich || this.social.fear[opponent.id] >= 0.8) {
            if (Math.random() >= 0.5) {
                attackPower = attackPower * 0.9;
            } else {
                attackPower += 3;
            }
        }

        // aggressivität kann zu Fehlern führen
        if (this.aggressive && !this.attributes.schlau && Math.random() >= 0.657) {
            attackPower -= 4;
        }

        let altersunterschied = Math.abs(this.age - opponent.age);
        let ageadd = 0;
        if (altersunterschied > 3 || (this.age < 14 && altersunterschied > 1)) { // nur bei großem Altersunterschied, oder jungen Tribut gegen älteren
            if (this.age > opponent.age) {
                ageadd += altersunterschied * 8.1;
            } else if (this.age < opponent.age) {
                ageadd -= altersunterschied * 5.3;
            }
            if (ageadd > 15) ageadd = 15;
            if (ageadd < -10) ageadd = -10;
            attackPower += ageadd;
        }

        if (attackPower < 0) attackPower = 0;

        return Math.round(attackPower);
    }

    // Neue Hilfsfunktion: Finde angrenzende Lava
    findNearbyLava() {
        // Sucht im Sichtbereich nach Lava, gibt das nächste Lavafeld zurück (oder null)
        let minDist = Infinity;
        let nearestLava = null;
        for (let dx = -MAX_VIEW_DISTANCE; dx <= MAX_VIEW_DISTANCE; dx++) {
            for (let dy = -MAX_VIEW_DISTANCE; dy <= MAX_VIEW_DISTANCE; dy++) {
                let nx = this.x + dx;
                let ny = this.y + dy;
                if (
                    nx >= 0 && nx < WIDTH &&
                    ny >= 0 && ny < HEIGHT &&
                    grid[ny][nx] === 'lava'
                ) {
                    let dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestLava = { x: nx, y: ny };
                    }
                }
            }
        }
        return nearestLava;
    }



    findNearestWeapon() {
        if (this.weapon || weapons.length === 0) return null;
        let minDist = Infinity;
        let nearest = null;
        for (const w of weapons) {
            const dist = Math.abs(this.x - w.x) + Math.abs(this.y - w.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = w;
            }
        }
        return nearest;
    }

    isEnemyNearby() {
        // Ein anderer lebender Tribut im Umkreis von 3 Feldern
        return tributes.some(t =>
            t !== this && t.alive &&
            Math.abs(t.x - this.x) <= 3 &&
            Math.abs(t.y - this.y) <= 3
        );
    }
}

class Animal {
    constructor() {
        this.x = randomInt(0, WIDTH - 1);
        this.y = randomInt(0, HEIGHT - 1);
        this.alive = true;
        this.health = 40; // Weniger Leben als Tribute
        this.direction = randomInt(0, 3);
        this.speed = 2; // Tiere sind schneller
    }

    move() {
        if (!this.alive) return;

        for (let s = 0; s < this.speed; s++) {
            const lavaTile = this.findNearbyLava();
            if (lavaTile) {
                this.moveAwayFrom(lavaTile.x, lavaTile.y);
            } else {
                const target = this.findNearestTribute();
                if (target) {
                    this.moveTowards(target.x, target.y);
                    // Angriff, falls direkt benachbart
                    if (Math.abs(this.x - target.x) <= 1 && Math.abs(this.y - target.y) <= 1 && target.alive) {
                        this.attack(target);
                    }
                } else {
                    this.randomWalk();
                }
            }
        }
    }

    randomWalk() {
        if (!this.alive) return;

        // --- 1️⃣ Definiere mögliche Ziele mit Prioritäten ---
        const goals = [
            {
                type: "weapon",
                weight: (!this.weapon && weapons.length > 0) ? 0.8 : 0.2
            },
            {
                type: "enemy",
                weight: this.behavior === "aggressiv" ? 0.9 : (this.behavior === "defensiv" ? 0.4 : 0.1)
            },
            {
                type: "safety",
                weight: (this.health < 50) ? 0.9 : 0.2
            },
            {
                type: "explore",
                weight: 0.3
            }
        ];

        // --- 2️⃣ Zufällige Auswahl eines Ziels nach Gewichtung ---
        const total = goals.reduce((a, g) => a + g.weight, 0);
        const r = Math.random() * total;
        let acc = 0;
        let chosen = goals[0];
        for (const g of goals) {
            acc += g.weight;
            if (r <= acc) { chosen = g; break; }
        }

        // --- 3️⃣ Verhalte dich entsprechend des gewählten Ziels ---
        switch (chosen.type) {
            case "weapon": {
                const w = this.findNearestWeapon();
                if (w) {
                    this.moveTowards(w.x, w.y);
                    return;
                }
                break;
            }

            case "enemy": {
                const target = this.findNearestEnemy();
                if (target) {
                    this.moveTowards(target.x, target.y);
                    return;
                }
                break;
            }

            case "safety": {
                const enemy = this.findNearestEnemy();
                if (enemy) {
                    this.moveAwayFrom(enemy.x, enemy.y);
                    return;
                }
                break;
            }

            case "explore":
            default:
                // leichte Zufallsbewegung mit Richtungsdrift
                if (Math.random() > 0.7) {
                    this.direction = randomInt(0, 3);
                }
                break;
        }

        // --- 4️⃣ Fallback-Bewegung (leichte zufällige Drift) ---
        let newX = this.x + (this.direction === 0 ? 1 : this.direction === 1 ? -1 : 0);
        let newY = this.y + (this.direction === 2 ? 1 : this.direction === 3 ? -1 : 0);

        newX = Math.max(0, Math.min(WIDTH - 1, newX));
        newY = Math.max(0, Math.min(HEIGHT - 1, newY));

        this.x = newX;
        this.y = newY;
    }


    moveTowards(targetX, targetY) {
        let dx = targetX - this.x;
        let dy = targetY - this.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            this.x += Math.sign(dx);
        } else {
            this.y += Math.sign(dy);
        }
        this.x = Math.max(0, Math.min(WIDTH - 1, this.x));
        this.y = Math.max(0, Math.min(HEIGHT - 1, this.y));
    }

    moveAwayFrom(targetX, targetY) {
        let dx = this.x - targetX;
        let dy = this.y - targetY;
        if (Math.abs(dx) > Math.abs(dy)) {
            this.x += Math.sign(dx);
        } else {
            this.y += Math.sign(dy);
        }
        this.x = Math.max(0, Math.min(WIDTH - 1, this.x));
        this.y = Math.max(0, Math.min(HEIGHT - 1, this.y));
    }

    findNearestTribute() {
        let minDist = Infinity;
        let nearest = null;
        tributes.forEach(t => {
            if (t.alive) {
                let dist = Math.abs(this.x - t.x) + Math.abs(this.y - t.y);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = t;
                }
            }
        });
        return nearest;
    }

    attack(tribute) {
        const damage = randomInt(5, 20);
        tribute.health -= damage;
        tribute.damageTaken += damage;
        tribute.lastAttacker = null;
        if (damage > 0) {
            logAttack(`Wildtier greift ${tribute.name} an und fügt ${damage} Schaden zu!`);
        }
        if (tribute.health <= 0) {
            tribute.die('von einem Wildtier getötet');
        } else {
            // Tribut wehrt sich gegen das Tier
            tribute.counterAttackAnimal(this);
        }
    }

    takeDamage(amount, attacker) {
        this.health -= amount;
        if (this.health <= 0) {
            this.alive = false;
            logInfo(`Ein Wildtier wurde von ${attacker.name} getötet!`); // Info statt Tod Log für Tiere
        }
    }

    findNearbyLava() {
        let minDist = Infinity;
        let nearestLava = null;
        for (let dx = -MAX_VIEW_DISTANCE; dx <= MAX_VIEW_DISTANCE; dx++) {
            for (let dy = -MAX_VIEW_DISTANCE; dy <= MAX_VIEW_DISTANCE; dy++) {
                let nx = this.x + dx;
                let ny = this.y + dy;
                if (
                    nx >= 0 && nx < WIDTH &&
                    ny >= 0 && ny < HEIGHT &&
                    grid[ny][nx] === 'lava'
                ) {
                    let dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestLava = { x: nx, y: ny };
                    }
                }
            }
        }
        return nearestLava;
    }
}

// Ergänzung: Tribute können Tiere kontern
Tribute.prototype.counterAttackAnimal = function (animal) {
    if (!this.alive || !animal.alive) return;
    // Schaden wie im Kampf gegen Tribute
    let attackPower = randomInt(5, 20);
    if (this.attributes.stark) attackPower += 5;
    if (this.attributes.schlau) attackPower += 1;
    animal.takeDamage(attackPower, this);
    if (attackPower > 0) {
        logAttack(`${this.name} wehrt sich gegen ein Wildtier und fügt ${attackPower} Schaden zu!`);
    }
};

let simulationPaused = false;


function pauseSimulation() {
    if (simulationPaused) {
        // Fortsetzen
        simulationPaused = false;
        simulationRunning = true;
        runSimulation();
        setUIForState('running');
    } else if (simulationRunning) {
        // Pausieren
        simulationPaused = true;
        simulationRunning = false;
        setUIForState('paused');
    }
}

// Passe runSimulation an:
function runSimulation() {
    if (!simulationRunning || simulationPaused) return;

    tributes.forEach(tribute => tribute.move());
    // Nach Bewegungen: kurzfristige soziale Anpassungen
    tributes.forEach(tribute => {
        if (tribute.alive) tribute.updateSocialRelations();
    });
    animals.forEach(animal => animal.move());

    if (lavaStart) advanceLava();

    checkTributesOnCanvas();

    checkForWinner();
    drawGrid();
    updateStatsTable();
    if (!winnerDeclared) setTimeout(runSimulation, 1000 / document.getElementById('speed').value);
}

// Passe startSimulation an:
function startSimulation() {
    updateLiveCount()
    setUIForState('running');

    if (simulationRunning) return;
    //arena generieren button disabeln
    const generateArenaBtn = document.querySelector('button[onclick="generateArena()"]');
    if (generateArenaBtn) generateArenaBtn.disabled = true;

    simulationPaused = false;
    simulationRunning = true;
    // Nutze die aktuelle Anzahl der Profile, nicht den Wert im Input!
    createTributes(tributes.length > 0 ? tributes.length : parseInt(document.getElementById('tribute-count').value));
    // Waffen im Zentrum spawnen
    spawnWeaponsInCenter();
    saveProfiles();
    profilesLocked = true;
    const spawnBtn = document.querySelector('button[onclick="spawnAnimal()"]');
    if (spawnBtn) spawnBtn.disabled = false;
    runSimulation();
}
function checkForWinner() {
    let aliveTributes = tributes.filter(t => t.alive);

    // --- Automatisches Endspiel bei <= 3 Tribute oder manueller Start ---
    if (!lavaStart && (aliveTributes.length <= 3 || lavashouldstart)) {
        if (!lavashouldstart) {
            lavashouldstart = true;
            logInfo("Die Tribute werden zum Zentrum der Arena gezwungen!");
            evilnumberoflava = 0; // Reset counter when starting
        }

        // Tribute zum Zentrum bewegen
        aliveTributes.forEach(tribute => {
            tribute.moveTowards(middleofarena.x, middleofarena.y);
        });

        // Nach 6 Ticks Lava starten
        evilnumberoflava++;
        if (evilnumberoflava > 6 && !lavaStart) {
            lavaStart = true;
            animals = [];
            const spawnBtn = document.querySelector('button[onclick="spawnAnimal()"]');
            if (spawnBtn) spawnBtn.disabled = true;
            logWin("Das Endspiel beginnt! Alle Wildtiere verschwinden.");
            drawGrid();
        }
    }

    if (aliveTributes.length === 1 && !winnerDeclared) {
        winnerDeclared = true;
        logWin(`${aliveTributes[0].name} hat gewonnen!`);
        simulationRunning = false;
        setUIForState('stopped');
    } else if (aliveTributes.length === 0 && !winnerDeclared) {
        winnerDeclared = true;
        logWin(`Niemand hat überlebt.`);
        simulationRunning = false;
        setUIForState('stopped');
    }
}

function advanceLava() {
    lavaRadius += LAVA_SPEED;
    let offset = Math.floor(lavaRadius);
    for (let i = offset; i < HEIGHT - offset; i++) {
        if (grid[i][offset] !== 'lava') grid[i][offset] = 'lava';
        if (grid[i][WIDTH - offset - 1] !== 'lava') grid[i][WIDTH - offset - 1] = 'lava';
    }
    for (let j = offset; j < WIDTH - offset; j++) {
        if (grid[offset][j] !== 'lava') grid[offset][j] = 'lava';
        if (grid[HEIGHT - offset - 1][j] !== 'lava') grid[HEIGHT - offset - 1][j] = 'lava';
    }
}

function createTributes(num) {
    // Kreisförmige Spawn-Positionen berechnen, ggf. zwei Kreise
    const centerX = Math.floor(WIDTH / 2);
    const centerY = Math.floor(HEIGHT / 2);
    const maxRadius = 19;
    const minRadius = 8;
    const safeZone = 5; // 10x10 Bereich, also +/-5 um das Zentrum

    // Hilfsfunktion: Prüft, ob Position im 10x10 Zentrum liegt
    function isInCenter(x, y) {
        return (
            x >= centerX - safeZone &&
            x <= centerX + safeZone &&
            y >= centerY - safeZone &&
            y <= centerY + safeZone
        );
    }

    let spawnPositions = [];
    let outerCount = num;
    let innerCount = 0;
    let useTwoCircles = false;

    // Entscheide, ob zwei Kreise nötig sind (Faustregel: ab 20 Tribute)
    if (num > 20) {
        useTwoCircles = true;
        // Verteile Tribute etwa 2/3 außen, 1/3 innen
        outerCount = Math.ceil(num * 2 / 3);
        innerCount = num - outerCount;
    }

    // Äußerer Kreis
    const outerRadius = Math.min(
        maxRadius,
        Math.floor(Math.min(WIDTH, HEIGHT) / 2.5),
        Math.ceil(num * 2.2)
    );
    const outerAngleStep = (2 * Math.PI) / outerCount;
    for (let i = 0; i < outerCount; i++) {
        let tries = 0;
        let x, y;
        do {
            const angle = i * outerAngleStep + (tries * 0.1); // bei Konflikt leicht drehen
            x = Math.round(centerX + outerRadius * Math.cos(angle));
            y = Math.round(centerY + outerRadius * Math.sin(angle));
            x = Math.max(0, Math.min(WIDTH - 1, x));
            y = Math.max(0, Math.min(HEIGHT - 1, y));
            tries++;
        } while (isInCenter(x, y) && tries < 20);
        spawnPositions.push({ x, y });
    }

    // Innerer Kreis (falls nötig)
    if (useTwoCircles) {
        const innerRadius = Math.max(minRadius, Math.floor(outerRadius * 0.55));
        const innerAngleStep = (2 * Math.PI) / innerCount;
        for (let i = 0; i < innerCount; i++) {
            let tries = 0;
            let x, y;
            do {
                const angle = i * innerAngleStep + (tries * 0.1);
                x = Math.round(centerX + innerRadius * Math.cos(angle));
                y = Math.round(centerY + innerRadius * Math.sin(angle));
                x = Math.max(0, Math.min(WIDTH - 1, x));
                y = Math.max(0, Math.min(HEIGHT - 1, y));
                tries++;
            } while (isInCenter(x, y) && tries < 20);
            spawnPositions.push({ x, y });
        }
    }

    // Tribute erzeugen oder anpassen
    const existingCount = tributes.length;
    if (num > existingCount) {
        for (let i = existingCount; i < num; i++) {
            tributes.push(new Tribute(i + 1, spawnPositions[i]));
        }
    } else if (num < existingCount) {
        tributes.splice(num);
    }
    // Setze Positionen für alle Tribute neu (auch bei Reduktion)
    for (let i = 0; i < num; i++) {
        // Falls Tribute plain objects sind (z.B. nach Laden), wandle sie in Tribute-Objekte um
        if (!(tributes[i] instanceof Tribute)) {
            const tOld = tributes[i];
            tributes[i] = new Tribute(tOld.id, spawnPositions[i]);
            Object.assign(tributes[i], tOld);
            if (!tributes[i].weapon) tributes[i].weapon = null;
            if (!tributes[i].weakWeapons) tributes[i].weakWeapons = [];
        }
        tributes[i].x = spawnPositions[i].x;
        tributes[i].y = spawnPositions[i].y;
    }
    updateProfiles();

    // Zufällige Freundschaften erzeugen (nur bei Neuanlage)
    if (tributes.length === num && tributes.every(t => t.friends.length === 0)) {
        // Für jeden Tribut: 0-2 zufällige Freunde (keine Selbstfreundschaft, symmetrisch)
        for (let i = 0; i < num; i++) {
            let t = tributes[i];
            let possibleFriends = tributes.filter(o => o.id !== t.id);
            let friendCount = randomInt(0, Math.min(2, possibleFriends.length));
            let chosen = [];
            while (chosen.length < friendCount) {
                let pick = possibleFriends[randomInt(0, possibleFriends.length - 1)];
                if (!chosen.includes(pick) && !t.friends.includes(pick.id)) {
                    chosen.push(pick);
                    // Symmetrisch eintragen
                    t.friends.push(pick.id);
                    pick.friends.push(t.id);
                    // Soziale Grundwerte setzen: volles Vertrauen zwischen Freunden
                    t.social.trust[pick.id] = 1;
                    pick.social.trust[t.id] = 1;
                }
            }
        }
    }
    updateProfiles();
}

function createAnimals(num) {
    animals = Array.from({ length: num }, () => new Animal());
}

function createStatsTable() {
    let container = document.getElementById('stats-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'stats-container';
        container.style.marginTop = '24px';
        container.style.width = '100%';
        container.style.maxWidth = '900px';
        container.style.background = 'var(--secondary-bg)';
        container.style.borderRadius = '10px';
        container.style.boxShadow = '0 0 8px #000a';
        container.style.padding = '12px 8px 8px 8px';
        container.style.overflowX = 'auto';
        document.body.insertBefore(container, document.getElementById('log-filter-bar'));
    }
    container.innerHTML = `
        <div id="stats-sort-bar" style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px;">
            <label>Sortieren nach:
                <select id="stats-sort-key">
                    <option value="damageDealt">Schaden verteilt</option>
                    <option value="damageTaken">Schaden erlitten</option>
                    <option value="distanceMoved">Distanz gelaufen</option>
                    <option value="kills">Kills</option>
                </select>
            </label>
            <button id="stats-sort-dir" style="border-radius:4px;border:none;padding:2px 10px;cursor:pointer;background:var(--main-gold);color:var(--main-dark);font-weight:bold;">▼</button>
        </div>
        <table id="stats-table" style="width:100%;border-collapse:collapse;">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Schaden verteilt</th>
                    <th>Schaden erlitten</th>
                    <th>Distanz gelaufen</th>
                    <th>Kills</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;
    document.getElementById('stats-sort-key').addEventListener('change', updateStatsTable);
    document.getElementById('stats-sort-dir').addEventListener('click', function () {
        this.dataset.dir = this.dataset.dir === 'asc' ? 'desc' : 'asc';
        this.textContent = this.dataset.dir === 'asc' ? '▲' : '▼';
        updateStatsTable();
    });
    document.getElementById('stats-sort-dir').dataset.dir = 'desc';
}

function updateStatsTable() {
    if (!document.getElementById('stats-table')) return;
    const sortKey = document.getElementById('stats-sort-key').value;
    const sortDir = document.getElementById('stats-sort-dir').dataset.dir || 'desc';
    let rows = tributes.map(t => ({
        name: t.name,
        damageDealt: t.damageDealt || 0,
        damageTaken: t.damageTaken || 0,
        distanceMoved: t.distanceMoved || 0,
        kills: t.kills || 0,
        alive: t.alive,
        color: t.color
    }));
    rows.sort((a, b) => {
        if (sortDir === 'asc') return a[sortKey] - b[sortKey];
        else return b[sortKey] - a[sortKey];
    });
    const tbody = document.getElementById('stats-table').querySelector('tbody');
    tbody.innerHTML = '';
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.opacity = row.alive ? '1' : '0.5';
        tr.innerHTML = `
            <td style="color:${row.color};font-weight:bold;">${row.name}${row.alive ? '' : ' ☠️'}</td>
            <td>${row.damageDealt}</td>
            <td>${row.damageTaken}</td>
            <td>${row.distanceMoved}</td>
            <td>${row.kills}</td>
        `;
        tbody.appendChild(tr);
    });
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

canvas.addEventListener('mousedown', function () {
    if (!simulationRunning) drawing = true;
});
canvas.addEventListener('mouseup', function () { drawing = false; });
canvas.addEventListener('mousemove', function (e) {
    if (!drawing || simulationRunning) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);
    const drawMode = document.getElementById('draw-mode').value;
    const brushSize = parseInt(document.getElementById('brush-size').value);

    for (let dx = -Math.floor(brushSize / 2); dx <= Math.floor(brushSize / 2); dx++) {
        for (let dy = -Math.floor(brushSize / 2); dy <= Math.floor(brushSize / 2); dy++) {
            if (x + dx >= 0 && x + dx < WIDTH && y + dy >= 0 && y + dy < HEIGHT) {
                // Kein Platzieren von "animal" mehr über das Zeichnen
                if (drawMode !== "animal") {
                    grid[y + dy][x + dx] = drawMode;
                }
            }
        }
    }
    drawGrid();
});

// Neue Funktion: Wildtier loslassen
function spawnAnimal() {
    if (lavaStart) return; // Kein Spawnen im Endspiel
    // Suche eine zufällige freie Position ohne Lava
    let tries = 0;
    let maxTries = 1000;
    let x, y;
    do {
        x = randomInt(0, WIDTH - 1);
        y = randomInt(0, HEIGHT - 1);
        tries++;
    } while ((grid[y][x] === 'lava') && tries < maxTries);

    if (tries >= maxTries) {
        alert("Kein Platz für ein Wildtier gefunden!");
        return;
    }
    animals.push(new AnimalSpawnAt(x, y));
    drawGrid();
}

// Neue Klasse für gezieltes Spawnen
class AnimalSpawnAt extends Animal {
    constructor(x, y) {
        super();
        this.x = x;
        this.y = y;
    }
}

// Füge die fehlende Funktion saveProfiles wieder ein (sie ist bereits weiter unten im Code vorhanden, aber sie muss vor ihrer ersten Verwendung stehen oder als Funktionsdeklaration vorliegen)
function saveProfiles() {
    tributes.forEach(tribute => {
        const profileDiv = document.querySelector(`.tribute-profile[data-id="${tribute.id}"]`);
        if (profileDiv) {
            const selects = profileDiv.querySelectorAll('select');
            tribute.name = profileDiv.querySelector('input[type="text"]').value;
            tribute.age = parseInt(profileDiv.querySelector('input[type="number"]').value);
            tribute.gender = selects[0].value;    // Geschlecht
            tribute.behavior = selects[1].value;  // Verhalten
            tribute.color = profileDiv.querySelector('input[type="color"]').value;
        }
    });
}

// Füge die fehlende Funktion updateProfiles wieder ein (sie ist bereits weiter unten im Code vorhanden, aber sie muss vor ihrer ersten Verwendung stehen oder als Funktionsdeklaration vorliegen)
function updateProfiles() {
    const profilesContainer = document.getElementById('profiles-container');
    profilesContainer.innerHTML = '';
    tributes.forEach(tribute => {
        const profileDiv = document.createElement('div');
        profileDiv.classList.add('tribute-profile');
        profileDiv.setAttribute('data-id', tribute.id);
        if (!tribute.alive) profileDiv.classList.add('dead');

        // ...im Inneren von updateProfiles(), vor profileDiv.innerHTML = ...
        let friendsHtml = '';
        if (tributes.length > 1) {
            friendsHtml = `<div class="friends-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px 12px;margin:8px 0 0 0;">`;
            tributes.forEach(other => {
                if (other.id !== tribute.id) {
                    const checked = tribute.friends && tribute.friends.includes(other.id) ? 'checked' : '';
                    const disabled = profilesLocked ? 'disabled' : '';
                    friendsHtml += `
                    <label style="display:flex;align-items:center;gap:6px;padding:2px 0;">
                        <input type="checkbox" data-friend-id="${other.id}" ${checked} ${disabled} style="margin:0;">
                        <span style="color:${other.color};font-weight:bold;">${other.name}</span>
                    </label>
                `;
                }
            });
            friendsHtml += `</div>`;
        }

        profileDiv.innerHTML = `
            <h3>Tribut ${tribute.id}</h3>
            <div class="tribute-info">
                <label>Name: <input type="text" value="${tribute.name}" ${profilesLocked ? 'disabled' : ''}></label>
                <label>Alter: <input type="number" value="${tribute.age}" min="12" max="18" ${profilesLocked ? 'disabled' : ''}></label>
                <label>Geschlecht: 
                    <select ${profilesLocked ? 'disabled' : ''}>
                        <option value="männlich" ${tribute.gender === 'männlich' ? 'selected' : ''}>Männlich</option>
                        <option value="weiblich" ${tribute.gender === 'weiblich' ? 'selected' : ''}>Weiblich</option>
                    </select>
                </label>
                <label>Attribute: 
                    <input type="checkbox" ${tribute.attributes.stark ? 'checked' : ''} ${profilesLocked ? 'disabled' : ''}> Stark
                    <input type="checkbox" ${tribute.attributes.schlau ? 'checked' : ''} ${profilesLocked ? 'disabled' : ''}> Schlau
                    <input type="checkbox" ${tribute.attributes.beliebt ? 'checked' : ''} ${profilesLocked ? 'disabled' : ''}> Beliebt
                </label>
                <label>Verhalten: 
                    <select ${profilesLocked ? 'disabled' : ''}>
                        <option value="aggressiv" ${tribute.behavior === 'aggressiv' ? 'selected' : ''}>Aggressiv</option>
                        <option value="defensiv" ${tribute.behavior === 'defensiv' ? 'selected' : ''}>Defensiv</option>
                        <option value="ängstlich" ${tribute.behavior === 'ängstlich' ? 'selected' : ''}>Ängstlich</option>
                    </select>
                </label>
                <label>Farbe: <input type="color" value="${tribute.color}" ${profilesLocked ? 'disabled' : ''}></label>
                <div><b>Freunde:</b>${friendsHtml}</div>
            </div>
        `;

        profilesContainer.appendChild(profileDiv);

        if (!profilesLocked) {
            profileDiv.querySelector('input[type="text"]').addEventListener('input', e => {
                tribute.name = e.target.value;
            });
            profileDiv.querySelector('input[type="number"]').addEventListener('input', e => {
                tribute.age = parseInt(e.target.value);
            });
            const selects = profileDiv.querySelectorAll('select');
            selects[0].addEventListener('change', e => {
                tribute.gender = e.target.value;
            });
            selects[1].addEventListener('change', e => {
                tribute.behavior = e.target.value;
            });
            profileDiv.querySelectorAll('input[type="checkbox"]').forEach((checkbox, index) => {
                checkbox.addEventListener('change', () => {
                    tribute.attributes = {
                        stark: profileDiv.querySelectorAll('input[type="checkbox"]')[0].checked,
                        schlau: profileDiv.querySelectorAll('input[type="checkbox"]')[1].checked,
                        beliebt: profileDiv.querySelectorAll('input[type="checkbox"]')[2].checked,
                    };
                });
            });
            profileDiv.querySelector('select').addEventListener('change', e => {
                tribute.behavior = e.target.value;
            });
            profileDiv.querySelector('input[type="color"]').addEventListener('input', e => {
                tribute.color = e.target.value;
                drawGrid();
            });
            // Freunde-Checkboxes
            profileDiv.querySelectorAll('input[type="checkbox"][data-friend-id]').forEach(cb => {
                cb.addEventListener('change', e => {
                    const friendId = parseInt(cb.getAttribute('data-friend-id'));
                    const other = tributes.find(t => t.id === friendId);
                    if (cb.checked) {
                        // Freundschaft gegenseitig hinzufügen
                        if (!tribute.friends.includes(friendId)) tribute.friends.push(friendId);
                        if (!other.friends.includes(tribute.id)) other.friends.push(tribute.id);
                    } else {
                        // Freundschaft gegenseitig entfernen
                        tribute.friends = tribute.friends.filter(id => id !== friendId);
                        other.friends = other.friends.filter(id => id !== tribute.id);
                    }
                    updateProfiles(); // UI sofort aktualisieren
                });
            });
        }
    });
    updateStatsTable();
    // KEIN updateHealMenu() mehr hier!
}

//anzahl anpassen
function adjustTributeCount() {
    console.log("adjustTributeCount aufgerufen");
    const desiredCount = parseInt(document.getElementById("tribute-count").value);

    // Anzahl im tributes-Array anpassen
    while (tributes.length < desiredCount) {
        tributes.push({
            id: tributes.length + 1,
            name: `Tribut ${tributes.length + 1}`,
            age: 14 + Math.floor(Math.random() * 5),
            gender: 'männlich',
            attributes: { stark: false, schlau: false, beliebt: false },
            behavior: 'defensiv',
            color: '#' + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, '0'),
            alive: true
        });
    }

    while (tributes.length > desiredCount) {
        tributes.pop();
    }

    // IDs neu vergeben
    tributes.forEach((t, i) => t.id = i + 1);

    updateProfiles(); // aktualisiert Anzeige
}

// Speichern und Aktualisieren der Tribute-Profile
function saveAndUpdateProfiles() {
    console.log("saveAndUpdateProfiles aufgerufen");
    saveProfiles();
    adjustTributeCount();
}



// Logging mit Typen
function logEvent(message, type = "info") {
    const log = document.getElementById('log');
    const div = document.createElement('div');
    div.className = `log-${type}`;
    div.dataset.type = type;
    div.innerHTML = message;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    updateLogFilterVisibility();
}

// Neue Hilfsfunktion: aktualisiert die Anzeige der lebenden Tribute
function updateLiveCount() {
    const el = document.getElementById('live-count-number');
    if (!el) return;
    const alive = tributes.filter(t => t.alive).length;
    el.textContent = alive;
}

// Hilfsfunktionen für Log-Typen
function logAttack(msg) {
    logEvent(msg, "attack");
    updatelstmsg(msg)
}
function logDeath(msg) {
    logEvent(msg, "death");
    updatelstmsg(msg)
    //Zusätzlich todescounter aktualisieren
    updateLiveCount();

}
function logInfo(msg) {

    // 1er Muster
    if (lastmsg === msg) return;

    // 2er Muster
    if (secondlastmsg === msg && thirtlastmsg === lastmsg) return;

    // 3er Muster
    if (thirtlastmsg === msg && fourthlastmsg === lastmsg && secondlastmsg === thirtlastmsg) return;

    // 4er Muster
    if (fourthlastmsg === msg
        && fifthlastmsg === lastmsg
        && thirtlastmsg === fourthlastmsg
        && secondlastmsg === thirtlastmsg) return;

    // 5er Muster
    if (fifthlastmsg === msg
        && sixtlastmsg === lastmsg
        && fourthlastmsg === fifthlastmsg
        && thirtlastmsg === fourthlastmsg
        && secondlastmsg === thirtlastmsg) return;

    // 6er Muster
    if (sixtlastmsg === msg
        && fifthlastmsg === sixtlastmsg
        && fourthlastmsg === fifthlastmsg
        && thirtlastmsg === fourthlastmsg
        && secondlastmsg === thirtlastmsg
        && lastmsg === secondlastmsg) return;

    logEvent(msg, "info");
    updatelstmsg(msg);
}

function logWin(msg) {
    logEvent(msg, "win");
    updatelstmsg(msg)
}
function updatelstmsg(msg) {
    sixtlastmsg = fifthlastmsg;
    fifthlastmsg = fourthlastmsg;
    fourthlastmsg = thirtlastmsg;
    thirtlastmsg = secondlastmsg;
    secondlastmsg = lastmsg;
    lastmsg = msg;
}


// --- NEU: Wiesen verbinden und abrunden ---
function connectMeadowAreas() {
    // Finde alle Wiesenblöcke
    let grassPoints = [];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x] === 'grass') grassPoints.push({ x, y });
        }
    }
    // Für jeden Wiesenblock: suche andere Wiesenblöcke im 3er-Radius
    for (let i = 0; i < grassPoints.length; i++) {
        let a = grassPoints[i];
        for (let j = i + 1; j < grassPoints.length; j++) {
            let b = grassPoints[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0 && dist <= 3.5) {
                // Verbinde a und b mit abgerundeter Fläche (Ellipse)
                fillEllipseBetween(a.x, a.y, b.x, b.y, Math.max(1.2, 2.2 - dist * 0.4), 'grass');
            }
        }
    }
}

// --- NEU: Wforest verbinden und abrunden ---
function connectforestAreas() {
    // Finde alle Wiesenblöcke
    let forestPoints = [];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x] === 'forest') forestPoints.push({ x, y });
        }
    }
    // Für jeden Wiesenblock: suche andere Wiesenblöcke im 3er-Radius
    for (let i = 0; i < forestPoints.length; i++) {
        let a = forestPoints[i];
        for (let j = i + 1; j < forestPoints.length; j++) {
            let b = forestPoints[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0 && dist <= 3.5) {
                // Verbinde a und b mit abgerundeter Fläche (Ellipse)
                fillEllipseBetween(a.x, a.y, b.x, b.y, Math.max(1.2, 2.2 - dist * 0.4), 'forest');
            }
        }
    }
}

// Hilfsfunktion: Füllt eine Ellipse zwischen zwei Punkten
function fillEllipseBetween(x1, y1, x2, y2, r, material) {
    let cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    let dx = x2 - x1, dy = y2 - y1;
    let len = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);
    let a = len / 2 + r; // Hauptachse
    let b = r;           // Nebenachse
    let cosA = Math.cos(-angle), sinA = Math.sin(-angle);
    for (let y = Math.floor(cy - b - 1); y <= Math.ceil(cy + b + 1); y++) {
        for (let x = Math.floor(cx - a - 1); x <= Math.ceil(cx + a + 1); x++) {
            if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
            // Transformiere Punkt ins Ellipsen-Koordinatensystem
            let tx = (x - cx) * cosA - (y - cy) * sinA;
            let ty = (x - cx) * sinA + (y - cy) * cosA;
            if ((tx * tx) / (a * a) + (ty * ty) / (b * b) <= 1.0) {
                grid[y][x] = material || 'grass'; // Standardmaterial ist Gras
            }
        }
    }
}

// --- Verbesserter Flussgenerator: Wasser macht Bogen um Zentrum ---
function generateRiverNaturalAvoidCenter(seed) {
    // Zentrum bestimmen (Spawnzone)
    const centerX = Math.floor(WIDTH / 2);
    const centerY = Math.floor(HEIGHT / 2);
    const safeZone = 25; // Radius um das Zentrum, den der Fluss meiden soll

    let startEdge = arenaRandInt(0, 3);
    let start, end;
    if (startEdge === 0) start = { x: arenaRandInt(WIDTH * 0.2, WIDTH * 0.8), y: 0 };
    if (startEdge === 1) start = { x: WIDTH - 1, y: arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8) };
    if (startEdge === 2) start = { x: arenaRandInt(WIDTH * 0.2, WIDTH * 0.8), y: HEIGHT - 1 };
    if (startEdge === 3) start = { x: 0, y: arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8) };
    end = { x: Math.floor(WIDTH / 2) + arenaRandInt(-8, 8), y: Math.floor(HEIGHT / 2) + arenaRandInt(-8, 8) };

    // Kontrollpunkte für Catmull-Rom Spline, mit Bogen um das Zentrum
    let controlPoints = [start];
    let nMid = 2 + arenaRandInt(0, 2);
    for (let i = 1; i <= nMid; i++) {
        let t = i / (nMid + 1);
        // Standardpunkt auf der Linie
        let px = start.x + (end.x - start.x) * t;
        let py = start.y + (end.y - start.y) * t;

        // Abstand zum Zentrum
        let dx = px - centerX, dy = py - centerY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        // Wenn zu nah am Zentrum, verschiebe orthogonal zur Linie
        if (dist < safeZone + 2) {
            // Orthogonale Richtung bestimmen
            let orthoAngle = Math.atan2(end.y - start.y, end.x - start.x) + Math.PI / 2;
            let sign = (arenaRand() < 0.5) ? 1 : -1;
            let push = (safeZone + 2 - dist) + arenaRandInt(2, 5);
            px += Math.cos(orthoAngle) * push * sign;
            py += Math.sin(orthoAngle) * push * sign;
            // Clamp ins Spielfeld
            px = Math.max(0, Math.min(WIDTH - 1, px));
            py = Math.max(0, Math.min(HEIGHT - 1, py));
        }
        controlPoints.push({ x: Math.round(px), y: Math.round(py) });
    }
    controlPoints.push(end);

    let riverPoints = catmullRomSpline(controlPoints, 16);
    carveRiverPointsAvoidCenter(riverPoints, 2 + arenaRandInt(0, 2), centerX, centerY, safeZone);

    // 1-2 Verzweigungen
    let branches = 1 + (arenaRand() < 0.5 ? 1 : 0);
    for (let b = 0; b < branches; b++) {
        let bx = end.x + arenaRandInt(-10, 10), by = end.y + arenaRandInt(-10, 10);
        let branchEnd;
        let edge = arenaRandInt(0, 3);
        if (edge === 0) branchEnd = { x: arenaRandInt(WIDTH * 0.1, WIDTH * 0.9), y: 0 };
        if (edge === 1) branchEnd = { x: WIDTH - 1, y: arenaRandInt(HEIGHT * 0.1, HEIGHT * 0.9) };
        if (edge === 2) branchEnd = { x: arenaRandInt(WIDTH * 0.1, WIDTH * 0.9), y: HEIGHT - 1 };
        if (edge === 3) branchEnd = { x: 0, y: arenaRandInt(HEIGHT * 0.1, HEIGHT * 0.9) };
        let branchPoints = [end];
        let nMidB = 1 + arenaRandInt(0, 1);
        for (let i = 1; i <= nMidB; i++) {
            let t = i / (nMidB + 1);
            let px = end.x + (branchEnd.x - end.x) * t;
            let py = end.y + (branchEnd.y - end.y) * t;
            // Auch Verzweigungen um das Zentrum biegen
            let dx = px - centerX, dy = py - centerY;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < safeZone + 2) {
                let orthoAngle = Math.atan2(branchEnd.y - end.y, branchEnd.x - end.x) + Math.PI / 2;
                let sign = (arenaRand() < 0.5) ? 1 : -1;
                let push = (safeZone + 2 - dist) + arenaRandInt(2, 5);
                px += Math.cos(orthoAngle) * push * sign;
                py += Math.sin(orthoAngle) * push * sign;
                px = Math.max(0, Math.min(WIDTH - 1, px));
                py = Math.max(0, Math.min(HEIGHT - 1, py));
            }
            branchPoints.push({ x: Math.round(px), y: Math.round(py) });
        }
        branchPoints.push(branchEnd);
        let branchSpline = catmullRomSpline(branchPoints, 12);
        carveRiverPointsAvoidCenter(branchSpline, 1 + arenaRandInt(0, 1), centerX, centerY, safeZone);
    }
}

// Flusslauf "carven" mit Spline-Punkten, aber nicht durch das Zentrum
function carveRiverPointsAvoidCenter(points, width, centerX, centerY, safeZone) {
    for (const p of points) {
        let dist = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2);
        if (dist < safeZone) continue; // Fluss nicht durch das Zentrum
        for (let dx = -width; dx <= width; dx++) for (let dy = -width; dy <= width; dy++) {
            let xx = p.x + dx, yy = p.y + dy;
            if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT) {
                // Kein Wasser auf bereits existierender Wiese überschreiben, wenn dort schon Wasser ist
                if (grid[yy][xx] !== 'water') {
                    grid[yy][xx] = 'water';
                }
            }
        }
    }
}

// Biome-Kanten verwischen (optional, für weichere Übergänge)
function smoothBiomeEdges() {
    let newGrid = grid.map(row => row.slice());
    for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = 1; x < WIDTH - 1; x++) {
            let here = grid[y][x];
            let counts = { grass: 0, forest: 0, rock: 0, water: 0 };
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                let t = grid[y + dy][x + dx];
                if (counts[t] !== undefined) counts[t]++;
            }
            // Wald zu Wiese Übergang
            if (here === 'forest' && counts.grass >= 5 && arenaRand() < 0.25) newGrid[y][x] = 'grass';
            // Wiese zu Wald Übergang
            if (here === 'grass' && counts.forest >= 5 && arenaRand() < 0.22) newGrid[y][x] = 'forest';
            // Felsen zu Wiese Übergang
            if (here === 'rock' && counts.grass >= 6 && arenaRand() < 0.18) newGrid[y][x] = 'grass';
        }
    }
    grid = newGrid;
}

// Funktion zum Aktualisieren der Log-Filter-Anzeige
function updateLogFilterVisibility() {
    // Fallback: Wenn keine Filterbar existiert, alles anzeigen
    const filterBar = document.getElementById('log-filter-bar');
    if (!filterBar) {
        document.querySelectorAll('#log > div').forEach(div => div.style.display = '');
        return;
    }
    // Hole den aktiven Button aus der Filterbar
    const activeBtn = filterBar.querySelector('.log-filter-btn.active');
    const activeType = activeBtn ? activeBtn.dataset.type : 'all';
    document.querySelectorAll('#log > div').forEach(div => {
        if (activeType === 'all') {
            div.style.display = '';
        } else if (activeType === 'win') {
            if (div.classList.contains('log-win')) div.style.display = '';
            else div.style.display = 'none';
        } else {
            if (div.classList.contains('log-win')) {
                div.style.display = '';
            } else if (div.classList.contains(`log-${activeType}`)) {
                div.style.display = '';
            } else {
                div.style.display = 'none';
            }
        }
    });
}

// Funktion zum Aktualisieren des Tribute-Profils im UI (z.B. für "dead"-Status)
function updateTributeProfile(tribute) {
    const profileDiv = document.querySelector(`.tribute-profile[data-id="${tribute.id}"]`);
    if (!profileDiv) return;
    if (tribute.alive) {
        profileDiv.classList.remove('dead');
    } else {
        profileDiv.classList.add('dead');
    }
}

// === Vorlagen-Loader ===
function loadVorlagenList() {
    const container = document.getElementById('code-input');
    if (document.getElementById('vorlagen-select') || container.querySelector('button[vorlagen-btn]')) return; // Schon vorhanden

    const vorlagen = [
        { name: "Arena1.txt", type: "arena" },
        { name: "Arena2.txt", type: "arena" },
        { name: "Arena3.txt", type: "arena" },
    ];
    const select = document.createElement('select');
    select.id = 'vorlagen-select';
    select.style.marginRight = '8px';
    select.innerHTML = `<option value="">Vorlage wählen</option>` +
        vorlagen.map(v => `<option value="${v.name}" data-type="${v.type}">${v.name}</option>`).join('');
    const btn = document.createElement('button');
    btn.textContent = 'Vorlage laden';
    btn.setAttribute('vorlagen-btn', '1');
    btn.onclick = function () {
        const file = select.value;
        if (!file) return;
        loadVorlageFile(file, select.options[select.selectedIndex].dataset.type);
    };
    container.insertBefore(btn, container.firstChild);
    container.insertBefore(select, btn);
}

function loadVorlageFile(filename, type) {
    fetch('vorlagen/' + filename)
        .then(res => res.text())
        .then(text => {
            // Dateiinhalt ist ein normaler Code (Base64)
            document.getElementById('load-code').value = text.trim();
            loadFromCode();
        })
        .catch(() => alert('Vorlage konnte nicht geladen werden.'));
}

document.addEventListener('DOMContentLoaded', () => {
    createStatsTable();
    updateStatsTable();
    // Log-Filter Buttons
    const filterBar = document.getElementById('log-filter-bar');
    if (filterBar) {
        filterBar.querySelectorAll('.log-filter-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                filterBar.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                updateLogFilterVisibility();
            });
        });
    }
    // Initialisiere Tribute und Tiere und zeichne alles
    createTributes(parseInt(document.getElementById('tribute-count').value));
    animals = []; // Keine Tiere zu Beginn
    drawGrid();
    updateProfiles();
    // // Vorlagen-Auswahl einfügen
    loadVorlagenList();
});

document.getElementById('tribute-count').addEventListener('change', function () {
    createTributes(parseInt(this.value));
});

function showHealMenu() {
    const menu = document.getElementById('heal-menu');
    menu.style.display = 'flex';
    updateHealMenu();
}

function hideHealMenu() {
    document.getElementById('heal-menu').style.display = 'none';
}

function updateHealMenu() {
    const menu = document.getElementById('heal-menu');
    if (!menu || menu.style.display === 'none') return;
    let html = `<h3>Tribut Heilung senden</h3>`;
    tributes.forEach(t => {
        let btnText = t.alive
            ? `${t.name} (Leben: ${t.health})`
            : `${t.name} (verstorben)`;
        html += `<button class="heal-tribute-btn"
            ${t.alive ? '' : 'disabled'}
            onclick="healTribute(${t.id})">${btnText}</button>`;
    });
    html += `<button class="heal-close-btn" onclick="hideHealMenu()">Schließen</button>`;
    menu.innerHTML = html;
}

// Heilungsfunktion
function healTribute(id) {
    const t = tributes.find(t => t.id === id && t.alive);
    if (!t) return;
    const heal = randomInt(15, 50);
    t.health = Math.min(100, t.health + heal);
    logInfo(`${t.name} wurde geheilt (+${heal} Leben)!`);
    updateProfiles();
    updateStatsTable();
    updateHealMenu();
}

// Heilungsmenü live aktualisieren bei Änderungen
function observeHealMenu() {
    // Profile-Änderungen
    const observer = new MutationObserver(() => updateHealMenu());
    const profiles = document.getElementById('profiles-container');
    if (profiles) observer.observe(profiles, { childList: true, subtree: true });

    // Auch nach jedem Zug/Update, aber nur alle 5 Simulationsschritte
    let healMenuStep = 0;
    const origUpdateProfiles = updateProfiles;
    window.updateProfiles = function () {
        origUpdateProfiles.apply(this, arguments);
        // updateHealMenu(); // entfernt!
    };
    const origUpdateStatsTable = updateStatsTable;
    window.updateStatsTable = function () {
        origUpdateStatsTable.apply(this, arguments);
        // updateHealMenu(); // entfernt!
    };

    // Hook in runSimulation für 5er-Takt
    const origRunSimulation = runSimulation;
    window.runSimulation = function () {
        healMenuStep = (healMenuStep || 0) + 1;
        origRunSimulation.apply(this, arguments);
        if (healMenuStep % 5 === 0) {
            updateHealMenu();
        }
    };
}

// Funktion: Endspiel sofort starten (Lava, Tiere entfernen, Buttons sperren)
function stopSimulation() {
    if (!lavaStart) {
        lavashouldstart = true;
        animals = [];
        const spawnBtn = document.querySelector('button[onclick="spawnAnimal()"]');
        if (spawnBtn) spawnBtn.disabled = true;
        logInfo("Das Endspiel wurde manuell gestartet! Alle Wildtiere verschwinden.");
        drawGrid();
    }
}

// Füge die Funktion zum Spawnen der Waffen im Zentrum hinzu
function spawnWeaponsInCenter() {
    weapons = [];
    const centerX = Math.floor(WIDTH / 2);
    const centerY = Math.floor(HEIGHT / 2);
    const safeZone = 5;
    const weaponCount = randomInt(5, 15);
    let placed = 0;
    let tries = 0;
    while (placed < weaponCount && tries < 500) {
        const x = randomInt(centerX - safeZone, centerX + safeZone);
        const y = randomInt(centerY - safeZone, centerY + safeZone);
        // Keine doppelte Waffe auf einem Feld und kein Tribut auf dem Feld
        if (
            !weapons.some(w => w.x === x && w.y === y) &&
            !tributes.some(t => t.x === x && t.y === y)
        ) {
            weapons.push({ x, y, power: randomInt(5, 20) });
            placed++;
        }
        tries++;
    }
    drawGrid();
}

// Neue Funktion: Überprüfe, ob alle lebenden Tribute sichtbar sind
function checkTributesOnCanvas() {
    // Prüfe, ob alle lebenden Tribute auf dem Canvas sind
    const outOfBounds = [];
    for (const t of tributes) {
        if (
            t.alive &&
            (typeof t.x !== 'number' || typeof t.y !== 'number' ||
                t.x < 0 || t.x >= WIDTH || t.y < 0 || t.y >= HEIGHT)
        ) {
            outOfBounds.push(t);
        }
    }
    if (outOfBounds.length === 0) return;

    // Prüfe, ob das die letzten Tribute sind
    const living = tributes.filter(t => t.alive);
    if (outOfBounds.length === living.length) {
        // Alle sterben durch "verunglückt"
        outOfBounds.forEach(t => {
            t.die('verunglückt');
        });
        return;
    }

    // Sonst: alle betroffenen Tribute sterben
    outOfBounds.forEach(t => {
        t.die('verunglückt');
    });
    updateProfiles();
    updateStatsTable();
}


// --- Seedable Random & Perlin Noise ---
let arenaSeed = null;
function setArenaSeed(seed) {
    if (!seed) {
        arenaSeed = Math.floor(Math.random() * 1e9);
    } else if (!isNaN(seed)) {
        arenaSeed = Number(seed);
    } else {
        // Hash string to int
        arenaSeed = Array.from(seed).reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 5381) >>> 0;
    }
    _arenaRandState = arenaSeed;
}
let _arenaRandState = 1;
function arenaRand() {
    // Mulberry32
    _arenaRandState |= 0;
    let t = _arenaRandState += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function arenaRandInt(a, b) {
    return Math.floor(arenaRand() * (b - a + 1)) + a;
}

// --- Simple Perlin Noise (2D) ---
function perlin2(x, y, seed = 0) {
    // Simple value noise for terrain (not true Perlin, but good enough for this use)
    function hash(n) {
        n = Math.sin(n + seed) * 43758.5453;
        return n - Math.floor(n);
    }
    let xf = Math.floor(x), yf = Math.floor(y);
    let tl = hash(xf * 49632 + yf * 325176);
    let tr = hash((xf + 1) * 49632 + yf * 325176);
    let bl = hash(xf * 49632 + (yf + 1) * 325176);
    let br = hash((xf + 1) * 49632 + (yf + 1) * 325176);
    let u = x - xf, v = y - yf;
    function lerp(a, b, t) { return a + (b - a) * t; }
    let top = lerp(tl, tr, u);
    let bot = lerp(bl, br, u);
    return lerp(top, bot, v);
}

// --- Verbesserte Perlin Noise (mit Oktaven) ---
function perlin2_oct(x, y, seed = 0, oct = 4, persistence = 0.5) {
    let total = 0, freq = 1, amp = 1, max = 0;
    for (let i = 0; i < oct; i++) {
        total += perlin2(x * freq, y * freq, seed + i * 10000) * amp;
        max += amp;
        amp *= persistence;
        freq *= 2;
    }
    return total / max;
}

// --- Catmull-Rom Spline für Flusspunkte ---
function catmullRomSpline(points, numPoints) {
    let result = [];
    for (let i = 0; i < points.length - 1; i++) {
        let p0 = points[Math.max(0, i - 1)];
        let p1 = points[i];
        let p2 = points[i + 1];
        let p3 = points[Math.min(points.length - 1, i + 2)];
        for (let t = 0; t < numPoints; t++) {
            let tt = t / numPoints;
            let tt2 = tt * tt, tt3 = tt2 * tt;
            let x = 0.5 * (
                (2 * p1.x) +
                (-p0.x + p2.x) * tt +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3
            );
            let y = 0.5 * (
                (2 * p1.y) +
                (-p0.y + p2.y) * tt +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3
            );
            result.push({ x: Math.round(x), y: Math.round(y) });
        }
    }
    return result;
}

for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
        grid[y][x] = 'grass';
    }
}

// 2. Felsen/Berge (am Rand, aber weniger extrem)
// Randberge: weniger dicht, sanfter Übergang
for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    let edgeDist = Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y);
    if (edgeDist < 5) {
        let n = perlin2_oct(x / 10, y / 10, arenaSeed + 999, 2, 0.5);
        if (n > 0.22 + edgeDist * 0.06 && arenaRand() < 0.7 - edgeDist * 0.1) grid[y][x] = 'rock';
    }
}
// Innenberge (Blobs)
for (let i = 0; i < 2 + arenaRandInt(0, 2); i++) {
    let cx = arenaRandInt(WIDTH * 0.2, WIDTH * 0.8);
    let cy = arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8);
    let r = arenaRandInt(5, 10);
    let localSeed = arenaSeed + 2000 + i * 333;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        let xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT) {
            let dist = Math.sqrt(dx * dx + dy * dy) / r;
            let n = perlin2_oct(dx / r + 0.5, dy / r + 0.5, localSeed, 3, 0.6);
            if (dist < 1 && n > 0.05 - dist * 0.3) grid[yy][xx] = 'rock';
        }
    }
}
// Seltene Findlinge/Bergpässe (kleine Felsen)
for (let i = 0; i < 2 + arenaRandInt(0, 2); i++) {
    let cx = arenaRandInt(WIDTH * 0.1, WIDTH * 0.9);
    let cy = arenaRandInt(HEIGHT * 0.1, HEIGHT * 0.9);
    grid[cy][cx] = 'rock';
    if (arenaRand() < 0.5) {
        let dir = arenaRand() < 0.5 ? 0 : 1;
        for (let j = -arenaRandInt(2, 6); j <= arenaRandInt(2, 6); j++) {
            let xx = cx + (dir ? j : 0), yy = cy + (dir ? 0 : j);
            if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT)
                grid[yy][xx] = 'rock';
        }
    }
}

// 3. Wald (Noise und Gruppen)
// Grundrauschen für Wald
for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
        if (grid[y][x] === 'grass') {
            let nx = x / WIDTH - 0.5, ny = y / HEIGHT - 0.5;
            let v = perlin2_oct(nx * 1.5, ny * 1.5, arenaSeed, 5, 0.55);
            if (v > 0.18 && arenaRand() < 0.85) grid[y][x] = 'forest';
        }
    }
}
// Baumgruppen als "Wolken" mit Noise
for (let i = 0; i < 7 + arenaRandInt(0, 4); i++) {
    let cx = arenaRandInt(WIDTH * 0.15, WIDTH * 0.85);
    let cy = arenaRandInt(HEIGHT * 0.15, HEIGHT * 0.85);
    let r = arenaRandInt(6, 14);
    let localSeed = arenaSeed + i * 1234;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        let xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT && grid[yy][xx] === 'grass') {
            let dist = Math.sqrt(dx * dx + dy * dy) / r;
            let n = perlin2_oct(dx / r + 0.5, dy / r + 0.5, localSeed, 3, 0.6);
            if (dist < 1 && n > 0.05 - dist * 0.3) grid[yy][xx] = 'forest';
        }
    }
}

// --- NEU: Wiesen doppelt verbinden und fluss und abrunden, bevor Fluss kommt ---
connectMeadowAreas();
connectMeadowAreas();
connectforestAreas();

// 4. Fluss (nach Wald, überschreibt Wald/Wiese)
generateRiverNaturalAvoidCenter(arenaSeed);

// 5. Kleine Lichtungen (Wiese in Wald, weichere Ränder)
for (let i = 0; i < 3 + arenaRandInt(0, 3); i++) {
    let cx = arenaRandInt(WIDTH * 0.2, WIDTH * 0.8);
    let cy = arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8);
    let r = arenaRandInt(2, 5);
    let localSeed = arenaSeed + 4000 + i * 111;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        let xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT) {
            let dist = Math.sqrt(dx * dx + dy * dy) / r;
            let n = perlin2_oct(dx / r + 0.5, dy / r + 0.5, localSeed, 2, 0.7);
            if (dist < 1 && n > -0.2 - dist * 0.3) grid[yy][xx] = 'grass';
        }
    }
}

// 6. Optional: Kanten verwischen (Biome-Übergänge)
smoothBiomeEdges();

drawGrid();

// --- Verbesserter Arena Generator ---
function generateArena() {
    const seedInput = document.getElementById('arena-seed');
    setArenaSeed(seedInput ? seedInput.value.trim() : '');
    if (seedInput) seedInput.value = arenaSeed;

    // 1. Grundlage: alles Wiese
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            grid[y][x] = 'grass';
        }
    }

    // 2. Felsen/Berge (am Rand, aber weniger extrem)
    // Randberge: weniger dicht, sanfter Übergang
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        let edgeDist = Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y);
        if (edgeDist < 5) {
            let n = perlin2_oct(x / 10, y / 10, arenaSeed + 999, 2, 0.5);
            if (n > 0.22 + edgeDist * 0.06 && arenaRand() < 0.7 - edgeDist * 0.1) grid[y][x] = 'rock';
        }
    }
    // Innenberge (Blobs)
    for (let i = 0; i < 2 + arenaRandInt(0, 2); i++) {
        let cx = arenaRandInt(WIDTH * 0.2, WIDTH * 0.8);
        let cy = arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8);
        let r = arenaRandInt(5, 10);
        let localSeed = arenaSeed + 2000 + i * 333;
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
            let xx = cx + dx, yy = cy + dy;
            if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT) {
                let dist = Math.sqrt(dx * dx + dy * dy) / r;
                let n = perlin2_oct(dx / r + 0.5, dy / r + 0.5, localSeed, 3, 0.6);
                if (dist < 1 && n > 0.05 - dist * 0.3) grid[yy][xx] = 'rock';
            }
        }
    }
    // Seltene Findlinge/Bergpässe (kleine Felsen)
    for (let i = 0; i < 2 + arenaRandInt(0, 2); i++) {
        let cx = arenaRandInt(WIDTH * 0.1, WIDTH * 0.9);
        let cy = arenaRandInt(HEIGHT * 0.1, HEIGHT * 0.9);
        grid[cy][cx] = 'rock';
        if (arenaRand() < 0.5) {
            let dir = arenaRand() < 0.5 ? 0 : 1;
            for (let j = -arenaRandInt(2, 6); j <= arenaRandInt(2, 6); j++) {
                let xx = cx + (dir ? j : 0), yy = cy + (dir ? 0 : j);
                if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT)
                    grid[yy][xx] = 'rock';
            }
        }
    }

    // 3. Wald (Noise und Gruppen)
    // Grundrauschen für Wald
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x] === 'grass') {
                let nx = x / WIDTH - 0.5, ny = y / HEIGHT - 0.5;
                let v = perlin2_oct(nx * 1.5, ny * 1.5, arenaSeed, 5, 0.55);
                if (v > 0.18 && arenaRand() < 0.85) grid[y][x] = 'forest';
            }
        }
    }
    // Baumgruppen als "Wolken" mit Noise
    for (let i = 0; i < 7 + arenaRandInt(0, 4); i++) {
        let cx = arenaRandInt(WIDTH * 0.15, WIDTH * 0.85);
        let cy = arenaRandInt(HEIGHT * 0.15, HEIGHT * 0.85);
        let r = arenaRandInt(6, 14);
        let localSeed = arenaSeed + i * 1234;
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
            let xx = cx + dx, yy = cy + dy;
            if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT && grid[yy][xx] === 'grass') {
                let dist = Math.sqrt(dx * dx + dy * dy) / r;
                let n = perlin2_oct(dx / r + 0.5, dy / r + 0.5, localSeed, 3, 0.6);
                if (dist < 1 && n > 0.05 - dist * 0.3) grid[yy][xx] = 'forest';
            }
        }
    }

    // --- NEU: Wiesen doppelt verbinden und fluss und abrunden, bevor Fluss kommt ---
    connectMeadowAreas();
    connectMeadowAreas();
    connectforestAreas();

    // 4. Fluss (nach Wald, überschreibt Wald/Wiese)
    generateRiverNaturalAvoidCenter(arenaSeed);

    // 5. Kleine Lichtungen (Wiese in Wald, weichere Ränder)
    for (let i = 0; i < 3 + arenaRandInt(0, 3); i++) {
        let cx = arenaRandInt(WIDTH * 0.2, WIDTH * 0.8);
        let cy = arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8);
        let r = arenaRandInt(2, 5);
        let localSeed = arenaSeed + 4000 + i * 111;
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
            let xx = cx + dx, yy = cy + dy;
            if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT) {
                let dist = Math.sqrt(dx * dx + dy * dy) / r;
                let n = perlin2_oct(dx / r + 0.5, dy / r + 0.5, localSeed, 2, 0.7);
                if (dist < 1 && n > -0.2 - dist * 0.3) grid[yy][xx] = 'grass';
            }
        }
    }

    // 6. Optional: Kanten verwischen (Biome-Übergänge)
    smoothBiomeEdges();

    drawGrid();
}

//farbumwandlung
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

document.addEventListener('DOMContentLoaded', () => setUIForState('ready'));
generateArena()
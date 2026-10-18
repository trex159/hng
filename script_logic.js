const MAX_HEALTH = 100;
// Regeneration: nach REGEN_DELAY_TICKS ohne Kampf, pro Tick REGEN_PER_TICK Leben
// (beim Ruhen mal REST_REGEN_MULT, Wetter kann das verändern)
const REGEN_DELAY_TICKS = 40;
const REGEN_PER_TICK = 0.008;
const REST_REGEN_MULT = 3;

const NAMES_MALE = [
    'Albyn', 'Blythe', 'Crispin', 'Dorian', 'Edwyn',
    'Faron', 'Galen', 'Hadley', 'Iver', 'Jory',
    'Kelwin', 'Larkin', 'Merritt', 'Nollan', 'Orlin',
    'Perrin', 'Quillan', 'Roslin', 'Sayer', 'Tavish',
    'Ulric', 'Vardon', 'Wystan', 'Yarrow', 'Zorin',
    'Aldren', 'Bramwell', 'Corven', 'Darrow', 'Elric',
    'Finlow', 'Garrick', 'Hollis', 'Isley', 'Joss',
    'Keaton', 'Lowen', 'Marlowe', 'Niven', 'Oswin',
    'Pell', 'Ronan', 'Selwyn', 'Thorne', 'Vernon',
    'Ashby', 'Brindle', 'Cinder', 'Dunley', 'Flint',
    'Goldwin', 'Morrow', 'Rook', 'Sable', 'Sterling',
    'Tawny', 'Umber', 'Wilder', 'Whitlow', 'Folay',
    'Garrety', 'Jegomir', 'Hussan', 'Ludwig', 'Wulfgang'
];

const NAMES_FEMALE = [
    'Aveline', 'Briar', 'Celandine', 'Delwyn', 'Elspeth',
    'Fenella', 'Greer', 'Hester', 'Ianthe', 'Jessamy',
    'Kerensa', 'Lavinia', 'Mabry', 'Nerissa', 'Olwen',
    'Perrine', 'Rosamund', 'Sybil', 'Tamsin', 'Una',
    'Verity', 'Willa', 'Ysolde', 'Zella', 'Amabel',
    'Bess', 'Carys', 'Dulcie', 'Eira', 'Florrie',
    'Gwyneth', 'Honor', 'Isolde', 'Jemima', 'Lettice',
    'Merryn', 'Nell', 'Orla', 'Priar', 'Romilly',
    'Sophronia', 'Theda', 'Winifred', 'Auburn', 'Blossom',
    'Coral', 'Dove', 'Fawn', 'Goldona', 'Hazel',
    'Indigo', 'Lilac', 'Mauve', 'Pearl', 'Ruby',
    'Saffron', 'Silver', 'Violet', 'Wren', 'Zinnia',
    'Walpurga', 'Ursula', 'Helga', 'Altvaa'
];

const NAMES_LAST = [
    'Ashdown', 'Blackwell', 'Blueford', 'Briarwood', 'Clayburn',
    'Cloverly', 'Copperfield', 'Crowhurst', 'Dunmore', 'Elmstead',
    'Fairbourne', 'Foxworth', 'Greenley', 'Hawthorn', 'Ironwood',
    'Kingsley', 'Larkspur', 'Meadowell', 'Mossford', 'Oakley',
    'Pinehurst', 'Ravenshaw', 'Redfern', 'Rosewell', 'Thornfield',
    'Whitaker', 'Willoughby', 'Winterton', 'Woodruff', 'Sarcoline',
    'Graycott', 'Iverson', 'Snowden', 'Silverton', 'Goldrick',
    'Blanchett', 'Scarletton', 'Amberley', 'Russet', 'Sableton',
    'Umberly', 'Corbett', 'Flintwood', 'Bramble', 'Marshwick',
    'Bellweather', 'Holling', 'Westmere', 'Eastonby', 'Ashcombe',
    'Bexley', 'Creston', 'Dallow', 'Everden', 'Fallow',
    'Glenwick', 'Harbury', 'Kestrel', 'Marlowe', 'Thistledown',
    'Minestone', 'Brokeman', 'Phlox', 'Falu', 'Watchet', 'Damask',
    'Wenge', 'Sinoper', 'Amaranth', 'Puce', 'Smalt', 'Titian', 
    'Limerick', 'Bole', 'Zomp', 'Cornsilk', 'Stizza', 'Fallow',
    'Cordovan', 'Knutto'
];

// Zufälliger "Vorname Nachname", doppelte Namen werden möglichst vermieden
function randomTributeName(gender) {
    const firstNames = gender === 'weiblich' ? NAMES_FEMALE : NAMES_MALE;
    const pick = list => list[randomInt(0, list.length - 1)];
    let name;
    for (let i = 0; i < 20; i++) {
        name = `${pick(firstNames)} ${pick(NAMES_LAST)}`;
        if (!tributes.some(t => t.name === name)) break;
    }
    return name;
}

class Tribute {
    constructor(id, spawnPos) {
        this.id = id;
        this.gender = this.id % 2 != 0 ? 'männlich' : 'weiblich';
        this.name = randomTributeName(this.gender);
        this.x = Math.floor(WIDTH / 2) + randomInt(-5, 5);
        this.y = Math.floor(HEIGHT / 2) + randomInt(-5, 5);
        this.age = randomInt(12, 18);
        this.behavior = ['aggressiv', 'defensiv', 'ängstlich'][randomInt(0, 2)];
        this.attributes = {
            stark: Math.random() < 0.33,
            schlau: Math.random() < 0.33,
            beliebt: Math.random() < 0.33
        };
        this.color = hslToHex(randomInt(0, 360), 100, 50);
        this.alive = true;
        this.health = MAX_HEALTH;
        this.healthAcc = 0; // Bruchteile von Leben (Regeneration/Kälte), die noch nicht ausgezahlt wurden
        this.lastCombatTick = 0; // Tick der letzten Kampfbeteiligung
        this.lastMove = {
            dx: 0,
            dy: 0
        };
        this.direction = randomInt(0, 3);
        this.damageDealt = 0;
        this.damageTaken = 0;
        this.distanceMoved = 0;
        this.walkDirection = null; // Persistente Richtung für randomWalk
        this.kills = 0;
        this.lastAttacker = null;
        this.weapon = null; // {power}
        this.weakWeapons = []; // Waffen mit power < 11
        this.friends = []; // Array von Tribut-IDs
        // Soziale Parameter: Vertrauen, Angst, Feindseligkeit (Rache)
        this.social = {
            trust: {}, // trust[otherId] = 0..1
            fear: {}, // fear[otherId] = 0..1
            hostility: {}, // hostility[otherId] = 0..1
            bond: {} // bond[friendId] = 0..1, wie gut die Freundschaft ist (siehe script_social.js)
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
        this.updateVision();
        // Sichtweite je nach Terrain und Wetter
        const viewDistance = this.getViewDistance();
        const tile = this.getCurrentTile();
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
            const nearbyAnimal = this.findNearbyAnimal(viewDistance);
            if (nearbyAnimal) {
                // Wildtier in Sichtweite: Flucht! (für alle Verhaltenstypen)
                this.moveAwayFrom(nearbyAnimal.x, nearbyAnimal.y);
                // Optional: Log für ängstliche Tribute
                if (this.behavior === 'ängstlich') {
                    logInfo(`${this.name} flieht vor einem Wildtier!`);
                }
                return; // Wichtig: Rückzug beendet den Move-Tick
            }
            if (this.behavior === 'aggressiv' && nearestWeapon) {
                this.moveTowards(nearestWeapon.x, nearestWeapon.y);
            } else if ((this.behavior === 'defensiv' || this.behavior === 'ängstlich') && nearestWeapon) {
                if (!enemyNearby) {
                    this.moveTowards(nearestWeapon.x, nearestWeapon.y);
                } else if (this.behavior === 'defensiv' && Math.random() < 0.2) {
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
                            this.idleStep();
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
                        if (target && this.wantsToHunt(target)) {
                            this.moveTowards(target.x, target.y);
                        } else if (target && this.getDistance(target) < 6 && ((this.health >= target.health + 5 && this.attributes.schlau) || (this.health >= target.health - 10 && !this.attributes.schlau) || (this.attributes.stark && this.health >= 15) || Math.random() >= 0.9)) {
                            this.moveTowards(target.x, target.y);
                        } else if (target) {
                            this.moveAwayFrom(target.x, target.y);
                        } else if (lavaStart) {
                            this.moveTowards(middleofarena.x, middleofarena.y)
                        } else {
                            this.idleStep();
                        }
                        break;
                    case 'defensiv':
                        target = this.findNearestEnemy();
                        if (target && this.isFriend(target)) {
                            target = null;
                        }
                        if (target && this.getDistance(target) < 5 && ((this.health >= target.health + 10 && this.attributes.schlau) || (this.health >= target.health && !this.attributes.schlau) || Math.random() >= 0.91)) {
                            this.moveTowards(target.x, target.y);
                        } else if (target) {
                            this.moveAwayFrom(target.x, target.y);
                        } else if (lavaStart) {
                            this.moveTowards(middleofarena.x, middleofarena.y)
                        } else {
                            this.idleStep();
                        }
                        break;
                    case 'ängstlich':
                        target = this.findNearestEnemy();
                        if (target && this.isFriend(target)) {
                            target = null;
                        }
                        if (lavaStart) {
                            this.moveTowards(middleofarena.x, middleofarena.y)
                        } else if (target) {
                            // Kontakt vermeiden: verstecken oder wegrennen
                            if (Math.random() >= 0.5) {
                                this.hide();
                            } else {
                                this.moveAwayFrom(target.x, target.y);
                            }
                        } else {
                            this.idleStep();
                        }
                        break;
                }
            }
        }
        // Statistiken: Distanz
        this.distanceMoved += Math.abs(this.x - oldX) + Math.abs(this.y - oldY);
        this.checkEnvironment();
        this.pickUpWeapon();
        // --- NEU: Angriff auf angrenzende Tribute ---
        if (!this.alive) return; // Falls durch Umgebung gestorben
        for (const t of tributes) {
            if (t !== this && t.alive && Math.abs(t.x - this.x) <= 1 && Math.abs(t.y - this.y) <= 1) {
                this.fight(t);
                break; // Nur einen Angriff pro Zug
            }
        }
    }
    // In der Tribute Klasse, nach der move() Methode einfügen:
    updateSocialRelations() {
        if (!this.alive) return;
        // Nur wenn keine Feinde in der Nähe sind
        const nearbyEnemies = tributes.filter(t => t !== this && t.alive && !this.isFriend(t) && Math.abs(t.x - this.x) <= MAX_VIEW_DISTANCE && Math.abs(t.y - this.y) <= MAX_VIEW_DISTANCE);
        if (nearbyEnemies.length > 0) return;
        // Finde Freunde in der Nähe
        const nearbyFriends = tributes.filter(t => t !== this && t.alive && this.isFriend(t) && Math.abs(t.x - this.x) <= 2 && // Engerer Radius für Gespräche
            Math.abs(t.y - this.y) <= 2);
        if (nearbyFriends.length === 0) return;
        // Für jeden Freund: Teile Informationen über andere
        for (const friend of nearbyFriends) {
            // Zähle gemeinsame Freunde in der Nähe
            const commonFriendsNearby = tributes.filter(t => t !== this && t !== friend && t.alive && this.isFriend(t) && friend.isFriend(t) && Math.abs(t.x - this.x) <= 2 && Math.abs(t.y - this.y) <= 2).length;
            // Gerüchte-Stärke reduziert sich mit Anzahl anwesender gemeinsamer Freunde
            const gossipStrength = Math.max(0.1, 0.3 - (commonFriendsNearby * 0.05));
            // Freundschaft wächst durch gemeinsame Zeit
            this.growBondWith(friend);
            // Teile negative Erfahrungen (niemals über den Gesprächspartner selbst)
            for (const otherId in this.social.fear) {
                if (parseInt(otherId) === friend.id) continue;
                if (this.social.fear[otherId] > 0.4) { // Nur relevante Ängste teilen
                    const fearValue = this.social.fear[otherId] * gossipStrength;
                    const knownFear = friend.social.fear[otherId] || 0;
                    friend.social.fear[otherId] = Math.max(knownFear, fearValue);
                    const warnedAbout = tributes.find(t => t.id === parseInt(otherId));
                    // nur melden, wenn der Freund dadurch wirklich etwas Neues erfährt
                    if (warnedAbout && fearValue > knownFear + 0.01) {
                        logInfo(`${this.name} warnt ${friend.name} vor ${warnedAbout.name}`);
                    }
                }
            }
            // Teile Misstrauen
            for (const otherId in this.social.trust) {
                if (parseInt(otherId) === friend.id) continue;
                if (this.social.trust[otherId] < 0.3) { // Nur relevantes Misstrauen teilen
                    const distrustValue = (1 - this.social.trust[otherId]) * gossipStrength;
                    friend.social.trust[otherId] = Math.min(friend.social.trust[otherId] || 1, 1 - distrustValue);
                }
            }
            // Teile Feindschaften
            for (const otherId in this.social.hostility) {
                if (parseInt(otherId) === friend.id) continue;
                if (this.social.hostility[otherId] > 0.5) { // Nur starke Feindschaften
                    const hostilityValue = this.social.hostility[otherId] * gossipStrength;
                    friend.social.hostility[otherId] = Math.max(friend.social.hostility[otherId] || 0, hostilityValue * 0.7 // Feindschaft überträgt sich schwächer
                    );
                }
            }
        }
    }
    // Sichtweite: abhängig vom Gelände (Wald kürzer, Fels weiter) und vom Wetter.
    // includeTracking: schlaue Tribute können zusätzlich Spuren lesen.
    getViewDistance(includeTracking = false) {
        let view = MAX_VIEW_DISTANCE;
        const tile = this.getCurrentTile();
        if (tile === 'forest') view *= 0.6;
        else if (tile === 'rock') view *= 1.4;
        if (includeTracking && this.attributes.schlau) view += 30;
        return view * getWeatherViewFactor();
    }
    markCombat() {
        this.lastCombatTick = simTick;
    }
    // Pro Tick: Regeneration (nach längerer Kampfpause) bzw. Kälteschaden bei Schnee
    updateVitals() {
        if (!this.alive) return;
        let delta = 0;
        if (getWeather().cold) {
            delta = -getColdDamage(this.health);
        } else if (simTick - this.lastCombatTick >= REGEN_DELAY_TICKS && this.health < MAX_HEALTH) {
            delta = REGEN_PER_TICK * getWeatherRegenFactor() * (this.isRestingNow() ? REST_REGEN_MULT : 1);
        }
        if (delta === 0) {
            this.healthAcc = 0;
            return;
        }
        this.healthAcc += delta;
        const whole = Math.trunc(this.healthAcc);
        if (whole === 0) return;
        this.healthAcc -= whole;
        if (whole > 0) {
            this.health = Math.min(MAX_HEALTH, this.health + whole);
        } else {
            this.health += whole;
            this.damageTaken -= whole;
            if (this.health <= 0) this.die('erfroren');
        }
    }
    getCurrentTile() {
        if (this.x < 0 || this.x >= WIDTH || this.y < 0 || this.y >= HEIGHT || isNaN(this.x) || isNaN(this.y)) return null;
        return grid[this.y][this.x];
    }
    // Sichtweite-abhängige Fallen-Suche (nur für schlaue Tribute)
    findNearbyTrap(viewDist = MAX_VIEW_DISTANCE) {
        let minDist = Infinity;
        let nearestTrap = null;
        const range = Math.floor(viewDist); // Sichtweite kann durch das Wetter gebrochen sein
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                let nx = this.x + dx;
                let ny = this.y + dy;
                if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT && grid[ny][nx] === 'trap') {
                    let dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestTrap = {
                            x: nx,
                            y: ny
                        };
                    }
                }
            }
        }
        return nearestTrap;
    }
    // In die Klasse Tribute einfügen:
    checkEnvironment() {
        // Prüfe, ob die aktuelle Position im Spielfeld liegt, bevor auf grid[y][x] zugegriffen wird
        if (this.x < 0 || this.x >= WIDTH || this.y < 0 || this.y >= HEIGHT || isNaN(this.x) || isNaN(this.y)) {
            // teleportiere Tribut zurück ins Spielfeld
            while (this.x < 0) this.x += 1;
            while (this.x >= WIDTH) this.x -= 1;
            while (this.y < 0) this.y += 1;
            while (this.y >= HEIGHT) this.y -= 1;
            // falls immer noch außerhalb (NaN), töten
            if (this.x < 0 || this.x >= WIDTH || this.y < 0 || this.y >= HEIGHT || isNaN(this.x) || isNaN(this.y)) {
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
            if (this.alive && Math.random() < 0.4) { // 40% Chance, in Falle sofort zu sterben
                this.die('in eine tödliche Falle getappt');
            } else {
                this.health -= RandomInt(15, 65); // Zufälliger Schaden zwischen 15 und 65
                if (this.health <= 0) {
                    this.die('von einer Falle getötet');
                } else {
                    logInfo(`${this.name} wurde in einer Falle verletzt (${this.health} Gesundheit verbleiben)!`);
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
                if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
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
                        this.weapon = {
                            power: w.power
                        };
                        logInfo(`${this.name} hat eine starke Waffe gefunden (+${w.power} Schaden)!`);
                        weapons.splice(i, 1);
                        drawGrid();
                    }
                } else {
                    // Schwache Waffe gefunden
                    // Nur aufheben wenn keine starke Waffe und weniger als 2 schwache
                    if (!this.weapon && this.weakWeapons.length < 2) {
                        this.weakWeapons.push({
                            power: w.power
                        });
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
                this.walkDirection = null; // Reset um neue Fluchtrichtung zu finden
                return;
            }
        }
        if (specialTarget) {
            this.moveTowards(specialTarget.x, specialTarget.y);
            this.walkDirection = null; // Zielgerichtete Bewegung, dann zurück zu randomWalk
            return;
        }
        if (lavaStart) {
            this.moveTowards(middleofarena.x, middleofarena.y);
            return;
        }
        if (Math.random() >= 8) {
            this.moveTowards(middleofarena.x, middleofarena.y)
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
        // Sichtweite je nach Terrain und Wetter (schlaue Tribute können Spuren lesen)
        const viewDistance = this.getViewDistance(true);
        let bestScore = Infinity;
        let nearestEnemy = null;
        for (const t of tributes) {
            if (!t.alive || t === this || this.isFriend(t)) continue;
            const dist = Math.abs(this.x - t.x) + Math.abs(this.y - t.y);
            // Sichtweite beachten - wenn zu weit weg, ignorieren
            if (dist > viewDistance) continue;
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
            if (friend && friend.friends.includes(other.id) && this.getDistance(friend) <= 3 && other.getDistance(friend) <= 3) {
                return true;
            }
        }
        return false;
    }
    helpFriend(opponent) {
        logInfo(`${this.name} passt und greift ${opponent.name} nicht an.`);
        // Falls der Freund (opponent) gerade angegriffen wird, greife dessen Angreifer an
        const attacker = opponent.lastAttacker;
        if (attacker && attacker !== this && attacker.alive && !this.isFriend(attacker) // Nicht auf eigene Freunde losgehen
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
        let onlyFriendsLeft = aliveTributes.every(t => t === this || this.isFriend(t) || this.isFriendOfFriend(t));
        if (this.ängstlich && Math.random() < 0.5 && opponent.health + 20 > this.health) {
            this.moveAwayFrom(opponent.x, opponent.y);
            logInfo(`${this.name} ist ängstlich und vermeidet den Kampf mit ${opponent.name}.`);
            return;
        }
        // Freunde greifen sich nicht an, solange mehr als 2 Tribute leben und nicht nur Freunde übrig
        const aliveCount = aliveTributes.length;
        if (!onlyFriendsLeft && this.isFriend(opponent) && aliveCount > 2) {
            logInfo(`${this.name} weigert sich, Freund ${opponent.name} anzugreifen.`);
            this.helpFriend(opponent);
            return;
        }
        // Freund eines Freundes: tolerieren, solange gemeinsamer Freund in der Nähe und mehr als 2 leben und nicht nur Freunde übrig
        if (!onlyFriendsLeft && this.isFriendOfFriend(opponent) && aliveCount > 2 && Math.random() >= 0.5) {
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
        this.markCombat();
        opponent.markCombat();
        opponent.health -= attackPower;
        this.damageDealt += attackPower;
        opponent.damageTaken += attackPower;
        opponent.lastAttacker = this;
        if (attackPower > 0) SimEvents.emit('damage', {
            source: this,
            target: opponent,
            amount: attackPower,
            kind: 'melee'
        });
        // Angst/Hostility Effekte bei Opfer setzen
        opponent.social.fear[this.id] = Math.min(1, (opponent.social.fear[this.id] || 0) + attackPower / 100 + (Math.random() * 0.25));
        this.social.hostility[opponent.id] = Math.min(1, (this.social.hostility[opponent.id] || 0) + 0.02 + Math.random() * 0.05);
        if (attackPower > 0) {
            logAttack(`${this.name} greift ${opponent.name} an und fügt ${Math.round(attackPower)} Schaden zu!`);
        }
        if (opponent.health <= 0) {
            this.kills += 1;
            opponent.die('Kampf', this);
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
            this.markCombat();
            attacker.markCombat();
            attacker.health -= attackPower;
            this.damageDealt += attackPower;
            attacker.damageTaken += attackPower;
            attacker.lastAttacker = this;
            if (attackPower > 0) SimEvents.emit('damage', {
                source: this,
                target: attacker,
                amount: attackPower,
                kind: 'counter'
            });
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
        if (!this.alive) return;
        this.alive = false;
        SimEvents.emit('death', {
            tribute: this,
            reason,
            killer
        });
        if (reason === 'Kampf' && (killer || this.lastAttacker)) {
            const killerName = (killer ? killer.name : (this.lastAttacker ? this.lastAttacker.name : 'Unbekannt'));
            logDeath(`${this.name} ist gestorben (${reason} durch ${killerName})`);
        } else {
            logDeath(`${this.name} ist gestorben (${reason})`);
        }
        updateTributeProfile(this);
        updateStatsTable();
        // Schlechtes Karma: Freunde des Opfers vertrauen dem Killer weniger, Freundschaften können zerbrechen
        const responsible = reason === 'Kampf' ? (killer || this.lastAttacker) : null;
        if (responsible instanceof Tribute) processKillKarma(responsible, this);
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
        // Sucht im Sichtbereich (wetterabhängig) nach Lava, gibt das nächste Lavafeld zurück (oder null)
        let minDist = Infinity;
        let nearestLava = null;
        const range = Math.floor(MAX_VIEW_DISTANCE * getWeatherViewFactor());
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                let nx = this.x + dx;
                let ny = this.y + dy;
                if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT && grid[ny][nx] === 'lava') {
                    let dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestLava = {
                            x: nx,
                            y: ny
                        };
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
    // Neue Methode: Finde nahes Wildtier
    findNearbyAnimal(viewDistance = MAX_VIEW_DISTANCE) {
        let minDist = Infinity;
        let nearestAnimal = null;
        for (const animal of animals) {
            if (!animal.alive) continue;
            const dist = Math.abs(this.x - animal.x) + Math.abs(this.y - animal.y);
            // Nur Tiere in Sichtweite
            if (dist <= viewDistance && dist < minDist) {
                minDist = dist;
                nearestAnimal = animal;
            }
        }
        return nearestAnimal;
    }
    isEnemyNearby() {
        // Ein anderer lebender Tribut im Umkreis von 3 Feldern
        return tributes.some(t => t !== this && t.alive && Math.abs(t.x - this.x) <= 3 && Math.abs(t.y - this.y) <= 3);
    }
}
class Animal {
    // opts (optional): { health, dmgMin, dmgMax }, ohne Angabe gelten die Standardwerte
    constructor(opts = {}) {
        this.x = randomInt(0, WIDTH - 1);
        this.y = randomInt(0, HEIGHT - 1);
        this.alive = true;
        this.health = opts.health ?? 60; // Weniger Leben als Tribute
        this.dmgMin = opts.dmgMin ?? 5;
        this.dmgMax = opts.dmgMax ?? 20;
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
        const goals = [{
            type: "weapon",
            weight: (!this.weapon && weapons.length > 0) ? 0.8 : 0.2
        }, {
            type: "enemy",
            weight: this.behavior === "aggressiv" ? 0.9 : (this.behavior === "defensiv" ? 0.4 : 0.1)
        }, {
            type: "safety",
            weight: (this.health < 50) ? 0.9 : 0.2
        }, {
            type: "explore",
            weight: 0.3
        }];
        // --- 2️⃣ Zufällige Auswahl eines Ziels nach Gewichtung ---
        const total = goals.reduce((a, g) => a + g.weight, 0);
        const r = Math.random() * total;
        let acc = 0;
        let chosen = goals[0];
        for (const g of goals) {
            acc += g.weight;
            if (r <= acc) {
                chosen = g;
                break;
            }
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
        const damage = randomInt(this.dmgMin, this.dmgMax);
        tribute.markCombat();
        tribute.health -= damage;
        tribute.damageTaken += damage;
        tribute.lastAttacker = null;
        if (damage > 0) SimEvents.emit('damage', {
            source: this,
            target: tribute,
            amount: damage,
            kind: 'animal'
        });
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
            SimEvents.emit('animalDeath', {
                animal: this
            });
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
                if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT && grid[ny][nx] === 'lava') {
                    let dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestLava = {
                            x: nx,
                            y: ny
                        };
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
    this.markCombat();
    SimEvents.emit('damage', {
        source: this,
        target: animal,
        amount: attackPower,
        kind: 'counter'
    });
    animal.takeDamage(attackPower, this);
    if (attackPower > 0) {
        logAttack(`${this.name} wehrt sich gegen ein Wildtier und fügt ${attackPower} Schaden zu!`);
    }
};
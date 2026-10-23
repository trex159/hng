const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 5;
const LEGACY_ARENA_SIZE = 100; // Kantenlänge (Felder) der früheren Arena, alte Arena-Codes haben diese Größe
const ARENA_SIZE = 200; // Kantenlänge (Felder) der aktuellen Arena
const CANVAS_DISPLAY_PX = 500; // Darstellungsgröße der Arena auf der Seite (Pixel), wie im bisherigen HTML/CSS
const WIDTH = ARENA_SIZE;
const HEIGHT = ARENA_SIZE;
canvas.width = WIDTH * TILE_SIZE;
canvas.height = HEIGHT * TILE_SIZE;
canvas.style.width = `${CANVAS_DISPLAY_PX}px`;
canvas.style.height = `${CANVAS_DISPLAY_PX}px`;
let grid = Array.from({
    length: HEIGHT
}, () => Array(WIDTH).fill('grass'));
let tributes = [];
let animals = [];
let weapons = []; // {x, y, power}
let simulationRunning = false;
let lavaStart = false;
let simulationSpeed = 5;
let drawing = false;
let lavaRadius = 0;
let winnerDeclared = false;
let simTick = 0; // Anzahl der bisherigen Simulationsschritte
let endgamePaused = false; // Gamemaker hat das Endspiel (Lava) angehalten
let profilesLocked = false;
let middleofarena = {
    x: Math.floor(WIDTH / 2),
    y: Math.floor(HEIGHT / 2)
};
let evilnumberoflava = 0;
let lavashouldstart = false;
let showprofilelist = true;
const MAX_VIEW_DISTANCE = 25;
const LAVA_SPEED = 0.3 * (ARENA_SIZE / LEGACY_ARENA_SIZE);

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
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

function toggleProfiles() {
    if (showprofilelist) {
        document.getElementById('profiles-container').style.display = 'none';
        showprofilelist = false;
    } else {
        document.getElementById('profiles-container').style.display = 'flex';
        showprofilelist = true;
    }
}

// Skaliert eine geladene Arena (beliebiger Größe, z. B. alte 100x100-Codes) per Nearest-Neighbour auf WIDTH x HEIGHT
function normalizeLoadedGrid(data) {
    const srcH = data.length;
    const srcW = data[0].length;
    if (srcH === HEIGHT && srcW === WIDTH) return data;
    return Array.from({
        length: HEIGHT
    }, (_, y) => {
        const srcRow = data[Math.min(srcH - 1, Math.floor(y * srcH / HEIGHT))];
        return Array.from({
            length: WIDTH
        }, (_, x) => srcRow[Math.min(srcW - 1, Math.floor(x * srcW / WIDTH))]);
    });
}
// Gezeichnet wird vom Renderer (script_render.js); drawGrid bleibt als Kurzform für alle bisherigen Aufrufe
function drawGrid() {
    Renderer.requestDraw();
}
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
// ---------------------------------------------------------------------
// Simulationsschleife
//
// Zeitgesteuert mit Akkumulator: Pro Durchlauf werden so viele Schritte
// gerechnet, wie seit dem letzten Durchlauf fällig sind. Kein Schritt wird
// je übersprungen; schafft der Browser das Tempo nicht, läuft die Zeit
// einfach langsamer. Darstellung, Uhr und Statistik werden pro Durchlauf
// nur einmal aktualisiert statt nach jedem Schritt.
//
// Ultra-Modus (Doppelklick auf den Pause-Knopf): Zielwert 150 x Standardtempo
// (5 Zeitpunkte/s = 750 Zeitpunkte/s) bzw. so schnell, wie der Browser kann.
// Partikel und der Vollbild-Ticker ruhen dabei.
// ---------------------------------------------------------------------
const ULTRA_TICKS_PER_SECOND = 750;
const SIM_SLICE_BUDGET_MS = 8; // Rechenzeit pro Durchlauf im Normalbetrieb
const ULTRA_SLICE_BUDGET_MS = 12; // im Ultra-Modus; der Rest des Frames bleibt fürs Zeichnen
let ultraMode = false;
let ultraFxBackup = null;
let simLoopActive = false;
let simLoopScheduled = false;
let simLoopLast = 0;
let simLoopAcc = 0;
const simChannel = new MessageChannel(); // ohne die 4-ms-Mindestwartezeit von setTimeout
simChannel.port1.onmessage = simLoop;

function currentTickInterval() {
    const speed = Math.max(1, Number(document.getElementById('speed').value) || 5);
    return 1000 / (ultraMode ? ULTRA_TICKS_PER_SECOND : speed);
}

function scheduleSimLoop(delayMs) {
    if (simLoopScheduled) return;
    simLoopScheduled = true;
    if (delayMs <= 0 && ultraMode) simChannel.port2.postMessage(0);
    else setTimeout(simLoop, Math.max(0, delayMs));
}

function setUltraMode(on) {
    if (on === ultraMode) return;
    ultraMode = on;
    if (on) {
        ultraFxBackup = Fx.state.enabled;
        Fx.state.enabled = false;
        Fx.clear();
    } else if (ultraFxBackup !== null) {
        Fx.state.enabled = ultraFxBackup;
        ultraFxBackup = null;
    }
    document.body.classList.toggle('ultra-mode', on);
    logEvent(I18N.t(on ? 'log.ultraOn' : 'log.ultraOff'), 'info');
    updateClockDisplay();
}
// Doppelklick auf Pause (Hauptmenü und Vollbild) schaltet den Ultra-Modus um
document.addEventListener('dblclick', e => {
    const btn = e.target.closest && e.target.closest('button');
    if (!btn || !btn.matches('[onclick="pauseSimulation()"], [data-act="pause"]')) return;
    if (simulationRunning || simulationPaused) setUltraMode(!ultraMode);
});

// Startet die Schleife (Start und Fortsetzen); läuft sie schon, passiert nichts
function runSimulation() {
    if (!simulationRunning || simulationPaused) return;
    Hazards.markDirty();
    if (simLoopActive) return;
    simLoopActive = true;
    simLoopAcc = 0;
    simLoopLast = performance.now() - currentTickInterval(); // erster Schritt sofort
    scheduleSimLoop(0);
}

function simLoop() {
    simLoopScheduled = false;
    if (!simulationRunning || simulationPaused || winnerDeclared) {
        simLoopActive = false;
        return;
    }
    const start = performance.now();
    const interval = currentTickInterval();
    simLoopAcc += Math.min(start - simLoopLast, 250);
    simLoopLast = start;
    const budget = ultraMode ? ULTRA_SLICE_BUDGET_MS : SIM_SLICE_BUDGET_MS;
    let steps = 0;
    while (simLoopAcc >= interval && simulationRunning && !winnerDeclared) {
        simLoopAcc -= interval;
        simulationStep();
        steps++;
        if (performance.now() - start > budget) break;
    }
    if (steps > 0) {
        advanceGameClock();
        drawGrid();
        updateStatsTable();
    }
    if (!simulationRunning || simulationPaused || winnerDeclared) {
        simLoopActive = false;
        if (winnerDeclared && ultraMode) setUltraMode(false);
        return;
    }
    // Rückstand nicht auflaufen lassen: die Zeit läuft dann langsamer, es fällt aber kein Schritt weg
    if (simLoopAcc > interval * 4) simLoopAcc = interval;
    scheduleSimLoop(interval - simLoopAcc);
}

// Ein einzelner Simulationsschritt (ohne Darstellung)
function simulationStep() {
    simTick++;
    if (Hazards.isDirty() || lavaStart) Hazards.refresh();
    for (let i = 0; i < tributes.length; i++) {
        const tribute = tributes[i];
        if (!tribute.alive) continue;
        const oldX = tribute.x;
        const oldY = tribute.y;
        tribute.move();
        tribute.lastMove = {
            dx: tribute.x - oldX,
            dy: tribute.y - oldY
        };
        if (tribute.alive) tribute.trackOscillation();
        SimEvents.emit('moved', {
            tribute,
            move: tribute.lastMove
        });
    }
    // Nach Bewegungen: kurzfristige soziale Anpassungen
    tributes.forEach(tribute => {
        if (tribute.alive) tribute.updateSocialRelations();
    });
    animals.forEach(animal => animal.move());
    // Regeneration bzw. Kälteschaden (Schnee)
    tributes.forEach(tribute => tribute.updateVitals());
    if (lavaStart && !endgamePaused) advanceLava();
    checkTributesOnCanvas();
    checkForWinner();
    SimEvents.emit('tick', {
        tick: simTick
    });
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
    simTick = 0;
    updateClockDisplay();
    endgamePaused = false;
    tributes.forEach(t => {
        t.lastCombatTick = 0;
        t.healthAcc = 0;
    });
    // Waffen im Zentrum spawnen
    spawnWeaponsInCenter();
    SimEvents.emit('simStart');
    saveProfiles();
    profilesLocked = true;
    const spawnBtn = document.querySelector('button[onclick="spawnAnimal()"]');
    if (spawnBtn) spawnBtn.disabled = false;
    runSimulation();
}

function checkForWinner() {
    let aliveTributes = tributes.filter(t => t.alive);
    // --- Automatisches Endspiel bei <= 3 Tribute oder manueller Start ---
    if (!lavaStart && !endgamePaused && (aliveTributes.length <= 3 || lavashouldstart)) {
        if (!lavashouldstart) {
            lavashouldstart = true;
            logInfo(I18N.t('log.driveToCenter'));
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
            logWin(I18N.t('log.endgameStart'));
            drawGrid();
        }
    }
    if (aliveTributes.length <= 1 && !winnerDeclared) {
        winnerDeclared = true;
        logWin(aliveTributes.length === 1 ? I18N.t('log.winner', { name: aliveTributes[0].name }) : I18N.t('log.noSurvivor'));
        simulationRunning = false;
        setUIForState('stopped');
        SimEvents.emit('simEnd', {
            winners: aliveTributes
        });
    }
}
// Gamemaker: Endspiel (Zusammentreiben + Lava-Fortschritt) anhalten bzw. fortsetzen
function toggleEndgamePause() {
    endgamePaused = !endgamePaused;
    updateEndgameButton();
    logEvent(I18N.t(endgamePaused ? 'log.endgameHalted' : 'log.endgameResumed'), 'info');
}

// Beschriftung des Endspiel-Pause-Knopfs (hängt vom Zustand ab, daher nicht per data-i18n)
function updateEndgameButton() {
    const btn = document.getElementById('endgame-pause-btn');
    if (btn) btn.textContent = I18N.t(endgamePaused ? 'ctrl.endgameResume' : 'ctrl.endgamePause');
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
    // Kreisförmige Spawn-Positionen berechnen (ein Kreis)
    const centerX = Math.floor(WIDTH / 2);
    const centerY = Math.floor(HEIGHT / 2);
    const maxRadius = 19;
    const safeZone = 5; // 10x10 Bereich, also +/-5 um das Zentrum
    // Hilfsfunktion: Prüft, ob Position im 10x10 Zentrum liegt
    function isInCenter(x, y) {
        return (x >= centerX - safeZone && x <= centerX + safeZone && y >= centerY - safeZone && y <= centerY + safeZone);
    }
    let spawnPositions = [];
    // Ein einziger Kreis für alle Tribute
    const radius = Math.min(maxRadius, Math.floor(Math.min(WIDTH, HEIGHT) / 2.5), Math.ceil(num * 2.2));
    const angleStep = (2 * Math.PI) / num;
    for (let i = 0; i < num; i++) {
        let tries = 0;
        let x, y;
        do {
            const angle = i * angleStep + (tries * 0.1); // bei Konflikt leicht drehen
            x = Math.round(centerX + radius * Math.cos(angle));
            y = Math.round(centerY + radius * Math.sin(angle));
            x = Math.max(0, Math.min(WIDTH - 1, x));
            y = Math.max(0, Math.min(HEIGHT - 1, y));
            tries++;
        } while (isInCenter(x, y) && tries < 20);
        spawnPositions.push({
            x,
            y
        });
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
            let possibleFriends = tributes.filter(o => o.id !== t.id && !t.friends.includes(o.id)); // bereits befreundete nicht erneut wählen, sonst endet die while-Schleife unten nie
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
    animals = Array.from({
        length: num
    }, () => new Animal());
}

canvas.addEventListener('mousedown', function () {
    if (!simulationRunning) drawing = true;
});
canvas.addEventListener('mouseup', function () {
    drawing = false;
});
// Gelände malen: Mittelpunkt (x, y) in Feldern; Fläche und Pinselgröße optional (sonst aus dem Menü)
function paintTerrain(x, y, mode, brushSize) {
    mode = mode || document.getElementById('draw-mode').value;
    brushSize = brushSize || parseInt(document.getElementById('brush-size').value);
    if (mode === 'animal') return; // Kein Platzieren von "animal" über das Zeichnen
    const half = Math.floor(brushSize / 2);
    for (let dx = -half; dx <= half; dx++) {
        for (let dy = -half; dy <= half; dy++) {
            const gx = x + dx,
                gy = y + dy;
            if (gx >= 0 && gx < WIDTH && gy >= 0 && gy < HEIGHT) grid[gy][gx] = mode;
        }
    }
    Hazards.markDirty();
    drawGrid();
}
canvas.addEventListener('mousemove', function (e) {
    if (!drawing || simulationRunning) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height) / TILE_SIZE);
    paintTerrain(x, y);
});
// Wildtier-Werte aus dem Menü (Leben, Schaden von/bis)
function readAnimalStats() {
    const num = (id, def) => {
        const v = parseInt(document.getElementById(id)?.value);
        return Number.isFinite(v) ? v : def;
    };
    const health = Math.max(1, num('animal-hp', 60));
    let dmgMin = Math.max(0, num('animal-dmg-min', 5));
    let dmgMax = Math.max(0, num('animal-dmg-max', 20));
    if (dmgMin > dmgMax) [dmgMin, dmgMax] = [dmgMax, dmgMin];
    return {
        health,
        dmgMin,
        dmgMax
    };
}
// Wildtier loslassen. x/y optional: ohne Angabe zufällige Position wie bisher
function spawnAnimal(x, y) {
    if (lavaStart) return; // Kein Spawnen im Endspiel
    if (x === undefined || y === undefined) {
        let tries = 0;
        const maxTries = 1000;
        do {
            x = randomInt(0, WIDTH - 1);
            y = randomInt(0, HEIGHT - 1);
            tries++;
        } while (grid[y][x] === 'lava' && tries < maxTries);
        if (tries >= maxTries) {
            alert(I18N.t('alert.noAnimalSpot'));
            return;
        }
    } else if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || grid[y][x] === 'lava') {
        return;
    }
    const animal = new Animal(readAnimalStats());
    animal.x = x;
    animal.y = y;
    animals.push(animal);
    drawGrid();
}
// Klick in die Vorschau-Arena: Wildtier an dieser Stelle loslassen (wenn "Position per Klick wählen" aktiv ist)
canvas.addEventListener('click', function (e) {
    if (!(simulationRunning || simulationPaused)) return;
    if (!document.getElementById('animal-pick')?.checked) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height) / TILE_SIZE);
    spawnAnimal(x, y);
});
// Füge die fehlende Funktion saveProfiles wieder ein (sie ist bereits weiter unten im Code vorhanden, aber sie muss vor ihrer ersten Verwendung stehen oder als Funktionsdeklaration vorliegen)
function saveProfiles() {
    tributes.forEach(tribute => {
        const profileDiv = document.querySelector(`.tribute-profile[data-id="${tribute.id}"]`);
        if (profileDiv) {
            const selects = profileDiv.querySelectorAll('select');
            tribute.name = profileDiv.querySelector('input[type="text"]').value;
            tribute.age = parseInt(profileDiv.querySelector('input[type="number"]').value);
            tribute.gender = selects[0].value; // Geschlecht
            tribute.behavior = selects[1].value; // Verhalten
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
        const tr = I18N.t;
        const opt = (value, label, current) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`;
        profileDiv.innerHTML = `
            <h3>${tr('tribute.title', { id: tribute.id })}</h3>
            <div class="tribute-info">
                <label>${tr('tribute.name')} <input type="text" value="${tribute.name}" ${profilesLocked ? 'disabled' : ''}></label>
                <label>${tr('tribute.age')} <input type="number" value="${tribute.age}" min="12" max="18" ${profilesLocked ? 'disabled' : ''}></label>
                <label>${tr('tribute.gender')} 
                    <select ${profilesLocked ? 'disabled' : ''}>
                        ${opt('männlich', tr('gender.männlich'), tribute.gender)}
                        ${opt('weiblich', tr('gender.weiblich'), tribute.gender)}
                    </select>
                </label>
                <label>${tr('tribute.attributes')} 
                    <input type="checkbox" ${tribute.attributes.stark ? 'checked' : ''} ${profilesLocked ? 'disabled' : ''}> ${tr('attr.stark')}
                    <input type="checkbox" ${tribute.attributes.schlau ? 'checked' : ''} ${profilesLocked ? 'disabled' : ''}> ${tr('attr.schlau')}
                    <input type="checkbox" ${tribute.attributes.beliebt ? 'checked' : ''} ${profilesLocked ? 'disabled' : ''}> ${tr('attr.beliebt')}
                </label>
                <label>${tr('tribute.behavior')} 
                    <select ${profilesLocked ? 'disabled' : ''}>
                        ${opt('aggressiv', tr('behavior.aggressiv'), tribute.behavior)}
                        ${opt('defensiv', tr('behavior.defensiv'), tribute.behavior)}
                        ${opt('ängstlich', tr('behavior.ängstlich'), tribute.behavior)}
                    </select>
                </label>
                <label>${tr('tribute.color')} <input type="color" value="${tribute.color}" ${profilesLocked ? 'disabled' : ''}></label>
                <div><b>${tr('tribute.friends')}</b>${friendsHtml}</div>
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
            name: I18N.t('tribute.default', { n: tributes.length + 1 }),
            age: 14 + Math.floor(Math.random() * 5),
            gender: 'männlich',
            attributes: {
                stark: false,
                schlau: false,
                beliebt: false
            },
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
/*
 * Zentrale Logging-Verwaltung
 *
 * Erkennt wiederholte Folgen aus bis zu 4 Meldungen.
 * Drei gleiche Durchläufe werden erkannt und zusammengefasst.
 */
let recentLogEvents = [];
let activeLogPattern = null;
const MAX_PATTERN_LENGTH = 4;
const REQUIRED_PATTERN_REPETITIONS = 3;
const MAX_LOG_HISTORY = 24;
// Erstellt einen tatsächlichen Log-Eintrag
function appendLogEntry(message, type = "info", tick = simTick) {
    const log = document.getElementById("log");
    if (!log) return null;
    const div = document.createElement("div");
    div.className = `log-${type}`;
    div.dataset.type = type;
    div.innerHTML = `<span class="log-time" style="opacity:.65;font-variant-numeric:tabular-nums;">[${formatGameTimeShort(tick)}]</span> ${message}`;
    log.appendChild(div);
    applyLogFilterTo(div);
    scheduleLogScroll();
    if (!ultraMode) SimEvents.emit('log', {
        message: String(message),
        type,
        tick
    });
    const entry = {
        message: String(message),
        type,
        tick,
        element: div
    };
    recentLogEvents.push(entry);
    // Nur die letzten Einträge für die Mustererkennung behalten
    if (recentLogEvents.length > MAX_LOG_HISTORY) {
        recentLogEvents.shift();
    }
    return entry;
}
// Prüft, ob zwei Ereignisse identisch sind
function sameLogEvent(a, b) {
    return a.message === b.message && a.type === b.type;
}
// Prüft, ob eine Ereignisfolge mehrfach vorkommt
function detectRepeatedPattern() {
    for (let length = 1; length <= MAX_PATTERN_LENGTH; length++) {
        const needed = length * REQUIRED_PATTERN_REPETITIONS;
        if (recentLogEvents.length < needed) continue;
        const repeated = recentLogEvents.slice(-needed);
        const pattern = repeated.slice(0, length);
        // Todes- und Siegesmeldungen niemals zusammenfassen
        if (pattern.some(entry => entry.type === "death" || entry.type === "win")) {
            continue;
        }
        let matches = true;
        for (let i = length; i < repeated.length; i++) {
            if (!sameLogEvent(repeated[i], pattern[i % length])) {
                matches = false;
                break;
            }
        }
        if (!matches) continue;
        const log = document.getElementById("log");
        if (!log) return;
        // Die erste Folge bleibt sichtbar.
        // Die beiden zusätzlichen Durchläufe werden entfernt.
        for (const entry of repeated.slice(length)) {
            entry.element.remove();
        }
        // Zusammenfassung erstellen
        const summary = document.createElement("div");
        summary.className = "log-info";
        summary.dataset.type = "info";
        // Muster lesbar darstellen
        const patternDescription = pattern.map(entry => entry.message.replace(/<[^>]*>/g, "")).join(" | ");
        const activePatternState = {
            pattern: pattern.map(entry => ({
                message: entry.message,
                type: entry.type
            })),
            matchedInCycle: 0,
            pending: [],
            repetitions: REQUIRED_PATTERN_REPETITIONS - 1,
            startTick: pattern[0].tick,
            endTick: repeated[repeated.length - 1].tick,
            summary
        };

        function updateSummary() {
            const s = activePatternState;
            summary.textContent = I18N.t('log.repeated', {
                from: formatGameTimeShort(s.startTick),
                to: formatGameTimeShort(s.endTick),
                duration: formatGameDuration(s.startTick, s.endTick),
                count: s.repetitions,
                pattern: patternDescription
            });
        }
        updateSummary();
        log.appendChild(summary);
        // Nur den Verlauf vor den Wiederholungen und
        // den ersten Durchlauf für neue Muster behalten
        recentLogEvents = [...recentLogEvents.slice(0, -needed), ...repeated.slice(0, length)];
        activePatternState.updateSummary = updateSummary;
        activeLogPattern = activePatternState;
        log.scrollTop = log.scrollHeight;
        updateLogFilterVisibility();
        return;
    }
}
// Zentrale Logging-Funktion für alle Meldungstypen
function logEvent(message, type = "info") {
    const entry = {
        message: String(message),
        type,
        tick: simTick
    };
    // Wenn wir bereits ein wiederholtes Muster erkannt haben,
    // prüfen wir, ob es weitergeht.
    if (activeLogPattern) {
        const state = activeLogPattern;
        const expected = state.pattern[state.matchedInCycle];
        if (sameLogEvent(entry, expected)) {
            state.pending.push(entry);
            state.matchedInCycle++;
            // Ein vollständiger zusätzlicher Durchlauf
            if (state.matchedInCycle === state.pattern.length) {
                state.repetitions++;
                state.endTick = entry.tick;
                state.updateSummary();
                state.pending = [];
                state.matchedInCycle = 0;
            }
            return;
        }
        // Das Muster wurde unterbrochen.
        // Noch nicht bestätigte Meldungen wieder ausgeben.
        activeLogPattern = null;
        for (const pendingEntry of state.pending) {
            appendLogEntry(pendingEntry.message, pendingEntry.type, pendingEntry.tick);
        }
        state.pending = [];
    }
    // Normale Meldung anzeigen und anschließend
    // nach wiederholten Folgen suchen
    appendLogEntry(message, type);
    detectRepeatedPattern();
}
// Hilfsfunktionen für Log-Typen
function logAttack(msg) {
    logEvent(msg, "attack");
}

function logDeath(msg) {
    logEvent(msg, "death");
    updateLiveCount();
}

function logInfo(msg) {
    logEvent(msg, "info");
}

function logWin(msg) {
    logEvent(msg, "win");
}

function updateLiveCount() {
    const el = document.getElementById('live-count-number');
    if (!el) return;
    const alive = tributes.filter(t => t.alive).length;
    el.textContent = alive;
}
// Der Log-Filter (Kategorien anzeigen/ausblenden, Tribut) liegt in script_logfilter.js
let logScrollQueued = false;

function scheduleLogScroll() {
    if (logScrollQueued) return;
    logScrollQueued = true;
    requestAnimationFrame(() => {
        logScrollQueued = false;
        const log = document.getElementById('log');
        if (log) log.scrollTop = log.scrollHeight;
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
    const vorlagen = [{
        name: "Arena1.txt",
        type: "arena"
    }, {
        name: "Arena2.txt",
        type: "arena"
    }, {
        name: "Arena3.txt",
        type: "arena"
    },];
    const select = document.createElement('select');
    select.id = 'vorlagen-select';
    select.style.marginRight = '8px';
    select.innerHTML = `<option value="" data-i18n="template.choose">${I18N.t('template.choose')}</option>` + vorlagen.map(v => `<option value="${v.name}" data-type="${v.type}">${v.name}</option>`).join('');
    const btn = document.createElement('button');
    btn.textContent = I18N.t('template.load');
    btn.dataset.i18n = 'template.load';
    btn.setAttribute('vorlagen-btn', '1');
    btn.onclick = function () {
        const file = select.value;
        if (!file) return;
        loadVorlageFile(file, select.options[select.selectedIndex].dataset.type);
    };
    container.insertBefore(btn, container.firstChild);
    container.insertBefore(select, btn);
}

// Sprachwechsel: alles neu aufbauen, was per Script erzeugt wird (Profile, Heilmenü, Knöpfe)
I18N.onChange(() => {
    updateProfiles();
    updateHealMenu();
    updateEndgameButton();
});

function loadVorlageFile(filename, type) {
    fetch('vorlagen/' + filename).then(res => res.text()).then(text => {
        // Dateiinhalt ist ein normaler Code (Base64)
        document.getElementById('load-code').value = text.trim();
        loadFromCode();
    }).catch(() => alert(I18N.t('template.failed')));
}
document.addEventListener('DOMContentLoaded', () => {
    createStatsPanel();
    updateStatsTable();
    // Initialisiere Tribute und Tiere und zeichne alles
    createTributes(parseInt(document.getElementById('tribute-count').value));
    animals = []; // Keine Tiere zu Beginn
    drawGrid();
    updateProfiles();
    // // Vorlagen-Auswahl einfügen
    loadVorlagenList();
    updateEndgameButton();
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
    let html = `<h3>${I18N.t('heal.title')}</h3>`;
    tributes.forEach(t => {
        let btnText = t.alive ? I18N.t('heal.alive', { name: t.name, health: Math.round(t.health) }) : I18N.t('heal.dead', { name: t.name });
        html += `<button class="heal-tribute-btn"
            ${t.alive ? '' : 'disabled'}
            onclick="healTribute(${t.id})">${btnText}</button>`;
    });
    html += `<button class="heal-close-btn" onclick="hideHealMenu()">${I18N.t('heal.close')}</button>`;
    menu.innerHTML = html;
}
// Heilungsfunktion
function healTribute(id) {
    const t = tributes.find(t => t.id === id && t.alive);
    if (!t) return;
    const heal = randomInt(15, 50);
    const healthBefore = t.health;
    t.health = Math.min(100, t.health + heal);
    SimEvents.emit('heal', {
        tribute: t,
        amount: t.health - healthBefore
    });
    logInfo(I18N.t('log.healed', { name: t.name, amount: heal }));
    updateProfiles();
    updateStatsTable();
    updateHealMenu();
}
// Heilungsmenü live aktualisieren bei Änderungen
function observeHealMenu() {
    // Profile-Änderungen
    const observer = new MutationObserver(() => updateHealMenu());
    const profiles = document.getElementById('profiles-container');
    if (profiles) observer.observe(profiles, {
        childList: true,
        subtree: true
    });
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
        logInfo(I18N.t('log.endgameManual'));
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
        if (!weapons.some(w => w.x === x && w.y === y) && !tributes.some(t => t.x === x && t.y === y)) {
            weapons.push({
                x,
                y,
                power: randomInt(5, 20)
            });
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
        if (t.alive && (typeof t.x !== 'number' || typeof t.y !== 'number' || t.x < 0 || t.x >= WIDTH || t.y < 0 || t.y >= HEIGHT)) {
            outOfBounds.push(t);
        }
    }
    if (outOfBounds.length === 0) return;
    // Prüfe, ob das die letzten Tribute sind
    const living = tributes.filter(t => t.alive);
    if (outOfBounds.length === living.length) {
        // Alle sterben durch "verunglückt"
        outOfBounds.forEach(t => {
            t.die('accident');
        });
        return;
    }
    // Sonst: alle betroffenen Tribute sterben
    outOfBounds.forEach(t => {
        t.die('accident');
    });
    updateProfiles();
    updateStatsTable();
}
//farbumwandlung
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c / 2;
    let r = 0,
        g = 0,
        b = 0;
    if (h < 60) {
        r = c;
        g = x;
        b = 0;
    } else if (h < 120) {
        r = x;
        g = c;
        b = 0;
    } else if (h < 180) {
        r = 0;
        g = c;
        b = x;
    } else if (h < 240) {
        r = 0;
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        g = 0;
        b = c;
    } else {
        r = c;
        g = 0;
        b = x;
    }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
document.addEventListener('DOMContentLoaded', () => setUIForState('ready'));
generateArena()
window.addEventListener('load', () => {
    // zwei Frames warten, damit die erste Arena-Zeichnung schon sichtbar ist
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const loader = document.getElementById('loader');
        if (!loader) return;
        loader.classList.add('hide');
        setTimeout(() => loader.remove(), 450);
    }));
});
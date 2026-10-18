/* =====================================================================
 * Vollbild-Ansicht (Desktop)
 *
 * Eigene, scharfe Darstellung der Arena mit Kamera:
 *   Mausrad    zoomen (um die Mausposition)
 *   Ziehen     Kartenausschnitt verschieben
 *   Klick      auf einen Tribut: Kamera folgt ihm (Klick ins Leere: beenden)
 *   Vor dem Start: "Gelände zeichnen" (linke Maustaste malt, rechte Taste
 *              verschiebt die Karte) mit Fläche und Pinselgröße
 *   Nach dem Start: Wildtier mit Leben, Schaden und optionaler Klick-Position
 *   Esc        Vollbild verlassen
 * Optionen: Namen, Lebensbalken, Schadenszahlen, Partikel, Raster.
 * Die Gamemaker-Steuerung (Pause, Tempo, Wildtier, Wetter, Endspiel)
 * ist direkt in der Leiste unten erreichbar.
 *
 * Der Button "Vollbild" wird per Script unter der Arena eingefügt
 * (nur sichtbar auf großen Bildschirmen mit Maus, siehe style.css).
 * ===================================================================== */

(function () {
    const MAX_PPT = 48;
    const STORAGE_KEY = 'hng.fullscreenOptions';
    const WEATHER_OPTIONS = [
        ['clear', 'Gutes Wetter'],
        ['fog', 'Nebel'],
        ['rain', 'Regen'],
        ['snow', 'Schnee']
    ];

    const camera = {
        cx: 100,
        cy: 100,
        ppt: 5,
        targetPpt: 5,
        anchor: null // {sx, sy, wx, wy}: Weltpunkt, der beim Zoomen unter der Maus bleibt
    };
    const prefs = {
        names: true,
        healthBars: true,
        numbers: true,
        particles: true,
        grid: false
    };
    let overlay, canvas, ctx, minimap, minimapCtx, tip, ticker;
    let followId = null;
    let isOpen = false;
    let cssW = 0,
        cssH = 0,
        dpr = 1;
    let drag = null;
    let hoverTributeId = null;
    let painting = false;
    let lastPaint = null; // letzte gemalte Kachel, damit schnelle Mausbewegungen keine Lücken lassen

    // Menüfelder, die mit dem Hauptmenü geteilt werden: [Haupt-ID, Vollbild-ID]
    const SHARED_FIELDS = [
        ['draw-mode', 'fs-draw-mode'],
        ['brush-size', 'fs-brush'],
        ['animal-hp', 'fs-animal-hp'],
        ['animal-dmg-min', 'fs-animal-dmg-min'],
        ['animal-dmg-max', 'fs-animal-dmg-max'],
        ['animal-pick', 'fs-animal-pick']
    ];

    function init() {
        loadPrefs();
        buildDom();
        bindEvents();
        SimEvents.on('log', onLog);
    }

    function loadPrefs() {
        try {
            Object.assign(prefs, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
        } catch (e) {
            /* Standardwerte */
        }
    }

    function savePrefs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch (e) {
            /* ignorieren */
        }
    }

    // ---------------------------------------------------------------
    // Aufbau
    // ---------------------------------------------------------------
    function buildDom() {
        const gameCanvas = document.getElementById('arena');
        const bar = document.createElement('div');
        bar.className = 'view-bar';
        bar.innerHTML = '<button type="button" id="fs-open">⛶ Vollbild</button>';
        gameCanvas.insertAdjacentElement('afterend', bar);

        overlay = document.createElement('div');
        overlay.id = 'fs-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <canvas id="fs-canvas"></canvas>
            <div id="fs-top">
                <span id="fs-clock"></span>
                <span id="fs-alive"></span>
                <span id="fs-follow" hidden></span>
            </div>
            <div id="fs-ticker"></div>
            <canvas id="fs-minimap" width="200" height="200"></canvas>
            <div id="fs-tip" hidden></div>
            <div id="fs-bar">
                <div class="fs-group">
                    <button type="button" data-act="start">▶ Start</button>
                    <button type="button" data-act="pause">Pause</button>
                    <label>Tempo <input type="range" id="fs-speed" min="1" max="10"></label>
                    <label>Wetter <select id="fs-weather">${WEATHER_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
                    <button type="button" data-act="endgame">Endspiel</button>
                </div>
                <div class="fs-group" id="fs-edit-group">
                    <label><input type="checkbox" id="fs-paint"> Gelände zeichnen</label>
                    <label>Fläche <select id="fs-draw-mode">${document.getElementById('draw-mode').innerHTML}</select></label>
                    <label>Pinsel <input type="range" id="fs-brush" min="1" max="20"></label>
                </div>
                <div class="fs-group" id="fs-animal-group">
                    <button type="button" data-act="animal">Wildtier</button>
                    <label>Leben <input type="number" id="fs-animal-hp" min="1" max="500"></label>
                    <label>Schaden <input type="number" id="fs-animal-dmg-min" min="0" max="100"> bis <input type="number" id="fs-animal-dmg-max" min="0" max="100"></label>
                    <label><input type="checkbox" id="fs-animal-pick"> Position per Klick</label>
                </div>
                <div class="fs-group">
                    <label><input type="checkbox" data-pref="names"> Namen</label>
                    <label><input type="checkbox" data-pref="healthBars"> Lebensbalken</label>
                    <label><input type="checkbox" data-pref="numbers"> Schadenszahlen</label>
                    <label><input type="checkbox" data-pref="particles"> Partikel</label>
                    <label><input type="checkbox" data-pref="grid"> Raster</label>
                </div>
                <div class="fs-group">
                    <button type="button" data-act="fit">Ganze Arena</button>
                    <button type="button" data-act="close">✕ Schließen</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        canvas = overlay.querySelector('#fs-canvas');
        ctx = canvas.getContext('2d');
        minimap = overlay.querySelector('#fs-minimap');
        minimapCtx = minimap.getContext('2d');
        tip = overlay.querySelector('#fs-tip');
        ticker = overlay.querySelector('#fs-ticker');
        overlay.querySelectorAll('[data-pref]').forEach(box => {
            box.checked = !!prefs[box.dataset.pref];
        });
    }

    // ---------------------------------------------------------------
    // Öffnen / Schließen
    // ---------------------------------------------------------------
    async function open() {
        if (isOpen) return;
        isOpen = true;
        overlay.hidden = false;
        document.body.classList.add('fs-active');
        try {
            if (overlay.requestFullscreen) await overlay.requestFullscreen({
                navigationUI: 'hide'
            });
        } catch (e) {
            /* ohne Vollbild-API bleibt es ein Fenster über der Seite */
        }
        resize();
        fitCamera();
        applyPrefs();
        syncControls();
        Renderer.addTarget(target);
        Renderer.requestDraw();
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        Renderer.removeTarget(target);
        overlay.hidden = true;
        document.body.classList.remove('fs-active');
        followId = null;
        tip.hidden = true;
        ticker.innerHTML = '';
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        Renderer.requestDraw();
    }

    function resize() {
        dpr = window.devicePixelRatio || 1;
        cssW = overlay.clientWidth || window.innerWidth;
        cssH = overlay.clientHeight || window.innerHeight;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        camera.targetPpt = Math.max(camera.targetPpt, fitPpt());
        camera.ppt = Math.max(camera.ppt, fitPpt());
        Renderer.requestDraw();
    }

    // Höhe der Zeichenfläche ohne die untere Leiste (die Kamera zentriert auf diesen Bereich)
    function usableH() {
        const bar = overlay.querySelector('#fs-bar');
        const h = bar ? bar.offsetHeight : 0;
        overlay.style.setProperty('--fs-bar', `${h}px`);
        return Math.max(100, cssH - h);
    }

    function fitPpt() {
        return Math.min(cssW / WIDTH, usableH() / HEIGHT) * 0.98;
    }

    function fitCamera() {
        camera.cx = WIDTH / 2;
        camera.cy = HEIGHT / 2;
        camera.ppt = camera.targetPpt = fitPpt();
        camera.anchor = null;
        followId = null;
    }

    // ---------------------------------------------------------------
    // Kamera
    // ---------------------------------------------------------------
    function clampCamera() {
        const halfW = cssW / camera.ppt / 2,
            halfH = usableH() / camera.ppt / 2;
        // Ist die Arena kleiner als der Bildschirm, bleibt sie zentriert
        camera.cx = halfW * 2 >= WIDTH ? WIDTH / 2 : Math.min(WIDTH - halfW, Math.max(halfW, camera.cx));
        camera.cy = halfH * 2 >= HEIGHT ? HEIGHT / 2 : Math.min(HEIGHT - halfH, Math.max(halfH, camera.cy));
    }

    function getView() {
        return {
            x0: camera.cx - cssW / camera.ppt / 2,
            y0: camera.cy - usableH() / camera.ppt / 2,
            ppt: camera.ppt,
            w: cssW,
            h: cssH
        };
    }

    function screenToWorld(sx, sy) {
        const v = getView();
        return {
            x: v.x0 + sx / v.ppt,
            y: v.y0 + sy / v.ppt
        };
    }

    function updateCamera(dt) {
        // Zoom weich annähern; Weltpunkt unter der Maus bleibt stehen
        camera.ppt += (camera.targetPpt - camera.ppt) * (1 - Math.exp(-dt * 10));
        if (Math.abs(camera.targetPpt - camera.ppt) < 0.01) camera.ppt = camera.targetPpt;
        const followed = followId !== null ? tributes.find(t => t.id === followId && t.alive) : null;
        if (followId !== null && !followed) followId = null;
        if (followed) {
            const d = Renderer.getDisplayPos(followed);
            const k = 1 - Math.exp(-dt * 6);
            camera.cx += (d.x + 0.5 - camera.cx) * k;
            camera.cy += (d.y + 0.5 - camera.cy) * k;
        } else if (camera.anchor) {
            camera.cx = camera.anchor.wx - (camera.anchor.sx - cssW / 2) / camera.ppt;
            camera.cy = camera.anchor.wy - (camera.anchor.sy - usableH() / 2) / camera.ppt;
        }
        clampCamera();
    }

    // ---------------------------------------------------------------
    // Render-Ziel
    // ---------------------------------------------------------------
    const target = {
        get canvas() {
            return canvas;
        },
        get ctx() {
            return ctx;
        },
        get dpr() {
            return dpr;
        },
        always: true,
        options: {},
        getView,
        update(dt) {
            updateCamera(dt);
            this.options = {
                names: prefs.names,
                healthBars: prefs.healthBars,
                numbers: prefs.numbers,
                grid: prefs.grid,
                highlightId: followId !== null ? followId : hoverTributeId
            };
            updateHud();
        },
        after() {
            drawMinimap();
        }
    };

    // ---------------------------------------------------------------
    // HUD
    // ---------------------------------------------------------------
    function updateHud() {
        overlay.querySelector('#fs-clock').textContent = formatGameTime();
        overlay.querySelector('#fs-alive').textContent = `Verbleibende Tribute: ${tributes.filter(t => t.alive).length}`;
        const follow = overlay.querySelector('#fs-follow');
        const followed = followId !== null ? tributes.find(t => t.id === followId) : null;
        follow.hidden = !followed;
        if (followed) follow.textContent = `Kamera folgt: ${followed.name}`;

        const notStarted = !simulationRunning && !simulationPaused && simTick === 0 && !winnerDeclared;
        const active = simulationRunning || simulationPaused;
        const startBtn = overlay.querySelector('[data-act="start"]');
        const pauseBtn = overlay.querySelector('[data-act="pause"]');
        startBtn.hidden = !notStarted;
        pauseBtn.hidden = notStarted;
        pauseBtn.disabled = !active;
        pauseBtn.textContent = simulationPaused ? 'Fortsetzen' : 'Pause';
        overlay.querySelector('[data-act="animal"]').disabled = !active || lavaStart;
        overlay.querySelector('#fs-edit-group').hidden = !notStarted;
        overlay.querySelector('#fs-animal-group').hidden = notStarted;
        overlay.querySelector('[data-act="endgame"]').disabled = !active || lavaStart || lavashouldstart;
        const weather = overlay.querySelector('#fs-weather');
        if (weather.value !== currentWeather && document.activeElement !== weather) weather.value = currentWeather;
        const speed = overlay.querySelector('#fs-speed');
        const mainSpeed = document.getElementById('speed').value;
        if (speed.value !== mainSpeed && document.activeElement !== speed) speed.value = mainSpeed;
    }

    function syncControls() {
        SHARED_FIELDS.forEach(([mainId, fsId]) => {
            const main = document.getElementById(mainId),
                fs = overlay.querySelector(`#${fsId}`);
            if (!main || !fs) return;
            if (main.type === 'checkbox') fs.checked = main.checked;
            else fs.value = main.value;
        });
        overlay.querySelector('#fs-weather').value = currentWeather;
        overlay.querySelector('#fs-speed').value = document.getElementById('speed').value;
    }

    function applyPrefs() {
        Fx.state.enabled = prefs.particles;
    }

    function onLog({
        message,
        type,
        tick
    }) {
        if (!isOpen) return;
        const line = document.createElement('div');
        line.className = `fs-log fs-log-${type}`;
        line.textContent = `[${formatGameTimeShort(tick)}] ${String(message).replace(/<[^>]*>/g, '')}`;
        ticker.appendChild(line);
        while (ticker.children.length > 6) ticker.removeChild(ticker.firstChild);
        setTimeout(() => line.remove(), 9000);
    }

    // ---------------------------------------------------------------
    // Minimap
    // ---------------------------------------------------------------
    function drawMinimap() {
        const S = minimap.width;
        const g = minimapCtx;
        g.imageSmoothingQuality = 'high';
        g.drawImage(Renderer.getTerrainCanvas(), 0, 0, S, S);
        const k = S / WIDTH;
        tributes.forEach(t => {
            if (!t.alive) return;
            const d = Renderer.getDisplayPos(t);
            g.fillStyle = t.color;
            g.fillRect(d.x * k - 1, d.y * k - 1, 3, 3);
        });
        const v = getView();
        g.strokeStyle = '#fcff40';
        g.lineWidth = 1.5;
        g.strokeRect(Math.max(0, v.x0 * k), Math.max(0, v.y0 * k),
            Math.min(S, (v.w / v.ppt) * k), Math.min(S, (v.h / v.ppt) * k));
    }

    function minimapPointer(e) {
        const rect = minimap.getBoundingClientRect();
        camera.cx = ((e.clientX - rect.left) / rect.width) * WIDTH;
        camera.cy = ((e.clientY - rect.top) / rect.height) * HEIGHT;
        camera.anchor = null;
        followId = null;
        clampCamera();
    }

    // ---------------------------------------------------------------
    // Eingaben
    // ---------------------------------------------------------------
    function isNotStarted() {
        return !simulationRunning && !simulationPaused && simTick === 0 && !winnerDeclared;
    }

    function canPaint() {
        return isNotStarted() && overlay.querySelector('#fs-paint').checked;
    }

    function canPickSpawn() {
        return (simulationRunning || simulationPaused) && !lavaStart && overlay.querySelector('#fs-animal-pick').checked;
    }

    function tileAt(e) {
        const rect = canvas.getBoundingClientRect();
        const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        return {
            x: Math.floor(w.x),
            y: Math.floor(w.y)
        };
    }

    // Malt an der Mausposition, zwischen zwei Ereignissen wird die Strecke aufgefüllt
    function paintAtEvent(e) {
        const t = tileAt(e);
        const mode = overlay.querySelector('#fs-draw-mode').value;
        const brush = parseInt(overlay.querySelector('#fs-brush').value) || 1;
        const from = lastPaint || t;
        const steps = Math.max(Math.abs(t.x - from.x), Math.abs(t.y - from.y), 1);
        for (let i = 1; i <= steps; i++) {
            paintTerrain(Math.round(from.x + (t.x - from.x) * i / steps), Math.round(from.y + (t.y - from.y) * i / steps), mode, brush);
        }
        lastPaint = t;
    }

    function tributeAt(sx, sy) {
        const w = screenToWorld(sx, sy);
        let best = null,
            bestDist = Math.max(0.9, 14 / camera.ppt);
        tributes.forEach(t => {
            if (!t.alive) return;
            const d = Renderer.getDisplayPos(t);
            const dist = Math.hypot(d.x + 0.5 - w.x, d.y + 0.5 - w.y);
            if (dist < bestDist) {
                bestDist = dist;
                best = t;
            }
        });
        return best;
    }

    function showTip(t, e) {
        tip.hidden = false;
        tip.innerHTML = `<b style="color:${t.color}">${escapeHtml(t.name)}</b><br>Leben: ${Math.max(0, Math.round(t.health))} / ${MAX_HEALTH}<br>Verhalten: ${t.behavior}<br>Kills: ${t.kills} · Schaden: ${Math.round(t.damageDealt)}`;
        const x = Math.min(e.clientX + 16, window.innerWidth - 200);
        const y = Math.min(e.clientY + 16, window.innerHeight - 110);
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
    }

    function bindEvents() {
        document.getElementById('fs-open').addEventListener('click', open);

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left,
                sy = e.clientY - rect.top;
            const world = screenToWorld(sx, sy);
            camera.targetPpt = Math.min(MAX_PPT, Math.max(fitPpt(), camera.targetPpt * Math.exp(-e.deltaY * 0.0015)));
            camera.anchor = {
                sx,
                sy,
                wx: world.x,
                wy: world.y
            };
        }, {
            passive: false
        });

        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('pointerdown', e => {
            canvas.setPointerCapture(e.pointerId);
            if (e.button === 0 && canPaint()) {
                painting = true;
                lastPaint = null;
                paintAtEvent(e);
                return;
            }
            drag = {
                x: e.clientX,
                y: e.clientY,
                moved: 0
            };
        });
        canvas.addEventListener('pointermove', e => {
            const rect = canvas.getBoundingClientRect();
            if (painting) {
                paintAtEvent(e);
                return;
            }
            if (drag) {
                const dx = e.clientX - drag.x,
                    dy = e.clientY - drag.y;
                drag.moved += Math.abs(dx) + Math.abs(dy);
                drag.x = e.clientX;
                drag.y = e.clientY;
                if (drag.moved > 4) {
                    camera.cx -= dx / camera.ppt;
                    camera.cy -= dy / camera.ppt;
                    camera.anchor = null;
                    followId = null;
                    tip.hidden = true;
                }
                return;
            }
            const t = tributeAt(e.clientX - rect.left, e.clientY - rect.top);
            hoverTributeId = t ? t.id : null;
            canvas.style.cursor = (canPaint() || canPickSpawn()) ? 'crosshair' : (t ? 'pointer' : 'grab');
            if (t) showTip(t, e);
            else tip.hidden = true;
        });
        canvas.addEventListener('pointerup', e => {
            if (painting) {
                painting = false;
                lastPaint = null;
                return;
            }
            const wasClick = drag && drag.moved <= 4;
            drag = null;
            if (!wasClick) return;
            if (canPickSpawn()) {
                const tile = tileAt(e);
                spawnAnimal(tile.x, tile.y);
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const t = tributeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (t && followId !== t.id) {
                followId = t.id;
                camera.targetPpt = Math.max(camera.targetPpt, 16);
                camera.anchor = null;
            } else {
                followId = null;
            }
        });
        canvas.addEventListener('pointerleave', () => {
            hoverTributeId = null;
            tip.hidden = true;
        });

        let minimapDrag = false;
        minimap.addEventListener('pointerdown', e => {
            minimapDrag = true;
            minimap.setPointerCapture(e.pointerId);
            minimapPointer(e);
        });
        minimap.addEventListener('pointermove', e => {
            if (minimapDrag) minimapPointer(e);
        });
        minimap.addEventListener('pointerup', () => {
            minimapDrag = false;
        });

        overlay.querySelector('#fs-bar').addEventListener('click', e => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            switch (btn.dataset.act) {
                case 'start':
                    startSimulation();
                    break;
                case 'pause':
                    pauseSimulation();
                    break;
                case 'animal':
                    spawnAnimal();
                    break;
                case 'endgame':
                    stopSimulation();
                    break;
                case 'fit':
                    fitCamera();
                    break;
                case 'close':
                    close();
                    break;
            }
        });
        overlay.querySelector('#fs-speed').addEventListener('input', e => {
            document.getElementById('speed').value = e.target.value;
        });
        SHARED_FIELDS.forEach(([mainId, fsId]) => {
            const fs = overlay.querySelector(`#${fsId}`);
            const write = () => {
                const main = document.getElementById(mainId);
                if (!main) return;
                if (fs.type === 'checkbox') main.checked = fs.checked;
                else main.value = fs.value;
            };
            fs.addEventListener('input', write);
            fs.addEventListener('change', write);
        });
        overlay.querySelector('#fs-weather').addEventListener('change', e => {
            setWeather(e.target.value);
            const mainSelect = document.querySelector('.mid-game select');
            if (mainSelect) mainSelect.value = e.target.value;
        });
        overlay.querySelectorAll('[data-pref]').forEach(box => {
            box.addEventListener('change', () => {
                prefs[box.dataset.pref] = box.checked;
                savePrefs();
                applyPrefs();
            });
        });

        document.addEventListener('fullscreenchange', () => {
            if (isOpen && !document.fullscreenElement) close();
            else if (isOpen) {
                resize();
            }
        });
        window.addEventListener('resize', () => {
            if (isOpen) resize();
        });
        document.addEventListener('keydown', e => {
            if (!isOpen) return;
            if (e.key === 'Escape' && !document.fullscreenElement) close();
            else if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            else if (e.key === 'n' || e.key === 'N') toggleName();
            else if (e.key === 'f' || e.key === 'F') fitCamera();
        });
    }

    function toggleName() {
        const box = overlay.querySelector('[data-pref="names"]');
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change'));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
/* =====================================================================
 * Statistik-Bereich
 *
 * Ein- und ausblendbar, mit fünf Ansichten:
 *   Tabelle   sortierbare Zahlen
 *   Balken    eine Kategorie als Balkendiagramm
 *   Heatmap   Aufenthalt, Schaden oder Todesorte über die ganze Arena
 *   Pfade     Laufwege einzelner Tribute auf der Arena VOR dem Endspiel
 *             (ohne Endspiel-Lava), halbtransparent: wo sich ein Weg
 *             kreuzt oder wiederholt, wird die Linie kräftiger
 *   Podest    Platz 1 bis 3 nach Spielende mit Figur, Namen, Kills und Todesursache;
 *             wer gleichzeitig stirbt, teilt sich den Platz (springt am Spielende
 *             automatisch auf diese Ansicht)
 *
 * Alles wird selbst auf Canvas gezeichnet, es ist keine Bibliothek nötig.
 * Die Daten kommen aus script_stats.js.
 * ===================================================================== */

const STAT_METRICS = [{
    key: 'damageDealt',
    get label() {
        return I18N.t('stats.metric.damageDealt');
    },
    get: t => Math.round(t.damageDealt || 0)
}, {
    key: 'damageTaken',
    get label() {
        return I18N.t('stats.metric.damageTaken');
    },
    get: t => Math.round(t.damageTaken || 0)
}, {
    key: 'distanceMoved',
    get label() {
        return I18N.t('stats.metric.distanceMoved');
    },
    get: t => t.distanceMoved || 0
}, {
    key: 'kills',
    get label() {
        return I18N.t('stats.metric.kills');
    },
    get: t => t.kills || 0
}, {
    key: 'survival',
    get label() {
        return I18N.t('stats.metric.survival');
    },
    get: t => SimStats.survivalOf(t)
}];

const HEAT_LAYERS = {
    visits: {
        get label() {
            return I18N.t('stats.layer.visits');
        },
        blur: 2
    },
    damage: {
        get label() {
            return I18N.t('stats.layer.damage');
        },
        blur: 3
    },
    deaths: {
        get label() {
            return I18N.t('stats.layer.deaths');
        },
        blur: 5
    }
};

// Farbverlauf der Heatmap: [Position 0..1, r, g, b, a]
const HEAT_STOPS = [
    [0, 40, 0, 120, 0],
    [0.2, 30, 80, 255, 110],
    [0.45, 0, 230, 230, 170],
    [0.7, 255, 235, 40, 205],
    [1, 255, 40, 20, 240]
];

const statsView = {
    ready: false,
    collapsed: false,
    tab: 'table',
    barKey: 'damageDealt',
    barHover: -1,
    barRows: [],
    barAnimStart: 0,
    heatLayer: 'visits',
    heatTribute: 'all',
    heatBackground: true,
    heatDeaths: true,
    pathSelection: null, // Set der angezeigten Tribut-IDs (null = noch nicht initialisiert)
    pathTick: null, // null = bis zum letzten Zeitpunkt
    pathMarkers: true,
    pathAliveOnly: false, // nur Tribute zeigen, die zum Zeitpunkt des Reglers noch leben
    chipSignature: '',
    podiumSignature: '',
    pending: false,
    lastRender: 0
};

const heatLut = (() => {
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
        const p = i / 255;
        let k = 1;
        while (k < HEAT_STOPS.length - 1 && HEAT_STOPS[k][0] < p) k++;
        const a = HEAT_STOPS[k - 1],
            b = HEAT_STOPS[k];
        const f = (p - a[0]) / (b[0] - a[0]);
        for (let c = 0; c < 4; c++) lut[i * 4 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
    }
    return lut;
})();

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

function statsEl(id) {
    return document.getElementById(id);
}

// Canvas auf CSS-Größe bringen (scharf auf Retina) und Zeichenkontext zurückgeben
function fitStatsCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
}

function drawCanvasMessage(canvas, text, size = 520) {
    const g = fitStatsCanvas(canvas, Math.min(size, canvas.parentElement.clientWidth || size), 160);
    g.fillStyle = '#1b0b23';
    g.fillRect(0, 0, canvas.clientWidth, 160);
    g.fillStyle = 'rgba(237, 233, 180, 0.75)';
    g.font = '500 15px "DM Sans", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, canvas.clientWidth / 2, 80);
}

// ---------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------
function createStatsPanel() {
    let container = statsEl('stats-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'stats-container';
        document.body.insertBefore(container, statsEl('log-filter-bar'));
    }
    container.className = 'stats-panel';
    const metricOptions = STAT_METRICS.map(m => `<option value="${m.key}" data-i18n="stats.metric.${m.key}">${m.label}</option>`).join('');
    const layerOptions = Object.entries(HEAT_LAYERS).map(([k, l]) => `<option value="${k}" data-i18n="stats.layer.${k}">${l.label}</option>`).join('');
    container.innerHTML = `
        <div class="stats-head">
            <h2 data-i18n="stats.title"></h2>
            <button id="stats-toggle" type="button" aria-expanded="true"></button>
        </div>
        <div class="stats-body" id="stats-body">
            <div class="stats-tabs" role="tablist">
                <button type="button" class="stats-tab active" data-tab="table" data-i18n="stats.tab.table"></button>
                <button type="button" class="stats-tab" data-tab="bars" data-i18n="stats.tab.bars"></button>
                <button type="button" class="stats-tab" data-tab="heat" data-i18n="stats.tab.heat"></button>
                <button type="button" class="stats-tab" data-tab="paths" data-i18n="stats.tab.paths"></button>
                <button type="button" class="stats-tab" data-tab="podium" data-i18n="stats.tab.podium"></button>
            </div>

            <div class="stats-pane" data-pane="table">
                <div id="stats-sort-bar" class="stats-controls">
                    <label><span data-i18n="stats.sortBy"></span>
                        <select id="stats-sort-key">${metricOptions}</select>
                    </label>
                    <button id="stats-sort-dir" type="button" data-i18n-attr="title:stats.sortDir">▼</button>
                </div>
                <div class="stats-scroll">
                    <table id="stats-table">
                        <thead><tr>
                            <th data-i18n="stats.col.name"></th><th data-i18n="stats.metric.damageDealt"></th><th data-i18n="stats.metric.damageTaken"></th>
                            <th data-i18n="stats.metric.distanceMoved"></th><th data-i18n="stats.metric.kills"></th><th data-i18n="stats.col.survival"></th>
                        </tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <div class="stats-pane" data-pane="bars" hidden>
                <div class="stats-controls">
                    <label><span data-i18n="stats.category"></span>
                        <select id="stats-bar-key">${metricOptions}</select>
                    </label>
                </div>
                <div class="stats-canvas-wrap"><canvas id="stats-bars-canvas"></canvas></div>
            </div>

            <div class="stats-pane" data-pane="heat" hidden>
                <div class="stats-controls">
                    <label><span data-i18n="stats.display"></span>
                        <select id="stats-heat-layer">${layerOptions}</select>
                    </label>
                    <label><span data-i18n="stats.tribute"></span>
                        <select id="stats-heat-tribute"></select>
                    </label>
                    <label><input type="checkbox" id="stats-heat-bg" checked> <span data-i18n="stats.heatBg"></span></label>
                    <label><input type="checkbox" id="stats-heat-deaths" checked> <span data-i18n="stats.heatDeaths"></span></label>
                </div>
                <div class="stats-canvas-wrap"><canvas id="stats-heat-canvas"></canvas></div>
                <div class="stats-legend"><span data-i18n="stats.low"></span><i id="stats-heat-legend"></i><span data-i18n="stats.high"></span></div>
            </div>

            <div class="stats-pane" data-pane="paths" hidden>
                <div class="stats-controls">
                    <button type="button" id="stats-path-all" data-i18n="stats.pathAll"></button>
                    <button type="button" id="stats-path-none" data-i18n="stats.pathNone"></button>
                    <button type="button" id="stats-path-alive" aria-pressed="false" data-i18n="stats.pathAliveOnly" data-i18n-attr="title:stats.pathAliveOnlyTitle"></button>
                    <label><input type="checkbox" id="stats-path-markers" checked> <span data-i18n="stats.pathMarkers"></span></label>
                </div>
                <div id="stats-path-chips" class="path-chips"></div>
                <div class="stats-controls stats-scrub">
                    <label><span data-i18n="stats.pathUntil"></span>
                        <input type="range" id="stats-path-tick" min="0" max="0" value="0">
                    </label>
                    <span id="stats-path-tick-label"></span>
                </div>
                <div class="stats-canvas-wrap"><canvas id="stats-path-canvas"></canvas></div>
                <p class="stats-hint" data-i18n="stats.pathHint"></p>
            </div>

            <div class="stats-pane" data-pane="podium" hidden>
                <div id="stats-podium" class="podium-wrap"></div>
            </div>
        </div>
        <div id="stats-tip" class="stats-tip" hidden></div>
    `;
    I18N.apply(container);
    statsEl('stats-heat-legend').style.background = `linear-gradient(90deg, ${HEAT_STOPS.map(s => `rgba(${s[1]}, ${s[2]}, ${s[3]}, ${Math.max(0.15, s[4] / 255)}) ${s[0] * 100}%`).join(', ')})`;
    statsEl('stats-sort-dir').dataset.dir = 'desc';
    try {
        statsView.collapsed = localStorage.getItem('hng.statsCollapsed') === '1';
    } catch (e) {
        /* Speicher nicht verfügbar: Standard */
    }
    bindStatsEvents(container);
    applyStatsCollapsed();
    statsView.ready = true;
    renderStats();
}

function bindStatsEvents(container) {
    statsEl('stats-toggle').addEventListener('click', () => {
        statsView.collapsed = !statsView.collapsed;
        try {
            localStorage.setItem('hng.statsCollapsed', statsView.collapsed ? '1' : '0');
        } catch (e) {
            /* ignorieren */
        }
        applyStatsCollapsed();
        renderStats();
    });
    container.querySelectorAll('.stats-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            statsView.tab = btn.dataset.tab;
            if (statsView.tab === 'bars') statsView.barAnimStart = performance.now();
            applyStatsTab();
            renderStats();
        });
    });
    statsEl('stats-sort-key').addEventListener('change', renderStats);
    statsEl('stats-sort-dir').addEventListener('click', function () {
        this.dataset.dir = this.dataset.dir === 'asc' ? 'desc' : 'asc';
        this.textContent = this.dataset.dir === 'asc' ? '▲' : '▼';
        renderStats();
    });
    statsEl('stats-bar-key').addEventListener('change', e => {
        statsView.barKey = e.target.value;
        statsView.barAnimStart = performance.now();
        renderStats();
    });
    const bars = statsEl('stats-bars-canvas');
    bars.addEventListener('pointermove', onBarsHover);
    bars.addEventListener('pointerleave', () => {
        statsView.barHover = -1;
        statsEl('stats-tip').hidden = true;
        renderStats();
    });
    statsEl('stats-heat-layer').addEventListener('change', e => {
        statsView.heatLayer = e.target.value;
        statsEl('stats-heat-tribute').disabled = statsView.heatLayer === 'deaths';
        renderStats();
    });
    statsEl('stats-heat-tribute').addEventListener('change', e => {
        statsView.heatTribute = e.target.value;
        renderStats();
    });
    statsEl('stats-heat-bg').addEventListener('change', e => {
        statsView.heatBackground = e.target.checked;
        renderStats();
    });
    statsEl('stats-heat-deaths').addEventListener('change', e => {
        statsView.heatDeaths = e.target.checked;
        renderStats();
    });
    statsEl('stats-path-all').addEventListener('click', () => {
        statsView.pathSelection = new Set(tributes.map(t => t.id));
        statsView.chipSignature = '';
        renderStats();
    });
    statsEl('stats-path-none').addEventListener('click', () => {
        statsView.pathSelection = new Set();
        statsView.chipSignature = '';
        renderStats();
    });
    statsEl('stats-path-alive').addEventListener('click', function () {
        statsView.pathAliveOnly = !statsView.pathAliveOnly;
        this.classList.toggle('active', statsView.pathAliveOnly);
        this.setAttribute('aria-pressed', String(statsView.pathAliveOnly));
        statsView.chipSignature = '';
        renderStats();
    });
    statsEl('stats-path-markers').addEventListener('change', e => {
        statsView.pathMarkers = e.target.checked;
        renderStats();
    });
    statsEl('stats-path-tick').addEventListener('input', e => {
        const value = Number(e.target.value);
        statsView.pathTick = value >= SimStats.maxTick() ? null : value;
        renderStats();
    });
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderStats, 150);
    });
}

function applyStatsCollapsed() {
    statsEl('stats-body').hidden = statsView.collapsed;
    const btn = statsEl('stats-toggle');
    btn.textContent = I18N.t(statsView.collapsed ? 'stats.show' : 'stats.hide');
    btn.setAttribute('aria-expanded', String(!statsView.collapsed));
    applyStatsTab();
}

function applyStatsTab() {
    document.querySelectorAll('#stats-container .stats-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === statsView.tab);
    });
    document.querySelectorAll('#stats-container .stats-pane').forEach(pane => {
        pane.hidden = pane.dataset.pane !== statsView.tab;
    });
}

// ---------------------------------------------------------------------
// Aktualisierung (wird von der Simulation oft aufgerufen -> gebündelt)
// ---------------------------------------------------------------------
function updateStatsTable() {
    if (!statsView.ready || statsView.collapsed || statsView.pending) return;
    const heavy = statsView.tab === 'heat' || statsView.tab === 'paths';
    const wait = Math.max(0, (heavy ? 450 : 120) - (performance.now() - statsView.lastRender));
    statsView.pending = true;
    setTimeout(() => requestAnimationFrame(() => {
        statsView.pending = false;
        renderStats();
    }), wait);
}

function renderStats() {
    if (!statsView.ready || statsView.collapsed) return;
    statsView.lastRender = performance.now();
    switch (statsView.tab) {
        case 'table':
            renderStatsTable();
            break;
        case 'bars':
            renderStatsBars();
            break;
        case 'heat':
            renderStatsHeat();
            break;
        case 'paths':
            renderStatsPaths();
            break;
        case 'podium':
            renderStatsPodium();
            break;
    }
}

// ---------------------------------------------------------------------
// Tabelle
// ---------------------------------------------------------------------
function renderStatsTable() {
    const key = statsEl('stats-sort-key').value;
    const dir = statsEl('stats-sort-dir').dataset.dir || 'desc';
    const metric = STAT_METRICS.find(m => m.key === key) || STAT_METRICS[0];
    const rows = tributes.map(t => ({
        name: t.name,
        color: t.color,
        alive: t.alive,
        values: Object.fromEntries(STAT_METRICS.map(m => [m.key, m.get(t)]))
    }));
    rows.sort((a, b) => dir === 'asc' ? a.values[metric.key] - b.values[metric.key] : b.values[metric.key] - a.values[metric.key]);
    const tbody = statsEl('stats-table').querySelector('tbody');
    tbody.innerHTML = rows.map(r => `
        <tr style="opacity:${r.alive ? 1 : 0.5}">
            <td style="color:${r.color};font-weight:bold;">${escapeHtml(r.name)}${r.alive ? '' : ' ☠️'}</td>
            <td>${r.values.damageDealt}</td>
            <td>${r.values.damageTaken}</td>
            <td>${r.values.distanceMoved}</td>
            <td>${r.values.kills}</td>
            <td>${r.values.survival}</td>
        </tr>`).join('');
}

// ---------------------------------------------------------------------
// Balkendiagramm
// ---------------------------------------------------------------------
function renderStatsBars() {
    const canvas = statsEl('stats-bars-canvas');
    const metric = STAT_METRICS.find(m => m.key === statsView.barKey) || STAT_METRICS[0];
    const rows = tributes.map(t => ({
        tribute: t,
        value: metric.get(t)
    })).sort((a, b) => b.value - a.value);
    statsView.barRows = rows;

    const rowH = 26,
        pad = 8;
    const cssW = Math.max(320, canvas.parentElement.clientWidth || 600);
    const cssH = rows.length * rowH + pad * 2;
    const g = fitStatsCanvas(canvas, cssW, cssH);
    g.clearRect(0, 0, cssW, cssH);

    const labelW = Math.min(160, cssW * 0.3),
        valueW = 56;
    const barX = labelW + 12;
    const barMax = Math.max(40, cssW - barX - valueW - 8);
    const max = Math.max(1, ...rows.map(r => r.value));
    const progress = Math.min(1, (performance.now() - statsView.barAnimStart) / 450);
    const eased = 1 - Math.pow(1 - progress, 3);

    g.font = '600 13px "DM Sans", system-ui, sans-serif';
    g.textBaseline = 'middle';
    rows.forEach((r, i) => {
        const y = pad + i * rowH;
        const t = r.tribute;
        g.globalAlpha = t.alive ? 1 : 0.5;
        if (i === statsView.barHover) {
            g.fillStyle = 'rgba(219, 178, 11, 0.16)';
            g.fillRect(0, y, cssW, rowH);
        }
        // Name (gekürzt)
        let label = t.name + (t.alive ? '' : ' ☠');
        g.textAlign = 'left';
        while (label.length > 1 && g.measureText(label).width > labelW) label = label.slice(0, -2) + '…';
        g.fillStyle = t.color;
        g.fillText(label, 6, y + rowH / 2);
        // Balken
        const w = Math.max(r.value > 0 ? 2 : 0, barMax * (r.value / max) * eased);
        g.fillStyle = 'rgba(255, 255, 255, 0.06)';
        g.fillRect(barX, y + 5, barMax, rowH - 10);
        g.fillStyle = t.color;
        g.fillRect(barX, y + 5, w, rowH - 10);
        g.fillStyle = 'rgba(255, 255, 255, 0.22)';
        g.fillRect(barX, y + 5, w, (rowH - 10) / 2.5);
        // Wert
        g.fillStyle = '#ede9b4';
        g.textAlign = 'left';
        g.fillText(String(r.value), barX + w + 8, y + rowH / 2);
    });
    g.globalAlpha = 1;
    if (progress < 1) requestAnimationFrame(() => {
        if (statsView.tab === 'bars' && !statsView.collapsed) renderStatsBars();
    });
}

function onBarsHover(e) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const index = Math.floor((e.clientY - rect.top - 8) / 26);
    const row = statsView.barRows[index];
    const tip = statsEl('stats-tip');
    if (!row) {
        statsView.barHover = -1;
        tip.hidden = true;
        return;
    }
    const metric = STAT_METRICS.find(m => m.key === statsView.barKey);
    const changed = statsView.barHover !== index;
    statsView.barHover = index;
    tip.hidden = false;
    tip.innerHTML = `<b style="color:${row.tribute.color}">${escapeHtml(row.tribute.name)}</b><br>${metric.label}: ${row.value}<br>${I18N.t('stats.tipRank', { rank: index + 1, total: statsView.barRows.length })}`;
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
    if (changed) renderStatsBars();
}

// ---------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------
function refreshTributeSelect(select, current) {
    const signature = tributes.map(t => `${t.id}:${t.name}`).join('|');
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    select.innerHTML = `<option value="all">${I18N.t('common.all')}</option>` + tributes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    select.value = current;
    if (select.value !== current) select.value = 'all';
}

// Glättet ein Feld mit einem Boxfilter (waagerecht + senkrecht, laufende Summe)
function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const size = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        let sum = 0;
        for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = sum / size;
            sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = sum / size;
            sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
    return out;
}

function computeHeat(layer, tributeId) {
    let field = new Float32Array(WIDTH * HEIGHT);
    const add = (x, y, v) => {
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) field[y * WIDTH + x] += v;
    };
    const wanted = id => tributeId === 'all' || String(id) === tributeId;
    if (layer === 'visits') {
        tributes.forEach(t => {
            const path = SimStats.getPath(t.id);
            if (!path || !wanted(t.id)) return;
            for (let i = 0; i < path.length; i += 2) add(path[i], path[i + 1], 1);
        });
    } else if (layer === 'damage') {
        SimStats.hits.forEach(h => {
            if (tributeId === 'all' || String(h.srcId) === tributeId) add(h.x, h.y, h.amount);
        });
    } else {
        SimStats.deaths.forEach(d => add(d.x, d.y, 1));
    }
    const radius = HEAT_LAYERS[layer].blur;
    field = boxBlur(boxBlur(field, WIDTH, HEIGHT, radius), WIDTH, HEIGHT, radius);
    return field;
}

function renderStatsHeat() {
    const canvas = statsEl('stats-heat-canvas');
    refreshTributeSelect(statsEl('stats-heat-tribute'), statsView.heatTribute);
    statsEl('stats-heat-tribute').disabled = statsView.heatLayer === 'deaths';
    if (!SimStats.hasData()) {
        drawCanvasMessage(canvas, I18N.t('stats.noData'));
        return;
    }
    const size = Math.min(760, Math.max(280, canvas.parentElement.clientWidth || 600));
    const g = fitStatsCanvas(canvas, size, size);
    const scale = size / WIDTH;

    g.fillStyle = '#120716';
    g.fillRect(0, 0, size, size);
    if (statsView.heatBackground) {
        g.imageSmoothingQuality = 'high';
        g.drawImage(SimStats.getStartTerrain(), 0, 0, size, size);
        g.fillStyle = 'rgba(18, 7, 22, 0.5)';
        g.fillRect(0, 0, size, size);
    }

    const field = computeHeat(statsView.heatLayer, statsView.heatTribute);
    let max = 0;
    for (let i = 0; i < field.length; i++)
        if (field[i] > max) max = field[i];
    if (max > 0) {
        const img = new ImageData(WIDTH, HEIGHT);
        for (let i = 0; i < field.length; i++) {
            const n = Math.pow(field[i] / max, 0.55);
            const li = Math.round(n * 255) * 4;
            img.data[i * 4] = heatLut[li];
            img.data[i * 4 + 1] = heatLut[li + 1];
            img.data[i * 4 + 2] = heatLut[li + 2];
            img.data[i * 4 + 3] = field[i] < max * 0.004 ? 0 : heatLut[li + 3];
        }
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = WIDTH;
        layerCanvas.height = HEIGHT;
        layerCanvas.getContext('2d').putImageData(img, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(layerCanvas, 0, 0, size, size);
    } else {
        g.fillStyle = 'rgba(237, 233, 180, 0.85)';
        g.font = '500 15px "DM Sans", system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(I18N.t('stats.noDataSelection'), size / 2, size / 2);
    }

    if (statsView.heatDeaths) {
        SimStats.deaths.forEach(d => {
            if (d.x < 0 || d.x >= WIDTH || d.y < 0 || d.y >= HEIGHT) return;
            drawDeathCross(g, (d.x + 0.5) * scale, (d.y + 0.5) * scale, Math.max(3.5, scale * 0.9), d.color);
        });
    }
}

function drawDeathCross(g, cx, cy, r, color) {
    g.save();
    g.lineCap = 'round';
    g.lineWidth = 3.5;
    g.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    g.beginPath();
    g.moveTo(cx - r, cy - r);
    g.lineTo(cx + r, cy + r);
    g.moveTo(cx + r, cy - r);
    g.lineTo(cx - r, cy + r);
    g.stroke();
    g.lineWidth = 1.8;
    g.strokeStyle = color;
    g.stroke();
    g.restore();
}

// ---------------------------------------------------------------------
// Laufpfade
// ---------------------------------------------------------------------
// Lebte der Tribut zum Zeitpunkt tick noch? (Wer in diesem Zeitpunkt stirbt, zählt nicht mehr als lebend.)
function isAliveAtTick(tribute, tick) {
    const died = SimStats.getDeathTick(tribute.id);
    return died === undefined || died > tick;
}

function buildPathChips(limit) {
    if (statsView.pathSelection === null) statsView.pathSelection = new Set(tributes.map(t => t.id));
    const gone = new Set(statsView.pathAliveOnly && SimStats.hasData() ? tributes.filter(t => !isAliveAtTick(t, limit)).map(t => t.id) : []);
    const signature = tributes.map(t => `${t.id}:${t.name}:${t.color}`).join('|') + [...statsView.pathSelection].join(',') + '#' + [...gone].join(',');
    if (signature === statsView.chipSignature) return;
    statsView.chipSignature = signature;
    const holder = statsEl('stats-path-chips');
    holder.innerHTML = '';
    tributes.forEach(t => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'path-chip' + (statsView.pathSelection.has(t.id) ? ' on' : '') + (gone.has(t.id) ? ' gone' : '');
        chip.style.setProperty('--chip', t.color);
        chip.innerHTML = `<i></i>${escapeHtml(t.name)}`;
        chip.addEventListener('click', () => {
            if (statsView.pathSelection.has(t.id)) statsView.pathSelection.delete(t.id);
            else statsView.pathSelection.add(t.id);
            statsView.chipSignature = '';
            renderStats();
        });
        holder.appendChild(chip);
    });
}

function renderStatsPaths() {
    const canvas = statsEl('stats-path-canvas');
    const slider = statsEl('stats-path-tick');
    const maxTick = SimStats.maxTick();
    slider.max = String(maxTick);
    const limit = statsView.pathTick === null ? maxTick : Math.min(statsView.pathTick, maxTick);
    buildPathChips(limit);
    slider.value = String(limit);
    statsEl('stats-path-tick-label').textContent = SimStats.hasData() ? I18N.t('stats.pathTime', { time: formatGameTime(limit), max: maxTick }) : '';
    if (!SimStats.hasData()) {
        drawCanvasMessage(canvas, I18N.t('stats.noData'));
        return;
    }
    const size = Math.min(760, Math.max(280, canvas.parentElement.clientWidth || 600));
    const g = fitStatsCanvas(canvas, size, size);
    const scale = size / WIDTH;

    g.fillStyle = '#120716';
    g.fillRect(0, 0, size, size);
    g.imageSmoothingQuality = 'high';
    g.drawImage(SimStats.getStartTerrain(), 0, 0, size, size);
    g.fillStyle = 'rgba(18, 7, 22, 0.22)';
    g.fillRect(0, 0, size, size);

    const selected = tributes.filter(t => statsView.pathSelection.has(t.id) && (!statsView.pathAliveOnly || isAliveAtTick(t, limit)));
    // Halbtransparent und Strecke für Strecke: Überlagerungen werden kräftiger.
    // Gerade Läufe werden zu einer Linie zusammengefasst (schneller, gleiches Bild).
    g.lineCap = 'butt';
    g.lineWidth = Math.max(2.2, scale * 0.7);
    g.globalAlpha = 0.35;
    selected.forEach(t => {
        const path = SimStats.getPath(t.id);
        if (!path) return;
        const last = Math.min(path.length / 2 - 1, limit);
        g.strokeStyle = t.color;
        let runStartX = path[0],
            runStartY = path[1];
        let prevX = runStartX,
            prevY = runStartY;
        let dirX = 0,
            dirY = 0;
        const flush = () => {
            if (runStartX === prevX && runStartY === prevY) return;
            g.beginPath();
            g.moveTo((runStartX + 0.5) * scale, (runStartY + 0.5) * scale);
            g.lineTo((prevX + 0.5) * scale, (prevY + 0.5) * scale);
            g.stroke();
        };
        for (let i = 1; i <= last; i++) {
            const x = path[i * 2],
                y = path[i * 2 + 1];
            const sx = Math.sign(x - prevX),
                sy = Math.sign(y - prevY);
            if (sx === 0 && sy === 0) continue;
            if (!(sx === dirX && sy === dirY && Math.abs(x - prevX) <= 1 && Math.abs(y - prevY) <= 1)) {
                flush();
                runStartX = prevX;
                runStartY = prevY;
                dirX = sx;
                dirY = sy;
            }
            prevX = x;
            prevY = y;
        }
        flush();
    });
    g.globalAlpha = 1;

    if (statsView.pathMarkers) {
        const r = Math.max(3.5, scale * 0.9);
        selected.forEach(t => {
            const path = SimStats.getPath(t.id);
            if (!path) return;
            const last = Math.min(path.length / 2 - 1, limit);
            // Start: Ring
            g.beginPath();
            g.arc((path[0] + 0.5) * scale, (path[1] + 0.5) * scale, r, 0, Math.PI * 2);
            g.fillStyle = '#120716';
            g.fill();
            g.lineWidth = 2;
            g.strokeStyle = t.color;
            g.stroke();
            // Ende: Kreuz (gestorben) oder gefüllter Punkt
            const ex = (path[last * 2] + 0.5) * scale,
                ey = (path[last * 2 + 1] + 0.5) * scale;
            const deathTick = SimStats.getDeathTick(t.id);
            if (deathTick !== undefined && last >= path.length / 2 - 1) {
                drawDeathCross(g, ex, ey, r, t.color);
            } else {
                g.beginPath();
                g.arc(ex, ey, r, 0, Math.PI * 2);
                g.fillStyle = t.color;
                g.fill();
                g.lineWidth = 2;
                g.strokeStyle = '#fff';
                g.stroke();
            }
            if (selected.length <= 4) {
                g.font = '700 13px "DM Sans", system-ui, sans-serif';
                g.textAlign = 'left';
                g.textBaseline = 'middle';
                g.lineWidth = 3;
                g.strokeStyle = 'rgba(15, 5, 20, 0.85)';
                g.strokeText(t.name, ex + r + 4, ey);
                g.fillStyle = t.color;
                g.fillText(t.name, ex + r + 4, ey);
            }
        });
    }
}

// ---------------------------------------------------------------------
// Siegerpodest (nach Spielende)
// ---------------------------------------------------------------------
const PODIUM_SLOT_ORDER = [2, 1, 3]; // links Silber, Mitte Gold, rechts Bronze

function buildPodiumFigure(tribute, size) {
    const canvas = document.createElement('canvas');
    canvas.className = 'podium-figure';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', tribute.name);
    const g = fitStatsCanvas(canvas, size, size);
    // Dieselbe Figur wie in der Arena, die Augen schauen nach vorn (unten)
    Renderer.drawFigure(g, size * 0.45, size * 0.46, size * 0.3, tribute, Math.max(1.5, size * 0.035), {
        dx: 0,
        dy: 1
    });
    return canvas;
}

function buildPodiumPlaque(entry) {
    const plaque = document.createElement('div');
    plaque.className = 'podium-plaque';
    plaque.style.setProperty('--tribute', entry.tribute.color);
    const kills = I18N.t('stats.kill', { n: entry.kills });
    let fate = '';
    if (entry.survived) fate = `👑 ${I18N.t('stats.survived')}`;
    else if (entry.cause) fate = `☠️ ${escapeHtml(entry.cause)}`;
    plaque.innerHTML = `<b>${escapeHtml(entry.tribute.name)}</b><span>⚔️ ${kills}</span>${fate ? `<span>${fate}</span>` : ''}`;
    return plaque;
}

function renderStatsPodium() {
    const holder = statsEl('stats-podium');
    if (!SimStats.isFinished()) {
        if (statsView.podiumSignature !== 'waiting') {
            statsView.podiumSignature = 'waiting';
            holder.innerHTML = `<p class="stats-hint">${I18N.t('stats.podiumWaiting')}</p>`;
        }
        return;
    }
    const podium = SimStats.getPodium();
    // Nur neu aufbauen, wenn sich etwas geändert hat (sonst startet die Animation bei jedem Update neu)
    const signature = JSON.stringify(podium.map(group => [group.place, group.members.map(m => [m.tribute.id, m.tribute.name, m.tribute.color, m.kills, m.survived, m.cause])]));
    if (statsView.podiumSignature === signature) return;
    statsView.podiumSignature = signature;

    const byPlace = new Map(podium.map(group => [group.place, group.members]));
    const stage = document.createElement('div');
    stage.className = 'podium';
    PODIUM_SLOT_ORDER.forEach(place => {
        const members = byPlace.get(place) || [];
        const column = document.createElement('div');
        column.className = `podium-col place-${place}${members.length ? '' : ' empty'}`;

        const figures = document.createElement('div');
        figures.className = 'podium-figures';
        members.forEach(m => figures.appendChild(buildPodiumFigure(m.tribute, place === 1 ? 72 : 60)));

        const step = document.createElement('div');
        step.className = 'podium-step';
        step.innerHTML = `<span class="podium-place">${place}</span>`;
        if (members.length > 1) step.insertAdjacentHTML('beforeend', `<small class="podium-note">${I18N.t('stats.podiumShared')}</small>`);
        if (!members.length) step.insertAdjacentHTML('beforeend', `<small class="podium-note">${I18N.t('stats.podiumTie')}</small>`);
        members.forEach(m => step.appendChild(buildPodiumPlaque(m)));

        column.append(figures, step);
        stage.appendChild(column);
    });
    holder.innerHTML = '';
    holder.appendChild(stage);
}

// Am Spielende automatisch zum Podest wechseln (die Statistik-Daten sind dann vollständig)
SimEvents.on('simEnd', () => {
    statsView.tab = 'podium';
    statsView.podiumSignature = '';
    if (!statsView.ready) return;
    applyStatsTab();
    updateStatsTable();
});

// Sprachwechsel: Beschriftungen setzt I18N.apply, hier folgt nur, was per Script erzeugt wird
I18N.onChange(() => {
    if (!statsView.ready) return;
    statsView.chipSignature = '';
    statsView.podiumSignature = '';
    const heatSelect = statsEl('stats-heat-tribute');
    if (heatSelect) delete heatSelect.dataset.signature;
    applyStatsCollapsed();
    renderStats();
});

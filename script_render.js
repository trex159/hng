/* =====================================================================
 * Renderer
 *
 * Zeichnet die Arena in beliebig viele Ziele (kleine Vorschau, Vollbild).
 *
 * Gelände
 *   Pro Feldtyp gibt es drei kompatible 16x16-Texturen (Variante a, b, c),
 *   die je Feld per Hash gewählt werden. Die Texturen sind Graustufen:
 *   50 % Grau lässt die Biomfarbe unverändert, hellere Pixel hellen auf,
 *   dunklere dunkeln ab (Overlay-Überblendung).
 *
 *   Dateien:  textures/<typ>_<variante>.png
 *             typ = grass | water | lava | forest | rock | trap
 *             variante = a | b | c        z. B. textures/grass_b.png
 *
 *   Fehlt eine Datei, wird eine eingebaute Prozedural-Textur verwendet.
 *   Das gesamte Gelände liegt als Cache-Canvas vor (16 px je Feld) und wird
 *   nur dort neu gemalt, wo sich ein Feld geändert hat (z. B. Lava-Ring).
 *
 * Bewegung
 *   Tribute und Tiere springen logisch von Feld zu Feld; gezeichnet wird
 *   eine weich nachlaufende Anzeigeposition.
 * ===================================================================== */

const Renderer = (() => {
    const CACHE_TILE = 16;
    const TEXTURE_DIR = 'textures/';
    const VARIANTS = ['a', 'b', 'c'];
    const TYPES = ['grass', 'water', 'lava', 'forest', 'rock', 'trap'];
    const TYPE_CODE = Object.fromEntries(TYPES.map((t, i) => [t, i]));
    const LAVA = TYPE_CODE.lava;
    const NONE = 255;
    // Grundfarben (Overlay-Ziel der Graustufen-Texturen)
    const BASE_COLOR = {
        grass: '#65c158',
        water: '#3872ac',
        lava: '#da3919',
        forest: '#28532e',
        rock: '#7b7b7b',
        trap: '#9a520e'
    };
    // "Höhe" der Felder: bestimmt, welche Seite einer Kante Schatten bzw. Licht bekommt
    const RANK = [2, 0, 1, 3, 4, 2];

    const atlas = TYPES.map(() => [null, null, null]); // getönte 16x16-Kacheln
    const proceduralTex = TYPES.map(() => [null, null, null]);
    const userTex = TYPES.map(() => [null, null, null]);

    let terrain = null; // Cache-Canvas des ganzen Geländes
    let terrainCtx = null;
    let rendered = null; // Typcodes, die im Cache aktuell gemalt sind
    let repaintMark = null;
    let allDirty = true;

    const targets = [];
    let previewTarget = null;
    let needsDraw = true;
    let lastFrame = performance.now();
    const displayPos = new WeakMap();

    const options = {
        names: false,
        healthBars: false,
        numbers: false,
        grid: false
    };

    // ---------------------------------------------------------------
    // Texturen
    // ---------------------------------------------------------------
    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }

    function seededRandom(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), s | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Eingebaute Graustufen-Textur (nahtlos: Elemente werden umlaufend gezeichnet)
    function makeProceduralTexture(code, variant) {
        const S = CACHE_TILE;
        const c = makeCanvas(S, S);
        const g = c.getContext('2d');
        const rnd = seededRandom(code * 101 + variant * 7919 + 13);
        const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
        const gray = (v, a = 1) => `rgba(${v},${v},${v},${a})`;
        const put = (x, y, w, h, v, a = 1) => {
            g.fillStyle = gray(v, a);
            for (let ox = -S; ox <= S; ox += S)
                for (let oy = -S; oy <= S; oy += S) g.fillRect(x + ox, y + oy, w, h);
        };
        g.fillStyle = gray(128);
        g.fillRect(0, 0, S, S);

        switch (TYPES[code]) {
            case 'grass':
                for (let i = 0; i < 26; i++) put(ri(0, S - 1), ri(0, S - 1), 1, 1, ri(96, 114));
                for (let i = 0; i < 14; i++) put(ri(0, S - 1), ri(0, S - 1), 1, 1, ri(146, 168));
                for (let i = 0; i < 6; i++) {
                    const x = ri(0, S - 1),
                        y = ri(0, S - 1);
                    put(x, y, 1, 2, 160);
                    put(x, y + 2, 1, 1, 110);
                }
                break;
            case 'water':
                put(0, 0, S, S, 120, 0.5);
                for (let i = 0; i < 4; i++) put(ri(0, S - 1), ri(0, S - 1), ri(4, 8), 1, ri(168, 196));
                for (let i = 0; i < 6; i++) put(ri(0, S - 1), ri(0, S - 1), ri(2, 4), 1, ri(92, 110));
                break;
            case 'lava':
                for (let i = 0; i < 5; i++) put(ri(0, S - 3), ri(0, S - 3), ri(3, 5), ri(2, 4), ri(176, 205));
                for (let i = 0; i < 5; i++) put(ri(0, S - 1), ri(0, S - 1), ri(3, 6), 1, ri(52, 80));
                for (let i = 0; i < 8; i++) put(ri(0, S - 1), ri(0, S - 1), 1, 1, 225);
                break;
            case 'forest':
                for (let i = 0; i < 4; i++) {
                    const x = ri(0, S - 1),
                        y = ri(0, S - 1),
                        r = ri(3, 5);
                    put(x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1, ri(84, 100));
                    put(x - r + 2, y - r + 2, r, r, ri(138, 156));
                }
                for (let i = 0; i < 14; i++) put(ri(0, S - 1), ri(0, S - 1), 1, 1, ri(64, 84));
                break;
            case 'rock':
                for (let i = 0; i < 5; i++) put(ri(0, S - 4), ri(0, S - 3), ri(3, 6), ri(2, 4), ri(146, 170));
                for (let i = 0; i < 5; i++) put(ri(0, S - 4), ri(0, S - 3), ri(3, 6), ri(2, 3), ri(88, 108));
                for (let i = 0, x = ri(0, S - 1), y = ri(0, S - 1); i < 7; i++) {
                    put(x, y, 1, 1, 70);
                    x += ri(0, 1);
                    y += ri(0, 1);
                }
                break;
            case 'trap':
                for (let y = 0; y < S; y += 4) {
                    put(0, y, S, 3, ri(122, 142));
                    put(0, y + 3, S, 1, 82);
                }
                for (let i = 0; i < 4; i++) put(ri(1, S - 2), ri(0, 3) * 4 + 1, 1, 1, 178);
                break;
        }
        return c;
    }

    function buildAtlasSlot(code, variant) {
        const src = userTex[code][variant] || proceduralTex[code][variant];
        const c = atlas[code][variant] || makeCanvas(CACHE_TILE, CACHE_TILE);
        const g = c.getContext('2d');
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = BASE_COLOR[TYPES[code]];
        g.fillRect(0, 0, CACHE_TILE, CACHE_TILE);
        g.globalCompositeOperation = 'overlay';
        g.imageSmoothingEnabled = false;
        g.drawImage(src, 0, 0, CACHE_TILE, CACHE_TILE);
        g.globalCompositeOperation = 'source-over';
        atlas[code][variant] = c;
    }

    function initAtlas() {
        TYPES.forEach((_, code) => {
            VARIANTS.forEach((_, v) => {
                proceduralTex[code][v] = makeProceduralTexture(code, v);
                buildAtlasSlot(code, v);
            });
        });
        // Eigene Texturen aus dem Ordner "textures" nachladen (fehlende bleiben prozedural).
        // Pro Typ wird zuerst <typ>_a.png geprüft; fehlt sie, entfallen b und c (weniger 404-Meldungen).
        TYPES.forEach((type, code) => {
            const load = (v, onMissing) => {
                const img = new Image();
                img.onload = () => {
                    userTex[code][v] = img;
                    buildAtlasSlot(code, v);
                    allDirty = true;
                    needsDraw = true;
                    if (v === 0) {
                        load(1);
                        load(2);
                    }
                };
                if (onMissing) img.onerror = onMissing;
                img.src = `${TEXTURE_DIR}${type}_${VARIANTS[v]}.png`;
            };
            load(0);
        });
    }

    // ---------------------------------------------------------------
    // Gelände
    // ---------------------------------------------------------------
    function variantAt(x, y) {
        let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return (h >>> 0) % 3;
    }

    function edgeStyle(code, neighbour) {
        if (neighbour === NONE || neighbour === code) return null;
        if (code === LAVA) return 'rgba(255, 214, 90, 0.35)'; // Glut am Rand
        if (neighbour === LAVA) return 'rgba(0, 0, 0, 0.32)'; // verbrannte Erde
        if (RANK[code] < RANK[neighbour]) return 'rgba(0, 0, 0, 0.22)';
        if (RANK[code] > RANK[neighbour]) return 'rgba(255, 255, 255, 0.12)';
        return null;
    }

    // Ein Feld mit Kantenbetonung; px = Kantenlänge in Pixeln
    function drawTile(g, code, x, y, px, up, right, down, left) {
        g.drawImage(atlas[code][variantAt(x, y)], x * px, y * px, px, px);
        const e = Math.max(1, Math.round(px * 0.125));
        let style = edgeStyle(code, up);
        if (style) {
            g.fillStyle = style;
            g.fillRect(x * px, y * px, px, e);
        }
        style = edgeStyle(code, right);
        if (style) {
            g.fillStyle = style;
            g.fillRect(x * px + px - e, y * px, e, px);
        }
        style = edgeStyle(code, down);
        if (style) {
            g.fillStyle = style;
            g.fillRect(x * px, y * px + px - e, px, e);
        }
        style = edgeStyle(code, left);
        if (style) {
            g.fillStyle = style;
            g.fillRect(x * px, y * px, e, px);
        }
    }

    function codeOf(tile) {
        const c = TYPE_CODE[tile];
        return c === undefined ? 0 : c;
    }

    function ensureTerrain() {
        if (terrain) return;
        terrain = makeCanvas(WIDTH * CACHE_TILE, HEIGHT * CACHE_TILE);
        terrainCtx = terrain.getContext('2d');
        terrainCtx.imageSmoothingEnabled = false;
        rendered = new Uint8Array(WIDTH * HEIGHT).fill(NONE);
        repaintMark = new Uint8Array(WIDTH * HEIGHT);
    }

    function paintCached(x, y) {
        const i = y * WIDTH + x;
        drawTile(terrainCtx, rendered[i], x, y, CACHE_TILE,
            y > 0 ? rendered[i - WIDTH] : NONE,
            x < WIDTH - 1 ? rendered[i + 1] : NONE,
            y < HEIGHT - 1 ? rendered[i + WIDTH] : NONE,
            x > 0 ? rendered[i - 1] : NONE);
    }

    // Gleicht den Cache mit dem Raster ab und malt nur geänderte Felder (plus Nachbarn) neu
    function syncTerrain() {
        ensureTerrain();
        if (allDirty) {
            rendered.fill(NONE);
            allDirty = false;
        }
        const todo = [];
        const mark = i => {
            if (repaintMark[i]) return;
            repaintMark[i] = 1;
            todo.push(i);
        };
        for (let y = 0; y < HEIGHT; y++) {
            const row = grid[y];
            for (let x = 0; x < WIDTH; x++) {
                const i = y * WIDTH + x;
                const code = codeOf(row[x]);
                if (code === rendered[i]) continue;
                rendered[i] = code;
                mark(i);
                if (y > 0) mark(i - WIDTH);
                if (y < HEIGHT - 1) mark(i + WIDTH);
                if (x > 0) mark(i - 1);
                if (x < WIDTH - 1) mark(i + 1);
            }
        }
        for (const i of todo) {
            repaintMark[i] = 0;
            paintCached(i % WIDTH, Math.floor(i / WIDTH));
        }
    }

    // Eigenständiges Gelände-Bild für beliebige Raster (z. B. Arena vor dem Endspiel)
    function buildTerrainCanvas(gridData, px = 8) {
        const h = gridData.length,
            w = gridData[0].length;
        const codes = new Uint8Array(w * h);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) codes[y * w + x] = codeOf(gridData[y][x]);
        const c = makeCanvas(w * px, h * px);
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                drawTile(g, codes[i], x, y, px,
                    y > 0 ? codes[i - w] : NONE,
                    x < w - 1 ? codes[i + 1] : NONE,
                    y < h - 1 ? codes[i + w] : NONE,
                    x > 0 ? codes[i - 1] : NONE);
            }
        }
        return c;
    }

    function drawTerrain(c, v) {
        const x1 = v.x0 + v.w / v.ppt;
        const y1 = v.y0 + v.h / v.ppt;
        const ix0 = Math.max(0, v.x0),
            iy0 = Math.max(0, v.y0);
        const ix1 = Math.min(WIDTH, x1),
            iy1 = Math.min(HEIGHT, y1);
        if (ix1 <= ix0 || iy1 <= iy0) return;
        c.imageSmoothingEnabled = v.ppt < CACHE_TILE;
        c.imageSmoothingQuality = 'high';
        c.drawImage(terrain,
            ix0 * CACHE_TILE, iy0 * CACHE_TILE, (ix1 - ix0) * CACHE_TILE, (iy1 - iy0) * CACHE_TILE,
            (ix0 - v.x0) * v.ppt, (iy0 - v.y0) * v.ppt, (ix1 - ix0) * v.ppt, (iy1 - iy0) * v.ppt);
    }

    function drawGridLines(c, v) {
        if (v.ppt < 12) return;
        c.save();
        c.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        c.lineWidth = 1;
        c.beginPath();
        const xStart = Math.max(0, Math.floor(v.x0)),
            xEnd = Math.min(WIDTH, Math.ceil(v.x0 + v.w / v.ppt));
        const yStart = Math.max(0, Math.floor(v.y0)),
            yEnd = Math.min(HEIGHT, Math.ceil(v.y0 + v.h / v.ppt));
        for (let x = xStart; x <= xEnd; x++) {
            const sx = Math.round((x - v.x0) * v.ppt) + 0.5;
            c.moveTo(sx, (yStart - v.y0) * v.ppt);
            c.lineTo(sx, (yEnd - v.y0) * v.ppt);
        }
        for (let y = yStart; y <= yEnd; y++) {
            const sy = Math.round((y - v.y0) * v.ppt) + 0.5;
            c.moveTo((xStart - v.x0) * v.ppt, sy);
            c.lineTo((xEnd - v.x0) * v.ppt, sy);
        }
        c.stroke();
        c.restore();
    }

    // ---------------------------------------------------------------
    // Anzeigepositionen (weiches Nachlaufen)
    // ---------------------------------------------------------------
    function getDisplayPos(entity) {
        let d = displayPos.get(entity);
        if (!d) {
            d = {
                x: entity.x,
                y: entity.y
            };
            displayPos.set(entity, d);
        }
        return d;
    }

    // true, solange sich noch etwas bewegt
    function updateDisplayPositions(dt) {
        const speed = Math.max(1, Number(document.getElementById('speed')?.value) || 5);
        const k = 1 - Math.exp(-dt * Math.max(8, speed * 4));
        let moving = false;
        const step = e => {
            const d = getDisplayPos(e);
            const dx = e.x - d.x,
                dy = e.y - d.y;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                d.x = e.x;
                d.y = e.y;
                return;
            }
            if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) {
                d.x = e.x;
                d.y = e.y;
                return;
            }
            d.x += dx * k;
            d.y += dy * k;
            moving = true;
        };
        tributes.forEach(t => {
            if (t.alive) step(t);
        });
        animals.forEach(a => {
            if (a.alive) step(a);
        });
        return moving;
    }

    // ---------------------------------------------------------------
    // Figuren
    // ---------------------------------------------------------------
    function shade(hex, amount) {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        const f = c => Math.max(0, Math.min(255, Math.round(c + amount * (amount < 0 ? c : 255 - c))));
        return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
    }

    function headingOf(t) {
        const m = t.lastMove || {};
        return {
            dx: Math.sign(m.dx || 0),
            dy: Math.sign(m.dy || 0)
        };
    }

    // Rundfigur eines Tributs: Schatten, Körper, Augen, Waffe. Mittelpunkt (cx, cy), Radius r.
    // facing: Blickrichtung {dx, dy}; Standard ist die letzte Bewegung (im Stand schauen die Augen nach unten).
    function drawFigure(c, cx, cy, r, t, lineWidth, facing = headingOf(t)) {
        // Schatten
        c.fillStyle = 'rgba(0, 0, 0, 0.3)';
        c.beginPath();
        c.ellipse(cx, cy + r * 0.85, r * 0.95, r * 0.38, 0, 0, Math.PI * 2);
        c.fill();
        // Körper
        const body = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
        body.addColorStop(0, shade(t.color, 0.45));
        body.addColorStop(0.6, t.color);
        body.addColorStop(1, shade(t.color, -0.35));
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fillStyle = body;
        c.fill();
        c.lineWidth = lineWidth;
        c.strokeStyle = 'rgba(15, 5, 20, 0.9)';
        c.stroke();
        // Augen in Blickrichtung (im Stand schauen sie nach unten)
        let hx = facing.dx,
            hy = facing.dy;
        if (!hx && !hy) hy = 1;
        const hl = Math.hypot(hx, hy);
        hx /= hl;
        hy /= hl;
        const ox = hx * r * 0.32,
            oy = hy * r * 0.32;
        const sx = -hy * r * 0.3,
            sy = hx * r * 0.3;
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(cx + ox - sx, cy + oy - sy, r * 0.17, 0, Math.PI * 2);
        c.arc(cx + ox + sx, cy + oy + sy, r * 0.17, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#10051a';
        c.beginPath();
        c.arc(cx + ox * 1.3 - sx, cy + oy * 1.3 - sy, r * 0.08, 0, Math.PI * 2);
        c.arc(cx + ox * 1.3 + sx, cy + oy * 1.3 + sy, r * 0.08, 0, Math.PI * 2);
        c.fill();
        // Waffe
        if (t.weapon) {
            c.fillStyle = '#c9fdff';
            c.fillRect(cx + r * 0.7, cy - r * 0.15, r * 0.5, r * 0.3);
        }
    }

    function drawWeapons(c, v, time) {
        weapons.forEach(w => {
            const sx = (w.x - v.x0) * v.ppt,
                sy = (w.y - v.y0) * v.ppt;
            if (sx < -v.ppt || sy < -v.ppt || sx > v.w || sy > v.h) return;
            if (v.ppt < 8) {
                c.fillStyle = '#03FAFF';
                c.fillRect(sx + 1, sy + 1, v.ppt - 2, v.ppt - 2);
                return;
            }
            const cx = sx + v.ppt / 2,
                cy = sy + v.ppt / 2;
            const pulse = 0.6 + 0.4 * Math.sin(time / 260 + w.x * 1.7 + w.y);
            const glow = c.createRadialGradient(cx, cy, 0, cx, cy, v.ppt * 0.9);
            glow.addColorStop(0, `rgba(3, 250, 255, ${0.55 * pulse})`);
            glow.addColorStop(1, 'rgba(3, 250, 255, 0)');
            c.fillStyle = glow;
            c.fillRect(cx - v.ppt, cy - v.ppt, v.ppt * 2, v.ppt * 2);
            const r = v.ppt * 0.28;
            c.beginPath();
            c.moveTo(cx, cy - r * 1.3);
            c.lineTo(cx + r, cy);
            c.lineTo(cx, cy + r * 1.3);
            c.lineTo(cx - r, cy);
            c.closePath();
            c.fillStyle = '#c9fdff';
            c.fill();
            c.lineWidth = Math.max(1, v.ppt * 0.06);
            c.strokeStyle = '#0a8f94';
            c.stroke();
        });
    }

    function drawGraves(c, v) {
        tributes.forEach(t => {
            if (t.alive || typeof t.x !== 'number') return;
            const cx = (t.x + 0.5 - v.x0) * v.ppt,
                cy = (t.y + 0.5 - v.y0) * v.ppt;
            if (cx < -v.ppt || cy < -v.ppt || cx > v.w + v.ppt || cy > v.h + v.ppt) return;
            const r = v.ppt * 0.28;
            c.save();
            c.globalAlpha = 0.8;
            c.lineCap = 'round';
            c.lineWidth = Math.max(2, v.ppt * 0.1);
            c.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            c.beginPath();
            c.moveTo(cx - r, cy - r);
            c.lineTo(cx + r, cy + r);
            c.moveTo(cx + r, cy - r);
            c.lineTo(cx - r, cy + r);
            c.stroke();
            c.lineWidth = Math.max(1, v.ppt * 0.05);
            c.strokeStyle = t.color;
            c.stroke();
            c.restore();
        });
    }

    function drawAnimals(c, v) {
        animals.forEach(a => {
            if (!a.alive) return;
            const d = getDisplayPos(a);
            if (v.ppt < 8) {
                c.fillStyle = '#FF4500';
                const sx = Math.round((d.x - v.x0) * v.ppt),
                    sy = Math.round((d.y - v.y0) * v.ppt);
                c.fillRect(sx, sy, v.ppt, v.ppt);
                c.strokeStyle = '#000';
                c.lineWidth = 1;
                c.strokeRect(sx + 0.5, sy + 0.5, v.ppt - 1, v.ppt - 1);
                return;
            }
            const cx = (d.x + 0.5 - v.x0) * v.ppt,
                cy = (d.y + 0.5 - v.y0) * v.ppt;
            if (cx < -v.ppt || cy < -v.ppt || cx > v.w + v.ppt || cy > v.h + v.ppt) return;
            const r = v.ppt * 0.44;
            c.fillStyle = 'rgba(0, 0, 0, 0.25)';
            c.beginPath();
            c.ellipse(cx, cy + r * 0.8, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
            c.fill();
            c.beginPath();
            c.moveTo(cx, cy - r);
            c.lineTo(cx + r, cy);
            c.lineTo(cx, cy + r);
            c.lineTo(cx - r, cy);
            c.closePath();
            c.fillStyle = '#ff5a1f';
            c.fill();
            c.lineWidth = Math.max(1.5, v.ppt * 0.07);
            c.strokeStyle = '#4a1304';
            c.stroke();
            c.fillStyle = '#fff3c4';
            const eye = r * 0.16;
            c.beginPath();
            c.arc(cx - r * 0.28, cy - r * 0.1, eye, 0, Math.PI * 2);
            c.arc(cx + r * 0.28, cy - r * 0.1, eye, 0, Math.PI * 2);
            c.fill();
        });
    }

    function drawTributes(c, v, o) {
        tributes.forEach(t => {
            if (!t.alive) return;
            const d = getDisplayPos(t);
            if (v.ppt < 8) {
                const sx = Math.round((d.x - v.x0) * v.ppt),
                    sy = Math.round((d.y - v.y0) * v.ppt);
                c.fillStyle = t.color;
                c.fillRect(sx, sy, v.ppt, v.ppt);
                c.strokeStyle = '#000';
                c.lineWidth = 1;
                c.strokeRect(sx + 0.5, sy + 0.5, v.ppt - 1, v.ppt - 1);
                return;
            }
            const cx = (d.x + 0.5 - v.x0) * v.ppt,
                cy = (d.y + 0.5 - v.y0) * v.ppt;
            if (cx < -v.ppt * 2 || cy < -v.ppt * 2 || cx > v.w + v.ppt * 2 || cy > v.h + v.ppt * 2) return;
            const r = v.ppt * 0.38;
            drawFigure(c, cx, cy, r, t, Math.max(1.5, v.ppt * 0.07));
            // Auswahlring
            if (o.highlightId === t.id) {
                c.lineWidth = Math.max(2, v.ppt * 0.08);
                c.strokeStyle = '#fcff40';
                c.beginPath();
                c.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
                c.stroke();
            }
        });
    }

    function roundedRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    function drawLabels(c, v, o) {
        if (v.ppt < 8 || (!o.names && !o.healthBars)) return;
        const fontSize = Math.max(10, Math.min(15, v.ppt * 0.5));
        c.font = `700 ${fontSize}px "DM Sans", system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        tributes.forEach(t => {
            if (!t.alive) return;
            const d = getDisplayPos(t);
            const cx = (d.x + 0.5 - v.x0) * v.ppt;
            let top = (d.y + 0.5 - v.y0) * v.ppt - v.ppt * 0.38 - 4;
            if (cx < -100 || top < -40 || cx > v.w + 100 || top > v.h + 40) return;
            if (o.healthBars) {
                const bw = Math.max(18, v.ppt * 0.95),
                    bh = Math.max(3, v.ppt * 0.11);
                const ratio = Math.max(0, Math.min(1, t.health / MAX_HEALTH));
                c.fillStyle = 'rgba(10, 2, 14, 0.75)';
                c.fillRect(cx - bw / 2 - 1, top - bh - 1, bw + 2, bh + 2);
                c.fillStyle = ratio > 0.5 ? '#63b35e' : ratio > 0.25 ? '#ed9251' : '#e0573f';
                c.fillRect(cx - bw / 2, top - bh, bw * ratio, bh);
                top -= bh + 4;
            }
            if (o.names) {
                const text = t.name;
                const w = c.measureText(text).width + 14;
                const h = fontSize + 6;
                roundedRect(c, cx - w / 2, top - h, w, h, h / 2);
                c.fillStyle = 'rgba(27, 11, 35, 0.78)';
                c.fill();
                c.lineWidth = 1.5;
                c.strokeStyle = t.color;
                c.stroke();
                c.fillStyle = '#ede9b4';
                c.fillText(text, cx, top - h / 2 + 1);
            }
        });
    }

    // ---------------------------------------------------------------
    // Ein Ziel zeichnen
    // ---------------------------------------------------------------
    // v = { x0, y0 (oben links, in Feldern), ppt (Pixel pro Feld), w, h (Zeichenfläche in Pixeln) }
    function drawView(c, v, o, time) {
        c.save();
        c.fillStyle = '#120716';
        c.fillRect(0, 0, v.w, v.h);
        drawTerrain(c, v);
        if (o.grid) drawGridLines(c, v);
        drawWeapons(c, v, time);
        drawGraves(c, v);
        drawAnimals(c, v);
        drawTributes(c, v, o);
        if (typeof Fx !== 'undefined') Fx.draw(c, v, o);
        drawLabels(c, v, o);
        drawWeatherOverlay(c, v.w, v.h, time);
        c.restore();
    }

    // ---------------------------------------------------------------
    // Frame-Schleife
    // ---------------------------------------------------------------
    function ensurePreviewTarget() {
        if (previewTarget) return;
        previewTarget = {
            canvas,
            ctx,
            dpr: 1,
            minInterval: 0,
            options: {
                names: false,
                healthBars: false,
                numbers: false,
                grid: false
            },
            getView: () => ({
                x0: 0,
                y0: 0,
                ppt: canvas.width / WIDTH,
                w: canvas.width,
                h: canvas.height
            })
        };
        targets.push(previewTarget);
    }

    function frame(now) {
        requestAnimationFrame(frame);
        // script.js (definiert drawGrid) ist noch nicht vollständig geladen
        if (typeof drawGrid !== 'function') return;
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        ensurePreviewTarget();
        const moving = updateDisplayPositions(dt);
        const fxActive = typeof Fx !== 'undefined' && Fx.update(dt);
        const weatherActive = currentWeather !== 'clear';
        let synced = false;
        targets.forEach(t => {
            if (t.update) t.update(dt);
            const due = now - (t.lastDraw || 0) >= (t.minInterval || 0);
            const wanted = t.always || needsDraw || moving || fxActive || (weatherActive && t === previewTarget && now - (t.lastDraw || 0) > 50);
            if (!wanted || !due) return;
            if (!synced) {
                syncTerrain();
                synced = true;
            }
            t.lastDraw = now;
            const v = t.getView();
            t.ctx.setTransform(t.dpr, 0, 0, t.dpr, 0, 0);
            drawView(t.ctx, v, Object.assign({}, options, t.options), now);
            if (t.after) t.after(v);
        });
        needsDraw = false;
    }

    function init() {
        initAtlas();
        requestAnimationFrame(frame);
    }
    init();

    return {
        options,
        requestDraw() {
            needsDraw = true;
        },
        addTarget(t) {
            if (!targets.includes(t)) targets.push(t);
        },
        removeTarget(t) {
            const i = targets.indexOf(t);
            if (i >= 0) targets.splice(i, 1);
        },
        getDisplayPos,
        drawFigure,
        getTerrainCanvas() {
            syncTerrain();
            return terrain;
        },
        buildTerrainCanvas,
        CACHE_TILE
    };
})();

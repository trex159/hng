/* =====================================================================
 * Arena-Generierung
 *
 * Die Arena ist doppelt so groß wie früher (siehe ARENA_SIZE in script.js).
 * Anzahl und Größe der Landschaftselemente werden mit arenaScale()
 * mitskaliert, damit die Arena nicht dünn besiedelt wirkt.
 * ===================================================================== */
// Faktor gegenüber der ursprünglichen 100x100-Arena
function arenaScale() {
    return WIDTH / LEGACY_ARENA_SIZE;
}
// --- Seedable Random & Perlin Noise ---
let arenaSeed = null;
let _arenaRandState = 1;

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
    let xf = Math.floor(x),
        yf = Math.floor(y);
    let tl = hash(xf * 49632 + yf * 325176);
    let tr = hash((xf + 1) * 49632 + yf * 325176);
    let bl = hash(xf * 49632 + (yf + 1) * 325176);
    let br = hash((xf + 1) * 49632 + (yf + 1) * 325176);
    let u = x - xf,
        v = y - yf;

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }
    let top = lerp(tl, tr, u);
    let bot = lerp(bl, br, u);
    return lerp(top, bot, v);
}
// --- Verbesserte Perlin Noise (mit Oktaven) ---
function perlin2_oct(x, y, seed = 0, oct = 4, persistence = 0.5) {
    let total = 0,
        freq = 1,
        amp = 1,
        max = 0;
    for (let i = 0; i < oct; i++) {
        total += perlin2(x * freq, y * freq, seed + i * 10000) * amp;
        max += amp;
        amp *= persistence;
        freq *= 2;
    }
    return total / max;
}
// --- Wiesen/Wald verbinden und abrunden ---
// Verbindet alle Felder des Materials, die höchstens 3.5 Felder auseinander liegen, mit einer Ellipse.
// Es werden nur die Nachbarn im Umkreis geprüft (statt alle Feldpaare), damit das auch auf der
// großen Arena schnell bleibt.
function connectAreas(material) {
    const snapshot = grid.map(row => row.map(tile => tile === material));
    const reach = 3;
    // Die Ellipse hängt nur vom Versatz (dx, dy) ab -> Masken einmal vorberechnen
    const masks = {};
    for (let dy = 0; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
            if (dy === 0 && dx <= 0) continue;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 3.5) continue;
            masks[`${dx},${dy}`] = ellipseMaskBetween(0, 0, dx, dy, Math.max(1.2, 2.2 - dist * 0.4));
        }
    }
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (!snapshot[y][x]) continue;
            for (const key in masks) {
                const [dx, dy] = key.split(',').map(Number);
                const nx = x + dx,
                    ny = y + dy;
                if (nx < 0 || nx >= WIDTH || ny >= HEIGHT || !snapshot[ny][nx]) continue;
                for (const [ox, oy] of masks[key]) {
                    const px = x + ox,
                        py = y + oy;
                    if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) grid[py][px] = material;
                }
            }
        }
    }
}

function spreadMaterial(materialA, materialB, reach = 4, prob = 16, seed = arenaSeed ?? 1) {
    const snapshot = grid.map(row => [...row]);
    // Deterministischer Zufallszahlengenerator (Mulberry32)
    let state = typeof seed === 'number' ? seed >>> 0 : Array.from(String(seed)).reduce(
        (a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

    function seededRandom() {
        state |= 0;
        state = state + 0x6D2B79F5 | 0;
        let t = state;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    // Alle möglichen Versätze innerhalb des Radius vorberechnen
    const offsets = [];
    for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (Math.sqrt(dx * dx + dy * dy) > reach) continue;
            offsets.push([dx, dy]);
        }
    }
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (snapshot[y][x] !== materialB) continue;
            let foundA = false;
            for (const [dx, dy] of offsets) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
                if (snapshot[ny][nx] === materialA) {
                    foundA = true;
                    break;
                }
            }
            if (foundA && seededRandom() * 100 < prob) {
                grid[y][x] = materialA;
            }
        }
    }
}
// Felder (relativ) einer Ellipse zwischen zwei Punkten
function ellipseMaskBetween(x1, y1, x2, y2, r) {
    const cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2;
    const dx = x2 - x1,
        dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const a = len / 2 + r; // Hauptachse
    const b = r; // Nebenachse
    const cosA = Math.cos(-angle),
        sinA = Math.sin(-angle);
    const cells = [];
    for (let y = Math.floor(cy - b - 1); y <= Math.ceil(cy + b + 1); y++) {
        for (let x = Math.floor(cx - a - 1); x <= Math.ceil(cx + a + 1); x++) {
            // Transformiere Punkt ins Ellipsen-Koordinatensystem
            const tx = (x - cx) * cosA - (y - cy) * sinA;
            const ty = (x - cx) * sinA + (y - cy) * cosA;
            if ((tx * tx) / (a * a) + (ty * ty) / (b * b) <= 1.0) cells.push([x, y]);
        }
    }
    return cells;
}
// Verrauschter Blob (Berge, Baumgruppen, Lichtungen).
// canReplace(tile) schränkt ein, welche Felder überschrieben werden dürfen.
function paintBlob(cx, cy, r, seed, octaves, persistence, threshold, material, canReplace) {
    for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
            const xx = cx + dx,
                yy = cy + dy;
            if (xx < 0 || xx >= WIDTH || yy < 0 || yy >= HEIGHT) continue;
            if (canReplace && !canReplace(grid[yy][xx])) continue;
            const dist = Math.sqrt(dx * dx + dy * dy) / r;
            const n = perlin2_oct(dx / r + 0.5, dy / r + 0.5, seed, octaves, persistence);
            if (dist < 1 && n > threshold - dist * 0.3) grid[yy][xx] = material;
        }
    }
}
// --- Fluss ---
// Die Flussmitte hält immer mindestens RIVER_KEEPOUT Felder Abstand zum Zentrum (Spawn-Ring ≈ 19 Felder).
// Würde der Fluss das Zentrum kreuzen, läuft er auf einem Bogen mit Radius RIVER_DETOUR darum herum
// und setzt seinen Weg hinter dem Zentrum fort.
const RIVER_KEEPOUT = 27;
const RIVER_DETOUR = 31;

function randomEdgePoint(edge, from, to) {
    const span = (edge % 2 === 0) ? WIDTH : HEIGHT;
    const p = arenaRandInt(Math.floor(span * from), Math.floor(span * to));
    switch (edge) {
        case 0:
            return {
                x: p,
                y: 0
            };
        case 1:
            return {
                x: WIDTH - 1,
                y: p
            };
        case 2:
            return {
                x: p,
                y: HEIGHT - 1
            };
        default:
            return {
                x: 0,
                y: p
            };
    }
}
// Punkte entlang einer Strecke im Abstand von ca. einem Feld
function sampleLine(a, b) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
        pts.push({
            x: a.x + (b.x - a.x) * i / n,
            y: a.y + (b.y - a.y) * i / n
        });
    }
    return pts;
}

function pushOutsideCircle(p, c, radius) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d >= radius) return p;
    const angle = d === 0 ? arenaRand() * 2 * Math.PI : Math.atan2(p.y - c.y, p.x - c.x);
    return {
        x: c.x + Math.cos(angle) * radius,
        y: c.y + Math.sin(angle) * radius
    };
}

function clampPoint(p) {
    return {
        x: Math.max(0, Math.min(WIDTH - 1, p.x)),
        y: Math.max(0, Math.min(HEIGHT - 1, p.y))
    };
}
// Weg von a nach b; kreuzt die Strecke die Sperrzone um das Zentrum, wird sie auf der kürzeren Seite
// über Tangenten und einen Kreisbogen umgangen.
function routeAroundCenter(a, b) {
    const c = {
        x: Math.floor(WIDTH / 2),
        y: Math.floor(HEIGHT / 2)
    };
    const R = RIVER_DETOUR;
    a = pushOutsideCircle(a, c, R);
    b = pushOutsideCircle(b, c, R);
    if (distanceToSegment(c.x, c.y, a.x, a.y, b.x, b.y) >= RIVER_KEEPOUT + 1) return sampleLine(a, b);
    const dA = Math.hypot(a.x - c.x, a.y - c.y);
    const dB = Math.hypot(b.x - c.x, b.y - c.y);
    const alphaA = Math.acos(R / dA);
    const alphaB = Math.acos(R / dB);
    const thetaA = Math.atan2(a.y - c.y, a.x - c.x);
    const thetaB = Math.atan2(b.y - c.y, b.x - c.x);
    const TWO_PI = 2 * Math.PI;
    const tangentLen = Math.sqrt(dA * dA - R * R) + Math.sqrt(dB * dB - R * R);
    // Beide Seiten probieren, die kürzere nehmen
    let best = null;
    for (const sign of [1, -1]) {
        const t1 = thetaA + sign * alphaA; // Berührpunkt auf dem Hinweg
        const t2 = thetaB - sign * alphaB; // Berührpunkt auf dem Rückweg
        const sweep = sign * ((((sign * (t2 - t1)) % TWO_PI) + TWO_PI) % TWO_PI);
        const length = tangentLen + R * Math.abs(sweep);
        if (!best || length < best.length) best = {
            t1,
            sweep,
            length
        };
    }
    const start = {
        x: c.x + Math.cos(best.t1) * R,
        y: c.y + Math.sin(best.t1) * R
    };
    const endAngle = best.t1 + best.sweep;
    const end = {
        x: c.x + Math.cos(endAngle) * R,
        y: c.y + Math.sin(endAngle) * R
    };
    const pts = sampleLine(a, start);
    const arcSteps = Math.max(2, Math.ceil(R * Math.abs(best.sweep)));
    for (let i = 1; i < arcSteps; i++) {
        const ang = best.t1 + best.sweep * i / arcSteps;
        pts.push({
            x: c.x + Math.cos(ang) * R,
            y: c.y + Math.sin(ang) * R
        });
    }
    return pts.concat(sampleLine(end, b));
}
// Natürliche Windungen quer zur Flussrichtung, ohne die Sperrzone um das Zentrum zu betreten
function addRiverWobble(points, amplitude) {
    const c = {
        x: Math.floor(WIDTH / 2),
        y: Math.floor(HEIGHT / 2)
    };
    const phase1 = arenaRand() * 2 * Math.PI;
    const phase2 = arenaRand() * 2 * Math.PI;
    return points.map((p, i) => {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
        const nx = -(next.y - prev.y) / len;
        const ny = (next.x - prev.x) / len;
        const offset = amplitude * (0.6 * Math.sin(i / 21 + phase1) + 0.4 * Math.sin(i / 9 + phase2));
        return pushOutsideCircle({
            x: p.x + nx * offset,
            y: p.y + ny * offset
        }, c, RIVER_KEEPOUT);
    });
}
// Wasser mit rundem Pinsel entlang der Punkte
function carveRiver(points, radius) {
    for (const p of points) {
        const px = Math.round(p.x),
            py = Math.round(p.y);
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx * dx + dy * dy > radius * radius + radius * 0.5) continue;
                const xx = px + dx,
                    yy = py + dy;
                if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT) grid[yy][xx] = 'water';
            }
        }
    }
}
// Weg mit zufällig seitlich versetzten Zwischenpunkten, jeder Abschnitt um das Zentrum herum geroutet
function buildRiverPath(from, to, midpointCount) {
    const waypoints = [from];
    const dx = to.x - from.x,
        dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i <= midpointCount; i++) {
        const t = i / (midpointCount + 1);
        const side = (arenaRand() < 0.5 ? -1 : 1) * arenaRandInt(6, 20) * arenaScale();
        waypoints.push({
            x: from.x + dx * t - dy / len * side,
            y: from.y + dy * t + dx / len * side
        });
    }
    waypoints.push(to);
    let path = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const segment = routeAroundCenter(clampPoint(waypoints[i]), clampPoint(waypoints[i + 1]));
        path = path.concat(path.length ? segment.slice(1) : segment);
    }
    return path;
}

function generateRiver() {
    const S = arenaScale();
    // Hauptfluss von einem Rand zum (meist gegenüberliegenden) Rand
    const startEdge = arenaRandInt(0, 3);
    const endEdge = arenaRand() < 0.7 ? (startEdge + 2) % 4 : (startEdge + (arenaRand() < 0.5 ? 1 : 3)) % 4;
    const start = randomEdgePoint(startEdge, 0.15, 0.85);
    const end = randomEdgePoint(endEdge, 0.15, 0.85);
    const mainPath = addRiverWobble(buildRiverPath(start, end, 1 + arenaRandInt(0, 1)), 4 * S);
    carveRiver(mainPath, 2 + arenaRandInt(0, 2));
    // 1-2 Nebenarme, die irgendwo vom Hauptfluss abzweigen und zu einem Rand laufen
    const branches = 1 + (arenaRand() < 0.5 ? 1 : 0);
    for (let b = 0; b < branches; b++) {
        // Abzweig nur dort, wo der Hauptfluss außerhalb des Umgehungsradius liegt (sonst entstünde eine Lücke)
        const c = Math.floor(WIDTH / 2);
        const candidates = mainPath.filter(p => Math.hypot(p.x - c, p.y - c) >= RIVER_DETOUR);
        if (candidates.length === 0) break;
        const origin = candidates[arenaRandInt(0, candidates.length - 1)];
        const branchEnd = randomEdgePoint(arenaRandInt(0, 3), 0.1, 0.9);
        const branchPath = addRiverWobble(buildRiverPath(origin, branchEnd, arenaRandInt(0, 1)), 3 * S);
        carveRiver(branchPath, 1 + arenaRandInt(0, 1));
    }
}
// Biome-Kanten verwischen (optional, für weichere Übergänge)
function smoothBiomeEdges() {
    let newGrid = grid.map(row => row.slice());
    for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = 1; x < WIDTH - 1; x++) {
            let here = grid[y][x];
            let counts = {
                grass: 0,
                forest: 0,
                rock: 0,
                water: 0
            };
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++) {
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
// --- Arena Generator ---
function generateArena() {
    const seedInput = document.getElementById('arena-seed');
    setArenaSeed(seedInput ? seedInput.value.trim() : '');
    const S = arenaScale(); // Anzahl der Elemente skaliert mit S, Radien mit sqrt(S)
    const R = Math.sqrt(S);
    const count = (min, spread) => Math.round((min + arenaRandInt(0, spread)) * S);
    const radius = (min, max) => Math.round(arenaRandInt(min, max) * R);
    const isGrass = tile => tile === 'grass';
    // 1. Grundlage: alles Wiese
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            grid[y][x] = 'grass';
        }
    }
    // 2. Felsen/Berge
    // Randberge: weniger dicht, sanfter Übergang
    const edgeBand = Math.round(5 * R);
    for (let y = 0; y < HEIGHT; y++)
        for (let x = 0; x < WIDTH; x++) {
            let edgeDist = Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y);
            if (edgeDist < edgeBand) {
                let n = perlin2_oct(x / 10, y / 10, arenaSeed + 999, 2, 0.5);
                const d = edgeDist / R; // Übergang bleibt so steil wie in der kleinen Arena
                if (n > 0.22 + d * 0.06 && arenaRand() < 0.7 - d * 0.1) grid[y][x] = 'rock';
            }
        }
    // Innenberge (Blobs)
    for (let i = 0, n = count(2, 2); i < n; i++) {
        let cx = arenaRandInt(WIDTH * 0.2, WIDTH * 0.8);
        let cy = arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8);
        paintBlob(cx, cy, radius(5, 10), arenaSeed + 2000 + i * 333, 3, 0.6, 0.05, 'rock');
    }
    // Seltene Findlinge/Bergpässe (kleine Felsen)
    for (let i = 0, n = count(2, 2); i < n; i++) {
        let cx = arenaRandInt(WIDTH * 0.1, WIDTH * 0.9);
        let cy = arenaRandInt(HEIGHT * 0.1, HEIGHT * 0.9);
        grid[cy][cx] = 'rock';
        if (arenaRand() < 0.5) {
            let dir = arenaRand() < 0.5 ? 0 : 1;
            for (let j = -arenaRandInt(2, 6); j <= arenaRandInt(2, 6); j++) {
                let xx = cx + (dir ? j : 0),
                    yy = cy + (dir ? 0 : j);
                if (xx >= 0 && xx < WIDTH && yy >= 0 && yy < HEIGHT) grid[yy][xx] = 'rock';
            }
        }
    }
    // 3. Wald (Noise und Gruppen)
    // Grundrauschen für Wald (Frequenz mit S, damit die Strukturgröße in Feldern gleich bleibt)
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x] === 'grass') {
                let nx = x / WIDTH - 0.5,
                    ny = y / HEIGHT - 0.5;
                let v = perlin2_oct(nx * 1.5 * S, ny * 1.5 * S, arenaSeed, 5, 0.55);
                if (v > 0.18 && arenaRand() < 0.85) grid[y][x] = 'forest';
            }
        }
    }
    // Baumgruppen als "Wolken" mit Noise
    for (let i = 0, n = count(7, 4); i < n; i++) {
        let cx = arenaRandInt(WIDTH * 0.15, WIDTH * 0.85);
        let cy = arenaRandInt(HEIGHT * 0.15, HEIGHT * 0.85);
        paintBlob(cx, cy, radius(6, 14), arenaSeed + i * 1234, 3, 0.6, 0.05, 'forest', isGrass);
    }
    // Wiesen doppelt verbinden und abrunden, bevor der Fluss kommt
    connectAreas('grass');
    connectAreas('grass');
    connectAreas('forest');
    connectAreas('grass');
    connectAreas('grass');
    connectAreas('forest');
    for (let i = 0, n = count(3, 3); i < n; i++) {
        let cx = arenaRandInt(WIDTH * 0.2, WIDTH * 0.8);
        let cy = arenaRandInt(HEIGHT * 0.2, HEIGHT * 0.8);
        paintBlob(cx, cy, radius(2, 5), arenaSeed + 4000 + i * 111, 2, 0.7, -0.2, 'grass');
    }
    // 4. Fluss (nach Wald, überschreibt Wald/Wiese, umfährt das Zentrum)
    generateRiver();

    //5. Dithering in Grenzen
    spreadMaterial('rock', 'water', 1, 35);
    spreadMaterial('rock', 'forest', 1, 20);
    spreadMaterial('rock', 'grass', 1, 16);
    spreadMaterial('forest', 'grass', 2, 16);
    spreadMaterial('grass', 'forest', 4, 12);

    // 6. Kanten verwischen (Biome-Übergänge)
    smoothBiomeEdges();
    drawGrid();
}

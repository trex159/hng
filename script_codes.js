'use strict';

/* =====================================================================
 * Codeverwaltung: Arena- und Tributen-Codes speichern, laden, kopieren
 *
 * Neue Codes:  <Präfix><Base64URL(GZIP(Binärdaten))>
 *   HG2R  Arena, RLE          HG2P  Arena, Packed          HG2T  Tribute
 * Der Präfix ist der vollständige Format- und Typindikator.
 *
 * Binärformat (vor GZIP, Zahlen = Varint/LEB128, kleinstes Byte zuerst):
 *   Arena   Breite, Höhe, Länge der Zelldaten, Zelldaten
 *           Zellen zeilenweise, links nach rechts, oben nach unten
 *           RLE:    je Lauf ein Varint  Anzahl * 8 + Terrain-ID
 *           Packed: 3 Bit je Zelle, höchstes Bit zuerst, Restbits = 0
 *   Tribute Anzahl, dann je Tribut in dieser Reihenfolge:
 *           Namenslänge (Bytes), Name (UTF-8), Alter, Flags, R, G, B,
 *           Anzahl Freunde, Freund-IDs (1..Anzahl, aufsteigend)
 *           Flags (1 Byte): Bit 0-2 Attribute (stark, schlau, beliebt),
 *                           Bit 3 Geschlecht, Bit 4-5 Verhalten, Bit 6-7 = 0
 *
 * Die Reihenfolgen von TERRAIN, GENDERS, BEHAVIORS und ATTRIBUTES sind Teil
 * des Formats: nur am Ende erweitern, niemals umsortieren.
 *
 * Alte Codes (Base64 von JSON) bleiben ladbar. Von Tributen werden nur
 * Name, Alter, Geschlecht, Attribute, Verhalten, Farbe und Freunde übernommen;
 * ungültige Werte (z. B. Verhalten "männlich" durch einen alten Fehler) werden dabei
 * durch die Standardwerte des Konstruktors ersetzt.
 * ===================================================================== */

(() => {
    // --- Grenzen -----------------------------------------------------
    const MAX_CODE_LENGTH = 1000000; // zeichen; reicht für alte JSON-Codes einer 200x200-Arena (ca. 0,45 Mio.)
    const MAX_PAYLOAD_BYTES = 1 << 20; // entpackte Daten; Schutz vor Dekompressionsbomben
    const MAX_ARENA_DIM = 512;
    const MAX_ARENA_CELLS = MAX_ARENA_DIM * MAX_ARENA_DIM;
    const MIN_TRIBUTES = 1;
    const MAX_TRIBUTES = 48; // wie max im Eingabefeld #tribute-count
    const MAX_NAME_LENGTH = 64; // zeichen
    const MAX_AGE = 120;
    const MAX_VARINT_BYTES = 5;

    // --- Formatdefinitionen ------------------------------------------
    const PREFIX_RLE = 'HG2R';
    const PREFIX_PACKED = 'HG2P';
    const PREFIX_TRIBUTES = 'HG2T';
    const TERRAIN = ['grass', 'forest', 'rock', 'water', 'lava', 'trap'];
    const TERRAIN_ID = new Map(TERRAIN.map((name, id) => [name, id]));
    const ID_BITS = 3;
    const ID_SLOTS = 1 << ID_BITS;
    const GENDERS = ['männlich', 'weiblich'];
    const BEHAVIORS = ['aggressiv', 'defensiv', 'ängstlich'];
    const ATTRIBUTES = ['stark', 'schlau', 'beliebt'];
    const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
    // Namen landen per innerHTML in Profilen und Log: HTML-Zeichen und Steuerzeichen sind tabu
    const NAME_FORBIDDEN = /[<>"\u0000-\u001f\u007f]/;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', {
        fatal: true
    });

    // Fehler mit Text für den Nutzer; alles andere gilt als unerwartet
    class CodeError extends Error {
        constructor(message, cause) {
            super(message, {
                cause
            });
        }
    }

    // --- Binär-Helfer ------------------------------------------------
    function writer() {
        const out = [];
        return {
            u8: v => void out.push(v),
            varint(v) {
                while (v >= 0x80) {
                    out.push((v % 0x80) | 0x80);
                    v = Math.floor(v / 0x80);
                }
                out.push(v);
            },
            raw(bytes) {
                for (const b of bytes) out.push(b);
            },
            done: () => Uint8Array.from(out)
        };
    }

    function reader(bytes) {
        let pos = 0;
        return {
            u8() {
                if (pos >= bytes.length) throw new CodeError('Der Code ist unvollständig (zu kurze Daten).');
                return bytes[pos++];
            },
            varint() {
                let value = 0,
                    factor = 1;
                for (let i = 0; i < MAX_VARINT_BYTES; i++) {
                    const b = this.u8();
                    value += (b & 0x7f) * factor;
                    if (!(b & 0x80)) return value;
                    factor *= 0x80;
                }
                throw new CodeError('Der Code enthält eine ungültige Zahl.');
            },
            take(n) {
                if (pos + n > bytes.length) throw new CodeError('Der Code ist unvollständig (zu kurze Daten).');
                pos += n;
                return bytes.subarray(pos - n, pos);
            },
            remaining: () => bytes.length - pos
        };
    }

    function toBase64Url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // Akzeptiert Base64URL und das normale Base64 alter Codes (mit oder ohne Padding)
    function fromBase64(text) {
        const clean = text.replace(/=+$/, '');
        if (!/^[A-Za-z0-9+/_-]+$/.test(clean) || clean.length % 4 === 1) {
            throw new CodeError('Der Code enthält keine gültigen Base64-Daten.');
        }
        const standard = clean.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(standard + '='.repeat((4 - standard.length % 4) % 4));
        return Uint8Array.from(binary, c => c.charCodeAt(0));
    }

    // --- Kompression -------------------------------------------------
    function requireStreams() {
        if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
            throw new CodeError('Dieser Browser unterstützt die benötigte Kompression nicht (CompressionStream). Bitte einen aktuellen Browser verwenden.');
        }
    }

    async function gzip(bytes) {
        requireStreams();
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async function gunzip(bytes) {
        requireStreams();
        if (bytes.length < 3 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) {
            throw new CodeError('Nicht unterstütztes oder beschädigtes Kompressionsverfahren (GZIP erwartet).');
        }
        const source = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const chunks = [];
        let total = 0;
        try {
            for (;;) {
                const {
                    done,
                    value
                } = await source.read();
                if (done) break;
                total += value.length;
                if (total > MAX_PAYLOAD_BYTES) throw new CodeError('Die entpackten Daten sind zu groß.');
                chunks.push(value);
            }
        } catch (error) {
            source.cancel().catch(() => {});
            throw error instanceof CodeError ? error : new CodeError('Die komprimierten Daten sind beschädigt.', error);
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }

    // --- Arena -------------------------------------------------------
    function collectCells() {
        if (!Array.isArray(grid) || grid.length !== HEIGHT) throw new CodeError('Die Arena hat eine ungültige Höhe.');
        const cells = new Uint8Array(WIDTH * HEIGHT);
        for (let y = 0; y < HEIGHT; y++) {
            const row = grid[y];
            if (!Array.isArray(row) || row.length !== WIDTH) throw new CodeError(`Zeile ${y + 1} der Arena hat eine ungültige Breite.`);
            for (let x = 0; x < WIDTH; x++) {
                const id = TERRAIN_ID.get(row[x]);
                if (id === undefined) throw new CodeError(`Unbekanntes Gelände „${row[x]}“ bei Feld (${x}, ${y}). Die Arena wurde nicht gespeichert.`);
                cells[y * WIDTH + x] = id;
            }
        }
        return cells;
    }

    function rleEncode(cells) {
        const w = writer();
        for (let i = 0; i < cells.length;) {
            let end = i + 1;
            while (end < cells.length && cells[end] === cells[i]) end++;
            w.varint((end - i) * ID_SLOTS + cells[i]);
            i = end;
        }
        return w.done();
    }

    function rleDecode(data, cells) {
        const r = reader(data);
        let index = 0;
        while (r.remaining() > 0) {
            const value = r.varint();
            const id = value % ID_SLOTS;
            const count = (value - id) / ID_SLOTS;
            if (id >= TERRAIN.length) throw new CodeError('Der Code enthält ein unbekanntes Gelände.');
            if (count < 1) throw new CodeError('Der Code enthält eine ungültige Lauflänge.');
            if (index + count > cells.length) throw new CodeError('Der Code enthält zu viele Felder.');
            cells.fill(id, index, index + count);
            index += count;
        }
        if (index !== cells.length) throw new CodeError('Der Code enthält zu wenige Felder.');
    }

    function packEncode(cells) {
        const out = new Uint8Array(Math.ceil(cells.length * ID_BITS / 8));
        let bit = 0;
        for (const id of cells) {
            for (let b = ID_BITS - 1; b >= 0; b--, bit++) {
                if ((id >> b) & 1) out[bit >> 3] |= 0x80 >> (bit & 7);
            }
        }
        return out;
    }

    function packDecode(data, cells) {
        if (data.length !== Math.ceil(cells.length * ID_BITS / 8)) throw new CodeError('Die Zellanzahl passt nicht zur Datenmenge.');
        let bit = 0;
        for (let i = 0; i < cells.length; i++) {
            let id = 0;
            for (let b = 0; b < ID_BITS; b++, bit++) id = (id << 1) | ((data[bit >> 3] >> (7 - (bit & 7))) & 1);
            if (id >= TERRAIN.length) throw new CodeError('Der Code enthält ein unbekanntes Gelände.');
            cells[i] = id;
        }
        for (; bit < data.length * 8; bit++) {
            if ((data[bit >> 3] >> (7 - (bit & 7))) & 1) throw new CodeError('Der Code enthält ungültige Restbits.');
        }
    }

    function arenaPayload(data) {
        const w = writer();
        w.varint(WIDTH);
        w.varint(HEIGHT);
        w.varint(data.length);
        w.raw(data);
        return w.done();
    }

    function decodeArena(bytes, packed) {
        const r = reader(bytes);
        const width = r.varint();
        const height = r.varint();
        if (width < 1 || height < 1 || width > MAX_ARENA_DIM || height > MAX_ARENA_DIM || width * height > MAX_ARENA_CELLS) {
            throw new CodeError('Der Code enthält ungültige Arena-Maße.');
        }
        if (width !== WIDTH || height !== HEIGHT) {
            throw new CodeError(`Die Arena im Code ist ${width} × ${height} Felder groß, die aktuelle Arena ${WIDTH} × ${HEIGHT}.`);
        }
        const length = r.varint();
        if (length !== r.remaining()) throw new CodeError('Die Datenlänge im Code stimmt nicht.');
        const data = r.take(length);
        const cells = new Uint8Array(width * height);
        (packed ? packDecode : rleDecode)(data, cells);
        return Array.from({
            length: height
        }, (_, y) => Array.from({
            length: width
        }, (_, x) => TERRAIN[cells[y * width + x]]));
    }

    async function saveArena() {
        const cells = collectCells();
        const [rle, packed] = await Promise.all([
            gzip(arenaPayload(rleEncode(cells))),
            gzip(arenaPayload(packEncode(cells)))
        ]);
        return rle.length <= packed.length ? PREFIX_RLE + toBase64Url(rle) : PREFIX_PACKED + toBase64Url(packed);
    }

    // --- Tribute -----------------------------------------------------
    function checkName(name, who) {
        if (typeof name !== 'string' || name.trim() === '') throw new CodeError(`${who}: Der Name fehlt.`);
        if ([...name].length > MAX_NAME_LENGTH) throw new CodeError(`${who}: Der Name ist länger als ${MAX_NAME_LENGTH} Zeichen.`);
        if (NAME_FORBIDDEN.test(name)) throw new CodeError(`${who}: Der Name enthält nicht erlaubte Zeichen (< > " oder Steuerzeichen).`);
        return name;
    }

    function checkAge(age, who) {
        if (!Number.isInteger(age) || age < 1 || age > MAX_AGE) throw new CodeError(`${who}: Das Alter ist ungültig (1 bis ${MAX_AGE}).`);
        return age;
    }

    // Reduziert ein Tribut-Objekt (aktuell oder aus einem alten Code) auf die sieben erlaubten Felder.
    // Freunde werden über idToPos auf Positionen 1..n abgebildet; Ungültiges, Selbstbezug und Doppelte entfallen.
    // lenient (alte Codes): vorhandene, aber ungültige Werte (außer dem Namen) werden zu null und behalten beim Laden den Konstruktor-Standard.
    function toRecord(raw, number, idToPos, lenient = false) {
        const who = `Tribut ${number}`;
        if (!raw || typeof raw !== 'object') throw new CodeError(`${who}: Ungültige Daten.`);
        const name = checkName(raw.name, who);
        for (const key of ['age', 'gender', 'behavior', 'attributes', 'color']) {
            if (raw[key] === undefined) throw new CodeError(`${who}: Die Eigenschaft „${key}“ fehlt.`);
        }
        const orDefault = check => {
            try {
                return check();
            } catch (error) {
                if (lenient && error instanceof CodeError) return null;
                throw error;
            }
        };
        const indexIn = (list, value, label) => {
            const index = list.indexOf(value);
            if (index < 0) throw new CodeError(`${who}: ${label} ist ungültig.`);
            return index;
        };
        const age = orDefault(() => checkAge(raw.age, who));
        const gender = orDefault(() => indexIn(GENDERS, raw.gender, 'Das Geschlecht'));
        const behavior = orDefault(() => indexIn(BEHAVIORS, raw.behavior, 'Das Verhalten'));
        const mask = orDefault(() => {
            const attrs = raw.attributes;
            if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) throw new CodeError(`${who}: Die Attribute fehlen.`);
            let bits = 0;
            for (const key of Object.keys(attrs)) {
                const bit = ATTRIBUTES.indexOf(key);
                if (bit < 0) throw new CodeError(`${who}: Unbekanntes Attribut „${key}“.`);
                if (typeof attrs[key] !== 'boolean') throw new CodeError(`${who}: Das Attribut „${key}“ ist ungültig.`);
                if (attrs[key]) bits |= 1 << bit;
            }
            return bits;
        });
        const rgb = orDefault(() => {
            if (typeof raw.color !== 'string' || !COLOR_PATTERN.test(raw.color)) throw new CodeError(`${who}: Die Farbe ist ungültig.`);
            return [1, 3, 5].map(i => parseInt(raw.color.slice(i, i + 2), 16));
        });
        if (raw.friends !== undefined && !Array.isArray(raw.friends)) throw new CodeError(`${who}: Die Freundesliste ist ungültig.`);
        const friends = new Set();
        for (const id of raw.friends || []) {
            const pos = typeof id === 'number' ? idToPos.get(id) : undefined;
            if (pos !== undefined && pos !== number) friends.add(pos);
        }
        return {
            name,
            age,
            gender,
            behavior,
            mask,
            rgb,
            friends: [...friends].sort((a, b) => a - b)
        };
    }

    function encodeTributes(records) {
        const w = writer();
        w.varint(records.length);
        for (const rec of records) {
            const name = encoder.encode(rec.name);
            w.varint(name.length);
            w.raw(name);
            w.varint(rec.age);
            w.u8(rec.mask | (rec.gender << 3) | (rec.behavior << 4));
            rec.rgb.forEach(channel => w.u8(channel));
            w.varint(rec.friends.length);
            rec.friends.forEach(id => w.varint(id));
        }
        return w.done();
    }

    function decodeTributes(bytes) {
        const r = reader(bytes);
        const count = r.varint();
        if (count < MIN_TRIBUTES || count > MAX_TRIBUTES) throw new CodeError(`Ungültige Tribut-Anzahl im Code (erlaubt: ${MIN_TRIBUTES} bis ${MAX_TRIBUTES}).`);
        const records = [];
        for (let i = 1; i <= count; i++) {
            const who = `Tribut ${i}`;
            const nameLength = r.varint();
            if (nameLength > MAX_NAME_LENGTH * 4) throw new CodeError(`${who}: Der Name ist zu lang.`);
            let name;
            try {
                name = decoder.decode(r.take(nameLength));
            } catch (error) {
                if (error instanceof CodeError) throw error;
                throw new CodeError(`${who}: Der Name ist kein gültiges UTF-8.`, error);
            }
            checkName(name, who);
            const age = checkAge(r.varint(), who);
            const flags = r.u8();
            const behavior = (flags >> 4) & 3;
            if (flags >> 6 || behavior >= BEHAVIORS.length) throw new CodeError(`${who}: Ungültige Eigenschaften im Code.`);
            const rgb = [r.u8(), r.u8(), r.u8()];
            const friendCount = r.varint();
            if (friendCount > count - 1) throw new CodeError(`${who}: Zu viele Freunde.`);
            const friends = new Set();
            for (let f = 0; f < friendCount; f++) {
                const id = r.varint();
                if (id < 1 || id > count || id === i || friends.has(id)) throw new CodeError(`${who}: Ungültige Freundes-ID.`);
                friends.add(id);
            }
            records.push({
                name,
                age,
                gender: (flags >> 3) & 1,
                behavior,
                mask: flags & 7,
                rgb,
                friends: [...friends]
            });
        }
        if (r.remaining() !== 0) throw new CodeError('Der Code enthält unerwartete Zusatzdaten.');
        return records;
    }

    async function saveTributes() {
        if (!Array.isArray(tributes) || tributes.length < MIN_TRIBUTES || tributes.length > MAX_TRIBUTES) {
            throw new CodeError(`Ungültige Tribut-Anzahl (erlaubt: ${MIN_TRIBUTES} bis ${MAX_TRIBUTES}).`);
        }
        const idToPos = new Map(tributes.map((t, i) => [t && t.id, i + 1]));
        const records = tributes.map((t, i) => toRecord(t, i + 1, idToPos));
        return PREFIX_TRIBUTES + toBase64Url(await gzip(encodeTributes(records)));
    }

    // --- Alte Codes (Base64 von JSON) --------------------------------
    function legacyText(bytes) {
        try {
            return decoder.decode(bytes);
        } catch {
            // ältere Codes stammen aus btoa(JSON) und können Latin-1 statt UTF-8 enthalten
            return Array.from(bytes, b => String.fromCharCode(b)).join('');
        }
    }

    function legacyArena(data) {
        const height = data.length;
        const width = data[0].length;
        if (height > MAX_ARENA_DIM || width < 1 || width > MAX_ARENA_DIM) throw new CodeError('Die Arena im Code hat ungültige Maße.');
        if (!data.every(row => row.length === width)) throw new CodeError('Die Zeilen der Arena im Code sind unterschiedlich lang.');
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!TERRAIN_ID.has(data[y][x])) throw new CodeError(`Unbekanntes Gelände bei Feld (${x}, ${y}) im Code.`);
            }
        }
        // alte Größen (z. B. 100 x 100) werden wie bisher hochskaliert
        const scaled = typeof normalizeLoadedGrid === 'function' ? normalizeLoadedGrid(data) : data;
        if (scaled.length !== HEIGHT || scaled.some(row => row.length !== WIDTH)) {
            throw new CodeError(`Die Arena im Code lässt sich nicht auf ${WIDTH} × ${HEIGHT} Felder bringen.`);
        }
        return scaled;
    }

    function legacyTributes(data) {
        if (data.length > MAX_TRIBUTES) throw new CodeError(`Zu viele Tribute im Code (maximal ${MAX_TRIBUTES}).`);
        const idToPos = new Map();
        data.forEach((t, i) => {
            const id = Number.isInteger(t.id) ? t.id : i + 1;
            if (!idToPos.has(id)) idToPos.set(id, i + 1);
        });
        return data.map((t, i) => toRecord(t, i + 1, idToPos, true));
    }

    function parseLegacy(compact) {
        let data;
        try {
            data = JSON.parse(legacyText(fromBase64(compact)));
        } catch (error) {
            throw new CodeError('Unbekanntes Code-Format. Der Code ist weder ein gültiger neuer noch ein gültiger alter Code.', error);
        }
        if (!Array.isArray(data) || data.length === 0) throw new CodeError('Der alte Code enthält weder eine Arena noch Tribute.');
        if (data.every(entry => Array.isArray(entry))) return {
            type: 'arena',
            grid: legacyArena(data)
        };
        if (data.every(entry => entry && typeof entry === 'object')) return {
            type: 'tributes',
            records: legacyTributes(data)
        };
        throw new CodeError('Der alte Code enthält weder eine Arena noch Tribute.');
    }

    // --- Laden -------------------------------------------------------
    async function parseCode(code) {
        if (typeof code !== 'string') throw new CodeError('Es wurde kein Code angegeben.');
        const compact = code.replace(/\s+/g, '');
        if (!compact) throw new CodeError('Es wurde kein Code angegeben.');
        if (compact.length > MAX_CODE_LENGTH) throw new CodeError('Der Code ist zu lang.');
        if (!compact.startsWith('HG2')) return parseLegacy(compact);
        const prefix = compact.slice(0, 4);
        if (prefix !== PREFIX_RLE && prefix !== PREFIX_PACKED && prefix !== PREFIX_TRIBUTES) {
            throw new CodeError(`Unbekannter Code-Präfix „${prefix}“.`);
        }
        const bytes = await gunzip(fromBase64(compact.slice(4)));
        return prefix === PREFIX_TRIBUTES ? {
            type: 'tributes',
            records: decodeTributes(bytes)
        } : {
            type: 'arena',
            grid: decodeArena(bytes, prefix === PREFIX_PACKED)
        };
    }

    function ensureIdle() {
        if (typeof simulationRunning !== 'undefined' && simulationRunning) {
            throw new CodeError('Während die Simulation läuft, kann kein Code geladen werden.');
        }
    }

    function refreshUi() {
        if (typeof updateProfiles === 'function') updateProfiles();
        if (typeof updateStatsTable === 'function') updateStatsTable();
        if (typeof drawGrid === 'function') drawGrid();
    }

    function applyArena(newGrid) {
        ensureIdle();
        grid = newGrid;
        if (typeof Hazards !== 'undefined') Hazards.markDirty();
        refreshUi();
    }

    // Tribute werden über createTributes neu erzeugt (Position, Leben usw. aus Konstruktor und Spawn-Logik);
    // übernommen werden nur die sieben Felder des Codes. Bei einem Fehler bleibt der alte Bestand erhalten.
    function applyTributes(records) {
        ensureIdle();
        if (typeof createTributes !== 'function') throw new Error('createTributes ist nicht verfügbar');
        const backup = tributes;
        try {
            tributes = [];
            createTributes(records.length);
            if (tributes.length !== records.length) throw new Error('createTributes hat eine falsche Anzahl erzeugt');
            // Freundschaften sind in der Anwendung immer gegenseitig
            const friendSets = records.map(() => new Set());
            records.forEach((rec, i) => rec.friends.forEach(id => {
                friendSets[i].add(id);
                friendSets[id - 1].add(i + 1);
            }));
            tributes.forEach((t, i) => {
                const rec = records[i];
                t.name = rec.name;
                if (rec.age !== null) t.age = rec.age;
                if (rec.gender !== null) t.gender = GENDERS[rec.gender];
                if (rec.behavior !== null) t.behavior = BEHAVIORS[rec.behavior];
                if (rec.rgb) t.color = '#' + rec.rgb.map(channel => channel.toString(16).padStart(2, '0')).join('');
                if (rec.mask !== null) t.attributes = Object.fromEntries(ATTRIBUTES.map((key, bit) => [key, Boolean(rec.mask & (1 << bit))]));
                t.friends = [...friendSets[i]].sort((a, b) => a - b);
                t.social.trust = {}; // createTributes hat zufällige Freundschaften eingetragen
                t.friends.forEach(id => {
                    t.social.trust[id] = 1;
                });
            });
        } catch (error) {
            tributes = backup;
            refreshUi();
            throw error;
        }
        const countInput = document.getElementById('tribute-count');
        if (countInput) countInput.value = records.length;
        refreshUi();
    }

    // Lädt einen neuen oder alten Code; liefert 'arena' oder 'tributes'
    async function loadCode(code) {
        const parsed = await parseCode(code);
        if (parsed.type === 'arena') applyArena(parsed.grid);
        else applyTributes(parsed.records);
        return parsed.type;
    }

    // --- Oberfläche --------------------------------------------------
    let feedbackTimer = 0;

    function notify(message, isError = false) {
        const el = document.getElementById('code-feedback');
        if (!el) {
            if (isError) alert(message);
            return;
        }
        el.textContent = message;
        el.style.color = isError ? '#e5483a' : '#2e9e57';
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => {
            el.textContent = '';
        }, isError ? 8000 : 2500);
    }

    function report(error, context) {
        console.error(`${context}:`, error);
        notify(`${context}: ${error instanceof CodeError ? error.message : 'Unerwarteter Fehler (Details in der Konsole).'}`, true);
    }

    async function showCode(save, label) {
        try {
            const input = document.getElementById('load-code');
            if (!input) throw new CodeError('Das Code-Feld fehlt.');
            input.value = await save();
            notify(`${label} erstellt (${input.value.length} Zeichen)`);
        } catch (error) {
            report(error, `${label} konnte nicht erstellt werden`);
        }
    }

    const showArenaCode = () => showCode(saveArena, 'Arena-Code');
    const showTributesCode = () => showCode(saveTributes, 'Tributen-Code');

    async function loadFromCode() {
        const input = document.getElementById('load-code');
        try {
            const type = await loadCode(input ? input.value : null);
            if (input) input.value = '';
            notify(type === 'arena' ? 'Arena geladen' : 'Tribute geladen');
        } catch (error) {
            report(error, 'Laden fehlgeschlagen');
        }
    }

    // Ersatz für Umgebungen ohne (oder mit abgelehnter) Clipboard-API
    function fallbackCopy(input) {
        try {
            input.focus();
            input.select();
            input.setSelectionRange(0, input.value.length);
            return document.execCommand('copy');
        } catch {
            return false;
        }
    }

    async function copyCode() {
        const input = document.getElementById('load-code');
        const text = input ? input.value.trim() : '';
        if (!text) {
            notify('Kein Code zum Kopieren vorhanden', true);
            return;
        }
        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                copied = true;
            } catch (error) {
                console.error('Clipboard-API fehlgeschlagen:', error);
            }
        }
        if (!copied) copied = fallbackCopy(input);
        if (copied) notify('Code kopiert');
        else notify('Kopieren nicht möglich. Bitte den Code markieren und mit Strg+C kopieren.', true);
    }

    // Button und Rückmeldung einmalig anlegen; false, solange das Codefeld fehlt
    function ensureCopyButton() {
        const input = document.getElementById('load-code');
        if (!input) return false;
        if (!document.getElementById('code-copy-btn')) {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = 'code-copy-btn';
            button.textContent = 'Code kopieren';
            button.addEventListener('click', copyCode);
            input.after(button);
        }
        if (!document.getElementById('code-feedback')) {
            const feedback = document.createElement('span');
            feedback.id = 'code-feedback';
            feedback.setAttribute('role', 'status');
            feedback.style.marginLeft = '8px';
            (input.parentElement || document.body).append(feedback);
        }
        return true;
    }

    function init() {
        if (ensureCopyButton()) return;
        const observer = new MutationObserver(() => {
            if (ensureCopyButton()) observer.disconnect();
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {
        once: true
    });
    else init();

    Object.assign(window, {
        saveArena,
        saveTributes,
        loadCode,
        loadFromCode,
        showArenaCode,
        showTributesCode
    });
})();

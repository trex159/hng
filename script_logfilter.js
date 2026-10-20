/* =====================================================================
 * Log-Filter
 *
 * Drei Filter wirken gemeinsam auf den Log (ein Eintrag muss alle bestehen):
 *   Anzeigen     Kategorie-Buttons aus index.html (Alle / Angriffe / Tode / Info)
 *   Ausblenden   Kategorien, die nicht erscheinen sollen. Die Schalter werden
 *                aus den Kategorie-Buttons erzeugt, index.html bleibt unverändert.
 *   Tribut       nur Einträge, in denen der Name des Tributs vorkommt
 *
 * Siegesmeldungen (log-win) bleiben bei den Kategorie-Filtern immer sichtbar,
 * der Tribut-Filter gilt für alle Einträge.
 *
 * Die Einträge erzeugt script.js (appendLogEntry) und ruft dafür
 * applyLogFilterTo und updateLogFilterVisibility auf.
 * ===================================================================== */

const logFilter = {
    include: 'all', // angezeigte Kategorie ('all' = alle)
    exclude: new Set(), // ausgeblendete Kategorien
    tributeId: 'all' // ID des Tributs ('all' = alle)
};

function isNameChar(ch) {
    return ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);
}

// Kommt der Name als eigenes Wort vor? ("Max" soll nicht in "Maximilian" gefunden werden)
function textMentions(text, name) {
    if (!name) return false;
    let from = 0;
    for (;;) {
        const index = text.indexOf(name, from);
        if (index < 0) return false;
        if (!isNameChar(text[index - 1]) && !isNameChar(text[index + name.length])) return true;
        from = index + 1;
    }
}

// Text eines Log-Eintrags ohne den Zeitpunkt-Präfix "[Zp 42]"
function logEntryText(div) {
    const time = div.querySelector('.log-time');
    const full = div.textContent;
    return time ? full.slice(time.textContent.length) : full;
}

// Entscheidet für einen Eintrag, ob er mit den aktuellen Filtern sichtbar ist.
// Der Tribut wird nur einmal pro Durchlauf gesucht.
function buildLogMatcher() {
    const tribute = logFilter.tributeId === 'all' ? null : tributes.find(t => String(t.id) === logFilter.tributeId);
    return div => {
        const type = div.dataset.type;
        if (type !== 'win') {
            if (logFilter.exclude.has(type)) return false;
            if (logFilter.include !== 'all' && type !== logFilter.include) return false;
        }
        return !tribute || textMentions(logEntryText(div), tribute.name);
    };
}

function applyLogFilterTo(div, matches = buildLogMatcher()) {
    div.style.display = matches(div) ? '' : 'none';
}

function updateLogFilterVisibility() {
    const matches = buildLogMatcher();
    document.querySelectorAll('#log > div').forEach(div => applyLogFilterTo(div, matches));
}

function isLogFilterDefault() {
    return logFilter.include === 'all' && logFilter.exclude.size === 0 && logFilter.tributeId === 'all';
}

// Buttons und Auswahl an den Filter-Zustand angleichen
function syncLogFilterControls() {
    document.querySelectorAll('#log-filter-bar .log-filter-btn[data-type]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === logFilter.include);
    });
    document.querySelectorAll('#log-filter-bar .log-exclude-btn').forEach(btn => {
        const on = logFilter.exclude.has(btn.dataset.exclude);
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    const select = document.getElementById('log-filter-tribute');
    if (select) select.value = logFilter.tributeId;
    const reset = document.getElementById('log-filter-reset');
    if (reset) reset.hidden = isLogFilterDefault();
}

function changeLogFilter() {
    syncLogFilterControls();
    updateLogFilterVisibility();
}

// Tribut-Auswahl mit den aktuellen Tributen füllen (Namen können sich vor dem Start ändern)
function refreshLogTributeOptions() {
    const select = document.getElementById('log-filter-tribute');
    if (!select) return;
    const signature = tributes.map(t => `${t.id}:${t.name}`).join('|');
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    select.innerHTML = '';
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'Alle';
    select.appendChild(all);
    tributes.forEach(t => {
        const option = document.createElement('option');
        option.value = String(t.id);
        option.textContent = t.name;
        select.appendChild(option);
    });
    if (logFilter.tributeId !== 'all' && !tributes.some(t => String(t.id) === logFilter.tributeId)) {
        logFilter.tributeId = 'all'; // gewählter Tribut existiert nicht mehr
        changeLogFilter();
    }
    select.value = logFilter.tributeId;
}

function createLogFilterControls() {
    const bar = document.getElementById('log-filter-bar');
    if (!bar) return;

    const includeButtons = [...bar.querySelectorAll('.log-filter-btn[data-type]')];
    const categories = includeButtons
        .filter(btn => btn.dataset.type !== 'all')
        .map(btn => ({
            type: btn.dataset.type,
            label: btn.textContent.trim()
        }));

    // Kategorie anzeigen (bestehende Buttons). Eine ausgeblendete Kategorie wird dabei wieder eingeblendet.
    includeButtons.forEach(btn => btn.addEventListener('click', () => {
        logFilter.include = btn.dataset.type;
        logFilter.exclude.delete(btn.dataset.type);
        changeLogFilter();
    }));

    // Kategorien ausblenden
    const excludeGroup = document.createElement('span');
    excludeGroup.className = 'log-filter-group';
    excludeGroup.innerHTML = '<span>Ausblenden:</span>';
    categories.forEach(({
        type,
        label
    }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'log-filter-btn log-exclude-btn';
        btn.dataset.exclude = type;
        btn.textContent = label;
        btn.title = `${label} im Log ausblenden`;
        btn.addEventListener('click', () => {
            if (logFilter.exclude.has(type)) {
                logFilter.exclude.delete(type);
            } else {
                logFilter.exclude.add(type);
                if (logFilter.include === type) logFilter.include = 'all';
            }
            changeLogFilter();
        });
        excludeGroup.appendChild(btn);
    });

    // Nur Einträge mit einem bestimmten Tribut
    const tributeGroup = document.createElement('label');
    tributeGroup.className = 'log-filter-group';
    tributeGroup.innerHTML = '<span>Nur mit Tribut:</span><select id="log-filter-tribute"></select>';
    const select = tributeGroup.querySelector('select');
    select.addEventListener('mousedown', refreshLogTributeOptions);
    select.addEventListener('focus', refreshLogTributeOptions);
    select.addEventListener('change', () => {
        logFilter.tributeId = select.value;
        changeLogFilter();
    });

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'log-filter-reset';
    reset.className = 'log-filter-btn';
    reset.textContent = 'Filter zurücksetzen';
    reset.hidden = true;
    reset.addEventListener('click', () => {
        logFilter.include = 'all';
        logFilter.exclude.clear();
        logFilter.tributeId = 'all';
        changeLogFilter();
    });

    bar.append(excludeGroup, tributeGroup, reset);
    refreshLogTributeOptions();
    syncLogFilterControls();
}

SimEvents.on('simStart', refreshLogTributeOptions);
document.addEventListener('DOMContentLoaded', createLogFilterControls);

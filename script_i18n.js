/* =====================================================================
 * Mehrsprachigkeit (i18n)
 *
 * Aufbau:
 *   script_i18n.js   diese Datei: Sprachwahl, t(), Umschalter (Motor)
 *   lang_de.js       deutsche Texte   -> I18N.register('de', {...})
 *   lang_en.js       englische Texte  -> I18N.register('en', {...})
 *
 * Neue Sprache hinzufügen (z. B. Französisch):
 *   1. lang_en.js nach lang_fr.js kopieren, I18N.register('fr', {...}) und
 *      '_name': 'FR' (Beschriftung im Umschalter) setzen, Werte übersetzen.
 *   2. In index.html und Disclaimer.html <script src="lang_fr.js"></script>
 *      direkt nach lang_en.js einfügen. Fertig: der Umschalter erscheint
 *      automatisch. Fehlt ein Schlüssel, wird Englisch (dann Deutsch) benutzt.
 *
 * Sprachwahl: gespeicherte Auswahl > Browsersprache (nur wenn eine
 * passende Sprachdatei existiert, also heute Deutsch) > Englisch.
 *
 * Benutzung im Code:
 *   I18N.t('log.healed', { name, amount })     {platzhalter} werden ersetzt
 *   I18N.t('stats.kill', { n: 3 })             wählt stats.kill_one / stats.kill_other
 * Benutzung im HTML:
 *   data-i18n="key"                       setzt textContent
 *   data-i18n-html="key"                  setzt innerHTML (nur eigene Texte!)
 *   data-i18n-attr="placeholder:key;title:key2"   setzt Attribute
 * Nach Änderungen am DOM: I18N.apply(element).
 * Auf Sprachwechsel reagieren: I18N.onChange(fn).
 *
 * Interne Werte (männlich, aggressiv, stark ...) bleiben bewusst Deutsch,
 * weil Codes, Speicherstände und die Simulationslogik sie verwenden.
 * Angezeigt werden sie über I18N.t('gender.männlich') usw.
 * ===================================================================== */

const I18N = (() => {
    const STORAGE_KEY = 'hng.lang';
    const FALLBACKS = ['en', 'de'];
    const dictionaries = {};
    const listeners = [];
    let current = 'en';
    let initialized = false;
    let resolved = false;

    function available() {
        return Object.keys(dictionaries);
    }

    function detect() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && dictionaries[saved]) return saved;
        } catch (e) {
            /* Speicher nicht verfügbar */
        }
        const preferred = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
        const base = String(preferred).toLowerCase().split('-')[0];
        return dictionaries[base] ? base : 'en';
    }

    function lookup(lang, key) {
        const dict = dictionaries[lang];
        return dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
    }

    function t(key, params) {
        if (!resolved) {
            resolved = true;
            current = detect();
        }
        let text;
        if (params && typeof params.n === 'number') {
            const suffix = params.n === 1 ? '_one' : '_other';
            for (const lang of [current, ...FALLBACKS]) {
                text = lookup(lang, key + suffix);
                if (text !== undefined) break;
            }
        }
        if (text === undefined) {
            for (const lang of [current, ...FALLBACKS]) {
                text = lookup(lang, key);
                if (text !== undefined) break;
            }
        }
        if (text === undefined) return key; // sichtbarer Hinweis auf einen fehlenden Schlüssel
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, (match, name) => params[name] !== undefined ? params[name] : match);
    }

    function apply(root = document) {
        const scope = root.querySelectorAll ? root : document;
        const nodes = [...scope.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-attr]')];
        if (root.matches && root.matches('[data-i18n], [data-i18n-html], [data-i18n-attr]')) nodes.push(root);
        nodes.forEach(el => {
            if (el.dataset.i18n) el.textContent = t(el.dataset.i18n);
            if (el.dataset.i18nHtml) el.innerHTML = t(el.dataset.i18nHtml);
            if (el.dataset.i18nAttr) {
                el.dataset.i18nAttr.split(';').forEach(pair => {
                    const [attr, key] = pair.split(':').map(s => s.trim());
                    if (attr && key) el.setAttribute(attr, t(key));
                });
            }
        });
    }

    function renderSwitcher() {
        let box = document.getElementById('lang-switch');
        const langs = available();
        if (langs.length < 2) {
            if (box) box.remove();
            return;
        }
        if (!box) {
            box = document.createElement('div');
            box.id = 'lang-switch';
            box.setAttribute('role', 'group');
            document.body.appendChild(box);
        }
        box.setAttribute('aria-label', t('lang.label'));
        box.innerHTML = '';
        langs.forEach(code => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = lookup(code, '_name') || code.toUpperCase();
            btn.title = lookup(code, '_title') || code;
            btn.lang = code;
            btn.classList.toggle('active', code === current);
            btn.setAttribute('aria-pressed', String(code === current));
            btn.addEventListener('click', () => setLanguage(code));
            box.appendChild(btn);
        });
    }

    function refresh() {
        document.documentElement.lang = current;
        apply(document);
        renderSwitcher();
    }

    function setLanguage(code, persist = true) {
        if (!dictionaries[code]) return;
        const changed = code !== current;
        current = code;
        if (persist) {
            try {
                localStorage.setItem(STORAGE_KEY, code);
            } catch (e) {
                /* ignorieren */
            }
        }
        refresh();
        if (changed) listeners.forEach(fn => {
            try {
                fn(code);
            } catch (e) {
                console.error('I18N.onChange:', e);
            }
        });
    }

    function register(code, dict) {
        dictionaries[code] = Object.assign(dictionaries[code] || {}, dict);
        if (initialized) {
            // Sprachdatei kam nach dem Start dazu: Wahl neu bewerten
            const wanted = detect();
            if (wanted !== current) setLanguage(wanted, false);
            else renderSwitcher();
        }
    }

    function start() {
        initialized = true;
        resolved = true;
        current = detect();
        refresh();
    }

    // Erster Durchlauf, sobald DOM und alle Sprachdateien geladen sind
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {
        once: true
    });
    else start();

    return {
        t,
        apply,
        register,
        setLanguage,
        onChange: fn => void listeners.push(fn),
        get lang() {
            return current;
        },
        available
    };
})();


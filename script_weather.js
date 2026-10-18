/* =====================================================================
 * Wetter-System
 * Das Wetter wird ausschließlich vom Gamemaker (Dropdown im UI) geändert.
 * Standard ist gutes Wetter.
 *
 *   clear  Alles normal
 *   fog    Sichtweite 40 %
 *   rain   Sichtweite 75 %, Regeneration 50 %
 *   snow   Sichtweite 50 %, keine Regeneration, stattdessen Kälteschaden
 *          (umso höher, je stärker der Tribut bereits verwundet ist)
 * ===================================================================== */

const WEATHER = {
    clear: {
        label: 'Gutes Wetter',
        viewFactor: 1,
        regenFactor: 1,
        cold: false
    },
    fog: {
        label: 'Nebel',
        viewFactor: 0.4,
        regenFactor: 1,
        cold: false
    },
    rain: {
        label: 'Regen',
        viewFactor: 0.75,
        regenFactor: 0.5,
        cold: false
    },
    snow: {
        label: 'Schnee',
        viewFactor: 0.5,
        regenFactor: 0,
        cold: true
    }
};

// Kälteschaden pro Tick = BASE + EXTRA * (1 - Leben/100)^2
const COLD_DAMAGE_BASE = 0.06;
const COLD_DAMAGE_EXTRA = 0.3;

let currentWeather = 'clear';

function getWeather() {
    return WEATHER[currentWeather] || WEATHER.clear;
}

function getWeatherViewFactor() {
    return getWeather().viewFactor;
}

function getWeatherRegenFactor() {
    return getWeather().regenFactor;
}

function getColdDamage(health) {
    const missing = Math.min(1, Math.max(0, 1 - health / MAX_HEALTH));
    return COLD_DAMAGE_BASE + COLD_DAMAGE_EXTRA * missing * missing;
}

// Wird vom Dropdown im UI aufgerufen (nur der Gamemaker hat Zugriff darauf)
function setWeather(type) {
    if (!WEATHER[type] || type === currentWeather) return;
    currentWeather = type;
    // logEvent statt logInfo: der Wiederholungsfilter von logInfo würde Wetterwechsel verschlucken
    logEvent(`Der Gamemaker ändert das Wetter: ${WEATHER[type].label}.`, 'info');
    drawGrid();
}

// Pseudo-Zufall pro Partikel-Index: stabile Positionen, damit Regen und Schnee gleichmäßig fallen
function weatherRand(i, salt) {
    const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return v - Math.floor(v);
}

// Halbtransparente Wetter-Schicht über der Arena.
// time (ms) lässt Regen und Schnee fallen; ohne Angabe wird die aktuelle Zeit verwendet.
function drawWeatherOverlay(context, width, height, time = performance.now()) {
    if (currentWeather === 'clear') return;
    const t = time / 1000;
    const scale = Math.max(1, width / 1000);
    const count = Math.round(Math.min(700, Math.max(220, width * height / 4500)));
    context.save();
    switch (currentWeather) {
        case 'fog':
            context.fillStyle = 'rgba(215, 220, 225, 0.38)';
            context.fillRect(0, 0, width, height);
            break;
        case 'rain':
            context.fillStyle = 'rgba(30, 50, 90, 0.18)';
            context.fillRect(0, 0, width, height);
            context.strokeStyle = 'rgba(180, 200, 255, 0.55)';
            context.lineWidth = Math.max(1, scale * 0.8);
            context.beginPath();
            for (let i = 0; i < count; i++) {
                const speed = 0.9 + 0.4 * weatherRand(i, 1);
                const y = (weatherRand(i, 2) * height + t * height * speed) % height;
                const x = (weatherRand(i, 3) * width + y * 0.4) % width;
                context.moveTo(x, y);
                context.lineTo(x - 5 * scale, y + 12 * scale);
            }
            context.stroke();
            break;
        case 'snow':
            context.fillStyle = 'rgba(235, 242, 255, 0.16)';
            context.fillRect(0, 0, width, height);
            context.fillStyle = 'rgba(255, 255, 255, 0.9)';
            for (let i = 0; i < count; i++) {
                const speed = 0.08 + 0.1 * weatherRand(i, 1);
                const y = (weatherRand(i, 2) * height + t * height * speed) % height;
                const x = (weatherRand(i, 3) * width + Math.sin(t * 1.2 + i) * 10 * scale + width) % width;
                const size = (2 + 2 * weatherRand(i, 4)) * Math.max(1, scale * 0.8);
                context.fillRect(x, y, size, size);
            }
            break;
    }
    context.restore();
}

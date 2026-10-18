/* =====================================================================
 * Partikel-Effekte
 *
 * Alle Partikel leben in Feld-Koordinaten und laufen in Echtzeit
 * (unabhängig vom Geschwindigkeits-Regler). Sie werden vom Renderer in
 * jedes Ziel (Vorschau, Vollbild) mitgezeichnet.
 *
 *   Schaden        rote/orange Funken weg vom Angreifer, Schadenszahl
 *   Tod            Funkenschauer in Tributsfarbe, Druckwelle
 *   Richtungswechsel   kleine Staubspur, bei Kehrtwende ein Fächer
 *   Heilung        aufsteigende grüne Kreuze
 * ===================================================================== */

const Fx = (() => {
    const MAX_PARTICLES = 1500;
    const TURN_COOLDOWN_TICKS = 3; // pro Tribut, damit Zickzack-Läufer die Arena nicht fluten
    const HIT_COLORS = ['#ff3b30', '#ff8a2b', '#ffd24a', '#ffffff'];
    let particles = [];
    const heading = new WeakMap(); // Tribut -> {dx, dy, lastTurn}

    const state = {
        enabled: true
    };

    function rand(a, b) {
        return a + Math.random() * (b - a);
    }

    function add(p) {
        if (particles.length < MAX_PARTICLES) particles.push(p);
    }

    function spark(x, y, angle, speed, life, size, color) {
        add({
            kind: 'spark',
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            drag: 2.2,
            life,
            max: life,
            size,
            color
        });
    }

    function ring(x, y, radius, life, color) {
        add({
            kind: 'ring',
            x,
            y,
            vx: 0,
            vy: 0,
            drag: 0,
            life,
            max: life,
            size: radius,
            color
        });
    }

    function text(x, y, label, color) {
        add({
            kind: 'text',
            x,
            y,
            vx: rand(-0.15, 0.15),
            vy: -1.6,
            drag: 1.2,
            life: 0.9,
            max: 0.9,
            size: 1,
            color,
            label
        });
    }

    function plus(x, y, color) {
        add({
            kind: 'plus',
            x: x + rand(-0.35, 0.35),
            y,
            vx: rand(-0.2, 0.2),
            vy: rand(-1.8, -0.9),
            drag: 0.8,
            life: 0.9,
            max: 0.9,
            size: 0.22,
            color
        });
    }

    // Mittelpunkt einer Figur (Anzeigeposition, damit der Effekt mitläuft)
    function centerOf(entity) {
        const d = Renderer.getDisplayPos(entity);
        return {
            x: d.x + 0.5,
            y: d.y + 0.5
        };
    }

    function onDamage({
        source,
        target,
        amount
    }) {
        if (!state.enabled || !target || !(amount > 0)) return;
        const p = centerOf(target);
        let base = null;
        if (source && source !== target) {
            const s = centerOf(source);
            base = Math.atan2(p.y - s.y, p.x - s.x); // Funken fliegen vom Angreifer weg
        }
        const n = Math.round(Math.min(22, 5 + amount * 0.5));
        for (let i = 0; i < n; i++) {
            const angle = base === null ? rand(0, Math.PI * 2) : base + rand(-0.9, 0.9);
            spark(p.x, p.y, angle, rand(2, 6.5), rand(0.3, 0.7), rand(0.1, 0.22), HIT_COLORS[(Math.random() * HIT_COLORS.length) | 0]);
        }
        ring(p.x, p.y, 0.9, 0.3, 'rgba(255, 120, 80, 1)');
        text(p.x, p.y - 0.5, `-${Math.round(amount)}`, target instanceof Tribute ? '#ff6b5e' : '#ffb35e');
    }

    function onDeath({
        tribute
    }) {
        if (!state.enabled || !tribute) return;
        const p = centerOf(tribute);
        const colors = [tribute.color, tribute.color, '#d6d6d6', '#5a5a5a'];
        for (let i = 0; i < 26; i++) {
            spark(p.x, p.y, rand(0, Math.PI * 2), rand(1.5, 7), rand(0.6, 1.2), rand(0.12, 0.28), colors[(Math.random() * colors.length) | 0]);
        }
        ring(p.x, p.y, 2.6, 0.7, 'rgba(255, 255, 255, 1)');
        ring(p.x, p.y, 1.6, 0.5, tribute.color);
    }

    function onAnimalDeath({
        animal
    }) {
        if (!state.enabled || !animal) return;
        const p = centerOf(animal);
        for (let i = 0; i < 12; i++) {
            spark(p.x, p.y, rand(0, Math.PI * 2), rand(1, 4), rand(0.4, 0.8), rand(0.12, 0.24), ['#8a3a14', '#ff5a1f', '#4a1304'][(Math.random() * 3) | 0]);
        }
        ring(p.x, p.y, 1.4, 0.4, 'rgba(255, 90, 31, 1)');
    }

    function onHeal({
        tribute,
        amount
    }) {
        if (!state.enabled || !tribute) return;
        const p = centerOf(tribute);
        for (let i = 0; i < 7; i++) plus(p.x, p.y, '#7dff8a');
        text(p.x, p.y - 0.5, `+${Math.round(amount)}`, '#7dff8a');
    }

    // Richtungswechsel erkennen: Blickrichtung (Vorzeichen von dx/dy) ändert sich
    function onMoved({
        tribute,
        move
    }) {
        const dx = Math.sign(move.dx),
            dy = Math.sign(move.dy);
        if (dx === 0 && dy === 0) return;
        const prev = heading.get(tribute);
        const next = {
            dx,
            dy,
            lastTurn: prev ? prev.lastTurn : -99
        };
        heading.set(tribute, next);
        if (!state.enabled || !prev || (prev.dx === dx && prev.dy === dy)) return;
        if (simTick - prev.lastTurn < TURN_COOLDOWN_TICKS) return;
        next.lastTurn = simTick;

        const p = centerOf(tribute);
        const uTurn = prev.dx * dx + prev.dy * dy < 0;
        const behind = Math.atan2(-dy, -dx);
        if (uTurn) {
            // Kehrtwende: Fächer in neue Richtung + kleiner Ring
            const ahead = Math.atan2(dy, dx);
            for (let i = 0; i < 9; i++) spark(p.x, p.y, ahead + rand(-0.8, 0.8), rand(2, 4.5), rand(0.25, 0.45), rand(0.09, 0.15), tribute.color);
            ring(p.x, p.y, 0.8, 0.28, tribute.color);
        } else {
            for (let i = 0; i < 4; i++) spark(p.x, p.y, behind + rand(-0.7, 0.7), rand(0.8, 2.2), rand(0.2, 0.4), rand(0.07, 0.12), tribute.color);
        }
    }

    function update(dt) {
        if (particles.length === 0) return false;
        for (const p of particles) {
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const damp = Math.max(0, 1 - p.drag * dt);
            p.vx *= damp;
            p.vy *= damp;
        }
        particles = particles.filter(p => p.life > 0);
        return particles.length > 0;
    }

    function draw(c, v, o) {
        if (!particles.length) return;
        c.save();
        c.lineCap = 'round';
        const fontSize = Math.max(11, Math.min(18, v.ppt * 0.6));
        c.font = `800 ${fontSize}px "DM Sans", system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (const p of particles) {
            const a = Math.max(0, Math.min(1, p.life / p.max));
            const sx = (p.x - v.x0) * v.ppt,
                sy = (p.y - v.y0) * v.ppt;
            if (sx < -50 || sy < -50 || sx > v.w + 50 || sy > v.h + 50) continue;
            switch (p.kind) {
                case 'spark': {
                    const s = Math.max(1.5, p.size * v.ppt * (0.4 + 0.6 * a));
                    c.globalAlpha = a;
                    c.fillStyle = p.color;
                    c.fillRect(sx - s / 2, sy - s / 2, s, s);
                    break;
                }
                case 'ring': {
                    const progress = 1 - a;
                    c.globalAlpha = a * 0.9;
                    c.strokeStyle = p.color;
                    c.lineWidth = Math.max(1.5, v.ppt * 0.08 * a + 1);
                    c.beginPath();
                    c.arc(sx, sy, Math.max(1, p.size * v.ppt * (0.25 + 0.75 * progress)), 0, Math.PI * 2);
                    c.stroke();
                    break;
                }
                case 'plus': {
                    const s = Math.max(2, p.size * v.ppt);
                    c.globalAlpha = a;
                    c.fillStyle = p.color;
                    c.fillRect(sx - s / 2, sy - s / 6, s, s / 3);
                    c.fillRect(sx - s / 6, sy - s / 2, s / 3, s);
                    break;
                }
                case 'text': {
                    if (!o.numbers || v.ppt < 8) break;
                    c.globalAlpha = Math.min(1, a * 1.6);
                    c.lineWidth = 3;
                    c.strokeStyle = 'rgba(15, 5, 20, 0.85)';
                    c.strokeText(p.label, sx, sy);
                    c.fillStyle = p.color;
                    c.fillText(p.label, sx, sy);
                    break;
                }
            }
        }
        c.restore();
    }

    SimEvents.on('damage', onDamage);
    SimEvents.on('death', onDeath);
    SimEvents.on('animalDeath', onAnimalDeath);
    SimEvents.on('heal', onHeal);
    SimEvents.on('moved', onMoved);

    return {
        state,
        update,
        draw,
        active: () => particles.length > 0,
        clear() {
            particles = [];
        }
    };
})();

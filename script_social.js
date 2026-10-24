/* =====================================================================
 * Soziales: Bindungsstärke, Karma und Freundschaftsbruch
 *
 * Jeder Tribut bewertet seine Freundschaften individuell (social.bond,
 * 0..1, einseitig). Aus der Bindung ergibt sich z. B., ob er einen
 * geschwächten Freund beschützt, zurücklässt oder sogar angreift.
 * Freundes-Freunde zählen mit abgeschwächter Bindung.
 * ===================================================================== */

const BOND_MIN_START = 0.15; // zufällige Startbindung zwischen Freunden (manche Freundschaften sind von Anfang an schlecht)
const BOND_MAX_START = 0.95;
const FRIEND_OF_FRIEND_BOND_FACTOR = 0.8;
const FRIEND_OF_FRIEND_MIN_BOND = 0.2; // Freunde von Freunden zählen erst, wenn die Bindung zum gemeinsamen Freund mindestens so stark ist
const BOND_BREAK_THRESHOLD = 0.3; // darunter zerbricht eine Freundschaft nach schlechtem Karma

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

// Erweiterte Einstellungen (Menü "Arena-Einstellungen"): zeigt in den Profilen die Freundschaftsstärke-Regler
let advancedSettings = false;
// Manuell gesetzte Freundschaftsstärken (1..100), gegenseitig; Schlüssel "kleinereID-größereID". Nur diese kommen in den Tributen-Code.
const manualBonds = new Map();

function bondKey(idA, idB) {
    return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

// Setzt die Stärke einer Freundschaft für beide Seiten und merkt sie sich als manuell
function setMutualBond(a, b, percent) {
    const value = Math.min(100, Math.max(1, Math.round(percent)));
    if (!a.social.bond) a.social.bond = {};
    if (!b.social.bond) b.social.bond = {};
    a.social.bond[b.id] = value / 100;
    b.social.bond[a.id] = value / 100;
    manualBonds.set(bondKey(a.id, b.id), value);
    return value;
}

// Vergisst die Bindung zwischen zwei Tributen (Freundschaft wurde aufgehoben)
function forgetBond(a, b) {
    if (a.social.bond) delete a.social.bond[b.id];
    if (b.social.bond) delete b.social.bond[a.id];
    manualBonds.delete(bondKey(a.id, b.id));
}

Object.assign(Tribute.prototype, {
    // Bindung zu einem direkten Freund (wird beim ersten Zugriff zufällig festgelegt)
    directBond(otherId) {
        if (!this.social.bond) this.social.bond = {};
        if (this.social.bond[otherId] === undefined) {
            this.social.bond[otherId] = BOND_MIN_START + Math.random() * (BOND_MAX_START - BOND_MIN_START);
        }
        return this.social.bond[otherId];
    },

    // Lebende Tribute, die mit beiden befreundet sind
    mutualFriends(other) {
        return tributes.filter(t => t !== this && t !== other && t.alive && this.isFriend(t) && other.isFriend(t) &&
            this.directBond(t.id) >= FRIEND_OF_FRIEND_MIN_BOND && t.directBond(other.id) >= FRIEND_OF_FRIEND_MIN_BOND);
    },

    // Gemeinsame Zeit stärkt die Freundschaft
    growBondWith(friend) {
        const current = this.directBond(friend.id); // legt social.bond bei Bedarf an
        this.social.bond[friend.id] = Math.min(1, current + 0.002);
    },

    // Gesamtbindung zu einem anderen Tribut (0 = weder Freund noch Freundes-Freund)
    bondWith(other) {
        if (!other || other === this) return 0;
        let bond;
        if (this.isFriend(other)) {
            bond = this.directBond(other.id);
        } else {
            const mutual = this.mutualFriends(other);
            if (mutual.length === 0) return 0;
            bond = Math.max(...mutual.map(m => this.directBond(m.id) * m.directBond(other.id))) * FRIEND_OF_FRIEND_BOND_FACTOR;
        }
        const hostility = this.social.hostility[other.id] || 0;
        return clamp01(bond - hostility * 0.5);
    }
});

// Beendet eine Freundschaft beidseitig und macht beide misstrauisch
function breakFriendship(a, b, reason) {
    manualBonds.delete(bondKey(a.id, b.id));
    a.friends = a.friends.filter(id => id !== b.id);
    b.friends = b.friends.filter(id => id !== a.id);
    [
        [a, b],
        [b, a]
    ].forEach(([self, other]) => {
        self.social.trust[other.id] = Math.min(self.social.trust[other.id] ?? 1, 0.25);
        self.social.hostility[other.id] = Math.max(self.social.hostility[other.id] || 0, 0.45);
        if (self.social.bond) delete self.social.bond[other.id];
        const ai = self.getAI();
        if (ai.leaderId === other.id) ai.leaderId = null;
    });
    logInfo(I18N.t('log.friendshipBreaks', { a: a.name, b: b.name, reason }));
    updateProfiles();
}

// Schlechtes Karma: Wer einen Tribut tötet, verspielt das Vertrauen von dessen Freunden.
// Ist der Killer selbst mit einem Freund des Opfers befreundet, kann diese Freundschaft zerbrechen.
function processKillKarma(killer, victim) {
    for (const witness of tributes) {
        if (!witness.alive || witness === killer || witness === victim) continue;
        const cared = witness.bondWith(victim);
        if (cared < 0.2) continue;

        const trust = witness.social.trust[killer.id] ?? 0.5;
        witness.social.trust[killer.id] = clamp01(trust - cared * 0.5);
        witness.social.hostility[killer.id] = clamp01((witness.social.hostility[killer.id] || 0) + cared * 0.5);

        if (!witness.isFriend(killer)) continue;

        const bondAfter = clamp01(witness.directBond(killer.id) - (0.15 + 0.6 * cared));
        witness.social.bond[killer.id] = bondAfter;
        if (bondAfter < BOND_BREAK_THRESHOLD || witness.social.hostility[killer.id] > 0.6) {
            breakFriendship(witness, killer, I18N.t('log.killedReason', { killer: killer.name, victim: victim.name }));
        } else {
            logInfo(I18N.t('log.trustsLess', { witness: witness.name, killer: killer.name, victim: victim.name }));
        }
    }
}

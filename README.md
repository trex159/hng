# Hungerspiele Simulation

**Inoffizielles Fanprojekt, aktuelle Version HNG 11.2**

Eine Browser-Simulation, in der bis zu 48 Tribute auf einer zufällig generierten Arena um das Überleben kämpfen. Jeder Tribut trifft seine Entscheidungen selbst: Er sucht Waffen, schließt Freundschaften, flieht vor Gefahren, regeneriert sich, rächt sich und kann Freunde verraten. Du bist der Gamemaker und greifst mit Wetter, Wildtieren, Heilung und Endspiel ein.

Die Simulation versteht sich als einer der realistischsten kostenlos verfügbaren Hungerspiele-Simulatoren. Dahinter stehen viele ineinandergreifende Systeme für Kampf, Wahrnehmung, soziales Verhalten und Umwelt, die im Folgenden beschrieben werden.

> **Wichtiger Hinweis:** Dies ist ein unabhängiges, nicht-kommerzielles Fanprojekt, inspiriert von *"Die Tribute von Panem"* (*The Hunger Games*) von Suzanne Collins. Es besteht keine Verbindung, Zusammenarbeit oder Zustimmung seitens Suzanne Collins, Lionsgate, Scholastic oder anderer Rechteinhaber. Alle Inhalte (Code, Logik, Texte, Darstellung) wurden eigenständig entwickelt und enthalten kein Originalmaterial aus den Büchern oder Filmen. Details stehen im [Disclaimer](Disclaimer.html).

---

## Inhaltsverzeichnis

1. [Schnellstart](#schnellstart)
2. [Funktionen im Überblick](#funktionen-im-überblick)
3. [Die Arena](#die-arena)
4. [Die Tribute](#die-tribute)
5. [Wahrnehmung](#wahrnehmung)
6. [Entscheidungsfindung und Bewegung](#entscheidungsfindung-und-bewegung)
7. [Soziales System](#soziales-system)
8. [Kampfsystem](#kampfsystem)
9. [Umwelt, Gefahren und Wetter](#umwelt-gefahren-und-wetter)
10. [Wildtiere](#wildtiere)
11. [Endspiel](#endspiel)
12. [Gamemaker-Steuerung](#gamemaker-steuerung)
13. [Vollbild-Ansicht](#vollbild-ansicht)
14. [Statistik und Auswertung](#statistik-und-auswertung)
15. [Speichern und Laden](#speichern-und-laden)
16. [Technik und Dateien](#technik-und-dateien)
17. [Lizenz und Rechtliches](#lizenz-und-rechtliches)

---

## Schnellstart

1. Seite öffnen. Es wird sofort eine Arena angezeigt.
2. Optional: Seed eingeben und **Arena zufällig generieren** drücken, Anzahl der Tribute (5 bis 48) wählen und Profile anpassen.
3. Optional: Gelände mit dem Pinsel nachbearbeiten (Wiese, Wasser, Lava, Wald, Felsen, Fallen).
4. **Start Simulation** drücken und zuschauen. Mit den Gamemaker-Knöpfen eingreifen.

Die Simulation läuft vollständig lokal im Browser. Es sind keine Installation, kein Konto und keine Bibliothek nötig.

---

## Funktionen im Überblick

| Bereich | Inhalt |
|---|---|
| Arena | 200 x 200 Felder, prozedural generiert (Perlin Noise, Fluss, Wälder, Felsen), seedbar, von Hand editierbar |
| Tribute | 5 bis 48, mit Name, Alter, Geschlecht, Verhalten, Eigenschaften, Farbe und Freunden, alles editierbar |
| Algorithmus | Wahrnehmung mit Sichtweite, "Gesehen"-Karte, Suchlinien, Ruheplätze, Gruppenbildung, Anführer, Beschützen und Zurücklassen |
| Soziales | Vertrauen, Angst, Feindseligkeit, Bindungsstärke, Gerüchte, Karma bei Tötungen, Freundschaftsbruch |
| Kampf | Angriff, Gegenangriff, Waffen, Alter, Verletzungen, Rache, Angst vor Killern, Rückzug |
| Umwelt | Wasser, Wald, Fels, Fallen, Lava, Wetter (Nebel, Regen, Schnee), Regeneration, Kälteschaden |
| Wildtiere | Frei platzierbar, mit einstellbarem Leben und Schaden |
| Gamemaker | Pause, Tempo, Wildtier, Heilung, Wetter, Endspiel, Endspiel pausieren |
| Anzeige | Vorschau, Vollbild mit Kamera und Minimap, Partikeleffekte, Log mit Filtern |
| Auswertung | Tabelle, Balkendiagramme, Heatmaps, Laufwege |
| Daten | Arena-Code und Tributen-Code zum Teilen und Laden, Vorlagen |

---

## Die Arena

- **Größe:** 200 x 200 Felder. Anzahl und Größe der Landschaftselemente skalieren mit der Arenagröße mit.
- **Generierung:** Das Gelände entsteht aus mehrschichtigem Perlin Noise (mehrere Oktaven). Wiesen und Wälder werden miteinander verbunden und abgerundet, Felsen und Baumgruppen entstehen als verrauschte Flecken.
- **Fluss:** Ein Fluss mit natürlichen Windungen zieht sich durch die Arena. Er hält immer Abstand zum Startbereich in der Mitte und umläuft ihn bei Bedarf auf einem Bogen.
- **Seed:** Ein Zahlen- oder Textseed erzeugt immer dieselbe Arena. So lassen sich interessante Arenen teilen und wiederholen.
- **Geländearten:** Wiese, Wasser, Lava, Wald, Fels, Falle. Jede Art hat Auswirkungen auf Bewegung, Sicht oder Überleben (siehe [Umwelt](#umwelt-gefahren-und-wetter)).
- **Editor:** Vor dem Start lässt sich das Gelände mit einem Pinsel (Größe 1 bis 20) selbst malen, auch in der Vollbild-Ansicht.
- **Texturen:** Jede Geländeart hat drei Texturvarianten, die je Feld per Hash verteilt werden. Fehlende Texturdateien werden durch eingebaute prozedurale Texturen ersetzt.

---

## Die Tribute

Jeder Tribut hat:

- **Name:** Zufällig aus je einer Liste männlicher und weiblicher Vornamen und einer Liste von Nachnamen, frei änderbar.
- **Alter** zwischen 12 und 18 Jahren.
- **Geschlecht** (männlich oder weiblich).
- **Verhalten:** *aggressiv*, *defensiv* oder *ängstlich*. Es bestimmt Ziele, Risikobereitschaft und Fluchtverhalten.
- **Eigenschaften** (jeweils mit etwa einem Drittel Wahrscheinlichkeit):
  - **stark:** mehr Angriffsschaden
  - **schlau:** erkennt Fallen, liest Spuren (größere Reichweite beim Aufspüren anderer), nutzt Waffen besser
  - **beliebt:** wird von Gegnern eher gemieden, weil niemand dem Tribut schaden möchte
- **Leben** (100 Punkte), eigene Farbe, Waffen, Kills, Schadensbilanz, zurückgelegte Distanz.
- **0 bis 2 zufällige Freunde** zu Beginn. Freundschaften sind gegenseitig und starten mit vollem Vertrauen. (Können gerne deutlich mehr Freunde werden)

Zu Beginn stehen alle Tribute in einem Kreis um die Mitte, in der Mitte liegen 5 bis 15 Waffen.

---

## Wahrnehmung

Tribute wissen nicht alles. Sie handeln nach dem, was sie wahrnehmen und sich merken.

- **Sichtweite:** Grundsichtweite 25 Felder, angepasst durch Gelände und Wetter:
  - im Wald auf 60 %, auf Felsen auf 140 %
  - Nebel 40 %, Regen 75 %, Schnee 50 %
  - Schlaue Tribute können zusätzlich Spuren lesen und andere Tribute auf größere Entfernung aufspüren.
- **"Gesehen"-Karte:** Jeder Tribut führt eine eigene Karte aus 5 x 5 großen Zellen mit dem Zeitpunkt der letzten Sichtung. Was lange nicht gesehen wurde, gilt als unbekannt (Vergessenskurve).
- **Gedächtnis:** Die letzte bekannte Position anderer Tribute wird für eine begrenzte Zeit gemerkt (Nicht-Freunde etwa 80 Zeitpunkte, Jagdziele etwa 100, Freunde etwa 200).
- **Gefahrenerkennung:** Lava und Wildtiere werden in Sichtweite erkannt und gemieden. Fallen erkennen nur schlaue Tribute rechtzeitig.

---

## Entscheidungsfindung und Bewegung

Jeder Tribut entscheidet in jedem Zeitpunkt nach einer festen Prioritätenfolge:

1. **Lebensgefahr:** Lava in Sichtweite, bei schlauen Tributen auch Fallen: ausweichen.
2. **Wildtier in Sicht:** Flucht, bei allen Verhaltenstypen.
3. **Waffen:** Aggressive Tribute laufen direkt zur nächsten Waffe. Defensive und ängstliche Tribute holen sich Waffen nur, wenn keine Gegner in der Nähe sind (defensive mit kleiner Restchance).
4. **Gegner im Blick:** Verhalten und Einschätzung entscheiden über Angriff oder Rückzug (siehe unten).
5. **Suchverhalten:** Wenn nichts davon zutrifft, wählt der Tribut einen Suchmodus.

### Einschätzung von Gegnern

Der nächste "Feind" wird nicht einfach nach Entfernung gewählt. Ein Bewertungswert berücksichtigt Distanz, Feindseligkeit (macht zum Ziel), Angst und Vertrauen (machen zum Meidewert).

- **Aggressive** Tribute greifen an, wenn sie sich gegenüber dem Ziel stark genug fühlen. Schlaue rechnen dabei vorsichtiger und greifen nur mit klarem Gesundheitsvorsprung an. Starke Tribute mit ausreichend Leben riskieren mehr. Hinzu kommt eine kleine Restchance für Übermut.
- **Defensive** Tribute greifen nur in kurzer Entfernung und bei guten Chancen an, sonst weichen sie aus.
- **Ängstliche** Tribute meiden Kontakt, verstecken sich im Wald oder rennen weg.

### Suchmodi

Das Suchverhalten ersetzt ziellosen Zufallslauf. Tribute laufen lange gerade Linien und wählen die Linie, die am meisten unbekannte oder lange nicht gesehene Fläche aufdeckt. Dazu werden pro Planung 16 Richtungen und mehrere Linienlängen bewertet.

| Modus | Verhalten |
|---|---|
| `hunt` | Aggressive Tribute mit viel Leben (ab 80) suchen gezielt nach Nicht-Freunden |
| `friends` | Wer Freunde hat, aber keine in der Nähe, sucht sie und meidet Fremde |
| `wander` | Ziellose Erkundung, Fremde werden gemieden |
| `rest` | Ruheplatz aufsuchen und dort regenerieren |
| `follow` | Als Mitglied einer Gruppe dem Anführer folgen |
| `guard` | Bei einem geschwächten Freund bleiben und ihn beschützen |
| `attack` | Ein früheres Gruppenmitglied angreifen, das zur Last geworden ist |

### Ruhe und Regeneration

Verletzte Tribute und Einzelgänger ziehen sich eher zurück. Die Wahrscheinlichkeit steigt mit dem Verlust an Leben und ist bei ängstlichen Tributen höher. Ruheplätze werden bewertet: Wald ist beliebt, Abstand zum Zentrum und zu bekannten Feinden ebenfalls, Wasser, Lava und Fallen werden ausgeschlossen.

### Bewegung im Gelände

- **Wasser** halbiert die Geschwindigkeit.
- **Wald** bietet Versteckmöglichkeiten. Ängstliche und defensive Tribute flüchten gezielt in angrenzende Waldfelder.
- **Rand der Arena:** Wer an den Rand gedrängt wird, flieht zur Mitte statt in die Sackgasse.

---

## Soziales System

Das soziale Verhalten ist ein eigenes, vielschichtiges System. Jeder Tribut führt für jeden anderen Tribut vier Werte:

- **Vertrauen** (0 bis 1)
- **Angst** (0 bis 1)
- **Feindseligkeit** (0 bis 1, Rache)
- **Bindungsstärke** (nur bei Freunden, einseitig, zufälliger Start zwischen 0,15 und 0,95)

### Freundschaften

- Freunde greifen sich nicht an, solange mehr als zwei Tribute leben und nicht nur noch Freunde übrig sind. Sie weigern sich und helfen stattdessen: Wird ein Freund angegriffen, geht der Tribut gegen den Angreifer vor.
- **Freundes-Freunde** werden mit abgeschwächter Bindung behandelt und häufig toleriert.
- **Gemeinsame Zeit** stärkt Freundschaften langsam.
- Hohes **Vertrauen** schützt auch Nicht-Freunde vor Angriffen, solange noch mehr als drei Tribute leben.

### Gerüchte und Warnungen

Treffen sich Freunde ohne Feinde in der Nähe, tauschen sie Informationen aus: Sie warnen sich vor gefährlichen Tributen, geben Misstrauen weiter und teilen starke Feindschaften. Je mehr gemeinsame Freunde dabei sind, desto schwächer wird das Gerücht. Feindschaften übertragen sich abgeschwächt.

### Gruppen

- Freunde, die sich sehen, können sich zu **Gruppen mit bis zu 6 Mitgliedern** zusammenschließen. Die Chance hängt von der Bindungsstärke ab.
- Der **Anführer** wird nach einem Führungswert bestimmt (Verhalten, Leben, Stärke, Intelligenz).
- Die Gruppe zieht als Pulk. Die Mitglieder halten einen Abstand von mindestens 2 Feldern zum Anführer, um nicht ständig Kämpfe unter Freunden auszulösen.

### Geschwächte Freunde

Fällt ein Freund unter 35 Leben, reagieren stärkere Tribute (ab 55 Leben) je nach Bindung:

- **Beschützen:** Bei starker Bindung bleibt der Tribut beim Verletzten und bewacht ihn.
- **Zurücklassen:** Bei schwacher Bindung wird der Geschwächte zurückgelassen und eine Weile ignoriert.
- **Verrat:** Bei sehr schwacher Bindung oder hoher Feindseligkeit zerbricht die Freundschaft, und der frühere Freund wird angegriffen.

### Karma und Rache

- Wer einen Tribut tötet, verspielt das Vertrauen der Freunde des Opfers. Deren Feindseligkeit gegen den Killer steigt.
- Ist der Killer selbst mit einem Freund des Opfers befreundet, kann diese Freundschaft zerbrechen. Beide sind danach misstrauisch und feindselig.
- Feindseligkeit führt zu **Rache**: Der Tribut sucht den Verursacher gezielt und kämpft mit erhöhter Kraft.

---

## Kampfsystem

Kämpfe entstehen, wenn zwei Tribute auf benachbarten Feldern stehen. Ob und wie gekämpft wird, entscheidet eine Kette von Prüfungen, bevor Schaden entsteht.

### Entscheidung vor dem Schlag

1. **Freunde und Freundes-Freunde** werden verschont (siehe Soziales System).
2. **Vertrauen** über 0,7 verhindert einen Angriff.
3. **Angst:** Bei hoher Angst vor dem Gegner zieht sich der Tribut mit einer Wahrscheinlichkeit zurück, die der Angst entspricht.
4. **Altersunterschied:** Deutlich jüngere und verängstigte Tribute weichen älteren und gesünderen Gegnern aus.
5. **Beliebte Gegner** werden von vielen gemieden.
6. **Hemmung:** Wer deutlich gesünder als der Gegner ist, scheut sich gelegentlich vor dem Töten, solange noch viele Tribute leben.

### Schadensberechnung

Der Grundschaden liegt zufällig zwischen 5 und 20. Darauf wirken viele Modifikatoren:

| Faktor | Wirkung |
|---|---|
| Eigenschaft *stark* | +5 Schaden |
| Eigenschaft *schlau* | +1 Schaden, Waffenschaden x 1,2 |
| **Waffen** | Eine starke Waffe (Stärke ab 11) oder bis zu zwei schwache Waffen, deren Stärke addiert wird |
| **Verletzung** | Wer verletzt ist und einem gesünderen Gegner gegenübersteht, macht deutlich weniger Schaden (Abzug 5 bis 15) |
| **Alter** | Älterer Tribut hat bei großem Altersunterschied einen Vorteil (bis +15), jüngerer einen Nachteil (bis -10) |
| **Geschlecht** | Kleine, geschlechtsabhängige Modifikatoren auf den Schaden |
| **Rache** | Bei Feindseligkeit über 0,5 steigt der Schaden um den Faktor (1 + Feindseligkeit) |
| **Angst vor Killern** | Gegen Tribute mit 4 oder mehr Kills und klarer Überlegenheit wird zunächst Fluchtinstinkt ausgelöst. Panik kann kurzzeitig Schaden erhöhen |
| **Angst allgemein** | Bei dauerhafter Angst schwankt der Schaden: mal gehemmt, mal von Adrenalin gestärkt |
| **Aggressivität** | Unüberlegte Aggressivität ohne Intelligenz kann zu Fehlschlägen führen |

### Folgen eines Treffers

- Das Opfer verliert Leben, der Angreifer bucht Schaden und Verlauf.
- Das Opfer entwickelt **Angst** vor dem Angreifer (je stärker der Treffer, desto mehr), der Angreifer wird **feindseliger** gegen das Opfer.
- Mit 60 % Wahrscheinlichkeit folgt ein **Gegenangriff** mit eigener Schadensberechnung.
- Stirbt ein Tribut, wird der Kill gezählt und das Karma-System ausgelöst.
- Der Kampf pausiert die natürliche Regeneration.

---

## Umwelt, Gefahren und Wetter

### Gelände

| Gelände | Wirkung |
|---|---|
| Wiese | Normale Bewegung und Sicht |
| Wasser | Halbe Geschwindigkeit |
| Wald | Sicht auf 60 %, Versteckmöglichkeit, bevorzugter Ruheplatz |
| Fels | Sicht auf 140 % (Aussichtspunkt) |
| Falle | Mit 40 % Wahrscheinlichkeit sofort tödlich, sonst 15 bis 65 Schaden. Schlaue Tribute erkennen und meiden Fallen |
| Lava | Sofortiger Tod, wird von allen gemieden |

### Regeneration

Nach 40 Zeitpunkten ohne Kampf regenerieren Tribute langsam. Beim Ruhen ist die Regeneration dreimal so schnell. Bruchteile von Leben werden aufgesammelt und erst ausgezahlt, wenn sie ein ganzes Lebenspunkt ergeben.

### Wetter

Das Wetter wird vom Gamemaker gesteuert:

| Wetter | Sicht | Regeneration | Besonderheit |
|---|---|---|---|
| Gutes Wetter | 100 % | 100 % | |
| Nebel | 40 % | 100 % | Tribute sehen kaum etwas |
| Regen | 75 % | 50 % | |
| Schnee | 50 % | keine | **Kälteschaden:** je stärker verwundet, desto höher |

Das Wetter wird auch grafisch dargestellt (fallender Regen und Schnee, Nebelschleier).

---

## Wildtiere

Der Gamemaker kann Wildtiere in die Arena schicken:

- **Position:** Zufällig oder per Klick frei gewählt (in Vorschau und Vollbild).
- **Werte:** Leben und Schadensbereich (von/bis) sind einstellbar. Standard sind 60 Leben und 5 bis 20 Schaden.
- **Verhalten:** Tiere sind doppelt so schnell wie Tribute, jagen den nächsten Tribut und greifen ihn an. Lava wird gemieden.
- **Reaktion der Tribute:** Alle Verhaltenstypen fliehen vor Wildtieren. Wird ein Tribut angegriffen und überlebt, wehrt er sich mit eigenem Schaden.
- Tiere können getötet werden und verschwinden im Endspiel.

---

## Endspiel

Das Endspiel beginnt automatisch, wenn nur noch drei Tribute leben, oder manuell durch den Gamemaker.

1. Alle Tribute werden zur Mitte der Arena getrieben.
2. Nach kurzer Verzögerung beginnt die **Lava** von den Rändern her nach innen zu wandern und verengt die Arena stetig.
3. Alle Wildtiere verschwinden.
4. Der Kampf endet, wenn nur noch ein Tribut übrig ist (oder niemand überlebt).

Der Gamemaker kann das Endspiel jederzeit **pausieren** und fortsetzen.

---

## Gamemaker-Steuerung

| Funktion | Beschreibung |
|---|---|
| Start / Pause / Fortsetzen | Simulation steuern |
| Geschwindigkeit | Regler von 1 bis 30 |
| Wildtier loslassen | Zufällig oder per Klick, mit einstellbaren Werten |
| Tribut Heilung senden | Einen Tribut gezielt heilen |
| Wetter | Nebel, Regen, Schnee oder gutes Wetter |
| Endspiel / Endspiel pausieren | Lava früher auslösen oder anhalten |
| Arena-Editor | Vor dem Start Gelände malen |
| Profile | Name, Alter, Geschlecht, Verhalten, Eigenschaften, Farbe und Freunde jedes Tributs |

**Spielzeit:** Die Simulation zählt in *Zeitpunkten*. Ein Zeitpunkt ist ein Simulationsschritt. Die Zählung ist unabhängig vom Geschwindigkeitsregler und bleibt bei Pause stehen. Im Log lassen sich so zeitliche Abstände nachvollziehen.

**Log:** Alle Ereignisse werden protokolliert und lassen sich filtern (Alle, Angriffe, Tode, Info). Wiederholungen werden zusammengefasst.

---

## Vollbild-Ansicht

Eine eigene, scharfe Darstellung der Arena mit Kamera:

- **Mausrad:** Zoomen um die Mausposition
- **Ziehen:** Karte verschieben
- **Klick auf einen Tribut:** Die Kamera folgt ihm
- **Minimap** mit Sichtfeld
- **Hover-Info** zu Leben, Verhalten, Kills und Schaden
- **Ticker** mit den letzten Ereignissen
- **Optionen:** Namen, Lebensbalken, Schadenszahlen, Partikel, Raster
- **Steuerleiste:** Start, Pause, Tempo, Wetter, Endspiel, Wildtiere und vor dem Start der Arena-Editor

**Partikeleffekte** machen das Geschehen lesbar: Funken und Schadenszahlen bei Treffern, Druckwellen bei Toden, Staubspuren bei Richtungswechseln, aufsteigende Kreuze bei Heilung.

---

## Statistik und Auswertung

Während der Simulation werden Laufwege, Treffer und Todesorte aufgezeichnet. Die Auswertung bietet vier Ansichten:

- **Tabelle:** sortierbare Zahlen (Schaden verteilt und erlitten, Distanz, Kills, Überlebenszeit und mehr)
- **Balken:** jede Kategorie als Balkendiagramm
- **Heatmap:** Aufenthalt, Schaden oder Todesorte über die ganze Arena
- **Pfade:** Laufwege einzelner Tribute auf der Arena vor dem Endspiel. Wo sich Wege kreuzen oder wiederholen, wird die Linie kräftiger

Alle Diagramme werden selbst auf Canvas gezeichnet.

---

## Speichern und Laden

- **Arena-Code** und **Tributen-Code** lassen sich anzeigen, kopieren und wieder einlesen. So können Arenen und Besetzungen geteilt werden.
- **Seed** für reproduzierbare Arenen.
- **Vorlagen:** Fertige Arenen und Tributen-Sets können aus dem Ordner `vorlagen/` geladen werden.
- Die Optionen der Vollbild-Ansicht werden im Browser gespeichert (lokal, `localStorage`).

---

## Technik und Dateien

Reines HTML, CSS und JavaScript ohne Frameworks und ohne externe Bibliotheken. Die Seite lässt sich statisch hosten, zum Beispiel über GitHub Pages.

| Datei | Aufgabe |
|---|---|
| `index.html` | Oberfläche |
| `style.css` | Gestaltung |
| `script.js` | Simulationsschleife, Steuerung, Profile, Speichern und Laden |
| `script_logic.js` | Tribute und Wildtiere: Bewegung, Kampf, Umwelt |
| `script_search.js` | Such- und Gruppenverhalten, Ruhe, Jagd |
| `script_social.js` | Bindung, Karma, Freundschaftsbruch |
| `script_weather.js` | Wetter und Kälteschaden |
| `script_arena.js` | Arena-Generierung (Seed, Perlin Noise, Fluss) |
| `script_render.js` | Zeichnen von Gelände, Figuren und Tieren |
| `script_fx.js` | Partikeleffekte |
| `script_fullscreen.js` | Vollbild-Ansicht mit Kamera, Minimap und Steuerleiste |
| `script_events.js` | Ereignis-Bus, der Logik, Effekte, Statistik und Ticker entkoppelt |
| `script_stats.js` / `script_stats_ui.js` | Aufzeichnung und Anzeige der Statistik |
| `script_time.js` | Zeitpunkte (Spielzeit) |
| `script_layout.js` | Seitenlayout |
| `Disclaimer.html` | Haftungsausschluss |

Die Logik meldet nur, was geschehen ist. Darstellung, Partikel, Statistik und Ticker hören über den Ereignis-Bus zu. Dadurch lassen sich Systeme einzeln erweitern.

---

## Lizenz und Rechtliches

- **Fanprojekt:** Inoffiziell und nicht-kommerziell. Keine Verbindung zu Suzanne Collins, Lionsgate, Scholastic oder anderen Rechteinhabern der *Hunger Games*-Reihe. Es werden keine Originalbilder, Filmszenen, Texte oder Musikstücke aus den offiziellen Werken verwendet.
- **Lizenz:** Siehe License-Datei.
- **Datenschutz:** Es werden keine personenbezogenen Daten gespeichert. Alles wird lokal im Browser verarbeitet.
- **Haftung:** Die Nutzung erfolgt auf eigene Verantwortung. Die Simulation stellt ausschließlich fiktive Ereignisse dar und enthält keine realen Personen. Mehr dazu im [Disclaimer](Disclaimer.html).

---

*© 2025 / 2026 Hungerspiele Simulation (Fanprojekt). Game-design komplett eigenständig entwickelt, Code mit starker KI-unterstützung umgesetzt.*

*English summary: This is an independent, non-commercial fan-made simulation inspired by "The Hunger Games" by Suzanne Collins. It is not affiliated with or endorsed by any rights holder. All content is original and provided for educational and entertainment purposes only.*

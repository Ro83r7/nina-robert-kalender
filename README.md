# Nina & Robert Kalender

Gemeinsamer Kalender mit Wochen-, Monats- und Jahresansicht. Termine sind farbcodiert:

- 🩷 Rosa = Nina allein
- 🔵 Blau = Robert allein
- 🟢 Grün = Zusammen

## Funktionen

- Woche, Monat, Jahr und Liste – die zuletzt genutzte Ansicht wird gemerkt
- Countdown zum nächsten gemeinsamen Termin und „Als Nächstes“-Liste (60 Tage)
- Filter pro Person (Chips oben)
- Wiederholungen: wöchentlich, monatlich, jährlich (Geburtstage, Jahrestag …)
- Symbol (Emoji), Ort und Notiz pro Termin
- Termine per Drag & Drop verschieben; Verschieben und Löschen lassen sich rückgängig machen
- Bundesweite Feiertage, Kalenderwochen, Dunkelmodus
- Offline-fähig: Änderungen ohne Netz werden später automatisch übertragen
- Auf dem Handy: „Zum Home-Bildschirm“ hinzufügen → eigene App mit Icon
- Tastatur: `n` neuer Termin, `t` heute, `←`/`→` blättern, `Esc` schließen, `⌘/Strg+Enter` speichern
- `?demo` an die URL anhängen → Testmodus, nichts wird gespeichert

Termine werden in Firebase (Firestore) gespeichert und erscheinen in Echtzeit bei euch beiden. Die Einrichtung unten ist bereits erledigt und nur als Referenz dokumentiert.

## Einrichtung (einmalig)

### 1. Firebase-Projekt anlegen

1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com) und logge dich mit einem Google-Konto ein.
2. "Projekt hinzufügen" → Namen vergeben (z. B. `nina-robert-kalender`) → Google Analytics kann deaktiviert werden → Projekt erstellen.

### 2. Firestore-Datenbank aktivieren

1. Im Menü links: **Build → Firestore Database** → "Datenbank erstellen".
2. Modus: **Produktionsmodus** wählen, Standort z. B. `eur3 (europe-west)`.
3. Nach dem Erstellen: Tab **Regeln** öffnen und den Inhalt durch Folgendes ersetzen:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /events/{eventId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

   Das erlaubt Lesen/Schreiben nur für angemeldete (auch anonyme) Nutzer – siehe Sicherheitshinweis unten.

### 3. Anonyme Anmeldung aktivieren

1. Im Menü links: **Build → Authentication** → "Los geht's".
2. Tab **Sign-in method** → **Anonym** auswählen → aktivieren → speichern.

   Das läuft im Hintergrund ohne Login-Bildschirm – ihr merkt davon nichts.

### 4. Web-App-Konfiguration holen

1. Projektübersicht (Zahnrad oben links) → **Projekteinstellungen**.
2. Ganz unten bei "Meine Apps" → Web-Icon `</>` klicken → App registrieren (Name egal, z. B. "Kalender").
3. Es erscheint ein Codeblock mit `firebaseConfig = { apiKey: ..., ... }`. Diese Werte in die Datei [`firebase-config.js`](firebase-config.js) übertragen (die Platzhalter ersetzen).

### 5. Auf GitHub veröffentlichen

Sobald `firebase-config.js` ausgefüllt ist, die Änderungen committen und pushen – GitHub Pages aktualisiert die Seite automatisch nach ca. 1 Minute.

## Sicherheitshinweis

Das Repo ist öffentlich (Voraussetzung für kostenloses GitHub Pages). Das bedeutet:

- Jede:r, der/die die URL kennt, kann den Kalender sehen und bearbeiten.
- Die Firebase-Konfiguration (API-Key etc.) ist im Code sichtbar – das ist bei Firebase normal und kein Geheimnis, aber es bedeutet, dass grundsätzlich jeder mit der Konfiguration auf die Datenbank zugreifen könnte, sofern er sie findet.
- Die Firestore-Regel oben verlangt zumindest eine (anonyme) Firebase-Anmeldung, was zufälliges Finden/Missbrauch durch Bots erschwert, aber keine echte Zugriffskontrolle ist.

Für einen privaten Zwei-Personen-Kalender ohne sensible Daten (Termine, keine Passwörter o. Ä.) ist das ein akzeptabler Kompromiss. Falls mehr Sicherheit gewünscht ist, gerne jederzeit sagen – z. B. echtes Login mit Firebase Auth (Google-Login) und eine Regel, die nur eure beiden E-Mail-Adressen zulässt.

## Lokal testen

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen.

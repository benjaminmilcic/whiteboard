# Whiteboard App - Setup Anleitung

Eine Echtzeit-Whiteboard-App für dich und deine Tochter, gebaut mit Angular, Tailwind CSS v3, Angular Material und Firebase Realtime Database.

## Features

- Gemeinsames Zeichnen in Echtzeit
- 10 verschiedene Farben
- Einstellbare Strichstärke (1-20)
- Löschen-Funktion
- Touch- und Stift-Unterstützung für Tablets
- Responsive Design mit Tailwind CSS
- Material Design UI-Komponenten
- Signals für reaktive Zustände

## Voraussetzungen

- Node.js (v22.16.0 oder höher)
- npm (v10.9.2 oder höher)
- Firebase-Account

## Firebase-Setup

### 1. Firebase-Projekt erstellen

1. Gehe zu [Firebase Console](https://console.firebase.google.com/)
2. Klicke auf "Projekt hinzufügen"
3. Gib einen Projektnamen ein (z.B. "whiteboard-app")
4. Folge den Anweisungen bis das Projekt erstellt ist

### 2. Firebase Realtime Database aktivieren

1. In der Firebase Console, gehe zu "Build" → "Realtime Database"
2. Klicke auf "Datenbank erstellen"
3. Wähle einen Standort (z.B. "europe-west1")
4. Wähle "Im Testmodus starten" (später kannst du die Sicherheitsregeln anpassen)
5. Klicke auf "Aktivieren"

### 3. Sicherheitsregeln konfigurieren (wichtig!)

Ersetze die Standard-Sicherheitsregeln in der Realtime Database mit:

```json
{
  "rules": {
    "whiteboard": {
      "strokes": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

**Hinweis:** Diese Regeln erlauben jedem Lese- und Schreibzugriff. Für eine Produktionsumgebung solltest du strengere Regeln implementieren!

### 4. Web-App zu Firebase hinzufügen

1. In der Firebase Console, gehe zur Projektübersicht
2. Klicke auf das Web-Icon (</>)
3. Gib einen App-Namen ein (z.B. "whiteboard-web")
4. Klicke auf "App registrieren"
5. Kopiere die Firebase-Konfiguration (firebaseConfig-Objekt)

### 5. Firebase-Konfiguration einfügen

Öffne die Datei `src/environments/environment.ts` und ersetze die Platzhalter mit deinen echten Firebase-Credentials:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "DEIN_API_KEY",
    authDomain: "DEIN_AUTH_DOMAIN",
    databaseURL: "DEINE_DATABASE_URL",  // Wichtig für Realtime Database!
    projectId: "DEIN_PROJECT_ID",
    storageBucket: "DEIN_STORAGE_BUCKET",
    messagingSenderId: "DEINE_MESSAGING_SENDER_ID",
    appId: "DEINE_APP_ID"
  }
};
```

Mache das gleiche für `src/environments/environment.prod.ts`.

## Lokale Entwicklung

### 1. Abhängigkeiten installieren

Die Pakete sollten bereits installiert sein, falls nicht:

```bash
npm install
```

### 2. Entwicklungsserver starten

```bash
npm start
```

oder

```bash
npx ng serve
```

Öffne deinen Browser und navigiere zu `http://localhost:4200`.

## App testen

1. Öffne die App in zwei verschiedenen Browsertabs oder auf zwei verschiedenen Geräten
2. Zeichne in einem Tab/Gerät - die Zeichnung sollte sofort im anderen erscheinen
3. Teste die verschiedenen Farben und Strichstärken
4. Teste die Löschen-Funktion

## Build für Produktion

```bash
npm run build
```

Die Build-Artefakte werden im `dist/`-Verzeichnis gespeichert.

## Deployment auf Firebase Hosting

### 1. Firebase CLI installieren

```bash
npm install -g firebase-tools
```

### 2. Bei Firebase anmelden

```bash
firebase login
```

### 3. Firebase-Projekt initialisieren

```bash
firebase init
```

Wähle:
- "Hosting" (mit Leertaste auswählen)
- Wähle dein bestehendes Firebase-Projekt
- Public directory: `dist/whiteboard-app/browser` (wichtig!)
- Configure as single-page app: Yes
- Set up automatic builds and deploys with GitHub: No (optional)
- File already exists. Overwrite: No

### 4. Produktions-Build erstellen

```bash
npm run build
```

### 5. Zu Firebase deployen

```bash
firebase deploy
```

Nach dem Deployment erhältst du eine URL, unter der deine App öffentlich erreichbar ist!

## Verwendung

### Für dich (Laptop mit Stift)

- Öffne die App im Browser
- Wähle eine Farbe aus der Palette
- Stelle die gewünschte Strichstärke ein
- Zeichne mit der Maus oder dem Stift

### Für deine Tochter (Tablet mit Stift)

- Öffne die App im Browser des Tablets
- Die App unterstützt vollständig Touch-Eingaben und Stift-Eingaben
- Alles funktioniert genauso wie auf dem Laptop

### Löschen

- Der "Löschen"-Button entfernt alle Zeichnungen für beide Benutzer
- Es erscheint eine Sicherheitsabfrage vor dem Löschen

## Technologie-Stack

- **Angular 21** mit Signals und Standalone Components
- **Tailwind CSS v3** für Styling
- **Angular Material 21** für UI-Komponenten
- **Firebase Realtime Database** für Echtzeit-Synchronisation
- **TypeScript** für Type Safety
- **Canvas API** für Zeichnungen

## Architektur

Die App verwendet:
- **Signals** für reaktive Zustände (Farbe, Strichstärke, Zeichnen-Status)
- **Firebase Realtime Database** speichert jeden Strich als Objekt mit Punkten
- **Canvas API** für performantes Zeichnen
- **Touch Events** für optimale Tablet/Stift-Unterstützung
- **Mouse Events** für Desktop-Nutzung

## Troubleshooting

### Canvas bleibt leer

- Überprüfe die Firebase-Konfiguration in `environment.ts`
- Überprüfe die Browser-Console auf Fehler
- Stelle sicher, dass die Realtime Database aktiviert ist

### Zeichnungen werden nicht synchronisiert

- Überprüfe die Sicherheitsregeln in der Firebase Realtime Database
- Überprüfe die `databaseURL` in der Firebase-Konfiguration
- Öffne die Browser-Console und prüfe auf Fehlermeldungen

### Touch/Stift funktioniert nicht

- Stelle sicher, dass der Browser Touch-Events unterstützt
- Prüfe, ob die `touch-none` CSS-Klasse auf dem Canvas angewendet wird

## Nächste Schritte (Optional)

- Firebase Authentication hinzufügen für Benutzer-Management
- Mehrere Whiteboards/Räume erstellen
- Undo/Redo-Funktionalität
- Export als PNG/PDF
- Radiergummi-Tool
- Verschiedene Pinsel-Typen (Marker, Bleistift, etc.)

Viel Spaß beim Zeichnen mit deiner Tochter! 🎨

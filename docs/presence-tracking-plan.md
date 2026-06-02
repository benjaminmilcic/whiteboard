# Plan: Stale-Presence beheben (gestrichelte Linie für Hintergrund-Geräte)

> Umzusetzende Änderung — noch **nicht** implementiert. Auf Zuruf später ausführen.

## Problem

Jeder Client registriert seine Canvas-Größe unter `whiteboard/clients/${clientId}`.
`viewportBorder` ist das Minimum aller registrierten Größen und wird als blau
gestrichelte Linie angezeigt.

`onDisconnect(this.clientRef).remove()` löscht den Eintrag nur bei einer echten
Trennung der Realtime-Database-Verbindung. Wenn die App auf Android nur in den
**Hintergrund** geht (nicht geschlossen wird), bleibt die Verbindung bestehen →
der Eintrag bleibt → auf anderen Geräten (z. B. Desktop) wird weiterhin die
Smartphone-Linie angezeigt, obwohl niemand aktiv zeichnet.

## Lösung: Vorschlag 3 (Visibility + Heartbeat-Fallback) + Vorschlag 4 (Server-Zeit)

Zwei Mechanismen kombiniert:

1. **Page Visibility API** — meldet den Client sofort sauber ab/an.
2. **Heartbeat + Stale-Filter** — fängt Fälle ab, in denen kein Visibility-Event
   kommt (eingefrorene/abgestürzte App).
3. **Server-Zeit** — Staleness wird gegen die Firebase-Serverzeit geprüft, damit
   falsch gestellte Geräteuhren das Timeout nicht verfälschen.

### Betroffene Datei

`src/app/whiteboard/whiteboard.ts` (Logik) — HTML/Template bleibt unverändert,
da `viewportBorder` weiterhin wie bisher gerendert wird.

### Konkrete Schritte

#### 1. Client-Eintrag um `lastSeen` erweitern
`publishCanvasSize()` schreibt zusätzlich einen Zeitstempel:

```ts
private publishCanvasSize(): void {
  const canvas = this.canvasRef.nativeElement;
  set(this.clientRef, {
    width: canvas.width,
    height: canvas.height,
    lastSeen: serverTimestamp(),   // statt Date.now()
  });
}
```

- `serverTimestamp` aus `@angular/fire/database` importieren.

#### 2. Server-Zeit-Offset einlesen (Vorschlag 4)
Einmalig in `ngAfterViewInit` den Offset abonnieren, um lokale Zeit in
Server-Zeit umzurechnen:

```ts
private serverTimeOffset = 0;
// ...
onValue(ref(this.database, '.info/serverTimeOffset'), (snap) => {
  this.serverTimeOffset = snap.val() ?? 0;
});

private serverNow(): number {
  return Date.now() + this.serverTimeOffset;
}
```

#### 3. Heartbeat (nur wenn sichtbar)
Alle 5 s `publishCanvasSize()` aufrufen, solange die Seite sichtbar ist.
Interval beim Verstecken stoppen, beim Anzeigen wieder starten + sofort
publizieren.

```ts
private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
private readonly HEARTBEAT_MS = 5000;
private readonly STALE_MS = 15000;   // Client gilt nach 15 s ohne Heartbeat als inaktiv

private startHeartbeat(): void {
  this.stopHeartbeat();
  this.publishCanvasSize();
  this.heartbeatTimer = setInterval(() => this.publishCanvasSize(), this.HEARTBEAT_MS);
}

private stopHeartbeat(): void {
  if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
}
```

#### 4. Visibility-Handling
In `ngAfterViewInit` registrieren (und in `ngOnDestroy` wieder entfernen):

```ts
private onVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    this.stopHeartbeat();
    remove(this.clientRef);            // sofort abmelden
  } else {
    this.startHeartbeat();             // neu anmelden + Größe publizieren
  }
};

// ngAfterViewInit:
document.addEventListener('visibilitychange', this.onVisibilityChange);
this.startHeartbeat();   // ersetzt den bisherigen publishCanvasSize()-Aufruf
```

- Den bisherigen einzelnen `publishCanvasSize()`-Aufruf in `ngAfterViewInit`
  durch `startHeartbeat()` ersetzen.
- `onDisconnect(this.clientRef).remove()` **bleibt** als Absicherung für harte
  Verbindungsabbrüche bestehen.
- In den `resize`-Handlern weiterhin `publishCanvasSize()` aufrufen (oder den
  Heartbeat einfach den nächsten Wert schreiben lassen).

#### 5. Stale-Clients beim Berechnen der Linie filtern
Im `onValue(this.clientsRef, ...)`-Callback inaktive Clients ignorieren:

```ts
const now = this.serverNow();
const sizes = (Object.values(clients) as { width: number; height: number; lastSeen?: number }[])
  .filter(s => typeof s.lastSeen === 'number' && now - s.lastSeen < this.STALE_MS);

if (sizes.length === 0) { this.viewportBorder.set(null); return; }
const minW = Math.min(...sizes.map(s => s.width));
const minH = Math.min(...sizes.map(s => s.height));
// ... wie bisher
```

> Hinweis: `serverTimestamp()` ist beim Schreiben kurz ein Platzhalter-Objekt;
> nach dem Server-Roundtrip ist `lastSeen` eine Zahl. Der `typeof === 'number'`-
> Filter behandelt den Zwischenzustand sauber.

#### 6. Optional: periodische Neuberechnung
Da `viewportBorder` nur bei Datenänderungen neu berechnet wird, kann eine
stale gewordene Linie „hängen" bleiben, bis das nächste `clients`-Update kommt.
Optional einen Timer (z. B. alle 5 s) ergänzen, der die Filter-/Min-Logik neu
auswertet, damit die Linie auch ohne neues DB-Event verschwindet. Da aber alle
aktiven Clients alle 5 s heartbeaten, kommen ohnehin regelmäßig Updates — dieser
Schritt ist nur Feinschliff.

#### 7. Cleanup in `ngOnDestroy`
```ts
this.stopHeartbeat();
document.removeEventListener('visibilitychange', this.onVisibilityChange);
// bestehendes remove(this.clientRef) bleibt
```

### Tuning-Parameter
- `HEARTBEAT_MS` = 5000 (wie oft jeder aktive Client sich meldet)
- `STALE_MS` = 15000 (ab wann ein Client als inaktiv gilt; sollte > 2× Heartbeat
  sein, um kurze Aussetzer zu tolerieren)

### Testfälle
1. Desktop + Smartphone offen → Smartphone-Linie sichtbar.
2. Smartphone-App in den Hintergrund → Linie verschwindet auf dem Desktop
   innerhalb von ~`STALE_MS` (bzw. sofort dank Visibility-Event).
3. Smartphone wieder in den Vordergrund → Linie erscheint erneut.
4. Smartphone-App komplett geschlossen → Linie verschwindet (onDisconnect +
   Stale-Filter).
5. Gerät mit falsch gestellter Uhr → Linie verhält sich korrekt (Server-Zeit).

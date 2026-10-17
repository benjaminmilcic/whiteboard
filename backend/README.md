# Sovica – Backend des Kinder-Chats

NestJS-Backend für den KI-Chat im Whiteboard (Route `/chat`, Code in `src/app/kids-chat/`).
Läuft auf dem Server von benjamin-milcic.dev unter **https://chat-api.benjamin-milcic.dev**.

- **Chat:** `openai/gpt-oss-120b` über Groq, mit Kinderschutz-Prüfung jeder Frage und jeder Antwort
  (`src/safety/`, `src/chat/prompts.ts`)
- **Spracheingabe:** `whisper-large-v3` über Groq
- **Sprachausgabe:** edge-tts (inoffiziell, kostenlos). Fällt sie aus, liest das Frontend mit der
  Sprachausgabe des Browsers vor.
- **Zugriff:** nur mit dem Token der anonymen Firebase-Anmeldung des Whiteboards, plus Rate Limit pro Nutzer
  (`src/auth/auth.guard.ts`)

## Lokal entwickeln

```bash
cd backend
cp .env.example .env        # GROQ_API_KEY eintragen
npm install
npm run start:dev           # http://localhost:3200/api
```

Im Whiteboard (`npm start`, http://localhost:4200) spricht der Chat automatisch mit diesem lokalen Backend.

## Einmalige Einrichtung auf dem Server

1. **Cloudflare:** DNS-Eintrag `chat-api` → IP des Servers, **Proxied (orange Wolke)** – das
   Origin-Zertifikat auf dem Server gilt nur für Cloudflare.
2. **Server** (Repo auschecken oder `backend/deploy/` hochladen):
   ```bash
   sudo bash backend/deploy/server-setup.sh
   sudo nano /etc/kids-chat-api/kids-chat-api.env    # GROQ_API_KEY eintragen
   ```
   Legt den Benutzer `kidschat`, `/opt/kids-chat-api`, die systemd-Unit, den Apache-vHost und die
   sudoers-Regel für `deploy` an. Fasst keinen anderen Dienst an.
3. **GitHub:** im Whiteboard-Repo das Secret `DEPLOY_SSH_KEY` anlegen (derselbe Schlüssel des
   `deploy`-Benutzers wie bei todo-app), dann den Workflow **Deploy backend** von Hand starten.

## Deploy

`.github/workflows/deploy-backend.yml` läuft bei jedem Push auf `main`, der etwas unter `backend/` ändert:
bauen, per rsync nach `/opt/kids-chat-api`, Dienst neu starten, Health-Check auf `/api/health`.
Reine Backend-Änderungen lösen keinen Firebase-Deploy aus, Änderungen am Frontend keinen Backend-Deploy.

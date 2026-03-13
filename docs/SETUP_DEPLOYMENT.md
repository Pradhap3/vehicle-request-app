# Setup and Deployment

## Local Development

### Prerequisites

- Node.js `18+`
- npm
- SQL Server or Azure SQL database
- Valid backend environment variables
- Expo CLI tooling through `npx expo`

### Backend

```bash
cd backend
npm install
npm run migrate
npm run seed
npm run dev
```

Default local URL:

- API: `http://localhost:5000`
- Health: `http://localhost:5000/api/health`

Important backend env vars:

- `PORT`
- `NODE_ENV`
- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_PORT`
- `DB_ENCRYPT`
- `DB_TRUST_SERVER_CERT`
- `JWT_SECRET`
- `JWT_EXPIRY`
- `REFRESH_TOKEN_EXPIRY`
- `FRONTEND_URL`
- `FRONTEND_ALLOWED_ORIGINS`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_TENANT_ID`
- `MS_REDIRECT_URI`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_FROM`
- `ENABLE_AI_FEATURES`
- `AUTO_ASSIGN_WINDOW_MINUTES`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default local URL:

- Web app: `http://localhost:3000`

Frontend env vars:

- `VITE_API_URL`

Notes:

- `frontend/vite.config.js` proxies `/api` and `/socket.io` to `http://localhost:5000` during local development.
- If `VITE_API_URL` is omitted, the frontend API client falls back to the hosted Render backend.

### Mobile

```bash
cd mobile
npm install
npx expo start
```

Useful targets:

```bash
npx expo start --android
npx expo start --ios
npx expo start --web
```

Mobile env vars:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SOCKET_URL`

## Suggested Local Startup Order

1. Start the backend.
2. Start the frontend.
3. Start Expo for the mobile client.
4. Verify:
   - `GET /api/health`
   - web login
   - mobile login
   - socket connectivity on live tracking screens

## Render Backend Deployment

Checked-in config:

- `render.yaml`

Current Render setup provisions:

- one Node web service
- root directory `backend`
- `npm install` build
- `npm start` runtime
- `/api/health` health check

Deployment steps:

1. Connect the repository to Render.
2. Use `render.yaml` blueprint sync or create the service manually.
3. Populate all non-checked-in secrets in the Render dashboard.
4. Set `FRONTEND_URL` and `FRONTEND_ALLOWED_ORIGINS` to your deployed web origin(s).
5. Confirm the health check is green after deploy.

## Vercel Frontend Deployment

Recommended configuration:

- Framework preset: Vite
- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Output directory: `dist`

Required env vars:

- `VITE_API_URL=https://<your-backend-domain>`

Important:

- The frontend API client already prefixes routes with `/api`, so `VITE_API_URL` should be the backend origin, not a duplicated `/api/api` path.

## Expo Mobile Deployment

The mobile app is an Expo project.

Recommended release flow:

1. Set:
   - `EXPO_PUBLIC_API_URL`
   - `EXPO_PUBLIC_SOCKET_URL`
2. Validate on real devices for:
   - login
   - location permissions
   - trip updates
   - SOS flow
3. Build through Expo/EAS or your chosen Expo release pipeline.

At minimum, confirm:

- driver location updates reach the backend
- socket reconnection works on app resume
- production API origins are reachable from the device network

## Post-Deploy Verification

### Backend

- `GET /api/health` returns success
- login works
- database migrations are applied
- Socket.IO handshake succeeds
- scheduled jobs start without crashing the process

### Frontend

- role-based routes load
- admin pages can fetch V2 data
- employee booking flow works
- notifications page loads and marks items read

### Mobile

- tab shell opens for employees and drivers
- trip detail and navigation screens load
- SOS creates an incident
- security gate screen still works

## Operational Notes

- The backend trusts proxy headers via `app.set('trust proxy', 1)`, which is correct for Render-style deployments.
- CORS is driven by `FRONTEND_ALLOWED_ORIGINS`; keep this aligned with both preview and production domains.
- The mobile app currently uses a dependency-light navigation shell. If a map/navigation SDK is introduced later, budget for native dependency and release-pipeline updates.

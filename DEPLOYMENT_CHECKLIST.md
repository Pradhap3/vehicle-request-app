# Deployment Checklist

## Before Git Commit

1. Rotate any secret that was pasted into chat or committed anywhere in history.
2. Make sure `.env`, private keys, `.vercel/`, and any certificate files are not tracked.
3. Review `README.md` and remove any real or placeholder credentials before sharing the repo externally.
4. Run:
   - `git status`
   - `git diff --stat`
   - `git diff -- . ':(exclude)package-lock.json'`

## Database

1. Open your Azure SQL query editor or SSMS.
2. Run [2026-03-10_recurring_transport_sso.sql](./SQL/2026-03-10_recurring_transport_sso.sql).
3. Verify:
   - `route_stops` exists
   - `employee_transport_profiles` exists
   - `users.auth_provider` exists
   - `users.external_subject` exists
   - `cab_requests.request_type` exists

## Render Backend

1. Open the Render service for the backend.
2. Set or confirm these environment variables:
   - `NODE_ENV=production`
   - `DB_HOST`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_PORT=1433`
   - `DB_ENCRYPT=true`
   - `DB_TRUST_SERVER_CERT=false`
   - `FRONTEND_URL=https://vehicle-request-app.vercel.app`
   - `FRONTEND_ALLOWED_ORIGINS=https://vehicle-request-app.vercel.app`
   - `MS_CLIENT_ID`
   - `MS_CLIENT_SECRET`
   - `MS_TENANT_ID`
   - `MS_REDIRECT_URI=https://vehicle-request-app.onrender.com/api/auth/microsoft/callback`
   - `JWT_SECRET`
   - `JWT_EXPIRY=8h`
   - `REFRESH_TOKEN_EXPIRY=7d`
   - `ENABLE_AI_FEATURES=true`
   - `AUTO_ASSIGN_WINDOW_MINUTES=30`
   - `REQUEST_CONFLICT_WINDOW_MINUTES=180`
   - `REQUIRE_CALL_ATTEMPT_FOR_NO_SHOW=true`
   - `CALL_ATTEMPT_WINDOW_MINUTES=15`
   - `EMAIL_HOST`
   - `EMAIL_PORT=587`
   - `EMAIL_USER`
   - `EMAIL_PASSWORD`
   - `EMAIL_FROM`
3. Trigger a deploy from the updated branch.
4. After deploy, test:
   - `GET /api/health`
   - Microsoft login redirect
   - employee recurring profile save
   - driver dashboard load
   - driver location updates
   - employee tracking page

## Vercel Frontend

1. Open the Vercel project settings.
2. Set or confirm:
   - `VITE_API_URL=https://vehicle-request-app.onrender.com`
   - `VITE_SOCKET_URL=https://vehicle-request-app.onrender.com`
3. Redeploy the production build.
4. After deploy, test:
   - login page
   - Microsoft SSO callback
   - employee dashboard
   - employee tracking map
   - driver dashboard

## Security Baseline

These controls are already in the backend:
- `helmet`
- `cors` allowlist
- request body size limits
- auth rate limiting
- API rate limiting
- JWT-based auth

You still need to do these operational steps:
1. Keep all secrets only in Render/Vercel env vars.
2. Rotate exposed secrets immediately.
3. Use long random values for `JWT_SECRET`.
4. Limit Azure SQL firewall access to Render outbound IPs if possible.
5. Review admin accounts and disable unused users.
6. Use HTTPS only.
7. Do not store production credentials in `README.md`, screenshots, or chat logs.

## Performance Baseline

The app already uses:
- gzip compression
- Vite production build
- Socket.IO for live updates
- auto-refresh intervals instead of aggressive polling

For deployment:
1. Keep frontend on Vercel CDN.
2. Keep `VITE_API_URL` pointed directly at the Render backend.
3. Do not enable excessive browser console logging in production.
4. Monitor Render cold starts on the free plan; first request latency is expected there.

## Git Commit

Recommended sequence:

1. `git status`
2. `git add .`
3. `git commit -m "Add recurring transport, employee cab tracking, and Microsoft SSO"`
4. `git push origin main`

## Post-Deployment Validation

1. Employee logs in with Microsoft.
2. Employee saves recurring transport profile.
3. Daily trip appears on employee dashboard.
4. Admin creates or updates route stops.
5. Driver starts location tracking.
6. Employee opens `/employee/tracking` and sees the cab on the map.
7. Driver boards and drops passengers.
8. Notifications appear in-app and in real time.

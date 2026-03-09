# Free Deployment Guide (Render + Vercel)

## 1) Push code
1. Commit current project to your GitHub repo.
2. Confirm these files exist:
   - `render.yaml`
   - `backend/.env.example`
   - `frontend/vercel.json`
   - `frontend/.env.example`

## 2) Run SQL manually (first)
Run:
- `backend/sql/manual_realworld_updates.sql`

in your Azure SQL database.

## 3) Deploy backend on Render
1. In Render: `New` -> `Blueprint`.
2. Select your GitHub repo.
3. Render reads `render.yaml` and creates `aisin-fleet-backend`.
4. Set missing env vars in Render dashboard:
   - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - `FRONTEND_URL` (set after frontend deploy)
   - `JWT_SECRET`
   - `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM` (optional but recommended)
5. Deploy and check:
   - `https://<render-service>/api/health`

## 4) Deploy frontend on Vercel
1. In Vercel: `Add New Project`.
2. Root directory: `frontend`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Set env vars:
   - `VITE_API_URL=https://<render-service>/api`
   - `VITE_SOCKET_URL=https://<render-service>`
6. Deploy.

## 5) Final cross-link
1. Update backend `FRONTEND_URL` in Render to your Vercel URL.
2. Redeploy backend.

## 6) Smoke test
1. Login as admin.
2. Create route with `trip_type` + `standard_pickup_time`.
3. Create/update driver with `route_ids`.
4. Create employee request.
5. Verify:
   - request created notification
   - auto/manual cab assignment notification
   - boarded notification
   - dropped notification
   - live tracking updates

## Note
Free tiers can sleep on idle and may delay first response. For strict production SLA, move backend to paid always-on plan.

# Setup and Deployment Guide

## Prerequisites

- Node.js 18+ and npm 9+
- SQL Server 2019+ or Azure SQL Database
- Git

## Local Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/Pradhap3/vehicle-request-app.git
cd vehicle-request-app

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

# Install mobile dependencies (optional)
cd ../mobile && npm install
```

### 2. Database Setup

Create a SQL Server database and run the schema scripts in order:

```bash
sqlcmd -S localhost -d TransportDB -i SQL/001_complete_schema.sql
sqlcmd -S localhost -d TransportDB -i SQL/002_seed_data.sql
```

### 3. Backend Configuration

Create `backend/.env`:

```env
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database (SQL Server / Azure SQL)
DB_USER=sa
DB_PASSWORD=YourPassword123
DB_SERVER=localhost
DB_NAME=TransportDB
DB_PORT=1433
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=7d

# Microsoft SSO (optional)
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_REDIRECT_URI=http://localhost:5000/api/auth/microsoft/callback

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@company.com
```

### 4. Frontend Configuration

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_MICROSOFT_CLIENT_ID=
VITE_MICROSOFT_REDIRECT_URI=http://localhost:5173/auth/callback
```

### 5. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev

# Terminal 3 - Mobile (optional)
cd mobile && npx expo start
```

Frontend: http://localhost:5173
Backend API: http://localhost:5000/api
Health check: http://localhost:5000/api/health

### 6. Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aisin.com | password123 |
| HR Admin | hr.admin@aisin.com | password123 |
| Employee | emp1@aisin.com | password123 |
| Driver | driver1@aisin.com | password123 |
| Security | security@aisin.com | password123 |

---

## Production Deployment

### Backend (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repo
3. Build command: `cd backend && npm install`
4. Start command: `cd backend && npm start`
5. Set environment variables (see .env above with production values)
6. Set NODE_ENV=production

### Frontend (Vercel)

1. Import project on Vercel
2. Root directory: `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Set environment variables:
   - VITE_API_URL=https://your-backend.onrender.com/api
   - VITE_SOCKET_URL=https://your-backend.onrender.com

### Mobile (Expo)

```bash
cd mobile

# Development build
npx expo start

# Production build
npx eas build --platform android
npx eas build --platform ios

# Submit to stores
npx eas submit --platform android
npx eas submit --platform ios
```

### Azure SQL Database

1. Create Azure SQL Database in Azure Portal
2. Configure firewall rules for your backend IP
3. Update DB_SERVER, DB_USER, DB_PASSWORD, DB_ENCRYPT=true
4. Run SQL/001_complete_schema.sql and SQL/002_seed_data.sql

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | Server port (default: 5000) |
| NODE_ENV | No | development/production |
| FRONTEND_URL | Yes | CORS origin for frontend |
| DB_USER | Yes | SQL Server username |
| DB_PASSWORD | Yes | SQL Server password |
| DB_SERVER | Yes | SQL Server host |
| DB_NAME | Yes | Database name |
| DB_PORT | No | SQL Server port (default: 1433) |
| DB_ENCRYPT | No | Encrypt connection (default: true) |
| JWT_SECRET | Yes | JWT signing secret |
| JWT_EXPIRES_IN | No | Token expiry (default: 24h) |
| JWT_REFRESH_SECRET | Yes | Refresh token secret |
| MICROSOFT_CLIENT_ID | No | Azure AD app client ID |
| MICROSOFT_CLIENT_SECRET | No | Azure AD app secret |
| MICROSOFT_TENANT_ID | No | Azure AD tenant ID |
| SMTP_HOST | No | SMTP server for emails |
| SMTP_PORT | No | SMTP port |
| SMTP_USER | No | SMTP username |
| SMTP_PASS | No | SMTP password |

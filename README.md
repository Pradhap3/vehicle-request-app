# AISIN Fleet Management System

A production-ready fleet management system for managing company cab transportation with AI/ML-powered smart allocation, real-time tracking, and email notifications.

## 🚀 Features

### Core Features
- **User Management**: HR Admin can manage employees, drivers, and admins
- **Cab Management**: Track cabs, capacity, and driver assignments
- **Route Management**: Create and manage pickup/drop routes
- **Request System**: Employees request rides, admins approve and assign cabs
- **Real-time Tracking**: Live GPS tracking of cabs on map

### AI/ML Features
- **Smart Cab Allocation**: AI-powered automatic cab assignment based on:
  - Route optimization (Haversine distance calculation)
  - Capacity-based bin packing algorithm
  - Time slot grouping (15-minute windows)
  - Driver availability
- **Traffic Delay Prediction**: Google Maps API integration for real-time traffic
- **No-Show Reassignment**: Automatic reassignment of waiting passengers to cabs with available seats

### Communication
- **Email Notifications**: Outlook/Office365 integration for:
  - Request confirmations
  - Cab assignments
  - Traffic delay alerts
  - Driver assignments
- **Real-time Updates**: Socket.IO for instant notifications

---

## 📋 Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Azure SQL Database (or SQL Server)
- Outlook/Office365 email account (for notifications)
- Google Maps API key (optional, for traffic data)

---

## 🛠️ Local Development Setup

### 1. Clone/Download the Project

```bash
cd fleet-management
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Azure SQL credentials

# Run database migrations
npm run migrate

# Seed initial data (creates admin user)
npm run seed

# Start development server
npm run dev
```

**Default Admin Credentials:**
- Email: `admin@aisin.com`
- Password: `Admin@2024`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

---

## 🗄️ Database Schema

The system uses the following tables in Azure SQL:

| Table | Description |
|-------|-------------|
| `users` | All users (admins, drivers, employees) |
| `cabs` | Cab information with capacity and status |
| `routes` | Pickup/drop routes |
| `cab_requests` | Employee ride requests |
| `boarding_status` | Track boarding/dropping of passengers |
| `cab_tracking` | GPS location history |
| `notifications` | User notifications |
| `audit_logs` | System audit trail |

---

## 🌐 FREE HOSTING GUIDE

### Option 1: Vercel (Frontend) + Railway (Backend)

#### Step 1: Deploy Backend to Railway

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login to Railway
   railway login
   
   # Navigate to backend folder
   cd backend
   
   # Initialize project
   railway init
   
   # Deploy
   railway up
   ```

3. **Configure Environment Variables in Railway Dashboard**
   - Go to your project → Variables
   - Add all variables from `.env`:
     ```
     DB_HOST=aisinsupplychain.database.windows.net
     DB_NAME=vehicle_request_db
     DB_USER=SupplyChainadmin
     DB_PASSWORD=test@123
     DB_PORT=1433
     DB_ENCRYPT=true
     JWT_SECRET=your_secure_jwt_secret
     NODE_ENV=production
     FRONTEND_URL=https://your-frontend.vercel.app
     EMAIL_HOST=smtp.office365.com
     EMAIL_PORT=587
     EMAIL_USER=asakai@aisin-akl.co.in
     EMAIL_PASSWORD=your_email_password
     ```

4. **Get Backend URL**
   - Railway provides a URL like: `https://your-app.railway.app`

#### Step 2: Deploy Frontend to Vercel

1. **Create Vercel Account**
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Deploy via CLI**
   ```bash
   # Install Vercel CLI
   npm install -g vercel
   
   # Navigate to frontend folder
   cd frontend
   
   # Build for production
   npm run build
   
   # Deploy
   vercel --prod
   ```

3. **Configure Environment Variables in Vercel**
   - Go to Project Settings → Environment Variables
   - Add:
     ```
     VITE_API_URL=https://your-app.railway.app/api
     ```

---

### Option 2: Render (Full Stack Free)

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Deploy Backend as Web Service**
   - Click "New +" → "Web Service"
   - Connect your repository
   - Settings:
     - Environment: Node
     - Build Command: `cd backend && npm install`
     - Start Command: `cd backend && npm start`
   - Add environment variables

3. **Deploy Frontend as Static Site**
   - Click "New +" → "Static Site"
   - Connect your repository
   - Settings:
     - Build Command: `cd frontend && npm install && npm run build`
     - Publish Directory: `frontend/dist`
   - Add environment variable:
     ```
     VITE_API_URL=https://your-backend.onrender.com/api
     ```

---

### Option 3: Fly.io (Backend) + Vercel (Frontend)

1. **Deploy Backend to Fly.io**
   ```bash
   # Install Fly CLI
   curl -L https://fly.io/install.sh | sh
   
   # Login
   fly auth login
   
   # Navigate to backend
   cd backend
   
   # Create and deploy
   fly launch
   fly deploy
   
   # Set secrets
   fly secrets set DB_HOST=aisinsupplychain.database.windows.net
   fly secrets set DB_PASSWORD=test@123
   # ... add all other env vars
   ```

2. **Deploy Frontend to Vercel** (same as Option 1)

---

## 🔧 Production Checklist

### Security
- [ ] Change default admin password immediately
- [ ] Use strong JWT_SECRET (32+ characters)
- [ ] Enable HTTPS on all endpoints
- [ ] Set proper CORS origins in production
- [ ] Use secure email app passwords (not regular passwords)

### Database
- [ ] Azure SQL is already production-ready
- [ ] Enable Azure SQL firewall rules for your hosting IP
- [ ] Consider Azure SQL backup strategy

### Environment Variables
```bash
# Required for Production
NODE_ENV=production
JWT_SECRET=<strong-32-char-secret>
FRONTEND_URL=https://your-frontend-domain.com

# Azure SQL (already configured)
DB_HOST=aisinsupplychain.database.windows.net
DB_NAME=vehicle_request_db
DB_USER=SupplyChainadmin
DB_PASSWORD=test@123

# Email (update password)
EMAIL_USER=asakai@aisin-akl.co.in
EMAIL_PASSWORD=<your-app-password>
```

### Performance
- [ ] Enable gzip compression (already configured)
- [ ] Use CDN for static assets (Vercel handles this)
- [ ] Monitor server logs for errors

---

## 📱 User Roles & Features

### HR Admin
- Full dashboard with statistics
- Manage users, cabs, and routes
- View all requests and assign cabs
- Live GPS tracking map
- AI auto-allocation
- Traffic monitoring
- Analytics and reports

### Cab Driver
- View assigned trips
- **Location permission prompt** (Chrome geolocation)
- Start/stop tracking
- Mark passengers as boarded/dropped/no-show
- Real-time navigation

### Employee
- Submit cab requests
- View assigned cab and driver info
- Track request status
- Receive notifications

---

## 🚗 How Cab Allocation Works (AI/ML)

### Smart Allocation Algorithm

1. **Time Slot Grouping**
   - Requests are grouped into 15-minute time slots
   - Example: 8:00-8:15, 8:15-8:30, etc.

2. **Bin Packing Algorithm**
   - Available cabs are sorted by capacity (descending)
   - Requests are assigned to cabs using greedy bin-packing
   - Maximizes seat utilization

3. **Route Optimization**
   - Uses Haversine formula for distance calculation
   - Falls back to straight-line distance if Google Maps unavailable

4. **Traffic Integration**
   - Real-time traffic data from Google Maps
   - Delay notifications sent if ETA exceeds threshold
   - HR Admin notified for significant delays

### No-Show Handling
- When driver marks passenger as "no-show"
- System finds waiting passengers
- Automatically reassigns to cabs with available seats
- Notifications sent to affected parties

---

## 📧 Email Configuration

### Office 365 / Outlook Setup

1. **Enable App Passwords**
   - Go to Microsoft Account → Security
   - Enable 2-Factor Authentication
   - Generate App Password

2. **Update .env**
   ```
   EMAIL_HOST=smtp.office365.com
   EMAIL_PORT=587
   EMAIL_USER=asakai@aisin-akl.co.in
   EMAIL_PASSWORD=your-16-char-app-password
   EMAIL_FROM=asakai@aisin-akl.co.in
   ```

### Email Templates
- Request Confirmation: Sent when employee submits request
- Cab Assignment: Sent when admin assigns cab
- Delay Alert: Sent when traffic causes delay
- Driver Assignment: Sent to driver when assigned to route

---

## 🔌 API Documentation

### Authentication
```
POST /api/auth/login          - Login (returns JWT token)
POST /api/auth/refresh        - Refresh token
GET  /api/auth/me             - Get current user
PUT  /api/auth/profile        - Update profile
POST /api/auth/change-password - Change password
```

### Users
```
GET    /api/users             - List all users (admin only)
POST   /api/users             - Create user (admin only)
GET    /api/users/:id         - Get user details
PUT    /api/users/:id         - Update user
DELETE /api/users/:id         - Soft delete user
```

### Cabs
```
GET  /api/cabs                - List all cabs
POST /api/cabs                - Create cab
GET  /api/cabs/available      - Get available cabs
POST /api/cabs/location       - Update cab location (driver)
PUT  /api/cabs/:id/status     - Update cab status
```

### Routes
```
GET  /api/routes              - List all routes
POST /api/routes              - Create route
POST /api/routes/:id/auto-allocate - AI allocation
GET  /api/routes/:id/traffic  - Check traffic
POST /api/routes/:id/reassign-waiting - Reassign passengers
```

### Requests
```
GET  /api/requests            - List requests
POST /api/requests            - Create request (employee)
POST /api/requests/:id/assign - Assign cab (admin)
POST /api/requests/:id/board  - Mark boarded (driver)
POST /api/requests/:id/drop   - Mark dropped (driver)
POST /api/requests/:id/no-show - Mark no-show
```

---

## 📞 Support

For issues or questions:
1. Check the browser console for frontend errors
2. Check server logs for backend errors
3. Verify database connection with `/api/health` endpoint

---

## 📜 License

Proprietary - AISIN Corporation

---

**Built with ❤️ for AISIN Fleet Management**

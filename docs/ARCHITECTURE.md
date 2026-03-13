# Architecture Overview

## System Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   React Web App   |     | React Native App  |     |   Security Gate   |
|   (Vite + React)  |     |   (Expo Mobile)   |     |   (Web/Mobile)    |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                          |
         +------------+------------+--------------------------+
                      |
              +-------v--------+
              |  Socket.IO WS  |
              +-------+--------+
                      |
              +-------v--------+
              | Express.js API |
              |   (Node.js)    |
              +-------+--------+
                      |
         +------------+------------+
         |            |            |
   +-----v-----+ +---v----+ +----v-----+
   | SQL Server | | Cron   | | Mailer   |
   | (Azure SQL)| | Jobs   | |(Nodemailer)|
   +------------+ +--------+ +----------+
```

## Monorepo Structure

```
vehicle-request-app/
  backend/                    # Express.js API server
    src/
      config/
        database.js           # MSSQL connection pool
      controllers/            # Request handlers
        bookingsController.js
        tripsControllerV2.js
        driversController.js
        vehiclesController.js
        vendorsController.js
        shiftsController.js
        incidentsController.js
        ratingsController.js
        reportsController.js
        hrController.js
        gateController.js
        settingsController.js
      middleware/
        auth.js               # JWT authenticate + authorize(roles)
      models/                 # Data access layer
        Booking.js, Driver.js, Vehicle.js, Vendor.js,
        Shift.js, Incident.js, Rating.js, TripEvent.js,
        LiveLocation.js, GateLog.js, Setting.js,
        User.js, CabRequest.js
      routes/
        index.js              # V1 routes + V2 mount points
        bookings.js, tripsV2.js, vehicles.js, drivers.js,
        vendors.js, shifts.js, incidents.js, ratings.js,
        reports.js, hr.js, gate.js, settings.js
      services/
        TripStateMachine.js   # Trip lifecycle engine
        ReportsService.js     # Report queries
        AuditService.js       # Audit trail
      sockets/
        handlers.js           # Socket.IO event handlers
      jobs/
        index.js              # Cron job scheduler
      server.js               # App entry point

  frontend/                   # React web application
    src/
      components/
        Layout.jsx            # Sidebar + header + role nav
        ProtectedRoute.jsx    # Role-based route guard
      context/
        AuthContext.jsx       # JWT auth state
        SocketContext.jsx     # Socket.IO connection
        LanguageContext.jsx   # i18n
      pages/
        DashboardPage.jsx     # Admin dashboard
        HRDashboardPage.jsx   # HR analytics dashboard
        TripManagementPage.jsx# Admin trip operations
        DriverManagementPage.jsx # Driver CRUD
        VehicleManagementPage.jsx # Vehicle CRUD
        BookRidePage.jsx      # Employee booking form
        MyTripsPage.jsx       # Employee trip list
        ReportsPage.jsx       # Reports with CSV export
        AdminSettingsPage.jsx # System settings
        NotificationsPage.jsx # Notification center
        SecurityGatePage.jsx  # Security gate ops
      services/
        api.js                # Axios HTTP client + V2 modules

  mobile/                     # React Native (Expo) app
    src/
      screens/
        LoginScreen.js
        DriverHomeScreen.js   # Driver trip queue
        TripDetailScreen.js   # Trip details + actions
        NavigationScreen.js   # Live map navigation
        ProfileScreen.js      # User profile
        HistoryScreen.js      # Trip history
        SOSScreen.js          # Emergency SOS
        SecurityGateScreen.js # Gate operations
        EmployeeTripsScreen.js
      context/
        AuthContext.js
      services/
        api.js, socket.js
      theme/
        styles.js

  SQL/
    001_complete_schema.sql   # 22 tables, indexes, constraints
    002_seed_data.sql         # Demo data
  docs/
    API_REFERENCE.md
    SOCKET_EVENTS.md
    ARCHITECTURE.md
    SETUP.md
```

## Database Schema (22 Tables)

Core: roles, users, refresh_tokens
Transport: vendors, vehicles, drivers, shifts, routes, route_stops
Operations: bookings, trips, trip_passengers, trip_events
Tracking: live_locations, gate_logs
Safety: incidents, ratings
System: notifications, audit_logs, settings, employee_transport_profiles

## Role-Based Access Control

| Role | Web Access | Mobile Access |
|------|-----------|---------------|
| ADMIN | Full system access | N/A |
| HR_ADMIN | HR dashboard, reports, trip/driver mgmt | N/A |
| EMPLOYEE/USER | Book rides, view trips, tracking | View trips, SOS |
| DRIVER/CAB_DRIVER | N/A | Trip queue, navigation, SOS |
| SECURITY | Gate control panel | Gate scanning |
| VENDOR | N/A | N/A (managed by admin) |

## Trip Lifecycle (State Machine)

States: ASSIGNED, DRIVER_EN_ROUTE, ARRIVED, PASSENGER_ONBOARD, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW, ESCALATED, RESOLVED

Booking creates a trip via TripStateMachine.createTrip(). Driver actions trigger state transitions with validation, audit logging, notification dispatch, and Socket.IO broadcasts.

## Cron Jobs (10 Scheduled Tasks)

| Job | Interval | Description |
|-----|----------|-------------|
| Email processor | 5 min | Process queued emails |
| Recurring transport | 30 min | Generate recurring bookings |
| Auto-assign | 1 min | Match unassigned bookings to drivers |
| Trip reminders | 5 min | Send 30-min pre-pickup reminders |
| Stale trip detection | 10 min | Mark NO_SHOW for overdue arrivals |
| Shift delay monitor | 5 min | Detect shift departure delays |
| Traffic check | 10 min | AI-based ETA updates (if enabled) |
| Nightly summary | 11 PM | Daily summary email to admins |
| Location cleanup | Sun 3 AM | Purge old GPS data (>7 days) |

## Security

- JWT tokens with 24h expiry + refresh token rotation
- Microsoft SSO via Entra ID (MSAL)
- bcrypt password hashing (12 rounds)
- Helmet security headers
- CORS with configurable origins
- Rate limiting (100 req/15min per IP)
- Input validation via express-validator
- Audit logging for critical operations
- Soft delete (is_active flag) for data retention

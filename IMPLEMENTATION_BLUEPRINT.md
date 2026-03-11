# Manufacturing Cab Management System Implementation Blueprint

This file maps the Manufacturing Cab Management System specification onto the existing `vehicle-request-app` repository.

## Goal

Build the specification inside the current codebase without rewriting the whole app. Extend the existing backend and frontend modules in phased releases.

## Current Repo Mapping

### Existing backend modules

- `backend/src/controllers/authController.js`
- `backend/src/controllers/usersController.js`
- `backend/src/controllers/cabsController.js`
- `backend/src/controllers/routesController.js`
- `backend/src/controllers/requestsController.js`
- `backend/src/controllers/dashboardController.js`
- `backend/src/controllers/notificationsController.js`
- `backend/src/controllers/transportController.js`
- `backend/src/services/RecurringTransportService.js`
- `backend/src/services/RouteOptimizationService.js`
- `backend/src/services/DelayMonitoringService.js`
- `backend/src/ai/SmartAllocationService.js`

### Existing frontend modules

- Employee: `frontend/src/pages/EmployeeDashboardPage.jsx`, `frontend/src/pages/EmployeeTrackingPage.jsx`, `frontend/src/pages/ProfilePage.jsx`
- Driver: `frontend/src/pages/DriverDashboardPage.jsx`
- HR/Admin: `frontend/src/pages/DashboardPage.jsx`, `frontend/src/pages/UsersPage.jsx`, `frontend/src/pages/CabsPage.jsx`, `frontend/src/pages/RoutesPage.jsx`, `frontend/src/pages/RequestsPage.jsx`, `frontend/src/pages/LiveTrackingPage.jsx`

### Major gaps versus specification

- No dedicated Security Gate module
- No explicit trips domain separate from requests
- No normalized manifest/passenger-per-trip model
- No attendance integration adapter
- No document/compliance tracking for drivers/vehicles
- No structured analytics/reporting layer
- No mobile-driver-specific offline sync design
- Production schema compatibility problems still need cleanup

## Target Modules To Add

### Employee Portal

- Daily trip list
- Emergency/business request form
- Live trip tracking
- Trip history
- Ratings and issue reports

### Driver App

- Assigned trips view
- Passenger manifest and actions
- Offline GPS sync
- Vehicle checklist
- Incident reporting

### HR Admin Dashboard

- Employee shift management
- Approved home/drop location management
- Emergency approval queue
- Fleet monitoring
- Route and stop management
- Compliance dashboard
- Analytics and reports

### Security Gate Module

- Vehicle scan/lookup
- Gate allow/deny/manual review flow
- Entry/exit log
- Manifest validation
- Attendance sync trigger

### System Services

- Daily trip generation worker
- Dispatch optimization worker
- ETA refresh worker
- Notification worker
- Attendance integration worker
- Analytics rollup worker

## Data Model Roadmap

Keep current tables during transition, then move toward the following bounded domains:

### Keep and evolve

- `users`
- `cabs`
- `cab_requests`
- `routes`
- `route_stops`
- `notifications`
- `employee_transport_profiles`

### Add next

- `trips`
- `trip_stops`
- `trip_passengers`
- `driver_documents`
- `vehicle_documents`
- `security_gate_logs`
- `attendance_sync_logs`
- `employee_ratings`
- `trip_incidents`

## Phase Plan

### Phase 1: Stabilization and schema compatibility

Objective: make production safe and align the current database contract with the backend.

Tasks:

- Audit current SQL Server schema against models
- Remove hard assumptions like `is_active` where schema differs
- Add startup schema validation
- Add database compatibility helpers for old/new columns
- Fix recurring trip generation failures
- Fix driver dashboard query failures

Definition of done:

- Driver dashboard works in production
- Recurring trip cron runs without database column errors
- All core GET endpoints return `200` for valid users

### Phase 2: Trips domain introduction

Objective: separate operational trips from request records while keeping current flows.

Tasks:

- Add `trips`, `trip_stops`, `trip_passengers`
- Keep `cab_requests` as request/approval source
- On approval/auto-generation, create linked trip records
- Update driver and employee tracking to read from trips first

Definition of done:

- Every assigned operational journey has a durable trip record
- Driver dashboard and employee tracking use trip data

### Phase 3: Emergency and override workflow hardening

Objective: match the specification for emergency/business travel.

Tasks:

- Add request categories and priority rules
- Add daily-generation suppression per employee/date when override applies
- Add HR queue filters for emergency/business requests
- Add manual and suggested auto-assignment options

Definition of done:

- Emergency requests move through submit -> review -> approve/reject -> assign

### Phase 4: Security Gate module

Objective: implement gate workflows end to end.

Tasks:

- Add backend security-gate controller/service
- Add gate log table/model
- Build security web page
- Add vehicle verification and manifest check APIs
- Emit attendance sync events

Definition of done:

- Guard can scan or enter a vehicle and receive allow/deny/manual review with audit logs

### Phase 5: Compliance and analytics

Objective: support manufacturing compliance and reporting requirements.

Tasks:

- Add driver license and vehicle document tracking
- Add expiry alerts
- Add KPI dashboards
- Add cost/utilization/no-show reporting

Definition of done:

- HR dashboard includes compliance status and KPI reporting

### Phase 6: Mobile driver experience

Objective: make driver usage production-ready for field operations.

Tasks:

- Create React Native app or mobile-focused package
- Offline GPS queue
- Background location sync
- Passenger workflow actions
- Vehicle checklist and incidents

Definition of done:

- Driver can complete an entire trip lifecycle from mobile reliably

## API Expansion Plan

### Add next endpoints

- `/api/employee/trips/today`
- `/api/employee/trips/history`
- `/api/employee/requests/emergency`
- `/api/driver/trips/today`
- `/api/driver/trips/:id/start`
- `/api/driver/passengers/:id/board`
- `/api/driver/passengers/:id/no-show`
- `/api/driver/passengers/:id/drop`
- `/api/security/gate/scan`
- `/api/security/gate/logs`
- `/api/admin/compliance/drivers`
- `/api/admin/compliance/vehicles`
- `/api/admin/analytics/utilization`
- `/api/admin/analytics/delays`
- `/api/admin/analytics/no-shows`

## WebSocket Expansion Plan

- `trip.assigned`
- `trip.status.updated`
- `trip.eta.updated`
- `vehicle.location.updated`
- `gate.alert`
- `notification.created`

## Folder Expansion Plan

### Backend additions

- `backend/src/modules/trips`
- `backend/src/modules/security-gate`
- `backend/src/modules/compliance`
- `backend/src/modules/analytics`
- `backend/src/workers`

### Frontend additions

- `frontend/src/pages/SecurityGatePage.jsx`
- `frontend/src/pages/CompliancePage.jsx`
- `frontend/src/pages/ReportsPage.jsx`
- `frontend/src/features/trips`
- `frontend/src/features/security`

## Recommended Implementation Order In This Repo

1. Stabilize schema and production errors
2. Introduce explicit trips tables and services
3. Add emergency override behavior
4. Add security gate backend and UI
5. Add compliance tracking
6. Add analytics/reporting
7. Add dedicated mobile driver client

## Immediate Next Build Items

These are the first concrete engineering tasks to implement in the current repo:

1. Add schema-safe request/trip queries for SQL Server production
2. Add `trips` and `trip_passengers` models with migrations
3. Update recurring generation to create trip records
4. Update driver dashboard to use trip manifests
5. Add employee trip history API
6. Add security gate scan API and page

## Constraints

- Use free/open-source technologies only
- Preserve the current app structure where practical
- Prefer additive changes over rewrites
- Keep backward compatibility while migrating from request-centric flow to trip-centric operations

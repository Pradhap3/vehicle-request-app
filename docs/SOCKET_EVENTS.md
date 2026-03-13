# Socket.IO Events Reference

Connection URL: Same as API server (default ws://localhost:5000)
Auth: Pass JWT token via auth.token on connection

## Client -> Server Events

### join_role
Join role-based rooms for receiving targeted broadcasts.
Payload: { role: "ADMIN", userId: 123, driverId: 5 }
Rooms joined: role room (e.g. "ADMIN"), user-specific room ("user_123"), driver room ("driver_5")

### driver_location
Driver sends GPS position update. Saved to DB and broadcast to watchers.
Payload: { tripId: 10, latitude: 12.9716, longitude: 77.5946, heading: 180, speed: 45 }
Broadcasts: "location_update" to trip room ("trip_10")

### trip_status
Notify about trip status changes.
Payload: { tripId: 10, status: "IN_PROGRESS", driverId: 5 }
Broadcasts: "trip_update" to ADMIN room, trip room, and driver room

### driver_availability
Driver toggling online/offline status.
Payload: { driverId: 5, available: true }
Broadcasts: "driver_status" to ADMIN room

### sos_alert
Emergency SOS from driver or passenger.
Payload: { tripId: 10, userId: 3, latitude: 12.97, longitude: 77.59, message: "Emergency" }
Broadcasts: "sos_received" to ADMIN, HR_ADMIN, and SECURITY rooms

### watch_trip
Subscribe to real-time updates for a specific trip.
Payload: { tripId: 10 }
Joins room: "trip_10"

### unwatch_trip
Unsubscribe from trip updates.
Payload: { tripId: 10 }
Leaves room: "trip_10"

### gate_scan
Security gate vehicle scan event.
Payload: { vehicleNumber: "KA01AB1234", gateId: "GATE-1", action: "CHECK_IN" }
Broadcasts: "gate_activity" to SECURITY and ADMIN rooms

## Server -> Client Events

### location_update
Real-time GPS position of a driver on an active trip.
Data: { tripId: 10, latitude: 12.97, longitude: 77.59, heading: 180, speed: 45, timestamp: "..." }

### trip_update
Trip status change notification.
Data: { tripId: 10, status: "COMPLETED", driverId: 5, updatedAt: "..." }

### driver_status
Driver availability change.
Data: { driverId: 5, available: true, name: "Driver Name" }

### booking_update
New or updated booking notification.
Data: { bookingId: 8, status: "APPROVED", ref: "BK-20250315-ABCD" }

### sos_received
Emergency SOS alert for admins/HR/security.
Data: { tripId: 10, userId: 3, latitude: 12.97, longitude: 77.59, message: "Emergency", timestamp: "..." }

### gate_activity
Gate check-in/out events.
Data: { vehicleNumber: "KA01AB1234", action: "CHECK_IN", gateId: "GATE-1", tripId: 10 }

### notification
General notification pushed to specific user.
Data: { id: 50, title: "Trip Assigned", message: "Your trip has been assigned", type: "TRIP_ASSIGNED" }

### incident_alert
New incident or SOS alert.
Data: { id: 15, type: "SOS", severity: "CRITICAL", tripId: 10, description: "..." }

## Room Structure

| Room | Members | Purpose |
|------|---------|---------|
| ADMIN | All admins | Admin broadcasts |
| HR_ADMIN | HR admins | HR-specific alerts |
| SECURITY | Security staff | Gate events, SOS |
| DRIVER | All drivers | Driver broadcasts |
| EMPLOYEE | All employees | Employee notifications |
| user_{id} | Specific user | Personal notifications |
| driver_{id} | Specific driver | Driver-specific updates |
| trip_{id} | Trip watchers | Live trip tracking |

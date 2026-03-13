# API Reference

Base URL: /api

## Authentication
All protected endpoints require Authorization: Bearer <token> header.

### Auth Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/auth/login | Email/password login | No |
| POST | /api/auth/microsoft | Microsoft SSO login | No |
| GET | /api/auth/microsoft/callback | SSO callback | No |
| GET | /api/auth/me | Get current user | Yes |
| PUT | /api/auth/profile | Update profile | Yes |
| POST | /api/auth/refresh | Refresh JWT token | No |

## V2 Bookings API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/bookings | List all bookings (paginated) | ADMIN, HR_ADMIN |
| GET | /api/v2/bookings/:id | Get booking by ID | ADMIN, HR_ADMIN, Owner |
| POST | /api/v2/bookings | Create new booking | EMPLOYEE, USER |
| PUT | /api/v2/bookings/:id | Update booking | ADMIN, HR_ADMIN |
| DELETE | /api/v2/bookings/:id/cancel | Cancel booking | Owner, ADMIN |
| POST | /api/v2/bookings/:id/approve | Approve booking | HR_ADMIN, ADMIN |
| POST | /api/v2/bookings/:id/reject | Reject booking | HR_ADMIN, ADMIN |
| POST | /api/v2/bookings/:id/assign | Assign driver + create trip | HR_ADMIN, ADMIN |
| GET | /api/v2/bookings/my/stats | Employee booking stats | EMPLOYEE, USER |

## V2 Trips API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/trips | List all trips (paginated) | ADMIN, HR_ADMIN |
| GET | /api/v2/trips/:id | Get trip by ID | All authenticated |
| GET | /api/v2/trips/:id/timeline | Get trip event timeline | All authenticated |
| GET | /api/v2/trips/:id/trail | Get GPS location trail | All authenticated |
| POST | /api/v2/trips/:id/start-en-route | Driver starts heading to pickup | DRIVER, CAB_DRIVER |
| POST | /api/v2/trips/:id/mark-arrived | Driver arrived at pickup | DRIVER, CAB_DRIVER |
| POST | /api/v2/trips/:id/pickup-passenger | Passenger boarded | DRIVER, CAB_DRIVER |
| POST | /api/v2/trips/:id/start-trip | Trip started (in transit) | DRIVER, CAB_DRIVER |
| POST | /api/v2/trips/:id/complete | Trip completed | DRIVER, CAB_DRIVER |
| POST | /api/v2/trips/:id/cancel | Cancel trip | DRIVER, CAB_DRIVER, ADMIN |
| POST | /api/v2/trips/:id/no-show | Mark passenger no-show | DRIVER, CAB_DRIVER |
| POST | /api/v2/trips/:id/escalate | Escalate trip issue | All authenticated |
| GET | /api/v2/trips/driver/today | Today assigned trips | DRIVER, CAB_DRIVER |
| POST | /api/v2/trips/driver/location | Update driver GPS | DRIVER, CAB_DRIVER |
| GET | /api/v2/trips/employee/my-trips | Employee trips | EMPLOYEE, USER |

Trip State Machine: ASSIGNED > DRIVER_EN_ROUTE > ARRIVED > PASSENGER_ONBOARD > IN_PROGRESS > COMPLETED (also CANCELLED, NO_SHOW, ESCALATED)

## V2 Vehicles API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/vehicles | List all vehicles | ADMIN, HR_ADMIN |
| GET | /api/v2/vehicles/:id | Get vehicle by ID | ADMIN, HR_ADMIN |
| POST | /api/v2/vehicles | Create vehicle | ADMIN |
| PUT | /api/v2/vehicles/:id | Update vehicle | ADMIN |
| DELETE | /api/v2/vehicles/:id | Soft-delete vehicle | ADMIN |
| GET | /api/v2/vehicles/status/available | Available vehicles | ADMIN, HR_ADMIN |

## V2 Drivers API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/drivers | List all drivers | ADMIN, HR_ADMIN |
| GET | /api/v2/drivers/:id | Get driver by ID | ADMIN, HR_ADMIN |
| POST | /api/v2/drivers | Create driver | ADMIN |
| PUT | /api/v2/drivers/:id | Update driver | ADMIN |
| DELETE | /api/v2/drivers/:id | Soft-delete driver | ADMIN |
| POST | /api/v2/drivers/:id/toggle-availability | Toggle online/offline | DRIVER, CAB_DRIVER, ADMIN |
| GET | /api/v2/drivers/status/online | Online drivers | ADMIN, HR_ADMIN |

## V2 Vendors API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/vendors | List all vendors | ADMIN, HR_ADMIN |
| GET | /api/v2/vendors/:id | Get vendor by ID | ADMIN, HR_ADMIN |
| POST | /api/v2/vendors | Create vendor | ADMIN |
| PUT | /api/v2/vendors/:id | Update vendor | ADMIN |
| DELETE | /api/v2/vendors/:id | Soft-delete vendor | ADMIN |

## V2 Shifts API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/shifts | List all shifts | All authenticated |
| GET | /api/v2/shifts/:id | Get shift by ID | All authenticated |
| POST | /api/v2/shifts | Create shift | ADMIN, HR_ADMIN |
| PUT | /api/v2/shifts/:id | Update shift | ADMIN, HR_ADMIN |
| DELETE | /api/v2/shifts/:id | Soft-delete shift | ADMIN |

## V2 Incidents API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/incidents | List incidents | ADMIN, HR_ADMIN, SECURITY |
| GET | /api/v2/incidents/:id | Get incident by ID | All authenticated |
| POST | /api/v2/incidents | Create incident | All authenticated |
| PUT | /api/v2/incidents/:id/status | Update status | ADMIN, HR_ADMIN |
| POST | /api/v2/incidents/sos | SOS emergency alert | All authenticated |

## V2 Ratings API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | /api/v2/ratings | Submit trip rating | EMPLOYEE, USER |
| GET | /api/v2/ratings/trip/:tripId | Rating for trip | All authenticated |
| GET | /api/v2/ratings/driver/:driverId | Driver ratings | ADMIN, HR_ADMIN |
| GET | /api/v2/ratings/driver/:driverId/stats | Driver rating stats | ADMIN, HR_ADMIN |

## V2 Reports API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/reports/trips | Trip summary report | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/daily | Daily breakdown | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/drivers | Driver performance | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/vehicles | Vehicle utilization | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/employees | Employee usage | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/shifts | Shift report | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/routes | Route report | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/incidents | Incident report | ADMIN, HR_ADMIN |
| GET | /api/v2/reports/export/:type | CSV export | ADMIN, HR_ADMIN |

Query params: start_date, end_date (YYYY-MM-DD)

## V2 HR API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/hr/dashboard | HR dashboard stats | HR_ADMIN, ADMIN |
| GET | /api/v2/hr/employees | Employee roster | HR_ADMIN, ADMIN |
| GET | /api/v2/hr/shift-transport | Shift transport view | HR_ADMIN, ADMIN |
| GET | /api/v2/hr/compliance | Compliance report | HR_ADMIN, ADMIN |
| GET | /api/v2/hr/safety | Safety dashboard | HR_ADMIN, ADMIN |

## V2 Gate (Security) API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | /api/v2/gate/check-in | Gate check-in | SECURITY, ADMIN |
| POST | /api/v2/gate/check-out | Gate check-out | SECURITY, ADMIN |
| GET | /api/v2/gate/search | Search trips | SECURITY, ADMIN |
| POST | /api/v2/gate/exception | Log exception | SECURITY, ADMIN |

## V2 Settings API
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | /api/v2/settings | Get all settings | ADMIN |
| GET | /api/v2/settings/:key | Get setting by key | ADMIN |
| PUT | /api/v2/settings/:key | Update setting | ADMIN |
| POST | /api/v2/settings/bulk | Bulk update | ADMIN |

## Common Response Format
Success: { success: true, data: {}, message: "..." }
Error: { success: false, message: "...", errors: [] }
Paginated: { success: true, data: [], pagination: { page, limit, total, totalPages } }

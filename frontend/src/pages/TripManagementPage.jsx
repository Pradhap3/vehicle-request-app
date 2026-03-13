import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw, Search, UserPlus, X } from 'lucide-react';
import { bookingAPI, driverAPI, tripAPIv2 } from '../services/api';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['ALL', 'ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'PASSENGER_ONBOARD', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'ESCALATED'];

const STATUS_COLORS = {
  ASSIGNED: 'bg-blue-100 text-blue-700',
  DRIVER_EN_ROUTE: 'bg-indigo-100 text-indigo-700',
  ARRIVED: 'bg-purple-100 text-purple-700',
  PASSENGER_ONBOARD: 'bg-cyan-100 text-cyan-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-gray-100 text-gray-700',
  ESCALATED: 'bg-orange-100 text-orange-700'
};

const TripManagementPage = () => {
  const [trips, setTrips] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [onlineDrivers, setOnlineDrivers] = useState([]);
  const [assignBooking, setAssignBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tripsRes, bookingsRes] = await Promise.all([
        tripAPIv2.getAll({ limit: 100 }),
        bookingAPI.getAll({ status: 'APPROVED', limit: 50 })
      ]);
      setTrips(tripsRes?.data?.data || []);
      setPendingBookings(bookingsRes?.data?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load trip operations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const matchesStatus = statusFilter === 'ALL' || trip.status === statusFilter;
      const q = search.trim().toLowerCase();
      if (!q) return matchesStatus;
      const haystack = [
        trip.trip_ref,
        trip.booking_ref,
        trip.employee_name,
        trip.driver_name,
        trip.vehicle_number,
        trip.pickup_location,
        trip.drop_location,
        trip.route_name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchesStatus && haystack.includes(q);
    });
  }, [search, statusFilter, trips]);

  const stats = useMemo(() => {
    return {
      total: trips.length,
      active: trips.filter((trip) => ['ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'PASSENGER_ONBOARD', 'IN_PROGRESS'].includes(trip.status)).length,
      completed: trips.filter((trip) => trip.status === 'COMPLETED').length,
      exceptions: trips.filter((trip) => ['CANCELLED', 'NO_SHOW', 'ESCALATED'].includes(trip.status)).length
    };
  }, [trips]);

  const openTripDetails = async (trip) => {
    setSelectedTrip(trip);
    try {
      const response = await tripAPIv2.getTimeline(trip.id);
      setTimeline(response?.data?.data || []);
    } catch {
      setTimeline([]);
    }
  };

  const openAssignModal = async (booking) => {
    setAssignBooking(booking);
    try {
      const response = await driverAPI.getOnline();
      setOnlineDrivers(response?.data?.data || []);
    } catch {
      setOnlineDrivers([]);
    }
  };

  const handleAssign = async (driverId, vehicleId) => {
    if (!assignBooking) return;
    try {
      await bookingAPI.assign(assignBooking.id, { driver_id: driverId, vehicle_id: vehicleId || null });
      toast.success('Driver assigned successfully');
      setAssignBooking(null);
      setOnlineDrivers([]);
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to assign driver');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Trip Management</h1>
          <p className="text-sm text-gray-500">Assign approved bookings and monitor active trip progress.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Trips</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-primary-600">{stats.active}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Pending Assignment</p>
          <p className="text-2xl font-bold text-amber-600">{pendingBookings.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Approved Bookings Waiting for Driver</h2>
            <p className="text-sm text-gray-500">Assign an online driver to convert a booking into a live trip.</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {pendingBookings.length ? (
            pendingBookings.map((booking) => (
              <div key={booking.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-800">{booking.employee_name || booking.booking_ref}</p>
                    <p className="text-sm text-gray-500">{booking.pickup_location} to {booking.drop_location}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      {booking.pickup_time ? new Date(booking.pickup_time).toLocaleString() : 'Pickup time pending'}
                    </p>
                  </div>
                  <button
                    onClick={() => openAssignModal(booking)}
                    className="flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600"
                  >
                    <UserPlus size={14} />
                    Assign
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 lg:col-span-2">
              No approved bookings are waiting for assignment.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search by ref, employee, driver, vehicle..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-[240px] border-none bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="border-none bg-transparent text-sm outline-none"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === 'ALL' ? 'All Statuses' : status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : filteredTrips.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">Trip Ref</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Booking Ref</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Employee</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Driver</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Vehicle</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Scheduled</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Route</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrips.map((trip) => (
                <tr key={trip.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{trip.trip_ref || `TRIP-${trip.id}`}</td>
                  <td className="px-4 py-3 text-gray-600">{trip.booking_ref || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{trip.employee_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{trip.driver_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{trip.vehicle_number || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[trip.status] || 'bg-gray-100 text-gray-700'}`}>
                      {trip.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {trip.scheduled_pickup ? new Date(trip.scheduled_pickup).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{trip.route_name || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openTripDetails(trip)} className="text-xs font-medium text-primary-600 hover:underline">
                      View timeline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center text-sm text-gray-500">No trips match the current filters.</div>
        )}
      </div>

      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedTrip(null)}>
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Trip Timeline</h2>
                <p className="text-sm text-gray-500">{selectedTrip.trip_ref || selectedTrip.booking_ref}</p>
              </div>
              <button onClick={() => setSelectedTrip(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Passenger</p>
                <p className="font-medium text-gray-800">{selectedTrip.employee_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Driver</p>
                <p className="font-medium text-gray-800">{selectedTrip.driver_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Pickup</p>
                <p className="font-medium text-gray-800">{selectedTrip.pickup_location || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Drop</p>
                <p className="font-medium text-gray-800">{selectedTrip.drop_location || '-'}</p>
              </div>
            </div>

            <div className="mt-6 space-y-4 border-l-2 border-gray-200 pl-5">
              {timeline.length ? (
                timeline.map((event, index) => (
                  <div key={`${event.id || event.created_at}-${index}`} className="relative">
                    <div className="absolute -left-[28px] top-1 h-3 w-3 rounded-full border-2 border-primary-500 bg-white" />
                    <p className="font-medium text-gray-800">{(event.to_status || event.event_type || '').replace(/_/g, ' ')}</p>
                    <p className="text-sm text-gray-500">{event.notes || event.event_type || 'Status update recorded'}</p>
                    <p className="text-xs text-gray-400">{event.created_at ? new Date(event.created_at).toLocaleString() : ''}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No timeline events recorded for this trip yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {assignBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAssignBooking(null)}>
          <div className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Assign Driver</h2>
                <p className="text-sm text-gray-500">{assignBooking.booking_ref}</p>
              </div>
              <button onClick={() => setAssignBooking(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800">{assignBooking.employee_name || 'Employee booking'}</p>
              <p>{assignBooking.pickup_location} to {assignBooking.drop_location}</p>
            </div>

            <div className="space-y-2">
              {onlineDrivers.length ? (
                onlineDrivers.map((driver) => (
                  <button
                    key={driver.id}
                    onClick={() => handleAssign(driver.id, driver.vehicle_id)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-4 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{driver.name}</p>
                      <p className="text-xs text-gray-500">
                        {driver.vehicle_number || 'Vehicle pending'} • {driver.availability_status || 'ONLINE'}
                      </p>
                    </div>
                    <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">Online</span>
                  </button>
                ))
              ) : (
                <p className="py-6 text-center text-sm text-gray-500">No online drivers are available for assignment.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripManagementPage;

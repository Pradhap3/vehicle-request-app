import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, Users, Send, ArrowLeft } from 'lucide-react';
import { bookingAPI, routeAPI, shiftAPI } from '../services/api';
import toast from 'react-hot-toast';

const BookRidePage = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    pickup_location: '',
    drop_location: '',
    pickup_time: '',
    passengers: 1,
    purpose: '',
    booking_type: 'ADHOC',
    priority: 'NORMAL',
    route_id: '',
    shift_id: '',
    pickup_latitude: '',
    pickup_longitude: '',
    drop_latitude: '',
    drop_longitude: '',
    notes: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [routeRes, shiftRes] = await Promise.all([
          routeAPI.getAll(),
          shiftAPI.getAll()
        ]);
        setRoutes(routeRes.data?.data || []);
        setShifts(shiftRes.data?.data || []);
      } catch {
        // non-critical
      }
    };
    fetchData();
  }, []);

  const handleRouteSelect = (routeId) => {
    const route = routes.find(r => String(r.id) === String(routeId));
    if (route) {
      setForm(prev => ({
        ...prev,
        route_id: routeId,
        pickup_location: route.start_point,
        drop_location: route.end_point,
        pickup_latitude: route.start_latitude || '',
        pickup_longitude: route.start_longitude || '',
        drop_latitude: route.end_latitude || '',
        drop_longitude: route.end_longitude || ''
      }));
    } else {
      setForm(prev => ({ ...prev, route_id: routeId }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.pickup_location || !form.drop_location || !form.pickup_time) {
      toast.error('Please fill in pickup, drop location, and time');
      return;
    }

    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.route_id) payload.route_id = parseInt(payload.route_id);
      if (payload.shift_id) payload.shift_id = parseInt(payload.shift_id);
      payload.passengers = parseInt(payload.passengers) || 1;

      await bookingAPI.create(payload);
      toast.success('Ride booked successfully!');
      navigate('/my-trips');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to book ride');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Book a Ride</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        {/* Route selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Route (optional)</label>
          <select
            value={form.route_id}
            onChange={(e) => handleRouteSelect(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">-- Custom pickup/drop --</option>
            {routes.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Pickup & Drop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <MapPin size={14} className="inline mr-1" />Pickup Location *
            </label>
            <input
              type="text" required
              value={form.pickup_location}
              onChange={(e) => setForm(prev => ({ ...prev, pickup_location: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. Whitefield Bus Stop"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <MapPin size={14} className="inline mr-1" />Drop Location *
            </label>
            <input
              type="text" required
              value={form.drop_location}
              onChange={(e) => setForm(prev => ({ ...prev, drop_location: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. AISIN Plant"
            />
          </div>
        </div>

        {/* Time & Passengers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Clock size={14} className="inline mr-1" />Pickup Time *
            </label>
            <input
              type="datetime-local" required
              value={form.pickup_time}
              onChange={(e) => setForm(prev => ({ ...prev, pickup_time: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Users size={14} className="inline mr-1" />Passengers
            </label>
            <input
              type="number" min="1" max="10"
              value={form.passengers}
              onChange={(e) => setForm(prev => ({ ...prev, passengers: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
            <select
              value={form.shift_id}
              onChange={(e) => setForm(prev => ({ ...prev, shift_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-- None --</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.shift_code})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Booking type & Priority */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Booking Type</label>
            <select
              value={form.booking_type}
              onChange={(e) => setForm(prev => ({ ...prev, booking_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="ADHOC">Ad-hoc</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="RECURRING">Recurring</option>
              <option value="SHIFT_BASED">Shift-based</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        {/* Purpose */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
          <input
            type="text"
            value={form.purpose}
            onChange={(e) => setForm(prev => ({ ...prev, purpose: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g. Office commute"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={2}
            placeholder="Any special requirements..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          <Send size={18} />
          {loading ? 'Booking...' : 'Book Ride'}
        </button>
      </form>
    </div>
  );
};

export default BookRidePage;

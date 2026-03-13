import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Clock, MapPin, Star, AlertTriangle, Plus, ChevronRight } from 'lucide-react';
import { bookingAPI, tripAPIv2, ratingAPI } from '../services/api';
import toast from 'react-hot-toast';

const statusColors = {
  REQUESTED: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  ASSIGNED: 'bg-indigo-100 text-indigo-800',
  DRIVER_EN_ROUTE: 'bg-purple-100 text-purple-800',
  ARRIVED: 'bg-orange-100 text-orange-800',
  PASSENGER_ONBOARD: 'bg-teal-100 text-teal-800',
  IN_PROGRESS: 'bg-cyan-100 text-cyan-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  NO_SHOW: 'bg-gray-100 text-gray-800',
  ESCALATED: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800'
};

const MyTripsPage = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [ratingModal, setRatingModal] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [bookingRes, statsRes] = await Promise.all([
        bookingAPI.getMy(),
        bookingAPI.getMyStats()
      ]);
      setBookings(bookingRes.data?.data || []);
      setStats(statsRes.data?.data || null);
    } catch (err) {
      toast.error('Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this booking?')) return;
    try {
      await bookingAPI.cancel(id, 'Cancelled by employee');
      toast.success('Booking cancelled');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleRate = async () => {
    if (!ratingModal) return;
    try {
      await ratingAPI.create({
        trip_id: ratingModal.trip_id,
        booking_id: ratingModal.booking_id,
        rating: ratingValue,
        feedback,
        driver_id: ratingModal.driver_id
      });
      toast.success('Thank you for your feedback!');
      setRatingModal(null);
      setRatingValue(5);
      setFeedback('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit rating');
    }
  };

  const filtered = filter === 'ALL' ? bookings : bookings.filter(b => b.status === filter);

  const formatTime = (dt) => {
    if (!dt) return '-';
    return new Date(dt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Trips</h1>
        <button
          onClick={() => navigate('/book-ride')}
          className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-600 transition-colors"
        >
          <Plus size={18} /> Book Ride
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-800' },
            { label: 'Completed', value: stats.completed, color: 'text-green-600' },
            { label: 'Upcoming', value: stats.upcoming, color: 'text-blue-600' },
            { label: 'Cancelled', value: stats.cancelled, color: 'text-red-600' },
            { label: 'No-shows', value: stats.no_shows, color: 'text-orange-600' }
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value || 0}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {['ALL', 'REQUESTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Bookings list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500">No trips found</div>
        )}
        {filtered.map(booking => (
          <div key={booking.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[booking.status] || 'bg-gray-100'}`}>
                    {booking.status?.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-400">{booking.booking_ref}</span>
                  {booking.priority === 'URGENT' && <AlertTriangle size={14} className="text-red-500" />}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-700 mb-1">
                  <MapPin size={14} className="text-green-500 flex-shrink-0" />
                  <span className="truncate">{booking.pickup_location}</span>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  <span className="truncate">{booking.drop_location}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Clock size={12} />{formatTime(booking.pickup_time)}</span>
                  <span className="flex items-center gap-1"><Car size={12} />{booking.booking_type}</span>
                  {booking.route_name && <span>{booking.route_name}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {['REQUESTED', 'APPROVED', 'ASSIGNED'].includes(booking.status) && (
                  <button onClick={() => handleCancel(booking.id)} className="text-xs text-red-600 hover:text-red-800">Cancel</button>
                )}
                {booking.status === 'COMPLETED' && (
                  <button onClick={() => setRatingModal(booking)} className="flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-800">
                    <Star size={12} /> Rate
                  </button>
                )}
                {['DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(booking.status) && (
                  <button onClick={() => navigate('/employee/tracking')} className="text-xs text-primary-600 hover:text-primary-800">Track</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rating modal */}
      {ratingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Rate your trip</h3>
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRatingValue(n)}>
                  <Star size={32} className={n <= ratingValue ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                </button>
              ))}
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Your feedback (optional)..."
              className="w-full rounded-lg border border-gray-300 p-3 text-sm mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              <button onClick={() => setRatingModal(null)} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm">Cancel</button>
              <button onClick={handleRate} className="flex-1 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyTripsPage;

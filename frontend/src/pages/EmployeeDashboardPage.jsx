import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Car, Clock, MapPin, Calendar, Bell, CheckCircle,
  XCircle, AlertTriangle, Phone, Navigation,
  RefreshCw, Plus, Loader2, Route
} from 'lucide-react';
import { requestAPI, notificationAPI, transportAPI, routeAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';

const emptyProfileForm = () => ({
  route_id: '',
  shift_code: '',
  pickup_location: '',
  drop_location: '',
  stop_name: '',
  stop_sequence: '',
  auto_generate: true,
  effective_from: format(new Date(), 'yyyy-MM-dd'),
  effective_to: ''
});

export default function EmployeeDashboardPage() {
  const { t } = useLanguage();
  const { socket } = useSocket();
  const [myRequests, setMyRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [todayTrip, setTodayTrip] = useState(null);
  const [transportProfile, setTransportProfile] = useState(null);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [profileStops, setProfileStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [requestForm, setRequestForm] = useState({
    pickup_date: format(new Date(), 'yyyy-MM-dd'),
    pickup_time: '08:00',
    pickup_location: '',
    drop_location: '',
    notes: '',
    request_type: 'ADHOC'
  });
  const [profileForm, setProfileForm] = useState(emptyProfileForm());

  const formatShiftLabel = (value) => {
    const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!normalized) return 'Not set';
    if (normalized === 'GENERAL' || normalized === 'G') return 'General';
    if (normalized === 'SHIFT_1' || normalized === 'SHIFT1' || normalized === 'A') return 'Shift 1';
    if (normalized === 'SHIFT_2' || normalized === 'SHIFT2' || normalized === 'B') return 'Shift 2';
    if (normalized === 'SHIFT_3' || normalized === 'SHIFT3' || normalized === 'C') return 'Shift 3';
    return value;
  };

  const selectedProfileStop = profileStops.find((stop) => String(stop.stop_sequence) === String(profileForm.stop_sequence))
    || profileStops.find((stop) => stop.stop_name === profileForm.stop_name)
    || null;

  const hydrateProfileForm = (profile) => ({
    route_id: profile?.route_id || '',
    shift_code: profile?.shift_code || '',
    pickup_location: profile?.pickup_location || '',
    drop_location: profile?.drop_location || '',
    stop_name: profile?.stop_name || '',
    stop_sequence: profile?.stop_sequence || '',
    auto_generate: profile?.auto_generate !== false,
    effective_from: profile?.effective_from ? String(profile.effective_from).slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
    effective_to: profile?.effective_to ? String(profile.effective_to).slice(0, 10) : ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!profileForm.route_id) {
      setProfileStops([]);
      return;
    }

    let active = true;

    const loadStops = async () => {
      try {
        const routeResponse = await routeAPI.getById(profileForm.route_id);
        if (active) {
          setProfileStops(routeResponse.data?.data?.stops || []);
        }
      } catch (error) {
        if (active) {
          setProfileStops([]);
        }
      }
    };

    loadStops();

    return () => {
      active = false;
    };
  }, [profileForm.route_id]);

  useEffect(() => {
    if (!socket) return undefined;

    const onTripUpdate = (data) => {
      if (data.type === 'DELAY') {
        toast.error(`Trip delayed: ${data.message}`, { duration: 6000 });
      }
      fetchData();
    };

    const onNotification = (data) => {
      setNotifications((prev) => [data, ...prev]);
      toast(data.message, { icon: '🔔' });
    };

    socket.on('cab_assigned', fetchData);
    socket.on('trip_update', onTripUpdate);
    socket.on('notification', onNotification);

    return () => {
      socket.off('cab_assigned', fetchData);
      socket.off('trip_update', onTripUpdate);
      socket.off('notification', onNotification);
    };
  }, [socket]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [requestsRes, notificationsRes, profileRes, todayTripRes] = await Promise.all([
        requestAPI.getMyRequests(),
        notificationAPI.getAll().catch(() => ({ data: { data: [] } })),
        transportAPI.getMyProfile().catch(() => ({ data: { data: { profile: null, routes: [], stops: [] } } })),
        transportAPI.getMyTodayTrip().catch(() => ({ data: { data: null } }))
      ]);

      const requests = requestsRes.data?.data || [];
      const profileData = profileRes.data?.data || {};

      setMyRequests(requests);
      setNotifications(notificationsRes.data?.data || []);
      setTodayTrip(todayTripRes.data?.data || null);
      setTransportProfile(profileData.profile || null);
      setAvailableRoutes(profileData.routes || []);
      setProfileStops(profileData.stops || []);
      setProfileForm(hydrateProfileForm(profileData.profile));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestAPI.create(requestForm);
      toast.success('Adhoc request submitted successfully');
      setShowRequestModal(false);
      setRequestForm({
        pickup_date: format(new Date(), 'yyyy-MM-dd'),
        pickup_time: '08:00',
        pickup_location: '',
        drop_location: '',
        notes: '',
        request_type: 'ADHOC'
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSubmitting(true);
    try {
      await transportAPI.saveMyProfile({
        ...profileForm,
        route_id: profileForm.route_id || null,
        stop_sequence: profileForm.stop_sequence ? parseInt(profileForm.stop_sequence, 10) : null
      });
      toast.success('Recurring transport profile saved');
      setShowProfileModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to save transport profile');
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!confirm('Are you sure you want to cancel this request?')) return;
    try {
      await requestAPI.cancel(requestId);
      toast.success('Request cancelled');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to cancel request');
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
      COMPLETED: 'bg-blue-100 text-blue-800',
      IN_PROGRESS: 'bg-indigo-100 text-indigo-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.PENDING}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM dd, yyyy');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav_my_dashboard')}</h1>
          <p className="text-gray-600">{t('employee_manage_desc')}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {t('dash_refresh')}
          </button>
          <button onClick={() => setShowProfileModal(true)} className="btn-secondary flex items-center gap-2">
            <Route className="w-4 h-4" />
            Recurring Profile
          </button>
          <button onClick={() => setShowRequestModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Adhoc Request
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Recurring Transport Profile</h2>
            {transportProfile ? (
              <div className="space-y-1 text-sm text-gray-600">
                <p><strong>Route:</strong> {transportProfile.route_name || 'Not assigned yet'}</p>
                <p><strong>{t('profile_shift')}:</strong> {formatShiftLabel(transportProfile.shift_code)}</p>
                <p><strong>Pickup:</strong> {transportProfile.pickup_location || 'Not set'}</p>
                <p><strong>Drop:</strong> {transportProfile.drop_location || 'Not set'}</p>
                <p><strong>Stop:</strong> {transportProfile.stop_name || 'Not set'}{transportProfile.stop_sequence ? ` (Seq ${transportProfile.stop_sequence})` : ''}</p>
                <p><strong>Auto-generate:</strong> {transportProfile.auto_generate ? 'Enabled' : 'Disabled'}</p>
                <p><strong>Effective:</strong> {transportProfile.effective_from ? String(transportProfile.effective_from).slice(0, 10) : 'Immediate'}{transportProfile.effective_to ? ` to ${String(transportProfile.effective_to).slice(0, 10)}` : ''}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No recurring transport profile saved yet. Configure it once and the system will generate your daily commute automatically.</p>
            )}
          </div>
          <button onClick={() => setShowProfileModal(true)} className="text-primary hover:underline text-sm">
            {transportProfile ? 'Edit Profile' : 'Create Profile'}
          </button>
        </div>
      </div>

      {todayTrip && (
        <div className="bg-gradient-to-r from-primary to-primary/80 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t('employee_todays_trip')}</h2>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{t('employee_pickup_at')} {todayTrip.pickup_time || todayTrip.requested_time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{todayTrip.pickup_location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4" />
                  <span>{t('employee_to')}: {todayTrip.drop_location}</span>
                </div>
                {todayTrip.route_name && (
                  <div className="flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    <span>{todayTrip.route_name}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              {todayTrip.cab_number && (
                <div className="space-y-3">
                  <div className="bg-white/20 rounded-lg px-4 py-2">
                    <Car className="w-8 h-8 mx-auto mb-1" />
                    <p className="font-bold">{todayTrip.cab_number}</p>
                    {todayTrip.driver_name && <p className="text-sm opacity-90">{todayTrip.driver_name}</p>}
                    {todayTrip.driver_phone && (
                      <a href={`tel:${todayTrip.driver_phone}`} className="flex items-center gap-1 text-sm mt-1 hover:underline">
                        <Phone className="w-3 h-3" />
                        {todayTrip.driver_phone}
                      </a>
                    )}
                  </div>
                  <Link
                    to="/employee/tracking"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-primary-700 rounded-lg font-medium hover:bg-primary-50"
                  >
                    <Navigation className="w-4 h-4" />
                    Track Cab Live
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Calendar className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-sm text-gray-600">{t('dash_total_requests')}</p><p className="text-2xl font-bold">{myRequests.length}</p></div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg"><Clock className="w-5 h-5 text-yellow-600" /></div>
            <div><p className="text-sm text-gray-600">{t('dash_pending')}</p><p className="text-2xl font-bold">{myRequests.filter((r) => r.status === 'PENDING').length}</p></div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-sm text-gray-600">{t('requests_approved')}</p><p className="text-2xl font-bold">{myRequests.filter((r) => ['APPROVED', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)).length}</p></div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Bell className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-sm text-gray-600">{t('notifications_unread')}</p><p className="text-2xl font-bold">{notifications.filter((n) => !n.is_read).length}</p></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('employee_my_requests')}</h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {myRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Car className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('employee_no_requests')}</p>
              </div>
            ) : (
              myRequests.map((request) => (
                <div key={request.id} className="p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatDate(request.requested_time || request.pickup_time)}</span>
                        <span className="text-gray-500">{t('employee_at')} {request.pickup_time ? format(parseISO(request.pickup_time), 'HH:mm') : ''}</span>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {request.pickup_location} → {request.drop_location}
                      </div>
                      <div className="text-xs text-gray-500">
                        Type: {request.request_type || 'ADHOC'}
                      </div>
                      {request.cab_number && (
                        <div className="text-sm text-green-600 flex items-center gap-1">
                          <Car className="w-3 h-3" />
                          {t('employee_assigned')}: {request.cab_number}{request.driver_name ? ` (${request.driver_name})` : ''}
                        </div>
                      )}
                    </div>
                    {request.status === 'PENDING' && (
                      <button onClick={() => handleCancelRequest(request.id)} className="text-red-600 hover:text-red-700 text-sm">
                        {t('employee_cancel')}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('employee_notifications_title')}</h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('employee_no_notifications')}</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${!notification.is_read ? 'bg-blue-50' : ''}`}
                  onClick={() => markNotificationRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${notification.type === 'DELAY' ? 'bg-red-100' : notification.type === 'ASSIGNMENT' ? 'bg-green-100' : 'bg-blue-100'}`}>
                      {notification.type === 'DELAY' ? <AlertTriangle className="w-4 h-4 text-red-600" /> : notification.type === 'ASSIGNMENT' ? <Car className="w-4 h-4 text-green-600" /> : <Bell className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{notification.title}</p>
                      <p className="text-sm text-gray-600 line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{notification.created_at && format(parseISO(notification.created_at), 'MMM dd, HH:mm')}</p>
                    </div>
                    {!notification.is_read && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Recurring Transport Profile</h2>
              <button onClick={() => setShowProfileModal(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                  <select value={profileForm.route_id} onChange={(e) => setProfileForm({ ...profileForm, route_id: e.target.value })} className="input">
                    <option value="">Select route</option>
                    {availableRoutes.map((route) => (
                      <option key={route.id} value={route.id}>{route.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
                  <input type="text" value={profileForm.shift_code} onChange={(e) => setProfileForm({ ...profileForm, shift_code: e.target.value })} className="input" placeholder="SHIFT_1 / A / GENERAL" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pickup location</label>
                  <input type="text" value={profileForm.pickup_location} onChange={(e) => setProfileForm({ ...profileForm, pickup_location: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Drop location</label>
                  <input type="text" value={profileForm.drop_location} onChange={(e) => setProfileForm({ ...profileForm, drop_location: e.target.value })} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred stop</label>
                  {profileStops.length > 0 ? (
                    <select
                      value={profileForm.stop_sequence || ''}
                      onChange={(e) => {
                        const selected = profileStops.find((stop) => String(stop.stop_sequence) === e.target.value);
                        setProfileForm({
                          ...profileForm,
                          stop_name: selected?.stop_name || '',
                          stop_sequence: selected ? String(selected.stop_sequence) : ''
                        });
                      }}
                      className="input"
                    >
                      <option value="">Select stop</option>
                      {profileStops.map((stop) => (
                        <option key={stop.id} value={stop.stop_sequence}>
                          {stop.stop_sequence}. {stop.stop_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={profileForm.stop_name} onChange={(e) => setProfileForm({ ...profileForm, stop_name: e.target.value })} className="input" placeholder="Kolar / Bangarpet" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stop sequence</label>
                  <input
                    type="number"
                    value={profileForm.stop_sequence}
                    onChange={(e) => setProfileForm({ ...profileForm, stop_sequence: e.target.value })}
                    className="input"
                    placeholder="1"
                    readOnly={profileStops.length > 0}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effective from</label>
                  <input type="date" value={profileForm.effective_from} onChange={(e) => setProfileForm({ ...profileForm, effective_from: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effective to</label>
                  <input type="date" value={profileForm.effective_to} onChange={(e) => setProfileForm({ ...profileForm, effective_to: e.target.value })} className="input" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={profileForm.auto_generate} onChange={(e) => setProfileForm({ ...profileForm, auto_generate: e.target.checked })} />
                Generate daily commute automatically
              </label>
              {profileStops.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Route stops</p>
                  <div className="space-y-1 text-sm text-gray-600">
                    {profileStops.map((stop) => (
                      <p key={stop.id} className={selectedProfileStop?.id === stop.id ? 'font-medium text-primary-700' : ''}>
                        {stop.stop_sequence}. {stop.stop_name}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowProfileModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={profileSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {profileSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('employee_new_cab_request')}</h2>
              <button onClick={() => setShowRequestModal(false)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRequest} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee_pickup_date')} *</label>
                  <input type="date" required min={format(new Date(), 'yyyy-MM-dd')} value={requestForm.pickup_date} onChange={(e) => setRequestForm({ ...requestForm, pickup_date: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee_pickup_time')} *</label>
                  <input type="time" required value={requestForm.pickup_time} onChange={(e) => setRequestForm({ ...requestForm, pickup_time: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Request type</label>
                <select value={requestForm.request_type} onChange={(e) => setRequestForm({ ...requestForm, request_type: e.target.value })} className="input">
                  <option value="ADHOC">Business / Adhoc</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="LOCATION_CHANGE">Location Change</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee_pickup_location')} *</label>
                <input type="text" required placeholder={t('employee_enter_pickup')} value={requestForm.pickup_location} onChange={(e) => setRequestForm({ ...requestForm, pickup_location: e.target.value })} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee_drop_location')} *</label>
                <input type="text" required placeholder={t('employee_enter_drop')} value={requestForm.drop_location} onChange={(e) => setRequestForm({ ...requestForm, drop_location: e.target.value })} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee_notes_optional')}</label>
                <textarea rows={3} placeholder={t('employee_special_instructions')} value={requestForm.notes} onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })} className="input" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRequestModal(false)} className="btn-secondary flex-1">{t('employee_cancel')}</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />{t('employee_submitting')}</> : t('employee_submit_request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

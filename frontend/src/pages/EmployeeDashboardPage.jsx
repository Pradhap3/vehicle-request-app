import { useState, useEffect } from 'react';
import { 
  Car, Clock, MapPin, Calendar, Bell, CheckCircle, 
  XCircle, AlertTriangle, Phone, User, Navigation,
  RefreshCw, Plus, Loader2
} from 'lucide-react';
import { requestAPI, notificationAPI, cabAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';

export default function EmployeeDashboardPage() {
  const { t } = useLanguage();
  const [myRequests, setMyRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [todayTrip, setTodayTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { socket, connected } = useSocket();

  // New request form
  const [requestForm, setRequestForm] = useState({
    pickup_date: format(new Date(), 'yyyy-MM-dd'),
    pickup_time: '08:00',
    pickup_location: '',
    drop_location: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('cab_assigned', (data) => {
        toast.success(`Cab ${data.cabNumber} assigned to your request!`);
        fetchData();
      });

      socket.on('trip_update', (data) => {
        if (data.type === 'DELAY') {
          toast.error(`Trip delayed: ${data.message}`, { duration: 6000 });
        }
        fetchData();
      });

      socket.on('notification', (data) => {
        setNotifications(prev => [data, ...prev]);
        toast(data.message, { icon: '🔔' });
      });

      return () => {
        socket.off('cab_assigned');
        socket.off('trip_update');
        socket.off('notification');
      };
    }
  }, [socket]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [requestsRes, notificationsRes] = await Promise.all([
        requestAPI.getMyRequests(),
        notificationAPI.getAll().catch(() => ({ data: { data: [] } }))
      ]);

      const requests = requestsRes.data.data || [];
      setMyRequests(requests);

      // Find today's trip
      const today = new Date().toISOString().split('T')[0];
      const todayRequest = requests.find(r => 
        r.pickup_date?.split('T')[0] === today && 
        r.status === 'APPROVED' &&
        r.cab_id
      );
      setTodayTrip(todayRequest);

      setNotifications(notificationsRes.data.data || []);
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
      toast.success('Request submitted successfully!');
      setShowRequestModal(false);
      setRequestForm({
        pickup_date: format(new Date(), 'yyyy-MM-dd'),
        pickup_time: '08:00',
        pickup_location: '',
        drop_location: '',
        notes: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
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
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
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
      COMPLETED: 'bg-blue-100 text-blue-800'
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav_my_dashboard')}</h1>
          <p className="text-gray-600">{t('employee_manage_desc')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('dash_refresh')}
          </button>
          <button
            onClick={() => setShowRequestModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('requests_new')}
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className={`flex items-center gap-2 text-sm ${connected ? 'text-green-600' : 'text-red-600'}`}>
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        {connected ? t('employee_connected_realtime') : t('employee_disconnected_reconnecting')}
      </div>

      {/* Today's Trip Card */}
      {todayTrip && (
        <div className="bg-gradient-to-r from-primary to-primary/80 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t('employee_todays_trip')}</h2>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{t('employee_pickup_at')} {todayTrip.pickup_time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{todayTrip.pickup_location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4" />
                  <span>{t('employee_to')}: {todayTrip.drop_location}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              {todayTrip.cab_number && (
                <div className="bg-white/20 rounded-lg px-4 py-2">
                  <Car className="w-8 h-8 mx-auto mb-1" />
                  <p className="font-bold">{todayTrip.cab_number}</p>
                  {todayTrip.driver_name && (
                    <p className="text-sm opacity-90">{todayTrip.driver_name}</p>
                  )}
                  {todayTrip.driver_phone && (
                    <a 
                      href={`tel:${todayTrip.driver_phone}`}
                      className="flex items-center gap-1 text-sm mt-1 hover:underline"
                    >
                      <Phone className="w-3 h-3" />
                      {todayTrip.driver_phone}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
                <p className="text-sm text-gray-600">{t('dash_total_requests')}</p>

              <p className="text-2xl font-bold">{myRequests.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
                <p className="text-sm text-gray-600">{t('dash_pending')}</p>
              <p className="text-2xl font-bold">
                {myRequests.filter(r => r.status === 'PENDING').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
                <p className="text-sm text-gray-600">{t('requests_approved')}</p>
              <p className="text-2xl font-bold">
                {myRequests.filter(r => r.status === 'APPROVED').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Bell className="w-5 h-5 text-purple-600" />
            </div>
            <div>
                <p className="text-sm text-gray-600">{t('notifications_unread')}</p>
              <p className="text-2xl font-bold">
                {notifications.filter(n => !n.is_read).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Requests */}
        <div className="lg:col-span-2 card">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('employee_my_requests')}</h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {myRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Car className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('employee_no_requests')}</p>
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="text-primary hover:underline mt-2"
                >
                  {t('employee_create_first_request')}
                </button>
              </div>
            ) : (
              myRequests.map(request => (
                <div key={request.id} className="p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {formatDate(request.pickup_date)}
                        </span>
                        <span className="text-gray-500">{t('employee_at')} {request.pickup_time}</span>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {request.pickup_location} → {request.drop_location}
                      </div>
                      {request.cab_number && (
                        <div className="text-sm text-green-600 flex items-center gap-1">
                          <Car className="w-3 h-3" />
                          {t('employee_assigned')}: {request.cab_number}
                          {request.driver_name && ` (${request.driver_name})`}
                        </div>
                      )}
                    </div>
                    {request.status === 'PENDING' && (
                      <button
                        onClick={() => handleCancelRequest(request.id)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        {t('employee_cancel')}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notifications */}
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
              notifications.slice(0, 10).map(notification => (
                <div 
                  key={notification.id} 
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${
                    !notification.is_read ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => markNotificationRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${
                      notification.type === 'DELAY' ? 'bg-red-100' :
                      notification.type === 'ASSIGNMENT' ? 'bg-green-100' :
                      'bg-blue-100'
                    }`}>
                      {notification.type === 'DELAY' ? (
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      ) : notification.type === 'ASSIGNMENT' ? (
                        <Car className="w-4 h-4 text-green-600" />
                      ) : (
                        <Bell className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {notification.created_at && format(parseISO(notification.created_at), 'MMM dd, HH:mm')}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* New Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('employee_new_cab_request')}</h2>
              <button 
                onClick={() => setShowRequestModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRequest} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employee_pickup_date')} *
                  </label>
                  <input
                    type="date"
                    required
                    min={format(new Date(), 'yyyy-MM-dd')}
                    value={requestForm.pickup_date}
                    onChange={(e) => setRequestForm({...requestForm, pickup_date: e.target.value})}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('employee_pickup_time')} *
                  </label>
                  <input
                    type="time"
                    required
                    value={requestForm.pickup_time}
                    onChange={(e) => setRequestForm({...requestForm, pickup_time: e.target.value})}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('employee_pickup_location')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('employee_enter_pickup')}
                  value={requestForm.pickup_location}
                  onChange={(e) => setRequestForm({...requestForm, pickup_location: e.target.value})}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('employee_drop_location')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('employee_enter_drop')}
                  value={requestForm.drop_location}
                  onChange={(e) => setRequestForm({...requestForm, drop_location: e.target.value})}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('employee_notes_optional')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('employee_special_instructions')}
                  value={requestForm.notes}
                  onChange={(e) => setRequestForm({...requestForm, notes: e.target.value})}
                  className="input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="btn-secondary flex-1"
                >
                  {t('employee_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('employee_submitting')}
                    </>
                  ) : (
                    t('employee_submit_request')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

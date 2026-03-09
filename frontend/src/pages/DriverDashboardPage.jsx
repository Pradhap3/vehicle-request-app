import React, { useState, useEffect, useCallback } from 'react';
import { cabAPI, requestAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { 
  MapPin, 
  Navigation, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  RefreshCw,
  Car,
  Play,
  Pause,
  User,
  Phone
} from 'lucide-react';
import toast from 'react-hot-toast';

const LocationPermissionPrompt = ({ onRequestPermission, permissionStatus, loading, t }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <MapPin className="text-primary-500" size={40} />
      </div>
      
      <h2 className="text-2xl font-bold text-gray-800 mb-3">{t('driver_enable_location_sharing')}</h2>
      
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        {t('driver_location_intro')}
      </p>

      {permissionStatus === 'denied' ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 max-w-md mx-auto">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-left">
              <p className="font-medium text-red-800">{t('driver_location_denied')}</p>
              <p className="text-sm text-red-600 mt-1">
                {t('driver_location_enable_browser')}
              </p>
              <ol className="text-sm text-red-600 mt-2 list-decimal list-inside space-y-1">
                <li>Click the lock/info icon in the address bar</li>
                <li>Find "Location" in the permissions list</li>
                <li>Change it to "Allow"</li>
                <li>Refresh this page</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 max-w-md mx-auto">
          <div className="flex items-start gap-3">
            <Navigation className="text-blue-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-left">
              <p className="font-medium text-blue-800">How it works:</p>
              <ul className="text-sm text-blue-600 mt-1 space-y-1">
                <li>• Your location is shared only when you're on duty</li>
                <li>• Employees can see your cab approaching</li>
                <li>• HR can monitor route progress</li>
                <li>• Location data is encrypted and secure</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onRequestPermission}
        disabled={loading}
        className="px-8 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {t('driver_requesting_access')}
          </>
        ) : permissionStatus === 'denied' ? (
          <>
            <RefreshCw size={20} />
            {t('driver_check_permission')}
          </>
        ) : (
          <>
            <MapPin size={20} />
            {t('driver_enable_location_access')}
          </>
        )}
      </button>
    </div>
  );
};

const PassengerCard = ({ passenger, onBoard, onNoShow, onCall, loading, t }) => {
  const normalizedStatus = String(passenger?.status || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const isBoarded = Boolean(passenger?.is_boarded) || normalizedStatus === 'IN_PROGRESS';
  const isDropped = Boolean(passenger?.is_dropped) || normalizedStatus === 'COMPLETED';
  const isNoShow = normalizedStatus === 'NO_SHOW';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
            <User className="text-primary-600" size={18} />
          </div>
          <div>
            <p className="font-medium text-gray-800">{passenger.employee_name}</p>
            <p className="text-sm text-gray-500">{passenger.pickup_location || t('driver_default_pickup')}</p>
            {passenger.employee_phone && (
              <a href={`tel:${passenger.employee_phone}`} className="text-sm text-primary-600 hover:underline">
                {passenger.employee_phone}
              </a>
            )}
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          isDropped ? 'bg-blue-100 text-blue-800' :
          isBoarded ? 'bg-green-100 text-green-800' :
          isNoShow ? 'bg-red-100 text-red-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>
          {isDropped ? t('driver_status_dropped') : isBoarded ? t('driver_status_boarded') : isNoShow ? t('driver_status_no_show') : t('driver_status_waiting')}
        </span>
      </div>

      {!isBoarded && !isDropped && !isNoShow && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onCall(passenger)}
            disabled={loading || !passenger.employee_phone}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-50"
          >
            <Phone size={14} />
            {t('driver_action_call')}
          </button>
          <button
            onClick={() => onBoard(passenger.id)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
          >
            <CheckCircle size={14} />
            {t('driver_action_board')}
          </button>
          <button
            onClick={() => onNoShow(passenger)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50"
          >
            <XCircle size={14} />
            {t('driver_action_no_show')}
          </button>
        </div>
      )}

      {isBoarded && !isDropped && !isNoShow && (
        <button
          onClick={() => onBoard(passenger.id, 'drop')}
          disabled={loading}
          className="w-full mt-4 flex items-center justify-center gap-1 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
        >
          <CheckCircle size={14} />
          {t('driver_action_drop')}
        </button>
      )}
    </div>
  );
};

const DriverDashboardPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { emitDriverLocation, connected } = useSocket();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState(null);
  const getApiErrorMessage = (error, fallback = 'Action failed') =>
    error?.response?.data?.error || error?.response?.data?.message || fallback;

  const handleLocationUpdate = useCallback((location) => {
    // Update location on server
    cabAPI.updateLocation({
      latitude: location.latitude,
      longitude: location.longitude
    }).catch(err => console.error('Failed to update location:', err));

    // Emit via socket for real-time updates
    emitDriverLocation(location.latitude, location.longitude);
  }, [emitDriverLocation]);

  const {
    location,
    error: locationError,
    loading: locationLoading,
    permissionStatus,
    requestPermission,
    startWatching,
    stopWatching
  } = useGeolocation({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
    onLocationUpdate: handleLocationUpdate
  });

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await cabAPI.getDriverDashboard();
      const payload = response.data?.data || response.data || {};
      setDashboard({
        ...payload,
        passengers: payload.passengers || payload.assignments || []
      });
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      // Don't show error toast if no cab assigned
      if (error.response?.status !== 404) {
        toast.error('Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    // Auto-refresh dashboard every 30 seconds
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStartTracking = async () => {
    if (!dashboard?.cab || isTracking) return;

    const result = await requestPermission();
    if (result.success) {
      if (result.location) {
        handleLocationUpdate(result.location);
      }
      const id = startWatching();
      setWatchId(id);
      setIsTracking(true);
      
      // Update cab status to available/on_trip
      try {
        await cabAPI.updateStatus(dashboard?.cab?.id, 'AVAILABLE');
        toast.success('Location tracking started');
      } catch (error) {
        console.error('Failed to update status:', error);
      }
    }
  };

  const handleStopTracking = () => {
    stopWatching(watchId);
    setWatchId(null);
    setIsTracking(false);
    toast.info('Location tracking stopped');
  };

  const handleBoardPassenger = async (requestId, action = 'board') => {
    try {
      setActionLoading(true);
      if (action === 'board') {
        await requestAPI.markBoarded(requestId, {
          boarding_area: location ? `${location.latitude}, ${location.longitude}` : 'Unknown',
          boarded_at: new Date().toISOString()
        });
        toast.success('Passenger boarded');
      } else if (action === 'drop') {
        await requestAPI.markDropped(requestId, {
          dropping_area: location ? `${location.latitude}, ${location.longitude}` : 'Unknown',
          dropped_at: new Date().toISOString()
        });
        toast.success('Passenger dropped');
      }
      fetchDashboard();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Action failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoShow = async (passenger) => {
    try {
      setActionLoading(true);
      const requestId = passenger?.id;
      const phone = passenger?.employee_phone;
      if (!requestId) {
        toast.error('Invalid passenger request');
        return;
      }

      if (phone) {
        window.location.href = `tel:${phone}`;
      }

      await requestAPI.logCallAttempt(requestId, {
        call_status: phone ? 'ATTEMPTED' : 'NO_PHONE',
        notes: phone ? 'Driver initiated call before no-show marking' : 'No phone available before no-show marking'
      });

      await requestAPI.markNoShow(requestId);
      toast.success('Marked as no-show');
      fetchDashboard();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Action failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCallPassenger = async (passenger) => {
    try {
      const requestId = passenger?.id;
      const phone = passenger?.employee_phone;
      if (!requestId) {
        toast.error('Invalid passenger request');
        return;
      }

      await requestAPI.logCallAttempt(requestId, {
        call_status: phone ? 'ATTEMPTED' : 'NO_PHONE',
        notes: phone ? 'Driver manually called passenger' : 'No phone available for passenger'
      });

      if (phone) {
        window.location.href = `tel:${phone}`;
      } else {
        toast('No phone number available for this passenger');
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to log call attempt'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {permissionStatus !== 'granted' && (
        <div className="max-w-2xl">
          <LocationPermissionPrompt
            onRequestPermission={handleStartTracking}
            permissionStatus={permissionStatus}
            loading={locationLoading}
            t={t}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('driver_dashboard')}</h1>
          <p className="text-gray-500">{t('driver_welcome')}, {user?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {connected ? t('driver_online') : t('driver_offline')}
          </span>
          <button
            onClick={fetchDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Cab Info & Location Control */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cab Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('driver_your_cab')}</h2>
          
          {dashboard?.cab ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center">
                  <Car className="text-primary-600" size={32} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{dashboard.cab.cab_number}</p>
                  <p className="text-gray-500">{dashboard.cab.capacity} {t('driver_seats')}</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between py-3 border-t border-gray-100">
                <span className="text-gray-600">{t('driver_status_label')}</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  dashboard.cab.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                  dashboard.cab.status === 'ON_TRIP' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {dashboard.cab.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Car size={48} className="mx-auto mb-3 text-gray-300" />
              <p>{t('driver_no_cab_assigned')}</p>
              <p className="text-sm">{t('driver_contact_hr_for_cab')}</p>
            </div>
          )}
        </div>

        {/* Location Tracking */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('driver_location_tracking')}</h2>
          
          <div className="space-y-4">
            {location && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <MapPin size={16} className="text-green-500" />
                  {t('driver_current_location')}
                </div>
                <p className="font-mono text-sm">
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </p>
                {location.accuracy && (
                  <p className="text-xs text-gray-400 mt-1">
                    {t('driver_accuracy')}: {`\u00B1${Math.round(location.accuracy)}m`}
                  </p>
                )}
              </div>
            )}

            {locationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600">{locationError}</p>
              </div>
            )}

            <button
              onClick={isTracking ? handleStopTracking : handleStartTracking}
              disabled={!dashboard?.cab}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${
                isTracking 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-primary-500 text-white hover:bg-primary-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isTracking ? (
                <>
                  <Pause size={20} />
                  {t('driver_stop_tracking')}
                </>
              ) : (
                <>
                  <Play size={20} />
                  {t('driver_start_tracking')}
                </>
              )}
            </button>

            {isTracking && (
              <p className="text-center text-sm text-green-600 flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                {t('driver_tracking_active')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Today's Route */}
      {dashboard?.route && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('driver_todays_route')}</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-green-500" />
              <span>{dashboard.route.start_point}</span>
            </div>
            <div className="flex-1 border-t-2 border-dashed border-gray-300"></div>
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-red-500" />
              <span>{dashboard.route.end_point}</span>
            </div>
          </div>
          {dashboard.route.estimated_time_minutes && (
            <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
              <Clock size={14} />
              {t('driver_estimated_time')}: {dashboard.route.estimated_time_minutes} {t('driver_minutes')}
            </p>
          )}
        </div>
      )}

      {/* Passengers */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          {t('driver_passengers')} ({dashboard?.passengers?.length || 0})
        </h2>
        
        {dashboard?.passengers?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dashboard.passengers.map((passenger) => (
              <PassengerCard
                key={passenger.id}
                passenger={passenger}
                onBoard={handleBoardPassenger}
                onNoShow={handleNoShow}
                onCall={handleCallPassenger}
                loading={actionLoading}
                t={t}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Users size={48} className="mx-auto mb-3 text-gray-300" />
            <p>{t('driver_no_passengers_today')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverDashboardPage;

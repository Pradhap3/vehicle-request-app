import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, Car, Clock, MapPin, Navigation, Phone, RefreshCw, Route } from 'lucide-react';
import toast from 'react-hot-toast';
import { transportAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createCabIcon = () =>
  L.divIcon({
    className: 'employee-cab-marker',
    html: `
      <div style="
        width: 38px;
        height: 38px;
        background: #2563eb;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
        border: 3px solid white;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18]
  });

const stopIcon = L.divIcon({
  className: 'employee-stop-marker',
  html: `
    <div style="
      width: 16px;
      height: 16px;
      background: #10b981;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
    "></div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const boardingPointIcon = L.divIcon({
  className: 'employee-boarding-marker',
  html: `
    <div style="
      width: 20px;
      height: 20px;
      background: #f59e0b;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
    "></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const officeIcon = L.divIcon({
  className: 'employee-office-marker',
  html: `
    <div style="
      width: 20px;
      height: 20px;
      background: #ef4444;
      border-radius: 4px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
    "></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const MapViewport = ({ bounds, center }) => {
  const map = useMap();

  useEffect(() => {
    if (bounds?.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40] });
      return;
    }
    if (center) {
      map.setView(center, 13);
    }
  }, [bounds, center, map]);

  return null;
};

const formatTimestamp = (value) => {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getProgressLabel = (value, t) => {
  switch (value) {
    case 'AT_BOARDING_POINT':
      return t('tracking_progress_at_boarding');
    case 'LEFT_BOARDING_POINT':
      return t('tracking_progress_left_boarding');
    case 'COMING_TO_BOARDING_POINT':
      return t('tracking_progress_coming_boarding');
    case 'AT_OFFICE_BOARDING_POINT':
      return t('tracking_progress_at_office_boarding');
    case 'LEFT_OFFICE_BOARDING_POINT':
      return t('tracking_progress_left_office_boarding');
    case 'COMING_TO_OFFICE_BOARDING_POINT':
      return t('tracking_progress_coming_office_boarding');
    case 'AT_OFFICE':
      return t('tracking_progress_at_office');
    default:
      return t('tracking_waiting_assignment');
  }
};

const distanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const EmployeeTrackingPage = () => {
  const { t } = useLanguage();
  const { driverLocations } = useSocket();
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchTracking = async () => {
    try {
      setLoading(true);
      const response = await transportAPI.getMyTracking();
      setTracking(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.error || t('tracking_load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
    const interval = setInterval(fetchTracking, 30000);
    return () => clearInterval(interval);
  }, []);

  const cabSocketLocation = tracking?.cab?.id ? driverLocations[tracking.cab.id] : null;
  const currentCab = useMemo(() => {
    if (!tracking?.cab) return null;
    if (!cabSocketLocation) return tracking.cab;
    return {
      ...tracking.cab,
      current_latitude: cabSocketLocation.latitude,
      current_longitude: cabSocketLocation.longitude,
      last_location_update: cabSocketLocation.timestamp
    };
  }, [tracking?.cab, cabSocketLocation]);

  const routeStopsWithCoords = useMemo(
    () => (tracking?.route?.stops || []).filter((stop) => stop.latitude != null && stop.longitude != null),
    [tracking?.route?.stops]
  );

  const routePathPoints = useMemo(
    () => {
      const office = tracking?.officePoint;
      return (tracking?.routePath || [])
        .filter((point) => {
          if (point.latitude == null || point.longitude == null) return false;
          if (!office?.latitude || !office?.longitude) return true;
          return distanceKm(point.latitude, point.longitude, office.latitude, office.longitude) <= 250;
        })
        .map((point) => [point.latitude, point.longitude]);
    },
    [tracking?.routePath, tracking?.officePoint]
  );

  const pathPoints = useMemo(
    () => (tracking?.history || [])
      .filter((point) => point.latitude != null && point.longitude != null)
      .map((point) => [point.latitude, point.longitude]),
    [tracking?.history]
  );

  const mapBounds = useMemo(() => {
    const points = [];
    if (currentCab?.current_latitude != null && currentCab?.current_longitude != null) {
      points.push([currentCab.current_latitude, currentCab.current_longitude]);
    }
    if (tracking?.boardingPoint?.latitude != null && tracking?.boardingPoint?.longitude != null) {
      points.push([tracking.boardingPoint.latitude, tracking.boardingPoint.longitude]);
    }
    if (tracking?.officePoint?.latitude != null && tracking?.officePoint?.longitude != null) {
      points.push([tracking.officePoint.latitude, tracking.officePoint.longitude]);
    }
    if (tracking?.destinationPoint?.latitude != null && tracking?.destinationPoint?.longitude != null) {
      points.push([tracking.destinationPoint.latitude, tracking.destinationPoint.longitude]);
    }
    routePathPoints.forEach((point) => points.push(point));
    routeStopsWithCoords.forEach((stop) => points.push([stop.latitude, stop.longitude]));
    pathPoints.forEach((point) => points.push(point));
    return points;
  }, [currentCab, pathPoints, routePathPoints, routeStopsWithCoords, tracking?.boardingPoint, tracking?.officePoint, tracking?.destinationPoint]);

  const nextStop = useMemo(() => {
    const path = tracking?.routePath || [];
    if (!path.length) return null;
    if (tracking?.tripDirection === 'BOARDING_TO_OFFICE') {
      return path.find((point) => point.kind === 'ROUTE_STOP' || point.kind === 'OFFICE') || null;
    }
    return path.find((point) => point.kind === 'ROUTE_STOP' || point.kind === 'DESTINATION') || null;
  }, [tracking?.routePath, tracking?.tripDirection]);

  const fallbackCenter = mapBounds[0] || [13.11, 77.99];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!tracking?.trip) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('employee_track_cab_title')}</h1>
          <p className="text-gray-500">{t('employee_track_cab_subtitle')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <Route className="mx-auto text-gray-300 mb-4" size={48} />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('employee_no_trip_title')}</h2>
          <p className="text-gray-500 mb-4">{t('employee_no_trip_desc')}</p>
          <Link to="/employee" className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
            {t('employee_back_dashboard')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('employee_track_cab_title')}</h1>
          <p className="text-gray-500">{t('employee_track_cab_subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <Link to="/employee" className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-700">
            {t('common_back')}
          </Link>
          <button onClick={fetchTracking} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
            <RefreshCw size={18} />
            {t('common_refresh')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="h-[620px]">
            <MapContainer center={fallbackCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapViewport bounds={mapBounds} center={fallbackCenter} />

              {pathPoints.length > 1 && (
                <Polyline positions={pathPoints} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.7 }} />
              )}

              {routePathPoints.length > 1 && (
                <Polyline positions={routePathPoints} pathOptions={{ color: '#ef4444', weight: 5, opacity: 0.85 }} />
              )}

              {tracking?.officePoint?.latitude != null && tracking?.officePoint?.longitude != null && (
                <Marker position={[tracking.officePoint.latitude, tracking.officePoint.longitude]} icon={officeIcon}>
                  <Popup>
                    <div className="min-w-[180px]">
                      <p className="font-semibold text-gray-800">{tracking.officePoint.name}</p>
                      <p className="text-sm text-gray-600">{t('tracking_office')}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {tracking?.boardingPoint?.latitude != null && tracking?.boardingPoint?.longitude != null && (
                <Marker position={[tracking.boardingPoint.latitude, tracking.boardingPoint.longitude]} icon={boardingPointIcon}>
                  <Popup>
                    <div className="min-w-[180px]">
                      <p className="font-semibold text-gray-800">{tracking.boardingPoint.name}</p>
                      <p className="text-sm text-gray-600">{t('tracking_boarding_point')}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {tracking?.destinationPoint?.latitude != null &&
                tracking?.destinationPoint?.longitude != null &&
                !(tracking?.tripDirection === 'BOARDING_TO_OFFICE'
                  && tracking?.officePoint?.latitude === tracking?.destinationPoint?.latitude
                  && tracking?.officePoint?.longitude === tracking?.destinationPoint?.longitude) && (
                  <Marker position={[tracking.destinationPoint.latitude, tracking.destinationPoint.longitude]} icon={stopIcon}>
                    <Popup>
                      <div className="min-w-[180px]">
                        <p className="font-semibold text-gray-800">{tracking.destinationPoint.name}</p>
                        <p className="text-sm text-gray-600">{t('tracking_destination')}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}

              {routeStopsWithCoords.map((stop) => (
                <Marker key={stop.id} position={[stop.latitude, stop.longitude]} icon={stopIcon}>
                  <Popup>
                    <div className="min-w-[160px]">
                      <p className="font-semibold text-gray-800">{stop.stop_name}</p>
                      <p className="text-sm text-gray-600">{t('tracking_stop_sequence')} {stop.stop_sequence}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {currentCab?.current_latitude != null && currentCab?.current_longitude != null && (
                <Marker position={[currentCab.current_latitude, currentCab.current_longitude]} icon={createCabIcon()}>
                  <Popup>
                    <div className="min-w-[180px]">
                      <p className="font-semibold text-gray-800">{currentCab.cab_number}</p>
                      <p className="text-sm text-gray-600">{currentCab.driver_name || t('tracking_driver_assigned')}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('tracking_last_location_update')}: {formatTimestamp(currentCab.last_location_update)}</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">{t('tracking_trip_details')}</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <p className="flex items-center gap-2"><Clock size={14} /> {t('tracking_pickup')}: {tracking.trip.pickup_time ? formatTimestamp(tracking.trip.pickup_time) : t('requests_not_set')}</p>
              <p className="flex items-center gap-2"><MapPin size={14} /> {tracking.trip.pickup_location}</p>
              <p className="flex items-center gap-2"><Navigation size={14} /> {tracking.trip.drop_location}</p>
              {tracking.route?.name && <p className="flex items-center gap-2"><Route size={14} /> {tracking.route.name}</p>}
              {tracking.boardingPoint?.name && <p className="flex items-center gap-2"><MapPin size={14} /> {t('tracking_boarding_point')}: {tracking.boardingPoint.name}</p>}
              {tracking.officePoint?.name && <p className="flex items-center gap-2"><MapPin size={14} /> {t('tracking_office')}: {tracking.officePoint.name}</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">{t('tracking_cab_status')}</h2>
            {currentCab ? (
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Car className="text-primary-600" size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{currentCab.cab_number}</p>
                    <p>{currentCab.status}</p>
                  </div>
                </div>
                <p>{currentCab.driver_name || tracking.trip.driver_name || t('tracking_driver_assigned')}</p>
                {(currentCab.driver_phone || tracking.trip.driver_phone) && (
                  <a href={`tel:${currentCab.driver_phone || tracking.trip.driver_phone}`} className="inline-flex items-center gap-2 text-primary-600 hover:underline">
                    <Phone size={14} />
                    {currentCab.driver_phone || tracking.trip.driver_phone}
                  </a>
                )}
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-blue-700">
                    <p className="font-medium">{getProgressLabel(tracking.routeProgress, t)}</p>
                    {nextStop?.name && (
                    <p className="text-xs mt-1">{t('tracking_next_stop')}: {nextStop.name}</p>
                  )}
                  {tracking.eta?.toNextStopMinutes != null && (
                    <p className="text-xs mt-1">ETA to next stop: {tracking.eta.toNextStopMinutes} min</p>
                  )}
                  {tracking.eta?.finalEtaMinutes != null && (
                    <p className="text-xs">Trip ETA: {tracking.eta.finalEtaMinutes} min</p>
                  )}
                  {tracking.eta?.routeCompletionPct != null && (
                    <p className="text-xs">Route completion: {tracking.eta.routeCompletionPct}%</p>
                  )}
                  {tracking.distances?.toBoardingKm != null && (
                    <p className="text-xs mt-1">{t('tracking_distance_to_boarding')}: {tracking.distances.toBoardingKm} km</p>
                  )}
                  {tracking.distances?.toOfficeKm != null && (
                    <p className="text-xs">{t('tracking_distance_to_office')}: {tracking.distances.toOfficeKm} km</p>
                  )}
                </div>
                <p className="text-xs text-gray-500">{t('tracking_last_location_update')}: {formatTimestamp(currentCab.last_location_update)}</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <p>{t('tracking_cab_not_assigned')}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">{t('tracking_route_stops')}</h2>
            {tracking.route?.stops?.length > 0 ? (
              <div className="space-y-2">
                {tracking.route.stops.map((stop) => (
                  <div key={stop.id} className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                      {stop.stop_sequence}
                    </span>
                    <div>
                      <p className="font-medium text-gray-800">{stop.stop_name}</p>
                      {stop.eta_offset_minutes ? <p className="text-xs text-gray-500">+{stop.eta_offset_minutes} {t('tracking_eta_from_start')}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t('tracking_route_not_configured')}</p>
            )}
            {tracking.remainingPickupPoints?.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="text-sm font-medium text-gray-800 mb-2">Remaining points</p>
                <div className="space-y-1">
                  {tracking.remainingPickupPoints.slice(0, 5).map((point, index) => (
                    <p key={`${point.name}-${index}`} className="text-xs text-gray-500">
                      {index + 1}. {point.name || point.kind}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeTrackingPage;

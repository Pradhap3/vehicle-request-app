import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { cabAPI, routeAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import { 
  RefreshCw, 
  Car, 
  MapPin, 
  Clock, 
  User,
  Filter,
  Navigation
} from 'lucide-react';
import toast from 'react-hot-toast';
import { APP_NAME } from '../constants/app';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom car icon
const createCarIcon = (status) => {
  const color = status === 'AVAILABLE' ? '#10b981' : 
                status === 'ON_TRIP' ? '#3b82f6' : '#6b7280';
  
  return L.divIcon({
    className: 'custom-car-marker',
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background: ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
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
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

const officeIcon = L.divIcon({
  className: 'admin-office-marker',
  html: `
    <div style="
      width: 20px;
      height: 20px;
      background: #ef4444;
      border-radius: 4px;
      border: 3px solid white;
      box-shadow: 0 2px 10px rgba(239, 68, 68, 0.35);
    "></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const stopIcon = L.divIcon({
  className: 'admin-stop-marker',
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

// Component to update map view
const MapUpdater = ({ center, bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (Array.isArray(bounds) && bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40] });
      return;
    }
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [bounds, center, map]);
  return null;
};

const LiveTrackingPage = () => {
  const { t } = useLanguage();
  const [cabs, setCabs] = useState([]);
  const [selectedCab, setSelectedCab] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [mapCenter, setMapCenter] = useState([12.9716, 77.5946]); // Bangalore default
  const { driverLocations, connected } = useSocket();
  const mapRef = useRef(null);
  const officePoint = useMemo(() => ({
    name: import.meta.env.VITE_OFFICE_NAME || APP_NAME,
    latitude: Number(import.meta.env.VITE_OFFICE_LATITUDE || 13.11),
    longitude: Number(import.meta.env.VITE_OFFICE_LONGITUDE || 77.99)
  }), []);

  const fetchCabs = async () => {
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const response = await cabAPI.getAll(params);
      setCabs(response.data?.data || response.data?.cabs || []);
    } catch (error) {
      console.error('Error fetching cabs:', error);
      toast.error('Failed to load cabs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCabs();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchCabs, 30000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  // Update cab locations from socket
  useEffect(() => {
    if (Object.keys(driverLocations).length > 0) {
      setCabs(prevCabs => 
        prevCabs.map(cab => {
          const socketLocation = driverLocations[cab.id];
          if (socketLocation) {
            return {
              ...cab,
              current_latitude: socketLocation.latitude,
              current_longitude: socketLocation.longitude,
              last_location_update: socketLocation.timestamp
            };
          }
          return cab;
        })
      );
    }
  }, [driverLocations]);

  const handleCabSelect = (cab) => {
    setSelectedCab(cab);
    if (cab.current_latitude && cab.current_longitude) {
      setMapCenter([cab.current_latitude, cab.current_longitude]);
    }
  };

  useEffect(() => {
    const loadRouteDetails = async () => {
      if (!selectedCab?.route_id) {
        setSelectedRoute(null);
        return;
      }
      try {
        const response = await routeAPI.getById(selectedCab.route_id);
        setSelectedRoute(response.data?.data || null);
      } catch (error) {
        console.error('Error loading selected route:', error);
        setSelectedRoute(null);
      }
    };

    loadRouteDetails();
  }, [selectedCab?.route_id]);

  const getCabsWithLocation = () => {
    return cabs.filter(cab => cab.current_latitude && cab.current_longitude);
  };

  const routeStops = useMemo(
    () => (selectedRoute?.stops || []).filter((stop) => stop.latitude != null && stop.longitude != null),
    [selectedRoute?.stops]
  );

  const routePolyline = useMemo(() => {
    if (Array.isArray(selectedRoute?.route_geometry?.points) && selectedRoute.route_geometry.points.length > 1) {
      return selectedRoute.route_geometry.points;
    }
    const points = [];
    if (selectedRoute?.start_latitude != null && selectedRoute?.start_longitude != null) {
      points.push([selectedRoute.start_latitude, selectedRoute.start_longitude]);
    } else if (officePoint.latitude != null && officePoint.longitude != null) {
      points.push([officePoint.latitude, officePoint.longitude]);
    }
    routeStops.forEach((stop) => points.push([stop.latitude, stop.longitude]));
    if (selectedRoute?.end_latitude != null && selectedRoute?.end_longitude != null) {
      points.push([selectedRoute.end_latitude, selectedRoute.end_longitude]);
    }
    return points;
  }, [officePoint.latitude, officePoint.longitude, routeStops, selectedRoute?.end_latitude, selectedRoute?.end_longitude, selectedRoute?.route_geometry?.points, selectedRoute?.start_latitude, selectedRoute?.start_longitude]);

  const selectedCabHistory = useMemo(() => {
    if (!selectedCab?.id) return [];
    return [];
  }, [selectedCab?.id]);

  const mapBounds = useMemo(() => {
    const points = [];
    getCabsWithLocation().forEach((cab) => points.push([cab.current_latitude, cab.current_longitude]));
    if (officePoint.latitude != null && officePoint.longitude != null) {
      points.push([officePoint.latitude, officePoint.longitude]);
    }
    routeStops.forEach((stop) => points.push([stop.latitude, stop.longitude]));
    routePolyline.forEach((point) => points.push(point));
    return points;
  }, [cabs, officePoint.latitude, officePoint.longitude, routePolyline, routeStops]);

  const statusColors = {
    AVAILABLE: 'bg-green-100 text-green-800 border-green-200',
    ON_TRIP: 'bg-blue-100 text-blue-800 border-blue-200',
    MAINTENANCE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    OFFLINE: 'bg-gray-100 text-gray-600 border-gray-200'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('nav_tracking')}</h1>
          <p className="text-gray-500 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {connected ? 'Real-time updates active' : 'Connecting...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">{t('tracking_all_cabs')}</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON_TRIP">On Trip</option>
            <option value="OFFLINE">Offline</option>
          </select>
          <button
            onClick={fetchCabs}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw size={18} />
            {t('dash_refresh')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Map */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="h-[600px]">
            <MapContainer
              center={mapCenter}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
              ref={mapRef}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapUpdater center={mapCenter} bounds={mapBounds} />

              {routePolyline.length > 1 && (
                <Polyline positions={routePolyline} pathOptions={{ color: '#ef4444', weight: 5, opacity: 0.8 }} />
              )}

              {officePoint.latitude != null && officePoint.longitude != null && (
                <Marker position={[officePoint.latitude, officePoint.longitude]} icon={officeIcon}>
                  <Popup>
                    <div className="p-2 min-w-[180px]">
                      <p className="font-semibold text-gray-800">{officePoint.name}</p>
                      <p className="text-sm text-gray-600">Office</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {routeStops.map((stop) => (
                <Marker
                  key={`route-stop-${stop.id}`}
                  position={[stop.latitude, stop.longitude]}
                  icon={stopIcon}
                >
                  <Popup>
                    <div className="p-2 min-w-[180px]">
                      <p className="font-semibold text-gray-800">{stop.stop_name}</p>
                      <p className="text-sm text-gray-600">Stop sequence: {stop.stop_sequence}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
              
              {getCabsWithLocation().map((cab) => (
                <Marker
                  key={cab.id}
                  position={[cab.current_latitude, cab.current_longitude]}
                  icon={createCarIcon(cab.status)}
                  eventHandlers={{
                    click: () => handleCabSelect(cab)
                  }}
                >
                  <Popup>
                    <div className="p-2 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-2">
                        <Car className="text-primary-500" size={18} />
                        <span className="font-semibold">{cab.cab_number}</span>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p className="flex items-center gap-2">
                          <User size={14} />
                          {cab.driver_name || 'No driver'}
                        </p>
                        <p className="flex items-center gap-2">
                          <Navigation size={14} />
                          {cab.capacity} seats
                        </p>
                        <p>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[cab.status]?.split(' ').slice(0, 2).join(' ')}`}>
                            {cab.status}
                          </span>
                        </p>
                        {cab.last_location_update && (
                          <p className="flex items-center gap-2 text-xs text-gray-400">
                            <Clock size={12} />
                            Updated: {new Date(cab.last_location_update).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Cab List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 h-[600px] overflow-y-auto">
          <h3 className="font-semibold text-gray-800 mb-4">
            {t('nav_cabs')} ({getCabsWithLocation().length} {t('tracking_tracked')})
          </h3>
          
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : cabs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Car size={32} className="mx-auto mb-2 text-gray-300" />
              <p>No cabs found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cabs.map((cab) => (
                <div
                  key={cab.id}
                  onClick={() => handleCabSelect(cab)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedCab?.id === cab.id 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800">{cab.cab_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[cab.status]}`}>
                      {cab.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p className="flex items-center gap-1">
                      <User size={12} />
                      {cab.driver_name || 'No driver'}
                    </p>
                    {cab.current_latitude && cab.current_longitude ? (
                      <p className="flex items-center gap-1 text-green-600 mt-1">
                        <MapPin size={12} />
                        Location tracked
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-gray-400 mt-1">
                        <MapPin size={12} />
                        No location data
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedCab && (
            <div className="mt-6 border-t border-gray-100 pt-4 space-y-3">
              <h4 className="font-semibold text-gray-800">Selected Cab Details</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p><span className="font-medium text-gray-800">Cab:</span> {selectedCab.cab_number}</p>
                <p><span className="font-medium text-gray-800">Driver:</span> {selectedCab.driver_name || 'Not assigned'}</p>
                <p><span className="font-medium text-gray-800">Status:</span> {selectedCab.status}</p>
                <p><span className="font-medium text-gray-800">Seats:</span> {selectedCab.capacity}</p>
                {selectedRoute?.name ? <p><span className="font-medium text-gray-800">Route:</span> {selectedRoute.name}</p> : null}
                {selectedRoute?.stops?.length ? <p><span className="font-medium text-gray-800">Stops:</span> {selectedRoute.stops.length}</p> : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-medium text-gray-800 mb-3">Legend</h3>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <Car size={14} className="text-white" />
            </div>
            <span className="text-sm text-gray-600">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <Car size={14} className="text-white" />
            </div>
            <span className="text-sm text-gray-600">On Trip</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center">
              <Car size={14} className="text-white" />
            </div>
            <span className="text-sm text-gray-600">Offline</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTrackingPage;

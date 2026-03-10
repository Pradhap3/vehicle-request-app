import React, { useState, useEffect } from 'react';
import { routeAPI, cabAPI, userAPI } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X,
  Route,
  MapPin,
  Clock,
  Car,
  Users,
  Zap,
  AlertCircle,
  RefreshCw,
  Navigation
} from 'lucide-react';
import toast from 'react-hot-toast';

const createEmptyStop = (sequence = 1) => ({
  stop_name: '',
  stop_sequence: sequence,
  eta_offset_minutes: ''
});

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className={`relative bg-white rounded-xl shadow-xl ${sizeClasses[size]} w-full max-h-[90vh] overflow-y-auto`}>
          <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
            <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X size={20} />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

const RouteForm = ({ route, onSubmit, onCancel, loading }) => {
  const [formData, setFormData] = useState({
    name: route?.name || '',
    start_point: route?.start_point || '',
    end_point: route?.end_point || '',
    distance_km: route?.distance_km || '',
    estimated_time_minutes: route?.estimated_time_minutes || '',
    is_active: route?.is_active !== false,
    stops: Array.isArray(route?.stops) && route.stops.length > 0
      ? route.stops.map((stop, index) => ({
          stop_name: stop.stop_name || '',
          stop_sequence: stop.stop_sequence || index + 1,
          eta_offset_minutes: stop.eta_offset_minutes ?? ''
        }))
      : [createEmptyStop()]
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setFormData({
      name: route?.name || '',
      start_point: route?.start_point || '',
      end_point: route?.end_point || '',
      distance_km: route?.distance_km || '',
      estimated_time_minutes: route?.estimated_time_minutes || '',
      is_active: route?.is_active !== false,
      stops: Array.isArray(route?.stops) && route.stops.length > 0
        ? route.stops.map((stop, index) => ({
            stop_name: stop.stop_name || '',
            stop_sequence: stop.stop_sequence || index + 1,
            eta_offset_minutes: stop.eta_offset_minutes ?? ''
          }))
        : [createEmptyStop()]
    });
  }, [route]);

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Route name is required';
    if (!formData.start_point.trim()) newErrors.start_point = 'Start point is required';
    if (!formData.end_point.trim()) newErrors.end_point = 'End point is required';
    const validStops = formData.stops.filter((stop) => stop.stop_name.trim());
    if (validStops.length === 0) {
      newErrors.stops = 'At least one route stop is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const updateStop = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, stopIndex) => (
        stopIndex === index ? { ...stop, [field]: value } : stop
      ))
    }));
  };

  const addStop = () => {
    setFormData((prev) => ({
      ...prev,
      stops: [...prev.stops, createEmptyStop(prev.stops.length + 1)]
    }));
  };

  const removeStop = (index) => {
    setFormData((prev) => {
      const nextStops = prev.stops
        .filter((_, stopIndex) => stopIndex !== index)
        .map((stop, stopIndex) => ({
          ...stop,
          stop_sequence: stopIndex + 1
        }));

      return {
        ...prev,
        stops: nextStops.length > 0 ? nextStops : [createEmptyStop()]
      };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      const cleanedStops = formData.stops
        .filter((stop) => stop.stop_name.trim())
        .map((stop, index) => ({
          stop_name: stop.stop_name.trim(),
          stop_sequence: index + 1,
          eta_offset_minutes: stop.eta_offset_minutes === '' ? null : parseInt(stop.eta_offset_minutes, 10)
        }));

      onSubmit({
        ...formData,
        distance_km: formData.distance_km ? parseFloat(formData.distance_km) : null,
        estimated_time_minutes: formData.estimated_time_minutes ? parseInt(formData.estimated_time_minutes, 10) : null,
        stops: cleanedStops
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Route Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
            errors.name ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="e.g., Route A - Electronic City"
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Point <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={formData.start_point}
              onChange={(e) => setFormData({ ...formData, start_point: e.target.value })}
              className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
                errors.start_point ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Office Location"
            />
          </div>
          {errors.start_point && <p className="text-red-500 text-xs mt-1">{errors.start_point}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Point <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={formData.end_point}
              onChange={(e) => setFormData({ ...formData, end_point: e.target.value })}
              className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
                errors.end_point ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Destination Area"
            />
          </div>
          {errors.end_point && <p className="text-red-500 text-xs mt-1">{errors.end_point}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Distance (km)</label>
          <input
            type="number"
            step="0.1"
            value={formData.distance_km}
            onChange={(e) => setFormData({ ...formData, distance_km: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder="15.5"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Time (minutes)</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="number"
              value={formData.estimated_time_minutes}
              onChange={(e) => setFormData({ ...formData, estimated_time_minutes: e.target.value })}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="45"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Active Route</span>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">Route Stops</label>
            <p className="text-xs text-gray-500">Define the daily pickup sequence for recurring transport.</p>
          </div>
          <button
            type="button"
            onClick={addStop}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100"
          >
            <Plus size={16} />
            Add Stop
          </button>
        </div>
        <div className="space-y-3">
          {formData.stops.map((stop, index) => (
            <div key={`${route?.id || 'new'}-stop-${index}`} className="grid grid-cols-12 gap-3 items-end rounded-lg border border-gray-200 p-3">
              <div className="col-span-6">
                <label className="block text-xs font-medium text-gray-600 mb-1">Stop Name</label>
                <input
                  type="text"
                  value={stop.stop_name}
                  onChange={(e) => updateStop(index, 'stop_name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Kolar Bus Stand"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Sequence</label>
                <input
                  type="number"
                  value={index + 1}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">ETA Offset</label>
                <input
                  type="number"
                  min="0"
                  value={stop.eta_offset_minutes}
                  onChange={(e) => updateStop(index, 'eta_offset_minutes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="10"
                />
              </div>
              <div className="col-span-1">
                <button
                  type="button"
                  onClick={() => removeStop(index)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  title="Remove stop"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {errors.stops && <p className="text-red-500 text-xs mt-1">{errors.stops}</p>}
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 py-2.5 px-4 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Saving...' : route ? 'Update Route' : 'Create Route'}
        </button>
      </div>
    </form>
  );
};

const AutoAllocateModal = ({ isOpen, onClose, route, onAllocate }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleAllocate = async () => {
    try {
      setLoading(true);
      const response = await routeAPI.autoAllocate(route.id, { date });
      setResult(response.data);
      toast.success('AI Allocation completed!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Allocation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckTraffic = async () => {
    try {
      setLoading(true);
      const response = await routeAPI.checkTraffic(route.id);
      toast.success(`Traffic status: ${response.data.trafficStatus || 'Normal'}`);
      if (response.data.delayMinutes) {
        toast(`Expected delay: ${response.data.delayMinutes} minutes`, { icon: '⚠️' });
      }
    } catch (error) {
      toast.error('Failed to check traffic');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Smart Allocation" size="lg">
      <div className="space-y-6">
        {/* Route Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-2">{route?.name}</h3>
          <p className="text-sm text-gray-600">
            {route?.start_point} → {route?.end_point}
          </p>
          {route?.estimated_time_minutes && (
            <p className="text-sm text-gray-500 mt-1">
              Est. time: {route.estimated_time_minutes} minutes
            </p>
          )}
        </div>

        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Allocation Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* AI Features */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleAllocate}
            disabled={loading}
            className="flex flex-col items-center gap-2 p-4 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50"
          >
            <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center">
              <Zap className="text-white" size={24} />
            </div>
            <span className="font-medium text-primary-700">AI Auto-Allocate</span>
            <span className="text-xs text-gray-500 text-center">
              Optimize cab assignment based on capacity
            </span>
          </button>

          <button
            onClick={handleCheckTraffic}
            disabled={loading}
            className="flex flex-col items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
          >
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
              <Navigation className="text-white" size={24} />
            </div>
            <span className="font-medium text-orange-700">Check Traffic</span>
            <span className="text-xs text-gray-500 text-center">
              Get real-time traffic & delay info
            </span>
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2">
              <Zap size={18} /> Allocation Result
            </h4>
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">
                Cabs allocated: <strong>{result.allocations?.length || 0}</strong>
              </p>
              <p className="text-gray-700">
                Total passengers: <strong>{result.totalPassengers || 0}</strong>
              </p>
              {result.allocations?.map((alloc, idx) => (
                <div key={idx} className="bg-white rounded p-2 mt-2">
                  <p className="font-medium">{alloc.cabNumber}</p>
                  <p className="text-gray-600">
                    {alloc.assignedPassengers} passengers assigned
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </Modal>
  );
};

const RoutesPage = () => {
  const { t } = useLanguage();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [routeDetailsLoading, setRouteDetailsLoading] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState(null);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const response = await routeAPI.getAll({ search: searchTerm });
      setRoutes(response.data.data || response.data.routes || []);
    } catch (error) {
      console.error('Error fetching routes:', error);
      toast.error('Failed to load routes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, [searchTerm]);

  const handleCreateRoute = async (data) => {
    try {
      setActionLoading(true);
      await routeAPI.create(data);
      toast.success('Route created successfully');
      setIsModalOpen(false);
      fetchRoutes();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create route');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateRoute = async (data) => {
    try {
      setActionLoading(true);
      await routeAPI.update(selectedRoute.id, data);
      toast.success('Route updated successfully');
      setIsModalOpen(false);
      setSelectedRoute(null);
      fetchRoutes();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update route');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRoute = async () => {
    try {
      setActionLoading(true);
      await routeAPI.delete(selectedRoute.id);
      toast.success('Route deleted successfully');
      setIsDeleteModalOpen(false);
      setSelectedRoute(null);
      fetchRoutes();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete route');
    } finally {
      setActionLoading(false);
    }
  };

  const openCreateModal = () => {
    setSelectedRoute(null);
    setIsModalOpen(true);
  };

  const openEditModal = async (routeId) => {
    try {
      setEditingRouteId(routeId);
      setRouteDetailsLoading(true);
      const response = await routeAPI.getById(routeId);
      setSelectedRoute(response.data?.data || null);
      setIsModalOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load route details');
    } finally {
      setRouteDetailsLoading(false);
      setEditingRouteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('nav_routes')} ({routes.length})</h1>
          <p className="text-gray-500">{t('routes_manage_desc')}</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          <Plus size={20} />
          {t('routes_create')}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('search_routes')}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Routes List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : routes.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Route size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">No routes found</h3>
          <p className="text-gray-500 mb-4">{t('routes_empty_desc')}</p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={18} />
            {t('routes_create')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {routes.map((route) => (
            <div 
              key={route.id} 
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 card-hover"
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Route className="text-primary-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{route.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                      <MapPin size={14} className="text-green-500" />
                      <span>{route.start_point}</span>
                      <span>→</span>
                      <MapPin size={14} className="text-red-500" />
                      <span>{route.end_point}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      {route.distance_km && (
                        <span>{route.distance_km} km</span>
                      )}
                      {route.estimated_time_minutes && (
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {route.estimated_time_minutes} min
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    route.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {route.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  
                  <button
                    onClick={() => { setSelectedRoute(route); setIsAllocateModalOpen(true); }}
                    className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg"
                    title="AI Auto-Allocate"
                  >
                    <Zap size={18} />
                  </button>
                  <button
                    onClick={() => openEditModal(route.id)}
                    className="p-2 text-gray-500 hover:text-primary-500 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    title="Edit route"
                    disabled={routeDetailsLoading}
                  >
                    {routeDetailsLoading && editingRouteId === route.id ? <RefreshCw size={18} className="animate-spin" /> : <Edit2 size={18} />}
                  </button>
                  <button
                    onClick={() => { setSelectedRoute(route); setIsDeleteModalOpen(true); }}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    title="Delete route"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedRoute(null); }}
        title={selectedRoute ? t('routes_edit') : t('routes_create_new')}
      >
        {routeDetailsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <RouteForm
            route={selectedRoute}
            onSubmit={selectedRoute ? handleUpdateRoute : handleCreateRoute}
            onCancel={() => { setIsModalOpen(false); setSelectedRoute(null); }}
            loading={actionLoading}
          />
        )}
      </Modal>

      {/* AI Allocate Modal */}
      {selectedRoute && (
        <AutoAllocateModal
          isOpen={isAllocateModalOpen}
          onClose={() => { setIsAllocateModalOpen(false); setSelectedRoute(null); }}
          route={selectedRoute}
        />
      )}

      {/* Delete Confirmation */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsDeleteModalOpen(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="text-red-600" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Delete Route</h3>
                  <p className="text-gray-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete route <strong>{selectedRoute?.name}</strong>?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setIsDeleteModalOpen(false); setSelectedRoute(null); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRoute}
                  className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutesPage;

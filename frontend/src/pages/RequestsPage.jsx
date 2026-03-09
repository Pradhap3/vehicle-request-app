import React, { useState, useEffect } from 'react';
import { requestAPI, routeAPI, cabAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X,
  ClipboardList,
  MapPin,
  Clock,
  Car,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
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

const RequestForm = ({ request, routes, onSubmit, onCancel, loading }) => {
  const [formData, setFormData] = useState({
    route_id: request?.route_id || '',
    pickup_time: request?.pickup_time || '',
    pickup_location: request?.pickup_location || '',
    drop_location: request?.drop_location || '',
    notes: request?.notes || ''
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!formData.route_id) newErrors.route_id = 'Route is required';
    if (!formData.pickup_time) newErrors.pickup_time = 'Pickup time is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Route <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.route_id}
          onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 bg-white ${
            errors.route_id ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          <option value="">Select a route</option>
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name} ({route.start_point} → {route.end_point})
            </option>
          ))}
        </select>
        {errors.route_id && <p className="text-red-500 text-xs mt-1">{errors.route_id}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pickup Time <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          value={formData.pickup_time}
          onChange={(e) => setFormData({ ...formData, pickup_time: e.target.value })}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
            errors.pickup_time ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.pickup_time && <p className="text-red-500 text-xs mt-1">{errors.pickup_time}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Location</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={formData.pickup_location}
            onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder="Your pickup point"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Drop Location</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={formData.drop_location}
            onChange={(e) => setFormData({ ...formData, drop_location: e.target.value })}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder="Your drop point"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          rows={3}
          placeholder="Any special requirements..."
        />
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
          {loading ? 'Saving...' : request ? 'Update Request' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
};

const AssignCabModal = ({ isOpen, onClose, request, cabs, onAssign, loading }) => {
  const [selectedCabId, setSelectedCabId] = useState('');

  const handleAssign = () => {
    if (selectedCabId) {
      onAssign(selectedCabId);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Cab">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600">
            <strong>Employee:</strong> {request?.employee_name}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Route:</strong> {request?.route_name}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Available Cab</label>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {cabs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No available cabs</p>
            ) : (
              cabs.map((cab) => (
                <label 
                  key={cab.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedCabId === cab.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="cab"
                    value={cab.id}
                    checked={selectedCabId === cab.id}
                    onChange={(e) => setSelectedCabId(e.target.value)}
                    className="text-primary-500"
                  />
                  <Car size={20} className="text-gray-400" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{cab.cab_number}</p>
                    <p className="text-sm text-gray-500">
                      {cab.capacity} seats • {cab.driver_name || 'No driver'}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedCabId || loading}
            className="flex-1 py-2.5 px-4 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {loading ? 'Assigning...' : 'Assign Cab'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const RequestsPage = () => {
  const { t } = useLanguage();
  const { isAdmin, isEmployee, user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [availableCabs, setAvailableCabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = { search: searchTerm };
      if (statusFilter) params.status = statusFilter;
      if (dateFilter) params.date = dateFilter;
      if (isEmployee) params.employee_id = user?.id;

      const [requestsRes, routesRes] = await Promise.all([
        requestAPI.getAll(params),
        routeAPI.getAll({ active: true })
      ]);
      
      setRequests(requestsRes.data.data || requestsRes.data.requests || []);
      setRoutes(routesRes.data.data || routesRes.data.routes || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableCabs = async () => {
    try {
      const response = await cabAPI.getAvailable();
      setAvailableCabs(response.data.data || response.data.cabs || []);
    } catch (error) {
      console.error('Error fetching cabs:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchTerm, statusFilter, dateFilter]);

  const handleCreateRequest = async (data) => {
    try {
      setActionLoading(true);
      await requestAPI.create(data);
      toast.success('Request submitted successfully');
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to submit request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignCab = async (cabId) => {
    try {
      setActionLoading(true);
      await requestAPI.assignCab(selectedRequest.id, { cab_id: cabId });
      toast.success('Cab assigned successfully');
      setIsAssignModalOpen(false);
      setSelectedRequest(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to assign cab');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    try {
      await requestAPI.cancel(requestId);
      toast.success('Request cancelled');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to cancel request');
    }
  };

  const handleBoardingAction = async (requestId, action) => {
    try {
      if (action === 'board') {
        await requestAPI.markBoarded(requestId, {
          boarding_area: 'Main Gate',
          boarded_at: new Date().toISOString()
        });
        toast.success('Marked as boarded');
      } else if (action === 'drop') {
        await requestAPI.markDropped(requestId, {
          dropping_area: 'Destination',
          dropped_at: new Date().toISOString()
        });
        toast.success('Marked as dropped');
      } else if (action === 'no-show') {
        await requestAPI.markNoShow(requestId);
        toast.success('Marked as no-show');
      }
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Action failed');
    }
  };

  const openAssignModal = (request) => {
    setSelectedRequest(request);
    fetchAvailableCabs();
    setIsAssignModalOpen(true);
  };

  const statusColors = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-blue-100 text-blue-800',
    ASSIGNED: 'bg-purple-100 text-purple-800',
    IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
    NO_SHOW: 'bg-gray-100 text-gray-800'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEmployee ? t('nav_my_requests') : t('nav_requests')} ({requests.length})
          </h1>
          <p className="text-gray-500">
            {isEmployee ? t('requests_manage_my_desc') : t('requests_manage_all_desc')}
          </p>
        </div>
        <button
          onClick={() => { setSelectedRequest(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          <Plus size={20} />
          {t('requests_new')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('search_requests')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">{t('all_status')}</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <ClipboardList size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">No requests found</h3>
          <p className="text-gray-500 mb-4">{t('requests_empty_desc')}</p>
          <button
            onClick={() => { setSelectedRequest(null); setIsModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={18} />
            {t('requests_new')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div 
              key={request.id} 
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[request.status]}`}>
                      {request.status}
                    </span>
                    {request.cab_number && (
                      <span className="flex items-center gap-1 text-sm text-gray-600">
                        <Car size={14} />
                        {request.cab_number}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 text-gray-800 font-medium mb-2">
                    <User size={16} className="text-gray-400" />
                    {request.employee_name}
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-600">{request.route_name}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    {request.pickup_time && (
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {format(new Date(request.pickup_time), 'MMM dd, yyyy HH:mm')}
                      </span>
                    )}
                    {request.pickup_location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {request.pickup_location}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Admin Actions */}
                  {isAdmin && request.status === 'PENDING' && (
                    <button
                      onClick={() => openAssignModal(request)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600"
                    >
                      <Car size={14} />
                      Assign Cab
                    </button>
                  )}

                  {/* Boarding / Drop / No-show are driver-only actions from driver dashboard */}

                  {/* Cancel button for pending requests */}
                  {request.status === 'PENDING' && (
                    <button
                      onClick={() => handleCancelRequest(request.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm hover:bg-red-200"
                    >
                      <XCircle size={14} />
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedRequest(null); }}
        title={selectedRequest ? t('requests_edit') : t('requests_new_cab')}
      >
        <RequestForm
          request={selectedRequest}
          routes={routes}
          onSubmit={handleCreateRequest}
          onCancel={() => { setIsModalOpen(false); setSelectedRequest(null); }}
          loading={actionLoading}
        />
      </Modal>

      {/* Assign Cab Modal */}
      <AssignCabModal
        isOpen={isAssignModalOpen}
        onClose={() => { setIsAssignModalOpen(false); setSelectedRequest(null); }}
        request={selectedRequest}
        cabs={availableCabs}
        onAssign={handleAssignCab}
        loading={actionLoading}
      />
    </div>
  );
};

export default RequestsPage;

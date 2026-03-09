import React, { useState, useEffect } from 'react';
import { cabAPI, userAPI } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X,
  Car,
  Users,
  MapPin,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full">
          <div className="flex items-center justify-between p-6 border-b">
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

const CabForm = ({ cab, drivers, onSubmit, onCancel, loading }) => {
  const [formData, setFormData] = useState({
    cab_number: cab?.cab_number || '',
    capacity: cab?.capacity || 4,
    driver_id: cab?.driver_id || '',
    status: cab?.status || 'AVAILABLE',
    is_active: cab?.is_active !== false
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!formData.cab_number.trim()) newErrors.cab_number = 'Cab number is required';
    if (formData.capacity < 1 || formData.capacity > 50) newErrors.capacity = 'Capacity must be between 1 and 50';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        ...formData,
        driver_id: formData.driver_id || null
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cab Number <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Car className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={formData.cab_number}
            onChange={(e) => setFormData({ ...formData, cab_number: e.target.value })}
            className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
              errors.cab_number ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="KA-01-AB-1234"
          />
        </div>
        {errors.cab_number && <p className="text-red-500 text-xs mt-1">{errors.cab_number}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Capacity <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="number"
            min="1"
            max="50"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
            className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
              errors.capacity ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        </div>
        {errors.capacity && <p className="text-red-500 text-xs mt-1">{errors.capacity}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Driver</label>
        <select
          value={formData.driver_id}
          onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">No driver assigned</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name} ({driver.employee_id})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="AVAILABLE">Available</option>
          <option value="ON_TRIP">On Trip</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="OFFLINE">Offline</option>
        </select>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Active Cab</span>
        </label>
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
          {loading ? 'Saving...' : cab ? 'Update Cab' : 'Add Cab'}
        </button>
      </div>
    </form>
  );
};

const CabsPage = () => {
  const { t } = useLanguage();
  const [cabs, setCabs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCab, setSelectedCab] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cabsRes, driversRes] = await Promise.all([
        cabAPI.getAll({ search: searchTerm, status: statusFilter }),
        userAPI.getDrivers()
      ]);
      setCabs(cabsRes.data.data || cabsRes.data.cabs || []);
      setDrivers(driversRes.data.data || driversRes.data.drivers || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load cabs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchTerm, statusFilter]);

  const handleCreateCab = async (data) => {
    try {
      setActionLoading(true);
      await cabAPI.create(data);
      toast.success('Cab added successfully');
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add cab');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateCab = async (data) => {
    try {
      setActionLoading(true);
      await cabAPI.update(selectedCab.id, data);
      toast.success('Cab updated successfully');
      setIsModalOpen(false);
      setSelectedCab(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update cab');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCab = async () => {
    try {
      setActionLoading(true);
      await cabAPI.delete(selectedCab.id);
      toast.success('Cab deleted successfully');
      setIsDeleteModalOpen(false);
      setSelectedCab(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete cab');
    } finally {
      setActionLoading(false);
    }
  };

  const statusColors = {
    AVAILABLE: 'bg-green-100 text-green-800',
    ON_TRIP: 'bg-blue-100 text-blue-800',
    MAINTENANCE: 'bg-yellow-100 text-yellow-800',
    OFFLINE: 'bg-gray-100 text-gray-800'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('nav_cabs')} ({cabs.length})</h1>
          <p className="text-gray-500">{t('cabs_manage_desc')}</p>
        </div>
        <button
          onClick={() => { setSelectedCab(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          <Plus size={20} />
          {t('cabs_add')}
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
            placeholder={t('search_cabs')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">{t('all_status')}</option>
          <option value="AVAILABLE">Available</option>
          <option value="ON_TRIP">On Trip</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="OFFLINE">Offline</option>
        </select>
      </div>

      {/* Cabs Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : cabs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Car size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">No cabs found</h3>
          <p className="text-gray-500 mb-4">{t('cabs_empty_desc')}</p>
          <button
            onClick={() => { setSelectedCab(null); setIsModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={18} />
            {t('cabs_add')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cabs.map((cab) => (
            <div 
              key={cab.id} 
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 card-hover"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                    <Car className="text-primary-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{cab.cab_number}</h3>
                    <p className="text-sm text-gray-500">{cab.capacity} seats</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[cab.status]}`}>
                  {cab.status}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users size={16} className="text-gray-400" />
                  <span>{cab.driver_name || 'No driver assigned'}</span>
                </div>
                {cab.current_latitude && cab.current_longitude && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={16} className="text-gray-400" />
                    <span>Location tracked</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                <button
                  onClick={() => { setSelectedCab(cab); setIsModalOpen(true); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-gray-600 hover:text-primary-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
                <button
                  onClick={() => { setSelectedCab(cab); setIsDeleteModalOpen(true); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-gray-600 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedCab(null); }}
        title={selectedCab ? t('cabs_edit') : t('cabs_add_new')}
      >
        <CabForm
          cab={selectedCab}
          drivers={drivers}
          onSubmit={selectedCab ? handleUpdateCab : handleCreateCab}
          onCancel={() => { setIsModalOpen(false); setSelectedCab(null); }}
          loading={actionLoading}
        />
      </Modal>

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
                  <h3 className="text-lg font-semibold text-gray-800">Delete Cab</h3>
                  <p className="text-gray-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete cab <strong>{selectedCab?.cab_number}</strong>?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setIsDeleteModalOpen(false); setSelectedCab(null); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCab}
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

export default CabsPage;

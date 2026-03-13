import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { vehicleAPI, vendorAPI } from '../services/api';
import toast from 'react-hot-toast';

const VEHICLE_TYPES = ['SEDAN', 'SUV', 'VAN', 'BUS', 'MINI_BUS', 'HATCHBACK'];
const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'];

const emptyForm = {
  vehicle_number: '',
  vehicle_type: 'SEDAN',
  make: '',
  model: '',
  year: '',
  color: '',
  capacity: 4,
  fuel_type: 'PETROL',
  insurance_expiry: '',
  fitness_expiry: '',
  permit_expiry: '',
  vendor_id: ''
};

const VehicleManagementPage = () => {
  const [vehicles, setVehicles] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, vendorsRes] = await Promise.all([
        vehicleAPI.getAll(),
        vendorAPI.getAll()
      ]);
      setVehicles(vehiclesRes?.data?.data || []);
      setVendors(vendorsRes?.data?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredVehicles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter((vehicle) => {
      const haystack = [
        vehicle.vehicle_number,
        vehicle.vehicle_type,
        vehicle.make,
        vehicle.model,
        vehicle.color,
        vehicle.vendor_name,
        vehicle.driver_name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [search, vehicles]);

  const stats = useMemo(() => ({
    total: vehicles.length,
    withDriver: vehicles.filter((vehicle) => vehicle.driver_id).length,
    vendorLinked: vehicles.filter((vehicle) => vehicle.vendor_id).length,
    highCapacity: vehicles.filter((vehicle) => Number(vehicle.capacity || 0) >= 6).length
  }), [vehicles]);

  const openCreate = () => {
    setEditingVehicle(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      vehicle_number: vehicle.vehicle_number || '',
      vehicle_type: vehicle.vehicle_type || 'SEDAN',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year ? String(vehicle.year) : '',
      color: vehicle.color || '',
      capacity: Number(vehicle.capacity || 4),
      fuel_type: vehicle.fuel_type || 'PETROL',
      insurance_expiry: vehicle.insurance_expiry ? vehicle.insurance_expiry.split('T')[0] : '',
      fitness_expiry: vehicle.fitness_expiry ? vehicle.fitness_expiry.split('T')[0] : '',
      permit_expiry: vehicle.permit_expiry ? vehicle.permit_expiry.split('T')[0] : '',
      vendor_id: vehicle.vendor_id ? String(vehicle.vendor_id) : ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      vehicle_number: form.vehicle_number.trim(),
      vehicle_type: form.vehicle_type,
      make: form.make || null,
      model: form.model || null,
      year: form.year ? Number(form.year) : null,
      color: form.color || null,
      capacity: Number(form.capacity) || 4,
      fuel_type: form.fuel_type,
      insurance_expiry: form.insurance_expiry || null,
      fitness_expiry: form.fitness_expiry || null,
      permit_expiry: form.permit_expiry || null,
      vendor_id: form.vendor_id ? Number(form.vendor_id) : null
    };

    try {
      if (editingVehicle) {
        await vehicleAPI.update(editingVehicle.id, payload);
        toast.success('Vehicle updated');
      } else {
        await vehicleAPI.create(payload);
        toast.success('Vehicle created');
      }
      setShowModal(false);
      setForm(emptyForm);
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save vehicle');
    }
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Deactivate this vehicle?')) return;
    try {
      await vehicleAPI.delete(vehicleId);
      toast.success('Vehicle deactivated');
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to deactivate vehicle');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vehicle Management</h1>
          <p className="text-sm text-gray-500">Maintain fleet inventory, vendor ownership, and compliance dates.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchData} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
            <Plus size={16} />
            Add Vehicle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Fleet</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Driver Assigned</p>
          <p className="text-2xl font-bold text-primary-600">{stats.withDriver}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Vendor Linked</p>
          <p className="text-2xl font-bold text-green-600">{stats.vendorLinked}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Capacity 6+</p>
          <p className="text-2xl font-bold text-amber-600">{stats.highCapacity}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 w-fit">
        <Search size={16} className="text-gray-400" />
        <input
          type="text"
          placeholder="Search vehicles..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="border-none bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : filteredVehicles.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">Vehicle</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Type</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Capacity</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Vendor</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Assigned Driver</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Insurance Expiry</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredVehicles.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{vehicle.vehicle_number}</p>
                    <p className="text-xs text-gray-500">
                      {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'No make/model'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{vehicle.vehicle_type || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{vehicle.capacity || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{vehicle.vendor_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{vehicle.driver_name || 'Unassigned'}</td>
                  <td className="px-4 py-3 text-gray-600">{vehicle.insurance_expiry ? new Date(vehicle.insurance_expiry).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(vehicle)} className="mr-3 text-xs font-medium text-primary-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(vehicle.id)} className="text-xs font-medium text-red-600 hover:underline">
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center text-sm text-gray-500">No vehicles match the current filter.</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Vehicle Number</label>
                  <input
                    type="text"
                    value={form.vehicle_number}
                    onChange={(event) => setForm((current) => ({ ...current, vehicle_number: event.target.value.toUpperCase() }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Vehicle Type</label>
                  <select
                    value={form.vehicle_type}
                    onChange={(event) => setForm((current) => ({ ...current, vehicle_type: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {VEHICLE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Make</label>
                  <input
                    type="text"
                    value={form.make}
                    onChange={(event) => setForm((current) => ({ ...current, make: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Year</label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Color</label>
                  <input
                    type="text"
                    value={form.color}
                    onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Fuel Type</label>
                  <select
                    value={form.fuel_type}
                    onChange={(event) => setForm((current) => ({ ...current, fuel_type: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {FUEL_TYPES.map((fuel) => (
                      <option key={fuel} value={fuel}>{fuel}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Vendor</label>
                <select
                  value={form.vendor_id}
                  onChange={(event) => setForm((current) => ({ ...current, vendor_id: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Insurance Expiry</label>
                  <input
                    type="date"
                    value={form.insurance_expiry}
                    onChange={(event) => setForm((current) => ({ ...current, insurance_expiry: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Fitness Expiry</label>
                  <input
                    type="date"
                    value={form.fitness_expiry}
                    onChange={(event) => setForm((current) => ({ ...current, fitness_expiry: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Permit Expiry</label>
                  <input
                    type="date"
                    value={form.permit_expiry}
                    onChange={(event) => setForm((current) => ({ ...current, permit_expiry: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
                  {editingVehicle ? 'Update Vehicle' : 'Create Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleManagementPage;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Star, UserPlus, X } from 'lucide-react';
import { driverAPI, userAPI, vehicleAPI, vendorAPI } from '../services/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  ONLINE: 'bg-green-100 text-green-700',
  OFFLINE: 'bg-gray-100 text-gray-700',
  ON_BREAK: 'bg-amber-100 text-amber-700',
  ON_TRIP: 'bg-blue-100 text-blue-700'
};

const emptyForm = {
  user_id: '',
  vehicle_id: '',
  vendor_id: '',
  license_number: '',
  license_expiry: '',
  badge_number: ''
};

const DriverManagementPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [driversRes, usersRes, vehiclesRes, vendorsRes] = await Promise.all([
        driverAPI.getAll(),
        userAPI.getDrivers(),
        vehicleAPI.getAll(),
        vendorAPI.getAll()
      ]);

      setDrivers(driversRes?.data?.data || []);
      setEmployees(usersRes?.data?.data || []);
      setVehicles(vehiclesRes?.data?.data || []);
      setVendors(vendorsRes?.data?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load driver records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return drivers;
    return drivers.filter((driver) => {
      const haystack = [
        driver.name,
        driver.employee_id,
        driver.phone,
        driver.email,
        driver.vehicle_number,
        driver.vendor_name,
        driver.license_number
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [drivers, search]);

  const stats = useMemo(() => ({
    total: drivers.length,
    online: drivers.filter((driver) => driver.availability_status === 'ONLINE').length,
    onTrip: drivers.filter((driver) => driver.availability_status === 'ON_TRIP').length,
    unassignedVehicle: drivers.filter((driver) => !driver.vehicle_id).length
  }), [drivers]);

  const openCreate = () => {
    setEditingDriver(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (driver) => {
    setEditingDriver(driver);
    setForm({
      user_id: String(driver.user_id || ''),
      vehicle_id: String(driver.vehicle_id || ''),
      vendor_id: String(driver.vendor_id || ''),
      license_number: driver.license_number || '',
      license_expiry: driver.license_expiry ? driver.license_expiry.split('T')[0] : '',
      badge_number: driver.badge_number || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      user_id: form.user_id ? Number(form.user_id) : undefined,
      vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
      vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
      license_number: form.license_number || null,
      license_expiry: form.license_expiry || null,
      badge_number: form.badge_number || null
    };

    try {
      if (editingDriver) {
        delete payload.user_id;
        await driverAPI.update(editingDriver.id, payload);
        toast.success('Driver updated');
      } else {
        await driverAPI.create(payload);
        toast.success('Driver created');
      }
      setShowModal(false);
      setForm(emptyForm);
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save driver');
    }
  };

  const handleDelete = async (driverId) => {
    if (!window.confirm('Deactivate this driver?')) return;
    try {
      await driverAPI.delete(driverId);
      toast.success('Driver deactivated');
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to deactivate driver');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Driver Management</h1>
          <p className="text-sm text-gray-500">Manage driver profiles, vehicle assignments, and live availability.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchData} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
            <UserPlus size={16} />
            Add Driver
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Drivers</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Online</p>
          <p className="text-2xl font-bold text-green-600">{stats.online}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">On Trip</p>
          <p className="text-2xl font-bold text-primary-600">{stats.onTrip}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Without Vehicle</p>
          <p className="text-2xl font-bold text-amber-600">{stats.unassignedVehicle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 w-fit">
        <Search size={16} className="text-gray-400" />
        <input
          type="text"
          placeholder="Search drivers..."
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
        ) : filteredDrivers.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">Driver</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Contact</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Vehicle</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Vendor</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Availability</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Rating</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDrivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{driver.name}</p>
                    <p className="text-xs text-gray-500">{driver.employee_id || driver.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{driver.phone || driver.email || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{driver.vehicle_number || 'Unassigned'}</td>
                  <td className="px-4 py-3 text-gray-600">{driver.vendor_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[driver.availability_status] || 'bg-gray-100 text-gray-700'}`}>
                      {driver.availability_status || 'OFFLINE'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-yellow-500">
                      <Star size={14} fill="currentColor" />
                      {driver.rating_average ? Number(driver.rating_average).toFixed(1) : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(driver)} className="mr-3 text-xs font-medium text-primary-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(driver.id)} className="text-xs font-medium text-red-600 hover:underline">
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center text-sm text-gray-500">No driver records match the current filter.</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">{editingDriver ? 'Edit Driver' : 'Add Driver'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingDriver && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Driver User</label>
                  <select
                    value={form.user_id}
                    onChange={(event) => setForm((current) => ({ ...current, user_id: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select a driver user</option>
                    {employees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.employee_id || user.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Vehicle</label>
                  <select
                    value={form.vehicle_id}
                    onChange={(event) => setForm((current) => ({ ...current, vehicle_id: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.vehicle_number} {vehicle.model ? `• ${vehicle.model}` : ''}
                      </option>
                    ))}
                  </select>
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
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">License Number</label>
                  <input
                    type="text"
                    value={form.license_number}
                    onChange={(event) => setForm((current) => ({ ...current, license_number: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">License Expiry</label>
                  <input
                    type="date"
                    value={form.license_expiry}
                    onChange={(event) => setForm((current) => ({ ...current, license_expiry: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Badge Number</label>
                <input
                  type="text"
                  value={form.badge_number}
                  onChange={(event) => setForm((current) => ({ ...current, badge_number: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
                  {editingDriver ? 'Update Driver' : 'Create Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverManagementPage;

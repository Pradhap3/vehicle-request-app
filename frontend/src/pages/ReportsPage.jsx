import React, { useState, useEffect, useCallback } from 'react';
import { Download, Calendar, RefreshCw } from 'lucide-react';
import { reportAPI } from '../services/api';
import toast from 'react-hot-toast';

const REPORT_TABS = [
  { key: 'trips', label: 'Trip Summary', export: 'trips' },
  { key: 'daily', label: 'Daily Breakdown', export: 'daily' },
  { key: 'drivers', label: 'Driver Performance', export: 'drivers' },
  { key: 'vehicles', label: 'Vehicle Utilization', export: 'vehicles' },
  { key: 'employees', label: 'Employee Usage', export: 'employees' },
  { key: 'shifts', label: 'Shift Report', export: 'shifts' },
  { key: 'routes', label: 'Route Report', export: 'routes' },
  { key: 'incidents', label: 'Incidents', export: 'incidents' }
];

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState('trips');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { start_date: startDate, end_date: endDate };
      const apiMap = {
        trips: reportAPI.tripSummary,
        daily: reportAPI.dailyBreakdown,
        drivers: reportAPI.driverPerformance,
        vehicles: reportAPI.vehicleUtilization,
        employees: reportAPI.employeeUsage,
        shifts: reportAPI.shiftReport,
        routes: reportAPI.routeReport,
        incidents: reportAPI.incidentReport
      };
      const res = await apiMap[activeTab](params);
      setData(res?.data?.data || res?.data || null);
    } catch {
      toast.error('Failed to load report');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, startDate, endDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleExport = async () => {
    const tab = REPORT_TABS.find((t) => t.key === activeTab);
    try {
      const res = await reportAPI.exportCSV(tab.export, { start_date: startDate, end_date: endDate });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tab.export}_report_${startDate}_${endDate}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Report exported');
    } catch {
      toast.error('Export failed');
    }
  };

  const renderTable = () => {
    if (loading) {
      return (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      );
    }

    const rows = Array.isArray(data)
      ? data
      : data && typeof data === 'object'
        ? Object.entries(data).map(([metric, value]) => ({ metric, value }))
        : [];
    if (!rows.length) {
      return <div className="py-12 text-center text-gray-500">No data for selected period</div>;
    }

    const columns = Object.keys(rows[0]).filter((k) => !k.startsWith('_'));

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-4 py-3 font-semibold capitalize text-gray-600">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-4 py-3 text-gray-700">
                    {row[col] != null ? String(row[col]) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
          <p className="text-sm text-gray-500">Generate and export transport reports</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2">
            <Calendar size={16} className="text-gray-400" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="border-none bg-transparent text-sm outline-none" />
            <span className="text-gray-400">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="border-none bg-transparent text-sm outline-none" />
          </div>
          <button onClick={fetchReport} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-gray-200">
        <nav className="flex gap-1">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-4 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {data && !Array.isArray(data) && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(data).slice(0, 8).map(([key, val]) => (
            <div key={key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm capitalize text-gray-500">{key.replace(/_/g, ' ')}</p>
              <p className="text-xl font-bold text-gray-800">{val}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {renderTable()}
      </div>
    </div>
  );
};

export default ReportsPage;

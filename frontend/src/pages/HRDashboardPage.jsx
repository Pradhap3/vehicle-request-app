import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  RefreshCw,
  Shield,
  TrendingUp,
  Users
} from 'lucide-react';
import { hrAPI } from '../services/api';
import toast from 'react-hot-toast';

const StatCard = ({ icon: Icon, label, value, tone = 'primary' }) => {
  const tones = {
    primary: 'bg-primary-50 text-primary-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600'
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
      </div>
    </div>
  );
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
};

const HRDashboardPage = () => {
  const [dashboard, setDashboard] = useState(null);
  const [roster, setRoster] = useState([]);
  const [shiftView, setShiftView] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [safety, setSafety] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dashboardRes, rosterRes, shiftRes, complianceRes, safetyRes] = await Promise.all([
        hrAPI.getDashboard(),
        hrAPI.getRoster(),
        hrAPI.getShiftTransport(),
        hrAPI.getCompliance(),
        hrAPI.getSafety()
      ]);

      setDashboard(dashboardRes?.data?.data || null);
      setRoster(rosterRes?.data?.data || []);
      setShiftView(shiftRes?.data?.data || []);
      setCompliance(complianceRes?.data?.data || []);
      setSafety(safetyRes?.data?.data || null);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load HR dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const complianceSummary = useMemo(() => {
    return compliance.reduce(
      (summary, item) => {
        const status = item.compliance_status || 'COMPLIANT';
        summary.total += 1;
        if (status === 'NON_COMPLIANT') summary.nonCompliant += 1;
        else if (status === 'WARNING') summary.warning += 1;
        else summary.compliant += 1;
        return summary;
      },
      { total: 0, compliant: 0, warning: 0, nonCompliant: 0 }
    );
  }, [compliance]);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'roster', label: 'Employee Roster' },
    { key: 'shifts', label: 'Shift View' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'safety', label: 'Safety' }
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">HR Dashboard</h1>
          <p className="text-sm text-gray-500">Transport planning, roster coverage, compliance, and safety.</p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total Employees" value={dashboard?.total_employees || 0} tone="blue" />
        <StatCard icon={TrendingUp} label="Active Drivers" value={dashboard?.active_drivers || 0} tone="green" />
        <StatCard icon={CalendarCheck} label="Today's Bookings" value={dashboard?.today_bookings || 0} tone="primary" />
        <StatCard icon={AlertTriangle} label="Open Issues" value={complianceSummary.nonCompliant + (dashboard?.recent_incidents?.length || 0)} tone="amber" />
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">30-Day Trip Summary</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-gray-500">Total Trips</p>
                <p className="text-2xl font-bold text-gray-800">{dashboard?.trip_summary_30d?.total_trips || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-green-600">{dashboard?.trip_summary_30d?.completed || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-primary-600">{dashboard?.trip_summary_30d?.in_progress || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Exceptions</p>
                <p className="text-2xl font-bold text-red-600">
                  {(dashboard?.trip_summary_30d?.cancelled || 0) + (dashboard?.trip_summary_30d?.no_shows || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">Recent Incidents</h2>
              <div className="space-y-3">
                {(dashboard?.recent_incidents || []).length ? (
                  dashboard.recent_incidents.map((incident) => (
                    <div key={incident.id} className="rounded-lg border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-800">{incident.title || incident.incident_type}</p>
                          <p className="mt-1 text-sm text-gray-500">{incident.description || 'No description provided'}</p>
                        </div>
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                          {incident.severity || 'OPEN'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No recent incidents reported.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">Shift Coverage</h2>
              <div className="space-y-3">
                {shiftView.slice(0, 5).map((shift) => (
                  <div key={shift.shift_code} className="rounded-lg border border-gray-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-800">{shift.shift_name}</p>
                        <p className="text-sm text-gray-500">
                          {shift.shift_code} • {shift.start_time} - {shift.end_time}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-800">{shift.booking_count || 0}</p>
                        <p className="text-xs text-gray-500">bookings</p>
                      </div>
                    </div>
                  </div>
                ))}
                {!shiftView.length && <p className="text-sm text-gray-500">No shift data available.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'roster' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">Employee</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Department</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Shift</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Route</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Pickup</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Drop</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Recurring</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.length ? (
                roster.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{employee.name}</p>
                      <p className="text-xs text-gray-500">{employee.employee_id || employee.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{employee.department || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{employee.shift_code || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{employee.route_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{employee.pickup_location || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{employee.drop_location || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${employee.auto_generate ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {employee.auto_generate ? 'Enabled' : 'Manual'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-4 py-10 text-center text-gray-500">
                    No employee transport profiles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'shifts' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">Shift</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Code</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Bookings</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Completed</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Cancelled</th>
                <th className="px-4 py-3 font-semibold text-gray-600">No Shows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shiftView.length ? (
                shiftView.map((shift) => (
                  <tr key={shift.shift_code} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{shift.shift_name}</td>
                    <td className="px-4 py-3 text-gray-600">{shift.shift_code}</td>
                    <td className="px-4 py-3 text-gray-600">{shift.booking_count || 0}</td>
                    <td className="px-4 py-3 text-green-600">{shift.completed || 0}</td>
                    <td className="px-4 py-3 text-red-600">{shift.cancelled || 0}</td>
                    <td className="px-4 py-3 text-amber-600">{shift.no_shows || 0}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-gray-500">
                    No shift transport activity available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'compliance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={Shield} label="Compliant" value={complianceSummary.compliant} tone="green" />
            <StatCard icon={AlertTriangle} label="Warnings" value={complianceSummary.warning} tone="amber" />
            <StatCard icon={AlertTriangle} label="Non-Compliant" value={complianceSummary.nonCompliant} tone="red" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Employee</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Department</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Bookings</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">No Shows</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Cancellations</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compliance.length ? (
                  compliance.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.employee_id}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.department || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.total_bookings || 0}</td>
                      <td className="px-4 py-3 text-amber-600">{item.no_shows || 0}</td>
                      <td className="px-4 py-3 text-red-600">{item.cancellations || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.compliance_status === 'NON_COMPLIANT'
                            ? 'bg-red-50 text-red-700'
                            : item.compliance_status === 'WARNING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-green-50 text-green-700'
                        }`}>
                          {item.compliance_status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-4 py-10 text-center text-gray-500">
                      No compliance issues found for the last 30 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'safety' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Shield}
              label="Average Rating"
              value={Number(safety?.rating_summary?.avg_rating || 0).toFixed(1)}
              tone="green"
            />
            <StatCard icon={TrendingUp} label="Ratings Logged" value={safety?.rating_summary?.total_ratings || 0} tone="blue" />
            <StatCard icon={AlertTriangle} label="Low Ratings" value={safety?.rating_summary?.low_ratings || 0} tone="red" />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">Incident Trends</h2>
            <div className="space-y-3">
              {(safety?.incidents_by_type || []).length ? (
                safety.incidents_by_type.map((item, index) => (
                  <div key={`${item.incident_type}-${index}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-4">
                    <div>
                      <p className="font-medium text-gray-800">{item.incident_type}</p>
                      <p className="text-sm text-gray-500">Severity: {item.severity}</p>
                    </div>
                    <p className="text-xl font-semibold text-gray-800">{item.count}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No safety incidents reported in the last 30 days.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">Latest Incident Dates</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {(dashboard?.recent_incidents || []).slice(0, 4).map((incident) => (
                <div key={incident.id} className="rounded-lg border border-gray-100 p-4">
                  <p className="font-medium text-gray-800">{incident.title || incident.incident_type}</p>
                  <p className="text-sm text-gray-500">{formatDate(incident.created_at)}</p>
                </div>
              ))}
              {!dashboard?.recent_incidents?.length && <p className="text-sm text-gray-500">No incident history available.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HRDashboardPage;

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, ScanLine, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { securityAPI } from '../services/api';

const SecurityGatePage = () => {
  const [plateNumber, setPlateNumber] = useState('');
  const [gateCode, setGateCode] = useState('MAIN_GATE');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);

  const fetchLogs = async () => {
    try {
      const response = await securityAPI.getLogs();
      setLogs(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to fetch gate logs');
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleScan = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await securityAPI.scanVehicle({
        plate_number: plateNumber,
        gate_code: gateCode,
        event_type: 'ENTRY'
      });
      setResult(response.data?.data || null);
      toast.success('Vehicle processed');
      setPlateNumber('');
      fetchLogs();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to validate vehicle');
    } finally {
      setLoading(false);
    }
  };

  const decisionColor = {
    ALLOW: 'text-green-700 bg-green-50 border-green-200',
    DENY: 'text-red-700 bg-red-50 border-red-200',
    MANUAL_REVIEW: 'text-amber-700 bg-amber-50 border-amber-200'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Security Gate</h1>
          <p className="text-gray-500">Validate vehicles and capture entry logs</p>
        </div>
        <button onClick={fetchLogs} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <ScanLine className="text-primary-600" size={20} />
            <h2 className="font-semibold text-gray-800">Vehicle Scan</h2>
          </div>
          <form onSubmit={handleScan} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Plate / Vehicle Number</label>
              <input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="KA01AB1234"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Gate Code</label>
              <select
                value={gateCode}
                onChange={(e) => setGateCode(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="MAIN_GATE">Main Gate</option>
                <option value="WEST_GATE">West Gate</option>
                <option value="PLANT_GATE">Plant Gate</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
            >
              <ShieldCheck size={18} />
              {loading ? 'Processing...' : 'Validate Entry'}
            </button>
          </form>

          {result && (
            <div className={`mt-6 border rounded-lg p-4 ${decisionColor[result.decision] || decisionColor.MANUAL_REVIEW}`}>
              <div className="flex items-center gap-2 font-semibold">
                {result.decision === 'ALLOW' ? <CheckCircle2 size={18} /> : result.decision === 'DENY' ? <XCircle size={18} /> : <AlertTriangle size={18} />}
                {result.decision}
              </div>
              <p className="text-sm mt-2">{result.reason}</p>
              {result.cab?.cab_number ? <p className="text-sm mt-1">Cab: {result.cab.cab_number}</p> : null}
              {result.trip?.id ? <p className="text-sm mt-1">Trip ID: {result.trip.id}</p> : null}
              {result.manifestSummary ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/60 rounded-md p-2">
                    <p className="text-gray-500">Passengers</p>
                    <p className="font-semibold text-gray-800">{result.manifestSummary.totalPassengers}</p>
                  </div>
                  <div className="bg-white/60 rounded-md p-2">
                    <p className="text-gray-500">Boarded</p>
                    <p className="font-semibold text-gray-800">{result.manifestSummary.boarded}</p>
                  </div>
                  <div className="bg-white/60 rounded-md p-2">
                    <p className="text-gray-500">Dropped</p>
                    <p className="font-semibold text-gray-800">{result.manifestSummary.dropped}</p>
                  </div>
                  <div className="bg-white/60 rounded-md p-2">
                    <p className="text-gray-500">No-show</p>
                    <p className="font-semibold text-gray-800">{result.manifestSummary.noShow}</p>
                  </div>
                </div>
              ) : null}
              {Array.isArray(result.manifest) && result.manifest.length > 0 ? (
                <div className="mt-4 border-t border-current/20 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2">Manifest</p>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {result.manifest.map((item) => (
                      <div key={`${item.id || item.request_id}-${item.employee_id || item.employee_name}`} className="flex items-center justify-between text-xs bg-white/60 rounded-md px-3 py-2">
                        <div>
                          <p className="font-medium text-gray-800">{item.employee_name || `Employee ${item.employee_id}`}</p>
                          <p className="text-gray-500">{item.pickup_location || item.drop_location || 'Assigned passenger'}</p>
                        </div>
                        <span className="px-2 py-1 rounded-full bg-white text-gray-700 border border-gray-200">
                          {item.no_show ? 'NO_SHOW' : item.is_dropped ? 'DROPPED' : item.is_boarded ? 'BOARDED' : item.status || 'ASSIGNED'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Recent Gate Logs</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">No gate logs recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-800">{log.plate_number || log.cab_number || 'Unknown vehicle'}</p>
                      <p className="text-sm text-gray-500">{log.gate_code} | {log.event_type}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${decisionColor[log.decision] || decisionColor.MANUAL_REVIEW}`}>
                      {log.decision}
                    </span>
                  </div>
                  {log.reason ? <p className="text-sm text-gray-600 mt-2">{log.reason}</p> : null}
                  <p className="text-xs text-gray-400 mt-2">{new Date(log.scanned_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecurityGatePage;

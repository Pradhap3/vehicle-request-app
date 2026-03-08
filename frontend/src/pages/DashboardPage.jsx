import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { requestAPI, cabAPI, routeAPI, userAPI } from '../services/api';
import { 
  Users, 
  Car, 
  Route, 
  ClipboardList, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

const StatCard = ({ icon: Icon, label, value, color, link }) => (
  <Link 
    to={link} 
    className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500 mb-1">{label}</p>
        <p className="text-3xl font-bold text-gray-800">{value}</p>
      </div>
      <div className={`w-14 h-14 rounded-xl ${color} flex items-center justify-center`}>
        <Icon className="text-white" size={24} />
      </div>
    </div>
  </Link>
);

const RequestCard = ({ request }) => {
  const statusColors = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-blue-100 text-blue-800',
    ASSIGNED: 'bg-purple-100 text-purple-800',
    IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800'
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
          <Users size={18} className="text-gray-600" />
        </div>
        <div>
          <p className="font-medium text-gray-800">{request.employee_name || 'Unknown'}</p>
          <p className="text-sm text-gray-500">{request.route_name}</p>
        </div>
      </div>
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[request.status] || 'bg-gray-100'}`}>
        {request.status}
      </span>
    </div>
  );
};

const DashboardPage = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCabs: 0,
    totalRoutes: 0,
    pendingRequests: 0,
    todayRequests: 0,
    activeCabs: 0
  });
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [usersRes, cabsRes, routesRes, requestsRes, todayStatsRes] = await Promise.all([
        userAPI.getAll(),
        cabAPI.getAll(),
        routeAPI.getAll(),
        requestAPI.getAll({ limit: 5, sortBy: 'created_at', sortOrder: 'DESC' }),
        requestAPI.getTodayStats().catch(() => ({ data: { data: {} } }))
      ]);

      const users = usersRes.data.data || usersRes.data.users || [];
      const cabs = cabsRes.data.data || cabsRes.data.cabs || [];
      const routes = routesRes.data.data || routesRes.data.routes || [];
      const requests = requestsRes.data.data || requestsRes.data.requests || [];
      const todayStats = todayStatsRes.data.data || todayStatsRes.data.stats || {};

      setStats({
        totalUsers: users.length,
        totalCabs: cabs.length,
        totalRoutes: routes.length,
        pendingRequests: todayStats.pending || requests.filter(r => r.status === 'PENDING').length,
        todayRequests: todayStats.total || 0,
        activeCabs: cabs.filter(c => c.status === 'AVAILABLE' || c.status === 'ON_TRIP').length
      });

      setRecentRequests(requests);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500">Welcome to AISIN Fleet Management</p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={Users} 
          label="Total Users" 
          value={stats.totalUsers} 
          color="bg-blue-500"
          link="/users"
        />
        <StatCard 
          icon={Car} 
          label="Total Cabs" 
          value={stats.totalCabs} 
          color="bg-green-500"
          link="/cabs"
        />
        <StatCard 
          icon={Route} 
          label="Active Routes" 
          value={stats.totalRoutes} 
          color="bg-purple-500"
          link="/routes"
        />
        <StatCard 
          icon={ClipboardList} 
          label="Pending Requests" 
          value={stats.pendingRequests} 
          color="bg-yellow-500"
          link="/requests"
        />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Requests */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-800">Recent Requests</h2>
            <Link 
              to="/requests" 
              className="flex items-center gap-1 text-primary-500 text-sm font-medium hover:underline"
            >
              View all <ArrowRight size={16} />
            </Link>
          </div>
          
          {recentRequests.length > 0 ? (
            <div>
              {recentRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <ClipboardList size={48} className="mx-auto mb-3 text-gray-300" />
              <p>No recent requests</p>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="space-y-6">
          {/* Today's Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Today's Summary</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <ClipboardList size={18} className="text-blue-600" />
                  </div>
                  <span className="text-gray-600">Total Requests</span>
                </div>
                <span className="text-xl font-bold text-gray-800">{stats.todayRequests}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Car size={18} className="text-green-600" />
                  </div>
                  <span className="text-gray-600">Active Cabs</span>
                </div>
                <span className="text-xl font-bold text-gray-800">{stats.activeCabs}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Clock size={18} className="text-yellow-600" />
                  </div>
                  <span className="text-gray-600">Pending</span>
                </div>
                <span className="text-xl font-bold text-gray-800">{stats.pendingRequests}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link 
                to="/routes"
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Route size={20} className="text-primary-500" />
                <span className="text-gray-700">Manage Routes</span>
              </Link>
              <Link 
                to="/tracking"
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <MapPin size={20} className="text-primary-500" />
                <span className="text-gray-700">Live Tracking</span>
              </Link>
              <Link 
                to="/users"
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Users size={20} className="text-primary-500" />
                <span className="text-gray-700">Add New User</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;

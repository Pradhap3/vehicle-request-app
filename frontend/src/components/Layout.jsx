import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  LayoutDashboard,
  Users,
  Car,
  Route,
  ClipboardList,
  MapPin,
  User,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
  Globe
} from 'lucide-react';

const Layout = () => {
  const { user, logout, isAdmin, isDriver, isEmployee } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Navigation items based on role
  const getNavItems = () => {
    if (isAdmin) {
      return [
        { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/requests', icon: ClipboardList, label: 'Requests' },
        { path: '/users', icon: Users, label: 'Users' },
        { path: '/cabs', icon: Car, label: 'Cabs' },
        { path: '/routes', icon: Route, label: 'Routes' },
        { path: '/tracking', icon: MapPin, label: 'Live Tracking' },
      ];
    }
    if (isDriver) {
      return [
        { path: '/driver', icon: LayoutDashboard, label: 'My Dashboard' },
      ];
    }
    if (isEmployee) {
      return [
        { path: '/employee', icon: LayoutDashboard, label: 'My Dashboard' },
        { path: '/requests', icon: ClipboardList, label: 'My Requests' },
      ];
    }
    // Fallback for any other role - show admin navigation
    return [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/requests', icon: ClipboardList, label: 'Requests' },
      { path: '/users', icon: Users, label: 'Users' },
      { path: '/cabs', icon: Car, label: 'Cabs' },
      { path: '/routes', icon: Route, label: 'Routes' },
      { path: '/tracking', icon: MapPin, label: 'Live Tracking' },
    ];
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-primary-500 text-white transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-primary-400">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
            <span className="text-primary-500 font-bold text-xl">A</span>
          </div>
          <div>
            <h1 className="font-bold text-lg">AISIN Fleet</h1>
            <p className="text-xs text-primary-200">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors
                ${isActive 
                  ? 'bg-white text-primary-500 font-medium' 
                  : 'text-white hover:bg-primary-400'
                }
              `}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-primary-400">
          <div className="flex items-center gap-2 text-xs text-primary-200 mb-3">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          <p className="text-xs text-primary-300">AISIN Corporation</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Right side */}
            <div className="flex items-center gap-4 ml-auto">
              {/* Language selector */}
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                <Globe size={18} />
                English
                <ChevronDown size={16} />
              </button>

              {/* Notifications */}
              <button className="relative p-2 rounded-lg hover:bg-gray-100">
                <Bell size={20} className="text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              {/* User menu */}
              <div className="relative">
                <button 
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100"
                >
                  <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">
                    Hi, {user?.name}
                  </span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>

                {userMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                      <div className="p-3 border-b border-gray-100">
                        <p className="font-medium text-gray-800">{user?.name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                      <NavLink
                        to="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <User size={16} />
                        Profile
                      </NavLink>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
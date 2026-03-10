import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import { authAPI, notificationAPI } from '../services/api';
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
  const { user, logout, updateUser, isAdmin, isDriver, isEmployee } = useAuth();
  const { connected } = useSocket();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const languageOptions = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'ta', label: 'தமிழ்' },
    { code: 'hi', label: 'हिंदी' },
    { code: 'kn', label: 'ಕನ್ನಡ' }
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const fetchNotifications = async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        notificationAPI.getAll({ limit: 8 }),
        notificationAPI.getUnreadCount()
      ]);
      setNotifications(listRes?.data?.data || []);
      setUnreadCount(countRes?.data?.data?.count || 0);
    } catch (error) {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      // no-op
    }
  };

  const getNotificationTarget = (notification) => {
    let parsedData = {};
    try {
      parsedData = typeof notification?.data === 'string'
        ? JSON.parse(notification.data)
        : (notification?.data || {});
    } catch (error) {
      parsedData = {};
    }

    if (parsedData?.url && typeof parsedData.url === 'string') return parsedData.url;
    if (parsedData?.route && typeof parsedData.route === 'string') return parsedData.route;
    if (notification?.type === 'CAB_ASSIGNED' || notification?.type === 'REQUEST_CONFIRMED') {
      return '/requests';
    }
    return isEmployee ? '/employee' : '/dashboard';
  };

  const handleLanguageChange = async (langCode) => {
    setLanguage(langCode);
    setLanguageMenuOpen(false);

    try {
      await authAPI.updateProfile({ preferred_language: langCode });
      updateUser({ preferred_language: langCode });
    } catch (error) {
      // keep local fallback even if API fails
    }
  };

  useEffect(() => {
    if (user?.preferred_language && user.preferred_language !== language) {
      setLanguage(user.preferred_language);
    }
  }, [user?.preferred_language]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user?.id]);

  // Navigation items based on role
  const getNavItems = () => {
    if (isAdmin) {
      return [
        { path: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
        { path: '/requests', icon: ClipboardList, label: t('nav_requests') },
        { path: '/users', icon: Users, label: t('nav_users') },
        { path: '/cabs', icon: Car, label: t('nav_cabs') },
        { path: '/routes', icon: Route, label: t('nav_routes') },
        { path: '/tracking', icon: MapPin, label: t('nav_tracking') },
      ];
    }
    if (isDriver) {
      return [
        { path: '/driver', icon: LayoutDashboard, label: t('nav_my_dashboard') },
      ];
    }
    if (isEmployee) {
      return [
        { path: '/employee', icon: LayoutDashboard, label: t('nav_my_dashboard') },
        { path: '/requests', icon: ClipboardList, label: t('nav_my_requests') },
        { path: '/employee/tracking', icon: MapPin, label: t('nav_tracking') },
      ];
    }
    // Fallback for any other role - show admin navigation
    return [
      { path: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
      { path: '/requests', icon: ClipboardList, label: t('nav_requests') },
      { path: '/users', icon: Users, label: t('nav_users') },
      { path: '/cabs', icon: Car, label: t('nav_cabs') },
      { path: '/routes', icon: Route, label: t('nav_routes') },
      { path: '/tracking', icon: MapPin, label: t('nav_tracking') },
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
            <h1 className="font-bold text-lg">AISIN Cab Request</h1>
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
          {!isEmployee && (
            <div className="flex items-center gap-2 text-xs text-primary-200 mb-3">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
              {connected ? t('common_connected') : t('common_disconnected')}
            </div>
          )}
          <p className="text-xs text-primary-300">AISIN Automotive Karnataka Pvt. Ltd.</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50 overflow-visible">
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
              <div className="relative">
                <button
                  onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <Globe size={18} />
                  {languageOptions.find((l) => l.code === language)?.label || t('hdr_english')}
                  <ChevronDown size={16} />
                </button>
                {languageMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-lg shadow-lg border border-gray-200 z-[2500] max-h-64 overflow-y-auto">
                    {languageOptions.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                          language === lang.code ? 'text-primary-600 font-medium' : 'text-gray-700'
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={async () => {
                    const nextState = !notificationsOpen;
                    setNotificationsOpen(nextState);
                    if (nextState) {
                      await fetchNotifications();
                    }
                  }}
                  className="relative p-2 rounded-lg hover:bg-gray-100"
                >
                  <Bell size={20} className="text-gray-600" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">{t('hdr_notifications')}</p>
                      <button
                        onClick={async () => {
                          await notificationAPI.markAllAsRead();
                          setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                          setUnreadCount(0);
                        }}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        {t('hdr_mark_all_read')}
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-gray-500 text-center">{t('hdr_no_notifications')}</div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          onClick={async () => {
                            await markNotificationRead(notification.id);
                            setNotificationsOpen(false);
                            navigate(getNotificationTarget(notification));
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                            !notification.is_read ? 'bg-blue-50' : ''
                          }`}
                        >
                          <p className="text-sm font-medium text-gray-800">{notification.title || t('hdr_notification_fallback')}</p>
                          <p className="text-xs text-gray-600 mt-1">{notification.message || notification.body || ''}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

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
                    {t('hdr_greeting')}, {user?.name}
                  </span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>

                {userMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setLanguageMenuOpen(false);
                        setNotificationsOpen(false);
                      }}
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
                        {t('hdr_profile')}
                      </NavLink>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                      >
                        <LogOut size={16} />
                        {t('hdr_logout')}
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

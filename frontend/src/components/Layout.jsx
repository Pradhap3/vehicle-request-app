import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
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
  Globe,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import { authAPI, notificationAPI } from '../services/api';
import { APP_NAME, getRoleLabel } from '../constants/app';

const languageOptions = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ta', label: 'Tamil' },
  { code: 'hi', label: 'Hindi' },
  { code: 'kn', label: 'Kannada' }
];

const Layout = () => {
  const { user, logout, updateUser, isAdmin, isDriver, isEmployee } = useAuth();
  const isSecurity = user?.role === 'SECURITY';
  const { connected } = useSocket();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const closeMenus = () => {
    setUserMenuOpen(false);
    setLanguageMenuOpen(false);
    setNotificationsOpen(false);
  };

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
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // no-op
    }
  };

  const getNotificationTarget = (notification) => {
    let parsedData = {};
    try {
      parsedData = typeof notification?.data === 'string'
        ? JSON.parse(notification.data)
        : (notification?.data || {});
    } catch {
      parsedData = {};
    }

    if (typeof parsedData?.url === 'string') return parsedData.url;
    if (typeof parsedData?.route === 'string') return parsedData.route;
    if (notification?.type === 'CAB_ASSIGNED' || notification?.type === 'REQUEST_CONFIRMED') {
      return '/requests';
    }
    if (isEmployee) return '/employee';
    if (isSecurity) return '/security/gate';
    if (isDriver) return '/driver';
    return '/dashboard';
  };

  const handleLanguageChange = async (langCode) => {
    setLanguage(langCode);
    setLanguageMenuOpen(false);

    try {
      await authAPI.updateProfile({ preferred_language: langCode });
      updateUser({ preferred_language: langCode });
    } catch {
      // keep local fallback even if API fails
    }
  };

  useEffect(() => {
    if (user?.preferred_language && user.preferred_language !== language) {
      setLanguage(user.preferred_language);
    }
  }, [language, setLanguage, user?.preferred_language]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user?.id]);

  const getNavItems = () => {
    if (isAdmin) {
      return [
        { path: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
        { path: '/requests', icon: ClipboardList, label: t('nav_requests') },
        { path: '/users', icon: Users, label: t('nav_users') },
        { path: '/cabs', icon: Car, label: t('nav_cabs') },
        { path: '/routes', icon: Route, label: t('nav_routes') },
        { path: '/tracking', icon: MapPin, label: t('nav_tracking') }
      ];
    }
    if (isDriver) {
      return [
        { path: '/driver', icon: LayoutDashboard, label: 'Driver Operations' }
      ];
    }
    if (isEmployee) {
      return [
        { path: '/employee', icon: LayoutDashboard, label: 'My Transport' },
        { path: '/requests', icon: ClipboardList, label: 'My Requests' },
        { path: '/employee/tracking', icon: MapPin, label: 'Live Tracking' }
      ];
    }
    if (isSecurity) {
      return [
        { path: '/security/gate', icon: ShieldCheck, label: 'Gate Control' }
      ];
    }
    return [
      { path: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
      { path: '/requests', icon: ClipboardList, label: t('nav_requests') },
      { path: '/users', icon: Users, label: t('nav_users') },
      { path: '/cabs', icon: Car, label: t('nav_cabs') },
      { path: '/routes', icon: Route, label: t('nav_routes') },
      { path: '/tracking', icon: MapPin, label: t('nav_tracking') }
    ];
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 transform bg-primary-500 text-white transition-transform duration-300 ease-in-out
          lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center gap-3 border-b border-primary-400 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
            <span className="text-xl font-bold text-primary-500">A</span>
          </div>
          <div>
            <h1 className="text-lg font-bold">{APP_NAME}</h1>
            <p className="text-xs text-primary-200">{getRoleLabel(user?.role)}</p>
          </div>
        </div>

        <nav className="mt-6 px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                mb-1 flex items-center gap-3 rounded-lg px-4 py-3 transition-colors
                ${isActive ? 'bg-white font-medium text-primary-500' : 'text-white hover:bg-primary-400'}
              `}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-primary-400 p-4">
          {!isEmployee && (
            <div className="mb-3 flex items-center gap-2 text-xs text-primary-200">
              <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
              {connected ? t('common_connected') : t('common_disconnected')}
            </div>
          )}
          <p className="text-xs text-primary-300">AISIN Automotive Karnataka Pvt. Ltd.</p>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="sticky top-0 z-50 overflow-visible border-b border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="rounded-lg p-2 hover:bg-gray-100 lg:hidden"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            <div className="ml-auto flex items-center gap-4">
              <div className="relative">
                <button
                  onClick={() => {
                    setLanguageMenuOpen((prev) => !prev);
                    setNotificationsOpen(false);
                    setUserMenuOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                >
                  <Globe size={18} />
                  {languageOptions.find((entry) => entry.code === language)?.label || 'English'}
                  <ChevronDown size={16} />
                </button>
                {languageMenuOpen && (
                  <div className="absolute right-0 top-full z-[2500] mt-2 max-h-64 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {languageOptions.map((entry) => (
                      <button
                        key={entry.code}
                        onClick={() => handleLanguageChange(entry.code)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          language === entry.code ? 'font-medium text-primary-600' : 'text-gray-700'
                        }`}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={async () => {
                    const nextState = !notificationsOpen;
                    setNotificationsOpen(nextState);
                    setLanguageMenuOpen(false);
                    setUserMenuOpen(false);
                    if (nextState) {
                      await fetchNotifications();
                    }
                  }}
                  className="relative rounded-lg p-2 hover:bg-gray-100"
                >
                  <Bell size={20} className="text-gray-600" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">{t('hdr_notifications')}</p>
                      <button
                        onClick={async () => {
                          await notificationAPI.markAllAsRead();
                          setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
                          setUnreadCount(0);
                        }}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        {t('hdr_mark_all_read')}
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-gray-500">{t('hdr_no_notifications')}</div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          onClick={async () => {
                            await markNotificationRead(notification.id);
                            closeMenus();
                            navigate(getNotificationTarget(notification));
                          }}
                          className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
                            !notification.is_read ? 'bg-blue-50' : ''
                          }`}
                        >
                          <p className="text-sm font-medium text-gray-800">
                            {notification.title || t('hdr_notification_fallback')}
                          </p>
                          <p className="mt-1 text-xs text-gray-600">{notification.message || notification.body || ''}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => {
                    setUserMenuOpen((prev) => !prev);
                    setLanguageMenuOpen(false);
                    setNotificationsOpen(false);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-100"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500">
                    <span className="text-sm font-medium text-white">
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                  <span className="hidden text-sm font-medium text-gray-700 sm:block">
                    {t('hdr_greeting')}, {user?.name}
                  </span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={closeMenus} />
                    <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                      <div className="border-b border-gray-100 p-3">
                        <p className="font-medium text-gray-800">{user?.name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                      <NavLink
                        to="/profile"
                        onClick={closeMenus}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <User size={16} />
                        {t('hdr_profile')}
                      </NavLink>
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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

        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

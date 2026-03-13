import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, Trash2, RefreshCw } from 'lucide-react';
import { notificationAPI } from '../services/api';
import toast from 'react-hot-toast';

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationAPI.getAll({ limit: 100 });
      setNotifications(res?.data?.data || []);
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success('All marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const deleteNotification = async (id) => {
    try {
      await notificationAPI.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const deleteAllRead = async () => {
    if (!window.confirm('Delete all read notifications?')) return;
    try {
      await notificationAPI.deleteRead();
      setNotifications((prev) => prev.filter((n) => !n.is_read));
      toast.success('Read notifications deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'read') return n.is_read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Notifications</h1>
          <p className="text-sm text-gray-500">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchNotifications} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={markAllRead} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <CheckCheck size={16} /> Mark All Read
          </button>
          <button onClick={deleteAllRead} className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <Trash2 size={16} /> Clear Read
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {['all', 'unread', 'read'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-primary-500 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
            {f} {f === 'unread' && unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <Bell size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{filter === 'unread' ? 'No unread notifications' : 'No notifications'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <div key={n.id}
              className={`flex items-start gap-4 rounded-xl border bg-white p-4 shadow-sm transition-colors ${
                !n.is_read ? 'border-primary-200 bg-primary-50/30' : 'border-gray-200'
              }`}>
              <div className="mt-1">
                {!n.is_read && <div className="h-2.5 w-2.5 rounded-full bg-primary-500" />}
                {n.is_read && <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-800' : 'font-medium text-gray-700'}`}>
                  {n.title || 'Notification'}
                </p>
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">{n.message || n.body || ''}</p>
                <p className="mt-1 text-xs text-gray-400">{timeAgo(n.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                {!n.is_read && (
                  <button onClick={() => markRead(n.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-primary-600" title="Mark as read">
                    <Check size={16} />
                  </button>
                )}
                <button onClick={() => deleteNotification(n.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;

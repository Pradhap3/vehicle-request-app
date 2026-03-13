import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Settings } from 'lucide-react';
import { settingsAPI } from '../services/api';
import toast from 'react-hot-toast';

const AdminSettingsPage = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState({});

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await settingsAPI.getAll();
      setSettings(response?.data?.data || []);
      setChanged({});
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const groupedSettings = useMemo(() => {
    return settings.reduce((groups, setting) => {
      const category = setting.category || 'general';
      if (!groups[category]) groups[category] = [];
      groups[category].push(setting);
      return groups;
    }, {});
  }, [settings]);

  const makeKey = (setting) => `${setting.category || 'general'}::${setting.key_name}`;

  const handleChange = (setting, value) => {
    setChanged((current) => ({
      ...current,
      [makeKey(setting)]: {
        category: setting.category || 'general',
        key_name: setting.key_name,
        value
      }
    }));
  };

  const handleSave = async () => {
    const payload = Object.values(changed);
    if (!payload.length) {
      toast('No changes to save');
      return;
    }

    setSaving(true);
    try {
      await settingsAPI.update(payload);
      toast.success('Settings updated');
      fetchSettings();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-800">System Settings</h1>
          <p className="text-sm text-gray-500">Update configurable platform values grouped by operational category.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchSettings} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !Object.keys(changed).length}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {!!Object.keys(changed).length && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {Object.keys(changed).length} unsaved setting change(s).
        </div>
      )}

      {Object.entries(groupedSettings).map(([category, items]) => (
        <div key={category} className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
            <Settings size={18} className="text-primary-500" />
            <h2 className="text-lg font-semibold capitalize text-gray-800">{category.replace(/_/g, ' ')}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map((setting) => {
              const key = makeKey(setting);
              return (
                <div key={key} className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_260px] md:items-center">
                  <div>
                    <p className="font-medium text-gray-800">{setting.key_name}</p>
                    <p className="mt-1 text-sm text-gray-500">{setting.description || 'No description provided.'}</p>
                  </div>
                  <input
                    type="text"
                    value={changed[key]?.value ?? setting.value ?? ''}
                    onChange={(event) => handleChange(setting, event.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${
                      changed[key] ? 'border-amber-300 bg-amber-50' : 'border-gray-300'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!settings.length && (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center shadow-sm">
          <Settings size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">No configurable settings were returned by the API.</p>
        </div>
      )}
    </div>
  );
};

export default AdminSettingsPage;

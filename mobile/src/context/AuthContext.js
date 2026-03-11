import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api';
import { authStorage } from '../storage/authStorage';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await authStorage.load();
      if (!mounted) return;
      if (!session.token || !session.user) {
        setLoading(false);
        return;
      }
      try {
        const response = await authApi.me();
        const userData = response.data?.data || response.data?.user || response.data;
        setUser(userData);
        setToken(session.token);
      } catch {
        await authStorage.clear();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => ({
    user,
    token,
    loading,
    async login(identifier, password) {
      const response = await authApi.login(identifier, password);
      const payload = response.data?.data || response.data;
      const session = {
        token: payload.token,
        refreshToken: payload.refreshToken,
        user: payload.user
      };
      await authStorage.save(session);
      setUser(session.user);
      setToken(session.token);
      return session.user;
    },
    async logout() {
      try {
        await authApi.logout();
      } catch {
        // ignore
      }
      await authStorage.clear();
      setUser(null);
      setToken(null);
    }
  }), [loading, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

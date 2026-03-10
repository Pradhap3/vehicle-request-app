import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [driverLocations, setDriverLocations] = useState({});
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const apiOrigin = import.meta.env.VITE_API_URL
      ? new URL(import.meta.env.VITE_API_URL).origin
      : null;
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || apiOrigin || window.location.origin;
    
    const newSocket = io(SOCKET_URL, {
      auth: {
        token: localStorage.getItem('token')
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
      
      // Join role-specific room
      newSocket.emit('join_role', { role: user.role, userId: user.id });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnected(false);
    });

    // Listen for cab location updates
    newSocket.on('cab_location_update', (data) => {
      setDriverLocations(prev => ({
        ...prev,
        [data.cab_id || data.cabId]: {
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: data.timestamp,
          driverName: data.driver_name || data.driverName || null
        }
      }));
    });

    // Listen for cab status updates
    newSocket.on('cab_status_update', (data) => {
      // Handle cab status updates (e.g., available, on_trip, offline)
      console.log('Cab status update:', data);
    });

    // Listen for trip updates
    newSocket.on('trip_update', (data) => {
      toast.info(`Trip update: ${data.message}`);
    });

    // Listen for notifications
    newSocket.on('notification', (data) => {
      toast(data.message, {
        icon: data.type === 'warning' ? '⚠️' : data.type === 'error' ? '❌' : 'ℹ️',
        duration: 5000
      });
    });

    // Listen for traffic alerts
    newSocket.on('traffic_alert', (data) => {
      toast.error(`Traffic Alert: ${data.message}`, { duration: 8000 });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, user]);

  // Emit driver location
  const emitDriverLocation = useCallback((latitude, longitude) => {
    if (socket && connected) {
      socket.emit('driver_location', {
        latitude,
        longitude,
        timestamp: new Date().toISOString()
      });
    }
  }, [socket, connected]);

  // Emit trip status update
  const emitTripStatus = useCallback((requestId, status) => {
    if (socket && connected) {
      socket.emit('trip_status', {
        requestId,
        status,
        timestamp: new Date().toISOString()
      });
    }
  }, [socket, connected]);

  const value = {
    socket,
    connected,
    driverLocations,
    emitDriverLocation,
    emitTripStatus
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import DriverHomeScreen from './src/screens/DriverHomeScreen';
import SecurityGateScreen from './src/screens/SecurityGateScreen';
import EmployeeTripsScreen from './src/screens/EmployeeTripsScreen';
import TripDetailScreen from './src/screens/TripDetailScreen';
import NavigationScreen from './src/screens/NavigationScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SOSScreen from './src/screens/SOSScreen';
import { createSocketClient } from './src/services/socket';
import { styles } from './src/theme/styles';

function TabBar({ tabs, activeTab, onSelect }) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
          onPress={() => onSelect(tab.key)}
        >
          <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>{tab.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function AuthenticatedApp() {
  const { user, token, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [activeTrip, setActiveTrip] = useState(null);
  const [stackScreen, setStackScreen] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token || !user) return undefined;
    const client = createSocketClient(token);
    client.on('connect', () => {
      client.emit('join_role', { role: user.role, userId: user.id });
    });
    setSocket(client);
    return () => {
      client.disconnect();
      setSocket(null);
    };
  }, [token, user]);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'SECURITY') {
      setActiveTab('security');
      return;
    }
    if (user.role === 'CAB_DRIVER' || user.role === 'DRIVER') {
      setActiveTab((current) => current === 'security' ? 'home' : current || 'home');
      return;
    }
    setActiveTab((current) => current === 'security' ? 'trips' : current || 'trips');
  }, [user]);

  const driverTabs = useMemo(() => ([
    { key: 'home', label: 'Home' },
    { key: 'navigation', label: 'Navigate' },
    { key: 'history', label: 'History' },
    { key: 'profile', label: 'Profile' },
    { key: 'sos', label: 'SOS' }
  ]), []);

  const employeeTabs = useMemo(() => ([
    { key: 'trips', label: 'Trips' },
    { key: 'history', label: 'History' },
    { key: 'profile', label: 'Profile' },
    { key: 'sos', label: 'SOS' }
  ]), []);

  const openTripDetail = (trip) => {
    setActiveTrip(trip);
    setStackScreen('trip-detail');
  };

  const openNavigation = (trip) => {
    if (trip) setActiveTrip(trip);
    if (user?.role === 'CAB_DRIVER' || user?.role === 'DRIVER') {
      setActiveTab('navigation');
      return;
    }
    setStackScreen('navigation');
  };

  const closeStack = () => setStackScreen(null);

  if (loading) {
    return <View style={styles.centered} />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (stackScreen === 'trip-detail') {
    return (
      <TripDetailScreen
        trip={activeTrip}
        role={user.role}
        onBack={closeStack}
        onOpenNavigation={openNavigation}
        onTripUpdated={setActiveTrip}
      />
    );
  }

  if (stackScreen === 'navigation') {
    return (
      <NavigationScreen
        trip={activeTrip}
        role={user.role}
        onBack={closeStack}
        onSelectTrip={openTripDetail}
      />
    );
  }

  if (user.role === 'SECURITY') {
    return <SecurityGateScreen />;
  }

  const isDriver = user.role === 'CAB_DRIVER' || user.role === 'DRIVER';

  let content = null;
  if (isDriver) {
    switch (activeTab) {
      case 'navigation':
        content = <NavigationScreen trip={activeTrip} role={user.role} onSelectTrip={openTripDetail} />;
        break;
      case 'history':
        content = <HistoryScreen onSelectTrip={openTripDetail} />;
        break;
      case 'profile':
        content = <ProfileScreen />;
        break;
      case 'sos':
        content = <SOSScreen trip={activeTrip} socket={socket} />;
        break;
      case 'home':
      default:
        content = <DriverHomeScreen onSelectTrip={openTripDetail} onOpenNavigation={openNavigation} />;
        break;
    }
  } else {
    switch (activeTab) {
      case 'history':
        content = <HistoryScreen onSelectTrip={openTripDetail} />;
        break;
      case 'profile':
        content = <ProfileScreen />;
        break;
      case 'sos':
        content = <SOSScreen trip={activeTrip} socket={socket} />;
        break;
      case 'trips':
      default:
        content = <EmployeeTripsScreen onSelectTrip={openTripDetail} />;
        break;
    }
  }

  return (
    <View style={styles.shellContent}>
      <View style={styles.shellContent}>{content}</View>
      <TabBar tabs={isDriver ? driverTabs : employeeTabs} activeTab={activeTab} onSelect={setActiveTab} />
    </View>
  );
}

function Root() {
  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.appShell}>
        <StatusBar style="dark" />
        <Root />
      </SafeAreaView>
    </AuthProvider>
  );
}

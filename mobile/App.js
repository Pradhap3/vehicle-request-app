import React from 'react';
import { SafeAreaView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import DriverHomeScreen from './src/screens/DriverHomeScreen';
import SecurityGateScreen from './src/screens/SecurityGateScreen';
import EmployeeTripsScreen from './src/screens/EmployeeTripsScreen';
import { styles } from './src/theme/styles';

function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={styles.centered} />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (user.role === 'SECURITY') {
    return <SecurityGateScreen />;
  }

  if (user.role === 'CAB_DRIVER' || user.role === 'DRIVER') {
    return <DriverHomeScreen />;
  }

  return <EmployeeTripsScreen />;
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

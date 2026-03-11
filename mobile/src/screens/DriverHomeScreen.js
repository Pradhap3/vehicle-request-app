import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { driverApi } from '../services/api';
import { createSocketClient } from '../services/socket';
import { useDriverLocation } from '../hooks/useDriverLocation';
import ScreenHeader from '../components/ScreenHeader';
import MetricCard from '../components/MetricCard';
import { styles } from '../theme/styles';

export default function DriverHomeScreen() {
  const { user, token, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const fetchDashboard = useCallback(async () => {
    const response = await driverApi.dashboard();
    setDashboard(response.data?.data || null);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = createSocketClient(token);
    return () => socket.disconnect();
  }, [token]);

  const onLocation = useCallback(async (coords) => {
    await driverApi.updateLocation(coords);
  }, []);

  const { locationError } = useDriverLocation(trackingEnabled, onLocation);

  const metrics = useMemo(() => ([
    { label: 'Passengers', value: dashboard?.operations?.totalPassengers || 0 },
    { label: 'Waiting', value: dashboard?.operations?.waitingPassengers?.length || 0 },
    { label: 'Boarded', value: dashboard?.operations?.boardedPassengers || 0 },
    { label: 'No-show', value: dashboard?.operations?.noShows?.length || 0 }
  ]), [dashboard]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader user={user} onLogout={logout} title="Driver Operations" subtitle={dashboard?.cab?.cab_number || 'No cab assigned'} />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Live tracking</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setTrackingEnabled((value) => !value)}>
          <Text style={styles.primaryButtonText}>{trackingEnabled ? 'Stop tracking' : 'Start tracking'}</Text>
        </TouchableOpacity>
        {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
      </View>

      <View style={styles.metricGrid}>
        {metrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} />)}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Manifest</Text>
        {(dashboard?.manifest || dashboard?.passengers || []).map((item) => (
          <View key={`${item.id}-${item.employee_id || item.request_id}`} style={styles.rowCard}>
            <View>
              <Text style={styles.rowTitle}>{item.employee_name || `Employee ${item.employee_id}`}</Text>
              <Text style={styles.rowSubtitle}>{item.pickup_location || item.drop_location || 'Assigned stop'}</Text>
            </View>
            <Text style={styles.statusPill}>
              {item.no_show ? 'NO_SHOW' : item.is_dropped ? 'DROPPED' : item.is_boarded ? 'BOARDED' : item.status || 'ASSIGNED'}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

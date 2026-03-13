import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { driverApi, tripApiV2 } from '../services/api';
import { useDriverLocation } from '../hooks/useDriverLocation';
import ScreenHeader from '../components/ScreenHeader';
import MetricCard from '../components/MetricCard';
import { styles } from '../theme/styles';

export default function DriverHomeScreen({ onSelectTrip, onOpenNavigation }) {
  const { user, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [todayTrips, setTodayTrips] = useState([]);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const fetchData = useCallback(async () => {
    const [dashboardResponse, tripResponse] = await Promise.all([
      driverApi.dashboard(),
      tripApiV2.driverToday()
    ]);
    setDashboard(dashboardResponse.data?.data || null);
    setTodayTrips(tripResponse.data?.data || []);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeTrip = todayTrips.find((trip) => ['ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'PASSENGER_ONBOARD', 'IN_PROGRESS'].includes(trip.status)) || todayTrips[0];

  const onLocation = useCallback(async (coords) => {
    await tripApiV2.updateLocation({
      ...coords,
      trip_id: activeTrip?.id || null
    });
  }, [activeTrip?.id]);

  const { locationError } = useDriverLocation(trackingEnabled, onLocation);

  const metrics = useMemo(() => ([
    { label: 'Passengers', value: dashboard?.operations?.totalPassengers || 0 },
    { label: 'Waiting', value: dashboard?.operations?.waitingPassengers?.length || 0 },
    { label: 'Boarded', value: dashboard?.operations?.boardedPassengers || 0 },
    { label: 'Trips Today', value: todayTrips.length }
  ]), [dashboard, todayTrips.length]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader
        user={user}
        onLogout={logout}
        title="Driver Operations"
        subtitle={dashboard?.cab?.cab_number || activeTrip?.vehicle_number || 'No cab assigned'}
      />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Live tracking</Text>
        <Text style={styles.helperText}>
          Toggle background updates while driving. Location is attached to the active trip when available.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setTrackingEnabled((value) => !value)}>
          <Text style={styles.primaryButtonText}>{trackingEnabled ? 'Stop tracking' : 'Start tracking'}</Text>
        </TouchableOpacity>
        {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
      </View>

      <View style={styles.metricGrid}>
        {metrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} />)}
      </View>

      {activeTrip ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Active trip</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Passenger</Text>
              <Text style={styles.infoValue}>{activeTrip.employee_name || 'Assigned passenger'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Route</Text>
              <Text style={styles.infoValue}>{`${activeTrip.pickup_location || '-'} to ${activeTrip.drop_location || '-'}`}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>{(activeTrip.status || 'ASSIGNED').replace(/_/g, ' ')}</Text>
            </View>
          </View>
          <View style={styles.rowWrap}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => onSelectTrip?.(activeTrip)}>
              <Text style={styles.primaryButtonText}>Trip details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => onOpenNavigation?.(activeTrip)}>
              <Text style={styles.secondaryButtonText}>Navigation</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Today's trips</Text>
        {todayTrips.length ? todayTrips.map((trip) => (
          <TouchableOpacity key={trip.id} style={styles.rowCard} onPress={() => onSelectTrip?.(trip)}>
            <View>
              <Text style={styles.rowTitle}>{trip.employee_name || trip.booking_ref || `Trip ${trip.id}`}</Text>
              <Text style={styles.rowSubtitle}>{trip.pickup_location || 'Pickup'} -> {trip.drop_location || 'Drop'}</Text>
            </View>
            <Text style={styles.statusPill}>{trip.status}</Text>
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No trips assigned for today.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

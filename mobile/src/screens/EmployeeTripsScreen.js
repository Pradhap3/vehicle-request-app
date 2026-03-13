import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { tripApiV2 } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import MetricCard from '../components/MetricCard';
import { styles } from '../theme/styles';

export default function EmployeeTripsScreen({ onSelectTrip }) {
  const { user, logout } = useAuth();
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    (async () => {
      const response = await tripApiV2.employeeTrips({ limit: 20 });
      setTrips(response.data?.data || []);
    })();
  }, []);

  const stats = {
    total: trips.length,
    upcoming: trips.filter((trip) => ['ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED'].includes(trip.status)).length,
    completed: trips.filter((trip) => trip.status === 'COMPLETED').length,
    issues: trips.filter((trip) => ['NO_SHOW', 'CANCELLED', 'ESCALATED'].includes(trip.status)).length
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader user={user} onLogout={logout} title="My Transport" subtitle="Upcoming and recent trips" />

      <View style={styles.metricGrid}>
        <MetricCard label="Total" value={stats.total} />
        <MetricCard label="Upcoming" value={stats.upcoming} />
        <MetricCard label="Completed" value={stats.completed} />
        <MetricCard label="Issues" value={stats.issues} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trip list</Text>
        {trips.length ? trips.map((trip) => (
          <TouchableOpacity key={trip.id} style={styles.rowCard} onPress={() => onSelectTrip?.(trip)}>
            <View>
              <Text style={styles.rowTitle}>{trip.booking_ref || trip.route_name || `Trip ${trip.id}`}</Text>
              <Text style={styles.rowSubtitle}>{trip.pickup_location || 'Pickup'} -> {trip.drop_location || 'Drop'}</Text>
            </View>
            <Text style={styles.statusPill}>{trip.status}</Text>
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No trips available.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { tripApiV2 } from '../services/api';
import { styles } from '../theme/styles';

export default function HistoryScreen({ onSelectTrip }) {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    (async () => {
      if (user?.role === 'DRIVER' || user?.role === 'CAB_DRIVER') {
        const response = await tripApiV2.driverToday();
        const items = (response.data?.data || []).filter((trip) => ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'ESCALATED'].includes(trip.status));
        setHistory(items);
      } else {
        const response = await tripApiV2.employeeTrips({ limit: 50 });
        const items = (response.data?.data || []).filter((trip) => ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'ESCALATED'].includes(trip.status));
        setHistory(items);
      }
    })();
  }, [user?.role]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>History</Text>
        <Text style={styles.helperText}>Recent completed and exception trips available in the current mobile API.</Text>
      </View>

      <View style={styles.card}>
        {history.length ? history.map((trip) => (
          <TouchableOpacity key={trip.id} style={styles.rowCard} onPress={() => onSelectTrip?.(trip)}>
            <View>
              <Text style={styles.rowTitle}>{trip.trip_ref || trip.booking_ref || `Trip ${trip.id}`}</Text>
              <Text style={styles.rowSubtitle}>{trip.pickup_location || 'Pickup'} -> {trip.drop_location || 'Drop'}</Text>
            </View>
            <Text style={styles.statusPill}>{trip.status}</Text>
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No historical trips available.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

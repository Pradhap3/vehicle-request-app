import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { employeeApi } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import { styles } from '../theme/styles';

export default function EmployeeTripsScreen() {
  const { user, logout } = useAuth();
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    (async () => {
      const response = await employeeApi.myTrips();
      setTrips(response.data?.data || []);
    })();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader user={user} onLogout={logout} title="My Transport" subtitle="Today's trips" />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Assigned trips</Text>
        {trips.map((trip) => (
          <View key={trip.id} style={styles.rowCard}>
            <View>
              <Text style={styles.rowTitle}>{trip.trip_direction || trip.request_type || 'Trip'}</Text>
              <Text style={styles.rowSubtitle}>{trip.cab_number || 'Cab pending'} | {trip.driver_name || 'Driver pending'}</Text>
            </View>
            <Text style={styles.statusPill}>{trip.status}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

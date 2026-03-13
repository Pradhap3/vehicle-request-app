import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { driverApi, transportApi } from '../services/api';
import { styles } from '../theme/styles';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [transportProfile, setTransportProfile] = useState(null);
  const [driverStatus, setDriverStatus] = useState(user?.availability_status || null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (user?.role === 'EMPLOYEE' || user?.role === 'USER') {
          const response = await transportApi.profile();
          if (mounted) setTransportProfile(response.data?.data || null);
        }
      } catch {
        if (mounted) setTransportProfile(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.role]);

  const updateDriverStatus = async (status) => {
    await driverApi.availability(status);
    setDriverStatus(status);
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{user?.name || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{user?.role || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Employee ID</Text>
            <Text style={styles.infoValue}>{user?.employee_id || '-'}</Text>
          </View>
        </View>
      </View>

      {(user?.role === 'EMPLOYEE' || user?.role === 'USER') ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Transport profile</Text>
          {transportProfile ? (
            <View style={styles.infoGrid}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Pickup</Text>
                <Text style={styles.infoValue}>{transportProfile.pickup_location || '-'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Drop</Text>
                <Text style={styles.infoValue}>{transportProfile.drop_location || '-'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Shift</Text>
                <Text style={styles.infoValue}>{transportProfile.shift_code || '-'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Route</Text>
                <Text style={styles.infoValue}>{transportProfile.route_name || '-'}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No saved transport profile.</Text>
            </View>
          )}
        </View>
      ) : null}

      {(user?.role === 'DRIVER' || user?.role === 'CAB_DRIVER') ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Availability</Text>
          <Text style={styles.helperText}>Current status: {driverStatus || 'UNKNOWN'}</Text>
          <View style={styles.rowWrap}>
            {['ONLINE', 'ON_BREAK', 'OFFLINE'].map((status) => (
              <TouchableOpacity
                key={status}
                style={status === driverStatus ? styles.primaryButton : styles.secondaryButton}
                onPress={() => updateDriverStatus(status)}
              >
                <Text style={status === driverStatus ? styles.primaryButtonText : styles.secondaryButtonText}>{status.replace('_', ' ')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <TouchableOpacity style={styles.dangerButton} onPress={logout}>
        <Text style={styles.dangerButtonText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

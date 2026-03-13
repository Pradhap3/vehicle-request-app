import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { incidentApi } from '../services/api';
import { styles } from '../theme/styles';

export default function SOSScreen({ trip, socket }) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const triggerSOS = async () => {
    setSending(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      let coords = {};
      if (permission.status === 'granted') {
        const current = await Location.getCurrentPositionAsync({});
        coords = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        };
      }

      const response = await incidentApi.sos({
        ...coords,
        trip_id: trip?.id || null,
        description: description || `SOS triggered by ${user?.name || 'mobile user'}`
      });

      socket?.emit('sos_alert', {
        reporter: user?.name,
        trip_id: trip?.id || null,
        ...coords
      });

      setResult(response.data?.data || { message: 'SOS sent' });
      setDescription('');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Emergency SOS</Text>
        <Text style={styles.helperText}>
          Use only for active safety incidents. This sends a critical alert to HR, admin, and security.
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the emergency"
          multiline
          style={styles.textArea}
        />
        <TouchableOpacity style={styles.dangerButton} onPress={triggerSOS} disabled={sending}>
          <Text style={styles.dangerButtonText}>{sending ? 'Sending alert...' : 'Trigger SOS'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Current context</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Reporter</Text>
            <Text style={styles.infoValue}>{user?.name || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{user?.role || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Linked trip</Text>
            <Text style={styles.infoValue}>{trip?.trip_ref || trip?.booking_ref || 'None selected'}</Text>
          </View>
        </View>
      </View>

      {result ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Alert sent</Text>
          <Text style={styles.helperText}>{result.title || result.incident_ref || 'SOS alert created successfully.'}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { tripApiV2 } from '../services/api';
import { styles } from '../theme/styles';

async function getCurrentCoords() {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return {};
    const position = await Location.getCurrentPositionAsync({});
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
  } catch {
    return {};
  }
}

export default function TripDetailScreen({ trip, role, onBack, onTripUpdated, onOpenNavigation }) {
  const [tripData, setTripData] = useState(trip);
  const [timeline, setTimeline] = useState([]);
  const [acting, setActing] = useState(false);

  const loadTrip = useCallback(async () => {
    if (!trip?.id) return;
    const [tripResponse, timelineResponse] = await Promise.all([
      tripApiV2.getById(trip.id),
      tripApiV2.timeline(trip.id)
    ]);
    setTripData(tripResponse.data?.data || trip);
    setTimeline(timelineResponse.data?.data || []);
  }, [trip]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  const tripActions = useMemo(() => {
    if (!(role === 'DRIVER' || role === 'CAB_DRIVER')) return [];
    const status = tripData?.status;
    if (status === 'ASSIGNED') return [{ label: 'Start en route', handler: tripApiV2.enRoute }];
    if (status === 'DRIVER_EN_ROUTE') return [{ label: 'Mark arrived', handler: tripApiV2.arrived }];
    if (status === 'ARRIVED') {
      return [
        { label: 'Passenger onboard', handler: tripApiV2.pickup },
        { label: 'Mark no-show', handler: (id) => tripApiV2.noShow(id, 'Passenger unavailable') }
      ];
    }
    if (status === 'PASSENGER_ONBOARD') return [{ label: 'Start trip', handler: tripApiV2.start }];
    if (status === 'IN_PROGRESS') {
      return [
        { label: 'Complete trip', handler: tripApiV2.complete },
        { label: 'Escalate', handler: (id) => tripApiV2.escalate(id, 'Raised from mobile operations') }
      ];
    }
    return [];
  }, [role, tripData?.status]);

  const runAction = async (action) => {
    if (!tripData?.id) return;
    setActing(true);
    try {
      const coords = await getCurrentCoords();
      const response = await action.handler(tripData.id, coords);
      const updatedTrip = response.data?.data || tripData;
      setTripData(updatedTrip);
      onTripUpdated?.(updatedTrip);
      loadTrip();
    } finally {
      setActing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trip detail</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Reference</Text>
            <Text style={styles.infoValue}>{tripData?.trip_ref || tripData?.booking_ref || `Trip ${tripData?.id}`}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Passenger</Text>
            <Text style={styles.infoValue}>{tripData?.employee_name || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Driver</Text>
            <Text style={styles.infoValue}>{tripData?.driver_name || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Vehicle</Text>
            <Text style={styles.infoValue}>{tripData?.vehicle_number || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pickup</Text>
            <Text style={styles.infoValue}>{tripData?.pickup_location || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Drop</Text>
            <Text style={styles.infoValue}>{tripData?.drop_location || '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{(tripData?.status || '').replace(/_/g, ' ')}</Text>
          </View>
        </View>
        <View style={styles.rowWrap}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => onOpenNavigation?.(tripData)}>
            <Text style={styles.secondaryButtonText}>Open navigation</Text>
          </TouchableOpacity>
          {tripActions.map((action) => (
            <TouchableOpacity key={action.label} style={styles.primaryButton} onPress={() => runAction(action)} disabled={acting}>
              <Text style={styles.primaryButtonText}>{acting ? 'Updating...' : action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        {timeline.length ? timeline.map((item, index) => (
          <View key={`${item.id || item.created_at}-${index}`} style={styles.rowCard}>
            <View>
              <Text style={styles.rowTitle}>{(item.to_status || item.event_type || 'EVENT').replace(/_/g, ' ')}</Text>
              <Text style={styles.rowSubtitle}>{item.created_at ? new Date(item.created_at).toLocaleString() : 'No timestamp'}</Text>
            </View>
            <Text style={styles.statusPill}>{item.event_type || item.to_status}</Text>
          </View>
        )) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No timeline events yet.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

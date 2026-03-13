import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { tripApiV2 } from '../services/api';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { styles } from '../theme/styles';

export default function NavigationScreen({ trip, role, onBack, onSelectTrip }) {
  const [activeTrip, setActiveTrip] = useState(trip || null);
  const [trail, setTrail] = useState([]);
  const [trackingEnabled, setTrackingEnabled] = useState(role === 'DRIVER' || role === 'CAB_DRIVER');
  const [lastLocation, setLastLocation] = useState(null);

  const loadTrip = useCallback(async () => {
    if (trip?.id) {
      const [tripResponse, trailResponse] = await Promise.all([
        tripApiV2.getById(trip.id),
        tripApiV2.trail(trip.id)
      ]);
      setActiveTrip(tripResponse.data?.data || trip);
      setTrail(trailResponse.data?.data || []);
      return;
    }

    if (role === 'DRIVER' || role === 'CAB_DRIVER') {
      const response = await tripApiV2.driverToday();
      const currentTrip = (response.data?.data || []).find((item) => ['ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'PASSENGER_ONBOARD', 'IN_PROGRESS'].includes(item.status));
      if (currentTrip) {
        setActiveTrip(currentTrip);
        const trailResponse = await tripApiV2.trail(currentTrip.id);
        setTrail(trailResponse.data?.data || []);
      }
    }
  }, [role, trip]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  const onLocation = useCallback(async (coords) => {
    setLastLocation(coords);
    if (!activeTrip?.id) return;
    await tripApiV2.updateLocation({
      ...coords,
      trip_id: activeTrip.id
    });
  }, [activeTrip?.id]);

  const { locationError } = useDriverLocation((role === 'DRIVER' || role === 'CAB_DRIVER') && trackingEnabled, onLocation);

  const nextAction = useMemo(() => {
    switch (activeTrip?.status) {
      case 'ASSIGNED':
        return 'Drive to the pickup point and start en route when you depart.';
      case 'DRIVER_EN_ROUTE':
        return 'Continue to the pickup point and mark arrived on arrival.';
      case 'ARRIVED':
        return 'Confirm the passenger and mark them onboard.';
      case 'PASSENGER_ONBOARD':
        return 'Start the trip after boarding is complete.';
      case 'IN_PROGRESS':
        return 'Continue to the destination and complete the trip on drop.';
      default:
        return 'Select an active trip to begin navigation.';
    }
  }, [activeTrip?.status]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Navigation</Text>
        <Text style={styles.helperText}>{nextAction}</Text>
        {role === 'DRIVER' || role === 'CAB_DRIVER' ? (
          <TouchableOpacity style={styles.primaryButton} onPress={() => setTrackingEnabled((value) => !value)}>
            <Text style={styles.primaryButtonText}>{trackingEnabled ? 'Pause live updates' : 'Resume live updates'}</Text>
          </TouchableOpacity>
        ) : null}
        {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trip overview</Text>
        {activeTrip ? (
          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Trip</Text>
              <Text style={styles.infoValue}>{activeTrip.trip_ref || activeTrip.booking_ref || `Trip ${activeTrip.id}`}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>{(activeTrip.status || '').replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pickup</Text>
              <Text style={styles.infoValue}>{activeTrip.pickup_location || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Drop</Text>
              <Text style={styles.infoValue}>{activeTrip.drop_location || '-'}</Text>
            </View>
            <View style={styles.rowWrap}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => onSelectTrip?.(activeTrip)}>
                <Text style={styles.secondaryButtonText}>Trip detail</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No active trip available for navigation.</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Live coordinates</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Latitude</Text>
            <Text style={styles.infoValue}>{lastLocation?.latitude ?? activeTrip?.pickup_latitude ?? '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Longitude</Text>
            <Text style={styles.infoValue}>{lastLocation?.longitude ?? activeTrip?.pickup_longitude ?? '-'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent trail</Text>
        {trail.length ? trail.slice(0, 6).map((point, index) => (
          <View key={`${point.id || point.created_at}-${index}`} style={styles.rowCard}>
            <View>
              <Text style={styles.rowTitle}>{point.latitude}, {point.longitude}</Text>
              <Text style={styles.rowSubtitle}>{point.created_at ? new Date(point.created_at).toLocaleString() : 'Location update'}</Text>
            </View>
            <Text style={styles.statusPill}>{point.speed ? `${Math.round(point.speed)} km/h` : 'Tracked'}</Text>
          </View>
        )) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No route trail recorded yet.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../theme/styles';

export default function MetricCard({ label, value }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

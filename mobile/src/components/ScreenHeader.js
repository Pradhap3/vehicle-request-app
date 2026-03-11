import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { APP_NAME, ROLE_LABELS } from '../constants/app';
import { styles } from '../theme/styles';

export default function ScreenHeader({ user, onLogout, title, subtitle }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {subtitle || ROLE_LABELS[user?.role] || 'Operations'}
        </Text>
      </View>
      <TouchableOpacity onPress={onLogout} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

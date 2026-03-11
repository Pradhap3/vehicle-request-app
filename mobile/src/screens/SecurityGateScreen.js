import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { securityApi } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import MetricCard from '../components/MetricCard';
import { styles } from '../theme/styles';

export default function SecurityGateScreen() {
  const { user, logout } = useAuth();
  const [plateNumber, setPlateNumber] = useState('');
  const [gateCode, setGateCode] = useState('MAIN_GATE');
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);

  const loadLogs = async () => {
    const response = await securityApi.logs({ limit: 20 });
    setLogs(response.data?.data || []);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleScan = async () => {
    const response = await securityApi.scanVehicle({
      plate_number: plateNumber.trim().toUpperCase(),
      gate_code: gateCode,
      event_type: 'ENTRY'
    });
    setResult(response.data?.data || null);
    setPlateNumber('');
    loadLogs();
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader user={user} onLogout={logout} title="Gate Control" subtitle="Vehicle validation" />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vehicle scan</Text>
        <TextInput value={plateNumber} onChangeText={setPlateNumber} placeholder="KA01AB1234" style={styles.input} autoCapitalize="characters" />
        <TextInput value={gateCode} onChangeText={setGateCode} placeholder="MAIN_GATE" style={styles.input} />
        <TouchableOpacity style={styles.primaryButton} onPress={handleScan}>
          <Text style={styles.primaryButtonText}>Validate entry</Text>
        </TouchableOpacity>
      </View>

      {result ? (
        <>
          <View style={styles.metricGrid}>
            <MetricCard label="Passengers" value={result.manifestSummary?.totalPassengers || 0} />
            <MetricCard label="Boarded" value={result.manifestSummary?.boarded || 0} />
            <MetricCard label="Dropped" value={result.manifestSummary?.dropped || 0} />
            <MetricCard label="No-show" value={result.manifestSummary?.noShow || 0} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{result.decision}</Text>
            <Text style={styles.rowSubtitle}>{result.reason}</Text>
          </View>
        </>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent logs</Text>
        {logs.map((log) => (
          <View key={log.id} style={styles.rowCard}>
            <View>
              <Text style={styles.rowTitle}>{log.plate_number || log.cab_number || 'Vehicle'}</Text>
              <Text style={styles.rowSubtitle}>{log.gate_code} | {log.event_type}</Text>
            </View>
            <Text style={styles.statusPill}>{log.decision}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

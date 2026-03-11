import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { APP_NAME } from '../constants/app';
import { styles } from '../theme/styles';

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await login(identifier.trim(), password);
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.loginContainer}>
      <Text style={styles.brand}>{APP_NAME}</Text>
      <Text style={styles.title}>Mobile Operations</Text>
      <Text style={styles.subtitle}>Use the same credentials as the web portal.</Text>

      <TextInput
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="Email or employee ID"
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <TouchableOpacity onPress={handleSubmit} style={styles.primaryButton} disabled={submitting}>
        <Text style={styles.primaryButtonText}>{submitting ? 'Signing in...' : 'Sign in'}</Text>
      </TouchableOpacity>
    </View>
  );
}

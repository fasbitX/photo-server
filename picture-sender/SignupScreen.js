// SignupScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from './auth';

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    streetAddress: '',
    city: '',
    state: 'VT',
    zip: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [serverUrl, setServerUrl] = useState('https://text.fasbit.com');
  const [loading, setLoading] = useState(false);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignup = async () => {
    // Validation
    if (Object.values(formData).some(val => !val)) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const result = await signup(formData, serverUrl);
    setLoading(false);

    if (result.success) {
      Alert.alert(
        'Account Created!',
        'Please check your email to verify your account before logging in.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } else {
      Alert.alert('Signup Failed', result.error || 'Please try again');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Fasbit today</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://text.fasbit.com"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, styles.half]}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={formData.firstName}
              onChangeText={val => updateField('firstName', val)}
              placeholder="John"
              placeholderTextColor="#6B7280"
            />
          </View>

          <View style={[styles.inputGroup, styles.half]}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={formData.lastName}
              onChangeText={val => updateField('lastName', val)}
              placeholder="Doe"
              placeholderTextColor="#6B7280"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Street Address</Text>
          <TextInput
            style={styles.input}
            value={formData.streetAddress}
            onChangeText={val => updateField('streetAddress', val)}
            placeholder="123 Main St"
            placeholderTextColor="#6B7280"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, styles.third]}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={formData.city}
              onChangeText={val => updateField('city', val)}
              placeholder="Burlington"
              placeholderTextColor="#6B7280"
            />
          </View>

          <View style={[styles.inputGroup, styles.third]}>
            <Text style={styles.label}>State</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.state}
                onValueChange={val => updateField('state', val)}
                style={styles.picker}
                dropdownIconColor="#9CA3AF"
              >
                <Picker.Item label="VT" value="VT" />
                <Picker.Item label="NH" value="NH" />
                <Picker.Item label="NY" value="NY" />
                <Picker.Item label="MA" value="MA" />
                <Picker.Item label="CT" value="CT" />
              </Picker>
            </View>
          </View>

          <View style={[styles.inputGroup, styles.third]}>
            <Text style={styles.label}>ZIP</Text>
            <TextInput
              style={styles.input}
              value={formData.zip}
              onChangeText={val => updateField('zip', val)}
              placeholder="05401"
              placeholderTextColor="#6B7280"
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={formData.phone}
            onChangeText={val => updateField('phone', val)}
            placeholder="(802) 555-1234"
            placeholderTextColor="#6B7280"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={formData.email}
            onChangeText={val => updateField('email', val)}
            placeholder="your@email.com"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password (min 8 characters)</Text>
          <TextInput
            style={styles.input}
            value={formData.password}
            onChangeText={val => updateField('password', val)}
            placeholder="Enter password"
            placeholderTextColor="#6B7280"
            secureTextEntry
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={formData.confirmPassword}
            onChangeText={val => updateField('confirmPassword', val)}
            placeholder="Re-enter password"
            placeholderTextColor="#6B7280"
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkTextBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#111827',
    padding: 16,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#030712',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  third: {
    flex: 1,
  },
  pickerContainer: {
    backgroundColor: '#030712',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    color: '#FFFFFF',
    height: 48,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  linkTextBold: {
    color: '#2563EB',
    fontWeight: '600',
  },
});
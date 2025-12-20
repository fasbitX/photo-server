// SignupScreen.js
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from './auth';
import { SERVER_HOST, SERVER_PORT, USE_HTTPS } from './config';

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
    gender: '',
    dobMonth: '',
    dobDay: '',
    dobYear: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  // Refs for tab navigation (web only)
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const streetAddressRef = useRef(null);
  const cityRef = useRef(null);
  const zipRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const dobMonthRef = useRef(null);
  const dobDayRef = useRef(null);
  const dobYearRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  // Build server URL from config
  const serverUrl = USE_HTTPS
    ? `https://${SERVER_HOST}${SERVER_PORT === '443' ? '' : `:${SERVER_PORT}`}`
    : `http://${SERVER_HOST}${SERVER_PORT === '80' ? '' : `:${SERVER_PORT}`}`;

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignup = async () => {
    // Validation
    const requiredFields = [
      'firstName',
      'lastName',
      'streetAddress',
      'city',
      'state',
      'zip',
      'phone',
      'email',
      'gender',
      'dobMonth',
      'dobDay',
      'dobYear',
      'password',
      'confirmPassword',
    ];

    const missingFields = requiredFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
      Alert.alert('Error', 'Please fill in all required fields');
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

    // Validate individual date components
    const month = parseInt(formData.dobMonth, 10);
    const day = parseInt(formData.dobDay, 10);
    const year = parseInt(formData.dobYear, 10);

    if (isNaN(month) || month < 1 || month > 12) {
      Alert.alert('Error', 'Month must be between 1 and 12');
      return;
    }

    if (isNaN(day) || day < 1 || day > 31) {
      Alert.alert('Error', 'Day must be between 1 and 31');
      return;
    }

    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < 1900 || year > currentYear) {
      Alert.alert('Error', `Year must be between 1900 and ${currentYear}`);
      return;
    }

    // Format as MM/DD/YYYY with zero-padding
    const dateOfBirth = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;

    // Validate the constructed date is valid
    const testDate = new Date(year, month - 1, day);
    if (
      testDate.getFullYear() !== year ||
      testDate.getMonth() !== month - 1 ||
      testDate.getDate() !== day
    ) {
      Alert.alert('Error', 'Invalid date - please check month and day');
      return;
    }

    setLoading(true);
    const signupData = {
      ...formData,
      dateOfBirth,
    };
    const result = await signup(signupData, serverUrl);
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

        <View style={styles.row}>
          <View style={[styles.inputGroup, styles.half]}>
            <Text style={styles.label}>
              First Name<Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              ref={firstNameRef}
              style={styles.input}
              value={formData.firstName}
              onChangeText={val => updateField('firstName', val)}
              placeholder="John"
              placeholderTextColor="#6B7280"
              textContentType="givenName"
              autoComplete="name-given"
              onSubmitEditing={() => lastNameRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View style={[styles.inputGroup, styles.half]}>
            <Text style={styles.label}>
              Last Name<Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              ref={lastNameRef}
              style={styles.input}
              value={formData.lastName}
              onChangeText={val => updateField('lastName', val)}
              placeholder="Doe"
              placeholderTextColor="#6B7280"
              textContentType="familyName"
              autoComplete="name-family"
              onSubmitEditing={() => streetAddressRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Street Address<Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            ref={streetAddressRef}
            style={styles.input}
            value={formData.streetAddress}
            onChangeText={val => updateField('streetAddress', val)}
            placeholder="123 Main St"
            placeholderTextColor="#6B7280"
            textContentType="streetAddressLine1"
            autoComplete="street-address"
            onSubmitEditing={() => cityRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, styles.third]}>
            <Text style={styles.label}>
              City<Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              ref={cityRef}
              style={styles.input}
              value={formData.city}
              onChangeText={val => updateField('city', val)}
              placeholder="Burlington"
              placeholderTextColor="#6B7280"
              textContentType="addressCity"
              autoComplete="postal-address-locality"
              onSubmitEditing={() => zipRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View style={[styles.inputGroup, styles.third]}>
            <Text style={styles.label}>
              State<Text style={styles.required}>*</Text>
            </Text>
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
                <Picker.Item label="AL" value="AL" />
                <Picker.Item label="AK" value="AK" />
                <Picker.Item label="AZ" value="AZ" />
                <Picker.Item label="AR" value="AR" />
                <Picker.Item label="CA" value="CA" />
                <Picker.Item label="CO" value="CO" />
                <Picker.Item label="DE" value="DE" />
                <Picker.Item label="FL" value="FL" />
                <Picker.Item label="GA" value="GA" />
                <Picker.Item label="HI" value="HI" />
                <Picker.Item label="ID" value="ID" />
                <Picker.Item label="IL" value="IL" />
                <Picker.Item label="IN" value="IN" />
                <Picker.Item label="IA" value="IA" />
                <Picker.Item label="KS" value="KS" />
                <Picker.Item label="KY" value="KY" />
                <Picker.Item label="LA" value="LA" />
                <Picker.Item label="ME" value="ME" />
                <Picker.Item label="MD" value="MD" />
                <Picker.Item label="MI" value="MI" />
                <Picker.Item label="MN" value="MN" />
                <Picker.Item label="MS" value="MS" />
                <Picker.Item label="MO" value="MO" />
                <Picker.Item label="MT" value="MT" />
                <Picker.Item label="NE" value="NE" />
                <Picker.Item label="NV" value="NV" />
                <Picker.Item label="NJ" value="NJ" />
                <Picker.Item label="NM" value="NM" />
                <Picker.Item label="NC" value="NC" />
                <Picker.Item label="ND" value="ND" />
                <Picker.Item label="OH" value="OH" />
                <Picker.Item label="OK" value="OK" />
                <Picker.Item label="OR" value="OR" />
                <Picker.Item label="PA" value="PA" />
                <Picker.Item label="RI" value="RI" />
                <Picker.Item label="SC" value="SC" />
                <Picker.Item label="SD" value="SD" />
                <Picker.Item label="TN" value="TN" />
                <Picker.Item label="TX" value="TX" />
                <Picker.Item label="UT" value="UT" />
                <Picker.Item label="VA" value="VA" />
                <Picker.Item label="WA" value="WA" />
                <Picker.Item label="WV" value="WV" />
                <Picker.Item label="WI" value="WI" />
                <Picker.Item label="WY" value="WY" />
              </Picker>
            </View>
          </View>

          <View style={[styles.inputGroup, styles.third]}>
            <Text style={styles.label}>
              ZIP<Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              ref={zipRef}
              style={styles.input}
              value={formData.zip}
              onChangeText={val => updateField('zip', val)}
              placeholder="05401"
              placeholderTextColor="#6B7280"
              keyboardType="numeric"
              maxLength={5}
              textContentType="postalCode"
              autoComplete="postal-code"
              onSubmitEditing={() => phoneRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Phone Number<Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            ref={phoneRef}
            style={styles.input}
            value={formData.phone}
            onChangeText={val => updateField('phone', val)}
            placeholder="(802) 555-1234"
            placeholderTextColor="#6B7280"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            onSubmitEditing={() => emailRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Email<Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            ref={emailRef}
            style={styles.input}
            value={formData.email}
            onChangeText={val => updateField('email', val)}
            placeholder="john.doe@example.com"
            placeholderTextColor="#6B7280"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
            onSubmitEditing={() => dobMonthRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Gender<Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={formData.gender}
              onValueChange={val => updateField('gender', val)}
              style={styles.picker}
              dropdownIconColor="#9CA3AF"
            >
              <Picker.Item label="Select Gender" value="" />
              <Picker.Item label="Male" value="male" />
              <Picker.Item label="Female" value="female" />
              <Picker.Item label="Other" value="other" />
              <Picker.Item label="Prefer not to say" value="prefer-not-to-say" />
            </Picker>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Date of Birth<Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.row}>
            <View style={styles.dateInputWrapper}>
              <TextInput
                ref={dobMonthRef}
                style={styles.input}
                value={formData.dobMonth}
                onChangeText={val => {
                  if (val.length <= 2) {
                    updateField('dobMonth', val.replace(/[^0-9]/g, ''));
                    if (val.length === 2) {
                      dobDayRef.current?.focus();
                    }
                  }
                }}
                placeholder="MM"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                maxLength={2}
                onSubmitEditing={() => dobDayRef.current?.focus()}
                blurOnSubmit={false}
              />
              <Text style={styles.dateLabel}>Month</Text>
            </View>

            <View style={styles.dateInputWrapper}>
              <TextInput
                ref={dobDayRef}
                style={styles.input}
                value={formData.dobDay}
                onChangeText={val => {
                  if (val.length <= 2) {
                    updateField('dobDay', val.replace(/[^0-9]/g, ''));
                    if (val.length === 2) {
                      dobYearRef.current?.focus();
                    }
                  }
                }}
                placeholder="DD"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                maxLength={2}
                onSubmitEditing={() => dobYearRef.current?.focus()}
                blurOnSubmit={false}
              />
              <Text style={styles.dateLabel}>Day</Text>
            </View>

            <View style={styles.dateInputWrapper}>
              <TextInput
                ref={dobYearRef}
                style={styles.input}
                value={formData.dobYear}
                onChangeText={val => {
                  if (val.length <= 4) {
                    updateField('dobYear', val.replace(/[^0-9]/g, ''));
                  }
                }}
                placeholder="YYYY"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                maxLength={4}
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
              />
              <Text style={styles.dateLabel}>Year</Text>
            </View>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Password (min 8 characters)<Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            ref={passwordRef}
            style={styles.input}
            value={formData.password}
            onChangeText={val => updateField('password', val)}
            placeholder="Enter password"
            placeholderTextColor="#6B7280"
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
            passwordRules="minlength: 8;"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Confirm Password<Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            ref={confirmPasswordRef}
            style={styles.input}
            value={formData.confirmPassword}
            onChangeText={val => updateField('confirmPassword', val)}
            placeholder="Re-enter password"
            placeholderTextColor="#6B7280"
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
            onSubmitEditing={handleSignup}
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
    alignItems: 'center', // Center the card
  },
  card: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F2937',
    width: '100%',
    maxWidth: 400, // ADDED: Max width of 400px (4 inches)
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
  required: {
    color: '#DC2626',
    fontSize: 14,
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
  dateInputWrapper: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  pickerContainer: {
    backgroundColor: '#030712',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  picker: {
    color: '#FFFFFF',
    height: 48,
    ...Platform.select({
      web: {
        paddingLeft: 8,
        paddingRight: 8,
      },
      default: {},
    }),
  },
  pickerItem: {
    fontSize: 16,
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
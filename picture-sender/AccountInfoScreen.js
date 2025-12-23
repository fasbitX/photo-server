// AccountInfoScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 300; // sets the maximum width of the screen

// --- Date helpers (robust + no timezone drift for date-only values) ---

function formatDateJoined(value) {
  // Accepts: epoch ms (number/string) OR ISO string
  if (!value) return 'N/A';

  let date;
  if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    // numeric epoch string?
    if (/^\d+$/.test(trimmed)) {
      date = new Date(Number(trimmed));
    } else {
      date = new Date(trimmed);
    }
  } else {
    return 'N/A';
  }

  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function mmddyyyyToIso(mmddyyyy) {
  const s = String(mmddyyyy || '').trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const mm = String(m[1]).padStart(2, '0');
  const dd = String(m[2]).padStart(2, '0');
  const yyyy = m[3];

  // basic range checks (keeps MVP simple, blocks obvious junk)
  const monthNum = Number(mm);
  const dayNum = Number(dd);
  const yearNum = Number(yyyy);
  if (monthNum < 1 || monthNum > 12) return null;
  if (dayNum < 1 || dayNum > 31) return null;
  if (yearNum < 1900 || yearNum > 2100) return null;

  return `${yyyy}-${mm}-${dd}`;
}

function isoToMmddyyyy(isoLike) {
  // Accepts: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS..." etc.
  const s = String(isoLike || '').trim();
  if (!s) return '';

  const d = s.slice(0, 10); // take date portion
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';

  const yyyy = m[1];
  const mm = String(Number(m[2])); // remove leading zero in UI
  const dd = String(Number(m[3]));

  return `${mm}/${dd}/${yyyy}`;
}

export default function AccountInfoScreen({ navigation }) {
  const { user, serverUrl, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userName, setUserName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(''); // UI shows MM/DD/YYYY
  const [timezone, setTimezone] = useState('');

  // Load user data into form
  useEffect(() => {
    if (!user) return;

    setFirstName(user.first_name || '');
    setLastName(user.last_name || '');
    setUserName(user.user_name || '');
    setStreetAddress(user.street_address || '');
    setCity(user.city || '');
    setState(user.state || '');
    setZip(user.zip || '');
    setPhone(user.phone || '');
    setGender(user.gender || '');
    setDateOfBirth(isoToMmddyyyy(user.date_of_birth)); // ✅ ISO -> MM/DD/YYYY (safe)
    setTimezone(user.timezone || '');
  }, [user]);

  const handleSave = async () => {
    if (!user?.id || !serverUrl) return;

    // Validate required fields
    if (!firstName.trim() || !lastName.trim() || !userName.trim()) {
      Alert.alert('Error', 'First name, last name, and username are required.');
      return;
    }

    if (!streetAddress.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      Alert.alert('Error', 'Complete address is required.');
      return;
    }

    if (!phone.trim()) {
      Alert.alert('Error', 'Phone number is required.');
      return;
    }

    // Validate username format
    if (!/^@[a-zA-Z0-9_#$%^&*()\-+=.]{1,20}$/.test(userName.trim())) {
      Alert.alert('Error', 'Username must start with @ and contain valid characters.');
      return;
    }

    // ✅ DOB: keep UI as MM/DD/YYYY, but send ISO to backend
    const dobInput = dateOfBirth.trim();
    const dobIso = dobInput ? mmddyyyyToIso(dobInput) : null;
    if (dobInput && !dobIso) {
      Alert.alert('Error', 'Date of Birth must be in MM/DD/YYYY format.');
      return;
    }

    setSaving(true);

    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/user/update`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          user_name: userName.trim(),
          street_address: streetAddress.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          phone: phone.trim(),
          gender: gender.trim() || null,
          date_of_birth: dobIso, // ✅ send ISO (YYYY-MM-DD) or null
          timezone: timezone.trim() || 'America/New_York',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Update failed');
      }

      await refreshUser?.();
      setEditing(false);
      Alert.alert('Saved', 'Account information updated successfully.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update account information.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!user) return;

    setFirstName(user.first_name || '');
    setLastName(user.last_name || '');
    setUserName(user.user_name || '');
    setStreetAddress(user.street_address || '');
    setCity(user.city || '');
    setState(user.state || '');
    setZip(user.zip || '');
    setPhone(user.phone || '');
    setGender(user.gender || '');
    setDateOfBirth(isoToMmddyyyy(user.date_of_birth)); // ✅ reset using safe formatter
    setTimezone(user.timezone || '');
    setEditing(false);
  };

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 64 : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={styles.outerContainer}>
        <View style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.headerIconBtn}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={26} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Account Info</Text>

            {editing ? (
              <TouchableOpacity onPress={handleCancel} style={styles.headerTextBtn} activeOpacity={0.6}>
                <Text style={styles.headerBtnText}>Cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} style={styles.headerTextBtn} activeOpacity={0.6}>
                <Text style={styles.headerBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Read-only fields */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Account Details</Text>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Account #</Text>
                <Text style={styles.value}>{user?.account_number || 'N/A'}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {user?.email || 'N/A'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Status</Text>
                <Text style={[styles.value, styles.statusActive]}>{user?.status || 'active'}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>Date Joined</Text>
                <Text style={styles.value}>{formatDateJoined(user?.created_date)}</Text>
              </View>
            </View>

            {/* Editable fields */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Personal Information</Text>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>First Name *</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="First Name"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Last Name *</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="Last Name"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Username *</Text>
                <TextInput
                  value={userName}
                  onChangeText={setUserName}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="@username"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Phone *</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="Phone"
                  placeholderTextColor="#6B7280"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <TextInput
                  value={gender}
                  onChangeText={setGender}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="Gender (optional)"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Date of Birth</Text>
                <TextInput
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>

            {/* Address */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Address</Text>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Street Address *</Text>
                <TextInput
                  value={streetAddress}
                  onChangeText={setStreetAddress}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="Street Address"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>City *</Text>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="City"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>State *</Text>
                <TextInput
                  value={state}
                  onChangeText={setState}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="State (2 letters)"
                  placeholderTextColor="#6B7280"
                  maxLength={2}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>ZIP Code *</Text>
                <TextInput
                  value={zip}
                  onChangeText={setZip}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="ZIP"
                  placeholderTextColor="#6B7280"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Settings */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Settings</Text>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Timezone</Text>
                <TextInput
                  value={timezone}
                  onChangeText={setTimezone}
                  style={[styles.input, !editing && styles.inputDisabled]}
                  editable={editing}
                  placeholder="America/New_York"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>

            {editing && (
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_WIDTH,
    backgroundColor: '#111827',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerIconBtn: {
    padding: 12,
    marginLeft: -12,
  },
  headerTextBtn: {
    padding: 12,
    marginRight: -12,
  },
  headerBtnText: {
    color: '#93C5FD',
    fontSize: 16,
    fontWeight: '600',
  },

  content: {
    padding: 16,
  },

  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  value: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },
  statusActive: {
    color: '#10B981',
    textTransform: 'capitalize',
  },

  fieldRow: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  inputDisabled: {
    backgroundColor: '#030712',
    borderColor: '#111827',
    color: '#9CA3AF',
  },

  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    backgroundColor: '#4B5563',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

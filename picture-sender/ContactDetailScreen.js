// ContactDetailScreen.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth';

const MAX_WIDTH = 288; // 4 inches at ~72 DPI

function safeServerBase(serverUrl) {
  return String(serverUrl || '').replace(/\/+$/, '');
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json && json.error ? json.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export default function ContactDetailScreen({ navigation, route }) {
  const { user, serverUrl } = useAuth();
  const base = safeServerBase(serverUrl);

  const contact = route?.params?.contact || null;
  const isSaved = !!route?.params?.isSaved;

  const [saving, setSaving] = useState(false);

  const displayName = useMemo(() => {
    if (!contact) return 'Contact';
    const name =
      (contact.nickname && String(contact.nickname).trim()) ||
      `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
      (contact.user_name ? String(contact.user_name).replace(/^@/, '') : '') ||
      'Contact';
    return name;
  }, [contact]);

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(`${title}: ${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const handleSave = async () => {
    if (!contact?.id) return;
    if (!base) {
      notify('Server not set', 'Tap the gear icon and set your server URL first.');
      return;
    }
    if (!user?.id) return;

    try {
      setSaving(true);
      await postJson(`${base}/api/mobile/contacts/add`, {
        requesterId: user.id,
        contactUserId: contact.id,
      });
      notify('Added', `Contact ${displayName} added to saved list.`);
      // When going back, Contacts screen will refresh via focus effect.
      navigation.goBack();
    } catch (err) {
      notify('Add contact', `Failed: ${String(err.message || err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!contact) {
    return (
      <View style={styles.outer}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerBtn} />
            <Text style={styles.headerTitle}>Contact</Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.headerBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
          <View style={styles.center}>
            <Text style={styles.centerText}>No contact selected.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerBtn} />

          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayName}
          </Text>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color="#E5E7EB" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Card */}
          <View style={styles.card}>
            <Field label="Username" value={contact.user_name || ''} />
            <Field label="Email" value={contact.email || ''} />
            <Field label="Phone" value={contact.phone || ''} />

            {/* Optional address fields if present */}
            <Field label="Street" value={contact.street_address || ''} />
            <Field label="City" value={contact.city || ''} />
            <Field label="State" value={contact.state || ''} />
            <Field label="ZIP" value={contact.zip || ''} />

            {!!contact.account_number && (
              <Field label="Account #" value={contact.account_number} />
            )}
          </View>

          {!isSaved && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Save Contact</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {isSaved && (
            <Text style={styles.savedHint}>This contact is already in your saved list.</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
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
    height: 64,
    paddingHorizontal: 16,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },

  scroll: { padding: 16, paddingBottom: 28 },

  card: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
  },
  field: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111827' },
  fieldLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '800' },
  fieldValue: { color: '#FFFFFF', fontSize: 14, marginTop: 6 },

  saveBtn: {
    marginTop: 14,
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '900' },

  savedHint: { marginTop: 12, color: '#6B7280', textAlign: 'center', fontSize: 12 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: '#9CA3AF', textAlign: 'center' },
});
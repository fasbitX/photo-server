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

const MAX_WIDTH = 300; // sets the maximum width of the screen

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

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(`${title}: ${message}`);
    return;
  }
  Alert.alert(title, message);
}

function confirmWebOrAlert(title, message, onYes) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
    const ok = window.confirm(message);
    if (ok) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onYes },
  ]);
}

export default function ContactDetailScreen({ navigation, route }) {
  const { user, serverUrl } = useAuth();
  const base = safeServerBase(serverUrl);

  const contact = route?.params?.contact || null;
  const isSaved = !!route?.params?.isSaved;

  const [working, setWorking] = useState(false);

  const fullName = useMemo(() => {
    if (!contact) return '';
    const fn = String(contact.first_name || '').trim();
    const ln = String(contact.last_name || '').trim();
    return `${fn} ${ln}`.trim();
  }, [contact]);

  const displayName = useMemo(() => {
    if (!contact) return 'Contact';
    // Prefer First/Last, fallback to nickname, then username
    if (fullName) return fullName;

    const nick = (contact.nickname && String(contact.nickname).trim()) || '';
    if (nick) return nick;

    const uname = contact.user_name ? String(contact.user_name).replace(/^@/, '') : '';
    return uname || 'Contact';
  }, [contact, fullName]);

  const headerUsername = useMemo(() => {
    if (!contact?.user_name) return '';
    return String(contact.user_name).startsWith('@') ? contact.user_name : `@${contact.user_name}`;
  }, [contact]);

  const handleSave = async () => {
    if (!contact?.id) return;
    if (!base) {
      notify('Server not set', 'Set your server URL first.');
      return;
    }
    if (!user?.id) return;

    try {
      setWorking(true);
      await postJson(`${base}/api/mobile/contacts/add`, {
        requesterId: user.id,
        contactUserId: contact.id,
      });
      notify('Added', `Contact ${displayName} added to saved list.`);
      navigation.goBack();
    } catch (err) {
      notify('Add contact', `Failed: ${String(err.message || err)}`);
    } finally {
      setWorking(false);
    }
  };

  const doRemove = async () => {
    if (!contact?.id) return;
    if (!base) return;
    if (!user?.id) return;

    try {
      setWorking(true);
      await postJson(`${base}/api/mobile/contacts/remove`, {
        requesterId: user.id,
        contactUserId: contact.id,
      });
      notify('Removed', `Contact ${displayName} removed from saved list.`);
      navigation.goBack();
    } catch (err) {
      notify('Remove contact', `Failed: ${String(err.message || err)}`);
    } finally {
      setWorking(false);
    }
  };

  const handleRemove = () => {
    confirmWebOrAlert('Remove contact', `Remove ${displayName} from your saved list?`, doRemove);
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
          <Text style={styles.headerTitle} numberOfLines={1}>Contact</Text>
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
            {/* Put first/last name here in the card */}
            <Text style={styles.cardName}>{displayName}</Text>
            {!!headerUsername && <Text style={styles.cardSub}>{headerUsername}</Text>}
            <View style={styles.divider} />

            <Field label="Username" value={headerUsername} />
            <Field label="Email" value={contact.email || ''} />
            <Field label="Phone" value={contact.phone || ''} />

            {/* Optional address fields if present */}
            <Field label="Street" value={contact.street_address || ''} />
            <Field label="City" value={contact.city || ''} />
            <Field label="State" value={contact.state || ''} />
            <Field label="ZIP" value={contact.zip || ''} />

            {!!contact.account_number && <Field label="Account #" value={contact.account_number} />}
          </View>

          {!isSaved ? (
            <TouchableOpacity
              style={[styles.primaryBtn, working && styles.btnDisabled]}
              onPress={handleSave}
              disabled={working}
            >
              {working ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Save Contact</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.iconDangerBtn, working && styles.btnDisabled]}
              onPress={handleRemove}
              disabled={working}
              {...(Platform.OS === 'web' ? { title: 'Delete from Contact List' } : {})}
            >
              {working ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.trashIconWrap}>
                  <Ionicons name="trash-outline" size={22} color="#FFFFFF" style={styles.trashIconBack} />
                  <Ionicons name="trash-outline" size={20} color="#EF4444" style={styles.trashIconFront} />
                </View>
              )}
            </TouchableOpacity>
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
  cardName: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  cardSub: { color: '#9CA3AF', fontSize: 12, marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#111827', marginBottom: 8 },

  field: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111827' },
  fieldLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '800' },
  fieldValue: { color: '#FFFFFF', fontSize: 14, marginTop: 6 },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900' },

  iconDangerBtn: {
    marginTop: 14,
    width: 62,
    height: 50,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },

  trashIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIconBack: {
    position: 'absolute',
  },
  trashIconFront: {
    position: 'absolute',
  },

  btnDisabled: { opacity: 0.6 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: '#9CA3AF', textAlign: 'center' },
});
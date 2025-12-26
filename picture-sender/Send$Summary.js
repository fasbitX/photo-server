// Send$Summary.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 300;

// Web "6 inch" viewport approximation (CSS px)
const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 576px

function safeServerBase(serverUrl) {
  return String(serverUrl || '').replace(/\/+$/, '');
}

async function postJson(url, body, authToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
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

function formatHandle(userName) {
  const s = String(userName || '').trim();
  if (!s) return '';
  return s.startsWith('@') ? s : `@${s}`;
}

function displayNameFromUser(u) {
  return (
    `${u?.first_name || ''} ${u?.last_name || ''}`.trim() ||
    (u?.user_name ? String(u.user_name).replace(/^@/, '') : '') ||
    'User'
  );
}

function dollars(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '$0.00';
  return `$${x.toFixed(2)}`;
}

export default function Send$Summary({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, authToken, serverUrl } = useAuth();

  const base = safeServerBase(serverUrl);

  const recipient = route?.params?.recipient || null;
  const amount = Number(route?.params?.amount || 0);
  const senderBalance = Number(route?.params?.senderBalance || user?.account_balance || 0);
  const projectedBalance = Number(route?.params?.projectedBalance || (senderBalance - amount));

  const [busy, setBusy] = useState(false);

  const invariantText = useMemo(() => {
    return 'Note: This transfer decreases your balance and increases the recipient’s balance by the same amount — the total sum of all balances in the ecosystem remains unchanged.';
  }, []);

  const confirm = async () => {
    if (!recipient?.id || !(amount > 0)) {
      Alert.alert('Send$', 'Missing recipient or amount.');
      return;
    }
    if (!base || !authToken) {
      Alert.alert('Send$', 'Not logged in.');
      return;
    }

    setBusy(true);
    try {
      const out = await postJson(
        `${base}/api/mobile/transfers/send`,
        { recipientId: recipient.id, amount },
        authToken
      );

      // Best-effort: show updated sender balance returned by server
      const newBal = out?.senderNewBalance;
      Alert.alert('Send$', `Transfer complete.\nNew balance: ${dollars(newBal)}`);

      // Navigate back (Dashboard usually refetches user)
      navigation.popToTop?.();
      navigation.navigate('Dashboard', { refresh: Date.now() });
    } catch (err) {
      Alert.alert('Send$', `Failed: ${String(err.message || err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.phoneFrame}>
        <View style={styles.container}>
          {/* Standard Header */}
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={styles.topBarRow}>
              <Text style={styles.topBarTitle}>./fasbit</Text>

              <TouchableOpacity
                style={styles.topBarMenuBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Settings')}
              >
                <Ionicons name="menu" size={22} color="#E5E7EB" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.content}>
            <Text style={styles.screenTitle}>Confirm Send</Text>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>From</Text>
              <Text style={styles.valueLine}>
                {formatHandle(user?.user_name) || displayNameFromUser(user)}
              </Text>

              <View style={{ height: 10 }} />

              <Text style={styles.cardLabel}>To</Text>
              <Text style={styles.valueLine}>
                {formatHandle(recipient?.user_name) || displayNameFromUser(recipient)}
              </Text>

              <View style={{ height: 10 }} />

              <Text style={styles.cardLabel}>Amount</Text>
              <Text style={styles.bigValue}>{dollars(amount)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Balance</Text>
              <Text style={styles.valueLine}>Now: {dollars(senderBalance)}</Text>
              <Text style={styles.valueLine}>After: {dollars(projectedBalance)}</Text>
            </View>

            <Text style={styles.note}>{invariantText}</Text>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                activeOpacity={0.9}
                disabled={busy}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, busy ? styles.btnDisabled : null]}
                activeOpacity={0.9}
                disabled={busy}
                onPress={confirm}
              >
                {busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.btnPrimaryText}>Confirm Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: Platform.select({
    web: {
      flex: 1,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingVertical: 16,
    },
    default: {
      flex: 1,
      backgroundColor: '#111827',
      alignItems: 'stretch',
      justifyContent: 'flex-start',
      paddingVertical: 0,
    },
  }),

  phoneFrame: Platform.select({
    web: {
      width: '100%',
      maxWidth: MAX_WIDTH,
      height: PHONE_HEIGHT_PX,
      overflow: 'hidden',
      backgroundColor: '#111827',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#1F2937',
      boxShadow: '0px 10px 30px rgba(0,0,0,0.45)',
    },
    default: {
      flex: 1,
      width: '100%',
      backgroundColor: '#111827',
    },
  }),

  container: { flex: 1, width: '100%', backgroundColor: '#111827' },

  topBar: { paddingHorizontal: 16, paddingBottom: 6, backgroundColor: 'transparent' },

  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  topBarTitle: { color: '#E5E7EB', fontSize: 16, fontWeight: '800' },

  topBarMenuBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },

  content: { padding: 16, paddingTop: 12 },

  screenTitle: { color: '#E5E7EB', fontSize: 18, fontWeight: '800', marginBottom: 10 },

  card: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },

  cardLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  valueLine: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  bigValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },

  note: { color: '#6B7280', fontSize: 12, marginTop: 4, marginBottom: 12 },

  btnRow: { flexDirection: 'row', gap: 10 },

  btn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  btnGhostText: { color: '#E5E7EB', fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },

  btnPrimary: { backgroundColor: '#2563EB' },

  btnPrimaryText: { color: '#FFFFFF', fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },

  btnDisabled: { opacity: 0.6 },
});

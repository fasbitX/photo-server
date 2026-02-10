// Send$Summary.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
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

/**
 * ✅ Private media URL (token in query) so <Image> can load protected uploads.
 * - If `path` is already http(s), returns as-is.
 * - If missing base/token/path, returns ''.
 */
function resolvePrivateMediaUrl(serverBase, authToken, pathLike) {
  const base = safeServerBase(serverBase);
  const token = String(authToken || '').trim();
  const raw = String(pathLike || '').trim();

  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  if (!base || !token) return '';

  const cleanPath = raw.replace(/^\/+/, '');
  return `${base}/api/mobile/media?path=${encodeURIComponent(cleanPath)}&token=${encodeURIComponent(token)}`;
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
    (u?.nickname && String(u.nickname).trim()) ||
    `${u?.first_name || ''} ${u?.last_name || ''}`.trim() ||
    (u?.user_name ? String(u.user_name).replace(/^@/, '') : '') ||
    'User'
  );
}

function initialsFromUser(u) {
  const first = String(u?.first_name || '').trim();
  const last = String(u?.last_name || '').trim();
  const handle = String(u?.user_name || '').replace(/^@/, '').trim();

  const a = (first[0] || handle[0] || 'U').toUpperCase();
  const b = (last[0] || handle[1] || '').toUpperCase();
  return `${a}${b}`.trim();
}

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dollars(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '$ 0.00';
  return `$ ${nf.format(x)}`;
}

export default function Send$Summary({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, authToken, serverUrl } = useAuth();
  const base = safeServerBase(serverUrl);

  // ✅ hide scrollbars on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'fasbit-hide-scrollbars';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .fasbit-no-scrollbar::-webkit-scrollbar { width: 0px; height: 0px; }
      .fasbit-no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
    `;
    document.head.appendChild(style);
  }, []);

  const recipient = route?.params?.recipient || null;
  const amount = Number(route?.params?.amount || 0);
  const senderBalance = Number(route?.params?.senderBalance || user?.account_balance || 0);
  const projectedBalance = Number(route?.params?.projectedBalance || (senderBalance - amount));

  // ✅ FIX: use private media URL (matches Dashboard/TextScreen behavior)
  const recipAvatarUrl = useMemo(
    () =>
      resolvePrivateMediaUrl(
        base,
        authToken,
        recipient?.avatar_path || recipient?.avatarPath || recipient?.avatar_url || recipient?.avatarUrl || ''
      ),
    [
      base,
      authToken,
      recipient?.avatar_path,
      recipient?.avatarPath,
      recipient?.avatar_url,
      recipient?.avatarUrl,
    ]
  );

  const [busy, setBusy] = useState(false);

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

      Alert.alert('Send$', `Transfer complete.\nNew balance: ${dollars(out?.senderNewBalance)}`);
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
      <View style={styles.phoneFrame} className="fasbit-no-scrollbar">
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

            {/* ✅ Recipient with avatar, one-line */}
            <View style={styles.card}>
              <View style={styles.rowLine}>
                <Text style={styles.label}>Send To</Text>

                <View style={styles.inlineRight}>
                  <View style={styles.avatarSm}>
                    {recipAvatarUrl ? (
                      <Image source={{ uri: recipAvatarUrl }} style={styles.avatarSmImg} />
                    ) : (
                      <Text style={styles.avatarSmText}>{initialsFromUser(recipient)}</Text>
                    )}
                  </View>

                  <Text style={styles.inlineText} numberOfLines={1}>
                    {displayNameFromUser(recipient)}
                    {recipient?.user_name ? `  ${formatHandle(recipient.user_name)}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.rowLine}>
                <Text style={styles.label}>Amount</Text>
                <Text style={styles.value}>{dollars(amount)}</Text>
              </View>
            </View>

            {/* ✅ balances one-line */}
            <View style={styles.card}>
              <View style={styles.rowLine}>
                <Text style={styles.label}>Balance Now</Text>
                <Text style={styles.value}>{dollars(senderBalance)}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.label}>After Sending</Text>
                <Text style={styles.value}>{dollars(projectedBalance)}</Text>
              </View>
            </View>

            <Text style={styles.note}>
              Note: This transfer decreases your balance and increases the recipient’s balance by the same amount — the
              total sum of all balances remains unchanged.
            </Text>

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
                {busy ? <ActivityIndicator /> : <Text style={styles.btnPrimaryText}>Confirm Send</Text>}
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
    default: { flex: 1, width: '100%', backgroundColor: '#111827' },
  }),

  container: { flex: 1, width: '100%', backgroundColor: '#111827' },

  topBar: { paddingHorizontal: 16, paddingBottom: 6, backgroundColor: 'transparent' },

  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  topBarTitle: { color: '#E5E7EB', fontSize: 16, fontWeight: '800' },

  topBarMenuBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  content: { padding: 16, paddingTop: 12 },

  screenTitle: { color: '#E5E7EB', fontSize: 18, fontWeight: '800', marginBottom: 10 },

  card: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },

  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
  },

  label: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  value: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  divider: { height: 1, backgroundColor: '#1F2937', marginVertical: 6 },

  inlineRight: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },

  inlineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    maxWidth: '75%',
    textAlign: 'right',
  },

  avatarSm: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  avatarSmImg: { width: 28, height: 28, resizeMode: 'cover' },

  avatarSmText: { color: '#E5E7EB', fontSize: 11, fontWeight: '900' },

  note: { color: '#6B7280', fontSize: 12, marginTop: 4, marginBottom: 12 },

  btnRow: { flexDirection: 'row', gap: 10 },

  btn: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },

  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#1F2937' },

  btnGhostText: { color: '#E5E7EB', fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },

  btnPrimary: { backgroundColor: '#2563EB' },

  btnPrimaryText: { color: '#FFFFFF', fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },

  btnDisabled: { opacity: 0.6 },
});

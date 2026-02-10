// Send$Screen.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 300;

// Web "6 inch" viewport approximation (CSS px)
const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 576px

// ✅ fasbit green (swap if you have exact hex)
const FASBIT_GREEN = '#22C55E';

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

  // remove leading slashes
  const cleanPath = raw.replace(/^\/+/, '');

  return `${base}/api/mobile/media?path=${encodeURIComponent(cleanPath)}&token=${encodeURIComponent(token)}`;
}

async function postJson(url, body, signal, authToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
    signal,
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

function parseMoney(text) {
  const raw = String(text || '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = Number.parseFloat(cleaned);
  return Number.isFinite(val) ? val : 0;
}

function matchesSavedContact(u, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;

  const name = displayNameFromUser(u).toLowerCase();
  const handle = String(u?.user_name || '').toLowerCase();
  const email = String(u?.email || '').toLowerCase();
  const phone = String(u?.phone || '').toLowerCase();

  return (
    name.includes(s) ||
    handle.includes(s) ||
    handle.replace(/^@/, '').includes(s.replace(/^@/, '')) ||
    email.includes(s) ||
    phone.includes(s)
  );
}

export default function Send$Screen({ navigation, route }) {
  const { user, authToken, serverUrl } = useAuth();
  const insets = useSafeAreaInsets();
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

  const balance = Number(user?.account_balance || 0);

  const [amountText, setAmountText] = useState('');
  const [recipient, setRecipient] = useState(null);

  // saved contacts only
  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [q, setQ] = useState('');

  const loadSaved = useCallback(async () => {
    if (!base || !user?.id || !authToken) return;

    setLoadingSaved(true);
    try {
      const data = await postJson(
        `${base}/api/mobile/contacts/list`,
        { requesterId: user.id },
        null,
        authToken
      );
      const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
      setSaved(contacts);

      // ✅ If we were passed a recipientId but not the full object, resolve it now.
      const rid = route?.params?.recipientId;
      if (rid && !recipient?.id) {
        const match = contacts.find((c) => String(c?.id) === String(rid));
        if (match) setRecipient(match);
      }
    } catch (err) {
      Alert.alert('Send$', `Failed to load contacts: ${String(err.message || err)}`);
    } finally {
      setLoadingSaved(false);
    }
  }, [base, user?.id, authToken, route?.params?.recipientId, recipient?.id]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved])
  );

  // ✅ Auto-populate Send To if TextScreen passed a full recipient object
  useEffect(() => {
    const passed = route?.params?.recipient;
    if (passed?.id) setRecipient(passed);
  }, [route?.params?.recipient]);

  const amount = useMemo(() => parseMoney(amountText), [amountText]);
  const projected = useMemo(() => balance - amount, [balance, amount]);

  const amountOk = amount > 0.000001;
  const hasRecipient = !!recipient?.id;
  const sufficient = projected >= 0;

  const canSend = amountOk && hasRecipient && sufficient;

  const pickRecipient = (u) => {
    if (!u?.id) return;
    setRecipient(u);
    setQ('');
  };

  const openSummary = () => {
    if (!canSend) {
      const why =
        !amountOk ? 'Enter an amount to send.' :
        !hasRecipient ? 'Pick who to send to.' :
        !sufficient ? 'Insufficient balance.' :
        'Missing info.';
      Alert.alert('Send$', why);
      return;
    }

    navigation.navigate('Send$Summary', {
      recipient,
      amount,
      senderBalance: balance,
      projectedBalance: projected,
    });
  };

  // ✅ Only show matches while typing (do not show saved list by default)
  const filteredSaved = useMemo(() => {
    if (recipient?.id) return [];
    const query = String(q || '').trim();
    if (!query) return [];
    return saved.filter((u) => matchesSavedContact(u, query));
  }, [saved, q, recipient?.id]);

  // ✅ FIX: Use private media URL w/ token (matches Dashboard/TextScreen behavior)
  const recipientAvatarUrl = useMemo(() => {
    const p =
      recipient?.avatar_path ??
      recipient?.avatarPath ??
      recipient?.avatar_url ??
      recipient?.avatarUrl ??
      recipient?.avatar ??
      recipient?.photo_url ??
      recipient?.photoUrl ??
      '';

    return resolvePrivateMediaUrl(base, authToken, p);
  }, [
    base,
    authToken,
    recipient?.avatar_path,
    recipient?.avatarPath,
    recipient?.avatar_url,
    recipient?.avatarUrl,
    recipient?.avatar,
    recipient?.photo_url,
    recipient?.photoUrl,
  ]);

  const ListHeader = (
    <View>
      <Text style={styles.screenTitle}>Send$</Text>

      {/* Account Balance */}
      <View style={styles.cardOneLine}>
        <Text style={styles.cardLabelOneLine}>Account Balance</Text>
        <Text style={[styles.cardValueOneLine, styles.moneyGreen]}>{dollars(balance)}</Text>
      </View>

      {/* SEND TO */}
      <View style={styles.cardStack}>
        <Text style={styles.cardStackLabel}>Send To</Text>

        {recipient?.id ? (
          <View style={styles.recipientFullRow}>
            <View style={styles.avatarLg}>
              {recipientAvatarUrl ? (
                <Image source={{ uri: recipientAvatarUrl }} style={styles.avatarLgImg} />
              ) : (
                <Text style={styles.avatarLgText}>{initialsFromUser(recipient)}</Text>
              )}
            </View>

            <View style={styles.recipientTextCol}>
              {/* tiny handle above (optional) */}
              <Text style={styles.recipientTiny} numberOfLines={1}>
                {recipient?.user_name ? formatHandle(recipient.user_name) : ''}
              </Text>

              {/* main line */}
              <Text style={styles.recipientMain} numberOfLines={1}>
                {displayNameFromUser(recipient)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setRecipient(null)}
              style={styles.clearX}
              activeOpacity={0.9}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={16} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.searchFullRow}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search saved contact"
              placeholderTextColor="#9CA3AF"
              style={styles.searchFullInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {!!q && (
              <TouchableOpacity
                onPress={() => setQ('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.9}
              >
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/*Send Amount - ✅ $ hugs the amount on the RIGHT */}
      <View style={styles.cardOneLine}>
        <Text style={styles.cardLabelOneLine}>Amount to Send</Text>
        <View style={styles.moneyInlineRight}>
          <Text style={styles.moneyPrefixRight}>$</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0.00"
            placeholderTextColor="#9CA3AF"
            keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
            style={styles.moneyInputRight}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
        </View>
      </View>

      <View style={styles.cardOneLine}>
        <Text style={styles.cardLabelOneLine}>New Balance</Text>
        <Text
          style={[
            styles.cardValueOneLine,
            styles.moneyGreen,
            !sufficient && amountOk ? styles.badValue : null,
          ]}
        >
          {dollars(projected)}
        </Text>
      </View>

      {!sufficient && amountOk && (
        <Text style={styles.warnText}>Insufficient balance.</Text>
      )}

      {/* ✅ Button renamed + green */}
      <TouchableOpacity
        style={[styles.primaryBtnGreen, !canSend ? styles.primaryBtnDisabled : null]}
        activeOpacity={0.9}
        onPress={openSummary}
        disabled={!canSend}
      >
        <Text style={styles.primaryBtnGreenText}>Send</Text>
      </TouchableOpacity>

      <View style={{ height: 4 }} />
    </View>
  );

  const renderRow = ({ item }) => {
    const name = displayNameFromUser(item);
    const handle = item?.user_name ? formatHandle(item.user_name) : '';

    // ✅ FIX: use private media URL for list rows too
    const avatarUrl = resolvePrivateMediaUrl(
      base,
      authToken,
      item?.avatar_path || item?.avatarPath || item?.avatar_url || item?.avatarUrl || ''
    );

    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.9} onPress={() => pickRecipient(item)}>
        <View style={styles.avatarSm}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarSmImg} />
          ) : (
            <Text style={styles.avatarSmText}>{initialsFromUser(item)}</Text>
          )}
        </View>

        <Text style={styles.rowOneLine} numberOfLines={1}>
          {name}{handle ? `  ${handle}` : ''}
        </Text>

        <Ionicons name="chevron-forward" size={18} color="#6B7280" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.phoneFrame} className="fasbit-no-scrollbar">
        <View style={styles.container}>
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

          {loadingSaved ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={styles.centerText}>Loading contacts…</Text>
            </View>
          ) : (
            <FlatList
              className="fasbit-no-scrollbar"
              data={filteredSaved}
              keyExtractor={(item, idx) => String(item?.id || idx)}
              ListHeaderComponent={ListHeader}
              contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 18) }]}
              ListEmptyComponent={
                !recipient?.id && String(q || '').trim() ? (
                  <Text style={styles.centerText}>No matches.</Text>
                ) : null
              }
              renderItem={renderRow}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
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
    default: { flex: 1, backgroundColor: '#111827' },
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

  listContent: { padding: 16, paddingTop: 12 },
  screenTitle: { color: '#E5E7EB', fontSize: 18, fontWeight: '800', marginBottom: 10 },

  cardOneLine: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  cardLabelOneLine: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 0,
  },

  cardValueOneLine: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  moneyGreen: { color: FASBIT_GREEN },
  badValue: { color: '#F87171' },

  warnText: { marginTop: -2, marginBottom: 8, color: '#F87171', fontSize: 12, fontWeight: '700' },

  // ✅ RIGHT-aligned $ + amount snug together
  moneyInlineRight: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2, // <- snug
  },

  moneyPrefixRight: { color: '#E5E7EB', fontSize: 16, fontWeight: '900' },

  moneyInputRight: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 72,
    textAlign: 'right',
  },

  // ✅ green button + “Send”
  primaryBtnGreen: {
    backgroundColor: FASBIT_GREEN,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
  },

  primaryBtnGreenText: {
    color: '#071014',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  primaryBtnDisabled: { opacity: 0.45 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 10,
  },

  rowOneLine: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', flex: 1, minWidth: 0 },

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

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  centerText: { color: '#9CA3AF', marginTop: 10, textAlign: 'center' },

  cardStack: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },

  cardStackLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },

  recipientFullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },

  avatarLg: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  avatarLgImg: { width: 34, height: 34, resizeMode: 'cover' },
  avatarLgText: { color: '#E5E7EB', fontSize: 12, fontWeight: '900' },

  recipientTextCol: { flex: 1, minWidth: 0 },

  recipientTiny: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 1,
  },

  recipientMain: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  clearX: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  searchFullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  searchFullInput: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 13,
    padding: 0,
  },
});

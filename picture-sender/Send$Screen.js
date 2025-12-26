// Send$Screen.js
import React, { useCallback, useMemo, useRef, useState } from 'react';
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

function safeServerBase(serverUrl) {
  return String(serverUrl || '').replace(/\/+$/, '');
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

function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeNoAt(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/@/g, '')
    .replace(/\s+/g, '');
}

// Ensures exactly ONE @
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

function dollars(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '$0.00';
  return `$${x.toFixed(2)}`;
}

function parseMoney(text) {
  const raw = String(text || '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = Number.parseFloat(cleaned);
  return Number.isFinite(val) ? val : 0;
}

export default function Send$Screen({ navigation }) {
  const { user, authToken, serverUrl } = useAuth();
  const insets = useSafeAreaInsets();
  const base = safeServerBase(serverUrl);

  // balances
  const balance = Number(user?.account_balance || 0);

  // amount
  const [amountText, setAmountText] = useState('');

  // recipient
  const [recipient, setRecipient] = useState(null);

  // contact search (same logic pattern as ContactScreen)
  const [mode, setMode] = useState('saved'); // 'saved' | 'search'
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState([]);
  const [results, setResults] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searching, setSearching] = useState(false);

  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 300;

  const debounceTimerRef = useRef(null);
  const abortRef = useRef(null);

  const canSearch = useMemo(() => {
    const qText = normalizeNoAt(value);
    const qDigits = normalizePhone(value);
    return qText.length >= MIN_CHARS || qDigits.length >= MIN_CHARS;
  }, [value]);

  const stopInFlightSearch = () => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
    }
    abortRef.current = null;
  };

  const loadSaved = useCallback(async () => {
    if (!base || !user?.id || !authToken) return;

    setLoadingSaved(true);
    try {
      const data = await postJson(
        `${base}/api/mobile/contacts/list`,
        {},
        null,
        authToken
      );
      setSaved(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (err) {
      Alert.alert('Send$', `Failed to load contacts: ${String(err.message || err)}`);
    } finally {
      setLoadingSaved(false);
    }
  }, [base, user?.id, authToken]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
      return () => {
        // cleanup timers/requests
        stopInFlightSearch();
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      };
    }, [loadSaved])
  );

  const doLiveSearch = useCallback(
    async (raw) => {
      if (!base || !user?.id || !authToken) return;

      const qNoAt = normalizeNoAt(raw);
      const qPhone = normalizePhone(raw);

      if (qNoAt.length < MIN_CHARS && qPhone.length < MIN_CHARS) {
        stopInFlightSearch();
        setSearching(false);
        setResults([]);
        setMode('saved');
        return;
      }

      stopInFlightSearch();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      setMode('search');

      try {
        const data = await postJson(
          `${base}/api/mobile/contacts/search-any`,
          { q: raw },
          controller.signal,
          authToken
        );

        if (controller.signal.aborted) return;
        setResults(Array.isArray(data?.results) ? data.results : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        Alert.alert('Send$', `Search failed: ${String(err.message || err)}`);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    },
    [base, user?.id, authToken]
  );

  const onChangeSearch = (text) => {
    setValue(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    debounceTimerRef.current = setTimeout(() => {
      doLiveSearch(text);
    }, DEBOUNCE_MS);
  };

  const amount = useMemo(() => parseMoney(amountText), [amountText]);

  const projected = useMemo(() => {
    const next = balance - amount;
    return Number.isFinite(next) ? next : balance;
  }, [balance, amount]);

  const amountOk = amount > 0.000001;
  const hasRecipient = !!recipient?.id;
  const sufficient = projected >= 0;

  const canSend = amountOk && hasRecipient && sufficient;

  const pickRecipient = (u) => {
    if (!u?.id) return;
    setRecipient(u);
    // tighten UX: clear search + show saved list again
    setValue('');
    setResults([]);
    setMode('saved');
    stopInFlightSearch();
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

  const listPaddingBottom = Math.max(insets.bottom, 18);

  const ListHeader = (
    <View>
      <Text style={styles.screenTitle}>Send$</Text>

      {/* Account balance */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Account Balance</Text>
        <Text style={styles.bigValue}>{dollars(balance)}</Text>
      </View>

      {/* Amount */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Amount to Send</Text>
        <View style={styles.moneyRow}>
          <Text style={styles.moneyPrefix}>$</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0.00"
            placeholderTextColor="#9CA3AF"
            keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
            style={styles.moneyInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
        </View>
        {!sufficient && amountOk && (
          <Text style={styles.warnText}>Insufficient balance.</Text>
        )}
      </View>

      {/* Send to */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Send To</Text>

        {!!recipient?.id ? (
          <View style={styles.recipientPill}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.recipientName} numberOfLines={1}>
                {displayNameFromUser(recipient)}
              </Text>
              <Text style={styles.recipientSub} numberOfLines={1}>
                {recipient.user_name ? formatHandle(recipient.user_name) : recipient.email || recipient.phone || ''}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setRecipient(null)}
              style={styles.pillX}
              activeOpacity={0.9}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              value={value}
              onChangeText={onChangeSearch}
              placeholder="Search contacts"
              placeholderTextColor="#9CA3AF"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => doLiveSearch(value)}
              keyboardType={normalizePhone(value).length > 0 ? 'phone-pad' : 'default'}
            />
            <View style={styles.rightAccessory}>
              {searching ? (
                <ActivityIndicator size="small" />
              ) : (
                !!value && (
                  <TouchableOpacity
                    onPress={() => {
                      setValue('');
                      stopInFlightSearch();
                      if (debounceTimerRef.current) {
                        clearTimeout(debounceTimerRef.current);
                        debounceTimerRef.current = null;
                      }
                      setSearching(false);
                      setResults([]);
                      setMode('saved');
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        )}

        {!recipient?.id && (
          <Text style={styles.miniHint}>
            {mode === 'saved'
              ? 'Pick from saved contacts, or search.'
              : canSearch
                ? 'Tap a result to select.'
                : `Type ${MIN_CHARS}+ characters to search.`}
          </Text>
        )}
      </View>

      {/* Projected */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Balance After Sending</Text>
        <Text style={[styles.bigValue, !sufficient && amountOk ? styles.badValue : null]}>
          {dollars(projected)}
        </Text>
      </View>

      {/* Send button */}
      <TouchableOpacity
        style={[styles.primaryBtn, !canSend ? styles.primaryBtnDisabled : null]}
        activeOpacity={0.9}
        onPress={openSummary}
        disabled={!canSend}
      >
        <Text style={styles.primaryBtnText}>Send</Text>
      </TouchableOpacity>

      {/* spacer */}
      <View style={{ height: 10 }} />
      {!recipient?.id && (
        <Text style={styles.sectionTitle}>
          {mode === 'saved' ? 'Saved Contacts' : 'Search Results'}
        </Text>
      )}
    </View>
  );

  const data = recipient?.id ? [] : (mode === 'saved' ? saved : results);
  const loading = !recipient?.id && mode === 'saved' && loadingSaved;

  const renderRow = ({ item }) => {
    const name = displayNameFromUser(item);
    const subtitle = item.user_name ? formatHandle(item.user_name) : item.email || item.phone || '';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.9}
        onPress={() => pickRecipient(item)}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{name}</Text>
          {!!subtitle && <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <Ionicons name="arrow-forward" size={16} color="#6B7280" />
      </TouchableOpacity>
    );
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

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={styles.centerText}>Loading contacts…</Text>
            </View>
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item, idx) => String(item?.id || idx)}
              ListHeaderComponent={ListHeader}
              contentContainerStyle={[styles.listContent, { paddingBottom: listPaddingBottom }]}
              ListEmptyComponent={
                recipient?.id ? null : (
                  <Text style={styles.centerText}>
                    {mode === 'saved'
                      ? 'No saved contacts yet.'
                      : (canSearch ? 'No results.' : `Type ${MIN_CHARS}+ characters to search.`)}
                  </Text>
                )
              }
              renderItem={renderRow}
              keyboardShouldPersistTaps="handled"
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

  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#111827',
  },

  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: 'transparent',
  },

  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  topBarTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '800',
  },

  topBarMenuBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  listContent: {
    padding: 16,
    paddingTop: 12,
  },

  screenTitle: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },

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
    marginBottom: 8,
  },

  bigValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  badValue: {
    color: '#F87171',
  },

  warnText: {
    marginTop: 8,
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
  },

  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  moneyPrefix: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '900',
  },

  moneyInput: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },

  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  searchIcon: {
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },

  rightAccessory: {
    width: 26,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  miniHint: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 12,
  },

  recipientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#0B1220',
  },

  recipientName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  recipientSub: {
    marginTop: 2,
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },

  pillX: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  primaryBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },

  primaryBtnDisabled: {
    opacity: 0.45,
  },

  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 12,
  },

  rowTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  rowSub: {
    color: '#9CA3AF',
    marginTop: 2,
  },

  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },

  centerText: {
    color: '#9CA3AF',
    marginTop: 10,
    textAlign: 'center',
  },
});

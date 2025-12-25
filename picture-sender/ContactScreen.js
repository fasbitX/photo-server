// ContactScreen.js
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

// Web "6 inch" viewport approximation: CSS assumes 96px per inch.
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

// ✅ Ensures exactly ONE @ (your DB already stores @ sometimes)
function formatHandle(userName) {
  const s = String(userName || '').trim();
  if (!s) return '';
  return s.startsWith('@') ? s : `@${s}`;
}

export default function ContactScreen({ navigation }) {
  const { user, authToken, serverUrl } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState('saved'); // 'saved' | 'search'
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState([]);
  const [results, setResults] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searching, setSearching] = useState(false);

  const base = safeServerBase(serverUrl);

  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 300;

  const debounceTimerRef = useRef(null);
  const abortRef = useRef(null);

  const canSearch = useMemo(() => {
    const qText = normalizeNoAt(value);
    const qDigits = normalizePhone(value);
    return qText.length >= MIN_CHARS || qDigits.length >= MIN_CHARS;
  }, [value]);

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
      setSaved(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (err) {
      Alert.alert('Contacts', `Failed to load saved contacts: ${String(err.message || err)}`);
    } finally {
      setLoadingSaved(false);
    }
  }, [base, user?.id, authToken]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved])
  );

  const stopInFlightSearch = () => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
    }
    abortRef.current = null;
  };

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
          { requesterId: user.id, q: raw },
          controller.signal,
          authToken
        );

        if (controller.signal.aborted) return;
        setResults(Array.isArray(data?.results) ? data.results : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        Alert.alert('Search', `Search failed: ${String(err.message || err)}`);
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

  const add = async (contact) => {
    const contactUserId = contact?.id;
    const displayName =
      (contact?.nickname && String(contact.nickname).trim()) ||
      `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() ||
      (contact?.user_name ? String(contact.user_name).replace(/^@/, '') : '') ||
      'Contact';

    if (!base || !user?.id || !authToken) return;

    try {
      await postJson(
        `${base}/api/mobile/contacts/add`,
        { requesterId: user.id, contactUserId },
        null,
        authToken
      );
      Alert.alert('Added', `Contact ${displayName} added to saved list.`);
      await loadSaved();
      setMode('saved');
    } catch (err) {
      Alert.alert('Add contact', `Failed: ${String(err.message || err)}`);
    }
  };

  const openContact = (contact, isSaved) => {
    if (!contact) return;
    navigation.navigate('ContactDetail', { contact, isSaved: !!isSaved });
  };

  const renderRow = ({ item, savedMode }) => {
    const name =
      (item.nickname && String(item.nickname).trim()) ||
      `${item.first_name || ''} ${item.last_name || ''}`.trim() ||
      (item.user_name ? String(item.user_name).replace(/^@/, '') : '') ||
      'User';

    // ✅ Fix double @@
    const subtitle = item.user_name ? formatHandle(item.user_name) : item.email || item.phone || '';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.9}
        onPress={() => openContact(item, savedMode)}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {name}
          </Text>

          {!!subtitle && (
            <Text style={styles.rowSub} numberOfLines={1}>
              {subtitle}
            </Text>
          )}

        </View>

        {/* ✅ Remove trash from list; delete happens in Detail */}
        {savedMode ? (
          <Ionicons name="chevron-forward" size={18} color="#6B7280" />
        ) : (
          <TouchableOpacity
            style={styles.rowBtn}
            onPress={(e) => {
              // Prevent opening detail when clicking add (works on web; harmless on native)
              e?.stopPropagation?.();
              add(item);
            }}
            activeOpacity={0.9}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const ListHeader = (
    <View>
      <Text style={styles.screenTitle}>Contacts</Text>

      <View style={styles.searchCard}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />

          <TextInput
            value={value}
            onChangeText={onChangeSearch}
            placeholder="Search for New Contacts"
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
      </View>
    </View>
  );

  const listPaddingBottom = Math.max(insets.bottom, 18);

  return (
    <View style={styles.outerContainer}>
      <View style={styles.phoneFrame}>
        <View style={styles.container}>
          {/* ✅ Universal top bar */}
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

          {mode === 'saved' ? (
            loadingSaved ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <Text style={styles.centerText}>Loading saved contacts…</Text>
              </View>
            ) : (
              <FlatList
                data={saved}
                keyExtractor={(item) => String(item.id)}
                ListHeaderComponent={ListHeader}
                contentContainerStyle={
                  saved.length
                    ? [styles.listContent, { paddingBottom: listPaddingBottom }]
                    : [styles.listContent, styles.center, { paddingBottom: listPaddingBottom }]
                }
                ListEmptyComponent={<Text style={styles.centerText}>No saved contacts yet.</Text>}
                renderItem={({ item }) => renderRow({ item, savedMode: true })}
                keyboardShouldPersistTaps="handled"
              />
            )
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={ListHeader}
              contentContainerStyle={
                results.length
                  ? [styles.listContent, { paddingBottom: listPaddingBottom }]
                  : [styles.listContent, styles.center, { paddingBottom: listPaddingBottom }]
              }
              ListEmptyComponent={
                <Text style={styles.centerText}>
                  {canSearch ? 'No results.' : `Type ${MIN_CHARS}+ characters to search.`}
                </Text>
              }
              renderItem={({ item }) => renderRow({ item, savedMode: false })}
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

  searchCard: {
    marginTop: 0,
    marginBottom: 12,
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

  rowMeta: {
    color: '#6B7280',
    marginTop: 6,
    fontSize: 12,
  },

  rowBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  centerText: {
    color: '#9CA3AF',
    marginTop: 10,
    textAlign: 'center',
  },
});

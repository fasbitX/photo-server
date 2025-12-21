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
import { useAuth } from './auth';

const MAX_WIDTH = 288; // 4 inches at ~72 DPI

function safeServerBase(serverUrl) {
  return String(serverUrl || '').replace(/\/+$/, '');
}

async function postJson(url, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export default function ContactScreen({ navigation }) {
  const { user, serverUrl } = useAuth();

  // Saved list vs live-search results list
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
    const q = normalizeNoAt(value);
    return q.length >= MIN_CHARS;
  }, [value]);

  const loadSaved = useCallback(async () => {
    if (!base) return;
    if (!user?.id) return;

    setLoadingSaved(true);
    try {
      const data = await postJson(`${base}/api/mobile/contacts/list`, {
        requesterId: user.id,
      });
      setSaved(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (err) {
      Alert.alert(
        'Contacts',
        `Failed to load saved contacts: ${String(err.message || err)}`
      );
    } finally {
      setLoadingSaved(false);
    }
  }, [base, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved])
  );

  const stopInFlightSearch = () => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        // ignore
      }
    }
    abortRef.current = null;
  };

  const doLiveSearch = useCallback(
    async (raw) => {
      if (!base) return;
      if (!user?.id) return;

      const qNoAt = normalizeNoAt(raw);
      const qPhone = normalizePhone(raw);

      // Gate: do nothing (and clear) until we have at least 3 characters.
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

      const safeSearchOne = async (type, v) => {
        if (!v || v.length < MIN_CHARS) return [];
        try {
          const data = await postJson(
            `${base}/api/mobile/contacts/search`,
            {
              requesterId: user.id,
              type,
              value: v,
            },
            controller.signal
          );
          return Array.isArray(data?.results) ? data.results : [];
        } catch (err) {
          // If cancelled, just treat as empty
          if (String(err?.name || '').includes('Abort')) return [];
          return [];
        }
      };

      try {
        // Search all three types and merge results (dedupe by id).
        const [byPhone, byEmail, byUsername] = await Promise.all([
          safeSearchOne('phone', qPhone),
          safeSearchOne('email', qNoAt),
          safeSearchOne('username', qNoAt),
        ]);

        if (controller.signal.aborted) return;

        const merged = [...byPhone, ...byEmail, ...byUsername];
        const map = new Map();
        for (const item of merged) {
          if (item && item.id != null && !map.has(item.id)) {
            map.set(item.id, item);
          }
        }
        setResults(Array.from(map.values()));
      } catch (err) {
        if (controller.signal.aborted) return;
        Alert.alert('Search', `Search failed: ${String(err.message || err)}`);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    },
    [base, user?.id]
  );

  const onChangeSearch = (text) => {
    setValue(text);

    // Cancel any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Schedule a debounced search
    debounceTimerRef.current = setTimeout(() => {
      doLiveSearch(text);
    }, DEBOUNCE_MS);
  };

  const add = async (contactUserId) => {
    if (!base || !user?.id) return;

    try {
      await postJson(`${base}/api/mobile/contacts/add`, {
        requesterId: user.id,
        contactUserId,
      });
      Alert.alert('Added', 'Contact saved.');
      await loadSaved();
    } catch (err) {
      Alert.alert('Add contact', `Failed: ${String(err.message || err)}`);
    }
  };

  const remove = async (contactUserId) => {
    if (!base || !user?.id) return;

    Alert.alert('Remove contact', 'Remove this contact from your saved list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await postJson(`${base}/api/mobile/contacts/remove`, {
              requesterId: user.id,
              contactUserId,
            });
            await loadSaved();
          } catch (err) {
            Alert.alert(
              'Remove contact',
              `Failed: ${String(err.message || err)}`
            );
          }
        },
      },
    ]);
  };

  const renderRow = ({ item, savedMode }) => {
    const name =
      (item.nickname && String(item.nickname).trim()) ||
      `${item.first_name || ''} ${item.last_name || ''}`.trim() ||
      item.user_name ||
      'User';

    const subtitle = item.user_name ? `@${item.user_name}` : item.email || item.phone || '';

    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{name}</Text>
          {!!subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
          {item.email || item.phone ? (
            <Text style={styles.rowMeta}>
              {item.email ? item.email : ''}
              {item.email && item.phone ? ' • ' : ''}
              {item.phone ? item.phone : ''}
            </Text>
          ) : null}
        </View>

        {savedMode ? (
          <TouchableOpacity
            style={styles.rowBtnDanger}
            onPress={() => remove(item.id)}
          >
            <Ionicons name="trash-outline" size={18} color="#FCA5A5" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.rowBtn} onPress={() => add(item.id)}>
            <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color="#E5E7EB" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Contacts</Text>

          <View style={styles.headerBtn} />
        </View>

        {/* Search box (live search, unified) */}
        <View style={styles.searchCard}>
          <View style={styles.searchHeaderRow}>
            <Text style={styles.label}>Search</Text>
            {searching ? (
              <View style={styles.searchingPill}>
                <ActivityIndicator size="small" />
                <Text style={styles.searchingText}>Searching…</Text>
              </View>
            ) : (
              <Text style={styles.hintText}>
                {canSearch ? 'Showing matches' : `Type ${MIN_CHARS}+ characters`}
              </Text>
            )}
          </View>

          <View style={styles.searchRow}>
            <Ionicons
              name="search"
              size={16}
              color="#9CA3AF"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone, email, or username"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              value={value}
              onChangeText={onChangeSearch}
              onSubmitEditing={() => doLiveSearch(value)}
              returnKeyType="search"
              keyboardType={
                // If the user started typing digits, bring up phone keypad; otherwise default
                normalizePhone(value).length > 0 ? 'phone-pad' : 'default'
              }
            />
            {!!value && (
              <TouchableOpacity
                onPress={() => {
                  onChangeSearch('');
                  setResults([]);
                  setMode('saved');
                }}
                style={styles.clearBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Saved / Results toggle stays, but results populate automatically */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeChip, mode === 'saved' && styles.modeChipActive]}
              onPress={() => setMode('saved')}
            >
              <Text
                style={[styles.modeChipText, mode === 'saved' && styles.modeChipTextActive]}
              >
                Saved
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeChip, mode === 'search' && styles.modeChipActive]}
              onPress={() => setMode('search')}
            >
              <Text
                style={[styles.modeChipText, mode === 'search' && styles.modeChipTextActive]}
              >
                Results
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.help}>
            • Phone: punctuation ignored (802-555-2222 matches 8025552222){'\n'}
            • Username: “@” ignored{'\n'}
            • Email: “@” ignored
          </Text>
        </View>

        {/* Lists */}
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
              contentContainerStyle={saved.length ? null : styles.center}
              ListEmptyComponent={
                <Text style={styles.centerText}>No saved contacts yet.</Text>
              }
              renderItem={({ item }) => renderRow({ item, savedMode: true })}
            />
          )
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={results.length ? null : styles.center}
            ListEmptyComponent={
              <Text style={styles.centerText}>
                {canSearch ? 'No results.' : `Type ${MIN_CHARS}+ characters to search.`}
              </Text>
            }
            renderItem={({ item }) => renderRow({ item, savedMode: false })}
          />
        )}
      </View>
    </View>
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
    height: 64,
    paddingHorizontal: 16,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

  searchCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#020617',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  hintText: { color: '#6B7280', fontSize: 11 },
  searchingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchingText: { color: '#9CA3AF', fontSize: 11 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 2,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 38, // room for icon
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    color: '#FFFFFF',
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
  },
  modeChipActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  modeChipText: { color: '#9CA3AF', fontWeight: '800' },
  modeChipTextActive: { color: '#FFFFFF' },

  help: { color: '#6B7280', fontSize: 11, marginTop: 10, lineHeight: 16 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 12,
  },
  rowTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rowSub: { color: '#9CA3AF', marginTop: 2 },
  rowMeta: { color: '#6B7280', marginTop: 6, fontSize: 12 },

  rowBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBtnDanger: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: '#9CA3AF', marginTop: 10, textAlign: 'center' },
});
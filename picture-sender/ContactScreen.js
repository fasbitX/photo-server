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

const MAX_WIDTH = 300; // 4 inches at ~72 DPI

function safeServerBase(serverUrl) {
  return String(serverUrl || '').replace(/\/+$/, '');
}

async function postJson(url, body, signal, authToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
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

export default function ContactScreen({ navigation }) {
  const { user, authToken, serverUrl } = useAuth();

  // Saved list vs live-search results list
  const [mode, setMode] = useState('saved'); // 'saved' | 'search'

  const [value, setValue] = useState('');
  const [saved, setSaved] = useState([]);
  const [results, setResults] = useState([]);

  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searching, setSearching] = useState(false);

  const base = safeServerBase(serverUrl);

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(`${title}: ${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const confirmDialog = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

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
      Alert.alert(
        'Contacts',
        `Failed to load saved contacts: ${String(err.message || err)}`
      );
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

  const remove = async (contactUserId, contactLabel = 'Contact') => {
    if (!base || !user?.id || !authToken) return;

    const ok = await confirmDialog(
      'Remove contact',
      `Remove ${contactLabel} from your saved list?`
    );
    if (!ok) return;

    try {
      await postJson(
        `${base}/api/mobile/contacts/remove`,
        { requesterId: user.id, contactUserId },
        null,
        authToken
      );
      await loadSaved();
      setMode('saved');
      notify('Removed', `${contactLabel} removed from saved list.`);
    } catch (err) {
      notify('Remove contact', `Failed: ${String(err.message || err)}`);
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
      item.user_name ||
      'User';

    const subtitle = item.user_name ? `@${item.user_name}` : item.email || item.phone || '';

    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.9} onPress={() => openContact(item, savedMode)}>
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
            onPress={() => remove(item.id, name)}
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.rowBtn} onPress={() => add(item)}>
            <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
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

        <View style={styles.searchCard}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />

            <TextInput
              value={value}
              onChangeText={onChangeSearch}
              placeholder="Search for Contacts"
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
                      // hard clear (no debounce lag)
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
                  >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )
              )}
            </View>
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
              contentContainerStyle={saved.length ? null : styles.center}
              ListEmptyComponent={<Text style={styles.centerText}>No saved contacts yet.</Text>}
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

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  searchCard: {
    marginHorizontal: 16,
    marginTop: 12,
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
    marginHorizontal: 16,
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

  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  centerText: {
    color: '#9CA3AF',
    marginTop: 10,
    textAlign: 'center',
  },
});

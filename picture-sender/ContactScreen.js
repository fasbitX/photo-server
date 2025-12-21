// ContactScreen.js
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from './auth';

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
    const msg = (json && json.error) ? json.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export default function ContactScreen({ navigation }) {
  const { user, serverUrl } = useAuth();

  const [mode, setMode] = useState('saved'); // 'saved' | 'search'
  const [type, setType] = useState('phone'); // phone | email | username
  const [value, setValue] = useState('');

  const [saved, setSaved] = useState([]);
  const [results, setResults] = useState([]);

  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searching, setSearching] = useState(false);

  const base = safeServerBase(serverUrl);

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
      Alert.alert('Contacts', `Failed to load saved contacts: ${String(err.message || err)}`);
    } finally {
      setLoadingSaved(false);
    }
  }, [base, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved])
  );

  const doSearch = async () => {
    if (!base) {
      Alert.alert('Server not set', 'Tap the gear icon and set your server URL first.');
      return;
    }
    if (!user?.id) return;

    const q = value.trim();
    if (!q) return;

    setSearching(true);
    try {
      const data = await postJson(`${base}/api/mobile/contacts/search`, {
        requesterId: user.id,
        type,
        value: q,
      });
      setResults(Array.isArray(data?.results) ? data.results : []);
      setMode('search');
    } catch (err) {
      Alert.alert('Search', `Search failed: ${String(err.message || err)}`);
    } finally {
      setSearching(false);
    }
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
            Alert.alert('Remove contact', `Failed: ${String(err.message || err)}`);
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

    const subtitle = item.user_name
      ? `@${item.user_name}`
      : (item.email || item.phone || '');

    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{name}</Text>
          {!!subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
          {(item.email || item.phone) ? (
            <Text style={styles.rowMeta}>
              {item.email ? item.email : ''}{item.email && item.phone ? ' • ' : ''}{item.phone ? item.phone : ''}
            </Text>
          ) : null}
        </View>

        {savedMode ? (
          <TouchableOpacity style={styles.rowBtnDanger} onPress={() => remove(item.id)}>
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

      {/* Search box */}
      <View style={styles.searchCard}>
        <Text style={styles.label}>Search by</Text>

        <View style={styles.typeRow}>
          {['phone', 'email', 'username'].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeChip, type === t && styles.typeChipActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                {t === 'phone' ? 'Phone' : t === 'email' ? 'Email' : 'Username'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder={
              type === 'phone' ? 'Enter phone #' : type === 'email' ? 'Enter email' : 'Enter username'
            }
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            value={value}
            onChangeText={setValue}
            onSubmitEditing={doSearch}
            returnKeyType="search"
            keyboardType={type === 'phone' ? 'phone-pad' : 'default'}
          />

          <TouchableOpacity style={styles.searchBtn} onPress={doSearch} disabled={searching}>
            {searching ? (
              <ActivityIndicator />
            ) : (
              <Ionicons name="search" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeChip, mode === 'saved' && styles.modeChipActive]}
            onPress={() => setMode('saved')}
          >
            <Text style={[styles.modeChipText, mode === 'saved' && styles.modeChipTextActive]}>
              Saved
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeChip, mode === 'search' && styles.modeChipActive]}
            onPress={() => setMode('search')}
          >
            <Text style={[styles.modeChipText, mode === 'search' && styles.modeChipTextActive]}>
              Results
            </Text>
          </TouchableOpacity>
        </View>
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
            ListEmptyComponent={<Text style={styles.centerText}>No saved contacts yet.</Text>}
            renderItem={({ item }) => renderRow({ item, savedMode: true })}
          />
        )
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={results.length ? null : styles.center}
          ListEmptyComponent={<Text style={styles.centerText}>No results.</Text>}
          renderItem={({ item }) => renderRow({ item, savedMode: false })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },

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
  label: { color: '#9CA3AF', fontSize: 12, marginBottom: 8 },

  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  typeChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  typeChipText: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  typeChipTextActive: { color: '#FFFFFF' },

  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    color: '#FFFFFF',
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
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

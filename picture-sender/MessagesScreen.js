// MessagesScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_WIDTH = 288; // match DashboardScreen "4 inches" width

export default function MessagesScreen({ navigation }) {
  const { user, serverUrl } = useAuth();
  const [q, setQ] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const email = (c.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [q, contacts]);

  useEffect(() => {
    const load = async () => {
      if (!user?.id || !serverUrl) return;
      setLoading(true);
      try {
        const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/contacts/list`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: user.id }),
        });
        const data = await res.json();
        if (res.ok && data.contacts) setContacts(data.contacts);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, serverUrl]);

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Header (match Dashboard style) */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={28} color="#9CA3AF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Messages</Text>

          {/* spacer to keep title visually centered */}
          <View style={styles.headerRightSpacer} />
        </View>

        {/* Content (match Dashboard padding) */}
        <View style={styles.content}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search contacts..."
            placeholderTextColor="#9CA3AF"
            style={styles.search}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {loading ? 'Loading...' : 'No contacts yet.'}
              </Text>
            }
            renderItem={({ item }) => {
              const name =
                `${item.first_name || ''} ${item.last_name || ''}`.trim() ||
                item.email ||
                'Contact';

              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => navigation.navigate('Text', { contact: item })}
                  activeOpacity={0.8}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{name}</Text>
                    {!!item.email && <Text style={styles.sub}>{item.email}</Text>}
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color="#6B7280"
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Match Dashboard outer shell
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

  // Match Dashboard header bar
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    padding: 12,
    marginLeft: -12, // balances the padding so title feels centered
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerRightSpacer: {
    width: 28 + 24, // approx back icon area width to center title
  },

  // Match Dashboard content padding
  content: {
    padding: 16,
    flex: 1,
  },

  // Inputs/rows styled to match Dashboard card feel
  search: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF',
    marginBottom: 12,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#020617',
    marginBottom: 12,
    gap: 12,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: '800' },
  name: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  sub: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  empty: { color: '#9CA3AF', paddingTop: 24, textAlign: 'center' },
});

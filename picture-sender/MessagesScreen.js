// MessagesScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Platform } from 'react-native';
import { useAuth } from './auth';

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
    <View style={styles.container}>
      <View style={styles.webFrame}>
        <Text style={styles.title}>Messages</Text>

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
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
            <Text style={styles.empty}>
                {loading ? 'Loading...' : 'No contacts yet.'}
            </Text>
            }
            renderItem={({ item }) => {
            const name = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email || 'Contact';
            return (
                <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('Text', { contact: item })}
                activeOpacity={0.8}
                >
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{name}</Text>
                    {!!item.email && <Text style={styles.sub}>{item.email}</Text>}
                </View>
                </TouchableOpacity>
            );
            }}
        />
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', padding: 16, paddingTop: 50 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 12 },
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
    gap: 12,
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#020617',
    marginBottom: 10,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: '800' },
  name: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  sub: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  empty: { color: '#9CA3AF', paddingTop: 24, textAlign: 'center'
  },

  webFrame: {
  flex: 1,
  width: '100%',
  maxWidth: Platform.OS === 'web' ? 420 : '100%',
  alignSelf: 'center',
 },

 webFrame: {
  flex: 1,
  width: '100%',
  maxWidth: Platform.OS === 'web' ? 420 : '100%',
  alignSelf: 'center',
  borderWidth: Platform.OS === 'web' ? 1 : 0,
  borderColor: Platform.OS === 'web' ? '#1F2937' : 'transparent',
  borderRadius: Platform.OS === 'web' ? 24 : 0,
  overflow: 'hidden',
 },

});

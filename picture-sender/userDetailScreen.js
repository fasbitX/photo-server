// userDetailScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './auth';

const MAX_WIDTH = 288; // match Dashboard container width

function initialsFromUser(u) {
  const a = String(u?.first_name || '').trim();
  const b = String(u?.last_name || '').trim();
  const i = `${a[0] || ''}${b[0] || ''}`.toUpperCase();
  return i || '@';
}

function resolveUploadUrl(serverUrl, avatarPath) {
  if (!serverUrl || !avatarPath) return null;
  const base = String(serverUrl).replace(/\/+$/, '');
  const clean = String(avatarPath).replace(/^\/+/, '');
  return `${base}/uploads/${clean}`;
}

export default function UserDetailScreen({ navigation }) {
  const { user, serverUrl, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const avatarUrl = useMemo(
    () => resolveUploadUrl(serverUrl, user?.avatar_path),
    [serverUrl, user?.avatar_path]
  );

  const displayName =
    String(user?.user_name || '').trim() ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    'User';

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 64 : 0;

  const fetchContacts = async () => {
    if (!user?.id || !serverUrl) return;
    setLoadingContacts(true);
    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/contacts/list`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id }),
      });
      const data = await res.json();
      if (res.ok) setContacts(Array.isArray(data.contacts) ? data.contacts : []);
    } catch (e) {
      // silent for MVP
    } finally {
      setLoadingContacts(false);
    }
  };

  useEffect(() => {
    refreshUser?.();
    fetchContacts();
    const unsub = navigation.addListener('focus', () => {
      refreshUser?.();
      fetchContacts();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, user?.id, serverUrl]);

  const runSearch = async () => {
    const q = String(searchText || '').trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    if (!user?.id || !serverUrl) return;

    setSearching(true);
    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/contacts/search-any`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, q }),
      });
      const data = await res.json();
      if (res.ok) setSearchResults(Array.isArray(data.results) ? data.results : []);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addContact = async (contactUserId) => {
    if (!user?.id || !serverUrl || !contactUserId) return;
    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/contacts/add`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, contactUserId }),
      });
      if (res.ok) {
        await fetchContacts();
        Alert.alert('Added', 'Contact added.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to add contact.');
    }
  };

  const pickAndUploadAvatar = async () => {
    if (!user?.id || !serverUrl) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos to choose an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    const form = new FormData();
    form.append('userId', String(user.id));
    form.append('avatar', {
      uri: asset.uri,
      name: asset.fileName || `avatar-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    });

    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/user/avatar`;
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        headers: {
          // Let fetch set correct boundary
        },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || 'Upload failed');

      await refreshUser?.();
      Alert.alert('Saved', 'Your avatar was updated.');
    } catch (e) {
      Alert.alert('Error', 'Failed to upload avatar.');
    }
  };

  const renderContact = ({ item }) => {
    const c = item || {};
    const name =
      String(c.user_name || '').trim() ||
      `${c.first_name || ''} ${c.last_name || ''}`.trim() ||
      c.email ||
      'Contact';

    const cAvatarUrl = resolveUploadUrl(serverUrl, c.avatar_path);

    return (
      <TouchableOpacity
        style={styles.contactRow}
        onPress={() => navigation.navigate('ContactDetail', { contact: c })}
        activeOpacity={0.85}
      >
        <View style={styles.contactAvatarWrap}>
          {cAvatarUrl ? (
            <Image source={{ uri: cAvatarUrl }} style={styles.contactAvatarImg} />
          ) : (
            <Text style={styles.contactAvatarInitials}>{initialsFromUser(c)}</Text>
          )}
        </View>

        <View style={styles.contactTextWrap}>
          <Text style={styles.contactName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.contactSub} numberOfLines={1}>
            {c.email || ''}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color="#334155" />
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <View>
      {/* Profile card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{displayName}</Text>

        <View style={styles.avatarRow}>
          <View style={styles.bigAvatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.bigAvatarImg} />
            ) : (
              <Text style={styles.bigAvatarInitials}>{initialsFromUser(user)}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={pickAndUploadAvatar}
            style={styles.cameraBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Change avatar"
          >
            <Ionicons name="camera" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

    {/* Account info card - SIMPLE CLICKABLE VERSION */}
        <TouchableOpacity 
        style={styles.accountInfoCard}
        onPress={() => navigation.navigate('AccountInfo')}
        activeOpacity={0.85}
        >
        <Text style={styles.accountInfoTitle}>Account Info</Text>
        
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>

      {/* Search + add contacts */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add Contacts</Text>

        <View style={styles.searchRow}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by phone, email, or @username"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={runSearch}
          />
          <TouchableOpacity onPress={runSearch} activeOpacity={0.85} style={styles.searchBtn}>
            <Ionicons name="search" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {searching ? (
          <Text style={styles.emptyText}>Searching…</Text>
        ) : searchResults.length === 0 ? (
          <Text style={styles.hintText}>Search to find people and add them to your contacts.</Text>
        ) : (
          <View style={styles.searchResultsWrap}>
            {searchResults.slice(0, 10).map((r) => {
              const rName =
                String(r.user_name || '').trim() ||
                `${r.first_name || ''} ${r.last_name || ''}`.trim() ||
                r.email ||
                'User';
              const rAvatarUrl = resolveUploadUrl(serverUrl, r.avatar_path);

              return (
                <View key={String(r.id)} style={styles.searchResultRow}>
                  <View style={styles.searchAvatarWrap}>
                    {rAvatarUrl ? (
                      <Image source={{ uri: rAvatarUrl }} style={styles.searchAvatarImg} />
                    ) : (
                      <Text style={styles.searchAvatarInitials}>{initialsFromUser(r)}</Text>
                    )}
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.searchName} numberOfLines={1}>
                      {rName}
                    </Text>
                    <Text style={styles.searchSub} numberOfLines={1}>
                      {r.email || r.phone || ''}
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => addContact(r.id)} activeOpacity={0.85} style={styles.addBtn}>
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Contacts title */}
      <View style={[styles.card, { paddingBottom: 12 }]}>
        <View style={styles.contactsHeaderRow}>
          <Text style={styles.cardTitle}>Contacts</Text>
          <TouchableOpacity onPress={fetchContacts} activeOpacity={0.85} style={styles.smallLinkBtn}>
            <Ionicons name="refresh" size={16} color="#93C5FD" />
            <Text style={styles.smallLinkText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        {loadingContacts && contacts.length === 0 ? <Text style={styles.emptyText}>Loading…</Text> : null}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={styles.outerContainer}>
        <View style={styles.container}>
           <FlatList
                data={contacts}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderContact}
                ListHeaderComponent={ListHeader}
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: Math.max(insets.bottom, 16),
                }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={loadingContacts ? null : <Text style={styles.emptyText}>No contacts yet.</Text>}
                showsVerticalScrollIndicator={false}
            />
        </View>
      </View>
    </KeyboardAvoidingView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerIconBtn: {
    padding: 12,
    marginLeft: -12,
  },
  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,  // CHANGED from 20 to 16
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    minHeight: 38,  // ADD this line (~1cm = 38px)
},
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },

  hintText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 10,
  },
  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    paddingTop: 8,
  },

  avatarRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  bigAvatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bigAvatarImg: {
    width: '100%',
    height: '100%',
  },
  bigAvatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 20,
  },
  cameraBtn: {
    position: 'absolute',
    right: 50,
    bottom: -8,
    backgroundColor: 'transparent',
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
    },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchResultsWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  searchAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  searchAvatarImg: {
    width: '100%',
    height: '100%',
  },
  searchAvatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
  },
  searchName: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
  },
  searchSub: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 3,
  },
  addBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 12,
  },

  contactsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smallLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
  },
  smallLinkText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '800',
  },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    backgroundColor: '#020617',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 20,
  },
  contactAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  contactAvatarImg: {
    width: '100%',
    height: '100%',
  },
  contactAvatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
  },
  contactTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
  },
  contactSub: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 3,
  },
    accountInfoCard: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    height: 48,  // CHANGED from minHeight/maxHeight to fixed height
    flexDirection: 'row',
    alignItems: 'center',  // This centers vertically
    justifyContent: 'space-between',
 },
 chevronRow: {
    alignItems: 'center',
    justifyContent: 'center',
 },
 accountInfoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    margin: 0,  // Remove any margin
 },

});

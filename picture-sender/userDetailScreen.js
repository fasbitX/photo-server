// userDetailScreen.js
/* ====================================================================================
The purpose of this page is to display the user's profile information,
 including their avatar, name, and contact list. It also allows the user
 to search for and add new contacts, as well as update their avatar.
 =====================================================================================*/

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

const MAX_WIDTH = 300;

// Web "6 inch" viewport approximation: browsers assume 96px/inch.
const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 576px

function initialsFromUser(u) {
  const a = String(u?.first_name || '').trim();
  const b = String(u?.last_name || '').trim();
  const i = `${a[0] || ''}${b[0] || ''}`.toUpperCase();
  return i || '@';
}

/**
 * Build a PRIVATE media URL that the server protects with Bearer token:
 * /api/mobile/media?path=avatars/4/avatar-xxx.png
 */
function resolveMobileMediaUrl(serverUrl, filePath) {
  if (!serverUrl || !filePath) return null;
  const base = String(serverUrl).replace(/\/+$/, '');
  const clean = String(filePath).trim().replace(/^\/+/, '');
  if (!clean) return null;
  return `${base}/api/mobile/media?path=${encodeURIComponent(clean)}`;
}

/**
 * AuthedImage
 * - Native: can attach Authorization header to Image source
 * - Web: fetch blob with Authorization, create object URL, render that
 */
function AuthedImage({ uri, authToken, style, fallback }) {
  const [webObjectUrl, setWebObjectUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    if (Platform.OS !== 'web') return;
    if (!uri) {
      setWebObjectUrl(null);
      return;
    }

    // If no token, just try direct
    if (!authToken) {
      setWebObjectUrl(uri);
      return;
    }

    let alive = true;
    let createdUrl = null;

    (async () => {
      try {
        const res = await fetch(uri, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);

        if (!alive) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        setWebObjectUrl(createdUrl);
      } catch (e) {
        if (alive) {
          setFailed(true);
          setWebObjectUrl(null);
        }
      }
    })();

    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [uri, authToken]);

  if (!uri || failed) return fallback || null;

  if (Platform.OS === 'web') {
    if (!webObjectUrl) return fallback || null;
    return <Image source={{ uri: webObjectUrl }} style={style} />;
  }

  // Native: pass headers
  return (
    <Image
      source={{
        uri,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      }}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}

export default function UserDetailScreen({ navigation }) {
  const { user, serverUrl, refreshUser, authToken, getAuthHeaders } = useAuth();
  const insets = useSafeAreaInsets();

  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);

  const avatarUrl = useMemo(
    () => resolveMobileMediaUrl(serverUrl, user?.avatar_path),
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
      const url = `${String(serverUrl).replace(/\/+$/, '')}/api/mobile/contacts/list`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requesterId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
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
  }, [navigation, user?.id, serverUrl, authToken]);

  const runSearch = async () => {
    const q = String(searchText || '').trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    if (!user?.id || !serverUrl) return;

    setSearching(true);
    try {
      const url = `${String(serverUrl).replace(/\/+$/, '')}/api/mobile/contacts/search-any`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requesterId: user.id, q }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSearchResults(Array.isArray(data.results) ? data.results : []);
      else setSearchResults([]);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addContact = async (contactUserId) => {
    if (!user?.id || !serverUrl || !contactUserId) return;
    try {
      const url = `${String(serverUrl).replace(/\/+$/, '')}/api/mobile/contacts/add`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requesterId: user.id, contactUserId }),
      });
      if (res.ok) {
        await fetchContacts();
        Alert.alert('Added', 'Contact added.');
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert('Error', data?.error || 'Failed to add contact.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to add contact.');
    }
  };

  // =========================================================
  // AVATAR UPLOAD
  // =========================================================

  const chooseAvatarFromLibrary = async () => {
    if (!user?.id || !serverUrl) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos to choose an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadAvatarAsset(asset);
  };

  const uploadAvatarAsset = async (asset) => {
    if (!user?.id || !serverUrl) return;

    try {
      setAvatarUploading(true);

      const base = String(serverUrl).replace(/\/+$/, '');
      const url = `${base}/api/mobile/user/avatar`;

      const fileName =
        asset.fileName ||
        (typeof asset.uri === 'string' ? asset.uri.split('/').pop() : null) ||
        `avatar-${Date.now()}.jpg`;

      const mimeType = asset.mimeType || 'image/jpeg';

      const form = new FormData();
      form.append('userId', String(user.id));

      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        form.append('avatar', blob, fileName);
      } else {
        form.append('avatar', {
          uri: asset.uri,
          name: fileName,
          type: mimeType,
        });
      }

      const res = await fetch(url, {
        method: 'POST',
        body: form,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        // DO NOT set Content-Type; boundary is automatic
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');

      await refreshUser?.();
      Alert.alert('Saved', 'Your avatar was updated.');
    } catch (e) {
      Alert.alert('Error', `Failed to upload avatar: ${String(e?.message || e)}`);
    } finally {
      setAvatarUploading(false);
    }
  };

  const renderContact = ({ item }) => {
    const c = item || {};
    const name =
      String(c.user_name || '').trim() ||
      `${c.first_name || ''} ${c.last_name || ''}`.trim() ||
      c.email ||
      'Contact';

    const cAvatarUrl = resolveMobileMediaUrl(serverUrl, c.avatar_path);

    return (
      <TouchableOpacity
        style={styles.contactRow}
        onPress={() => navigation.navigate('ContactDetail', { contact: c })}
        activeOpacity={0.85}
      >
        <View style={styles.contactAvatarWrap}>
          {cAvatarUrl ? (
            <AuthedImage
              uri={cAvatarUrl}
              authToken={authToken}
              style={styles.contactAvatarImg}
              fallback={<Text style={styles.contactAvatarInitials}>{initialsFromUser(c)}</Text>}
            />
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
              <AuthedImage
                uri={avatarUrl}
                authToken={authToken}
                style={styles.bigAvatarImg}
                fallback={<Text style={styles.bigAvatarInitials}>{initialsFromUser(user)}</Text>}
              />
            ) : (
              <Text style={styles.bigAvatarInitials}>{initialsFromUser(user)}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={chooseAvatarFromLibrary}
            disabled={avatarUploading}
            style={[styles.cameraBtn, avatarUploading && { opacity: 0.6 }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Change avatar"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="camera" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Account info card */}
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

              const rAvatarUrl = resolveMobileMediaUrl(serverUrl, r.avatar_path);

              return (
                <View key={String(r.id)} style={styles.searchResultRow}>
                  <View style={styles.searchAvatarWrap}>
                    {rAvatarUrl ? (
                      <AuthedImage
                        uri={rAvatarUrl}
                        authToken={authToken}
                        style={styles.searchAvatarImg}
                        fallback={<Text style={styles.searchAvatarInitials}>{initialsFromUser(r)}</Text>}
                      />
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

                  <TouchableOpacity
                    onPress={() => addContact(r.id)}
                    activeOpacity={0.85}
                    style={styles.addBtn}
                  >
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
      {/* Outer page */}
      <View style={styles.outerContainer}>
        {/* ✅ Phone viewport wrapper (fixed 6" height on web only) */}
        <View style={styles.phoneFrame}>
          <View style={styles.container}>
            <FlatList
              data={contacts}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderContact}
              ListHeaderComponent={ListHeader}
              contentContainerStyle={{
                padding: 16,
                paddingTop: insets.top + 16,
                paddingBottom: Math.max(insets.bottom, 16),
              }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                loadingContacts ? null : <Text style={styles.emptyText}>No contacts yet.</Text>
              }
              // keep if you like the clean look; scrolling still works
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // page behind the “phone”
  outerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 16,
  },

  // ✅ 6-inch viewport limitation (web only)
  phoneFrame: Platform.select({
    web: {
      width: '100%',
      maxWidth: MAX_WIDTH,
      height: PHONE_HEIGHT_PX, // ~6 inches
      overflow: 'hidden', // FlatList scrolls inside
      backgroundColor: '#111827',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#1F2937',
      boxShadow: '0px 10px 30px rgba(0,0,0,0.45)',
    },
    default: {
      flex: 1, // native uses real device height
      width: '100%',
      maxWidth: MAX_WIDTH,
      backgroundColor: '#111827',
    },
  }),

  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#111827',
  },

  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#1F2937',
    minHeight: 38,
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
  bigAvatarImg: { width: '100%', height: '100%' },
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
    zIndex: 10,
    elevation: 10,
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
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
  searchAvatarImg: { width: '100%', height: '100%' },
  searchAvatarInitials: { color: '#93C5FD', fontWeight: '900' },
  searchName: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  searchSub: { color: '#9CA3AF', fontSize: 12, marginTop: 3 },
  addBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: { color: '#FFF', fontWeight: '900', fontSize: 12 },

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
  smallLinkText: { color: '#93C5FD', fontSize: 12, fontWeight: '800' },

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
  contactAvatarImg: { width: '100%', height: '100%' },
  contactAvatarInitials: { color: '#93C5FD', fontWeight: '900' },
  contactTextWrap: { flex: 1, minWidth: 0 },
  contactName: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  contactSub: { color: '#9CA3AF', fontSize: 12, marginTop: 3 },

  accountInfoCard: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountInfoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    margin: 0,
  },
});

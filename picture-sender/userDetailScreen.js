// userDetailScreen.js
/* ====================================================================================
User Detail Screen (MVP)
- Shows user profile + avatar upload
- Account Info menu
- User Options menu (stub)
- NO contacts on this screen (deprecated)
- FIX: prevent infinite loop caused by refreshUser function identity changes
==================================================================================== */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
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
 * - Web: fetch blob with Authorization, create object URL
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

    if (!authToken) {
      setWebObjectUrl(uri);
      return;
    }

    let alive = true;
    let createdUrl = null;

    (async () => {
      try {
        const res = await fetch(uri, { headers: { Authorization: `Bearer ${authToken}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);

        if (!alive) {
          try {
            URL.revokeObjectURL(createdUrl);
          } catch (_) {}
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
      if (createdUrl) {
        try {
          URL.revokeObjectURL(createdUrl);
        } catch (_) {}
      }
    };
  }, [uri, authToken]);

  if (!uri || failed) return fallback || null;

  if (Platform.OS === 'web') {
    if (!webObjectUrl) return fallback || null;
    return <Image source={{ uri: webObjectUrl }} style={style} />;
  }

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
  const { user, serverUrl, refreshUser, authToken } = useAuth();
  const insets = useSafeAreaInsets();

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

  // ✅ FIX: refreshUser changes identity every provider render; use a ref so our effects stay stable
  const refreshUserRef = useRef(refreshUser);
  useEffect(() => {
    refreshUserRef.current = refreshUser;
  }, [refreshUser]);

  // ✅ Focus refresh without infinite loop (dependency only on navigation)
  useEffect(() => {
    const onFocus = () => {
      refreshUserRef.current?.();
    };

    const unsub = navigation.addListener('focus', onFocus);

    // Run once on mount as well (still safe; no re-run loop)
    onFocus();

    return unsub;
  }, [navigation]);

  // =========================================================
  // AVATAR UPLOAD
  // =========================================================
  const uploadAvatarAsset = useCallback(
    async (asset) => {
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

        // refresh once after upload
        refreshUserRef.current?.();
        Alert.alert('Saved', 'Your avatar was updated.');
      } catch (e) {
        Alert.alert('Error', `Failed to upload avatar: ${String(e?.message || e)}`);
      } finally {
        setAvatarUploading(false);
      }
    },
    [user?.id, serverUrl, authToken]
  );

  const chooseAvatarFromLibrary = useCallback(async () => {
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
  }, [user?.id, serverUrl, uploadAvatarAsset]);

  const openUserOptionsStub = useCallback(() => {
    Alert.alert('User Options', 'Coming soon.');
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={styles.outerContainer}>
        <View style={styles.phoneFrame}>
          <View style={styles.container}>
            {/* ✅ Standard header: "./fasbit" + hamburger */}
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

            <ScrollView
              contentContainerStyle={{
                padding: 16,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 16),
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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

              {/* Account info */}
              <TouchableOpacity
                style={styles.accountInfoCard}
                onPress={() => navigation.navigate('AccountInfo')}
                activeOpacity={0.85}
              >
                <Text style={styles.accountInfoTitle}>Account Info</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {/* New menu below Account Info */}
              <TouchableOpacity style={styles.menuCard} onPress={openUserOptionsStub} activeOpacity={0.85}>
                <Text style={styles.menuTitle}>User Options (stub)</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
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

  container: { flex: 1, width: '100%', backgroundColor: '#111827' },

  topBar: { paddingHorizontal: 16, paddingBottom: 6, backgroundColor: 'transparent' },
  topBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarTitle: { color: '#E5E7EB', fontSize: 16, fontWeight: '800' },
  topBarMenuBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginBottom: 12 },

  avatarRow: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
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
  bigAvatarInitials: { color: '#93C5FD', fontWeight: '900', fontSize: 20 },
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

  accountInfoCard: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountInfoTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', margin: 0 },

  menuCard: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
});

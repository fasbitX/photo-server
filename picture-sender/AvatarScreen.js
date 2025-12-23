// AvatarScreen.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './auth';

const MAX_WIDTH = 300;

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

export default function AvatarScreen({ navigation }) {
  const { user, serverUrl, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [uploading, setUploading] = useState(false);

  const avatarUrl = useMemo(
    () => resolveUploadUrl(serverUrl, user?.avatar_path),
    [serverUrl, user?.avatar_path]
  );

  const takePhotoStub = async () => {
    Alert.alert('Coming soon', 'Take a picture is stubbed for now.');
  };

  const uploadAvatarAsset = async (asset) => {
    if (!user?.id || !serverUrl) return;

    try {
      setUploading(true);

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

      const res = await fetch(url, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');

      await refreshUser?.();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', `Failed to upload avatar: ${String(e?.message || e)}`);
    } finally {
      setUploading(false);
    }
  };

  const chooseFromLibrary = async () => {
    if (!user?.id || !serverUrl) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // <-- works on web/native, no enum needed
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadAvatarAsset(asset);
  };

  return (
    <View style={[styles.outer, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Change Avatar</Text>

          <View style={styles.headerBtn} />
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitials}>{initialsFromUser(user)}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.bigBtn, uploading && styles.bigBtnDisabled]}
            onPress={chooseFromLibrary}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
            <Text style={styles.bigBtnText}>Upload photo (live)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bigBtn, uploading && styles.bigBtnDisabled]}
            onPress={takePhotoStub}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
            <Text style={styles.bigBtnText}>Take picture (stub)</Text>
          </TouchableOpacity>

          {uploading ? (
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={styles.uploadingText}>Uploading…</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_WIDTH,
    backgroundColor: '#111827',
    padding: 16,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: 16,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 22,
  },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  bigBtnDisabled: { opacity: 0.55 },
  bigBtnText: { color: '#FFFFFF', fontWeight: '900' },
  uploadingText: { color: '#9CA3AF', marginTop: 8 },
});

// TextScreen.js
/* The purpose of this code is to create a React Native component that represents a text
 screen for a chat application. It includes functionalities such as fetching messages 
 from a server, sending messages, and handling attachments. The component uses various
  libraries and hooks to manage state, authentication, and other features. */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

import { useAuth } from './auth';
import { useAdmin } from './admin';
import { CLIENT_ID, SECRET_KEY_BASE64 } from './config';

const MAX_WIDTH = 300;

function cleanServerUrl(u) {
  return String(u || '').replace(/\/+$/, '');
}

function makeSignatureBase64({ timestamp, originalName }) {
  // server expects message `${timestamp}:${originalName}`
  const message = `${timestamp}:${originalName}`;
  const messageBytes = naclUtil.decodeUTF8(message);

  // SECRET_KEY_BASE64 should be the nacl signing secret key (64 bytes)
  const secretKey = naclUtil.decodeBase64(SECRET_KEY_BASE64);
  const sig = nacl.sign.detached(messageBytes, secretKey);
  return naclUtil.encodeBase64(sig);
}

async function sha256HexOfString(str) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    str,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

export default function TextScreen({ route }) {
  const { contact } = route.params || {};
  const { user, authToken, serverUrl } = useAuth();
  const { settings, logInfo, logError } = useAdmin();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const [pendingAsset, setPendingAsset] = useState(null); // ImagePicker asset
  const [uploading, setUploading] = useState(false);

  const timerRef = useRef(null);

  const contactName =
    (contact?.user_name && String(contact.user_name).trim()) ||
    contact?.email ||
    'Chat';

  const HEADER_BAR_HEIGHT = 64;
  const keyboardOffset = Platform.OS === 'ios' ? insets.top + HEADER_BAR_HEIGHT : 0;

  const baseUrl = useMemo(() => cleanServerUrl(serverUrl), [serverUrl]);

  const getPrivateMediaUrl = (attachmentPath) => {
    if (!baseUrl || !attachmentPath) return '';
    // Use token query param so <Image> works on web too
    return `${baseUrl}/api/mobile/media?path=${encodeURIComponent(
      attachmentPath
    )}&token=${encodeURIComponent(authToken || '')}`;
  };

  const fetchThread = async () => {
    if (!user?.id || !contact?.id || !baseUrl || !authToken) return;
    setLoading(true);
    try {
      const url = `${baseUrl}/api/mobile/messages/thread`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          contactUserId: contact.id,
          limit: 50,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setConversationId(data.conversationId);
        setMessages(data.messages || []);
      }
    } catch (e) {
      // keep quiet for MVP polling
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();
    timerRef.current = setInterval(fetchThread, 2500);
    return () => timerRef.current && clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, contact?.id, baseUrl, authToken]);

  const pickAttachment = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission required', 'We need access to your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
      });

      if (result.canceled) return;

      const asset = (result.assets || [])[0];
      if (!asset?.uri) return;

      setPendingAsset(asset);
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const cameraStub = () => {
    Alert.alert('Camera', 'Coming soon (stub).');
  };

  const uploadAssetChunked = async (asset) => {
    if (!asset?.uri || !baseUrl) throw new Error('Missing asset/baseUrl');

    const originalName =
      asset.fileName ||
      `image-${Date.now()}${asset.uri.includes('.png') ? '.png' : '.jpg'}`;

    const timestamp = Date.now();
    const signatureBase64 = makeSignatureBase64({ timestamp, originalName });

    // read entire file as base64 string (same shape server hashes)
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileSha256 = await sha256HexOfString(base64);

    // IMPORTANT: controller-style chunking is usually by base64 character length
    const chunkSize = Number(settings?.chunkSize) || 750_000;
    const totalChunks = Math.ceil(base64.length / chunkSize);

    logInfo?.('[chat] upload start', { originalName, totalChunks, chunkSize });

    // 1) start
    const startRes = await fetch(`${baseUrl}/upload-chunk-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        timestamp,
        signatureBase64,
        originalName,
        totalChunks,
        fileSha256,

        // ✅ ensure server stores under uploads/chat/<uploaderId>/
        purpose: 'chat',
        uploaderId: user.id,
      }),
    });

    const startData = await startRes.json();
    if (!startRes.ok || !startData?.uploadId) {
      throw new Error(startData?.error || 'upload-chunk-start failed');
    }

    const uploadId = startData.uploadId;

    // 2) send chunks
    for (let i = 0; i < totalChunks; i++) {
      const chunkDataBase64 = base64.slice(i * chunkSize, (i + 1) * chunkSize);
      const chunkSha256 = await sha256HexOfString(chunkDataBase64);

      const chunkRes = await fetch(`${baseUrl}/upload-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          chunkIndex: i,
          chunkSha256,
          chunkDataBase64,
        }),
      });

      const chunkJson = await chunkRes.json().catch(() => ({}));
      if (!chunkRes.ok) {
        throw new Error(chunkJson?.error || `upload-chunk failed at ${i}`);
      }
    }

    // 3) complete
    const doneRes = await fetch(`${baseUrl}/upload-chunk-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });

    const doneJson = await doneRes.json();
    if (!doneRes.ok || doneJson?.status !== 'ok' || !doneJson?.file?.relativePath) {
      throw new Error(doneJson?.error || 'upload-chunk-complete failed');
    }

    logInfo?.('[chat] upload complete', doneJson.file);
    return doneJson.file; // { relativePath, mime, size, originalName }
  };

  const send = async () => {
    const body = text.trim();
    const hasText = !!body;
    const hasAttach = !!pendingAsset;

    if (!hasText && !hasAttach) return;
    if (!user?.id || !contact?.id || !baseUrl || !authToken) return;

    setText('');

    // optimistic message (shows local image immediately if attached)
    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender_id: user.id,
      recipient_id: contact.id,
      content: hasText ? body : null,
      message_type: hasAttach && hasText ? 'mixed' : hasAttach ? 'media' : 'text',
      sent_date: Date.now(),
      attachment_local_uri: hasAttach ? pendingAsset.uri : null,
    };

    setMessages((prev) => [optimistic, ...prev]);

    try {
      let uploaded = null;

      if (hasAttach) {
        setUploading(true);
        uploaded = await uploadAssetChunked(pendingAsset);
      }

      const res = await fetch(`${baseUrl}/api/mobile/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          recipientId: contact.id,
          content: hasText ? body : null,

          attachmentPath: uploaded?.relativePath || null,
          attachmentMime: uploaded?.mime || pendingAsset?.mimeType || null,
          attachmentSize: uploaded?.size || null,
          attachmentOriginalName: uploaded?.originalName || pendingAsset?.fileName || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'send failed');

      // clear attachment after successful send
      setPendingAsset(null);

      await fetchThread(); // reconcile
    } catch (e) {
      logError?.('[chat] send failed', { error: String(e) });
      await fetchThread();
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={styles.outerContainer}>
        <View style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {contactName}
            </Text>
          </View>

          <View style={styles.content}>
            <FlatList
              style={{ flex: 1 }}
              data={messages}
              inverted
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingVertical: 12 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {loading ? 'Loading...' : 'No messages yet.'}
                </Text>
              }
              renderItem={({ item }) => {
                const mine = Number(item.sender_id) === Number(user?.id);

                const attachmentPath = item.attachment_path;
                const localUri = item.attachment_local_uri;

                const imageUri = attachmentPath
                  ? getPrivateMediaUrl(attachmentPath)
                  : localUri || '';

                return (
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    {!!imageUri && (
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.attachmentImg}
                        resizeMode="cover"
                      />
                    )}

                    {!!item.content && (
                      <Text style={styles.bubbleText}>{String(item.content)}</Text>
                    )}
                  </View>
                );
              }}
            />

            {/* Composer */}
            <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              {/* tiny preview row if an attachment is staged */}
              {!!pendingAsset?.uri && (
                <View style={styles.pendingRow}>
                  <Image source={{ uri: pendingAsset.uri }} style={styles.pendingThumb} />
                  <Text style={styles.pendingText} numberOfLines={1}>
                    {pendingAsset.fileName || 'Photo attached'}
                  </Text>

                  {uploading ? (
                    <ActivityIndicator />
                  ) : (
                    <TouchableOpacity onPress={() => setPendingAsset(null)} activeOpacity={0.7}>
                      <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.composer}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={pickAttachment}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Attach photo"
                >
                  <Ionicons name="attach" size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={cameraStub}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Camera (stub)"
                >
                  <Ionicons name="camera-outline" size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Type a message..."
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  multiline
                />

                <TouchableOpacity
                  style={[styles.sendBtn, uploading ? styles.sendBtnDisabled : null]}
                  onPress={send}
                  activeOpacity={0.85}
                  disabled={uploading}
                >
                  <Text style={styles.sendText}>{uploading ? '...' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },

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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  content: {
    padding: 16,
    flex: 1,
  },

  empty: {
    color: '#9CA3AF',
    textAlign: 'center',
    paddingTop: 18,
  },

  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 8,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: '#1D4ED8',
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#020617',
  },
  bubbleText: { color: '#FFF', fontSize: 14 },

  attachmentImg: {
    width: 220,
    height: 220,
    borderRadius: 14,
    backgroundColor: '#0B1220',
  },

  composerWrap: {},
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    marginTop: 10,
  },
  pendingThumb: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#020617',
  },
  pendingText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 12,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    backgroundColor: '#0B1220',
    padding: 12,
    borderRadius: 16,
    marginTop: 10,
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  input: {
    flex: 1,
    color: '#FFF',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
  },

  sendBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendText: { color: '#FFF', fontWeight: '800' },
});

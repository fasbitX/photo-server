// TextScreen.js
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from './auth';
import { useAdmin } from './admin';
import { CLIENT_ID } from './config';
import { styles } from './TextScreen-styles';
import { ZoomableImageModal, ForwardModal } from './TextScreen-components';
import {
  cleanServerUrl,
  initialsFromUser,
  makeSignatureBase64,
  sha256HexOfString,
  readUriAsBase64,
  safeFileName,
  webOpen,
  webDownload,
  downloadToCacheNative,
  ensureMediaPerm,
  resolvePrivateMediaUrl,
} from './TextScreen-helpers';

export default function TextScreen({ route, navigation }) {
  const { contact } = route.params || {};
  const { user, authToken, serverUrl } = useAuth();
  const { settings, logInfo, logError } = useAdmin();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const [pendingAsset, setPendingAsset] = useState(null);
  const [uploading, setUploading] = useState(false);

  const INPUT_BASELINE = 22;
  const [inputHeight, setInputHeight] = useState(INPUT_BASELINE);

  useEffect(() => {
    if (!text) setInputHeight(INPUT_BASELINE);
  }, [text]);

  const timerRef = useRef(null);
  const busyRef = useRef(false);

  const baseUrl = useMemo(() => cleanServerUrl(serverUrl), [serverUrl]);

  const contactHandle = useMemo(() => {
    const h = String(contact?.user_name || '').trim();
    return h || '@unknown';
  }, [contact?.user_name]);

  const contactAvatarUrl = useMemo(() => {
    return resolvePrivateMediaUrl(baseUrl, authToken, contact?.avatar_path);
  }, [baseUrl, contact?.avatar_path, authToken]);

  const getPrivateMediaUrl = (attachmentPath) => {
    return resolvePrivateMediaUrl(baseUrl, authToken, attachmentPath);
  };

  const HEADER_BAR_HEIGHT = 64;
  const keyboardOffset = Platform.OS === 'ios' ? insets.top + HEADER_BAR_HEIGHT : 0;

  // Viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState('');
  const [viewerMeta, setViewerMeta] = useState({ attachmentPath: null, originalName: null, mime: null });
  const [viewerWorking, setViewerWorking] = useState(false);

  // Forward modal
  const [forwardVisible, setForwardVisible] = useState(false);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardContacts, setForwardContacts] = useState([]);

  const openViewer = ({ uri, attachmentPath, originalName, mime }) => {
    if (!uri) return;
    setViewerUri(uri);
    setViewerMeta({
      attachmentPath: attachmentPath || null,
      originalName: originalName || null,
      mime: mime || null,
    });
    setViewerVisible(true);
  };

  const handleSave = async () => {
    if (!viewerUri) return;

    if (Platform.OS === 'web') {
      const name = safeFileName(viewerMeta?.originalName, 'image.jpg');
      webDownload(viewerUri, name);
      return;
    }

    setViewerWorking(true);
    try {
      const ok = await ensureMediaPerm();
      if (!ok) return;
      const localUri = await downloadToCacheNative(viewerUri, viewerMeta?.originalName);
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Image saved to your photo library.');
    } catch (e) {
      Alert.alert('Save failed', String(e?.message || e));
    } finally {
      setViewerWorking(false);
    }
  };

  const handleShare = async () => {
    if (!viewerUri) return;

    if (Platform.OS === 'web') {
      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ url: viewerUri, title: viewerMeta?.originalName || 'Image' });
          return;
        }
      } catch {}
      webOpen(viewerUri);
      return;
    }

    setViewerWorking(true);
    try {
      const localUri = await downloadToCacheNative(viewerUri, viewerMeta?.originalName);
      const can = await Sharing.isAvailableAsync();
      if (!can) {
        Alert.alert('Sharing not available', 'This device does not support sharing.');
        return;
      }
      await Sharing.shareAsync(localUri);
    } catch (e) {
      Alert.alert('Share failed', String(e?.message || e));
    } finally {
      setViewerWorking(false);
    }
  };

  const loadSavedContactsForForward = async () => {
    if (!baseUrl || !user?.id || !authToken) return;
    setForwardLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/mobile/contacts/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ requesterId: user.id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setForwardContacts(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (e) {
      Alert.alert('Forward', `Failed to load contacts: ${String(e?.message || e)}`);
    } finally {
      setForwardLoading(false);
    }
  };

  const handleForward = async () => {
    if (!viewerMeta?.attachmentPath) {
      Alert.alert('Forward', "This image is not fully uploaded yet, so it can't be forwarded.");
      return;
    }
    setForwardVisible(true);
    await loadSavedContactsForForward();
  };

  const forwardToContact = async (target) => {
    const targetId = target?.id;
    if (!targetId || !viewerMeta?.attachmentPath) return;
    if (!baseUrl || !user?.id || !authToken) return;

    setViewerWorking(true);
    try {
      const res = await fetch(`${baseUrl}/api/mobile/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          senderId: user.id,
          recipientId: targetId,
          content: null,
          attachmentPath: viewerMeta.attachmentPath,
          attachmentMime: viewerMeta.mime || 'image/jpeg',
          attachmentOriginalName: viewerMeta.originalName || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `send failed (${res.status})`);

      Alert.alert('Forwarded', `Sent to @${target?.user_name || 'contact'}.`);
      setForwardVisible(false);
    } catch (e) {
      Alert.alert('Forward failed', String(e?.message || e));
    } finally {
      setViewerWorking(false);
    }
  };

  // TextScreen.js

  const fetchThread = async (opts = {}) => {
    const { showLoading = false } = opts;

    if (busyRef.current) return;
    if (!user?.id || !contact?.id || !baseUrl || !authToken) return;

    busyRef.current = true;
    if (showLoading) setLoading(true);

    try {
      const url = `${baseUrl}/api/mobile/messages/thread`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ contactUserId: contact.id, limit: 50 }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // quiet for MVP
    } finally {
      if (showLoading) setLoading(false);
      busyRef.current = false;
    }
  };

  // ✅ Fixed: Depend on primitive values directly, not on memoized function
  useFocusEffect(
    useCallback(() => {
      // kill any previous interval (prevents duplicates)
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // initial fetch (with spinner)
      fetchThread({ showLoading: true });

      // background poll (silent)
      timerRef.current = setInterval(() => {
        fetchThread({ showLoading: false });
      }, 2500);

      // cleanup on blur/unfocus
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, contact?.id, baseUrl, authToken])
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (type === 'wheel' || type === 'mousewheel' || type === 'touchstart' || type === 'touchmove') {
        // Make wheel/touch events passive by default
        if (typeof options === 'object' && options !== null) {
          options.passive = options.passive !== false; // passive unless explicitly false
        } else if (typeof options === 'boolean') {
          // Convert boolean to object with passive
          options = { capture: options, passive: true };
        } else {
          options = { passive: true };
        }
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    // Cleanup on unmount
    return () => {
      EventTarget.prototype.addEventListener = originalAddEventListener;
    };
  }, []);

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
    } catch {
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const cameraStub = () => Alert.alert('Camera', 'Coming soon (stub).');
  const emojiStub = () => Alert.alert('Emoji', 'Coming soon (stub).');

  const goSendDollar = () => {
    try {
      navigation.navigate('Send$');
    } catch {
      Alert.alert('Navigation', 'Route "Send$" is not registered yet.');
    }
  };

  const uploadAssetChunked = async (asset) => {
    if (!asset?.uri || !baseUrl) throw new Error('Missing asset/baseUrl');

    const originalName = asset.fileName || `image-${Date.now()}${asset.uri.includes('.png') ? '.png' : '.jpg'}`;
    const timestamp = Date.now();
    const signatureBase64 = makeSignatureBase64({ timestamp, originalName });

    const base64 = await readUriAsBase64(asset.uri);
    const fileSha256 = await sha256HexOfString(base64);

    const chunkSize = Number(settings?.chunkSize) || 750_000;
    const totalChunks = Math.ceil(base64.length / chunkSize);

    logInfo?.('[chat] upload start', { originalName, totalChunks, chunkSize });

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
        purpose: 'chat',
        uploaderId: user.id,
      }),
    });

    const startData = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !startData?.uploadId) throw new Error(startData?.error || 'upload-chunk-start failed');

    const uploadId = startData.uploadId;

    for (let i = 0; i < totalChunks; i++) {
      const chunkDataBase64 = base64.slice(i * chunkSize, (i + 1) * chunkSize);
      const chunkSha256 = await sha256HexOfString(chunkDataBase64);

      const chunkRes = await fetch(`${baseUrl}/upload-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, chunkIndex: i, chunkSha256, chunkDataBase64 }),
      });

      const chunkJson = await chunkRes.json().catch(() => ({}));
      if (!chunkRes.ok) throw new Error(chunkJson?.error || `upload-chunk failed at ${i}`);
    }

    const doneRes = await fetch(`${baseUrl}/upload-chunk-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });

    const doneJson = await doneRes.json().catch(() => ({}));
    if (!doneRes.ok || doneJson?.status !== 'ok' || !doneJson?.file?.relativePath) {
      throw new Error(doneJson?.error || 'upload-chunk-complete failed');
    }

    logInfo?.('[chat] upload complete', doneJson.file);
    return doneJson.file;
  };

  const send = async () => {
    const body = text.trim();
    const hasText = !!body;
    const hasAttach = !!pendingAsset;

    if (!hasText && !hasAttach) return;
    if (!user?.id || !contact?.id || !baseUrl || !authToken) return;

    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender_id: user.id,
      recipient_id: contact.id,
      content: hasText ? body : null,
      message_type: hasAttach && hasText ? 'mixed' : hasAttach ? 'media' : 'text',
      sent_date: Date.now(),
      attachment_local_uri: hasAttach ? pendingAsset.uri : null,
      attachment_original_name: hasAttach ? pendingAsset.fileName : null,
      attachment_mime: hasAttach ? pendingAsset.mimeType : null,
    };

    setText('');
    setInputHeight(INPUT_BASELINE);
    setMessages((prev) => [optimistic, ...prev]);

    try {
      busyRef.current = true;

      let uploaded = null;
      if (hasAttach) {
        setUploading(true);
        uploaded = await uploadAssetChunked(pendingAsset);
      }

      const res = await fetch(`${baseUrl}/api/mobile/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          senderId: user.id,
          recipientId: contact.id,
          content: hasText ? body : null,
          attachmentPath: uploaded?.relativePath || null,
          attachmentMime: uploaded?.mime || pendingAsset?.mimeType || null,
          attachmentSize: uploaded?.size || null,
          attachmentOriginalName: uploaded?.originalName || pendingAsset?.fileName || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `send failed (${res.status})`);

      setPendingAsset(null);
      await fetchThread({ showLoading: false });
    } catch (e) {
      logError?.('[chat] send failed', { error: String(e) });
      Alert.alert('Send failed', String(e?.message || e));
      await fetchThread({ showLoading: false });
    } finally {
      setUploading(false);
      busyRef.current = false;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={styles.outerContainer}>
        <View style={styles.phoneFrame}>
          <View style={styles.container}>
            {/* Top transparent title bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <View style={styles.topBarRow}>
                <Text style={styles.topBarTitle}>./fasbit</Text>

                {/* ✅ hamburger -> Settings */}
                <TouchableOpacity
                  style={styles.topBarMenuBtn}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('Settings')}
                >
                  <Ionicons name="menu" size={22} color="#E5E7EB" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Header: avatar + user_name */}
            <View style={[styles.header, { paddingTop: 8 }]}>
              <View style={styles.headerCard}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerAvatarWrap}>
                    {contactAvatarUrl ? (
                      <Image source={{ uri: contactAvatarUrl }} style={styles.headerAvatarImg} />
                    ) : (
                      <Text style={styles.headerAvatarInitials}>{initialsFromUser(contact)}</Text>
                    )}
                  </View>

                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {contactHandle}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.content}>
              <FlatList
                nativeID="chatScroll"
                style={[{ flex: 1 }, styles.chatList]}
                data={messages}
                inverted
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ paddingVertical: 12 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <Text style={styles.empty}>{loading ? 'Loading...' : 'No messages yet.'}</Text>
                }
                renderItem={({ item }) => {
                  const mine = Number(item.sender_id) === Number(user?.id);

                  const attachmentPath = item.attachment_path;
                  const localUri = item.attachment_local_uri;

                  const imageUri = attachmentPath ? getPrivateMediaUrl(attachmentPath) : localUri || '';

                  const originalName =
                    item.attachment_original_name || item.attachmentOriginalName || item.attachment_name || null;

                  const mime = item.attachment_mime || item.attachmentMime || null;

                  return (
                    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                      {!!imageUri && (
                        <Pressable
                          onPress={() =>
                            openViewer({
                              uri: imageUri,
                              attachmentPath: attachmentPath || null,
                              originalName,
                              mime,
                            })
                          }
                          onContextMenu={
                            Platform.OS === 'web'
                              ? (e) => {
                                  try {
                                    e.preventDefault?.();
                                  } catch {}
                                  webOpen(imageUri);
                                }
                              : undefined
                          }
                          style={styles.attachmentPressable}
                        >
                          <Image source={{ uri: imageUri }} style={styles.attachmentImg} resizeMode="cover" />
                        </Pressable>
                      )}

                      {!!item.content && <Text style={styles.bubbleText}>{String(item.content)}</Text>}
                    </View>
                  );
                }}
              />

              {/* Composer */}
              <View style={[styles.composerDock, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
                        <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <View style={styles.composerCard}>
                  <View style={styles.composerTopRow}>
                    <View style={styles.composerIconRow}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={pickAttachment}
                        activeOpacity={0.85}
                        disabled={uploading}
                      >
                        <Ionicons name="attach" size={16} color="#9CA3AF" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={cameraStub}
                        activeOpacity={0.85}
                        disabled={uploading}
                      >
                        <Ionicons name="camera-outline" size={16} color="#9CA3AF" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={emojiStub}
                        activeOpacity={0.85}
                        disabled={uploading}
                      >
                        <Ionicons name="happy-outline" size={16} color="#9CA3AF" />
                      </TouchableOpacity>

                      {/* ✅ $ icon -> Send$ */}
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={goSendDollar}
                        activeOpacity={0.85}
                        disabled={uploading}
                      >
                        <Text
                          style={[
                            styles.dollarIconText, // ok if exists
                            { color: '#9CA3AF', fontSize: 16, fontWeight: '900', lineHeight: 16 },
                          ]}
                        >
                          $
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.sendIconBtn, uploading && styles.sendIconBtnDisabled]}
                      onPress={send}
                      activeOpacity={0.85}
                      disabled={uploading}
                    >
                      <Ionicons name="send" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.inputRow}>
                    <TextInput
                      value={text}
                      onChangeText={setText}
                      placeholder="Message"
                      placeholderTextColor="#9CA3AF"
                      style={[styles.input, { height: Math.min(inputHeight, 92) }]}
                      multiline
                      scrollEnabled={false}
                      editable={!uploading}
                      onContentSizeChange={(e) => {
                        const h = e?.nativeEvent?.contentSize?.height || 22;
                        setInputHeight(Math.max(22, h));
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>

            <ZoomableImageModal
              visible={viewerVisible}
              uri={viewerUri}
              insets={insets}
              working={viewerWorking}
              viewerMeta={viewerMeta}
              onClose={() => setViewerVisible(false)}
              onSave={handleSave}
              onShare={handleShare}
              onForward={handleForward}
              footerText={
                viewerMeta?.originalName
                  ? viewerMeta.originalName
                  : Platform.OS === 'web'
                  ? 'Right-click to open full size'
                  : 'Pinch to zoom • Drag to pan'
              }
            />

            <ForwardModal
              visible={forwardVisible}
              onClose={() => setForwardVisible(false)}
              loading={forwardLoading}
              contacts={forwardContacts}
              onForwardToContact={forwardToContact}
              insets={insets}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

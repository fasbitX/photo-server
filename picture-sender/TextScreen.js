// TextScreen.js
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
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import { PinchGestureHandler, PanGestureHandler, State } from 'react-native-gesture-handler';

// ✅ save/share
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { useAuth } from './auth';
import { useAdmin } from './admin';
import { CLIENT_ID, SECRET_KEY_BASE64 } from './config';

const MAX_WIDTH = 300;

// Web "6 inch" viewport approximation: browsers assume 96px/inch.
const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 576px

function cleanServerUrl(u) {
  return String(u || '').replace(/\/+$/, '');
}

function initialsFromUser(u) {
  const a = String(u?.first_name || '').trim();
  const b = String(u?.last_name || '').trim();
  const i = `${a[0] || ''}${b[0] || ''}`.toUpperCase();
  return i || '@';
}

function makeSignatureBase64({ timestamp, originalName }) {
  const message = `${timestamp}:${originalName}`;
  const messageBytes = naclUtil.decodeUTF8(message);
  const secretKey = naclUtil.decodeBase64(SECRET_KEY_BASE64);
  const sig = nacl.sign.detached(messageBytes, secretKey);
  return naclUtil.encodeBase64(sig);
}

async function sha256HexOfString(str) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, str, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

// Web helper: ArrayBuffer -> base64 (chunked to avoid call stack limits)
function arrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readUriAsBase64(uri) {
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    if (!resp.ok) throw new Error(`Failed to read file (web): ${resp.status}`);
    const blob = await resp.blob();
    const ab = await blob.arrayBuffer();
    return arrayBufferToBase64(ab);
  }

  const encoding = FileSystem?.EncodingType?.Base64 ?? 'base64';

  try {
    return await FileSystem.readAsStringAsync(uri, { encoding });
  } catch (e) {
    const msg = String(e?.message || e);
    const looksLikeContentUri = String(uri || '').startsWith('content://');

    if (looksLikeContentUri || msg.toLowerCase().includes('content') || msg.toLowerCase().includes('scheme')) {
      const dest = `${FileSystem.cacheDirectory}upload-${Date.now()}.bin`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      return await FileSystem.readAsStringAsync(dest, { encoding });
    }

    throw e;
  }
}

function safeFileName(name, fallback = 'image.jpg') {
  const raw = String(name || '').trim();
  if (!raw) return fallback;
  return raw.replace(/[^\w.\-]+/g, '_');
}

function webOpen(url) {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function webDownload(url, filename = 'image.jpg') {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * ✅ Works on native + web
 * - Web: simple full-screen modal + right click opens full size.
 * - Native: pinch-to-zoom + pan using gesture-handler and Animated.
 */
function ZoomableImageModal({
  visible,
  uri,
  onClose,
  onSave,
  onShare,
  onForward,
  working,
  insets,
  footerText,
}) {
  if (Platform.OS === 'web') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.viewerOverlay}>
          <View style={[styles.viewerHeader, { paddingTop: (insets?.top || 0) + 10 }]}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {working ? (
              <ActivityIndicator />
            ) : (
              <View style={styles.viewerHeaderActions}>
                <TouchableOpacity onPress={onSave} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                  <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onShare} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                  <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onForward} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                  <Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Pressable style={styles.viewerBackdrop} onPress={onClose}>
            <Pressable style={styles.viewerImageWrap} onPress={() => {}}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                  onContextMenu={(e) => {
                    try {
                      e.preventDefault?.();
                    } catch {}
                    try {
                      window.open(uri, '_blank', 'noopener,noreferrer');
                    } catch {}
                  }}
                />
              ) : null}
            </Pressable>
          </Pressable>

          <View style={[styles.viewerFooter, { paddingBottom: Math.max(insets?.bottom || 0, 12) }]}>
            <Text style={styles.viewerFooterText} numberOfLines={1}>
              {footerText || 'Right-click to open full size'}
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  const baseScale = React.useRef(new Animated.Value(1)).current;
  const pinchScale = React.useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);

  const baseX = React.useRef(new Animated.Value(0)).current;
  const baseY = React.useRef(new Animated.Value(0)).current;
  const panX = React.useRef(new Animated.Value(0)).current;
  const panY = React.useRef(new Animated.Value(0)).current;

  const translateX = Animated.add(baseX, panX);
  const translateY = Animated.add(baseY, panY);

  const last = React.useRef({ x: 0, y: 0, s: 1 }).current;

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPanEvent = Animated.event([{ nativeEvent: { translationX: panX, translationY: panY } }], {
    useNativeDriver: true,
  });

  const resetTransforms = () => {
    last.x = 0;
    last.y = 0;
    last.s = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
    baseX.setValue(0);
    baseY.setValue(0);
    panX.setValue(0);
    panY.setValue(0);
  };

  const onPinchStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      last.s *= e.nativeEvent.scale;
      if (last.s < 1) last.s = 1;
      if (last.s > 6) last.s = 6;

      baseScale.setValue(last.s);
      pinchScale.setValue(1);

      if (last.s === 1) {
        baseX.setValue(0);
        baseY.setValue(0);
        panX.setValue(0);
        panY.setValue(0);
        last.x = 0;
        last.y = 0;
      }
    }
  };

  const onPanStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      last.x += e.nativeEvent.translationX;
      last.y += e.nativeEvent.translationY;

      baseX.setValue(last.x);
      baseY.setValue(last.y);
      panX.setValue(0);
      panY.setValue(0);

      if (last.s === 1) {
        baseX.setValue(0);
        baseY.setValue(0);
        last.x = 0;
        last.y = 0;
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        resetTransforms();
        onClose();
      }}
    >
      <View style={styles.viewerOverlay}>
        <View style={[styles.viewerHeader, { paddingTop: (insets?.top || 0) + 10 }]}>
          <TouchableOpacity
            onPress={() => {
              resetTransforms();
              onClose();
            }}
            activeOpacity={0.8}
            style={styles.viewerHeaderBtn}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {working ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.viewerHeaderActions}>
              <TouchableOpacity onPress={onSave} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                <Ionicons name="share-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onForward} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                <Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => {
            resetTransforms();
            onClose();
          }}
        >
          <Pressable style={styles.viewerImageWrap} onPress={() => {}}>
            <PanGestureHandler onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange}>
              <Animated.View>
                <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
                  <Animated.View>
                    {uri ? (
                      <Animated.View
                        style={[
                          styles.viewerImageTransformWrap,
                          { transform: [{ translateX }, { translateY }, { scale }] },
                        ]}
                      >
                        <Image
                          key={uri}
                          source={{ uri }}
                          style={styles.viewerImage}
                          resizeMode="contain"
                          onLoadStart={() => console.log('[viewer] load start', uri)}
                          onLoadEnd={() => console.log('[viewer] load end', uri)}
                          onError={(e) => console.log('[viewer] load error', uri, e?.nativeEvent)}
                        />
                      </Animated.View>
                    ) : null}
                  </Animated.View>
                </PinchGestureHandler>
              </Animated.View>
            </PanGestureHandler>
          </Pressable>
        </Pressable>

        <View style={[styles.viewerFooter, { paddingBottom: Math.max(insets?.bottom || 0, 12) }]}>
          <Text style={styles.viewerFooterText} numberOfLines={1}>
            {footerText || 'Pinch to zoom • Drag to pan'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

export default function TextScreen({ route }) {
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
    const p = String(contact?.avatar_path || '').trim().replace(/^\/+/, '');
    if (!baseUrl || !p) return '';
    return `${baseUrl}/api/mobile/media?path=${encodeURIComponent(p)}&token=${encodeURIComponent(authToken || '')}`;
  }, [baseUrl, contact?.avatar_path, authToken]);

  const getPrivateMediaUrl = (attachmentPath) => {
    if (!baseUrl || !attachmentPath) return '';
    return `${baseUrl}/api/mobile/media?path=${encodeURIComponent(
      attachmentPath
    )}&token=${encodeURIComponent(authToken || '')}`;
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
    setViewerMeta({ attachmentPath: attachmentPath || null, originalName: originalName || null, mime: mime || null });
    setViewerVisible(true);
  };

  const downloadToCacheNative = async (url, suggestedName) => {
    const name = safeFileName(suggestedName, `image-${Date.now()}.jpg`);
    const dest = `${FileSystem.cacheDirectory}${name}`;
    const res = await FileSystem.downloadAsync(url, dest);
    return res.uri;
  };

  const ensureMediaPerm = async () => {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'We need access to save to your library.');
      return false;
    }
    return true;
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
      Alert.alert('Forward', 'This image is not fully uploaded yet, so it can’t be forwarded.');
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

  const fetchThread = async () => {
    if (busyRef.current) return;
    if (!user?.id || !contact?.id || !baseUrl || !authToken) return;

    setLoading(true);
    try {
      const url = `${baseUrl}/api/mobile/messages/thread`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ contactUserId: contact.id, limit: 50 }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // quiet for MVP
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();

    timerRef.current = setInterval(() => {
      if (busyRef.current) return;
      fetchThread();
    }, 2500);

    return () => timerRef.current && clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, contact?.id, baseUrl, authToken]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const styleId = 'hide-chat-scrollbar';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      #chatScroll {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      #chatScroll::-webkit-scrollbar {
        width: 0px;
        height: 0px;
        display: none;
      }
    `;
    document.head.appendChild(style);
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
      await fetchThread();
    } catch (e) {
      logError?.('[chat] send failed', { error: String(e) });
      Alert.alert('Send failed', String(e?.message || e));
      await fetchThread();
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
            {/* ✅ Top transparent title bar (under status bar) */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <View style={styles.topBarRow}>
                <Text style={styles.topBarTitle}>./fasbit</Text>

                <TouchableOpacity
                  style={styles.topBarMenuBtn}
                  activeOpacity={0.85}
                  onPress={() => console.log('[text] menu pressed')}
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

              {/* ✅ Composer */}
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

            {/* Forward picker */}
            <Modal visible={forwardVisible} transparent animationType="fade" onRequestClose={() => setForwardVisible(false)}>
              <View style={styles.forwardOverlay}>
                <View style={[styles.forwardCard, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <View style={styles.forwardHeader}>
                    <Text style={styles.forwardTitle}>Forward to…</Text>
                    <TouchableOpacity onPress={() => setForwardVisible(false)} activeOpacity={0.8}>
                      <Ionicons name="close" size={22} color="#E5E7EB" />
                    </TouchableOpacity>
                  </View>

                  {forwardLoading ? (
                    <View style={{ paddingVertical: 18 }}>
                      <ActivityIndicator />
                    </View>
                  ) : (
                    <FlatList
                      data={forwardContacts}
                      keyExtractor={(it) => String(it.id)}
                      style={{ maxHeight: 320 }}
                      ListEmptyComponent={<Text style={styles.forwardEmpty}>No saved contacts.</Text>}
                      renderItem={({ item }) => {
                        const handle = String(item?.user_name || '').trim() || 'contact';
                        return (
                          <TouchableOpacity
                            style={styles.forwardRow}
                            onPress={() => forwardToContact(item)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.forwardAvatar}>
                              <Text style={styles.forwardAvatarTxt}>
                                {String(handle).replace(/^@/, '').slice(0, 2).toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.forwardRowTxt} numberOfLines={1}>
                              @{handle.replace(/^@/, '')}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  )}
                </View>
              </View>
            </Modal>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },

  // ✅ edge-to-edge dark blue on native; web keeps black around the "phone preview"
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

  // ✅ was missing in your file
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

  // ✅ top transparent title bar
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: 'transparent',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '800',
  },
  topBarMenuBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#111827',
  },

  headerCard: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },

  headerAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerAvatarInitials: { color: '#93C5FD', fontWeight: '900', fontSize: 12 },

  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  content: { paddingHorizontal: 16, paddingBottom: 10, flex: 1 },

  empty: { color: '#9CA3AF', textAlign: 'center', paddingTop: 18 },

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
  mine: { alignSelf: 'flex-end', backgroundColor: '#1D4ED8' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#020617' },
  bubbleText: { color: '#FFF', fontSize: 14 },

  attachmentPressable: { borderRadius: 14, overflow: 'hidden' },
  attachmentImg: { width: 220, height: 220, borderRadius: 14, backgroundColor: '#0B1220' },

  composerDock: { marginTop: 6 },

  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    marginBottom: 6,
  },
  pendingThumb: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#020617' },
  pendingText: { flex: 1, color: '#D1D5DB', fontSize: 12 },

  composerCard: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 16,
    padding: 8,
  },

  composerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  composerIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  sendIconBtn: {
    width: 25,
    height: 25,
    borderRadius: 500,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  sendIconBtnDisabled: { opacity: 0.6 },

  inputRow: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: { color: '#FFF', fontSize: 14, padding: 0, lineHeight: 18 },

  chatList: Platform.select({
    web: { scrollbarWidth: 'none', msOverflowStyle: 'none' },
    default: {},
  }),

  viewerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewerHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  viewerFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 10 },
  viewerFooterText: { color: '#E5E7EB', fontSize: 12, opacity: 0.9 },

  forwardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  forwardCard: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    borderRadius: 18,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
  },
  forwardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  forwardTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  forwardEmpty: { color: '#9CA3AF', paddingVertical: 14, textAlign: 'center' },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#020617',
    marginBottom: 8,
  },
  forwardAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  forwardAvatarTxt: { color: '#93C5FD', fontWeight: '900', fontSize: 11 },
  forwardRowTxt: { flex: 1, color: '#E5E7EB', fontWeight: '800' },

  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  viewerBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImageWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerImageTransformWrap: { width: '100%', height: '100%' },
});

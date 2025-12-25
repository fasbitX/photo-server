// TextScreen-helpers.js
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library';
import { Platform, Alert } from 'react-native';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import { SECRET_KEY_BASE64 } from './config';

export function cleanServerUrl(u) {
  return String(u || '').replace(/\/+$/, '');
}

export function initialsFromUser(u) {
  const a = String(u?.first_name || '').trim();
  const b = String(u?.last_name || '').trim();
  const i = `${a[0] || ''}${b[0] || ''}`.toUpperCase();
  return i || '@';
}

export function makeSignatureBase64({ timestamp, originalName }) {
  const message = `${timestamp}:${originalName}`;
  const messageBytes = naclUtil.decodeUTF8(message);
  const secretKey = naclUtil.decodeBase64(SECRET_KEY_BASE64);
  const sig = nacl.sign.detached(messageBytes, secretKey);
  return naclUtil.encodeBase64(sig);
}

export async function sha256HexOfString(str) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, str, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

// Web helper: ArrayBuffer -> base64 (chunked to avoid call stack limits)
export function arrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function readUriAsBase64(uri) {
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

export function safeFileName(name, fallback = 'image.jpg') {
  const raw = String(name || '').trim();
  if (!raw) return fallback;
  return raw.replace(/[^\w.\-]+/g, '_');
}

export function webOpen(url) {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function webDownload(url, filename = 'image.jpg') {
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
 * Download a file to device cache (native only)
 */
export async function downloadToCacheNative(url, suggestedName) {
  const name = safeFileName(suggestedName, `image-${Date.now()}.jpg`);
  const dest = `${FileSystem.cacheDirectory}${name}`;
  const res = await FileSystem.downloadAsync(url, dest);
  return res.uri;
}

/**
 * Request media library permissions (native only)
 */
export async function ensureMediaPerm() {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (perm.status !== 'granted') {
    Alert.alert('Permission required', 'We need access to save to your library.');
    return false;
  }
  return true;
}

/**
 * Build a private media URL that requires authentication
 */
export function resolvePrivateMediaUrl(serverUrl, authToken, path) {
  if (!serverUrl || !path) return '';
  const base = cleanServerUrl(serverUrl);
  return `${base}/api/mobile/media?path=${encodeURIComponent(
    path
  )}&token=${encodeURIComponent(authToken || '')}`;
}
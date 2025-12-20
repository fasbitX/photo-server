import { Alert, Platform } from 'react-native';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import nacl from 'tweetnacl';
import * as util from 'tweetnacl-util';
import * as FileSystem from 'expo-file-system';
const FileSystemLegacy = FileSystem;

import { processImageForUpload } from './admin';

const CHUNK_TIMEOUT_MS = 20000; // 20 seconds per chunk
const RETRY_DELAY_MS = 60_000;  // 1 minute before retry on timeout

// Decide how many parallel chunk upload "threads" to use based on network state + admin prefs.
async function getParallelThreads(settings, logInfo) {
  try {
    const state = await NetInfo.fetch();
    const details = state.details || {};

    logInfo('NetInfo state', {
      type: state.type,
      isConnected: state.isConnected,
      details,
    });

    // 1) Hard block if totally offline
    if (!state.isConnected) {
      return {
        ok: false,
        reason: 'No network connection. Please connect and try again.',
      };
    }

    const pref = settings.networkPreference || 'any';

    // 2) Enforce Wi-Fi only (to protect data usage)
    if (pref === 'wifi' && state.type !== 'wifi') {
      return {
        ok: false,
        reason:
          'Uploads are set to Wi-Fi only. Connect to Wi-Fi or change the setting in the gear menu.',
      };
    }

    // 3) “Cell only”
    // We DO NOT block just because Wi-Fi is turned on.
    // If there is *any* active connection, we allow upload.

    // 4) Determine an "effective" type just for heuristics:
    let effectiveType = state.type;

    if (pref === 'wifi') {
      effectiveType = 'wifi';
    } else if (pref === 'cellular') {
      // Treat as cellular for concurrency heuristics even if OS routes over Wi-Fi.
      effectiveType = 'cellular';
    }

    let threads = 1;

    if (effectiveType === 'wifi') {
      // ── Wi-Fi heuristics (we get strength 0–100 on most devices)
      const strength =
        typeof details.strength === 'number' ? details.strength : null;

      if (strength !== null) {
        if (strength >= 70) {
          threads = 4; // strong Wi-Fi
        } else if (strength >= 40) {
          threads = 3; // medium Wi-Fi
        } else {
          threads = 2; // weak Wi-Fi but still usable
        }
      } else {
        // No strength info → assume decent Wi-Fi
        threads = 4;
      }
    } else if (effectiveType === 'cellular') {
      // ── Cellular heuristics
      const gen = details.cellularGeneration; // '2g' | '3g' | '4g' | '5g' | null
      const expensive =
        typeof details.isConnectionExpensive === 'boolean'
          ? details.isConnectionExpensive
          : true; // default to "expensive" if unknown

      if (gen === '5g') {
        threads = 4;
      } else if (gen === '4g') {
        if (!expensive) {
          threads = 3;
        } else {
          threads = 2;
        }
      } else if (gen === '3g') {
        threads = 2;
      } else {
        threads = 1;
      }
    } else {
      // Other types (ethernet, vpn, unknown) → stay conservative but usable
      threads = 2;
    }

    // Safety clamps
    if (!Number.isFinite(threads) || threads < 1) threads = 1;
    if (threads > 4) threads = 4;

    // 🔹 EXTRA LOGGING: thread decision + gen/strength
    logInfo('Upload thread decision', {
      pref,
      actualType: state.type,
      effectiveType,
      threads,
      cellularGeneration: details.cellularGeneration || null,
      isConnectionExpensive:
        typeof details.isConnectionExpensive === 'boolean'
          ? details.isConnectionExpensive
          : null,
      wifiStrength:
        effectiveType === 'wifi' && typeof details.strength === 'number'
          ? details.strength
          : null,
    });

    return { ok: true, threads, netState: state };
  } catch (err) {
    logInfo('NetInfo check failed, defaulting to 1 thread', {
      error: String(err),
    });
    return { ok: true, threads: 1, netState: null };
  }
}

// ───────────────────────────────────────────────────────────────
// Chunk size heuristics (dynamic, based on network + threads)
// ───────────────────────────────────────────────────────────────

function chooseChunkSizeBytes({
  effectiveType,
  wifiStrength,
  cellularGeneration,
  threads,
  isConnectionExpensive,
}) {
  const MIN_CHUNK = 128 * 1024;   // 128 KB
  const MAX_CHUNK = 1024 * 1024;  // 1 MB

  let baseChunk = MIN_CHUNK;

  if (effectiveType === 'wifi') {
    if (typeof wifiStrength === 'number') {
      if (wifiStrength >= 70) {
        baseChunk = 512 * 1024;  // strong Wi-Fi
      } else if (wifiStrength >= 40) {
        baseChunk = 256 * 1024;  // medium Wi-Fi
      } else {
        baseChunk = 192 * 1024;  // weak Wi-Fi
      }
    } else {
      baseChunk = 512 * 1024;    // assume good Wi-Fi
    }
  } else if (effectiveType === 'cellular') {
    const gen = cellularGeneration;
    if (gen === '5g') {
      baseChunk = 512 * 1024;
    } else if (gen === '4g') {
      // Slightly smaller on typical metered LTE
      baseChunk = isConnectionExpensive ? 256 * 1024 : 384 * 1024;
    } else if (gen === '3g') {
      baseChunk = 192 * 1024;
    } else {
      // 2g / unknown
      baseChunk = 128 * 1024;
    }
  } else {
    // ethernet / vpn / unknown
    baseChunk = 256 * 1024;
  }

  // Scale a bit with threads, but clamp
  const t = Math.max(1, Math.min(threads || 1, 4));
  const multiplierByThreads = { 1: 1.0, 2: 1.25, 3: 1.5, 4: 2.0 };
  let scaled = baseChunk * (multiplierByThreads[t] || 1.0);

  if (scaled < MIN_CHUNK) scaled = MIN_CHUNK;
  if (scaled > MAX_CHUNK) scaled = MAX_CHUNK;

  return Math.round(scaled);
}

function pickChunkSizeWithMaxChunks(fileSizeBytes, baseChunkBytes) {
  const MAX_CHUNKS = 500;
  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return baseChunkBytes;
  }
  const minChunkSizeForCount = Math.ceil(fileSizeBytes / MAX_CHUNKS);
  const chosen = Math.max(baseChunkBytes, minChunkSizeForCount);
  return chosen;
}

// ───────────────────────────────────────────────────────────────
// Helper: fetch with timeout, return { res, text, json? }
// ───────────────────────────────────────────────────────────────

async function fetchWithTimeoutJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { res, text, json };
  } finally {
    clearTimeout(id);
  }
}

function isTimeoutError(err) {
  const msg = String(err || '');
  return (
    msg.includes('AbortError') ||
    msg.includes('Network request failed') ||
    msg.toLowerCase().includes('timeout')
  );
}

// Send a single chunk with a retry-after-1-minute on timeout.
async function sendChunkWithRetry({
  uploadId,
  chunkIndex,
  chunkDataBase64,
  chunkSha256,
  serverUrl,
  logInfo,
  logError,
}) {
  const url = `${serverUrl.replace(/\/+$/, '')}/upload-chunk`;
  const payload = {
    uploadId,
    chunkIndex,
    chunkSha256,
    chunkDataBase64,
  };

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logInfo('Sending chunk', { uploadId, chunkIndex, attempt });
      const { res, text, json } = await fetchWithTimeoutJson(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        CHUNK_TIMEOUT_MS
      );

      if (!res.ok) {
        logError('Chunk HTTP error', {
          status: res.status,
          textSnippet: text.slice(0, 200),
          uploadId,
          chunkIndex,
        });
        throw new Error(`Chunk HTTP ${res.status}`);
      }

      if (!json || json.ok !== true) {
        logError('Chunk server responded not-ok', {
          json,
          uploadId,
          chunkIndex,
        });
        throw new Error('Chunk server not-ok');
      }

      return; // success
    } catch (err) {
      if (attempt < maxAttempts && isTimeoutError(err)) {
        logError('Chunk upload timed out, will retry after 60s', {
          uploadId,
          chunkIndex,
          error: String(err),
        });
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      logError('Chunk upload failed', {
        uploadId,
        chunkIndex,
        error: String(err),
      });
      throw err;
    }
  }
}

// Upload all chunks for one file using a limited number of worker "threads".
async function uploadAllChunksConcurrent({
  uploadId,
  chunks,
  serverUrl,
  threads,
  logInfo,
  logError,
}) {
  let index = 0;
  const total = chunks.length;
  const workers = [];

  const worker = async () => {
    while (true) {
      const myIndex = index;
      if (myIndex >= total) return;
      index += 1;

      const c = chunks[myIndex];
      await sendChunkWithRetry({
        uploadId,
        chunkIndex: c.index,
        chunkDataBase64: c.data,
        chunkSha256: c.sha256,
        serverUrl,
        logInfo,
        logError,
      });
    }
  };

  const numWorkers = Math.max(1, Math.min(threads || 1, total || 1));
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

// Build gallery items and return work list
function buildWorkItems(assets, addGalleryItem) {
  const now = Date.now();
  return assets.map((asset, idx) => {
    const id = `${now}-${idx}-${Math.random().toString(36).slice(2)}`;
    const fileName =
      asset.fileName ||
      (typeof asset.uri === 'string'
        ? asset.uri.split('/').pop() || 'photo.jpg'
        : 'photo.jpg');

    const galleryItem = {
      id,
      uri: asset.uri,
      fileName,
      status: 'queued', // black
      createdAt: new Date().toISOString(),
    };

    if (addGalleryItem) {
      addGalleryItem(galleryItem);
    }

    return { asset, galleryId: id, fileName };
  });
}

// Whole-file upload (non-chunked) – legacy path (no longer used by controller,
// but kept here in case you want to re-enable it for testing).
async function uploadWholeFiles({
  workItems,
  clientId,
  secretKeyBase64,
  serverUrl,
  settings,
  logInfo,
  logError,
  updateGalleryItem,
}) {
  const secretKey = util.decodeBase64(secretKeyBase64);
  let successCount = 0;
  let failureCount = 0;

  for (const { asset, galleryId, fileName } of workItems) {
    try {
      if (updateGalleryItem) {
        updateGalleryItem(galleryId, { status: 'sending' }); // yellow
      }

      const processed = await processImageForUpload(asset, settings);
      logInfo('Image processed for whole-file upload', {
        original: {
          uri: asset.uri,
          fileName,
          width: asset.width,
          height: asset.height,
        },
        processed,
      });

      const timestamp = Date.now().toString();
      const originalName = processed.fileName || fileName || 'photo.jpg';

      const message = `${timestamp}:${originalName}`;
      const messageBytes = util.decodeUTF8(message);
      const signature = nacl.sign.detached(messageBytes, secretKey);
      const signatureBase64 = util.encodeBase64(signature);

      const formData = new FormData();
      formData.append('clientId', clientId);
      formData.append('timestamp', timestamp);
      formData.append('signatureBase64', signatureBase64);

      const mimeType = processed.mimeType || 'image/jpeg';

      if (Platform.OS === 'web') {
        const response = await fetch(processed.uri);
        const blob = await response.blob();
        formData.append('photo', blob, originalName);
      } else {
        formData.append('photo', {
          uri: processed.uri,
          name: originalName,
          type: mimeType,
        });
      }

      const uploadUrl = `${serverUrl.replace(/\/+$/, '')}/upload`;
      logInfo('Sending whole-file POST /upload', {
        url: uploadUrl,
        file: originalName,
      });

      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      const status = res.status;
      const resText = await res.text();
      let json = null;
      try {
        json = resText ? JSON.parse(resText) : null;
      } catch (parseErr) {
        logError('Failed to parse JSON from whole-file upload response', {
          status,
          resTextSnippet: resText.slice(0, 500),
          parseErr: String(parseErr),
          file: originalName,
        });
      }

      logInfo('Whole-file upload response raw', {
        status,
        resTextSnippet: resText.slice(0, 500),
        file: originalName,
      });

      if (!res.ok) {
        failureCount++;
        logError('Whole-file upload failed (HTTP error)', {
          status,
          json,
          file: originalName,
        });
        if (updateGalleryItem) {
          updateGalleryItem(galleryId, { status: 'failed' }); // red
        }
      } else {
        successCount++;
        if (updateGalleryItem) {
          updateGalleryItem(galleryId, { status: 'verified' }); // green
        }
        logInfo('Whole-file upload succeeded', {
          file: originalName,
          json,
        });
      }
    } catch (err) {
      failureCount++;
      logError('Unexpected error in whole-file upload', {
        error: String(err),
        file: fileName,
      });
      if (updateGalleryItem) {
        updateGalleryItem(galleryId, { status: 'failed' });
      }
    }
  }

  return { successCount, failureCount };
}

// Unified file-reader for chunked uploads.
async function readFileForChunks(processed, logInfo, logError) {
  const uri = processed.uri;

  // WEB: processed.uri is a blob: URL → use browser APIs
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileSize = blob.size || 0;

      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          // result is like "data:image/jpeg;base64,AAAA..."
          if (typeof result === 'string') {
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
          } else {
            resolve('');
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      logInfo('Read file for chunked upload (web)', {
        uri,
        fileSize,
        base64Length: base64Data.length,
      });

      return { base64Data, fileSize };
    } catch (err) {
      logError('Error reading blob on web for chunked upload', {
        error: String(err),
        uri,
      });
      throw err;
    }
  }

  // NATIVE (iOS / Android): use new File API, with legacy fallback
  try {
    // new File requires a URI string (file:// or content:// etc.)
    const file = new File(uri);
    const fileSize = file.size ?? 0;
    const base64Data = await file.base64();

    logInfo('Read file for chunked upload (native File API)', {
      uri: file.uri,
      fileSize,
      base64Length: base64Data.length,
    });

    return { base64Data, fileSize };
  } catch (fileErr) {
    logError('Error with new File API, falling back to legacy', {
      error: String(fileErr),
      uri,
    });

    const info = await FileSystem.getInfoAsync(uri, { size: true });
    const fileSize = info.size || 0;
    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    logInfo('Read file for chunked upload (legacy fallback)', {
      uri,
      fileSize,
      base64Length: base64Data.length,
    });

    return { base64Data, fileSize };
  }
}

// Chunked upload for all files (now the only path used by controller).
async function uploadChunkedFiles({
  workItems,
  clientId,
  secretKeyBase64,
  serverUrl,
  settings,
  logInfo,
  logError,
  updateGalleryItem,
}) {
  const secretKey = util.decodeBase64(secretKeyBase64);
  const net = await getParallelThreads(settings, logInfo);

  if (!net.ok) {
    logError('Upload blocked by network preference', { reason: net.reason });
    Alert.alert('Network preference', net.reason);
    return { successCount: 0, failureCount: workItems.length };
  }

  const threads = net.threads;
  const netState = net.netState || null;
  const details = (netState && netState.details) || {};
  const pref = settings.networkPreference || 'any';

  let effectiveType = netState ? netState.type : 'unknown';
  if (pref === 'wifi') {
    effectiveType = 'wifi';
  } else if (pref === 'cellular') {
    effectiveType = 'cellular';
  }

  const wifiStrength =
    effectiveType === 'wifi' && typeof details.strength === 'number'
      ? details.strength
      : null;
  const cellularGeneration =
    typeof details.cellularGeneration === 'string'
      ? details.cellularGeneration
      : details.cellularGeneration || null;
  const isConnectionExpensive =
    typeof details.isConnectionExpensive === 'boolean'
      ? details.isConnectionExpensive
      : null;

  logInfo('Chunked upload network summary', {
    pref,
    actualType: netState ? netState.type : null,
    effectiveType,
    threads,
    wifiStrength,
    cellularGeneration,
    isConnectionExpensive,
  });

  logInfo('Chunked upload will use threads', { threads });

  let successCount = 0;
  let failureCount = 0;

  for (const { asset, galleryId, fileName } of workItems) {
    try {
      if (updateGalleryItem) {
        updateGalleryItem(galleryId, { status: 'sending' }); // yellow
      }

      const processed = await processImageForUpload(asset, settings);
      logInfo('Image processed for chunked upload', {
        original: {
          uri: asset.uri,
          fileName,
          width: asset.width,
          height: asset.height,
        },
        processed,
      });

      // Read file contents into base64 + size using platform-aware helper
      const { base64Data, fileSize } = await readFileForChunks(
        processed,
        logInfo,
        logError
      );

      const fileSha256 = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        base64Data,
        { encoding: Crypto.CryptoEncoding.HEX }
      );

      // ── Dynamic chunk size selection
      const baseChunkBytes = chooseChunkSizeBytes({
        effectiveType,
        wifiStrength,
        cellularGeneration,
        threads,
        isConnectionExpensive,
      });

      const chunkSizeBytes = pickChunkSizeWithMaxChunks(
        fileSize,
        baseChunkBytes
      );

      // Convert desired byte size to an approximate base64 length (multiple of 4).
      const base64ChunkLen = Math.max(
        4,
        Math.ceil(chunkSizeBytes / 3) * 4
      );
      const totalChunks = Math.ceil(base64Data.length / base64ChunkLen);

      const timestamp = Date.now().toString();
      const originalName = processed.fileName || fileName || 'photo.jpg';

      const message = `${timestamp}:${originalName}`;
      const messageBytes = util.decodeUTF8(message);
      const signature = nacl.sign.detached(messageBytes, secretKey);
      const signatureBase64 = util.encodeBase64(signature);

      const startUrl = `${serverUrl.replace(/\/+$/, '')}/upload-chunk-start`;

      logInfo('Starting chunked upload', {
        file: originalName,
        fileSize,
        threads,
        effectiveType,
        wifiStrength,
        cellularGeneration,
        isConnectionExpensive,
        baseChunkBytes,
        chunkSizeBytes,
        approxBase64ChunkLen: base64ChunkLen,
        totalChunks,
      });

      const startBody = {
        clientId,
        timestamp,
        signatureBase64,
        originalName,
        totalChunks,
        fileSha256,
      };

      const { res: startRes, text: startText, json: startJson } =
        await fetchWithTimeoutJson(
          startUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(startBody),
          },
          15000
        );

      if (!startRes.ok || !startJson || !startJson.uploadId) {
        failureCount++;
        logError('upload-chunk-start failed', {
          status: startRes.status,
          textSnippet: startText.slice(0, 200),
          json: startJson,
          file: originalName,
        });
        if (updateGalleryItem) {
          updateGalleryItem(galleryId, { status: 'failed' });
        }
        continue;
      }

      const uploadId = startJson.uploadId;
      logInfo('Chunked upload session created', { uploadId });

      // Build chunk descriptors
      const chunks = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * base64ChunkLen;
        const end = Math.min(base64Data.length, start + base64ChunkLen);
        const chunkDataBase64 = base64Data.slice(start, end);
        const chunkSha256 = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          chunkDataBase64,
          { encoding: Crypto.CryptoEncoding.HEX }
        );
        chunks.push({
          index: i,
          data: chunkDataBase64,
          sha256: chunkSha256,
        });
      }

      await uploadAllChunksConcurrent({
        uploadId,
        chunks,
        serverUrl,
        threads,
        logInfo,
        logError,
      });

      const completeUrl = `${serverUrl.replace(
        /\/+$/,
        ''
      )}/upload-chunk-complete`;
      const { res: cRes, text: cText, json: cJson } =
        await fetchWithTimeoutJson(
          completeUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId }),
          },
          30000
        );

      if (
        !cRes.ok ||
        !cJson ||
        cJson.status !== 'ok' ||
        cJson.verified !== true
      ) {
        failureCount++;
        logError('upload-chunk-complete failed or unverified', {
          status: cRes.status,
          textSnippet: cText.slice(0, 200),
          json: cJson,
          file: originalName,
        });
        if (updateGalleryItem) {
          updateGalleryItem(galleryId, { status: 'failed' });
        }
        continue;
      }

      successCount++;
      if (updateGalleryItem) {
        updateGalleryItem(galleryId, { status: 'verified' }); // green
      }
      logInfo('Chunked upload succeeded and verified', {
        file: originalName,
        response: cJson,
      });
    } catch (err) {
      failureCount++;
      logError('Unexpected error in chunked upload for file', {
        error: String(err),
        file: fileName,
      });
      if (updateGalleryItem) {
        updateGalleryItem(galleryId, { status: 'failed' });
      }
    }
  }

  return { successCount, failureCount };
}

// Main entry point called from App.js
export async function uploadPhotosWithController({
  assets,
  clientId,
  secretKeyBase64,
  serverUrl,
  settings,
  logInfo,
  logError,
  addGalleryItem,
  updateGalleryItem,
}) {
  if (!assets || !assets.length) {
    return { successCount: 0, failureCount: 0 };
  }

  if (!serverUrl) {
    Alert.alert(
      'Server not configured',
      'Set the server host and port from the gear menu first.'
    );
    return { successCount: 0, failureCount: assets.length };
  }

  const workItems = buildWorkItems(assets, addGalleryItem);

  // ✅ Always use chunked uploads now
  logInfo('Upload controller using chunked mode for all uploads', {
    count: workItems.length,
  });

  return uploadChunkedFiles({
    workItems,
    clientId,
    secretKeyBase64,
    serverUrl,
    settings,
    logInfo,
    logError,
    updateGalleryItem,
  });
}

// admin.js
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import NetInfo from '@react-native-community/netinfo';
import nacl from 'tweetnacl';
import * as util from 'tweetnacl-util';
import { CLIENT_ID, SECRET_KEY_BASE64 } from './config';

const defaultSettings = {
  serverHost: '134.122.25.62',
  serverPort: '4000',
  defaultFormat: 'jpg', // 'jpg' or 'png'
  maxMegapixels: 4,     // 4 MP default
  networkPreference: 'any', // 'any' | 'wifi' | 'cellular'
};

function sanitizeDetails(details) {
  if (details == null) return null;

  // Simple types are always fine
  const t = typeof details;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return details;
  }

  // Try to keep the object as-is if it's JSON-serializable
  try {
    JSON.stringify(details);
    return details;
  } catch {
    // Fallback: string form
    try {
      return String(details);
    } catch {
      return '[unserializable details]';
    }
  }
}


const AdminContext = createContext(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdmin must be used inside an AdminProvider');
  }
  return ctx;
}

// Resize / re-encode an image according to settings before upload.
export async function processImageForUpload(asset, settings) {
  if (!asset || !asset.uri) {
    throw new Error('processImageForUpload: invalid asset');
  }

  const fmt =
    settings.defaultFormat === 'png'
      ? ImageManipulator.SaveFormat.PNG
      : ImageManipulator.SaveFormat.JPEG;

  const targetMp = settings.maxMegapixels || defaultSettings.maxMegapixels;
  const maxPixels = targetMp * 1_000_000;

  let { width, height } = asset;
  const actions = [];

  if (width && height && width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    const newWidth = Math.max(1, Math.round(width * scale));
    const newHeight = Math.max(1, Math.round(height * scale));
    actions.push({ resize: { width: newWidth, height: newHeight } });
  }

  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.9,
    format: fmt,
  });

  const ext = settings.defaultFormat === 'png' ? '.png' : '.jpg';
  const fileName =
    asset.fileName ||
    (typeof asset.uri === 'string'
      ? (asset.uri.split('/').pop() || 'photo') + ext
      : 'photo' + ext);

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    mimeType: settings.defaultFormat === 'png' ? 'image/png' : 'image/jpeg',
    fileName,
  };
}

export function AdminProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [logEntries, setLogEntries] = useState([]);
  const [gallery, setGallery] = useState([]);

  const serverUrl = useMemo(() => {
    if (!settings.serverHost || !settings.serverPort) return null;
    const host = settings.serverHost.trim();
    const port = settings.serverPort.trim();
    if (!host || !port) return null;
    return `http://${host}:${port}`;
  }, [settings.serverHost, settings.serverPort]);

  const log = (level, message, details) => {
    setLogEntries(prev => {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        level,
        message,
        details: details || null,
        ts: new Date().toISOString(),
      };
      return [entry, ...prev].slice(0, 500); // keep last 500
    });
  };

  const logInfo = (message, details) => log('info', message, details);
  const logError = (message, details) => log('error', message, details);

  const clearLogs = () => setLogEntries([]);

  const sendLogsToServer = async () => {
    try {
      // Check network connectivity first
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert(
          'No Network',
          'You are not connected to the internet. Please connect and try again.'
        );
        return;
      }

      if (!serverUrl) {
        Alert.alert(
          'Server not configured',
          'Please set your server host and port in settings first.'
        );
        return;
      }

      if (!logEntries || logEntries.length === 0) {
        Alert.alert('No logs', 'There are no log entries to send.');
        return;
      }

      // Sanitize logs before sending
      const sanitized = logEntries.map(entry => ({
        ...entry,
        details: sanitizeDetails(entry.details),
      }));

      const url = `${serverUrl.replace(/\/+$/, '')}/send-logs`;

      // Create cryptographic signature for authentication
      const timestamp = Date.now().toString();
      const message = 'send-logs';
      const fullMessage = `${timestamp}:${message}`;
      
      const secretKey = util.decodeBase64(SECRET_KEY_BASE64);
      const messageBytes = util.decodeUTF8(fullMessage);
      const signature = nacl.sign.detached(messageBytes, secretKey);
      const signatureBase64 = util.encodeBase64(signature);

      console.log('Sending authenticated logs to:', url);
      console.log('Log count:', sanitized.length);

      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId: CLIENT_ID,
            timestamp,
            signatureBase64,
            logEntries: sanitized,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const resText = await response.text();
        console.log('Server response status:', response.status);
        console.log('Server response text:', resText.substring(0, 200));

        let json = null;
        try {
          json = resText ? JSON.parse(resText) : null;
        } catch (parseErr) {
          console.error('Failed to parse response JSON:', parseErr);
          json = null;
        }

        if (!response.ok) {
          console.error('Failed to send logs', {
            status: response.status,
            response: resText,
          });
          Alert.alert(
            'Error sending logs',
            `Server returned ${response.status}. ${json?.error || 'Please check server logs.'}`
          );
          return;
        }

        Alert.alert(
          'Logs sent!',
          'Error logs have been emailed to the admin.'
        );
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        
        if (fetchErr.name === 'AbortError') {
          console.error('Request timed out after 30 seconds');
          Alert.alert(
            'Request Timeout',
            'The request took too long. Please check your connection and server status.'
          );
        } else {
          throw fetchErr; // Re-throw to outer catch
        }
      }
    } catch (err) {
      console.error('Failed to send logs to server', err);
      
      let errorMsg = 'Could not send logs:\n';
      
      if (err && err.message) {
        errorMsg += err.message;
      } else {
        errorMsg += String(err);
      }
      
      // Add helpful context based on error
      if (String(err).includes('Network request failed')) {
        errorMsg += '\n\nThis usually means:\n• Server is not reachable\n• Wrong host/port in settings\n• Server is not running';
      }
      
      Alert.alert('Error sending logs', errorMsg);
    }
  };

  const addGalleryItem = item =>
    setGallery(prev => [...prev, item]);

  const updateGalleryItem = (id, partial) =>
    setGallery(prev =>
      prev.map(entry => (entry.id === id ? { ...entry, ...partial } : entry))
    );

  const updateSettings = partial =>
    setSettings(prev => ({ ...prev, ...partial }));

  const value = {
    settings,
    updateSettings,
    serverUrl,
    logEntries,
    logInfo,
    logError,
    clearLogs,
    sendLogsToServer,
    gallery,
    addGalleryItem,
    updateGalleryItem,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

function ToggleButton({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.toggle, active && styles.toggleActive]}
    >
      <Text style={active ? styles.toggleTextActive : styles.toggleText}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function AdminModal({ visible, onClose }) {
  const {
    settings,
    updateSettings,
    logEntries,
    clearLogs,
    sendLogsToServer,
  } = useAdmin();

  const [localHost, setLocalHost] = useState(settings.serverHost);
  const [localPort, setLocalPort] = useState(settings.serverPort);
  const [localFormat, setLocalFormat] = useState(settings.defaultFormat);
  const [localMaxMP, setLocalMaxMP] = useState(String(settings.maxMegapixels));
  const [localNetwork, setLocalNetwork] = useState(settings.networkPreference);

  useEffect(() => {
    if (visible) {
      setLocalHost(settings.serverHost);
      setLocalPort(settings.serverPort);
      setLocalFormat(settings.defaultFormat);
      setLocalMaxMP(String(settings.maxMegapixels));
      setLocalNetwork(settings.networkPreference);
    }
  }, [visible, settings]);

  const saveSettings = () => {
    const maxMPNum = parseFloat(localMaxMP);
    if (Number.isNaN(maxMPNum) || maxMPNum <= 0) {
      Alert.alert('Invalid megapixels', 'Please enter a positive number.');
      return;
    }

    updateSettings({
      serverHost: localHost.trim(),
      serverPort: localPort.trim(),
      defaultFormat: localFormat === 'png' ? 'png' : 'jpg',
      maxMegapixels: maxMPNum,
      networkPreference:
        localNetwork === 'wifi' || localNetwork === 'cellular'
          ? localNetwork
          : 'any',
    });

    onClose && onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Admin Settings</Text>

          <ScrollView style={styles.modalScroll}>
            {/* Connection */}
            <Text style={styles.sectionTitle}>Connection</Text>

            <Text style={styles.label}>Server Host</Text>
            <TextInput
              style={styles.input}
              value={localHost}
              onChangeText={setLocalHost}
              placeholder="Server host or IP"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Server Port</Text>
            <TextInput
              style={styles.input}
              value={localPort}
              onChangeText={setLocalPort}
              keyboardType="numeric"
              placeholder="4000"
              placeholderTextColor="#6B7280"
            />

            {/* Image processing */}
            <Text style={styles.sectionTitle}>Image Processing</Text>

            <Text style={styles.label}>Default Format</Text>
            <View style={styles.row}>
              <ToggleButton
                label="JPG"
                active={localFormat !== 'png'}
                onPress={() => setLocalFormat('jpg')}
              />
              <View style={{ width: 8 }} />
              <ToggleButton
                label="PNG"
                active={localFormat === 'png'}
                onPress={() => setLocalFormat('png')}
              />
            </View>

            <Text style={styles.label}>Max Megapixels</Text>
            <TextInput
              style={styles.input}
              value={localMaxMP}
              onChangeText={setLocalMaxMP}
              keyboardType="numeric"
              placeholder="4"
              placeholderTextColor="#6B7280"
            />
            <Text style={styles.help}>
              Large images are resized down to this many megapixels before upload
              to keep transfers fast and stable.
            </Text>

            {/* Network preference */}
            <Text style={styles.sectionTitle}>Network Preference</Text>
            <View style={styles.row}>
              <ToggleButton
                label="Any"
                active={localNetwork === 'any'}
                onPress={() => setLocalNetwork('any')}
              />
              <View style={{ width: 8 }} />
              <ToggleButton
                label="Wi-Fi only"
                active={localNetwork === 'wifi'}
                onPress={() => setLocalNetwork('wifi')}
              />
              <View style={{ width: 8 }} />
              <ToggleButton
                label="Cell only"
                active={localNetwork === 'cellular'}
                onPress={() => setLocalNetwork('cellular')}
              />
            </View>
            <Text style={styles.help}>
              Controls whether uploads are allowed on Wi-Fi, cellular, or both.
            </Text>

            {/* Logs */}
            <Text style={styles.sectionTitle}>Logs</Text>
            <View style={styles.logControls}>
              <Button title="Clear logs" onPress={clearLogs} />
              <View style={{ width: 8 }} />
              <Button title="Send logs via email" onPress={sendLogsToServer} />
            </View>

            <View style={styles.logContainer}>
                {logEntries.length === 0 ? (
                    <Text style={styles.logEmpty}>No log entries yet.</Text>
                ) : (
                    <ScrollView
                    style={styles.logScroll}
                    nestedScrollEnabled
                    >
                    {logEntries.slice(0, 200).map(entry => (
                        <View key={entry.id} style={styles.logEntry}>
                        <Text style={styles.logHeader}>
                            [{entry.level.toUpperCase()}] {entry.ts}
                        </Text>
                        <Text style={styles.logMessage}>{entry.message}</Text>
                        {entry.details && (
                            <Text style={styles.logDetails}>
                                {(() => {
                                    try {
                                    return JSON.stringify(entry.details);
                                    } catch {
                                    return String(entry.details);
                                    }
                                })()}
                            </Text>
                        )}
                    </View>
                ))}
                </ScrollView>
            )}
            </View>

          </ScrollView>

          <View style={styles.modalButtons}>
            <Button title="Close" onPress={onClose} />
            <View style={{ width: 12 }} />
            <Button title="Save" onPress={saveSettings} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#030712',
    borderRadius: 16,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    color: 'white',
    marginBottom: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 500,
  },
  sectionTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  label: {
    color: '#D1D5DB',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#020617',
    color: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  help: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 4,
  },
  logControls: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 4,
    alignItems: 'center',
  },
  logContainer: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 8,
    padding: 6,
    backgroundColor: '#020617',
  },
  logEmpty: {
    color: '#6B7280',
    fontSize: 12,
  },
  logEntry: {
    marginBottom: 8,
  },
  logHeader: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  logMessage: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  logDetails: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  toggle: {
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  toggleText: {
    color: '#D1D5DB',
    fontSize: 12,
  },
  toggleTextActive: {
    color: 'white',
    fontSize: 12,
  },
  logScroll: {
    maxHeight: 220,
  },
});
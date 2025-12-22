// App.js
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  Text,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './auth';
import {
  AdminProvider,
  useAdmin,
  AdminModal,
} from './admin';
import { uploadPhotosWithController } from './controller';
import { CLIENT_ID, SECRET_KEY_BASE64 } from './config';
import LoginScreen from './LoginScreen';
import SignupScreen from './SignupScreen';
import DashboardScreen from './DashboardScreen';
import ContactScreen from './ContactScreen';
import ContactDetailScreen from './ContactDetailScreen';
import MessagesScreen from './MessagesScreen';
import TextScreen from './TextScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      {/* your existing navigation/app */}
    </SafeAreaProvider>
  );
}

const Stack = createNativeStackNavigator();

// MainScreen (photo upload functionality)
function PhotoUploadScreen() {
  const [images, setImages] = useState([]);
  const [sending, setSending] = useState(false);
  const [adminVisible, setAdminVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('send'); // 'send' | 'gallery'

  const {
    settings,
    serverUrl,
    logInfo,
    logError,
    gallery,
    addGalleryItem,
    updateGalleryItem,
  } = useAdmin();

  const { logout } = useAuth();

  // ---------- Image picker (multi-select) ----------
  const pickImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        logError('Media library permission denied', { status });
        Alert.alert('Permission required', 'We need access to your photos');
        return;
      }

      logInfo('Opening image library for multi-select');

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (result.canceled) {
        logInfo('Image pick canceled by user');
        return;
      }

      const assets = result.assets || [];
      if (!assets.length) {
        logInfo('Image pick returned no assets');
        return;
      }

      logInfo('Images picked', {
        count: assets.length,
        first: {
          uri: assets[0].uri,
          fileName: assets[0].fileName,
          mimeType: assets[0].mimeType,
          width: assets[0].width,
          height: assets[0].height,
        },
      });

      setImages(assets);
      setActiveTab('send');
    } catch (err) {
      logError('Unexpected error in pickImages', { error: String(err) });
      Alert.alert('Error', 'Unexpected error selecting images');
    }
  };

  // ---------- Send via controller (handles chunks / whole / retries) ----------
  const handleSend = async () => {
    if (!images.length) {
      Alert.alert('No images selected', 'Please pick one or more images first.');
      return;
    }

    try {
      setSending(true);
      const { successCount, failureCount } = await uploadPhotosWithController({
        assets: images,
        clientId: CLIENT_ID,
        secretKeyBase64: SECRET_KEY_BASE64,
        serverUrl,
        settings,
        logInfo,
        logError,
        addGalleryItem,
        updateGalleryItem,
      });

      if (successCount && !failureCount) {
        Alert.alert(
          'Success',
          `${successCount} photo${successCount > 1 ? 's' : ''} sent & verified!`
        );
        setImages([]);
        setActiveTab('gallery');
      } else if (successCount && failureCount) {
        Alert.alert(
          'Partial success',
          `${successCount} uploaded, ${failureCount} failed. Check the log (gear icon) and the gallery dots for details.`
        );
        setActiveTab('gallery');
      } else if (!successCount && failureCount) {
        Alert.alert(
          'Error',
          'All uploads failed. Check the log (gear icon) and the gallery for red dots.'
        );
        setActiveTab('gallery');
      }
    } catch (err) {
      logError('Unexpected error in handleSend', { error: String(err) });
      Alert.alert('Error', 'Unexpected error sending photos');
    } finally {
      setSending(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const sendButtonLabel = sending
    ? 'Sending...'
    : images.length > 1
    ? `Send ${images.length} Photos`
    : 'Send Photo';

  return (
    <View style={styles.container}>
      {/* Header with logout */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.gearButton}
          onPress={() => setAdminVisible(true)}
        >
          <Ionicons name="settings-sharp" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={24} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Photo Sender</Text>

      {/* Main content: either Send preview or Gallery */}
      {activeTab === 'send' ? (
        <>
          {/* Preview first selected image & count */}
          {images.length > 0 && (
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: images[0].uri }}
                style={styles.preview}
                resizeMode="contain"
              />
              {images.length > 1 && (
                <Text style={styles.previewCount}>
                  {images.length} photos selected
                </Text>
              )}
            </View>
          )}
        </>
      ) : (
        <GalleryTab gallery={gallery} />
      )}

      {/* Bottom small buttons */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.smallButton}
          onPress={pickImages}
        >
          <Text style={styles.smallButtonText}>Pick Photo(s)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.smallButton,
            (sending || images.length === 0) && styles.smallButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={sending || images.length === 0}
        >
          <Text style={styles.smallButtonText}>{sendButtonLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.smallButton,
            activeTab === 'gallery' && styles.smallButtonActive,
          ]}
          onPress={() => setActiveTab('gallery')}
        >
          <Text style={styles.smallButtonText}>Gallery</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        Server: {serverUrl || '(not set – tap gear)'}
      </Text>

      <AdminModal
        visible={adminVisible}
        onClose={() => setAdminVisible(false)}
      />
    </View>
  );
}

function getStatusColor(status) {
  switch (status) {
    case 'queued':
      return '#000000'; // black
    case 'sending':
      return '#FBBF24'; // yellow-ish
    case 'failed':
      return '#DC2626'; // red
    case 'verified':
      return '#22C55E'; // green
    default:
      return '#6B7280'; // gray fallback
  }
}

function GalleryTab({ gallery }) {
  if (!gallery || !gallery.length) {
    return (
      <View style={styles.galleryEmpty}>
        <Text style={styles.galleryEmptyText}>
          No photos in the gallery yet. Send some photos to see them here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.galleryScroll}>
      <View style={styles.galleryGrid}>
        {gallery.map(item => (
          <View key={item.id} style={styles.thumbWrapper}>
            <Image
              source={{ uri: item.uri }}
              style={styles.thumbImage}
              resizeMode="cover"
            />
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(item.status) },
              ]}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// Main navigation component
function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // Could add a splash screen here
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#111827' },
      }}
    >
      {user ? (
        <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="PhotoUpload" component={PhotoUploadScreen} />
          <Stack.Screen name="Contacts" component={ContactScreen} />
          <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
          <Stack.Screen name="Messages" component={MessagesScreen} />
          <Stack.Screen name="Text" component={TextScreen} />
          
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

// Root App component
export default function App() {
  return (
    <AuthProvider>
      <AdminProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </AdminProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  header: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  gearButton: {
    padding: 8,
  },
  logoutButton: {
    padding: 8,
  },
  title: {
    color: 'white',
    fontSize: 24,
    marginBottom: 16,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  preview: {
    width: 250,
    height: 250,
    marginBottom: 8,
  },
  previewCount: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  footer: {
    marginTop: 16,
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
  },
  galleryEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  galleryEmptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    fontSize: 14,
  },
  galleryScroll: {
    paddingVertical: 8,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  thumbWrapper: {
    width: 96,
    height: 96,
    margin: 6,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  statusDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111827',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    width: '100%',
  },
  smallButton: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
  },
  smallButtonDisabled: {
    backgroundColor: '#4B5563',
  },
  smallButtonActive: {
    backgroundColor: '#10B981',
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
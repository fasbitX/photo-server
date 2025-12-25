// SettingsScreen.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 300;

// Web "6 inch" viewport approximation: CSS assumes 96px per inch.
const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 576px

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(`${title}: ${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  const doLogout = async () => {
    try {
      await logout?.();

      // Navigator will flip to Login automatically because user becomes null,
      // but this makes it feel instant + explicit.
      try {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      } catch {
        // ignore (in case Settings isn't registered yet)
      }
    } catch (e) {
      notify('Log out', `Failed: ${String(e?.message || e)}`);
    }
  };

  const stub = (label) => notify(label, 'Stub (coming soon).');

  return (
    <View style={styles.outerContainer}>
      <View style={styles.phoneFrame}>
        <View style={styles.container}>
          {/* Top header */}
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={styles.topBarRow}>
              <Text style={styles.topBarTitle}>./fasbit</Text>

              {/* no hamburger here (we are on hamburger page) */}
              <View style={styles.topBarMenuBtn} />
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Hyperlink list */}
            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.linkRow, styles.linkRowFirst]}
                activeOpacity={0.85}
                onPress={doLogout}
              >
                <View style={styles.linkLeft}>
                  <Ionicons name="log-out-outline" size={16} color="#E5E7EB" />
                  <Text style={styles.linkText}>Log Out</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#334155" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.85}
                onPress={() => stub('Permissions')}
              >
                <View style={styles.linkLeft}>
                  <Ionicons name="key-outline" size={16} color="#93C5FD" />
                  <Text style={styles.linkText}>Permissions</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#334155" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.85}
                onPress={() => stub('Camera Settings')}
              >
                <View style={styles.linkLeft}>
                  <Ionicons name="camera-outline" size={16} color="#93C5FD" />
                  <Text style={styles.linkText}>Camera Settings</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#334155" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.85}
                onPress={() => stub('Video Settings')}
              >
                <View style={styles.linkLeft}>
                  <Ionicons name="videocam-outline" size={16} color="#93C5FD" />
                  <Text style={styles.linkText}>Video Settings</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#334155" />
              </TouchableOpacity>
            </View>

            <Text style={styles.footerText}>Fasbit • Settings</Text>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches DashboardScreen behavior: black around phone on web, edge-to-edge on native
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

  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#111827',
  },

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
  // kept for layout symmetry; empty on this screen
  topBarMenuBtn: {
    width: 40,
    height: 40,
  },

  scroll: { flex: 1 },
  content: { padding: 16 },

  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  // hyperlink rows
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  linkRowFirst: {
    borderTopWidth: 0,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  footerText: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
});

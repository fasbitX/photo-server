// DashboardScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 300;

// Web "6 inch" viewport approximation: CSS assumes 96px per inch.
const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 576px

function initialsFromUser(u) {
  const a = String(u?.first_name || '').trim();
  const b = String(u?.last_name || '').trim();
  const i = `${a[0] || ''}${b[0] || ''}`.toUpperCase();
  return i || '@';
}

function cleanServerUrl(u) {
  return String(u || '').replace(/\/+$/, '');
}

/**
 * ✅ Use the SAME strategy as TextScreen:
 * /api/mobile/media?path=...&token=...
 * This works on native + web without Image headers.
 */
function resolvePrivateMediaUrl(serverUrl, authToken, path) {
  if (!serverUrl || !path) return null;

  const base = cleanServerUrl(serverUrl);
  const raw = String(path).trim();

  if (/^https?:\/\//i.test(raw)) return raw;

  const clean = raw.replace(/^\/+/, '');
  return `${base}/api/mobile/media?path=${encodeURIComponent(clean)}&token=${encodeURIComponent(
    authToken || ''
  )}`;
}

export default function DashboardScreen({ navigation }) {
  const { user, serverUrl, authToken, refreshUser, getAuthHeaders } = useAuth();
  const insets = useSafeAreaInsets();

  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [searchText, setSearchText] = useState('');

  // user_name is REQUIRED (never fallback to email here)
  const handle = useMemo(() => String(user?.user_name || '').trim(), [user?.user_name]);

  // ✅ User avatar: prefer avatar_path via private endpoint (consistent with TextScreen)
  const avatarUrl = useMemo(() => {
    const p = String(user?.avatar_path || '').trim();
    if (p) return resolvePrivateMediaUrl(serverUrl, authToken, p);
    return null;
  }, [serverUrl, authToken, user?.avatar_path]);

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 64 : 0;

  const fetchThreads = async () => {
    if (!user?.id || !serverUrl || !authToken) return;

    setLoadingThreads(true);
    try {
      const url = `${cleanServerUrl(serverUrl)}/api/mobile/messages/threads`;

      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requesterId: user.id, limit: 100 }),
      });

      if (res.status === 401) {
        await refreshUser?.();
        setThreads([]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[dashboard] threads failed', res.status, data?.error || data);
        setThreads([]);
        return;
      }

      const list = Array.isArray(data?.threads) ? data.threads : [];
      list.sort((a, b) => Number(b?.last?.sent_date || 0) - Number(a?.last?.sent_date || 0));
      setThreads(list);
    } catch (e) {
      console.warn('[dashboard] threads error', String(e?.message || e));
    } finally {
      setLoadingThreads(false);
    }
  };

  useEffect(() => {
    refreshUser?.();
    fetchThreads();

    const unsub = navigation.addListener('focus', () => {
      refreshUser?.();
      fetchThreads();
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, user?.id, serverUrl, authToken]);

  const filteredThreads = useMemo(() => {
    const q = String(searchText || '').trim().toLowerCase();
    if (!q) return threads;

    return threads.filter((t) => {
      const contact = t?.contact || {};
      const name = `${contact.user_name || ''} ${contact.first_name || ''} ${contact.last_name || ''} ${
        contact.email || ''
      }`.toLowerCase();
      const last = `${t?.last?.content || ''}`.toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }, [threads, searchText]);

  const openThread = (t) => {
    const contact = t?.contact;
    if (!contact?.id) return;
    navigation.navigate('Text', { contact });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      {/* Outer page */}
      <View style={styles.outerContainer}>
        {/* Phone viewport (fixed height on web, full height on native) */}
        <View style={styles.phoneFrame}>
          <View style={styles.container}>
            {/* ✅ Transparent top bar under system status bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <View style={styles.topBarRow}>
                <Text style={styles.topBarTitle}>./fasbit</Text>

                <TouchableOpacity
                  style={styles.topBarMenuBtn}
                  activeOpacity={0.85}
                  onPress={() => console.log('[dashboard] menu pressed')}
                >
                  <Ionicons name="menu" size={22} color="#E5E7EB" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.content,
                {
                  // ✅ topBar owns the safe-area now
                  paddingTop: 12,
                  paddingBottom: Math.max(insets.bottom, 80),
                },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {/* 1) Welcome card */}
              <TouchableOpacity
                style={[styles.card, styles.welcomeCard]}
                onPress={() => navigation.navigate('UserDetail')}
                activeOpacity={0.85}
              >
                <View style={styles.welcomeRow}>
                  <View style={styles.welcomeTextCol}>
                    <Text style={styles.welcomeTitle}>Welcome</Text>

                    <Text style={[styles.handleText, !handle && styles.missingHandle]} numberOfLines={1}>
                      {handle || 'MISSING USERNAME'}
                    </Text>
                  </View>

                  <View style={styles.avatarWrap}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarInitials}>{initialsFromUser(user)}</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              {/* 2) Account Balance */}
              <View style={[styles.card, styles.balanceCard]}>
                <Text style={styles.balanceLabel}>Account Balance</Text>
                <Text style={styles.balanceValue}>
                  $
                  {Number(user?.account_balance || 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>

              {/* 3) Search messages */}
              <View style={styles.searchCard}>
                <View style={styles.searchInputWrapper}>
                  <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
                  <TextInput
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Search Messages"
                    placeholderTextColor="#9CA3AF"
                    style={styles.searchInput}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                </View>
              </View>

              {/* 4) Threads */}
              <View style={styles.card}>
                {loadingThreads && filteredThreads.length === 0 ? (
                  <Text style={styles.emptyText}>Loading…</Text>
                ) : filteredThreads.length === 0 ? (
                  <Text style={styles.emptyText}>{searchText.trim() ? 'No matches.' : 'No threads yet.'}</Text>
                ) : (
                  filteredThreads.map((t, idx) => {
                    const c = t?.contact || {};
                    const cName =
                      String(c?.user_name || '').trim() ||
                      `${c?.first_name || ''} ${c?.last_name || ''}`.trim() ||
                      c?.email ||
                      'Contact';

                    // ✅ FIX: use private media endpoint like TextScreen
                    const cAvatarUrl = resolvePrivateMediaUrl(serverUrl, authToken, c?.avatar_path);

                    const preview = String(t?.last?.content || '').trim();

                    return (
                      <TouchableOpacity
                        key={String(t?.conversation_id || `${c?.id || 'x'}`)}
                        style={[styles.threadRow, idx === 0 && styles.threadRowFirst]}
                        onPress={() => openThread(t)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.threadAvatarWrap}>
                          {cAvatarUrl ? (
                            <Image source={{ uri: cAvatarUrl }} style={styles.threadAvatarImg} />
                          ) : (
                            <Text style={styles.threadAvatarInitials}>{initialsFromUser(c)}</Text>
                          )}
                        </View>

                        <View style={styles.threadTextWrap}>
                          <Text style={styles.threadName} numberOfLines={1}>
                            {cName}
                          </Text>
                          <Text style={styles.threadPreview} numberOfLines={1}>
                            {preview || '(no text)'}
                          </Text>
                        </View>

                        <Ionicons name="chevron-forward" size={20} color="#334155" />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>

            {/* Floating "+" button */}
            <TouchableOpacity
              style={[styles.floatingButton, { bottom: insets.bottom + 20 }]}
              onPress={() => navigation.navigate('Contacts')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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

  // ✅ web preview stays 300px wide; native becomes full width
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

  // ✅ Transparent title bar
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

  scroll: { flex: 1 },

  content: {
    padding: 16,
  },

  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 20,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  welcomeCard: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 66,
    maxHeight: 72,
    justifyContent: 'center',
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  welcomeTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  handleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  missingHandle: {
    color: '#F87171',
  },

  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 14,
  },

  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 38,
    maxHeight: 44,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  balanceValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#10B981',
  },

  searchCard: {
    marginBottom: 5,
    paddingHorizontal: 0,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    padding: 0,
  },

  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    paddingTop: 8,
  },

  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  threadRowFirst: {
    borderTopWidth: 0,
  },
  threadAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  threadAvatarImg: { width: '100%', height: '100%' },
  threadAvatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 12,
  },
  threadTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  threadName: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 13,
  },
  threadPreview: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },

  floatingButton: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0px 4px 12px rgba(0,0,0,0.35)',
      },
      default: {},
    }),
  },
});

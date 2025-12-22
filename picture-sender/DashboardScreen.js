// DashboardScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 288; // match app container width

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

export default function DashboardScreen({ navigation }) {
  const { user, serverUrl, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [searchText, setSearchText] = useState('');

  const avatarUrl = useMemo(
    () => resolveUploadUrl(serverUrl, user?.avatar_path),
    [serverUrl, user?.avatar_path]
  );

  const displayName =
    String(user?.user_name || '').trim() ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    'User';

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 64 : 0;

  const fetchThreads = async () => {
    if (!user?.id || !serverUrl) return;
    setLoadingThreads(true);
    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/messages/threads`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, limit: 100 }),
      });
      const data = await res.json();
      if (res.ok) {
        const list = Array.isArray(data.threads) ? data.threads : [];
        // Newest at top (defensive sort)
        list.sort((a, b) => Number(b?.last?.sent_date || 0) - Number(a?.last?.sent_date || 0));
        setThreads(list);
      }
    } catch (e) {
      // silent for MVP
    } finally {
      setLoadingThreads(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    const unsub = navigation.addListener('focus', fetchThreads);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, user?.id, serverUrl]);

  const filteredThreads = useMemo(() => {
    const q = String(searchText || '').trim().toLowerCase();
    if (!q) return threads;

    return threads.filter((t) => {
      const contact = t?.contact || {};
      const name = `${contact.user_name || ''} ${contact.first_name || ''} ${contact.last_name || ''} ${contact.email || ''}`
        .toLowerCase();
      const last = `${t?.last?.content || ''}`.toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }, [threads, searchText]);

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      await logout();
      return;
    }

    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

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
      <View style={styles.outerContainer}>
        <View style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <TouchableOpacity
              onPress={handleLogout}
              style={styles.headerIconBtn}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Logout"
            >
              <Ionicons name="log-out-outline" size={26} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1) Welcome card (tap -> UserDetail) */}
            <TouchableOpacity
              style={[styles.card, styles.welcomeCard]}
              onPress={() => navigation.navigate('UserDetail')}
              activeOpacity={0.85}
            >
              <View style={styles.welcomeRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle}>Welcome</Text>
                  <Text style={styles.userName} numberOfLines={1}>
                    {displayName}
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account Balance</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceValue}>
                  ${parseFloat(user?.account_balance || 0).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* 3) Search messages */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Search Messages</Text>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search your threads/messages for words…"
                placeholderTextColor="#9CA3AF"
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              <Text style={styles.hintText}>
                This searches your existing message threads (not new people).
              </Text>
            </View>

            {/* 4) Threads (newest at top) */}
            <View style={styles.card}>
              <View style={styles.threadsHeaderRow}>
                <Text style={styles.cardTitle}>Threads</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Contacts')}
                  activeOpacity={0.85}
                  style={styles.smallLinkBtn}
                >
                  <Ionicons name="person-add" size={16} color="#93C5FD" />
                  <Text style={styles.smallLinkText}>Contacts</Text>
                </TouchableOpacity>
              </View>

              {loadingThreads && filteredThreads.length === 0 ? (
                <Text style={styles.emptyText}>Loading…</Text>
              ) : filteredThreads.length === 0 ? (
                <Text style={styles.emptyText}>
                  {searchText.trim() ? 'No matches.' : 'No threads yet.'}
                </Text>
              ) : (
                filteredThreads.map((t) => {
                  const c = t?.contact || {};
                  const cName =
                    String(c?.user_name || '').trim() ||
                    `${c?.first_name || ''} ${c?.last_name || ''}`.trim() ||
                    c?.email ||
                    'Contact';

                  const cAvatarUrl = resolveUploadUrl(serverUrl, c?.avatar_path);
                  const preview = String(t?.last?.content || '').trim();

                  return (
                    <TouchableOpacity
                      key={String(t?.conversation_id || `${c?.id || 'x'}`)}
                      style={styles.threadRow}
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
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerIconBtn: {
    padding: 12,
    marginRight: -12,
  },

  content: {
    padding: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },

  card: {
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },

  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 16,
  },

  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#2563EB',
  },

  searchInput: {
    color: '#FFF',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hintText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 10,
  },

  threadsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  smallLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
  },
  smallLinkText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '800',
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
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  threadAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  threadAvatarImg: {
    width: '100%',
    height: '100%',
  },
  threadAvatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
  },
  threadTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  threadName: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
  },
  threadPreview: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 3,
  },
  welcomeCard: {
  paddingVertical: 12,
  paddingHorizontal: 18,
  minHeight: 82,
  maxHeight: 92,
  justifyContent: 'center',
},

});

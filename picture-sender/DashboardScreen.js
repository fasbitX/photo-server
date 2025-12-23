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

const MAX_WIDTH = 300; // sets the maximum width of the screen

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

function toHandle(user) {
  const raw = String(user?.user_name || '').trim();
  const cleaned = raw ? raw.replace(/^@+/, '') : '';
  const fallback = String(user?.email || '').split('@')[0] || 'user';
  return `@${(cleaned || fallback).trim()}`;
}

function formatCurrency(value) {
  const num = parseFloat(value || 0);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function DashboardScreen({ navigation }) {
  const { user, serverUrl, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [searchText, setSearchText] = useState('');

  const avatarUrl = useMemo(
    () => resolveUploadUrl(serverUrl, user?.avatar_path),
    [serverUrl, user?.avatar_path]
  );

  // Handle is always the user_name from DB (which includes @)
  const handle = useMemo(() => String(user?.user_name || '').trim(), [user?.user_name]);

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
        list.sort(
          (a, b) => Number(b?.last?.sent_date || 0) - Number(a?.last?.sent_date || 0)
        );
        setThreads(list);
      }
    } catch (e) {
      // silent for MVP
    } finally {
      setLoadingThreads(false);
    }
  };

  useEffect(() => {
    // ✅ REFRESH USER DATA when screen focuses
    refreshUser?.();
    fetchThreads();
    
    const unsub = navigation.addListener('focus', () => {
      refreshUser?.();
      fetchThreads();
    });
    
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
          <ScrollView
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: insets.top + 16,
                paddingBottom: Math.max(insets.bottom, 80), // extra bottom padding for floating button
              },
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
                <View style={styles.welcomeTextCol}>
                  <Text style={styles.welcomeTitle}>Welcome</Text>

                  <Text
                    style={[styles.handleText, !handle && styles.missingHandle]}
                    numberOfLines={1}
                  >
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
                ${formatCurrency(user?.account_balance)}
              </Text>
            </View>

            {/* 3) Search messages - invisible card wrapper */}
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

            {/* 4) Threads - no header */}
            <View style={styles.card}>
              {loadingThreads && filteredThreads.length === 0 ? (
                <Text style={styles.emptyText}>Loading…</Text>
              ) : filteredThreads.length === 0 ? (
                <Text style={styles.emptyText}>
                  {searchText.trim() ? 'No matches.' : 'No threads yet.'}
                </Text>
              ) : (
                filteredThreads.map((t, idx) => {
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

          {/* ✅ Floating "+" button (bottom right, above Android system tray) */}
          <TouchableOpacity
            style={[styles.floatingButton, { bottom: insets.bottom + 20 }]}
            onPress={() => navigation.navigate('Contacts')}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>
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

  // ✅ Welcome card: ~0.75" tall feel (tight)
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

  // ✅ smaller avatar
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
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 14,
  },

  // ✅ Balance card: compact, single line, ~1cm tall
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

  // ✅ Search card: invisible wrapper, no background/border
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

  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },

  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    paddingTop: 8,
  },

  // ✅ Thread rows: reduced height, no top border on first item
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
  threadAvatarImg: {
    width: '100%',
    height: '100%',
  },
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
  welcomeTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },

  missingHandle: {
    color: '#F87171', // red warning
  },

  // ✅ Floating "+" button (bottom right)
  floatingButton: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

});
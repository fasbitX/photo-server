// TextScreen.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 288; // match DashboardScreen container width

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

export default function TextScreen({ route }) {
  const { contact } = route.params || {};
  const { user, serverUrl } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const timerRef = useRef(null);

  const contactName = String(contact?.user_name || '').trim() || '@unknown';

  const avatarUrl = useMemo(
    () => resolveUploadUrl(serverUrl, contact?.avatar_path),
    [serverUrl, contact?.avatar_path]
  );

  const fetchThread = async () => {
    if (!user?.id || !contact?.id || !serverUrl) return;
    setLoading(true);
    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/messages/thread`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          contactUserId: contact.id,
          limit: 50,
        }),
      });
      const data = await res.json();
      if (res.ok) setMessages(data.messages || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();

    // simple polling MVP (only while screen mounted)
    timerRef.current = setInterval(fetchThread, 2500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, contact?.id, serverUrl]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (!user?.id || !contact?.id || !serverUrl) return;

    setText('');

    // optimistic insert
    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender_id: user.id,
      recipient_id: contact.id,
      content: body,
      message_type: 'text',
      sent_date: Date.now(),
    };
    setMessages((prev) => [optimistic, ...prev]);

    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/messages/send`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user.id,
          recipientId: contact.id,
          content: body,
        }),
      });
      const data = await res.json();

      if (res.ok && data.message) await fetchThread(); // reconcile optimistic
    } catch (e) {
      await fetchThread(); // reconcile on error too
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <View style={styles.outerContainer}>
        <View style={styles.container}>
          {/* Header Card (no back button; use Android system back) */}
          <View style={[styles.headerWrap, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerCard}>
              <View style={styles.headerAvatarWrap}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.headerAvatarImg} />
                ) : (
                  <Text style={styles.headerAvatarInitials}>{initialsFromUser(contact)}</Text>
                )}
              </View>

              <Text style={styles.headerCardTitle} numberOfLines={1}>
                {contactName}
              </Text>
            </View>
          </View>

          {/* Content area */}
          <View style={styles.content}>
            <FlatList
              style={{ flex: 1 }}
              data={messages}
              inverted
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingVertical: 12 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {loading ? 'Loading...' : 'No messages yet.'}
                </Text>
              }
              renderItem={({ item }) => {
                const mine = Number(item.sender_id) === Number(user?.id);
                return (
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    <Text style={styles.bubbleText}>{item.content || ''}</Text>
                  </View>
                );
              }}
            />

            <View style={styles.composer}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Type a message..."
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                multiline
              />
              <TouchableOpacity style={styles.sendBtn} onPress={send} activeOpacity={0.85}>
                <Text style={styles.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // KeyboardAvoiding wrapper
  kav: { flex: 1 },

  // Dashboard-style outer shell
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

  // Header Card (1cm-ish tall)
  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerCard: {
    height: 40,
    borderRadius: 16,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  headerAvatarInitials: {
    color: '#93C5FD',
    fontWeight: '900',
    fontSize: 12,
  },
  headerCardTitle: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  // Content matches Dashboard padding
  content: {
    padding: 16,
    flex: 1,
  },

  empty: {
    color: '#9CA3AF',
    textAlign: 'center',
    paddingTop: 18,
  },

  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: '#1D4ED8',
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#020617',
  },
  bubbleText: { color: '#FFF', fontSize: 14 },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    backgroundColor: '#0B1220',
    padding: 12,
    borderRadius: 16,
    marginTop: 10,
  },
  input: {
    flex: 1,
    color: '#FFF',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendText: { color: '#FFF', fontWeight: '800' },
});

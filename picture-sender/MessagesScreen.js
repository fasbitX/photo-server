// TextScreen.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';

const MAX_WIDTH = 288; // match DashboardScreen container width

export default function TextScreen({ route, navigation }) {
  const { contact } = route.params || {};
  const { user, serverUrl } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const timerRef = useRef(null);

  const contactName =
    `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() ||
    contact?.email ||
    'Chat';

  // Approx header height (excluding safe-area top). Used only for iOS keyboard offset.
  const HEADER_BAR_HEIGHT = 64;
  const keyboardOffset = Platform.OS === 'ios' ? insets.top + HEADER_BAR_HEIGHT : 0;

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
      if (res.ok) {
        setConversationId(data.conversationId);
        setMessages(data.messages || []);
      }
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

      if (res.ok && data.message) {
        await fetchThread(); // reconcile optimistic
      }
    } catch (e) {
      await fetchThread(); // reconcile on error too
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={styles.outerContainer}>
        <View style={styles.container}>
          {/* Dashboard-style header (safe-area aware) */}
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={28} color="#9CA3AF" />
            </TouchableOpacity>

            <Text style={styles.headerTitle} numberOfLines={1}>
              {contactName}
            </Text>

            {/* spacer to keep title centered */}
            <View style={styles.headerRightSpacer} />
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

            {/* Safe-area padding keeps composer above Android nav bar; keyboard avoidance handled by KAV */}
            <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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

  // Dashboard-style header bar
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    padding: 12,
    marginLeft: -12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    paddingHorizontal: 6,
  },
  headerRightSpacer: {
    width: 28 + 24,
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

  composerWrap: {
    // paddingBottom is applied dynamically via insets
  },
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

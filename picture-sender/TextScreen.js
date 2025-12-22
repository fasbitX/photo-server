// TextScreen.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from './auth';

export default function TextScreen({ route }) {
  const { contact } = route.params || {};
  const { user, serverUrl } = useAuth();

  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const timerRef = useRef(null);

  const contactName =
    `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() ||
    contact?.email ||
    'Chat';

  const fetchThread = async () => {
    if (!user?.id || !contact?.id || !serverUrl) return;
    setLoading(true);
    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/messages/thread`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, contactUserId: contact.id, limit: 50 }),
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
        body: JSON.stringify({ senderId: user.id, recipientId: contact.id, content: body }),
      });
      const data = await res.json();

      if (res.ok && data.message) {
        // replace optimistic by refetch (simple + safe)
        await fetchThread();
      }
    } catch {
      // if it fails, refetch to reconcile
      await fetchThread();
    }
  };

  return (
    <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
        <View style={styles.webFrame}>
            <Text style={styles.header}>{contactName}</Text>

            <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingVertical: 12 }}
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
    </KeyboardAvoidingView>

  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', paddingTop: 50 },
  header: { color: '#FFF', fontSize: 18, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 10 },
  empty: { color: '#9CA3AF', textAlign: 'center', paddingTop: 18 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  mine: { alignSelf: 'flex-end', backgroundColor: '#1D4ED8' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#020617' },
  bubbleText: { color: '#FFF', fontSize: 14 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    backgroundColor: '#0B1220',
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

  webFrame: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 420 : '100%',
    alignSelf: 'center',
  },
  webFrame: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 420 : '100%',
    alignSelf: 'center',
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: Platform.OS === 'web' ? '#1F2937' : 'transparent',
    borderRadius: Platform.OS === 'web' ? 24 : 0,
    overflow: 'hidden',
  },

});

// MessagesScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth';

export default function MessagesScreen({ navigation }) {
  const { user, authToken, serverUrl } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadThreads();
  }, []);

  const loadThreads = async () => {
    if (!user || !authToken || !serverUrl) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${serverUrl}/api/mobile/messages/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          limit: 50,
        }),
      });

      const data = await response.json();

      if (response.ok && data.threads) {
        setThreads(data.threads);
      } else {
        console.error('Failed to load threads:', data.error);
      }
    } catch (err) {
      console.error('Error loading threads:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadThreads();
  };

  const renderThread = ({ item }) => {
    const contact = item.contact || {};
    const lastMessage = item.last || {};
    
    const displayName = contact.user_name || 
                       `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 
                       'Unknown';
    
    const preview = lastMessage.type === 'text' 
      ? lastMessage.content?.substring(0, 50) || '' 
      : '📷 Photo';

    return (
      <TouchableOpacity
        style={styles.threadCard}
        onPress={() => navigation.navigate('Text', { contact })}
      >
        <View style={styles.threadAvatar}>
          <Ionicons name="person-circle" size={48} color="#6B7280" />
        </View>
        <View style={styles.threadContent}>
          <Text style={styles.threadName}>{displayName}</Text>
          <Text style={styles.threadPreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <View style={styles.threadMeta}>
          <Text style={styles.threadTime}>
            {lastMessage.sent_date 
              ? new Date(lastMessage.sent_date).toLocaleDateString()
              : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#E5E7EB" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Messages</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#E5E7EB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Contacts')}>
          <Ionicons name="create-outline" size={24} color="#E5E7EB" />
        </TouchableOpacity>
      </View>

      {threads.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={64} color="#6B7280" />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>
            Start a conversation from your contacts
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          renderItem={renderThread}
          keyExtractor={(item) => String(item.conversation_id)}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  threadAvatar: {
    marginRight: 12,
  },
  threadContent: {
    flex: 1,
  },
  threadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  threadPreview: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  threadMeta: {
    alignItems: 'flex-end',
  },
  threadTime: {
    fontSize: 12,
    color: '#6B7280',
  },
});
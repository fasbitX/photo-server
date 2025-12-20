// DashboardScreen.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth';

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const handleNavigation = (section) => {
    if (section === 'Images') {
      navigation.navigate('PhotoUpload');
    } else {
      Alert.alert('Coming Soon', `${section} functionality will be added soon`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.first_name || 'User'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.settingsButton}>
          <Ionicons name="log-out-outline" size={24} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Account Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account Number</Text>
            <Text style={styles.infoValue}>{user?.account_number || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={[styles.infoValue, styles.statusActive]}>
              {user?.status || 'Active'}
            </Text>
          </View>
        </View>

        {/* Balance Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Balance</Text>
          <Text style={styles.balance}>
            ${parseFloat(user?.account_balance || 0).toFixed(2)}
          </Text>
        </View>

        {/* Navigation Pills */}
        <View style={styles.navContainer}>
          <TouchableOpacity
            style={styles.navPill}
            onPress={() => handleNavigation('Contacts')}
          >
            <Ionicons name="people" size={24} color="#FFFFFF" />
            <Text style={styles.navPillText}>Contacts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            onPress={() => handleNavigation('Messages')}
          >
            <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
            <Text style={styles.navPillText}>Messages</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navPill}
            onPress={() => handleNavigation('Images')}
          >
            <Ionicons name="images" size={24} color="#FFFFFF" />
            <Text style={styles.navPillText}>Images</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  greeting: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  settingsButton: {
    padding: 8,
  },
  content: {
    padding: 16,
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
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  statusActive: {
    color: '#22C55E',
    textTransform: 'capitalize',
  },
  balance: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#2563EB',
    marginTop: 8,
  },
  navContainer: {
    marginTop: 8,
  },
  navPill: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
  },
  navPillText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
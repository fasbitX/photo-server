// DashboardScreen.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_WIDTH = 288; // 4 inches at ~72 DPI

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    console.log('Logout button pressed - executing logout');
    
    // For web, skip the alert and logout directly
    if (Platform.OS === 'web') {
      await logout();
      return;
    }
    
    // For mobile, show confirmation
    Alert.alert(
      'Logout', 
      'Are you sure you want to logout?', 
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive', 
          onPress: async () => {
            console.log('Logging out...');
            await logout();
          }
        },
      ],
      { cancelable: true }
    );
  };

  const handleNavigation = (section) => {
    if (section === 'Images') {
      navigation.navigate('PhotoUpload');
      return;
    }
    if (section === 'Contacts') {
      navigation.navigate('Contacts');
      return;
    }
    if (section === 'Messages') {
      navigation.navigate('Messages');
      return;
    }

  };

  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'User';

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Welcome,</Text>
            <Text style={styles.userName}>{fullName}</Text>
          </View>
          <TouchableOpacity 
            onPress={handleLogout} 
            style={styles.logoutButton}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="log-out-outline" size={28} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Account Info Card with Balance */}
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

            {/* Account Balance on one line */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Bal.</Text>
              <Text style={styles.balanceInline}>
                ${parseFloat(user?.account_balance || 0).toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Navigation Pills */}
          <View style={styles.navContainer}>
            <TouchableOpacity
              style={styles.navPill}
              onPress={() => handleNavigation('Contacts')}
              activeOpacity={0.8}
            >
              <Ionicons name="people" size={24} color="#FFFFFF" />
              <Text style={styles.navPillText}>Contacts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navPill}
              onPress={() => handleNavigation('Messages')}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
              <Text style={styles.navPillText}>Messages</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navPill}
              onPress={() => handleNavigation('Images')}
              activeOpacity={0.8}
            >
              <Ionicons name="images" size={24} color="#FFFFFF" />
              <Text style={styles.navPillText}>Images</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerText: {
    flex: 1,
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
  logoutButton: {
    padding: 12,
    marginLeft: 8,
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
  balanceInline: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: 'bold',
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
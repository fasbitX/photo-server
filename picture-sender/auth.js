// auth.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState(null);

  // Load stored auth on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      const storedToken = await AsyncStorage.getItem('authToken');
      const storedServer = await AsyncStorage.getItem('serverUrl');
      
      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
        setAuthToken(storedToken);
      }
      if (storedServer) {
        setServerUrl(storedServer);
      }
    } catch (err) {
      console.error('Failed to load stored auth:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, server) => {
    try {
      const url = `${server.replace(/\/+$/, '')}/api/mobile/login`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (!data.user || !data.authToken) {
        throw new Error('Invalid response from server');
      }

      // Store user, token, and server
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      await AsyncStorage.setItem('authToken', data.authToken);
      await AsyncStorage.setItem('serverUrl', server);
      
      setUser(data.user);
      setAuthToken(data.authToken);
      setServerUrl(server);

      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: err.message };
    }
  };

  const signup = async (userData, server) => {
    try {
      const url = `${server.replace(/\/+$/, '')}/api/mobile/signup`;
      
      console.log('Signup request data:', {
        url,
        userData: { ...userData, password: '[REDACTED]', confirmPassword: '[REDACTED]' }
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const data = await response.json();
      
      console.log('Signup response:', {
        status: response.status,
        ok: response.ok,
        data
      });

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      await AsyncStorage.setItem('serverUrl', server);
      setServerUrl(server);

      return { success: true, message: data.message };
    } catch (err) {
      console.error('Signup error:', err);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint if we have a token
      if (authToken && serverUrl) {
        try {
          const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/logout`;
          await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
          });
        } catch (err) {
          console.error('Logout endpoint error:', err);
          // Continue with local logout even if server call fails
        }
      }

      // Clear local storage
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('authToken');
      setUser(null);
      setAuthToken(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const refreshUser = async () => {
    if (!authToken || !serverUrl) return;

    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/user`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.user) {
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      } else if (response.status === 401) {
        // Token is invalid, logout
        await logout();
      }
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  // Helper to get auth headers for API calls
  const getAuthHeaders = () => {
    if (!authToken) {
      return { 'Content-Type': 'application/json' };
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    };
  };

  const value = {
    user,
    authToken,
    serverUrl,
    loading,
    login,
    signup,
    logout,
    refreshUser,
    getAuthHeaders,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
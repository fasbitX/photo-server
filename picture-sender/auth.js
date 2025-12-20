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
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState(null);

  // Load stored auth on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      const storedServer = await AsyncStorage.getItem('serverUrl');
      
      if (storedUser) {
        setUser(JSON.parse(storedUser));
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

      if (!data.user) {
        throw new Error('Invalid response from server');
      }

      // Store user and server
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      await AsyncStorage.setItem('serverUrl', server);
      
      setUser(data.user);
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
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

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
      await AsyncStorage.removeItem('user');
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const refreshUser = async () => {
    if (!user || !serverUrl) return;

    try {
      const url = `${serverUrl.replace(/\/+$/, '')}/api/mobile/user`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });

      const data = await response.json();

      if (response.ok && data.user) {
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      }
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  const value = {
    user,
    serverUrl,
    loading,
    login,
    signup,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
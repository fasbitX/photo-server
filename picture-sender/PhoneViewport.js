// components/PhoneViewport.js
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 6in ≈ 576px

export default function PhoneViewport({ children, style }) {
  return (
    <View style={styles.page}>
      <View style={[styles.phone, style]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#000',      // page background
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 16,
    paddingBottom: 16,
  },

  phone: Platform.select({
    web: {
      width: '100%',
      maxWidth: 300,              // match your MAX_WIDTH
      height: PHONE_HEIGHT_PX,    // ✅ visible “6 inch” viewport (approx)
      overflow: 'hidden',         // ✅ prevent page from expanding; scroll happens inside your ScrollViews
      backgroundColor: '#111827',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#1F2937',
      boxShadow: '0px 10px 30px rgba(0,0,0,0.45)',
    },
    default: {
      flex: 1,                    // native phones should use full screen
      width: '100%',
      maxWidth: 300,
      backgroundColor: '#111827',
    },
  }),
});

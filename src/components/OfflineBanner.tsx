import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { colors, spacing } from '../theme';

/** Barra superior que avisa cuando no hay conexión a internet. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // Solo marcamos offline si claramente no hay red.
      setOffline(state.isConnected === false);
    });
    return unsub;
  }, []);

  if (!offline) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.white} />
      <Text style={styles.text}>Sin conexión a internet. Revisa tu WiFi o datos.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: { color: colors.white, fontWeight: '700', fontSize: 13 },
});

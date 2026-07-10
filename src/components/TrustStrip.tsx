import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';

const ITEMS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'bicycle-outline', label: 'Envío gratis\nen Lima' },
  { icon: 'shield-checkmark-outline', label: 'Pago\nseguro' },
  { icon: 'ribbon-outline', label: 'Productos\noriginales' },
  { icon: 'logo-whatsapp', label: 'Asesoría\npor WhatsApp' },
];

/** Fila de señales de confianza — clave en salud/farmacia. */
export function TrustStrip() {
  return (
    <View style={styles.wrap}>
      {ITEMS.map((it) => (
        <View key={it.label} style={styles.item}>
          <Ionicons name={it.icon} size={22} color={colors.primary} />
          <Text style={styles.label}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  item: { alignItems: 'center', gap: 4, flex: 1 },
  label: { fontSize: 11, color: colors.textMuted, textAlign: 'center', fontWeight: '600', lineHeight: 14 },
});

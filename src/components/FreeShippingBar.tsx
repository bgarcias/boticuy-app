import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, radius, spacing } from '../theme';
import { formatSoles } from '../utils/format';

const extra = (Constants.expoConfig?.extra ?? {}) as { envioGratisDesde?: number };

/** Barra de progreso hacia el envío gratis (nudge de conversión). */
export function FreeShippingBar({ subtotal }: { subtotal: number }) {
  const meta = extra.envioGratisDesde ?? 69;
  const reached = subtotal >= meta;
  const pct = Math.max(0, Math.min(1, subtotal / meta));
  const falta = Math.max(0, meta - subtotal);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Ionicons
          name={reached ? 'checkmark-circle' : 'bicycle'}
          size={18}
          color={reached ? colors.success : colors.primary}
        />
        <Text style={styles.text}>
          {reached ? (
            <Text style={{ color: colors.success, fontWeight: '700' }}>¡Tienes envío gratis en Lima! 🎉</Text>
          ) : (
            <>
              Te faltan <Text style={styles.bold}>{formatSoles(falta)}</Text> para{' '}
              <Text style={styles.bold}>envío gratis</Text> en Lima
            </>
          )}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: reached ? colors.success : colors.primary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, fontSize: 13, color: colors.text },
  bold: { fontWeight: '700', color: colors.primaryDark },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});

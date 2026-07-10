import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { StorePrice } from '../types';
import { priceToSoles, regularToSoles, formatSoles } from '../utils/format';
import { colors } from '../theme';

export function Price({ prices, size = 18 }: { prices: StorePrice; size?: number }) {
  const current = priceToSoles(prices);
  const regular = regularToSoles(prices);
  const onSale = regular > current;

  return (
    <View style={styles.row}>
      <Text style={[styles.current, { fontSize: size }]}>{formatSoles(current)}</Text>
      {onSale && <Text style={styles.regular}>{formatSoles(regular)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  current: { fontWeight: '800', color: colors.primary },
  regular: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'line-through' },
});

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { Order } from '../types';
import { fetchMyOrders } from '../api/orders';
import { Loading, ErrorView, Empty } from '../components/Feedback';
import { formatSoles } from '../utils/format';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

export function OrdersScreen({ navigation }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMyOrders()
      .then(setOrders)
      .catch(() => setError('No pudimos cargar tus pedidos.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  if (loading) return <Loading label="Cargando tus pedidos…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;
  if (orders.length === 0)
    return <Empty message="Aún no tienes pedidos. ¡Tu primera compra aparecerá aquí!" />;

  return (
    <FlatList
      style={styles.container}
      data={orders}
      keyExtractor={(o) => String(o.id)}
      contentContainerStyle={{ padding: spacing.lg }}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => navigation.navigate('OrderDetail', { order: item })}>
          <View style={styles.head}>
            <Text style={styles.number}>Pedido #{item.number}</Text>
            <Text style={styles.date}>{item.date}</Text>
          </View>
          <View style={styles.statusRow}>
            <Ionicons name="ellipse" size={9} color={colors.primary} />
            <Text style={styles.status}>{item.status}</Text>
          </View>
          {item.items.slice(0, 4).map((it, i) => (
            <Text key={i} style={styles.item} numberOfLines={1}>
              {it.qty}× {it.name}
            </Text>
          ))}
          {item.items.length > 4 && <Text style={styles.more}>+{item.items.length - 4} más</Text>}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{formatSoles(item.total)}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: 15, fontWeight: '800', color: colors.text },
  date: { fontSize: 12, color: colors.textMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: spacing.sm },
  status: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  item: { fontSize: 13, color: colors.text, marginTop: 2 },
  more: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm },
  totalLabel: { fontSize: 14, color: colors.textMuted },
  total: { fontSize: 16, fontWeight: '800', color: colors.primary },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { fetchProduct } from '../api/products';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { formatSoles } from '../utils/format';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

// Pasos del pedido y a qué estados reales de WooCommerce corresponden. Solo
// se listan slugs que WooCommerce realmente emite (pending/on-hold/processing/
// completed) — sin "en camino": WooCommerce no tiene un estado nativo para eso.
const STEPS = [
  { key: 'recibido', label: 'Recibido', icon: 'receipt-outline' as const, slugs: ['pending', 'on-hold'] },
  { key: 'preparando', label: 'Preparando', icon: 'cube-outline' as const, slugs: ['processing'] },
  { key: 'entregado', label: 'Entregado', icon: 'checkmark-done-outline' as const, slugs: ['completed'] },
];

// Avisos para estados que no son parte del timeline normal, cada uno con su
// propio texto (antes los tres se mostraban igual como "cancelado").
const STATUS_MESSAGES: Record<string, string> = {
  cancelled: 'Pedido cancelado',
  failed: 'Hubo un problema con el pago. Si ya pagaste, escríbenos por WhatsApp.',
  refunded: 'Pedido reembolsado',
};

export function OrderDetailScreen({ route, navigation }: Props) {
  const { order } = route.params;
  const isTimelineStatus = STEPS.some((s) => s.slugs.includes(order.status_slug));
  // Para un estado no reconocido (ni en el timeline ni cancelled/failed/refunded),
  // se usa la etiqueta real de WooCommerce (order.status) tal cual — nunca se
  // asume "Recibido" para no mentir sobre el progreso del pedido.
  const banner = STATUS_MESSAGES[order.status_slug] ?? (isTimelineStatus ? null : order.status);
  const add = useCart((s) => s.add);
  const showToast = useToast((s) => s.show);
  const [reordering, setReordering] = useState(false);

  // IDs de producto disponibles (el BFF los incluye en los pedidos).
  const reorderable = order.items.filter((it) => typeof it.product_id === 'number' && it.product_id! > 0);

  const onReorder = async () => {
    if (reorderable.length === 0) return;
    setReordering(true);
    let added = 0;
    const issues: string[] = [];
    for (const it of reorderable) {
      try {
        const p = await fetchProduct(it.product_id!);
        // low_stock_remaining es la única cantidad exacta que da la Store API;
        // si es null, WooCommerce no reporta stock bajo y se asume que alcanza.
        const available = p.low_stock_remaining;
        const qty = available != null ? Math.min(it.qty, available) : it.qty;
        if (!p.is_in_stock || qty < 1) {
          issues.push(`No se pudo agregar "${p.name}" (sin stock).`);
          continue;
        }
        add(p, qty);
        added += 1;
        if (qty < it.qty) {
          issues.push(`Se ajustó la cantidad de "${p.name}" a ${qty} (stock limitado).`);
        }
      } catch {
        issues.push(`No se pudo agregar "${it.name || 'un producto'}" (ya no está disponible).`);
      }
    }
    setReordering(false);
    if (issues.length > 0) {
      // Lista de advertencias: variant warning + más tiempo en pantalla que el
      // toast de éxito (1.8s no alcanza para leer varias líneas).
      showToast(issues.join('\n'), { variant: 'warning', duration: 5000 });
    } else {
      showToast('Productos agregados al carrito');
    }
    if (added > 0) navigation.navigate('Tabs', { screen: 'Carrito' } as never);
  };

  // Índice del paso actual — solo se calcula cuando el estado sí es parte del
  // timeline (isTimelineStatus), así que siempre hay match, nunca -1.
  const current = STEPS.findIndex((s) => s.slugs.includes(order.status_slug));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.header}>
        <Text style={styles.number}>Pedido #{order.number}</Text>
        <Text style={styles.date}>{order.date}</Text>
      </View>

      {banner ? (
        <View style={styles.statusBanner}>
          <Ionicons name="close-circle" size={22} color={colors.error} />
          <Text style={styles.statusBannerText}>{banner}</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {STEPS.map((s, i) => {
            const done = i <= current;
            return (
              <View key={s.key} style={styles.step}>
                <View style={styles.stepIconCol}>
                  <View style={[styles.stepDot, done && styles.stepDotDone]}>
                    <Ionicons name={s.icon} size={16} color={done ? colors.white : colors.textMuted} />
                  </View>
                  {i < STEPS.length - 1 && <View style={[styles.stepLine, i < current && styles.stepLineDone]} />}
                </View>
                <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{s.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionTitle}>Productos</Text>
      <View style={styles.card}>
        {order.items.map((it, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemQty}>{it.qty}×</Text>
            <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{formatSoles(order.total)}</Text>
        </View>
      </View>

      {reorderable.length > 0 && (
        <Pressable
          style={[styles.reorderBtn, reordering && styles.reorderBtnOff]}
          onPress={onReorder}
          disabled={reordering}
          accessibilityRole="button"
          accessibilityLabel="Volver a pedir estos productos"
        >
          {reordering ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="repeat" size={18} color={colors.white} />
              <Text style={styles.reorderText}>Volver a pedir</Text>
            </>
          )}
        </Pressable>
      )}

      <View style={styles.help}>
        <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
        <Text style={styles.helpText}>¿Dudas con tu pedido? Escríbenos por WhatsApp desde "Mi cuenta".</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  number: { fontSize: 18, fontWeight: '800', color: colors.text },
  date: { fontSize: 13, color: colors.textMuted },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fdeaea', borderRadius: radius.md, padding: spacing.lg },
  statusBannerText: { color: colors.error, fontWeight: '700', fontSize: 15 },
  timeline: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepIconCol: { alignItems: 'center' },
  stepDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: colors.primary },
  stepLine: { width: 2, height: 26, backgroundColor: colors.surfaceAlt },
  stepLineDone: { backgroundColor: colors.primary },
  stepLabel: { fontSize: 15, color: colors.textMuted, paddingTop: 6 },
  stepLabelDone: { color: colors.text, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  itemRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 6 },
  itemQty: { fontSize: 14, fontWeight: '800', color: colors.primary },
  itemName: { flex: 1, fontSize: 14, color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm },
  totalLabel: { fontSize: 14, color: colors.textMuted },
  total: { fontSize: 16, fontWeight: '800', color: colors.primary },
  reorderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 50, marginTop: spacing.xl },
  reorderBtnOff: { opacity: 0.6 },
  reorderText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  help: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xl, paddingHorizontal: spacing.sm },
  helpText: { flex: 1, fontSize: 12, color: colors.textMuted },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TabParamList, RootStackParamList } from '../navigation/types';
import type { Product } from '../types';
import { useCart } from '../store/cartStore';
import { fetchProducts } from '../api/products';
import { FreeShippingBar } from '../components/FreeShippingBar';
import { HorizontalProducts } from '../components/HorizontalProducts';
import { CouponField } from '../components/CouponField';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';
import { formatSoles } from '../utils/format';
import { colors, spacing, radius } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Carrito'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function CartScreen({ navigation }: Props) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const subtotal = useCart((s) => s.subtotal());
  const discount = useCart((s) => s.discount());
  const total = useCart((s) => s.total());
  const coupon = useCart((s) => s.coupon);
  const [recommended, setRecommended] = useState<Product[]>([]);

  useEffect(() => {
    fetchProducts({ perPage: 10, orderby: 'popularity' })
      .then((r) => setRecommended(r.products))
      .catch(() => {});
  }, []);

  const inCart = new Set(items.map((i) => i.productId));
  const suggestions = recommended.filter((p) => !inCart.has(p.id));

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="cart-outline" size={64} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
        <Text style={styles.emptyText}>Explora el catálogo y agrega tus vitaminas y suplementos.</Text>
        <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('Catalogo')}>
          <Text style={styles.emptyBtnText}>Ver productos</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.productId)}
        contentContainerStyle={{ padding: spacing.md }}
        ListFooterComponent={
          suggestions.length > 0 ? (
            <HorizontalProducts
              title="Completa tu compra"
              products={suggestions}
              onOpen={(p) => navigation.navigate('ProductDetail', { id: p.id, name: p.name })}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.thumb} contentFit="contain" />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
            )}
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.price}>{formatSoles(item.unitPrice)}</Text>
              <View style={styles.qty}>
                <Pressable style={styles.qtyBtn} onPress={() => setQty(item.productId, item.quantity - 1)} accessibilityRole="button" accessibilityLabel={`Disminuir cantidad de ${item.name}`}>
                  <Text style={styles.qtyBtnText}>–</Text>
                </Pressable>
                <Text style={styles.qtyNum}>{item.quantity}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => setQty(item.productId, item.quantity + 1)} accessibilityRole="button" accessibilityLabel={`Aumentar cantidad de ${item.name}`}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Pressable
              onPress={() => {
                analytics.track(EV.REMOVE_FROM_CART, { id: item.productId, name: item.name });
                remove(item.productId);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Eliminar ${item.name} del carrito`}
            >
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </Pressable>
          </View>
        )}
      />

      <View style={styles.summary}>
        <FreeShippingBar subtotal={subtotal} />
        <CouponField />
        <View style={styles.lineRow}>
          <Text style={styles.lineLabel}>Subtotal</Text>
          <Text style={styles.lineValue}>{formatSoles(subtotal)}</Text>
        </View>
        {discount > 0 && (
          <View style={styles.lineRow}>
            <Text style={styles.lineLabel}>Descuento{coupon ? ` (${coupon.code})` : ''}</Text>
            <Text style={[styles.lineValue, { color: colors.success }]}>− {formatSoles(discount)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatSoles(total)}</Text>
        </View>
        <Pressable
          style={styles.checkout}
          onPress={() => {
            analytics.track(EV.BEGIN_CHECKOUT, { value: total, items: items.length, coupon: coupon?.code });
            navigation.navigate('Checkout');
          }}
        >
          <Text style={styles.checkoutText}>Ir a pagar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.surface },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyBtn: { marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  price: { fontSize: 14, fontWeight: '800', color: colors.primary },
  qty: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, marginTop: 4 },
  qtyBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 20, fontWeight: '700', color: colors.primary },
  qtyNum: { fontSize: 14, fontWeight: '700', minWidth: 22, textAlign: 'center' },
  summary: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  envioHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineLabel: { fontSize: 14, color: colors.textMuted },
  lineValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  totalLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  checkout: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  checkoutText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  note: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});

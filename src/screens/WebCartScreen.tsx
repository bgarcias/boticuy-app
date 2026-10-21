import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TabParamList, RootStackParamList } from '../navigation/types';
import type { Product } from '../types';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { fetchProducts } from '../api/products';
import { revalidateCart } from '../utils/cartRevalidation';
import { buildWebCartUrl, WEB_CART_MAX_LINES, WEB_CART_MAX_QTY } from '../utils/webCart';
import { HorizontalProducts } from '../components/HorizontalProducts';
import { CouponField } from '../components/CouponField';
import { STORE_URL_POLICY } from '../constants/storePolicy';
import { STORE_API_URL } from '../config/features';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';
import { formatSoles } from '../utils/format';
import { colors, spacing, radius } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Carrito'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Carrito del app que TERMINA EN LA WEB (modo sin compra). Solo muestra
 * productos, cantidades, quitar y un subtotal informativo: sin envío, sin
 * descuentos, sin puntos, sin cupones y sin pedir ningún dato personal. El botón
 * final abre en el navegador un enlace de la web que arma este carrito y lo lleva
 * al carrito web (ver utils/webCart.ts y includes/class-web-cart.php en el plugin).
 * Reutiliza el CouponField original en su variante web (un solo código): el app solo revisa el
 * formato, lo guarda en `cartStore.coupon` (descuento neutro) y lo manda a la web junto con los
 * productos (parámetro `bcy_coupon`); la web valida el cupón y calcula el descuento. No llama a
 * ninguna ruta de cupones (siguen cerradas).
 * Con PURCHASE_ENABLED el tab usa el CartScreen de siempre.
 */
export function WebCartScreen({ navigation }: Props) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const subtotal = useCart((s) => s.subtotal());
  const showToast = useToast((s) => s.show);
  const coupon = useCart((s) => s.coupon);
  const [kbOffset, setKbOffset] = useState(0);
  const rootRef = useRef<View>(null);
  const [recommended, setRecommended] = useState<Product[]>([]);

  // Al abrir el carrito se revalida stock y precio contra la Store API (lectura pública).
  const checkStock = useCallback(() => {
    let cancelled = false;
    (async () => {
      const { issues } = await revalidateCart(() => cancelled);
      if (!cancelled && issues.length > 0) {
        showToast(issues.join('\n'), { variant: 'warning', duration: 5000 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);
  useFocusEffect(checkStock);

  useEffect(() => {
    fetchProducts({ perPage: 10, orderby: 'popularity' })
      .then((r) => setRecommended(r.products))
      .catch(() => {});
  }, []);

  const inCart = new Set(items.map((i) => i.productId));
  const suggestions = recommended.filter((p) => !inCart.has(p.id));

  const continueOnWeb = () => {
    const link = buildWebCartUrl(
      items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      STORE_API_URL,
      STORE_URL_POLICY,
      coupon?.code
    );
    if (!link) {
      showToast('No pudimos abrir la web. Inténtalo de nuevo.');
      return;
    }
    analytics.track(EV.WEB_CART_OPEN, { items: link.lines.length, units: link.lines.reduce((n, l) => n + l.quantity, 0), coupon: link.coupon !== undefined });
    Linking.openURL(link.url).catch(() => showToast('No pudimos abrir la web. Inténtalo de nuevo.'));
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="cart-outline" size={64} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
        <Text style={styles.emptyText}>Explora el catálogo y agrega los productos que quieras llevar.</Text>
        <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('Catalogo')} accessibilityRole="button">
          <Text style={styles.emptyBtnText}>Ver productos</Text>
        </Pressable>
      </View>
    );
  }

  const limitsApply = items.length > WEB_CART_MAX_LINES || items.some((i) => i.quantity >= WEB_CART_MAX_QTY);

  return (
    <View ref={rootRef} style={styles.container} onLayout={() => rootRef.current?.measureInWindow((_x, y) => setKbOffset(y))}>
     <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={kbOffset}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={items}
        keyExtractor={(i) => String(i.productId)}
        contentContainerStyle={{ padding: spacing.md }}
        ListFooterComponent={
          suggestions.length > 0 ? (
            <HorizontalProducts
              title="También te puede interesar"
              products={suggestions}
              onOpen={(p) => navigation.navigate('ProductDetail', { id: p.id, name: p.name })}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const cap = Math.min(item.stockLimit ?? Number.POSITIVE_INFINITY, WEB_CART_MAX_QTY);
          return (
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
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => setQty(item.productId, item.quantity - 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Disminuir cantidad de ${item.name}`}
                  >
                    <Text style={styles.qtyBtnText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyNum}>{item.quantity}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => setQty(item.productId, Math.min(cap, item.quantity + 1))}
                    disabled={item.quantity >= cap}
                    accessibilityRole="button"
                    accessibilityLabel={`Aumentar cantidad de ${item.name}`}
                  >
                    <Text style={[styles.qtyBtnText, item.quantity >= cap && styles.qtyBtnOff]}>+</Text>
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
          );
        }}
      />

      <View style={styles.summary}>
        <CouponField />
        <View style={styles.lineRow}>
          <Text style={styles.totalLabel}>Subtotal referencial</Text>
          <Text style={styles.totalValue}>{formatSoles(subtotal)}</Text>
        </View>
        <Text style={styles.note}>El envío, los descuentos y el total final se calculan en nuestra web.</Text>
        {limitsApply ? (
          <Text style={styles.note}>
            Puedes llevar hasta {WEB_CART_MAX_LINES} productos distintos y {WEB_CART_MAX_QTY} unidades de cada uno por compra.
          </Text>
        ) : null}
        <Pressable style={styles.cta} onPress={continueOnWeb} accessibilityRole="button" accessibilityLabel="Continuar en la web">
          <Ionicons name="open-outline" size={18} color={colors.white} />
          <Text style={styles.ctaText}>Continuar en la web</Text>
        </Pressable>
        <Text style={styles.ctaSub}>Terminas tu compra en boticuy.com</Text>
      </View>
     </KeyboardAvoidingView>
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
  qtyBtnOff: { color: colors.border },
  qtyNum: { fontSize: 14, fontWeight: '700', minWidth: 22, textAlign: 'center' },
  summary: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  note: { fontSize: 12, color: colors.textMuted },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 52,
  },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  ctaSub: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});

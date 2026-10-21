import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { Creator } from '../types';
import { fetchMisCupones, fetchCuponesOro, validateCoupon } from '../api/coupons';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { analytics } from '../analytics';
import { Loading, ErrorView, Empty } from '../components/Feedback';
import { formatSoles } from '../utils/format';
import { normalizeCouponCode } from '../utils/webCart';
import { PURCHASE_ENABLED, CART_ENABLED } from '../config/features';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MyCoupons'>;

/**
 * Mis cupones — dos grupos, cada uno de su propio endpoint: "Disponibles"
 * (/mis-cupones, cupones normales) y "Exclusivos Oro" (/cupones-oro, con el
 * gate de acceso ya resuelto en el servidor). Sin historial de uso.
 *
 * Dos modos, elegidos por PURCHASE_ENABLED (ver config/features.ts):
 *  - Con PURCHASE_ENABLED: el original (exige sesión, las dos listas, "Usar" valida contra GET /coupon).
 *  - Sin él: sin sesión ni niveles. Solo la lista de /mis-cupones (no se llama a /cupones-oro ni se
 *    muestra "Exclusivos Oro"); "Usar" guarda el código en el carrito (descuento neutro, tipo 'web')
 *    para mandarlo a la web, igual que "Apoya a tu creador".
 */
export function MyCouponsScreen({ navigation }: Props) {
  const webMode = !PURCHASE_ENABLED;
  // PURCHASE_ENABLED es una constante de build: el hook se llama (o no) siempre igual en cada render.
  const authorized = webMode ? true : useRequireAuth();
  const [disponibles, setDisponibles] = useState<Creator[]>([]);
  const [oro, setOro] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setCoupon = useCart((s) => s.setCoupon);
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const showToast = useToast((s) => s.show);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchMisCupones(), webMode ? Promise.resolve([] as Creator[]) : fetchCuponesOro()])
      .then(([m, o]) => {
        setDisponibles(m);
        setOro(o);
      })
      .catch(() => setError('No pudimos cargar los cupones.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const use = async (c: Creator) => {
    if (webMode) {
      const check = normalizeCouponCode(c.code);
      if (!check.ok) {
        showToast('Este código no se puede usar desde el app.', { variant: 'warning' });
        return;
      }
      // Porcentaje informativo del listado (sin monto en soles); la web valida el código y aplica el descuento real.
      const percent = typeof c.amount === 'number' && Number.isFinite(c.amount) && c.amount > 0 ? c.amount : undefined;
      setCoupon({ code: check.code, discount_type: 'web', amount: 0, minimum_amount: 0, ...(percent !== undefined ? { percent } : {}) });
      analytics.track('apply_creator_coupon', { code: check.code });
      showToast(`Cupón ${check.code} guardado`);
      navigation.navigate('Tabs', { screen: CART_ENABLED ? 'Carrito' : 'Catalogo' });
      return;
    }
    if (c.amount == null) return;
    // Revalida contra /coupon en vez de asumir discount_type/minimum_amount: los
    // listados de creador no traen el monto mínimo real del cupón en WooCommerce,
    // así que aplicarlo a ciegas con minimum_amount:0 podía saltarse esa regla.
    try {
      const cartItems = items.map((i) => ({ id: i.productId, qty: i.quantity }));
      const res = await validateCoupon(c.code, cartItems);
      if (!res.valid || !res.coupon) {
        showToast(res.reason ?? 'Cupón no válido', { variant: 'warning' });
        return;
      }
      if (res.coupon.minimum_amount && subtotal < res.coupon.minimum_amount) {
        showToast(`Compra mínima ${formatSoles(res.coupon.minimum_amount)} para este cupón`, { variant: 'warning' });
        return;
      }
      setCoupon(res.coupon);
      analytics.track('apply_creator_coupon', { code: res.coupon.code, amount: res.coupon.amount });
      showToast(`Cupón ${res.coupon.code} aplicado 🎉`);
      navigation.navigate('Tabs', { screen: 'Catalogo' });
    } catch {
      showToast('No pudimos validar el cupón. Intenta de nuevo.', { variant: 'warning' });
    }
  };

  if (!authorized) return null;
  if (loading) return <Loading label="Cargando cupones…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;
  if (disponibles.length === 0 && oro.length === 0) return <Empty message="No hay cupones activos por ahora." />;

  const Card = (c: Creator) => (
    <View key={c.code} style={styles.card}>
      <View style={styles.left}>
        {!!c.name && c.name.toLowerCase() !== c.code.toLowerCase() && <Text style={styles.name}>{c.name}</Text>}
        <Text style={styles.code}>{c.code}</Text>
        {/* Con el monto que devuelve el servidor: "N% de descuento" (igual que con compra). Solo en modo web y sin monto: "Condiciones en la web". */}
        {webMode && c.amount == null ? (
          <Text style={styles.channel}>Condiciones en la web</Text>
        ) : (
          c.amount != null && <Text style={styles.off}>{c.amount}% de descuento</Text>
        )}
      </View>
      <Pressable style={styles.useBtn} onPress={() => use(c)}>
        <Ionicons name="pricetag" size={16} color={colors.white} />
        <Text style={styles.useText}>Usar</Text>
      </Pressable>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      {/* Oro primero: sus descuentos suelen ser más altos, van con prioridad visual. */}
      {!webMode && oro.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Ionicons name="star" size={18} color={colors.warning} />
            <Text style={styles.sectionTitleInline}>Exclusivos Oro</Text>
          </View>
          {oro.map(Card)}
        </>
      )}

      {disponibles.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, oro.length > 0 && { marginTop: spacing.lg }]}>Disponibles</Text>
          {disponibles.map(Card)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitleInline: { fontSize: 17, fontWeight: '800', color: colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  left: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  code: { fontSize: 16, fontWeight: '800', color: colors.primaryDark, letterSpacing: 0.5 },
  channel: { fontSize: 12, color: colors.textMuted },
  off: { fontSize: 13, color: colors.success, fontWeight: '700', marginTop: 2 },
  useBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, minHeight: 44 },
  useText: { color: colors.white, fontWeight: '800' },
});

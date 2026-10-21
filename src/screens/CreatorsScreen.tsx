import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { Creator } from '../types';
import { fetchApoyaCreador, fetchMisCupones, validateCoupon } from '../api/coupons';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { analytics } from '../analytics';
import { Loading, ErrorView, Empty } from '../components/Feedback';
import { formatSoles } from '../utils/format';
import { normalizeCouponCode } from '../utils/webCart';
import { PURCHASE_ENABLED, CART_ENABLED } from '../config/features';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Creators'>;

/**
 * "Apoya a tu creador". Dos modos, elegidos por PURCHASE_ENABLED (ver config/features.ts):
 *  - Con PURCHASE_ENABLED: el original (creadores + "Otros cupones disponibles", "Usar" valida
 *    contra el servidor con GET /coupon y aplica el descuento calculado en el app).
 *  - Sin él (carrito que termina en la web): solo la sección de creadores (GET /apoya-creador).
 *    /mis-cupones sigue cerrada: NO se llama (el código de "Otros cupones disponibles" se
 *    conserva sin renderizarse, por si se reabre). "Usar" no valida contra el servidor ni revisa
 *    mínimos: guarda el código en el carrito (descuento neutro, tipo 'web') para mandarlo a la web.
 */
export function CreatorsScreen({ navigation }: Props) {
  const webMode = !PURCHASE_ENABLED;
  const [copa, setCopa] = useState<Creator[]>([]);
  // Cupones generales, mostrados como contenido adicional debajo de Copa
  // Boticuy — así la pantalla nunca se siente vacía y siempre hay algo que usar.
  const [otros, setOtros] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setCoupon = useCart((s) => s.setCoupon);
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const showToast = useToast((s) => s.show);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchApoyaCreador(), webMode ? Promise.resolve([] as Creator[]) : fetchMisCupones()])
      .then(([c, m]) => {
        setCopa(c);
        setOtros(m);
      })
      // En modo web, un 503 (ruta cerrada en el servidor) o cualquier fallo se muestra con un mensaje amable y "Reintentar".
      .catch(() =>
        setError(webMode ? 'Los códigos de creadores no están disponibles por ahora. Inténtalo más tarde.' : 'No pudimos cargar los creadores.')
      )
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
    // Solo se llega acá desde el botón "Usar", que solo se muestra si c.active
    // y por lo tanto c.amount ya es un número real (ver Card) — este guard es
    // solo para que el tipo quede correcto, no debería dispararse en la práctica.
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

  if (loading) return <Loading label="Cargando creadores…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;
  if (copa.length === 0 && otros.length === 0) return <Empty message="Pronto habrá códigos de creadores." />;

  // Todo lo que llega acá ya es active:true — /apoya-creador y /mis-cupones
  // solo devuelven cupones vigentes, así que Card no necesita rama "Próximamente".
  const Card = (c: Creator) => (
    <View key={c.code} style={styles.card}>
      <View style={styles.left}>
        {!!c.name && c.name.toLowerCase() !== c.code.toLowerCase() && <Text style={styles.name}>{c.name}</Text>}
        <Text style={styles.code}>{c.code}</Text>
        {!!c.channel && <Text style={styles.channel}>{c.channel}</Text>}
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
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Apoya a tu creador favorito 💜</Text>
        <Text style={styles.introText}>
          {webMode
            ? 'Usa el código de tu creador favorito. La web valida el código y aplica el descuento según sus condiciones.'
            : 'Usa el código de tu creador y obtén descuento en tu compra. Tú ahorras y ellos suman.'}
        </Text>
      </View>

      {copa.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Ionicons name="trophy" size={18} color={colors.warning} />
            <Text style={styles.sectionTitle}>Copa Boticuy</Text>
          </View>
          {copa.map(Card)}
        </>
      )}

      {otros.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Otros cupones disponibles</Text>
          </View>
          {otros.map(Card)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  intro: { marginBottom: spacing.md, gap: 6 },
  introTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  introText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
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

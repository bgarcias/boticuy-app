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
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Creators'>;

export function CreatorsScreen({ navigation }: Props) {
  const [copa, setCopa] = useState<Creator[]>([]);
  // Cupones generales, mostrados como contenido adicional debajo de Copa
  // Boticuy — así la pantalla nunca se siente vacía y siempre hay algo que usar.
  const [otros, setOtros] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setCoupon = useCart((s) => s.setCoupon);
  const subtotal = useCart((s) => s.subtotal());
  const showToast = useToast((s) => s.show);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchApoyaCreador(), fetchMisCupones()])
      .then(([c, m]) => {
        setCopa(c);
        setOtros(m);
      })
      .catch(() => setError('No pudimos cargar los creadores.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const use = async (c: Creator) => {
    // Solo se llega acá desde el botón "Usar", que solo se muestra si c.active
    // y por lo tanto c.amount ya es un número real (ver Card) — este guard es
    // solo para que el tipo quede correcto, no debería dispararse en la práctica.
    if (c.amount == null) return;
    // Revalida contra /coupon en vez de asumir discount_type/minimum_amount: los
    // listados de creador no traen el monto mínimo real del cupón en WooCommerce,
    // así que aplicarlo a ciegas con minimum_amount:0 podía saltarse esa regla.
    try {
      const res = await validateCoupon(c.code);
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
        {c.amount != null && <Text style={styles.off}>{c.amount}% de descuento</Text>}
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
          Usa el código de tu creador y obtén descuento en tu compra. Tú ahorras y ellos suman.
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

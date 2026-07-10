import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { Creator } from '../types';
import { fetchCreators } from '../api/coupons';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { analytics } from '../analytics';
import { Loading, ErrorView, Empty } from '../components/Feedback';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Creators'>;

export function CreatorsScreen({ navigation }: Props) {
  const [copa, setCopa] = useState<Creator[]>([]);
  const [fijo, setFijo] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setCoupon = useCart((s) => s.setCoupon);
  const showToast = useToast((s) => s.show);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchCreators()
      .then((r) => {
        setCopa(r.copa);
        setFijo(r.fijo);
      })
      .catch(() => setError('No pudimos cargar los creadores.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const use = (c: Creator) => {
    setCoupon({ code: c.code, discount_type: 'percent', amount: c.amount, minimum_amount: 0 });
    analytics.track('apply_creator_coupon', { code: c.code, amount: c.amount });
    showToast(`Cupón ${c.code} aplicado 🎉`);
    navigation.navigate('Tabs', { screen: 'Catalogo' });
  };

  if (loading) return <Loading label="Cargando creadores…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;
  if (copa.length === 0 && fijo.length === 0) return <Empty message="Pronto habrá códigos de creadores." />;

  const Card = (c: Creator) => (
    <View key={c.code} style={styles.card}>
      <View style={styles.left}>
        {!!c.name && c.name !== c.code && <Text style={styles.name}>{c.name}</Text>}
        <Text style={styles.code}>{c.code}</Text>
        {!!c.channel && <Text style={styles.channel}>{c.channel}</Text>}
        <Text style={styles.off}>{c.amount}% de descuento</Text>
      </View>
      {c.active ? (
        <Pressable style={styles.useBtn} onPress={() => use(c)}>
          <Ionicons name="pricetag" size={16} color={colors.white} />
          <Text style={styles.useText}>Usar</Text>
        </Pressable>
      ) : (
        <View style={styles.soonPill}>
          <Text style={styles.soonText}>Próximamente</Text>
        </View>
      )}
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

      {fijo.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Ionicons name="star" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Creadores aliados</Text>
          </View>
          {fijo.map(Card)}
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
  soonPill: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  soonText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
});

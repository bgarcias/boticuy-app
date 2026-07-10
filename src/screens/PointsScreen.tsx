import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { PointsInfo } from '../types';
import { fetchPoints } from '../api/points';
import { Loading, ErrorView } from '../components/Feedback';
import { formatSoles } from '../utils/format';
import { colors, spacing, radius, shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Points'>;

const LEVELS = [
  { key: 'bronce', label: 'Bronce', emoji: '🥉', min: 0 },
  { key: 'plata', label: 'Plata', emoji: '🥈', min: 500 },
  { key: 'oro', label: 'Oro', emoji: '🥇', min: 1500 },
];

export function PointsScreen(_props: Props) {
  const [info, setInfo] = useState<PointsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPoints()
      .then(setInfo)
      .catch(() => setError('No pudimos cargar tus puntos.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  if (loading) return <Loading label="Cargando tus puntos…" />;
  if (error || !info) return <ErrorView message={error ?? undefined} onRetry={load} />;

  const progress = info.next_level_at ? Math.min(1, info.balance / info.next_level_at) : 1;
  const falta = info.next_level_at ? info.next_level_at - info.balance : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.hero}>
        <Text style={styles.balance}>{info.balance}</Text>
        <Text style={styles.balanceLabel}>puntos</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>Nivel {info.level_name}</Text>
        </View>
        <Text style={styles.value}>Equivalen a {formatSoles(info.soles_value)} de descuento</Text>
      </View>

      {info.next_level_at && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Te faltan {falta} puntos para el siguiente nivel</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Niveles</Text>
      <View style={styles.card}>
        {LEVELS.map((l) => (
          <View key={l.key} style={styles.levelRow}>
            <Text style={styles.levelEmoji}>{l.emoji}</Text>
            <Text style={[styles.levelName, info.level === l.key && { color: colors.primary, fontWeight: '800' }]}>{l.label}</Text>
            <Text style={styles.levelMin}>{l.min}+ pts</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>¿Cómo funciona?</Text>
      <View style={styles.card}>
        <Bullet text="Ganas 1 punto por cada S/1 en compras entregadas." />
        <Bullet text="100 puntos = S/5 de descuento en tu próxima compra." />
        <Bullet text="Sube de nivel y desbloquea más beneficios." />
        <Bullet text="Los puntos se acreditan cuando tu pedido llega a 'Entregado'." />
      </View>
    </ScrollView>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  balance: { fontSize: 52, fontWeight: '800', color: colors.white },
  balanceLabel: { fontSize: 16, color: colors.white, opacity: 0.9, marginTop: -8 },
  levelBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 6, marginTop: spacing.md },
  levelText: { color: colors.white, fontWeight: '800' },
  value: { color: colors.white, opacity: 0.9, marginTop: spacing.sm, fontSize: 13 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md, ...shadow.card },
  cardTitle: { fontSize: 14, color: colors.text, fontWeight: '600', marginBottom: spacing.sm },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.xs },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  levelEmoji: { fontSize: 20 },
  levelName: { flex: 1, fontSize: 15, color: colors.text },
  levelMin: { fontSize: 13, color: colors.textMuted },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: spacing.sm },
  bulletText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
});

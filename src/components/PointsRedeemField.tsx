import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ToggleSwitch } from './ToggleSwitch';
import { formatSoles } from '../utils/format';
import { colors, radius, spacing } from '../theme';

const SOLES_PER_POINT = 0.05;

interface Props {
  /** Saldo de puntos disponible del usuario (ya viene neto de canjes previos). */
  balance: number;
  /** Subtotal del carrito, para calcular el tope del 30%. */
  subtotal: number;
  /** Puntos a canjear, controlado por el padre — 0 significa apagado. */
  value: number;
  onChange: (points: number) => void;
}

/**
 * Canje de puntos por descuento — toggle simple ("Usar mis puntos"), sin
 * elegir cantidad: al activarlo aplica siempre el máximo permitido (el menor
 * entre el valor en soles del saldo y el 30% del subtotal).
 */
export function PointsRedeemField({ balance, subtotal, value, onChange }: Props) {
  if (balance <= 0) return null;

  const capPoints = Math.floor((subtotal * 0.3) / SOLES_PER_POINT);
  const maxRedeemable = Math.max(0, Math.min(balance, capPoints));
  if (maxRedeemable <= 0) return null;
  const maxDiscount = Math.round(maxRedeemable * SOLES_PER_POINT * 100) / 100;

  const active = value > 0;
  // Si el 30% del subtotal es lo que realmente limita (no se llega a usar el
  // saldo completo), se avisa cuántos puntos quedan sin usar para la próxima
  // compra. Si el límite es el saldo completo, no hace falta esta nota.
  const limitedBy30 = maxRedeemable < balance;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Canjear puntos</Text>
      <Text style={styles.hint}>
        Tienes {balance} puntos. Puedes descontar hasta {formatSoles(maxDiscount)} en este pedido.
      </Text>
      <View style={styles.toggle}>
        <Text style={styles.toggleText}>Usar mis puntos</Text>
        <ToggleSwitch value={active} onChange={(v) => onChange(v ? maxRedeemable : 0)} />
      </View>
      {active && (
        <View style={styles.appliedWrap}>
          <Ionicons name="sparkles" size={16} color={colors.success} />
          <Text style={styles.appliedText}>Descuento aplicado: −{formatSoles(maxDiscount)}</Text>
        </View>
      )}
      {active && limitedBy30 && (
        <Text style={styles.note}>
          Estás usando {maxRedeemable} de tus {balance} puntos - te quedan {balance - maxRedeemable} disponibles para tu próxima compra.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Tarjeta autocontenida — mismo tratamiento que las cards de "Método de
  // pago" en esta pantalla (borde sutil, sin sombra), para consistencia
  // visual dentro del checkout.
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  appliedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eafaf0',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.success,
  },
  appliedText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },
});

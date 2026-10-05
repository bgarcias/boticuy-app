import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { PointsInfo } from '../types';
import { colors, radius, spacing } from '../theme';
import { formatSoles } from '../utils/format';
import { useShippingConfig } from '../store/shippingConfigStore';

const extra = (Constants.expoConfig?.extra ?? {}) as { envioGratisDesde?: number };

interface Props {
  subtotal: number;
  /** Nivel de fidelidad del usuario logueado (null si no hay sesión) — Plata/Oro
   * alcanzan el envío gratis con un umbral menor, mismo cálculo que el checkout
   * real (`class-shipping.php`). */
  level?: PointsInfo['level'] | null;
}

/**
 * Barra de progreso hacia el envío gratis (nudge de conversión).
 *
 * El texto NO menciona "Lima" (ver M9 en boticuy-hallazgos-completo.md): el
 * envío gratis por umbral solo existe hoy en una zona real ("Lima 1
 * CERCANOS"), no en el resto de Lima ni en provincias — prometer algo
 * geográfico acá sería falso para la mayoría de clientes que sí están en
 * Lima. Se generaliza el mensaje ("zonas seleccionadas") en vez de detectar
 * la zona real del cliente en esta pantalla — el costo y la disponibilidad
 * reales ya se calculan y muestran correctamente más adelante, en Checkout y
 * en la confirmación (`Boticuy_App_Shipping::compute_cost()`), una vez que
 * se conoce el destino real; esta barra es solo un nudge de marketing antes
 * de ese punto, sin acceso a ubigeo.
 */
export function FreeShippingBar({ subtotal, level }: Props) {
  const envioGratisDesdeNivel = useShippingConfig((s) => s.envioGratisDesdeNivel);
  const meta = level === 'plata' || level === 'oro' ? envioGratisDesdeNivel : extra.envioGratisDesde ?? 69;
  const reached = subtotal >= meta;
  const pct = Math.max(0, Math.min(1, subtotal / meta));
  const falta = Math.max(0, meta - subtotal);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Ionicons
          name={reached ? 'checkmark-circle' : 'bicycle'}
          size={18}
          color={reached ? colors.success : colors.primary}
        />
        <Text style={styles.text}>
          {reached ? (
            <Text style={{ color: colors.success, fontWeight: '700' }}>¡Tienes envío gratis en zonas seleccionadas! 🎉</Text>
          ) : (
            <>
              Te faltan <Text style={styles.bold}>{formatSoles(falta)}</Text> para{' '}
              <Text style={styles.bold}>envío gratis</Text> en zonas seleccionadas
            </>
          )}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: reached ? colors.success : colors.primary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, fontSize: 13, color: colors.text },
  bold: { fontWeight: '700', color: colors.primaryDark },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});

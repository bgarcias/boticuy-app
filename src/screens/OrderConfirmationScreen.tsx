import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { useCart } from '../store/cartStore';
import { formatSoles } from '../utils/format';
import { orderHandlingMessage } from '../utils/attention';
import { openWhatsApp } from '../utils/whatsapp';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderConfirmation'>;

export function OrderConfirmationScreen({ route, navigation }: Props) {
  const { nombre, email, distrito, metodoPago, envio, total, coupon, discount, orderNumber } = route.params;
  const insets = useSafeAreaInsets();
  const clear = useCart((s) => s.clear);
  const handling = orderHandlingMessage();

  // Vaciar el carrito al llegar a la confirmación.
  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: 'center' }}>
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={48} color={colors.white} />
        </View>
        <Text style={styles.title}>¡Pedido confirmado!</Text>
        <Text style={styles.sub}>Gracias, {nombre.split(' ')[0]}. Te contactaremos por WhatsApp para coordinar la entrega.</Text>

        <View style={styles.card}>
          {!!orderNumber && <Row label="N° de pedido" value={`#${orderNumber}`} />}
          <Row label="Entrega en" value={distrito} />
          {!!coupon && !!discount && discount > 0 && (
            <Row label={`Cupón ${coupon}`} value={`− ${formatSoles(discount)}`} />
          )}
          <Row label="Envío" value={envio > 0 ? formatSoles(envio) : 'Gratis'} />
          <Row label="Total" value={formatSoles(total)} bold />
          <View style={styles.divider} />
          {metodoPago === 'tarjeta' ? (
            <View style={styles.pago}>
              <Text style={styles.pagoTitle}>Pago con tarjeta ✓</Text>
              <Text style={styles.pagoText}>Tu pago fue procesado de forma segura por Izipay.</Text>
            </View>
          ) : metodoPago === 'yape' ? (
            <View style={styles.pago}>
              <Text style={styles.pagoTitle}>Pago con Yape / Plin</Text>
              <Text style={styles.pagoText}>
                Te enviaremos el número y el QR de Yape a {email} y por WhatsApp para completar el pago y verificar tu pedido.
              </Text>
            </View>
          ) : (
            <View style={styles.pago}>
              <Text style={styles.pagoTitle}>Pago contra entrega</Text>
              <Text style={styles.pagoText}>Paga en efectivo al momento de recibir tu pedido.</Text>
            </View>
          )}
        </View>

        <View style={styles.handling}>
          <Ionicons name="time-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.handlingText}>{handling.text}</Text>
        </View>

        <Pressable
          style={styles.waBtn}
          onPress={() => openWhatsApp(`Hola Boticuy, acabo de hacer un pedido (entrega en ${distrito}).`)}
        >
          <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
          <Text style={styles.waBtnText}>Coordinar por WhatsApp</Text>
        </Pressable>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            {orderNumber?.startsWith('PREVIEW-')
              ? 'Vista previa: todavía no se activó el registro real de pedidos.'
              : metodoPago === 'tarjeta'
                ? 'Tu pago con tarjeta fue confirmado y tu pedido quedó registrado.'
                : 'Tu pedido quedó registrado.'}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          style={styles.cta}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
        >
          <Text style={styles.ctaText}>Seguir comprando</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontSize: 18, color: colors.primary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  checkCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, marginBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, width: '100%', marginTop: spacing.xl, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  pago: { gap: 4 },
  pagoTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  pagoText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  handling: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eaf2ff', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg, width: '100%' },
  handlingText: { flex: 1, fontSize: 13, color: colors.primaryDark, fontWeight: '600' },
  waBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success, borderRadius: radius.pill, minHeight: 48, width: '100%', marginTop: spacing.md },
  waBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: spacing.lg, paddingHorizontal: spacing.sm },
  noteText: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  bottomBar: { padding: spacing.lg, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});

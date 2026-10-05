import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { validateCoupon } from '../api/coupons';
import { formatSoles } from '../utils/format';
import { colors, radius, spacing } from '../theme';

/** Campo para ingresar/quitar un cupón de descuento. */
export function CouponField() {
  const coupon = useCart((s) => s.coupon);
  const setCoupon = useCart((s) => s.setCoupon);
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const discount = useCart((s) => s.discount());
  const showToast = useToast((s) => s.show);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (raw?: string) => {
    const value = (raw ?? code).trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const cartItems = items.map((i) => ({ id: i.productId, qty: i.quantity }));
      const res = await validateCoupon(value, cartItems);
      if (!res.valid || !res.coupon) {
        setError(res.reason ?? 'Cupón no válido');
        return;
      }
      if (res.coupon.minimum_amount && subtotal < res.coupon.minimum_amount) {
        setError(`Compra mínima ${formatSoles(res.coupon.minimum_amount)} para este cupón`);
        return;
      }
      setCoupon(res.coupon);
      setCode('');
      showToast(`Cupón ${res.coupon.code} aplicado 🎉`);
    } catch {
      setError('No pudimos validar el cupón. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (coupon) {
    const belowMinimum = !!coupon.minimum_amount && subtotal < coupon.minimum_amount;
    // discount_type distinto de percent/fixed_cart (ej. fixed_product): cartStore.discount()
    // no sabe calcularlo y devuelve 0 a propósito, para no inventar un monto (ver M10 en
    // boticuy-hallazgos-completo.md) — mostrar "−S/0.00" daría a entender que el cupón no
    // hace nada, cuando en realidad create_order() sí lo aplica bien (WooCommerce nativo).
    // Sin cupones fixed_product reales hoy (confirmado con Bran) — esto cubre el caso a
    // futuro sin invertir en replicar el cálculo completo en el cliente.
    const previewUnsupported = !belowMinimum && discount === 0 && coupon.discount_type !== 'percent' && coupon.discount_type !== 'fixed_cart';
    return (
      <View style={[styles.appliedWrap, belowMinimum && styles.appliedWrapWarn]}>
        <View style={styles.applied}>
          <Ionicons name={belowMinimum ? 'alert-circle' : 'pricetag'} size={16} color={belowMinimum ? colors.warning : colors.success} />
          {belowMinimum ? (
            <Text style={styles.appliedText}>
              Cupón <Text style={{ fontWeight: '800' }}>{coupon.code}</Text>, agrega{' '}
              {formatSoles(coupon.minimum_amount - subtotal)} más para usarlo
            </Text>
          ) : previewUnsupported ? (
            <Text style={styles.appliedText}>
              Cupón <Text style={{ fontWeight: '800' }}>{coupon.code}</Text> válido. El descuento se verá al confirmar tu pedido
            </Text>
          ) : (
            <Text style={styles.appliedText}>
              Cupón <Text style={{ fontWeight: '800' }}>{coupon.code}</Text> · −{formatSoles(discount)}
            </Text>
          )}
        </View>
        <Pressable onPress={() => setCoupon(null)} hitSlop={8}>
          <Text style={styles.remove}>Quitar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="¿Tienes un cupón? Escríbelo aquí"
          placeholderTextColor={colors.textMuted}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => apply()}
        />
        <Pressable style={[styles.btn, !code.trim() && styles.btnOff]} onPress={() => apply()} disabled={!code.trim() || loading}>
          {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnText}>Aplicar</Text>}
        </Pressable>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    color: colors.text,
    backgroundColor: colors.white,
  },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  btnOff: { backgroundColor: colors.textMuted },
  btnText: { color: colors.white, fontWeight: '700' },
  error: { color: colors.error, fontSize: 12, marginTop: 6 },
  appliedWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#eafaf0', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.success },
  appliedWrapWarn: { backgroundColor: '#fff8e6', borderColor: colors.warning },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  appliedText: { color: colors.text, fontSize: 14 },
  remove: { color: colors.error, fontWeight: '700', fontSize: 13 },
});

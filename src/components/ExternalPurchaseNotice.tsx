import React from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';

/** Reemplazo del flujo de compra para productos que no se venden en línea
 *  (ver src/constants/productosNoVendibles.ts) — redirige a un sitio externo
 *  en vez de agregar al carrito. `compact` es para el botón de las tarjetas
 *  de listado (Home/Catálogo/Favoritos/Carrito), donde no entra el aviso. */
export function ExternalPurchaseNotice({ url, compact }: { url: string; compact?: boolean }) {
  const open = () => Linking.openURL(url).catch(() => {});

  if (compact) {
    return (
      <Pressable
        style={styles.compactBtn}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Ver dónde comprar este producto"
      >
        <Ionicons name="open-outline" size={14} color={colors.white} />
        <Text style={styles.compactText}>Dónde comprar</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.notice}>
        Este producto no se vende en la app ni en la web de Boticuy. Cómpralo directamente en su sitio oficial.
      </Text>
      <Pressable
        style={styles.btn}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Ver dónde comprar este producto"
      >
        <Ionicons name="open-outline" size={18} color={colors.white} />
        <Text style={styles.btnText}>Dónde comprar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: spacing.xs },
  notice: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 52,
  },
  btnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 44,
  },
  compactText: { color: colors.white, fontWeight: '700', fontSize: 12 },
});

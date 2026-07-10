import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Product } from '../types';
import { Price } from './Price';
import { useFavorites } from '../store/favoritesStore';
import { useToast } from '../store/toastStore';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';
import { priceToSoles } from '../utils/format';
import { colors, radius, spacing, shadow } from '../theme';

export function ProductCard({
  product,
  onPress,
  onAdd,
  horizontal,
}: {
  product: Product;
  onPress: () => void;
  onAdd: () => void;
  horizontal?: boolean;
}) {
  const img = product.images?.[0]?.src;
  const fav = useFavorites((s) => s.isFav(product.id));
  const toggleFav = useFavorites((s) => s.toggle);
  const showToast = useToast((s) => s.show);
  const handleAdd = () => {
    onAdd();
    if (product.is_in_stock) {
      showToast('Agregado al carrito');
      analytics.track(EV.ADD_TO_CART, { id: product.id, name: product.name, price: priceToSoles(product.prices), source: 'card' });
    }
  };
  return (
    <Pressable
      style={({ pressed }) => [styles.card, horizontal && styles.cardHorizontal, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${product.name}`}
    >
      <View style={styles.imageWrap}>
        {img ? (
          <Image source={{ uri: img }} style={styles.image} contentFit="contain" transition={150} />
        ) : (
          <View style={[styles.image, styles.noImage]} />
        )}
        {product.on_sale && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>OFERTA</Text>
          </View>
        )}
        <Pressable
          style={styles.heart}
          onPress={() => toggleFav(product)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={fav ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}
        >
          <Ionicons
            name={fav ? 'heart' : 'heart-outline'}
            size={20}
            color={fav ? colors.error : colors.textMuted}
          />
        </Pressable>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <Price prices={product.prices} size={16} />
      <View style={styles.verRow}>
        <Text style={styles.verText}>Ver detalle</Text>
        <Ionicons name="chevron-forward" size={12} color={colors.primary} />
      </View>
      <Pressable
        style={[styles.addBtn, !product.is_in_stock && styles.addBtnOff]}
        onPress={handleAdd}
        disabled={!product.is_in_stock}
      >
        <Text style={styles.addText}>{product.is_in_stock ? 'Agregar' : 'Sin stock'}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    margin: spacing.xs,
    ...shadow.card,
  },
  cardHorizontal: { flex: 0, width: 158 },
  cardPressed: { opacity: 0.7 },
  verRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  verText: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  imageWrap: { position: 'relative', alignItems: 'center' },
  image: { width: '100%', height: 130, borderRadius: radius.sm },
  noImage: { backgroundColor: colors.surfaceAlt },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.error,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  heart: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: spacing.sm, minHeight: 38 },
  addBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOff: { backgroundColor: colors.textMuted },
  addText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});

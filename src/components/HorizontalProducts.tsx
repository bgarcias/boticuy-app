import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import type { Product } from '../types';
import { ProductCard } from './ProductCard';
import { useCart } from '../store/cartStore';
import { CART_ENABLED } from '../config/features';
import { colors, spacing, typography } from '../theme';

interface Props {
  title: string;
  products: Product[];
  onOpen: (p: Product) => void;
}

/** Fila horizontal de productos (descubrimiento: curados, vistos recientemente). */
export function HorizontalProducts({ title, products, onOpen }: Props) {
  const add = useCart((s) => s.add);
  if (!products.length) return null;
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ProductCard horizontal product={item} onPress={() => onOpen(item)} onAdd={CART_ENABLED ? () => add(item) : undefined} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h2, marginTop: spacing.xl, marginHorizontal: spacing.lg, marginBottom: spacing.xs },
  list: { paddingHorizontal: spacing.sm },
});

import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { useFavorites } from '../store/favoritesStore';
import { useCart } from '../store/cartStore';
import { ProductCard } from '../components/ProductCard';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

export function FavoritesScreen({ navigation }: Props) {
  const items = useFavorites((s) => s.items);
  const add = useCart((s) => s.add);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="heart-outline" size={56} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Aún no tienes favoritos</Text>
        <Text style={styles.emptyText}>Toca el corazón en cualquier producto para guardarlo aquí.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(p) => String(p.id)}
      numColumns={2}
      contentContainerStyle={{ padding: spacing.sm, paddingBottom: spacing.xxl }}
      renderItem={({ item }) => (
        <ProductCard
          product={item}
          onPress={() => navigation.navigate('ProductDetail', { id: item.id, name: item.name })}
          onAdd={() => add(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.surface },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});

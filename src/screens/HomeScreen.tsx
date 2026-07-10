import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TabParamList, RootStackParamList } from '../navigation/types';
import type { Product, Taxonomy } from '../types';
import { fetchProducts } from '../api/products';
import { fetchNecesidades, fetchMarcas } from '../api/taxonomies';
import { useCart } from '../store/cartStore';
import { useRecentlyViewed } from '../store/recentlyViewedStore';
import { ProductCard } from '../components/ProductCard';
import { HorizontalProducts } from '../components/HorizontalProducts';
import { TrustStrip } from '../components/TrustStrip';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';
import { Loading, ErrorView } from '../components/Feedback';
import { colors, spacing, radius, typography } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

const extra = (Constants.expoConfig?.extra ?? {}) as { currencySymbol?: string; envioGratisDesde?: number };

export function HomeScreen({ navigation }: Props) {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [inmunidad, setInmunidad] = useState<Product[]>([]);
  const [needs, setNeeds] = useState<Taxonomy[]>([]);
  const [marcas, setMarcas] = useState<Taxonomy[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = useCart((s) => s.add);
  const recent = useRecentlyViewed((s) => s.items);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [prods, inmun, taxos, brands] = await Promise.all([
        fetchProducts({ perPage: 6, orderby: 'popularity' }),
        fetchProducts({ necesidad: 'inmunidad', perPage: 10 }),
        fetchNecesidades(),
        fetchMarcas(),
      ]);
      setFeatured(prods.products);
      setInmunidad(inmun.products);
      setNeeds(taxos);
      setMarcas(brands);
    } catch (e: any) {
      setError('No pudimos cargar la tienda. Revisa tu conexión.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openProduct = (p: Product) => navigation.navigate('ProductDetail', { id: p.id, name: p.name });
  const submitSearch = () => {
    const q = query.trim();
    if (q) {
      analytics.track(EV.SEARCH, { query: q, source: 'home' });
      navigation.navigate('Catalogo', { q });
    }
  };

  if (loading) return <Loading label="Cargando productos…" />;
  if (error) return <ErrorView message={error} onRetry={() => load()} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      {/* Buscador */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar vitaminas, marcas…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={submitSearch}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Hero con CTA */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Te llevamos a la cima</Text>
        <Text style={styles.heroSub}>Vitaminas y suplementos con envío gratis en Lima desde {extra.currencySymbol ?? 'S/'}{extra.envioGratisDesde ?? 69}</Text>
        <Pressable style={styles.heroCta} onPress={() => navigation.navigate('Catalogo')}>
          <Text style={styles.heroCtaText}>Explorar catálogo</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>
      </View>

      {/* Señales de confianza */}
      <TrustStrip />

      {/* Apoya a tu creador */}
      <Pressable style={styles.creatorBanner} onPress={() => navigation.navigate('Creators')}>
        <Ionicons name="heart-circle" size={30} color={colors.white} />
        <View style={{ flex: 1 }}>
          <Text style={styles.creatorTitle}>Apoya a tu creador favorito</Text>
          <Text style={styles.creatorSub}>Usa su código y obtén descuento 💜</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.white} />
      </Pressable>

      {/* Categorías */}
      <Text style={styles.sectionTitle}>¿Qué necesitas?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {needs.map((n) => (
          <Pressable
            key={n.id}
            style={styles.chip}
            onPress={() => {
              analytics.track(EV.VIEW_CATEGORY, { necesidad: n.slug, name: n.name });
              navigation.navigate('Catalogo', { necesidad: n.slug });
            }}
          >
            <Text style={styles.chipText}>{n.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Más vendidos */}
      <Text style={styles.sectionTitle}>Más vendidos</Text>
      <FlatList
        data={featured}
        keyExtractor={(p) => String(p.id)}
        numColumns={2}
        scrollEnabled={false}
        contentContainerStyle={{ paddingHorizontal: spacing.sm }}
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => openProduct(item)} onAdd={() => add(item)} />
        )}
      />

      {/* Curado por necesidad */}
      <HorizontalProducts title="Para tu inmunidad" products={inmunidad} onOpen={openProduct} />

      {/* Vistos recientemente */}
      {recent.length > 0 && (
        <HorizontalProducts title="Vistos recientemente" products={recent} onOpen={openProduct} />
      )}

      {/* Marcas */}
      {marcas.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Marcas</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {marcas.map((m) => (
              <Pressable
                key={m.id}
                style={styles.marcaChip}
                onPress={() => {
                  analytics.track(EV.VIEW_BRAND, { marca: m.slug, name: m.name });
                  navigation.navigate('Catalogo', { marca: m.slug });
                }}
              >
                <Text style={styles.marcaChipText}>{m.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { padding: spacing.md, backgroundColor: colors.surface },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 11, color: colors.text },
  hero: {
    backgroundColor: colors.primary,
    padding: spacing.xl,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  heroTitle: { color: colors.white, fontSize: 24, fontWeight: '800' },
  heroSub: { color: colors.white, opacity: 0.9, marginTop: 4, lineHeight: 20 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.md,
  },
  heroCtaText: { color: colors.primary, fontWeight: '800' },
  creatorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primaryDark,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
  },
  creatorTitle: { color: colors.white, fontWeight: '800', fontSize: 15 },
  creatorSub: { color: colors.white, opacity: 0.85, fontSize: 12, marginTop: 2 },
  sectionTitle: { ...typography.h2, marginTop: spacing.xl, marginHorizontal: spacing.lg },
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.primaryDark, fontWeight: '600' },
  marcaChip: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  marcaChipText: { color: colors.white, fontWeight: '700' },
});

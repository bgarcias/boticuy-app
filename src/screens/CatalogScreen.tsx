import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TabParamList, RootStackParamList } from '../navigation/types';
import type { Product, Taxonomy } from '../types';
import { fetchProducts } from '../api/products';
import { fetchNecesidades, fetchMarcas } from '../api/taxonomies';
import { useCart } from '../store/cartStore';
import { useRecentSearches } from '../store/recentSearchesStore';
import { ProductCard } from '../components/ProductCard';
import { ProductGridSkeleton } from '../components/Skeleton';
import { ErrorView, Empty } from '../components/Feedback';
import { colors, spacing, radius } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Catalogo'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function CatalogScreen({ navigation, route }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [needs, setNeeds] = useState<Taxonomy[]>([]);
  const [marcas, setMarcas] = useState<Taxonomy[]>([]);
  const [activeNeed, setActiveNeed] = useState<string | undefined>(route.params?.necesidad);
  const [activeMarca, setActiveMarca] = useState<string | undefined>(route.params?.marca);
  const [search, setSearch] = useState(route.params?.q ?? '');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const add = useCart((s) => s.add);
  const recents = useRecentSearches((s) => s.items);
  const addRecent = useRecentSearches((s) => s.add);
  const clearRecents = useRecentSearches((s) => s.clear);
  const PER_PAGE = 20;

  // Sugerencias por categoría/marca mientras se escribe.
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as { key: string; label: string; onPress: () => void }[];
    const out: { key: string; label: string; onPress: () => void }[] = [];
    needs.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 3).forEach((n) =>
      out.push({ key: 'n' + n.id, label: `Categoría: ${n.name}`, onPress: () => { setSearch(''); setActiveNeed(n.slug); } })
    );
    marcas.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 3).forEach((m) =>
      out.push({ key: 'm' + m.id, label: `Marca: ${m.name}`, onPress: () => { setSearch(''); setActiveMarca(m.slug); } })
    );
    return out;
  }, [search, needs, marcas]);

  useEffect(() => {
    fetchNecesidades().then(setNeeds).catch(() => {});
    fetchMarcas().then(setMarcas).catch(() => {});
  }, []);

  const marcaName = activeMarca
    ? marcas.find((m) => m.slug === activeMarca)?.name ?? activeMarca
    : undefined;

  // Si llegamos con un filtro o búsqueda desde Home, aplicarlo.
  useEffect(() => {
    if (route.params?.necesidad) setActiveNeed(route.params.necesidad);
    if (route.params?.marca) setActiveMarca(route.params.marca);
    if (route.params?.q !== undefined) setSearch(route.params.q);
  }, [route.params?.necesidad, route.params?.marca, route.params?.q]);

  const load = useCallback(
    async (mode: 'reset' | 'refresh' | 'more' = 'reset') => {
      try {
        if (mode === 'refresh') setRefreshing(true);
        else if (mode === 'more') setLoadingMore(true);
        else setLoading(true);
        setError(null);
        const nextPage = mode === 'more' ? pageRef.current + 1 : 1;
        const res = await fetchProducts({
          perPage: PER_PAGE,
          page: nextPage,
          search: search.trim() || undefined,
          necesidad: activeNeed,
          marca: activeMarca,
        });
        setProducts((prev) => (mode === 'more' ? [...prev, ...res.products] : res.products));
        pageRef.current = nextPage;
        setTotalPages(res.totalPages || 1);
      } catch (e) {
        if (mode !== 'more') setError('No pudimos cargar el catálogo.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, activeNeed, activeMarca]
  );

  const loadMore = () => {
    if (!loading && !loadingMore && !refreshing && pageRef.current < totalPages) {
      load('more');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder="Buscar productos…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          onSubmitEditing={() => { addRecent(search); load(); }}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Sugerencias mientras escribe */}
      {suggestions.length > 0 && (
        <View style={styles.suggestWrap}>
          {suggestions.map((s) => (
            <Pressable key={s.key} style={styles.suggestRow} onPress={s.onPress}>
              <Ionicons name="pricetags-outline" size={16} color={colors.primary} />
              <Text style={styles.suggestText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Búsquedas recientes (cuando el buscador está vacío) */}
      {search.trim() === '' && recents.length > 0 && (
        <View style={styles.recentsWrap}>
          <View style={styles.recentsHead}>
            <Text style={styles.recentsTitle}>Búsquedas recientes</Text>
            <Pressable onPress={clearRecents} hitSlop={8}>
              <Text style={styles.recentsClear}>Borrar</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {recents.map((r) => (
              <Pressable key={r} style={styles.recentChip} onPress={() => { addRecent(r); setSearch(r); }}>
                <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                <Text style={styles.recentChipText}>{r}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {marcaName && (
        <View style={styles.marcaPillWrap}>
          <View style={styles.marcaPill}>
            <Text style={styles.marcaPillText}>Marca: {marcaName}</Text>
            <Pressable onPress={() => setActiveMarca(undefined)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar filtro de marca">
              <Ionicons name="close" size={16} color={colors.white} />
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
        <Pressable
          style={[styles.filterChip, !activeNeed && styles.filterChipActive]}
          onPress={() => setActiveNeed(undefined)}
        >
          <Text style={[styles.filterText, !activeNeed && styles.filterTextActive]}>Todos</Text>
        </Pressable>
        {needs.map((n) => {
          const active = activeNeed === n.slug;
          return (
            <Pressable
              key={n.id}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setActiveNeed(active ? undefined : n.slug)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{n.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ProductGridSkeleton />
      ) : error ? (
        <ErrorView message={error} onRetry={() => load()} />
      ) : products.length === 0 ? (
        <Empty message="No encontramos productos con ese filtro." />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => String(p.id)}
          numColumns={2}
          contentContainerStyle={{ padding: spacing.sm, paddingBottom: spacing.xxl }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={[colors.primary]} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { id: item.id, name: item.name })}
              onAdd={() => add(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, paddingVertical: 10, color: colors.text },
  suggestWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  suggestText: { fontSize: 14, color: colors.text },
  recentsWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  recentsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  recentsTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  recentsClear: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  recentChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7 },
  recentChipText: { fontSize: 13, color: colors.text },
  marcaPillWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  marcaPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: colors.primaryDark, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  marcaPillText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  filters: { flexGrow: 0 },
  filtersContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  filterChip: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.primaryDark, fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: colors.white },
});

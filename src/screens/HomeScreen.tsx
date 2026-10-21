import React, { useContext, useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  RefreshControl,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
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
import { ChatPanel, CHAT_BAND_PADDING } from '../components/chat/ChatPanel';
import { CART_ENABLED } from '../config/features';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';
import { colors, spacing, radius, typography } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Carga independiente de una sección del Home. Cada sección tiene su propio
 * estado de carga y de error: si el catálogo falla, el chat (que no depende de
 * esto) sigue usable y cada sección muestra su propio "Reintentar".
 */
function useSection<T>(loader: () => Promise<T>, initial: T) {
  const [state, setState] = useState<{ data: T; loading: boolean; error: boolean }>({
    data: initial,
    loading: true,
    error: false,
  });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const alive = useRef(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const data = await loaderRef.current();
      if (alive.current && id === seq.current) setState({ data, loading: false, error: false });
    } catch {
      if (alive.current && id === seq.current) setState((s) => ({ ...s, loading: false, error: true }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  return { ...state, reload };
}

const loadFeatured = () => fetchProducts({ perPage: 6, orderby: 'popularity' }).then((r) => r.products);
const loadInmunidad = () => fetchProducts({ necesidad: 'inmunidad', perPage: 10 }).then((r) => r.products);

/** Título + estado de carga/error de una sección. Con datos, muestra el contenido. */
function Section({
  title,
  loading,
  error,
  hasData,
  onRetry,
  children,
}: {
  title: string;
  loading: boolean;
  error: boolean;
  hasData: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hasData ? (
        children
      ) : loading ? (
        <Text style={styles.sectionMuted}>Cargando…</Text>
      ) : error ? (
        <View style={styles.sectionError}>
          <Text style={styles.sectionErrorText}>No pudimos cargar esta sección.</Text>
          <Pressable style={styles.retry} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function HomeScreen({ navigation }: Props) {
  const featured = useSection<Product[]>(loadFeatured, []);
  const inmunidad = useSection<Product[]>(loadInmunidad, []);
  const needs = useSection<Taxonomy[]>(fetchNecesidades, []);
  const marcas = useSection<Taxonomy[]>(fetchMarcas, []);
  const [refreshing, setRefreshing] = useState(false);
  const add = useCart((s) => s.add);
  const recent = useRecentlyViewed((s) => s.items);

  // Chat: bloque de alto fijo dentro del scroll del Home. Con el teclado abierto el alto es
  //   borde superior del teclado − posición superior REAL de la tarjeta − margen inferior del bloque
  // (sin pasar del alto normal). La posición de la tarjeta se mide con measureInWindow tras
  // desplazar el Home, y el borde del teclado se deduce de su altura (ver `keyboardTop`).
  const [chatHeight] = useState(() => Math.max(480, Math.round(Dimensions.get('window').height * 0.62)));
  const [kb, setKb] = useState<{ height: number; screenY: number } | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const [kbOffset, setKbOffset] = useState(0);
  const rootRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const chatWrapRef = useRef<View>(null);
  const chatY = useRef(0);

  // Alto de la ventana y inset inferior de las barras del sistema con el teclado CERRADO: son la base
  // para ubicar el teclado aunque Android reduzca o no la ventana al abrirlo. Sin SafeAreaProvider (tests) se usa Dimensions.
  const frame = useContext(SafeAreaFrameContext);
  const insets = useContext(SafeAreaInsetsContext);
  const windowH = useRef(0);
  const barBottom = useRef(0);
  if (!kb) {
    windowH.current = Math.max(windowH.current, frame?.height ?? Dimensions.get('window').height);
    barBottom.current = insets?.bottom ?? 0;
  }

  /**
   * Borde superior del teclado en coordenadas de ventana. `endCoordinates.screenY` de React Native en Android
   * es el borde inferior del área visible (ReactRootView.java): solo coincide con el teclado si la ventana se
   * reduce; con edge-to-edge (Android 15) la ventana no se reduce y screenY queda abajo de todo. Por eso se
   * calcula con la altura del teclado (que RN da sin la barra de navegación) y se toma el menor de los dos.
   */
  const keyboardTop = kb
    ? Math.min(kb.screenY > 0 ? kb.screenY : Infinity, windowH.current - kb.height - barBottom.current)
    : 0;

  // La posición de la tarjeta debe estar en el MISMO sistema que `keyboardTop` (coordenadas de la vista raíz de React).
  // `measureInWindow` NO lo está: en RN 0.81 (Fabric) suma el desplazamiento del viewport, que es
  // (posición de la raíz en pantalla − borde superior del área visible) = −altura de la barra de estado con edge-to-edge,
  // así que da la posición real menos la barra de estado. `measure` (pageY) no suma ese desplazamiento.
  const measureChat = useCallback(() => {
    chatWrapRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
      chatWrapRef.current?.measureInWindow((_wx, winY) => {
        const top = Number.isFinite(pageY) ? pageY : winY; // respaldo si pageY no viniera
        setCardTop(top + CHAT_BAND_PADDING);
      });
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKb({ height: e.endCoordinates.height, screenY: e.endCoordinates.screenY });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKb(null);
      setCardTop(null);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Con el teclado abierto: el encabezado del chat sube al borde superior visible y se mide dónde quedó la tarjeta.
  // Se vuelve a medir tras asentarse el layout (el alto de la tarjeta cambia el contenido del scroll).
  useEffect(() => {
    if (!kb) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, chatY.current), animated: false });
    const t1 = setTimeout(measureChat, 60);
    const t2 = setTimeout(measureChat, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [kb, measureChat]);

  const effectiveChatHeight =
    kb && cardTop !== null
      ? Math.min(chatHeight, Math.max(0, Math.round(keyboardTop - cardTop - CHAT_BAND_PADDING)))
      : chatHeight;

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.allSettled([featured.reload(), inmunidad.reload(), needs.reload(), marcas.reload()]);
    setRefreshing(false);
  };

  const openProduct = (p: Product) => navigation.navigate('ProductDetail', { id: p.id, name: p.name });

  return (
    <View
      ref={rootRef}
      style={styles.root}
      onLayout={() => rootRef.current?.measureInWindow((_x, y) => setKbOffset(y))}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={kbOffset}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={kb ? measureChat : undefined}
          onScrollEndDrag={kb ? measureChat : undefined}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshAll} colors={[colors.primary]} tintColor={colors.primary} />
          }
        >
          {/* Chat con IA: primera vista del Home, independiente de la carga del catálogo. El buscador vive en el Catálogo. */}
          <View ref={chatWrapRef} collapsable={false} onLayout={(e) => (chatY.current = e.nativeEvent.layout.y)}>
            <ChatPanel height={effectiveChatHeight} />
          </View>

          {/* Señales de confianza (solo las que siguen siendo ciertas sin pago ni envío) */}
          <TrustStrip />

          {/* Categorías */}
          <Section title="¿Qué necesitas?" loading={needs.loading} error={needs.error} hasData={needs.data.length > 0} onRetry={needs.reload}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {needs.data.map((n) => (
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
          </Section>

          {/* Más vendidos */}
          <Section title="Más vendidos" loading={featured.loading} error={featured.error} hasData={featured.data.length > 0} onRetry={featured.reload}>
            <FlatList
              data={featured.data}
              keyExtractor={(p) => String(p.id)}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={{ paddingHorizontal: spacing.sm }}
              renderItem={({ item }) => (
                <ProductCard product={item} onPress={() => openProduct(item)} onAdd={CART_ENABLED ? () => add(item) : undefined} />
              )}
            />
          </Section>

          {/* Curado por necesidad */}
          {inmunidad.data.length > 0 ? (
            <HorizontalProducts title="Para tu inmunidad" products={inmunidad.data} onOpen={openProduct} />
          ) : (
            <Section title="Para tu inmunidad" loading={inmunidad.loading} error={inmunidad.error} hasData={false} onRetry={inmunidad.reload}>
              {null}
            </Section>
          )}

          {/* Vistos recientemente */}
          {recent.length > 0 && <HorizontalProducts title="Vistos recientemente" products={recent} onOpen={openProduct} />}

          {/* Marcas */}
          <Section title="Marcas" loading={marcas.loading} error={marcas.error} hasData={marcas.data.length > 0} onRetry={marcas.reload}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {marcas.data.map((m) => (
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
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.surface },
  sectionTitle: { ...typography.h2, marginTop: spacing.xl, marginHorizontal: spacing.lg },
  sectionMuted: { marginHorizontal: spacing.lg, marginTop: spacing.sm, color: colors.textMuted, fontSize: 14 },
  sectionError: { marginHorizontal: spacing.lg, marginTop: spacing.sm, gap: spacing.sm, alignItems: 'flex-start' },
  sectionErrorText: { color: colors.error, fontSize: 14 },
  retry: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  retryText: { color: colors.white, fontWeight: '700' },
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

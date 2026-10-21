import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import type { Product, ProductExtra, ProductReview } from '../types';
import { fetchProduct, fetchProductExtra, fetchProducts, fetchReviews } from '../api/products';
import { HorizontalProducts } from '../components/HorizontalProducts';
import { Stars } from '../components/Stars';
import { useCart } from '../store/cartStore';
import { useFavorites } from '../store/favoritesStore';
import { useRecentlyViewed } from '../store/recentlyViewedStore';
import { useToast } from '../store/toastStore';
import { analytics } from '../analytics';
import { EV } from '../analytics/events';
import { Price } from '../components/Price';
import { RichHtml } from '../components/RichHtml';
import { ImageGallery } from '../components/ImageGallery';
import { ErrorView } from '../components/Feedback';
import { ProductDetailSkeleton } from '../components/Skeleton';
import { ExternalPurchaseNotice } from '../components/ExternalPurchaseNotice';
import { getProductoNoVendible } from '../constants/productosNoVendibles';
import { stripHtml, priceToSoles } from '../utils/format';
import { buildStoreUrl } from '../utils/safeUrl';
import { WEB_CART_MAX_QTY } from '../utils/webCart';
import { STORE_URL_POLICY } from '../constants/storePolicy';
import { PURCHASE_ENABLED, CART_ENABLED } from '../config/features';
import { colors, spacing, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

const appExtra = (Constants.expoConfig?.extra ?? {}) as { currencySymbol?: string; envioGratisDesde?: number };

/** Cantidad máxima seleccionable: la menor entre el stock bajo reportado y el tope. */
function selectableMax(p: Product, max: number): number {
  return typeof p.low_stock_remaining === 'number' && p.low_stock_remaining > 0 ? Math.min(p.low_stock_remaining, max) : max;
}

function Section({ title, html }: { title: string; html: string }) {
  if (!html || !stripHtml(html).trim()) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <RichHtml html={html} />
    </View>
  );
}

export function ProductDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<Product | null>(null);
  const [extra, setExtra] = useState<ProductExtra | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const add = useCart((s) => s.add);
  const isFav = useFavorites((s) => s.isFav(id));
  const toggleFav = useFavorites((s) => s.toggle);
  const recordRecent = useRecentlyViewed((s) => s.record);
  const showToast = useToast((s) => s.show);

  const onShare = () => {
    if (!product) return;
    Share.share({
      message: `Mira ${product.name} en Boticuy 🐹 ${product.permalink}`,
    }).catch(() => {});
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        product ? (
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <Pressable onPress={onShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="Compartir producto">
              <Ionicons name="share-social-outline" size={23} color={colors.white} />
            </Pressable>
            <Pressable
              onPress={() => toggleFav(product)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            >
              <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={24} color={colors.white} />
            </Pressable>
          </View>
        ) : undefined,
    });
  }, [navigation, product, isFav, toggleFav]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [p, x, rel, rev] = await Promise.all([
        fetchProduct(id),
        fetchProductExtra(id),
        fetchProducts({ perPage: 10, orderby: 'popularity' }),
        fetchReviews(id),
      ]);
      setProduct(p);
      setExtra(x);
      setRelated(rel.products.filter((r) => r.id !== id));
      setReviews(rev);
      recordRecent(p);
      analytics.track(EV.VIEW_PRODUCT, { id: p.id, name: p.name, price: priceToSoles(p.prices) });
    } catch (e) {
      setError('No pudimos cargar el producto.');
    } finally {
      setLoading(false);
    }
  }, [id, recordRecent]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ProductDetailSkeleton />;
  if (error || !product) return <ErrorView message={error ?? undefined} onRetry={load} />;

  // Sin compra el carrito termina en la web: tope de unidades por producto igual al del plugin (class-web-cart.php).
  const maxQty = PURCHASE_ENABLED ? Number.POSITIVE_INFINITY : WEB_CART_MAX_QTY;
  const qtyCap = selectableMax(product, maxQty);

  const onViewOnWeb = () => {
    // "Ver en la web": solo se abre el permalink si pertenece a la tienda (https, dominio exacto; en builds
    // que no son de producción también el host de staging por http); ver utils/safeUrl.ts.
    const url = buildStoreUrl(product.permalink, STORE_URL_POLICY);
    if (!url) {
      showToast('No pudimos abrir la página del producto.');
      return;
    }
    Linking.openURL(url).catch(() => showToast('No pudimos abrir la página del producto.'));
  };

  const lowStock = typeof product.low_stock_remaining === 'number' && product.low_stock_remaining > 0;
  const noVendible = getProductoNoVendible(product.sku);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 170 }}>
        <ImageGallery images={product.images} />
        <View style={styles.body}>
          {product.brands?.[0] && <Text style={styles.brand}>{product.brands[0].name}</Text>}
          <Text style={styles.name}>{product.name}</Text>
          {product.review_count > 0 && (
            <View style={styles.ratingRow}>
              <Stars rating={parseFloat(product.average_rating)} />
              <Text style={styles.ratingText}>
                {parseFloat(product.average_rating).toFixed(1)} · {product.review_count}{' '}
                {product.review_count === 1 ? 'reseña' : 'reseñas'}
              </Text>
            </View>
          )}
          <Price prices={product.prices} size={24} />
          {extra?.contenido_neto ? <Text style={styles.contenido}>{extra.contenido_neto}</Text> : null}
          {!product.is_in_stock ? (
            <Text style={styles.outStock}>Sin stock</Text>
          ) : lowStock ? (
            <Text style={styles.lowStock}>¡Solo quedan {product.low_stock_remaining}! 🔥</Text>
          ) : null}

          {!!product.short_description && (
            <Text style={styles.short}>{stripHtml(product.short_description)}</Text>
          )}

          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
              <Text style={styles.trustText}>Producto original</Text>
            </View>
            {/* Con compra: "Pago seguro" y "Envío gratis" originales. Sin compra no van: el app no cobra ni envía; la compra se cierra en la web. */}
            {PURCHASE_ENABLED ? (
              <>
                <View style={styles.trustItem}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                  <Text style={styles.trustText}>Pago seguro</Text>
                </View>
                <View style={styles.trustItem}>
                  <Ionicons name="bicycle-outline" size={18} color={colors.primary} />
                  {/* Sin "Lima" (ver M9 en boticuy-hallazgos-completo.md): el envío
                      gratis por umbral solo existe hoy en una zona real, no en
                      toda Lima ni en provincias. */}
                  <Text style={styles.trustText}>Envío gratis ≥ {appExtra.currencySymbol ?? 'S/'}{appExtra.envioGratisDesde ?? 69} en zonas seleccionadas</Text>
                </View>
              </>
            ) : null}
          </View>

          <Section title="Beneficios" html={extra?.beneficios ?? ''} />
          <Section title="Composición" html={extra?.descripcion ?? ''} />
          <Section title="Advertencias y precauciones" html={extra?.advertencias ?? ''} />
          <Section title="Referencias" html={extra?.referencias ?? ''} />

          {/* Si el BFF no respondió, mostramos al menos la descripción base. */}
          {!extra && !!product.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Descripción</Text>
              <Text style={styles.short}>{stripHtml(product.description)}</Text>
            </View>
          )}

          {reviews.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reseñas de clientes</Text>
              {reviews.map((rv) => (
                <View key={rv.id} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Stars rating={rv.rating} size={13} />
                    {rv.verified && (
                      <View style={styles.verified}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                        <Text style={styles.verifiedText}>Compra verificada</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.reviewMeta}>
                    {rv.reviewer}{rv.formatted_date_created ? ` · ${rv.formatted_date_created}` : ''}
                  </Text>
                  {!!stripHtml(rv.review).trim() && (
                    <Text style={styles.reviewBody}>{stripHtml(rv.review)}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        <HorizontalProducts
          title="También te puede interesar"
          products={related}
          onOpen={(p) => navigation.push('ProductDetail', { id: p.id, name: p.name })}
        />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {noVendible ? (
          <ExternalPurchaseNotice url={noVendible.url} />
        ) : !CART_ENABLED ? (
          // Sin carrito (EXPO_PUBLIC_CART_ENABLED=false): solo se ve la página del producto en la web.
          <Pressable
            style={[styles.cta, !product.is_in_stock && styles.ctaOff]}
            disabled={!product.is_in_stock}
            onPress={onViewOnWeb}
            accessibilityRole="button"
            accessibilityLabel={product.is_in_stock ? 'Ver en la web' : 'Sin stock'}
          >
            <Text style={styles.ctaText}>{product.is_in_stock ? 'Ver en la web' : 'Sin stock'}</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.actionRow}>
              <View style={styles.qty}>
                <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Disminuir cantidad">
                  <Text style={styles.qtyBtnText}>-</Text>
                </Pressable>
                <Text style={styles.qtyNum} accessibilityLabel={`Cantidad ${qty}`}>{qty}</Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQty((q) => Math.min(qtyCap, q + 1))}
                  disabled={qty >= qtyCap}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Aumentar cantidad"
                >
                  <Text style={[styles.qtyBtnText, qty >= qtyCap && styles.qtyBtnOff]}>+</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.cta, !product.is_in_stock && styles.ctaOff]}
                disabled={!product.is_in_stock}
                onPress={() => {
                  add(product, qty);
                  showToast(qty > 1 ? `${qty} agregados al carrito` : 'Agregado al carrito');
                  analytics.track(EV.ADD_TO_CART, { id: product.id, name: product.name, price: priceToSoles(product.prices), qty, source: 'detail' });
                  navigation.goBack();
                }}
              >
                <Text style={styles.ctaText}>{PURCHASE_ENABLED || product.is_in_stock ? 'Agregar al carrito' : 'Sin stock'}</Text>
              </Pressable>
            </View>
            {!PURCHASE_ENABLED ? (
              <Pressable onPress={onViewOnWeb} hitSlop={8} accessibilityRole="link" accessibilityLabel="Ver en la web" style={styles.webLink}>
                <Text style={styles.webLinkText}>Ver en la web</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  imageWrap: { backgroundColor: colors.surface, alignItems: 'center', padding: spacing.lg },
  image: { width: '100%', height: 280 },
  body: { padding: spacing.lg, gap: spacing.sm },
  brand: { color: colors.primary, fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  contenido: { fontSize: 13, color: colors.textMuted },
  outStock: { color: colors.error, fontWeight: '700' },
  lowStock: { color: colors.warning, fontWeight: '700' },
  short: { fontSize: 15, color: colors.text, marginTop: spacing.xs, lineHeight: 22 },
  trustRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, gap: spacing.sm },
  trustItem: { flex: 1, alignItems: 'center', gap: 4 },
  trustText: { fontSize: 10, color: colors.textMuted, textAlign: 'center', fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  ratingText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.primaryDark },
  review: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs, gap: 3 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  verifiedText: { fontSize: 11, color: colors.success, fontWeight: '600' },
  reviewMeta: { fontSize: 12, color: colors.textMuted },
  reviewBody: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  webLink: { alignSelf: 'center', paddingVertical: 2 },
  webLinkText: { fontSize: 14, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
  qtyBtnOff: { color: colors.border },
  qty: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  qtyBtn: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 22, fontWeight: '700', color: colors.primary },
  qtyNum: { fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  cta: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { backgroundColor: colors.textMuted },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});

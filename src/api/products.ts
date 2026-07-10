import { storeClient, bffClient } from './client';
import type { Product, ProductExtra, ProductReview } from '../types';
import { decodeHtmlEntities } from '../utils/format';

/** El nombre y la marca vienen tal cual de WordPress, con entidades HTML sin decodificar (ej. "L &#8211; Mesitran"). */
function decodeProduct(p: Product): Product {
  return {
    ...p,
    name: decodeHtmlEntities(p.name),
    brands: p.brands?.map((b) => ({ ...b, name: decodeHtmlEntities(b.name) })),
  };
}

interface ListParams {
  page?: number;
  perPage?: number;
  search?: string;
  orderby?: 'date' | 'price' | 'popularity' | 'title';
  order?: 'asc' | 'desc';
  /** Filtrado por término de taxonomía 'necesidades' (slug). */
  necesidad?: string;
  /** Filtrado por término de taxonomía 'marcas' (slug). */
  marca?: string;
  featured?: boolean;
}

export interface ProductList {
  products: Product[];
  total: number;
  totalPages: number;
}

/**
 * Lista productos del catálogo.
 *
 * - Sin filtro de taxonomía → Store API pública (verificado, funciona hoy).
 * - Con filtro por 'necesidades'/'marcas' → la Store API NO soporta esas
 *   taxonomías custom (las ignora y devuelve todo), así que se enruta al BFF,
 *   que sí puede resolver término → IDs de producto. Mientras el BFF no esté
 *   desplegado, el filtro lanza un error manejado (la pantalla muestra reintento).
 */
export async function fetchProducts(params: ListParams = {}): Promise<ProductList> {
  const useTaxonomyFilter = !!(params.necesidad || params.marca);

  if (useTaxonomyFilter) {
    // Paso 1: el BFF resuelve término (necesidad/marca) → IDs de producto.
    const idsRes = await bffClient.get<{ ids: number[]; total: number; total_pages: number }>(
      '/products',
      {
        params: {
          per_page: params.perPage ?? 30,
          page: params.page ?? 1,
          necesidad: params.necesidad,
          marca: params.marca,
          search: params.search || undefined,
        },
      }
    );
    const ids = idsRes.data.ids ?? [];
    if (ids.length === 0) {
      return { products: [], total: 0, totalPages: 1 };
    }
    // Paso 2: traemos esos productos de la Store API (formato ya verificado).
    const res = await storeClient.get<Product[]>('/products', {
      params: { include: ids.join(','), per_page: ids.length },
    });
    return {
      products: res.data.map(decodeProduct),
      total: idsRes.data.total ?? res.data.length,
      totalPages: idsRes.data.total_pages ?? 1,
    };
  }

  const query: Record<string, string | number | boolean> = {
    per_page: params.perPage ?? 20,
    page: params.page ?? 1,
    orderby: params.orderby ?? 'popularity',
    order: params.order ?? 'desc',
  };
  if (params.search) query.search = params.search;
  if (params.featured) query.featured = true;

  const res = await storeClient.get<Product[]>('/products', { params: query });
  return {
    products: res.data.map(decodeProduct),
    total: parseInt(res.headers['x-wp-total'] ?? '0', 10),
    totalPages: parseInt(res.headers['x-wp-totalpages'] ?? '1', 10),
  };
}

/** Trae un producto por id (datos base de la Store API). */
export async function fetchProduct(id: number): Promise<Product> {
  const res = await storeClient.get<Product>(`/products/${id}`);
  return decodeProduct(res.data);
}

/**
 * Reseñas del producto desde la Store API pública (sin llaves).
 * Devuelve [] si falla, para no romper la ficha.
 */
export async function fetchReviews(productId: number, perPage = 10): Promise<ProductReview[]> {
  try {
    const res = await storeClient.get<ProductReview[]>('/products/reviews', {
      params: { product_id: productId, per_page: perPage, orderby: 'rating', order: 'desc' },
    });
    return (res.data ?? []).map((r) => ({ ...r, reviewer: decodeHtmlEntities(r.reviewer) }));
  } catch {
    return [];
  }
}

/**
 * Trae los datos enriquecidos del producto (beneficios, composición,
 * advertencias, etc.) desde el BFF. Devuelve null si falla, para que la
 * pantalla muestre igual los datos base sin romperse.
 */
export async function fetchProductExtra(id: number): Promise<ProductExtra | null> {
  try {
    const res = await bffClient.get<ProductExtra>('/product', { params: { id } });
    return { ...res.data, contenido_neto: decodeHtmlEntities(res.data.contenido_neto) };
  } catch {
    return null;
  }
}

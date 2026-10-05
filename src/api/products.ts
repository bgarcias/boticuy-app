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

const STORE_MAX_PER_PAGE = 100;

/** Pide los productos por `include=` en lotes de hasta 100 IDs; si falla un lote, falla todo. */
async function fetchProductsInBatches(ids: number[]): Promise<Product[]> {
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += STORE_MAX_PER_PAGE) {
    batches.push(ids.slice(i, i + STORE_MAX_PER_PAGE));
  }
  const pages = await Promise.all(
    batches.map((batch) =>
      storeClient.get<Product[]>('/products', {
        params: { include: batch.join(','), per_page: batch.length },
      }),
    ),
  );
  return pages.flatMap((r) => r.data);
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
 *
 * Paginación 100% del lado del cliente para el camino con filtro (ver M3/M4 en
 * boticuy-hallazgos-completo.md) — verificado en vivo contra la Store API real:
 * cuando se manda `include=`, IGNORA por completo `orderby`/`order` (probado
 * con `orderby=include`, `orderby=title` asc/desc — siempre devuelve su propio
 * orden interno fijo, nunca el pedido). Por eso no se puede confiar en que la
 * Store API ordene ni pagine un `include=` de forma consistente con la
 * popularidad que ya calculó el BFF — el corte de páginas tiene que hacerlo
 * la app, sobre el conjunto YA ordenado y YA filtrado por visibilidad real,
 * nunca antes.
 */
export async function fetchProducts(params: ListParams = {}): Promise<ProductList> {
  const useTaxonomyFilter = !!(params.necesidad || params.marca);

  if (useTaxonomyFilter) {
    const perPage = params.perPage ?? 30;
    const page = params.page ?? 1;

    // Paso 1: el BFF resuelve término (necesidad/marca/búsqueda) → TODOS los IDs
    // que matchean (ya en orden de popularidad, hasta MAX_FILTERED_IDS en el
    // plugin) — ya no viene paginado, ver M4.
    const idsRes = await bffClient.get<{ ids: number[] }>('/products', {
      params: {
        necesidad: params.necesidad,
        marca: params.marca,
        search: params.search || undefined,
      },
    });
    const ids = idsRes.data.ids ?? [];
    if (ids.length === 0) {
      return { products: [], total: 0, totalPages: 1 };
    }

    // Paso 2: se le pide a la Store API el conjunto COMPLETO (no solo la página
    // pedida) — es la única forma de saber cuáles de esos IDs son realmente
    // visibles hoy (stock, catálogo vs. búsqueda, etc.), que es lo que define
    // el total real (ver M4). Se pide en lotes de 100 IDs, unidos antes de
    // reordenar.
    const found = await fetchProductsInBatches(ids);

    // Paso 3: reordenar por la posición de cada producto en `ids` (el orden de
    // popularidad que ya trajo el BFF) — la Store API no lo preserva sola.
    const order = new Map(ids.map((id, i) => [id, i]));
    const ordered = [...found].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    // Paso 4: recién acá se pagina, sobre el conjunto ya ordenado y ya
    // filtrado por visibilidad real — total/totalPages salen de este mismo
    // conjunto, no de un conteo aparte que podría no coincidir (ver M4).
    const total = ordered.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    const products = ordered.slice(start, start + perPage).map(decodeProduct);

    return { products, total, totalPages };
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
 * Trae varios productos en una sola petición (`include=`, mismo patrón que ya
 * usa `fetchProducts()` para el filtro por taxonomía) — usado por
 * `revalidateCart()` para revalidar el carrito completo sin encadenar N
 * peticiones, una por ítem (ver A1/B13 en boticuy-hallazgos-completo.md). Un
 * id que no venga en la respuesta significa que ese producto ya no existe o
 * no está disponible — la Store API simplemente lo omite, no hay que
 * interpretar ningún código de error por producto.
 */
export async function fetchProductsByIds(ids: number[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const found = await fetchProductsInBatches(ids);
  return found.map(decodeProduct);
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

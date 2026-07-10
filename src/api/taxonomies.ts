import { wpClient } from './client';
import type { Taxonomy } from '../types';
import { decodeHtmlEntities } from '../utils/format';

/**
 * Trae los términos de una taxonomía (necesidades o marcas) para los filtros.
 * En Boticuy las "categorías" que ve el usuario = taxonomía 'necesidades'.
 */
async function fetchTerms(rest_base: 'necesidades' | 'marcas'): Promise<Taxonomy[]> {
  const res = await wpClient.get<any[]>(`/${rest_base}`, {
    params: { per_page: 100, orderby: 'count', order: 'desc', hide_empty: true },
  });
  return res.data
    .filter((t) => (t.count ?? 0) > 0)
    .map((t) => ({ id: t.id, name: decodeHtmlEntities(t.name), slug: t.slug, count: t.count }));
}

export const fetchNecesidades = () => fetchTerms('necesidades');
export const fetchMarcas = () => fetchTerms('marcas');

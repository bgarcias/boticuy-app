import { bffClient } from './client';
import type { ShippingQuote } from '../types';

/** Calcula el envío real según el distrito (idUbigeo) y el subtotal; `subtotalNeto` es el subtotal ya descontado por cupón o puntos. */
export async function fetchShipping(idUbigeo: string, subtotal: number, subtotalNeto?: number): Promise<ShippingQuote> {
  const res = await bffClient.get<ShippingQuote>('/shipping', {
    params: { idubigeo: idUbigeo, subtotal, subtotal_neto: subtotalNeto },
  });
  return res.data;
}

/** Umbral reducido Plata/Oro, fuente única compartida con el plugin (ver M5 en
 *  boticuy-hallazgos-completo.md) — consumido por useShippingConfig, no directo. */
export async function fetchShippingConfig(): Promise<{ envio_gratis_nivel: number }> {
  const res = await bffClient.get<{ envio_gratis_nivel: number }>('/shipping/config');
  return res.data;
}

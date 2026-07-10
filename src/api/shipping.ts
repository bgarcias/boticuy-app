import { bffClient } from './client';
import type { ShippingQuote } from '../types';

/** Calcula el envío real según el distrito (idUbigeo) y el subtotal. */
export async function fetchShipping(idUbigeo: string, subtotal: number): Promise<ShippingQuote> {
  const res = await bffClient.get<ShippingQuote>('/shipping', {
    params: { idubigeo: idUbigeo, subtotal },
  });
  return res.data;
}

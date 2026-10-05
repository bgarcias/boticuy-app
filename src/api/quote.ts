import { bffClient } from './client';

/** Mismo shape que `items` en `POST /order`. */
export interface QuoteItem {
  id: number;
  qty: number;
}

/** Cotización del servidor: montos en soles con IGV, calculados con el mismo código que el cobro. */
export interface QuoteOk {
  ok: true;
  coupon_discount: number;
  points_discount: number;
  points_redeemed: number;
  points_redeemed_adjusted: boolean;
  shipping_total: number;
  subtotal: number;
  total: number;
}

export interface QuoteRejected {
  ok: false;
  reason: string;
}

export type QuoteResult = QuoteOk | QuoteRejected;

/** Tiempo máximo de espera de la cotización, más corto que el general de `bffClient`. */
const QUOTE_TIMEOUT_MS = 4000;

/**
 * Pide la cotización del pedido (`POST /quote`). Un rechazo del servidor (422,
 * 401, 429) llega como `{ ok: false, reason }`; un fallo de red, un 5xx o pasar
 * el tiempo de espera lanza.
 */
export async function fetchQuote(
  items: QuoteItem[],
  coupon: string | undefined,
  pointsRedeem: number,
  idUbigeo: string,
): Promise<QuoteResult> {
  const res = await bffClient.post<QuoteResult | undefined>(
    '/quote',
    {
      items,
      idUbigeo,
      coupon: coupon || undefined,
      points_redeem: pointsRedeem > 0 ? pointsRedeem : undefined,
    },
    { timeout: QUOTE_TIMEOUT_MS },
  );
  const data = res.data;
  if (data && data.ok === true) return data;
  return { ok: false, reason: (data && 'reason' in data && data.reason) || 'No se pudo cotizar el pedido' };
}

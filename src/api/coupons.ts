import { bffClient } from './client';
import type { Coupon, AppliedCoupon, Creator } from '../types';
import { decodeHtmlEntities } from '../utils/format';

/** Lista de cupones de creador activos (en vivo desde WooCommerce). */
export async function fetchCoupons(): Promise<Coupon[]> {
  const res = await bffClient.get<Coupon[]>('/coupons');
  return res.data.map((c) => ({ ...c, descripcion: c.descripcion ? decodeHtmlEntities(c.descripcion) : c.descripcion }));
}

interface CuponesResponse {
  ok: boolean;
  cupones: Creator[];
}

/** "Apoya a tu creador": solo cupones marcados como Copa Boticuy. */
export async function fetchApoyaCreador(): Promise<Creator[]> {
  const res = await bffClient.get<CuponesResponse>('/apoya-creador');
  return res.data.cupones ?? [];
}

/** "Mis cupones" (disponibles): cupones normales, sin marca de Copa ni de Oro. */
export async function fetchMisCupones(): Promise<Creator[]> {
  const res = await bffClient.get<CuponesResponse>('/mis-cupones');
  return res.data.cupones ?? [];
}

/** "Mis cupones" (exclusivos Oro): con gate de acceso resuelto en el servidor. */
export async function fetchCuponesOro(): Promise<Creator[]> {
  const res = await bffClient.get<CuponesResponse>('/cupones-oro');
  return res.data.cupones ?? [];
}

interface ValidateResult {
  valid: boolean;
  reason?: string;
  coupon?: AppliedCoupon;
}

/** Mismo shape que `items` en `POST /order` (`src/api/orders.ts`). */
export interface CouponCartItem {
  id: number;
  qty: number;
}

/**
 * Valida un cupón por código. `items` (opcional, ítems del carrito) hace que
 * el servidor también valide restricción de producto/categoría y exclusión de
 * artículos en oferta (antes solo se descubría al confirmar el pedido, ver A2
 * en boticuy-hallazgos-completo.md) — sin `items`, el servidor solo revisa
 * existencia/vencimiento/Oro/límite de usos.
 */
export async function validateCoupon(code: string, items?: CouponCartItem[]): Promise<ValidateResult> {
  const params: Record<string, string> = { code: code.trim() };
  if (items && items.length > 0) {
    params.items = JSON.stringify(items);
  }
  const res = await bffClient.get<any>('/coupon', { params });
  if (!res.data?.valid) {
    return { valid: false, reason: res.data?.reason ?? 'Cupón no válido' };
  }
  return {
    valid: true,
    coupon: {
      code: res.data.code,
      discount_type: res.data.discount_type,
      amount: res.data.amount,
      minimum_amount: res.data.minimum_amount ?? 0,
    },
  };
}

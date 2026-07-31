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

/** Valida un cupón por código. */
export async function validateCoupon(code: string): Promise<ValidateResult> {
  const res = await bffClient.get<any>('/coupon', { params: { code: code.trim() } });
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

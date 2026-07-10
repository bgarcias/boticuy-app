import { bffClient } from './client';
import type { Coupon, AppliedCoupon, CreatorsResponse } from '../types';
import { decodeHtmlEntities } from '../utils/format';

/** Lista de cupones de creador activos (en vivo desde WooCommerce). */
export async function fetchCoupons(): Promise<Coupon[]> {
  const res = await bffClient.get<Coupon[]>('/coupons');
  return res.data.map((c) => ({ ...c, descripcion: c.descripcion ? decodeHtmlEntities(c.descripcion) : c.descripcion }));
}

/** Creadores agrupados: Copa Boticuy + aliados fijos. */
export async function fetchCreators(): Promise<CreatorsResponse> {
  const res = await bffClient.get<CreatorsResponse>('/creators');
  return res.data;
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

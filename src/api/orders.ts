import Constants from 'expo-constants';
import { bffClient } from './client';
import type { Order } from '../types';
import { decodeHtmlEntities } from '../utils/format';

export interface CreateOrderPayload {
  items: { id: number; qty: number }[];
  customer: { nombre: string; email: string; telefono: string; tipoDoc: string; numDoc: string };
  shipping: {
    departamento_cod: string;
    provincia_cod: string;
    provincia_nombre: string;
    distrito_cod: string;
    distrito_nombre: string;
    idUbigeo: string;
    direccion: string;
    numero: string;
    interior: string;
    referencia: string;
  };
  payment: 'cod' | 'yape' | 'tarjeta';
  coupon?: string;
  /** Evita crear un pedido duplicado ante un doble tap o un retry de red (ver bcy_find_order_by_idempotency_key en el plugin). */
  idempotency_key?: string;
}

export interface CreateOrderResult {
  ok: boolean;
  reason?: string;
  order_id?: number;
  number?: string;
  total?: number;
  /** Requerido para /payment/formtoken y /payment/validate en pedidos de invitado (ver payment.ts). */
  checkout_token?: string;
}

const ORDERS_ENABLED = Constants.expoConfig?.extra?.ordersEnabled === true;

/**
 * Crea el pedido real en WooCommerce. Mientras `ordersEnabled` (EXPO_PUBLIC_ORDERS_ENABLED)
 * esté en false, NO llama a POST /order de verdad: devuelve un resultado simulado, para
 * poder probar el flujo completo de checkout sin crear pedidos reales en producción.
 * El total se deja sin definir a propósito — quien llama (CheckoutScreen) ya calculó el
 * total real con los datos locales del carrito y lo usa como fallback (`res.total ?? finalTotal`).
 */
export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  if (!ORDERS_ENABLED) {
    return {
      ok: true,
      number: `PREVIEW-${Date.now().toString().slice(-6)}`,
    };
  }
  const res = await bffClient.post<CreateOrderResult>('/order', payload);
  return res.data;
}

/** Pedidos del usuario autenticado (token vía interceptor). */
export async function fetchMyOrders(): Promise<Order[]> {
  const res = await bffClient.get<{ ok: boolean; orders: Order[] }>('/orders');
  const orders = res.data?.orders ?? [];
  return orders.map((o) => ({
    ...o,
    items: o.items.map((it) => ({ ...it, name: decodeHtmlEntities(it.name) })),
  }));
}

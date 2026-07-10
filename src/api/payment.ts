import { bffClient } from './client';

export interface FormTokenResult {
  ok: boolean;
  reason?: string;
  formToken?: string;
  publicKey?: string;
  mode?: string;
}

export interface ValidateResult {
  ok: boolean;
  paid?: boolean;
  status?: string;
  transactionId?: string;
  reason?: string;
}

/**
 * Pide a Izipay (vía BFF) un token de pago. El monto lo calcula el servidor desde el pedido.
 * `checkoutToken` es el que devolvió `createOrder()` — el plugin lo exige para pedidos de
 * invitado (sin sesión) para confirmar que quien pide el cobro es quien creó el pedido
 * (`bcy_order_access_ok`, corregido en el plugin). Si hay sesión, el plugin valida por el
 * uid del Bearer y este campo se ignora, pero no está de más enviarlo siempre.
 */
export async function getFormToken(orderId: number, checkoutToken?: string): Promise<FormTokenResult> {
  const res = await bffClient.post<FormTokenResult>('/payment/formtoken', {
    order_id: orderId,
    checkout_token: checkoutToken,
  });
  return res.data;
}

/**
 * Valida el pago del lado del servidor: el BFF verifica firma, estado PAID y que
 * el monto coincida con el pedido, y solo entonces lo marca pagado. Mismo `checkoutToken`
 * que `getFormToken`, por la misma verificación de propiedad del pedido.
 */
export async function validatePayment(
  orderId: number,
  answer: string,
  hash: string,
  checkoutToken?: string
): Promise<ValidateResult> {
  const res = await bffClient.post<ValidateResult>('/payment/validate', {
    order_id: orderId,
    'kr-answer': answer,
    'kr-hash': hash,
    checkout_token: checkoutToken,
  });
  return res.data;
}

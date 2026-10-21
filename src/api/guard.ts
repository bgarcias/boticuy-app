import { PURCHASE_ENABLED, CREATORS_ENABLED, COUPONS_ENABLED } from '../config/features';

/**
 * Error que lanzan las funciones de `api/` de compra y cuenta cuando el modo
 * sin compra está activo. Se lanza (en vez de devolver `ok:false`) a propósito:
 * es lo mismo que ve un llamador ante un 503 del servidor, y todos los
 * llamadores alcanzables ya tienen `catch` para ese caso.
 */
export class PurchaseDisabledError extends Error {
  readonly code = 'purchase_disabled';
  constructor() {
    super('La compra y las cuentas no están disponibles en la app.');
    this.name = 'PurchaseDisabledError';
  }
}

/** Primera línea de `fetchApoyaCreador` (la única ruta de cupones que se reabre): se niega con CREATORS_ENABLED apagado. */
export function assertCreatorsEnabled(): void {
  if (!CREATORS_ENABLED) throw new PurchaseDisabledError();
}

/** Primera línea de `fetchMisCupones` (la segunda ruta de cupones que se reabre): se niega con COUPONS_ENABLED apagado. */
export function assertCouponsEnabled(): void {
  if (!COUPONS_ENABLED) throw new PurchaseDisabledError();
}

/** Primera línea de cada función de `api/` de compra y cuenta: no envía nada con el flag apagado. */
export function assertPurchaseEnabled(): void {
  if (!PURCHASE_ENABLED) throw new PurchaseDisabledError();
}

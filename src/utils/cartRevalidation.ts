import { useCart } from '../store/cartStore';
import { fetchProductsByIds } from '../api/products';
import type { Product } from '../types';
import { priceToSoles, formatSoles } from './format';

export interface CartRevalidationResult {
  /** Un mensaje por cada ajuste hecho (stock o precio) — para mostrar en un solo toast. */
  issues: string[];
  /** true si al menos un ítem cambió de precio — para que quien llama decida cortar un submit en curso. */
  priceChanged: boolean;
}

/**
 * Revalida el carrito local contra el servidor: stock real (mismo
 * comportamiento que ya existía en CartScreen) y precio real (A7, ver
 * boticuy-hallazgos-completo.md — unitPrice se congela al agregar el
 * producto y nada lo refrescaba, así que el subtotal y el tope de 30% de
 * canje de puntos podían quedar desactualizados).
 *
 * Una sola petición batch (`fetchProductsByIds()`) en vez de un `fetchProduct`
 * por ítem — antes, con conexión lenta, un timeout en cualquiera de las N
 * peticiones secuenciales terminaba borrando ese ítem del carrito, porque el
 * `catch` no distinguía "producto realmente no existe" de "falló la red" (ver
 * A1). Con un solo batch: si la petición completa falla (red/timeout/500), no
 * se toca nada del carrito — misma regla de "ante la duda, no tocar" que
 * antes, aplicada una vez en vez de N. Si la petición SÍ responde, un producto
 * ausente de la respuesta es la señal de "ya no existe" — la Store API lo
 * omite directamente, no hace falta interpretar ningún código de error por
 * producto (ver B13, agrupado con A1 en el propio plan de la auditoría).
 *
 * No es un hook — usa useCart.getState() directamente, así que se puede
 * llamar desde cualquier lugar (efecto de foco, montaje de pantalla, o justo
 * antes de un submit), no solo desde un componente.
 *
 * `isCancelled` deja que quien llama corte antes de arrancar o después de que
 * la petición batch resuelva — ya no hay "entre ítem e ítem" que cancelar,
 * porque es una sola llamada (trade-off aceptado: la espera máxima total baja
 * de N peticiones a una sola, así que la ventana sin poder cancelar en el
 * medio también se achica).
 */
export async function revalidateCart(isCancelled: () => boolean = () => false): Promise<CartRevalidationResult> {
  const current = useCart.getState().items;
  const issues: string[] = [];
  let priceChanged = false;
  if (current.length === 0 || isCancelled()) return { issues, priceChanged };

  let fresh: Product[];
  try {
    fresh = await fetchProductsByIds(current.map((i) => i.productId));
  } catch {
    // Red, timeout o 5xx — no se sabe si los productos siguen existiendo o
    // no, así que no se toca el carrito. Se reintentará en la próxima
    // revalidación (foco del Carrito, montaje o pre-submit del Checkout).
    return { issues, priceChanged };
  }
  if (isCancelled()) return { issues, priceChanged };

  const byId = new Map(fresh.map((p) => [p.id, p]));

  for (const item of current) {
    const p = byId.get(item.productId);
    if (!p || !p.is_in_stock) {
      useCart.getState().remove(item.productId);
      issues.push(`"${item.name}" ya no está disponible.`);
      continue;
    }
    const available = p.low_stock_remaining;
    const qty = available != null ? Math.min(item.quantity, available) : item.quantity;
    if (qty < item.quantity) {
      useCart.getState().setQty(item.productId, qty);
      issues.push(`Se ajustó la cantidad de "${item.name}" a ${qty} (stock limitado).`);
    }

    const freshPrice = priceToSoles(p.prices);
    if (Math.round(freshPrice * 100) !== Math.round(item.unitPrice * 100)) {
      useCart.getState().updatePrice(item.productId, freshPrice);
      issues.push(`El precio de "${item.name}" cambió a ${formatSoles(freshPrice)} (antes ${formatSoles(item.unitPrice)}).`);
      priceChanged = true;
    }
  }
  return { issues, priceChanged };
}

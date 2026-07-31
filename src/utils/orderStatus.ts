import type { Ionicons } from '@expo/vector-icons';

/**
 * Traducción de status_slug (WooCommerce) a texto para el cliente — compartida
 * entre OrderDetailScreen (timeline + banner) y OrdersScreen (lista), para que
 * ambas pantallas usen exactamente el mismo texto por cada estado real.
 */

// Pasos del pedido y a qué estados reales de WooCommerce corresponden. Solo se
// listan slugs que WooCommerce realmente emite — sin "en camino": WooCommerce
// no tiene un estado nativo para eso. "pending" no es parte del timeline: es un
// estado especial (ver ORDER_STATUS_MESSAGES) porque todavía no hay pago
// confirmado. "Confirmado" se activa desde "processing" (pago confirmado) —
// "completed" se incluye también porque un pedido puede seguir avanzando
// manualmente hasta ese estado y debe seguir mostrándose como confirmado, no
// regresar al timeline.
export const ORDER_STEPS: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  slugs: string[];
}[] = [
  { key: 'recibido', label: 'Recibido', icon: 'receipt-outline', slugs: ['on-hold'] },
  { key: 'confirmado', label: 'Confirmado', icon: 'checkmark-done-outline', slugs: ['processing', 'completed'] },
];

// Avisos para estados que no son parte del timeline normal, cada uno con su
// propio texto (antes los tres se mostraban igual como "cancelado"). Versión
// larga — banner del detalle de pedido (OrderDetailScreen), con la explicación
// completa.
export const ORDER_STATUS_MESSAGES: Record<string, string> = {
  pending: 'Pago pendiente. Este pedido no será procesado hasta que se confirme el pago.',
  cancelled: 'Pedido cancelado',
  failed: 'Hubo un problema con el pago. Si ya pagaste, escríbenos por WhatsApp.',
  refunded: 'Pedido reembolsado',
};

// Mismos estados, versión corta — para la lista de pedidos (OrdersScreen), donde
// la explicación completa no entra bien en una card compacta.
export const ORDER_STATUS_MESSAGES_SHORT: Record<string, string> = {
  pending: 'Pago pendiente',
  cancelled: 'Cancelado',
  failed: 'Pago fallido',
  refunded: 'Reembolsado',
};

/** true si el status_slug es parte del timeline normal (Recibido/Confirmado). */
export function isTimelineStatus(statusSlug: string): boolean {
  return ORDER_STEPS.some((s) => s.slugs.includes(statusSlug));
}

/**
 * Traduce un status_slug real de WooCommerce al mismo texto corto que usa
 * OrdersScreen (lista de pedidos). Los estados del timeline (Recibido/
 * Confirmado) ya son cortos de por sí, no tienen variante corta/larga
 * distinta. Para un estado no reconocido (ni en el timeline ni pending/
 * cancelled/failed/refunded), cae a `fallbackStatus` (la etiqueta real de
 * WooCommerce tal cual) — nunca se inventa progreso.
 */
export function getOrderStatusLabelShort(statusSlug: string, fallbackStatus: string): string {
  const step = ORDER_STEPS.find((s) => s.slugs.includes(statusSlug));
  if (step) return step.label;
  return ORDER_STATUS_MESSAGES_SHORT[statusSlug] ?? fallbackStatus;
}

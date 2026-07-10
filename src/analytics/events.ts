/**
 * Taxonomía de eventos del embudo de conversión de Boticuy.
 * Embudo: ver → buscar/filtrar → ver producto → agregar → iniciar checkout → pedido.
 */
export const EV = {
  SEARCH: 'search',
  VIEW_CATEGORY: 'view_category',
  VIEW_BRAND: 'view_brand',
  VIEW_PRODUCT: 'view_product',
  ADD_TO_CART: 'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  TOGGLE_FAVORITE: 'toggle_favorite',
  BEGIN_CHECKOUT: 'begin_checkout',
  CHECKOUT_SUBMITTED: 'checkout_submitted',
  CONTACT_WHATSAPP: 'contact_whatsapp',
} as const;

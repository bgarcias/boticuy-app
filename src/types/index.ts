/** Tipos de dominio, mapeados a lo que devuelve la Store API de WooCommerce. */

export interface StorePrice {
  price: string; // en unidades menores (ej "5500" = S/55.00)
  regular_price: string;
  sale_price: string;
  currency_code: string;
  currency_minor_unit: number; // 2 → dividir entre 100
  currency_symbol: string;
}

export interface ProductImage {
  id: number;
  src: string;
  thumbnail: string;
  alt: string;
}

export interface TermRef {
  id: number;
  name: string;
  slug: string;
}

/** Producto tal cual viene de /wc/store/v1/products */
export interface Product {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  sku: string;
  short_description: string; // HTML
  description: string; // HTML
  on_sale: boolean;
  prices: StorePrice;
  images: ProductImage[];
  brands: TermRef[];
  average_rating: string;
  review_count: number;
  is_in_stock: boolean;
  is_purchasable: boolean;
  low_stock_remaining: number | null;
  stock_availability?: { text: string; class: string };
}

/** Reseña de producto (de /wc/store/v1/products/reviews) */
export interface ProductReview {
  id: number;
  rating: number; // 1..5
  reviewer: string;
  review: string; // HTML
  verified: boolean;
  formatted_date_created: string;
}

/** Término de taxonomía (necesidades / marcas) para los filtros */
export interface Taxonomy {
  id: number;
  name: string;
  slug: string;
  count: number;
}

/** Datos enriquecidos del producto (campos JetEngine vía BFF) */
export interface ProductExtra {
  id: number;
  beneficios: string; // HTML
  descripcion: string; // HTML (composición / vía de administración)
  advertencias: string; // HTML
  contenido_neto: string; // texto plano
  referencias: string; // HTML
  descuento: string;
}

/** Término de ubigeo (departamento/provincia/distrito) */
export interface UbigeoTerm {
  codigo: string;
  nombre: string;
  idUbigeo?: string; // solo distritos
}

export type PaymentMethod = 'cod' | 'yape' | 'tarjeta';

/** Cotización de envío (calculada por WooCommerce según el distrito). */
export interface ShippingQuote {
  zone: string;
  cost: number;
  flat_cost: number;
  free_threshold: number | null;
  is_free: boolean;
}

/** Cupón de creador (para "Apoya a tu creador favorito"). */
export interface Coupon {
  code: string;
  amount: number;
  descripcion?: string;
  group?: 'copa' | 'fijo';
}

/** Creador (Copa o aliado fijo) con estado de su código. */
export interface Creator {
  code: string;
  name: string;
  channel: string;
  amount: number;
  active: boolean;
}

export interface CreatorsResponse {
  copa: Creator[];
  fijo: Creator[];
}

/** Cupón aplicado al carrito (validado por el BFF). */
export interface AppliedCoupon {
  code: string;
  discount_type: string; // 'percent' | 'fixed_cart'
  amount: number;
  minimum_amount: number;
}

/** Datos del formulario de checkout (invitado) */
export interface CheckoutForm {
  nombre: string;
  email: string;
  telefono: string;
  tipoDoc: 'DNI' | 'CE';
  numDoc: string;
  departamento: UbigeoTerm | null;
  provincia: UbigeoTerm | null;
  distrito: UbigeoTerm | null;
  direccion: string;
  numero: string;
  interior: string;
  referencia: string;
  metodoPago: PaymentMethod;
}

/** Puntos de fidelidad del usuario */
export interface PointsInfo {
  balance: number;
  level: 'bronce' | 'plata' | 'oro';
  level_name: string;
  next_level_at: number | null;
  soles_value: number;
}

/** Dirección guardada del usuario */
export interface SavedAddress {
  id: string;
  direccion: string;
  numero: string;
  interior: string;
  referencia: string;
  departamento: { codigo: string; nombre: string };
  provincia: { codigo: string; nombre: string };
  distrito: { codigo: string; nombre: string; idUbigeo: string };
}

/** Usuario autenticado */
export interface AuthUser {
  id: number;
  email: string;
  nombre: string;
}

/** Pedido del usuario (de WooCommerce) */
export interface Order {
  id: number;
  number: string;
  date: string;
  status: string;
  status_slug: string;
  total: number;
  items: { name: string; qty: number; product_id?: number }[];
}

/** Ítem dentro del carrito local */
export interface CartItem {
  productId: number;
  name: string;
  image: string;
  unitPrice: number; // soles ya convertidos
  quantity: number;
}

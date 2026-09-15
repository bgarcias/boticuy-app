import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Order, SavedAddress } from '../types';

/** Recortado a lo que existe en las Fases 1-5 más el pago con tarjeta/Yape (Fase 4). */
export type TabParamList = {
  Home: undefined;
  Catalogo: { necesidad?: string; marca?: string; q?: string } | undefined;
  Carrito: undefined;
  Perfil: undefined;
};

/** Datos para la pantalla de confirmación de pedido. */
export type ConfirmParams = {
  nombre: string;
  email: string;
  distrito: string;
  metodoPago: 'yape' | 'tarjeta' | 'transferencia';
  subtotal: number;
  envio: number;
  total: number;
  coupon?: string;
  /** Solo el descuento del cupón (ver M1 en boticuy-hallazgos-completo.md — antes venía mezclado con el de puntos). */
  discount?: number;
  /** Del servidor (ord.points_*), nunca del estado local del checkout — si A7 recortó el canje, el local ya no coincide. */
  pointsRequested?: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  pointsAdjusted?: boolean;
  orderNumber?: string;
  /** true si la cotización de envío nunca se resolvió (ver M2) — evita mostrar "Gratis" cuando en realidad fue un error. */
  shippingUnavailable?: boolean;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  ProductDetail: { id: number; name?: string };
  Login: undefined;
  ForgotPassword: undefined;
  Checkout: undefined;
  OrderConfirmation: ConfirmParams;
  Addresses: undefined;
  AddressForm: { address?: SavedAddress } | undefined;
  Orders: undefined;
  OrderDetail: { order: Order };
  Points: undefined;
  Creators: undefined;
  MyCoupons: undefined;
  Favorites: undefined;
  PaymentWebView: {
    orderId: number;
    formToken: string;
    publicKey: string;
    /** Requerido si el pedido es de invitado (ver bcy_order_access_ok en el plugin). */
    checkoutToken?: string;
    confirm: ConfirmParams;
  };
};

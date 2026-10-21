import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem, Product, AppliedCoupon } from '../types';
import { priceToSoles } from '../utils/format';
import { getProductoNoVendible } from '../constants/productosNoVendibles';
import { PURCHASE_ENABLED } from '../config/features';

interface CartState {
  items: CartItem[];
  coupon: AppliedCoupon | null;
  add: (product: Product, qty?: number) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  updatePrice: (productId: number, unitPrice: number) => void;
  clear: () => void;
  setCoupon: (coupon: AppliedCoupon | null) => void;
  count: () => number;
  subtotal: () => number;
  discount: () => number;
  total: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      coupon: null,

      add: (product, qty = 1) =>
        set((state) => {
          // Los productos que no se venden por el app (p. ej. el de drflu.pe) nunca entran al carrito.
          if (getProductoNoVendible(product.sku)) return state;
          // Mismo dato y mismo criterio que el tope del selector en
          // ProductDetailScreen: low_stock_remaining es la única cantidad exacta
          // que da la Store API; si es null, WooCommerce no reporta stock bajo y
          // se asume que alcanza (sin tope).
          const limit = typeof product.low_stock_remaining === 'number' ? product.low_stock_remaining : null;
          const existing = state.items.find((i) => i.productId === product.id);
          if (existing) {
            const nextQty = limit != null ? Math.min(existing.quantity + qty, limit) : existing.quantity + qty;
            return {
              items: state.items.map((i) =>
                i.productId === product.id ? { ...i, quantity: nextQty, stockLimit: limit } : i
              ),
            };
          }
          const initialQty = limit != null ? Math.min(qty, limit) : qty;
          if (initialQty <= 0) return state; // sin stock disponible: no se agrega
          const item: CartItem = {
            productId: product.id,
            name: product.name,
            image: product.images?.[0]?.thumbnail ?? product.images?.[0]?.src ?? '',
            unitPrice: priceToSoles(product.prices),
            quantity: initialQty,
            stockLimit: limit,
          };
          return { items: [...state.items, item] };
        }),

      // Si el carrito queda vacío, el cupón también se limpia (no queda un código suelto).
      remove: (productId) =>
        set((state) => {
          const items = state.items.filter((i) => i.productId !== productId);
          return { items, coupon: items.length === 0 ? null : state.coupon };
        }),

      setQty: (productId, qty) =>
        set((state) => {
          const items =
            qty <= 0
              ? state.items.filter((i) => i.productId !== productId)
              : state.items.map((i) => {
                  if (i.productId !== productId) return i;
                  const capped = i.stockLimit != null ? Math.min(qty, i.stockLimit) : qty;
                  return { ...i, quantity: capped };
                });
          return { items, coupon: items.length === 0 ? null : state.coupon };
        }),

      // Actualiza el precio congelado de un ítem cuando la revalidación (ver
      // src/utils/cartRevalidation.ts, hallazgo A7) detecta que cambió del
      // lado del servidor — no toca quantity ni stockLimit.
      updatePrice: (productId, unitPrice) =>
        set((state) => ({
          items: state.items.map((i) => (i.productId === productId ? { ...i, unitPrice } : i)),
        })),

      clear: () => set({ items: [], coupon: null }),

      setCoupon: (coupon) => set({ coupon }),

      count: () => get().items.reduce((n, i) => n + i.quantity, 0),

      subtotal: () => get().items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),

      discount: () => {
        const c = get().coupon;
        const sub = get().subtotal();
        if (!c) return 0;
        if (c.minimum_amount && sub < c.minimum_amount) return 0;
        if (c.discount_type === 'percent') return Math.round(((sub * c.amount) / 100) * 100) / 100;
        if (c.discount_type === 'fixed_cart') return Math.min(c.amount, sub);
        return 0;
      },

      total: () => Math.max(0, get().subtotal() - get().discount()),
    }),
    {
      name: 'boticuy-cart',
      storage: createJSONStorage(() => AsyncStorage),
      // Con PURCHASE_ENABLED (flujo original con compra) el cupón se guarda en disco, como antes.
      // En modo web (sin PURCHASE_ENABLED) NO: no sobrevive al cierre del app.
      partialize: (s) => (PURCHASE_ENABLED ? { items: s.items, coupon: s.coupon } : { items: s.items }),
      // En modo web además se descarta cualquier cupón que versiones anteriores ya hubieran persistido.
      merge: (persisted, current) =>
        PURCHASE_ENABLED ? { ...current, ...(persisted as object) } : { ...current, ...(persisted as object), coupon: null },
    }
  )
);

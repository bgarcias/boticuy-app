import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem, Product, AppliedCoupon } from '../types';
import { priceToSoles } from '../utils/format';

interface CartState {
  items: CartItem[];
  coupon: AppliedCoupon | null;
  add: (product: Product, qty?: number) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
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
          const existing = state.items.find((i) => i.productId === product.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === product.id ? { ...i, quantity: i.quantity + qty } : i
              ),
            };
          }
          const item: CartItem = {
            productId: product.id,
            name: product.name,
            image: product.images?.[0]?.thumbnail ?? product.images?.[0]?.src ?? '',
            unitPrice: priceToSoles(product.prices),
            quantity: qty,
          };
          return { items: [...state.items, item] };
        }),

      remove: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      setQty: (productId, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => i.productId !== productId)
              : state.items.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)),
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
      partialize: (s) => ({ items: s.items, coupon: s.coupon }),
    }
  )
);

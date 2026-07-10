import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from '../types';

interface FavState {
  items: Product[];
  toggle: (product: Product) => void;
  remove: (id: number) => void;
  isFav: (id: number) => boolean;
  clear: () => void;
}

export const useFavorites = create<FavState>()(
  persist(
    (set, get) => ({
      items: [],

      toggle: (product) =>
        set((state) => {
          const exists = state.items.some((p) => p.id === product.id);
          return {
            items: exists
              ? state.items.filter((p) => p.id !== product.id)
              : [product, ...state.items],
          };
        }),

      remove: (id) => set((state) => ({ items: state.items.filter((p) => p.id !== id) })),

      isFav: (id) => get().items.some((p) => p.id === id),

      clear: () => set({ items: [] }),
    }),
    {
      name: 'boticuy-favorites',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    }
  )
);

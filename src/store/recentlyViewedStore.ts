import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from '../types';

const MAX = 12;

interface RecentState {
  items: Product[];
  record: (product: Product) => void;
  clear: () => void;
}

export const useRecentlyViewed = create<RecentState>()(
  persist(
    (set) => ({
      items: [],
      record: (product) =>
        set((state) => {
          const rest = state.items.filter((p) => p.id !== product.id);
          return { items: [product, ...rest].slice(0, MAX) };
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'boticuy-recently-viewed',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    }
  )
);

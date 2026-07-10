import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX = 8;

interface RecentSearchState {
  items: string[];
  add: (q: string) => void;
  remove: (q: string) => void;
  clear: () => void;
}

export const useRecentSearches = create<RecentSearchState>()(
  persist(
    (set) => ({
      items: [],
      add: (q) =>
        set((state) => {
          const v = q.trim();
          if (!v) return state;
          const rest = state.items.filter((x) => x.toLowerCase() !== v.toLowerCase());
          return { items: [v, ...rest].slice(0, MAX) };
        }),
      remove: (q) => set((state) => ({ items: state.items.filter((x) => x !== q) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'boticuy-recent-searches',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

import { create } from 'zustand';

interface ToastState {
  message: string | null;
  seq: number; // cambia en cada show para reiniciar el temporizador
  show: (message: string) => void;
  hide: () => void;
}

/** Avisos efímeros (ej. "Agregado al carrito"). */
export const useToast = create<ToastState>((set) => ({
  message: null,
  seq: 0,
  show: (message) => set((s) => ({ message, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}));

import { create } from 'zustand';

export type ToastVariant = 'success' | 'warning';

interface ToastState {
  message: string | null;
  seq: number; // cambia en cada show para reiniciar el temporizador
  variant: ToastVariant;
  duration: number; // ms en pantalla antes de ocultarse
  show: (message: string, opts?: { variant?: ToastVariant; duration?: number }) => void;
  hide: () => void;
}

/** Avisos efímeros (ej. "Agregado al carrito"). Por defecto success/1800ms —
 *  casos con más texto (ej. lista de advertencias) pueden pedir variant/duration. */
export const useToast = create<ToastState>((set) => ({
  message: null,
  seq: 0,
  variant: 'success',
  duration: 1800,
  show: (message, opts) =>
    set((s) => ({
      message,
      seq: s.seq + 1,
      variant: opts?.variant ?? 'success',
      duration: opts?.duration ?? 1800,
    })),
  hide: () => set({ message: null }),
}));

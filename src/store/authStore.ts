import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '../types';
import { setAuthToken } from '../api/authToken';
import { me } from '../api/auth';
import { analytics } from '../analytics';

const KEY = 'boticuy-auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAuth: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) {
        const { token, user } = JSON.parse(raw);
        setAuthToken(token);
        set({ token, user });
        // /auth/refresh no existe en el plugin real: validamos la sesión
        // directamente contra /auth/me, sin renovar el token (dura 7 días fijos).
        try {
          const r = await me();
          if (r.ok && r.user) {
            set({ user: r.user });
          } else {
            // 401: token inválido o expirado → cerrar sesión.
            setAuthToken(null);
            set({ token: null, user: null });
            await SecureStore.deleteItemAsync(KEY);
          }
        } catch {
          /* sin conexión: se mantiene la sesión local y se revalida en el próximo arranque */
        }
      }
    } catch {
      /* noop */
    } finally {
      set({ hydrated: true });
    }
  },

  setAuth: async (token, user) => {
    setAuthToken(token);
    set({ token, user });
    analytics.identify(String(user.id), { email: user.email });
    try {
      await SecureStore.setItemAsync(KEY, JSON.stringify({ token, user }));
    } catch {
      /* noop */
    }
  },

  logout: async () => {
    setAuthToken(null);
    set({ token: null, user: null });
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* noop */
    }
  },
}));

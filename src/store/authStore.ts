import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '../types';
import { setAuthToken } from '../api/authToken';
import { refreshSession, logoutSession } from '../api/auth';
import { analytics } from '../analytics';

const KEY = 'boticuy-auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /**
   * true apenas se leyó SecureStore (rápido, local, sin red) y se supo si
   * había o no una sesión guardada — es lo único que useRequireAuth() (ver A5
   * en boticuy-hallazgos-completo.md) necesita para decidir si redirigir a
   * Login o no. Deliberadamente distinto de `hydrated`, que además espera el
   * round-trip de red de /auth/refresh — bloquear una decisión de navegación
   * hasta que termine esa llamada de red sería una espera injustificada para
   * algo que ya se puede responder con el token que ya está en memoria.
   */
  tokenReady: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAuth: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  tokenReady: false,
  hydrated: false,

  hydrate: async () => {
    let hadToken = false;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) {
        const { token, user } = JSON.parse(raw);
        setAuthToken(token);
        set({ token, user });
        hadToken = true;
      }
    } catch {
      /* noop */
    } finally {
      set({ tokenReady: true });
    }

    if (hadToken) {
      // Sesión deslizante: /auth/refresh revalida el token vigente y, si es
      // válido, el plugin reemite uno nuevo (otros 7 días) — reemplaza la
      // validación anterior contra /auth/me, que solo confirmaba sin renovar.
      try {
        const r = await refreshSession();
        if (r.ok === true && r.token && r.user) {
          setAuthToken(r.token);
          set({ token: r.token, user: r.user });
          try {
            await SecureStore.setItemAsync(KEY, JSON.stringify({ token: r.token, user: r.user }));
          } catch {
            /* noop: si no se pudo persistir, la sesión sigue viva en memoria hasta el próximo arranque */
          }
        } else if (r.ok === false) {
          // 401 explícito del plugin ({ ok:false, reason:"Sesión expirada" }):
          // sesión realmente inválida/expirada → cerrar sesión.
          setAuthToken(null);
          set({ token: null, user: null });
          await SecureStore.deleteItemAsync(KEY);
        }
        // Cualquier otra respuesta (ej. 404 rest_no_route si el plugin
        // desplegado todavía no tiene /auth/refresh, o un shape inesperado) no
        // es una negación explícita de la sesión: se mantiene la sesión local
        // tal cual, igual que un error de red — nunca se cierra sesión sin un
        // "no" explícito del servidor.
      } catch {
        /* sin conexión: se mantiene la sesión local (con el token viejo) y se reintenta renovar en el próximo arranque */
      }
    }
    set({ hydrated: true });
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
    // Cierre de sesión real en servidor (ver B5 en boticuy-hallazgos-completo.md)
    // — antes esta función solo borraba el token local, sin invalidar nada del
    // lado del servidor: un token ya copiado en otro lado (dispositivo robado,
    // tráfico interceptado) seguía viviendo hasta su expiración natural aunque
    // el usuario "cerrara sesión". Best-effort: si falla (sin red, servidor
    // caído), igual se cierra sesión localmente — nunca bloquea el logout.
    try {
      await logoutSession();
    } catch {
      /* noop */
    }
    setAuthToken(null);
    set({ token: null, user: null });
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* noop */
    }
  },
}));

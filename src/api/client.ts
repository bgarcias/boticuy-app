import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken } from './authToken';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  storeApiUrl: string;
  wpApiUrl: string;
  bffUrl: string;
};

/** Cliente para la Store API pública (catálogo, carrito). Sin llaves secretas. */
export const storeClient = axios.create({
  baseURL: extra.storeApiUrl,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

/** Cliente para taxonomías de WordPress (necesidades, marcas). */
export const wpClient = axios.create({
  baseURL: extra.wpApiUrl,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

/** Cliente para el BFF (endpoints propios) — login, pedidos, pagos, puntos. */
export const bffClient = axios.create({
  baseURL: extra.bffUrl,
  timeout: 20000,
  headers: { Accept: 'application/json' },
  // El BFF usa códigos HTTP correctos (400/401/402/404/409/422) para errores de
  // negocio y validación, devolviendo { ok:false, reason }. Los tratamos como
  // respuesta normal (leemos el body); solo los 5xx (errores del servidor) lanzan.
  validateStatus: (s) => s < 500,
});

// Adjunta el token JWT a las peticiones autenticadas (login/pedidos/perfil).
bffClient.interceptors.request.use((config) => {
  const t = getAuthToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

import { bffClient } from './client';
import type { AuthUser } from '../types';

interface AuthResult {
  ok: boolean;
  reason?: string;
  token?: string;
  user?: AuthUser;
}

export async function registerUser(email: string, password: string, nombre: string): Promise<AuthResult> {
  const res = await bffClient.post<AuthResult>('/auth/register', { email, password, nombre });
  return res.data;
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const res = await bffClient.post<AuthResult>('/auth/login', { email, password });
  return res.data;
}

/**
 * Renueva el token actual (sesión deslizante): revalida el Bearer token vigente
 * (vía interceptor, sin body) y, si es válido, el plugin reemite uno nuevo con
 * otros 7 días de vida. `ok:false` con 401 si el token ya no es válido/expiró.
 */
export async function refreshSession(): Promise<AuthResult> {
  const res = await bffClient.post<AuthResult>('/auth/refresh');
  return res.data;
}

/**
 * Cierre de sesión real en servidor (ver B5 en boticuy-hallazgos-completo.md):
 * invalida el Bearer token vigente (vía interceptor, sin body) y cualquier
 * otro token más viejo de este usuario — no solo este dispositivo. Antes
 * `authStore.ts::logout()` solo borraba el token local, sin avisarle nada al
 * servidor. Se llama best-effort desde `logout()` — si falla, igual se cierra
 * sesión localmente.
 */
export async function logoutSession(): Promise<{ ok: boolean }> {
  const res = await bffClient.post<{ ok: boolean }>('/auth/logout');
  return res.data;
}

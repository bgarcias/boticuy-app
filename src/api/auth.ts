import { bffClient } from './client';
import type { AuthUser } from '../types';

interface AuthResult {
  ok: boolean;
  reason?: string;
  token?: string;
  user?: AuthUser;
}

interface MeResult {
  ok: boolean;
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

/** Valida la sesión actual (token vía interceptor), sin renovarlo. */
export async function me(): Promise<MeResult> {
  const res = await bffClient.get<MeResult>('/auth/me');
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

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

/** Valida la sesión actual (token vía interceptor). No renueva el token: /auth/refresh no existe en el plugin real. */
export async function me(): Promise<MeResult> {
  const res = await bffClient.get<MeResult>('/auth/me');
  return res.data;
}

import { bffClient } from './client';
import type { SavedAddress } from '../types';

export async function fetchAddresses(): Promise<SavedAddress[]> {
  const res = await bffClient.get<{ ok: boolean; addresses: SavedAddress[] }>('/addresses');
  return res.data?.addresses ?? [];
}

/**
 * Lanza con el motivo real del servidor cuando `ok !== true` (validación de
 * formato, tope de 10 direcciones, lock ocupado, etc.) — antes se devolvía `[]`
 * en silencio para cualquier 4xx (bffClient no lanza para esos códigos, ver
 * `client.ts`), y quien llamaba nunca se enteraba de que la dirección no se
 * guardó (ver A3/B9 en boticuy-hallazgos-completo.md).
 */
function unwrapAddresses(res: { data?: { ok?: boolean; reason?: string; addresses?: SavedAddress[] } }): SavedAddress[] {
  if (res.data?.ok !== true) {
    throw new Error(res.data?.reason ?? 'No pudimos guardar la dirección.');
  }
  return res.data.addresses ?? [];
}

export async function addAddress(addr: Omit<SavedAddress, 'id'>): Promise<SavedAddress[]> {
  const res = await bffClient.post<{ ok: boolean; reason?: string; addresses: SavedAddress[] }>('/addresses', addr);
  return unwrapAddresses(res);
}

export async function updateAddress(id: string, addr: Omit<SavedAddress, 'id'>): Promise<SavedAddress[]> {
  const res = await bffClient.post<{ ok: boolean; reason?: string; addresses: SavedAddress[] }>('/addresses/update', { id, ...addr });
  return unwrapAddresses(res);
}

export async function deleteAddress(id: string): Promise<SavedAddress[]> {
  const res = await bffClient.post<{ ok: boolean; addresses: SavedAddress[] }>('/addresses/delete', { id });
  return res.data?.addresses ?? [];
}

import { bffClient } from './client';
import type { SavedAddress } from '../types';

export async function fetchAddresses(): Promise<SavedAddress[]> {
  const res = await bffClient.get<{ ok: boolean; addresses: SavedAddress[] }>('/addresses');
  return res.data?.addresses ?? [];
}

export async function addAddress(addr: Omit<SavedAddress, 'id'>): Promise<SavedAddress[]> {
  const res = await bffClient.post<{ ok: boolean; addresses: SavedAddress[] }>('/addresses', addr);
  return res.data?.addresses ?? [];
}

export async function deleteAddress(id: string): Promise<SavedAddress[]> {
  const res = await bffClient.post<{ ok: boolean; addresses: SavedAddress[] }>('/addresses/delete', { id });
  return res.data?.addresses ?? [];
}

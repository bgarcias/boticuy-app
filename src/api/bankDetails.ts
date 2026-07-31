import { bffClient } from './client';
import type { BankAccount } from '../types';

export interface BankDetailsResult {
  ok: boolean;
  reason?: string;
  bancos?: BankAccount[];
  instrucciones?: string;
}

/** Datos bancarios para "Transferencia bancaria" (parseados desde WooCommerce en el plugin). */
export async function fetchBankDetails(): Promise<BankDetailsResult> {
  const res = await bffClient.get<BankDetailsResult>('/bank-details');
  return res.data;
}

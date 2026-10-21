import { bffClient } from './client';
import type { PointsInfo } from '../types';
import { assertPurchaseEnabled } from './guard';

export async function fetchPoints(): Promise<PointsInfo> {
  assertPurchaseEnabled();
  const res = await bffClient.get<PointsInfo & { ok: boolean }>('/points');
  return res.data;
}

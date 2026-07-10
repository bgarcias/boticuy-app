import { bffClient } from './client';
import type { PointsInfo } from '../types';

export async function fetchPoints(): Promise<PointsInfo> {
  const res = await bffClient.get<PointsInfo & { ok: boolean }>('/points');
  return res.data;
}

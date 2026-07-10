import { bffClient } from './client';
import type { UbigeoTerm } from '../types';

const trim = (rows: UbigeoTerm[]) =>
  rows.map((r) => ({ ...r, nombre: (r.nombre ?? '').trim() }));

/** Departamentos del Perú (con reparto activo). */
export async function fetchDepartamentos(): Promise<UbigeoTerm[]> {
  const res = await bffClient.get<UbigeoTerm[]>('/ubigeo/departamentos');
  return trim(res.data);
}

/** Provincias de un departamento. */
export async function fetchProvincias(departamento: string): Promise<UbigeoTerm[]> {
  const res = await bffClient.get<UbigeoTerm[]>('/ubigeo/provincias', {
    params: { departamento },
  });
  return trim(res.data);
}

/** Distritos de una provincia. */
export async function fetchDistritos(departamento: string, provincia: string): Promise<UbigeoTerm[]> {
  const res = await bffClient.get<UbigeoTerm[]>('/ubigeo/distritos', {
    params: { departamento, provincia },
  });
  return trim(res.data);
}

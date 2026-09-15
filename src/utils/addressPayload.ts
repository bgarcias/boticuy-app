import type { SavedAddress, UbigeoTerm } from '../types';
import { stripInnerSpaces } from './validation';

export interface AddressFormFields {
  /** Opcional — AddressFormScreen no pide nombre; CheckoutScreen sí lo tiene (el del cliente). */
  nombre?: string;
  telefono: string;
  numDoc: string;
  direccion: string;
  numero: string;
  interior: string;
  referencia: string;
  departamento: UbigeoTerm;
  provincia: UbigeoTerm;
  distrito: UbigeoTerm;
}

/**
 * Arma el payload para addAddress()/updateAddress() a partir de los campos del
 * formulario — un solo lugar que sabe qué exige el servidor
 * (class-addresses.php::validate_format(): teléfono, DNI y distrito con
 * formato válido), para que CheckoutScreen y AddressFormScreen no vuelvan a
 * desalinearse si el servidor cambia qué campos exige (ver A3 en
 * boticuy-hallazgos-completo.md — antes CheckoutScreen armaba este payload a
 * mano y se olvidó de telefono/numDoc, y nadie lo notó porque ambos son
 * opcionales en el tipo `SavedAddress`).
 */
export function buildAddressPayload(fields: AddressFormFields): Omit<SavedAddress, 'id'> {
  const payload: Omit<SavedAddress, 'id'> = {
    telefono: fields.telefono.trim(),
    numDoc: stripInnerSpaces(fields.numDoc.trim()),
    direccion: fields.direccion.trim(),
    numero: fields.numero.trim(),
    interior: fields.interior.trim(),
    referencia: fields.referencia.trim(),
    departamento: { codigo: fields.departamento.codigo, nombre: fields.departamento.nombre },
    provincia: { codigo: fields.provincia.codigo, nombre: fields.provincia.nombre },
    distrito: { codigo: fields.distrito.codigo, nombre: fields.distrito.nombre, idUbigeo: fields.distrito.idUbigeo ?? '' },
  };
  if (fields.nombre?.trim()) payload.nombre = fields.nombre.trim();
  return payload;
}

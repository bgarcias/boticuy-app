import Constants from 'expo-constants';
import type { StorePrice } from '../types';

const extra = (Constants.expoConfig?.extra ?? {}) as { currencySymbol?: string };

/** Convierte el precio de la Store API (unidades menores) a soles numéricos. */
export function priceToSoles(p: StorePrice): number {
  const minor = parseInt(p.price, 10) || 0;
  return minor / Math.pow(10, p.currency_minor_unit ?? 2);
}

export function regularToSoles(p: StorePrice): number {
  const minor = parseInt(p.regular_price, 10) || 0;
  return minor / Math.pow(10, p.currency_minor_unit ?? 2);
}

/** Formatea un monto en soles: 55 → "S/ 55.00" */
export function formatSoles(amount: number): string {
  return `${extra.currencySymbol ?? 'S/'} ${amount.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Entidades HTML con nombre más comunes en contenido de WordPress/WooCommerce. */
const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
  '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú',
  '&ntilde;': 'ñ', '&Ntilde;': 'Ñ', '&uuml;': 'ü', '&Uuml;': 'Ü',
  '&ordf;': 'ª', '&ordm;': 'º', '&deg;': '°', '&iexcl;': '¡', '&iquest;': '¿',
  '&laquo;': '«', '&raquo;': '»', '&hellip;': '…', '&ndash;': '–', '&mdash;': '—',
  '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”',
};

/**
 * `String.fromCodePoint()` lanza `RangeError` fuera de `0-0x10FFFF` (y también
 * dentro del rango de surrogates aislado, `0xD800-0xDFFF`) — un valor así en
 * una entidad numérica no debe tumbar el render completo. Mismo criterio que
 * ya usa el propio decodificador para una entidad *nombrada* desconocida:
 * dejar el texto de la entidad tal cual vino, no inventar un placeholder.
 */
function safeFromCodePoint(codePoint: number, original: string): string {
  if (codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return original;
  }
  return String.fromCodePoint(codePoint);
}

/**
 * Decodifica entidades HTML de textos que vienen de WordPress/WooCommerce
 * (nombres de producto, categorías, marcas, reseñas, etc.). A diferencia de
 * una tabla fija, las entidades numéricas (`&#8211;`, `&#8217;`...) se
 * decodifican de forma genérica por código de punto, no una por una.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (entity, hex) => safeFromCodePoint(parseInt(hex, 16), entity))
    .replace(/&#(\d+);/g, (entity, dec) => safeFromCodePoint(parseInt(dec, 10), entity))
    .replace(/&[a-zA-Z]+;/g, (entity) => NAMED_ENTITIES[entity] ?? entity);
}

/** Quita etiquetas HTML y decodifica entidades, para texto plano en cards/resúmenes. */
export function stripHtml(html: string): string {
  return decodeHtmlEntities((html || '').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

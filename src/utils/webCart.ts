import { parseHttpUrl, validateUrl, withUtmSource } from './safeUrl';
import type { UrlPolicy } from './safeUrl';

/** Mismos topes que el manejador del plugin (class-web-cart.php): lo que sobra se descarta o se limita. */
export const WEB_CART_MAX_LINES = 20;
export const WEB_CART_MAX_QTY = 10;

/** Longitud máxima del código de cupón (igual que el plugin, class-web-cart.php). */
export const WEB_COUPON_MAX_LENGTH = 32;
const COUPON_RE = /^[A-Za-z0-9_-]+$/;

export type CouponCheck = { ok: true; code: string } | { ok: false };

/**
 * Valida SOLO el formato del código de cupón (letras, números, guion y guion bajo; hasta 32
 * caracteres) y lo normaliza a mayúsculas. No consulta al servidor: el app no sabe si el
 * cupón existe; la web lo valida y calcula el descuento.
 */
export function normalizeCouponCode(input: string): CouponCheck {
  const t = typeof input === 'string' ? input.trim() : '';
  if (t.length === 0 || t.length > WEB_COUPON_MAX_LENGTH || !COUPON_RE.test(t)) return { ok: false };
  return { ok: true, code: t.toUpperCase() };
}

export interface WebCartLine {
  productId: number;
  quantity: number;
}

export interface WebCartLink {
  url: string;
  /** Líneas incluidas en el enlace, ya limpias y acotadas. */
  lines: WebCartLine[];
  /** true si el carrito tenía más de WEB_CART_MAX_LINES productos y se dejaron fuera los últimos. */
  truncated: boolean;
  /** Código de cupón incluido (ya validado y en mayúsculas), si lo hay. */
  coupon?: string;
}

/** Limpia las líneas: id entero positivo, cantidad entera ≥ 1 y ≤ 10, ids repetidos juntos, máximo 20 productos. */
export function normalizeLines(lines: WebCartLine[]): { lines: WebCartLine[]; truncated: boolean } {
  const merged = new Map<number, number>();
  let truncated = false;
  for (const l of lines) {
    const id = Number(l.productId);
    const qty = Math.floor(Number(l.quantity));
    if (!Number.isInteger(id) || id < 1 || !Number.isFinite(qty) || qty < 1) continue;
    if (!merged.has(id) && merged.size >= WEB_CART_MAX_LINES) {
      truncated = true;
      continue;
    }
    merged.set(id, Math.min(WEB_CART_MAX_QTY, (merged.get(id) ?? 0) + qty));
  }
  return { lines: [...merged].map(([productId, quantity]) => ({ productId, quantity })), truncated };
}

/** Origen (`https://boticuy.com`, o el host de staging en builds que no son de producción) de la web, tomado de la URL de la tienda de la configuración. */
export function webOrigin(storeApiUrl: string, policy: UrlPolicy): string | null {
  const ok = validateUrl(storeApiUrl, policy);
  const u = ok ? parseHttpUrl(ok) : null;
  return u ? `${u.scheme}://${u.host}` : null;
}

/**
 * Enlace que arma el carrito en la web: `<web>/?bcy_cart=123-2,456-1&utm_source=app`.
 * La base sale de la configuración (no es fija) y se valida con la política de la
 * tienda. Solo viajan ids y cantidades (y, opcionalmente, un código de cupón): nunca precios
 * ni datos personales. El cupón va en `bcy_coupon` (nunca en `cupon`, que es el parámetro de la
 * web: el plugin lo reenvía a la web con ese nombre). Un código con formato inválido se ignora.
 * null si no hay líneas válidas o la base no es válida.
 */
export function buildWebCartUrl(lines: WebCartLine[], storeApiUrl: string, policy: UrlPolicy, couponInput?: string): WebCartLink | null {
  const origin = webOrigin(storeApiUrl, policy);
  if (!origin) return null;
  const clean = normalizeLines(lines);
  if (clean.lines.length === 0) return null;
  const param = clean.lines.map((l) => `${l.productId}-${l.quantity}`).join(',');
  const coupon = couponInput ? normalizeCouponCode(couponInput) : null;
  const couponParam = coupon && coupon.ok ? `&bcy_coupon=${encodeURIComponent(coupon.code)}` : '';
  const url = withUtmSource(`${origin}/?bcy_cart=${param}${couponParam}`, 'app');
  return url ? { url, lines: clean.lines, truncated: clean.truncated, coupon: coupon && coupon.ok ? coupon.code : undefined } : null;
}

/**
 * Validación estricta de URLs, sin depender de `new URL()` (su soporte en React
 * Native es parcial) y sin dependencias nuevas. Se usa para:
 *  - el botón "Comprar en la web" (solo la tienda),
 *  - los enlaces del texto del chat (boticuy.com, drflu.pe y wa.me solo hacia el número oficial).
 *
 * Reglas: solo https (http únicamente para los hosts que se declaren aparte, p. ej.
 * el staging de builds que no son de producción); host EXACTO de la lista (no
 * subdominios engañosos como `boticuy.com.otro.com`); sin `usuario@host`; sin
 * puerto; sin espacios, caracteres de control, `\` ni comillas/ángulos.
 */

export interface ParsedUrl {
  scheme: 'http' | 'https';
  host: string;
  path: string;
  /** Sin el `?` inicial; '' si no hay. */
  query: string;
  /** Con el `#` inicial; '' si no hay. */
  hash: string;
}

const URL_RE = /^(https?):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(#.*)?$/i;
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_RE = /[\s\u0000-\u001f\u007f\\<>"'`]/;

export function parseHttpUrl(input: string): ParsedUrl | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 2048 || FORBIDDEN_RE.test(raw)) return null;
  const m = URL_RE.exec(raw);
  if (!m) return null;
  const authority = m[2];
  // `@` (usuario:clave@host) y `:` (puerto o IPv6) no se aceptan.
  if (authority.includes('@') || authority.includes(':')) return null;
  const host = authority.toLowerCase();
  if (!HOST_RE.test(host)) return null;
  return {
    scheme: m[1].toLowerCase() as 'http' | 'https',
    host,
    path: m[3] || '',
    query: m[4] ?? '',
    hash: m[5] ?? '',
  };
}

export interface UrlPolicy {
  /** Hosts permitidos por https (comparación exacta, minúsculas). */
  hosts: string[];
  /** Hosts a los que además se permite http (solo staging de builds que no son de producción). */
  httpHosts?: string[];
}

function format(u: ParsedUrl): string {
  return `${u.scheme}://${u.host}${u.path}${u.query ? `?${u.query}` : ''}${u.hash}`;
}

/** Devuelve la URL normalizada si cumple la política; null si no. */
export function validateUrl(input: string, policy: UrlPolicy): string | null {
  const u = parseHttpUrl(input);
  if (!u) return null;
  if (u.scheme === 'https' && policy.hosts.includes(u.host)) return format(u);
  if (u.scheme === 'http' && (policy.httpHosts ?? []).includes(u.host)) return format(u);
  return null;
}

/**
 * Dominios a los que el texto del chat puede enlazar sin más condiciones. `wa.me`
 * NO está aquí: solo se acepta hacia el número oficial (ver `validateChatUrl`).
 */
export const CHAT_LINK_POLICY: UrlPolicy = { hosts: ['boticuy.com', 'drflu.pe'] };

/**
 * Validación de los enlaces del texto del chat. `boticuy.com` y `drflu.pe` según
 * `CHAT_LINK_POLICY`; `wa.me` solo si la ruta es exactamente el número oficial
 * (`/<dígitos>`, con barra final opcional), con cualquier parámetro (`?text=`).
 * Otro número, ruta distinta o dígitos codificados en `%xx` no pasan. Devuelve la
 * URL normalizada o null.
 */
export function validateChatUrl(input: string, whatsappDigits: string): string | null {
  const u = parseHttpUrl(input);
  if (!u) return null;
  if (u.host === 'wa.me') {
    const official = String(whatsappDigits ?? '').replace(/[^0-9]/g, '');
    if (u.scheme !== 'https' || official === '') return null;
    if (u.path !== `/${official}` && u.path !== `/${official}/`) return null;
    return format(u);
  }
  return validateUrl(input, CHAT_LINK_POLICY);
}

/** Pone `utm_source=<valor>` conservando los demás parámetros y el fragmento (reemplaza el que ya hubiera). */
export function withUtmSource(url: string, source: string): string | null {
  const u = parseHttpUrl(url);
  if (!u) return null;
  const kept = u.query
    .split('&')
    .filter((p) => p.length > 0 && p.split('=')[0].toLowerCase() !== 'utm_source');
  kept.push(`utm_source=${encodeURIComponent(source)}`);
  return format({ ...u, path: u.path || '/', query: kept.join('&') });
}

/**
 * Política de la tienda: `boticuy.com` por https. En builds que NO son de
 * producción se permite además el host de la tienda de la configuración
 * (staging, que puede ser una IP por http).
 */
export function storeUrlPolicy(storeApiUrl: string, isProductionBuild: boolean): UrlPolicy {
  const hosts = ['boticuy.com'];
  const httpHosts: string[] = [];
  if (!isProductionBuild) {
    const cfg = parseHttpUrl(storeApiUrl);
    if (cfg) {
      hosts.push(cfg.host);
      httpHosts.push(cfg.host);
    }
  }
  return { hosts, httpHosts };
}

/** URL para "Comprar en la web": valida el permalink contra la tienda y le agrega utm_source=app. null si no es válida. */
export function buildStoreUrl(permalink: string | undefined | null, policy: UrlPolicy): string | null {
  if (!permalink) return null;
  const ok = validateUrl(permalink, policy);
  return ok ? withUtmSource(ok, 'app') : null;
}

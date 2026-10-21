import { validateChatUrl } from './safeUrl';
import { WHATSAPP_DIGITS } from '../config/features';

/** Trozo de texto del bot ya listo para pintar. `url` solo existe si el destino pasó la validación. */
export interface ChatSegment {
  text: string;
  bold?: boolean;
  url?: string;
}

const BOLD_RE = /\*\*([\s\S]+?)\*\*/g;
// [texto](url)  |  URL suelta
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>[\]()]+)/gi;
const TRAILING_PUNCT_RE = /[.,;:!?'"»”’)\]}]+$/;

function linkSegments(text: string, bold: boolean, whatsappDigits: string): ChatSegment[] {
  const out: ChatSegment[] = [];
  let last = 0;
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const push = (seg: ChatSegment) => {
    if (seg.text) out.push(bold ? { ...seg, bold: true } : seg);
  };
  while ((m = LINK_RE.exec(text)) !== null) {
    push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      // [texto](url): solo es enlace si el destino está permitido; si no, se ve el texto y el destino, sin enlace.
      const url = validateChatUrl(m[2], whatsappDigits);
      push(url ? { text: m[1], url } : { text: `${m[1]} (${m[2]})` });
    } else {
      // URL suelta: se quita la puntuación final antes de enlazar y se deja como texto.
      const raw = m[3];
      const trimmed = raw.replace(TRAILING_PUNCT_RE, '');
      const tail = raw.slice(trimmed.length);
      const url = validateChatUrl(trimmed, whatsappDigits);
      push(url ? { text: trimmed, url } : { text: trimmed });
      push({ text: tail });
    }
    last = m.index + m[0].length;
  }
  push({ text: text.slice(last) });
  return out;
}

/**
 * Markdown ligero del bot → segmentos de texto plano: `**negrita**`, `[texto](url)`
 * y URLs sueltas. Nunca se interpreta HTML. Solo `boticuy.com` y `drflu.pe` (https,
 * dominio exacto) y `wa.me` hacia el número oficial se convierten en enlace; cualquier
 * otro `wa.me` queda como texto plano.
 */
export function parseChatText(input: string, whatsappDigits: string = WHATSAPP_DIGITS): ChatSegment[] {
  const text = typeof input === 'string' ? input : '';
  const out: ChatSegment[] = [];
  let last = 0;
  BOLD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOLD_RE.exec(text)) !== null) {
    out.push(...linkSegments(text.slice(last, m.index), false, whatsappDigits));
    out.push(...linkSegments(m[1], true, whatsappDigits));
    last = m.index + m[0].length;
  }
  out.push(...linkSegments(text.slice(last), false, whatsappDigits));
  return out;
}

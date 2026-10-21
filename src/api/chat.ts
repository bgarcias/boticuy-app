import axios from 'axios';
import { CHAT_URL, CHAT_RATE_URL, CHAT_APP_KEY } from '../config/features';
import { getDeviceId } from '../utils/deviceId';
import { encodeFormBody } from '../utils/chatProtocol';
import type { HistoryTurn } from '../utils/chatProtocol';
import {
  CHAT_TIMEOUT_MS,
  CHAT_MAX_MESSAGE_LENGTH,
  CHAT_ERROR_RATE_LIMIT,
  CHAT_ERROR_GENERIC,
  CHAT_ERROR_NETWORK,
} from '../constants/chat';

/**
 * Cliente de red del chat con IA. Independiente de storeClient, wpClient y
 * bffClient: no usa su base URL, ni el interceptor del Bearer, ni su
 * `validateStatus`. Acepta cualquier código de estado porque los errores 400,
 * 429 y 502 del servidor traen el texto a mostrar en `data.reply`.
 * El cuerpo se manda como string form-urlencoded armado a mano.
 */
export const chatClient = axios.create({
  timeout: CHAT_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
  validateStatus: () => true,
});

async function chatHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Boticuy-Device': await getDeviceId(),
  };
  // La clave solo existe en builds de producción (ver config/features.ts). Nunca se registra.
  if (CHAT_APP_KEY) headers['X-Boticuy-App'] = CHAT_APP_KEY;
  return headers;
}

export type ChatReply =
  | { ok: true; reply: string; logId?: number }
  | { ok: false; reply: string };

function replyOf(data: unknown): string | null {
  const d = data as { data?: { reply?: unknown } } | null | undefined;
  const r = d && typeof d === 'object' ? d.data?.reply : undefined;
  return typeof r === 'string' && r.trim() ? r : null;
}

/** Manda un mensaje al chat. Muestra siempre `data.reply` si el servidor lo trae; si no, un mensaje amable. */
export async function sendChatMessage(message: string, history: HistoryTurn[]): Promise<ChatReply> {
  try {
    const res = await chatClient.post(
      CHAT_URL,
      encodeFormBody({
        action: 'boticuy_chat_dev',
        message: message.slice(0, CHAT_MAX_MESSAGE_LENGTH),
        history: JSON.stringify(history),
      }),
      { headers: await chatHeaders() }
    );
    const body = res.data as { success?: unknown; data?: { reply?: unknown; log_id?: unknown } } | null;
    const reply = replyOf(body);
    if (res.status === 200 && body && typeof body === 'object' && body.success === true && reply) {
      const logId = typeof body.data?.log_id === 'number' ? body.data.log_id : undefined;
      return { ok: true, reply, logId };
    }
    return { ok: false, reply: reply ?? (res.status === 429 ? CHAT_ERROR_RATE_LIMIT : CHAT_ERROR_GENERIC) };
  } catch {
    return { ok: false, reply: CHAT_ERROR_NETWORK };
  }
}

/** 👍 (1) / 👎 (-1) de una respuesta. Solo el endpoint `/rate`: `/feedback` y `/track` no reconocen el app. */
export async function rateChatReply(logId: number, rating: 1 | -1): Promise<boolean> {
  try {
    const res = await chatClient.post(CHAT_RATE_URL, encodeFormBody({ log_id: logId, rating }), {
      headers: await chatHeaders(),
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

import { CHAT_MAX_HISTORY_TURNS, CHAT_MAX_TURN_LENGTH } from '../constants/chat';

/**
 * Cuerpo application/x-www-form-urlencoded armado a mano con encodeURIComponent.
 * No se usa URLSearchParams: en React Native su soporte es parcial.
 */
export function encodeFormBody(params: Record<string, string | number>): string {
  return Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

export interface HistoryTurn {
  role: 'user' | 'model';
  text: string;
}

/** Mensaje de la conversación tal como lo guarda el store. */
export interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  text: string;
  /** Saludo local: no se manda en el historial ni se puede valorar. */
  isGreeting?: boolean;
  /** Respuesta de error (red, límite, servidor): no se manda en el historial. */
  isError?: boolean;
  /** `log_id` del servidor, para 👍/👎. */
  logId?: number;
  /** Valoración ya enviada (1 o -1). */
  rating?: 1 | -1;
}

/**
 * Historial para el servidor: solo los turnos PREVIOS (el mensaje actual no está
 * aún en `messages`), sin el saludo local ni los errores. Cada turno se verifica
 * (rol válido, texto no vacío) y se acota en longitud; se mandan los últimos 10.
 */
export function buildHistory(messages: ChatMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const m of messages) {
    if (m.isGreeting || m.isError) continue;
    const role = m.role === 'user' ? 'user' : m.role === 'bot' ? 'model' : null;
    if (!role || typeof m.text !== 'string') continue;
    const text = m.text.trim().slice(0, CHAT_MAX_TURN_LENGTH);
    if (!text) continue;
    turns.push({ role, text });
  }
  return turns.slice(-CHAT_MAX_HISTORY_TURNS);
}

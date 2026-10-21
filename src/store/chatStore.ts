import { create } from 'zustand';
import type { ChatMessage } from '../utils/chatProtocol';
import { buildHistory } from '../utils/chatProtocol';
import { sendChatMessage, rateChatReply } from '../api/chat';
import { greetingsFor, CHAT_MAX_MESSAGE_LENGTH } from '../constants/chat';

/**
 * Conversación del chat. Vive solo en memoria mientras el app esté abierto
 * (sin persist: no se guarda en disco). Sobrevive a que el Home se desmonte.
 */
interface ChatState {
  messages: ChatMessage[];
  sending: boolean;
  send: (text: string) => Promise<void>;
  rate: (id: number, rating: 1 | -1) => Promise<boolean>;
  newConversation: () => void;
}

let nextId = 1;
/** Se incrementa al empezar una conversación nueva: una respuesta que llega tarde de la anterior se descarta. */
let conversation = 0;

/** Saludo al azar; al tocar "Nueva conversación" evita repetir el que acaba de verse. */
export function pickGreeting(previous?: string, now: Date = new Date()): string {
  const all = greetingsFor(now);
  const options = all.length > 1 ? all.filter((g) => g !== previous) : all;
  return options[Math.floor(Math.random() * options.length)];
}

/** El saludo se elige una sola vez por conversación y queda guardado en `messages`: no cambia al re-renderizar ni al volver a montar el Home. */
const greeting = (previous?: string): ChatMessage => ({ id: nextId++, role: 'bot', text: pickGreeting(previous), isGreeting: true });

export const useChat = create<ChatState>((set, get) => ({
  messages: [greeting()],
  sending: false,

  send: async (raw) => {
    const text = raw.trim().slice(0, CHAT_MAX_MESSAGE_LENGTH);
    if (!text || get().sending) return;
    const mine = conversation;
    // Solo los turnos previos: el mensaje actual todavía no está en `messages`.
    const history = buildHistory(get().messages);
    set((s) => ({ messages: [...s.messages, { id: nextId++, role: 'user', text }], sending: true }));

    const res = await sendChatMessage(text, history);
    if (mine !== conversation) return;
    set((s) => ({
      sending: false,
      messages: [
        ...s.messages,
        res.ok
          ? { id: nextId++, role: 'bot', text: res.reply, logId: res.logId }
          : { id: nextId++, role: 'bot', text: res.reply, isError: true },
      ],
    }));
  },

  rate: async (id, rating) => {
    const msg = get().messages.find((m) => m.id === id);
    // Una sola vez por mensaje, y solo respuestas del servidor con log_id.
    if (!msg || msg.logId === undefined || msg.rating !== undefined) return false;
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, rating } : m)) }));
    const ok = await rateChatReply(msg.logId, rating);
    if (!ok) {
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, rating: undefined } : m)) }));
    }
    return ok;
  },

  newConversation: () => {
    conversation += 1;
    set((s) => ({ messages: [greeting(s.messages.find((m) => m.isGreeting)?.text)], sending: false }));
  },
}));

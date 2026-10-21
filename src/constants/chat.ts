/** Textos y límites del chat con IA del Home (ver FASE1_SIN_COMPRA.md, sección 10). */

export const CHAT_NAME = 'Boticuy IA Agente';

/**
 * Saludos iniciales del chat, según la hora y el día en Lima. Se elige uno al azar de la
 * lista del momento (más los extras de viernes o fin de semana) al iniciar una conversación
 * y otro al tocar "Nueva conversación" (ver store/chatStore.ts). El saludo es local y nunca
 * entra al historial que se envía al servidor.
 */
export const CHAT_GREETINGS_MORNING: readonly string[] = [
  '¡Buenos días! ☀️ ¿Cómo amaneciste? Cuéntame qué necesitas — el wifi lento no lo arreglo, tu salud sí.',
  '¡Arriba, valiente! ☀️ Dime cómo te sientes y te ayudo a arrancar el día a full.',
  '¡Buen día, mi soli! 🐹 ¿Qué te anda pasando hoy?',
];
export const CHAT_GREETINGS_AFTERNOON: readonly string[] = [
  '¡Buenas tardes! 🌤️ Cuéntame qué necesitas — el wifi lento no lo arreglo, tu salud sí.',
  '¿Cómo va el día? 🐹 Suéltame lo que te duele o lo que buscas y lo resolvemos.',
  '¡Hola, bb! 💙 ¿Qué se te ofrece esta tarde?',
];
export const CHAT_GREETINGS_NIGHT: readonly string[] = [
  '¡Buenas noches! 🌙 ¿Cómo estás? Cuéntame qué necesitas — el wifi lento no lo arreglo, tu salud sí.',
  'Noche de pacientes y desvelados 🦉 Dime qué te pasa y vemos qué te ayuda.',
  '¡Hola, bb! 🌙 ¿No puedes dormir o qué se te ofrece?',
];
export const CHAT_GREETING_FRIDAY = '¡Viernes, causa! 🎉 ¿Cómo llegas a fin de semana? Cuéntame qué necesitas.';
export const CHAT_GREETING_WEEKEND = '¡Feliz finde! 😎 Aquí Boticuy atiende hasta los domingos. ¿Qué necesitas?';

/**
 * Lista de saludos que corresponde a un instante, con la hora de Lima (UTC-5 todo el año,
 * sin horario de verano), sin depender de la zona horaria del teléfono.
 * Mañana 5:00–11:59, tarde 12:00–18:59, noche 19:00–4:59. Los extras se suman a la lista.
 */
export function greetingsFor(now: Date = new Date()): string[] {
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const hour = lima.getUTCHours();
  const day = lima.getUTCDay(); // 0 domingo … 5 viernes, 6 sábado
  const base = hour >= 5 && hour < 12 ? CHAT_GREETINGS_MORNING : hour >= 12 && hour < 19 ? CHAT_GREETINGS_AFTERNOON : CHAT_GREETINGS_NIGHT;
  const out = [...base];
  if (day === 5 && hour >= 12) out.push(CHAT_GREETING_FRIDAY);
  if (day === 0 || day === 6) out.push(CHAT_GREETING_WEEKEND);
  return out;
}

/** Sugerencias de inicio: se muestra el emoji y el texto, pero solo el texto se envía. */
export interface ChatSuggestion {
  emoji: string;
  text: string;
}
export const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
  { emoji: '🤕', text: 'Me duele la cabeza' },
  { emoji: '⚡', text: 'Estoy sin energía' },
  { emoji: '🛡️', text: 'Me da gripe seguido' },
  { emoji: '😴', text: 'No duermo bien' },
  { emoji: '🧴', text: 'Quiero cuidar mi piel' },
  { emoji: '🦴', text: 'Me duelen las rodillas' },
  { emoji: '🍽️', text: 'Tengo mala digestión' },
  { emoji: '👶', text: 'Algo para mi hijo' },
  { emoji: '🎁', text: 'Un regalo para mamá' },
  { emoji: '🔥', text: 'Qué es Full-VAT?' },
  { emoji: '💪', text: 'Quiero rendir más en el gym' },
  { emoji: '🧠', text: 'Me cuesta concentrarme' },
  { emoji: '😮‍💨', text: 'Estoy muy estresado' },
  { emoji: '🐹', text: 'Qué merch tienen?' },
  { emoji: '🎤', text: '¿Quién eres, Boticuy?' },
];
export const CHAT_SUGGESTIONS_VISIBLE = 4;
export const CHAT_SUGGESTIONS_ROTATE_MS = 4500;

/** Aviso visible de que es una IA. Se mantiene en pantalla. */
export const CHAT_AI_NOTICE = 'Boticuy IA Agente es una inteligencia artificial y puede cometer errores.';

/** Límite del campo del app (el servidor acepta hasta 500; la web usa 300). */
export const CHAT_MAX_MESSAGE_LENGTH = 300;

/** El servidor usa los últimos 10 turnos; el app no manda más. */
export const CHAT_MAX_HISTORY_TURNS = 10;
/** Longitud máxima de un turno del historial (se recorta, nunca se manda sin límite). */
export const CHAT_MAX_TURN_LENGTH = 1000;

/** Tiempo máximo de espera: el servidor puede tardar hasta unos 60 s en el peor caso. */
export const CHAT_TIMEOUT_MS = 70000;

export const CHAT_WHATSAPP_MESSAGE = 'Hola Boticuy, necesito ayuda.';

export const CHAT_ERROR_RATE_LIMIT = 'Llegaste al límite de mensajes por ahora. Inténtalo más tarde o escríbenos por WhatsApp.';
export const CHAT_ERROR_GENERIC = 'No pudimos responder en este momento. Inténtalo de nuevo o escríbenos por WhatsApp.';
export const CHAT_ERROR_NETWORK = 'No hay conexión o el servidor tardó demasiado. Inténtalo de nuevo o escríbenos por WhatsApp.';

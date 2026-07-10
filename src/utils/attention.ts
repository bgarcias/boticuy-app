/**
 * Lógica de horario de atención de Boticuy (hora Lima, UTC-5).
 * Atención humana: Lunes a Viernes, 9:00–18:00, sin feriados peruanos.
 * Nunca bloquea la compra: solo informa cuándo se gestionará el pedido.
 */

const OPEN_HOUR = 9;
const CLOSE_HOUR = 18;

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Feriados peruanos (MM-DD). Año-agnóstico para las fechas fijas.
const FERIADOS = new Set([
  '01-01', // Año Nuevo
  '04-02', // Jueves Santo
  '04-03', // Viernes Santo
  '05-01', // Día del Trabajo
  '06-29', // San Pedro y San Pablo
  '07-28', // Fiestas Patrias
  '07-29', // Fiestas Patrias
  '08-30', // Santa Rosa de Lima
  '10-08', // Combate de Angamos
  '11-01', // Todos los Santos
  '12-08', // Inmaculada Concepción
  '12-09', // Batalla de Ayacucho
  '12-25', // Navidad
]);

/** Hora actual en Lima, independiente de la zona del dispositivo. */
function limaNow(): Date {
  const d = new Date();
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utcMs + -5 * 60 * 60000);
}

function mmdd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isHoliday(d: Date): boolean {
  return FERIADOS.has(mmdd(d));
}

function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5 && !isHoliday(d);
}

function isOpen(d: Date): boolean {
  const t = d.getHours() + d.getMinutes() / 60;
  return isBusinessDay(d) && t >= OPEN_HOUR && t < CLOSE_HOUR;
}

/** Próximo momento de apertura (9:00 a.m. del próximo día hábil). */
function nextOpening(now: Date): Date {
  const t = now.getHours() + now.getMinutes() / 60;
  const cand = new Date(now);
  // Hoy es hábil y aún no abre → hoy a las 9.
  if (isBusinessDay(now) && t < OPEN_HOUR) {
    cand.setHours(OPEN_HOUR, 0, 0, 0);
    return cand;
  }
  // Si no, avanzar al próximo día hábil.
  cand.setDate(cand.getDate() + 1);
  while (!isBusinessDay(cand)) cand.setDate(cand.getDate() + 1);
  cand.setHours(OPEN_HOUR, 0, 0, 0);
  return cand;
}

/** Etiqueta relativa: "hoy", "mañana" o "el lunes". */
function dayLabel(from: Date, to: Date): string {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  return `el ${WEEKDAYS[to.getDay()]}`;
}

/** Mensaje para la confirmación de pedido. */
export function orderHandlingMessage(): { open: boolean; text: string } {
  const now = limaNow();
  if (isOpen(now)) {
    return { open: true, text: 'Estamos en línea: empezamos a gestionar tu pedido hoy mismo.' };
  }
  const label = dayLabel(now, nextOpening(now));
  return { open: false, text: `Gestionaremos tu pedido ${label} a partir de las 9:00 a.m.` };
}

/** Estado corto de atención (para Mi cuenta). */
export function attentionStatus(): { online: boolean; text: string } {
  const now = limaNow();
  if (isOpen(now)) return { online: true, text: 'En línea ahora' };
  const label = dayLabel(now, nextOpening(now));
  return { online: false, text: `Te respondemos ${label} desde las 9:00 a.m.` };
}

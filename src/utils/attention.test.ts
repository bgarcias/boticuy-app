import { easterSunday, isHoliday } from './attention';

// Domingos de Pascua reales, verificados de forma independiente (calendario
// gregoriano) — no derivados del propio algoritmo bajo prueba.
const KNOWN_EASTER_SUNDAYS: Record<number, [number, number]> = {
  2024: [3, 31], // 31 de marzo
  2025: [4, 20], // 20 de abril
  2026: [4, 5], // 5 de abril
  2027: [3, 28], // 28 de marzo
  2028: [4, 16], // 16 de abril
};

// Jueves y Viernes Santo derivados de esas fechas reales (Pascua − 3 y − 2 días).
const KNOWN_HOLY_THURSDAY_FRIDAY: Record<number, { jueves: [number, number]; viernes: [number, number] }> = {
  2024: { jueves: [3, 28], viernes: [3, 29] },
  2025: { jueves: [4, 17], viernes: [4, 18] },
  2026: { jueves: [4, 2], viernes: [4, 3] },
  2027: { jueves: [3, 25], viernes: [3, 26] },
  2028: { jueves: [4, 13], viernes: [4, 14] },
};

describe('utils/attention — Semana Santa (feriado móvil)', () => {
  test.each(Object.entries(KNOWN_EASTER_SUNDAYS))(
    'easterSunday(%s) calcula el Domingo de Pascua real',
    (year, [month, day]) => {
      const easter = easterSunday(Number(year));
      expect(easter.getMonth()).toBe(month - 1);
      expect(easter.getDate()).toBe(day);
    }
  );

  test.each(Object.entries(KNOWN_HOLY_THURSDAY_FRIDAY))(
    'isHoliday() reconoce Jueves y Viernes Santo del año %s',
    (year, { jueves, viernes }) => {
      const y = Number(year);
      expect(isHoliday(new Date(y, jueves[0] - 1, jueves[1]))).toBe(true);
      expect(isHoliday(new Date(y, viernes[0] - 1, viernes[1]))).toBe(true);
    }
  );

  test('Jueves/Viernes Santo NO caen siempre en 04-02/04-03 (confirma que ya no está hardcodeado)', () => {
    // 2026 sí cae en 04-02/04-03 (coincidencia, es el año que exponía el bug
    // original), pero 2025 y 2027 no — si el cálculo fuera la fecha fija
    // anterior, estos años fallarían.
    expect(isHoliday(new Date(2025, 3, 2))).toBe(false); // 2 de abril de 2025, NO es feriado
    expect(isHoliday(new Date(2027, 3, 2))).toBe(false); // 2 de abril de 2027, NO es feriado
    expect(isHoliday(new Date(2025, 3, 17))).toBe(true); // Jueves Santo real de 2025
    expect(isHoliday(new Date(2027, 2, 25))).toBe(true); // Jueves Santo real de 2027
  });

  test('el día anterior a Jueves Santo no se marca como feriado (sin sobre-match)', () => {
    expect(isHoliday(new Date(2026, 3, 1))).toBe(false); // 1 de abril de 2026
  });

  test('los feriados de fecha fija siguen funcionando en cualquier año (año-agnóstico)', () => {
    expect(isHoliday(new Date(2024, 11, 25))).toBe(true); // Navidad
    expect(isHoliday(new Date(2030, 11, 25))).toBe(true); // Navidad, año arbitrario
    expect(isHoliday(new Date(2026, 0, 1))).toBe(true); // Año Nuevo
  });

  test('un día laboral normal no es feriado', () => {
    expect(isHoliday(new Date(2026, 5, 15))).toBe(false); // 15 de junio de 2026
  });
});

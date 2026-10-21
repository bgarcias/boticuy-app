import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'boticuy-chat-device';
let cached: string | null = null;

/** UUID v4 con Math.random: identifica la instalación, no necesita ser criptográfico ni lleva datos personales. */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

/**
 * Identificador aleatorio por instalación (cabecera X-Boticuy-Device), generado
 * una vez y guardado en AsyncStorage (no sobrevive a una reinstalación). Si el
 * almacenamiento falla, se usa uno en memoria durante la sesión.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    /* sin almacenamiento: se genera uno en memoria */
  }
  cached = generateUuid();
  try {
    await AsyncStorage.setItem(KEY, cached);
  } catch {
    /* noop */
  }
  return cached;
}

/** Solo para tests. */
export function __resetDeviceIdCache() {
  cached = null;
}

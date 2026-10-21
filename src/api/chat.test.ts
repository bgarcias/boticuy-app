import { chatClient, sendChatMessage, rateChatReply } from './chat';

jest.mock('../config/features', () => ({
  CHAT_URL: 'https://boticuy.com/wp-admin/admin-ajax.php',
  CHAT_RATE_URL: 'https://boticuy.com/wp-json/botichat/v1/rate',
  CHAT_APP_KEY: 'clave-de-prueba-no-real',
}));

type Cfg = { url?: string; data?: unknown; headers: unknown };
let seen: Cfg | null = null;

const respond = (status: number, data: unknown) => {
  chatClient.defaults.adapter = async (config) => {
    seen = config as unknown as Cfg;
    return { data, status, statusText: '', headers: {}, config };
  };
};
const header = (name: string) => (seen!.headers as { get: (n: string) => unknown }).get(name);
const decode = (body: string) => {
  const out: Record<string, string> = {};
  body.split('&').forEach((p) => {
    const [k, v] = p.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  return out;
};

beforeEach(() => {
  seen = null;
});

describe('sendChatMessage', () => {
  it('manda un cuerpo form-urlencoded como string, con las cabeceras del app', async () => {
    respond(200, { success: true, data: { reply: 'Hola', log_id: 7 } });
    const r = await sendChatMessage('¿Qué vitamina?', [{ role: 'user', text: 'a' }]);
    expect(r).toEqual({ ok: true, reply: 'Hola', logId: 7 });
    expect(seen!.url).toBe('https://boticuy.com/wp-admin/admin-ajax.php');
    expect(typeof seen!.data).toBe('string');
    const params = decode(seen!.data as string);
    expect(params.action).toBe('boticuy_chat_dev');
    expect(params.message).toBe('¿Qué vitamina?');
    expect(JSON.parse(params.history)).toEqual([{ role: 'user', text: 'a' }]);
    expect(String(header('Content-Type'))).toContain('application/x-www-form-urlencoded');
    expect(String(header('X-Boticuy-Device'))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(header('X-Boticuy-App')).toBe('clave-de-prueba-no-real');
    expect(header('Authorization')).toBeUndefined();
  });

  it('recorta el mensaje a 300 caracteres', async () => {
    respond(200, { success: true, data: { reply: 'ok' } });
    await sendChatMessage('x'.repeat(900), []);
    expect(decode(seen!.data as string).message).toHaveLength(300);
  });

  it.each([400, 429, 502])('con %s muestra data.reply del servidor', async (status) => {
    respond(status, { success: false, data: { reply: 'Texto del servidor' } });
    expect(await sendChatMessage('hola', [])).toEqual({ ok: false, reply: 'Texto del servidor' });
  });

  it('sin data.reply usa un mensaje amable (429 distinto del resto)', async () => {
    respond(429, '<html>');
    const a = await sendChatMessage('hola', []);
    respond(502, '<html>');
    const b = await sendChatMessage('hola', []);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(a.reply).not.toBe(b.reply);
  });

  it('un fallo de red devuelve un mensaje amable, sin lanzar', async () => {
    chatClient.defaults.adapter = async () => {
      throw new Error('Network Error');
    };
    const r = await sendChatMessage('hola', []);
    expect(r.ok).toBe(false);
    expect(r.reply).toMatch(/WhatsApp/);
  });
});

describe('rateChatReply', () => {
  it('manda log_id y rating form-urlencoded solo a /rate', async () => {
    respond(200, { success: true });
    expect(await rateChatReply(123, -1)).toBe(true);
    expect(seen!.url).toBe('https://boticuy.com/wp-json/botichat/v1/rate');
    const params = decode(seen!.data as string);
    expect(params.log_id).toBe('123');
    expect(params.rating).toBe('-1');
  });

  it('devuelve false ante un error', async () => {
    respond(500, {});
    expect(await rateChatReply(1, 1)).toBe(false);
  });
});

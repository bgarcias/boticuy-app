import { encodeFormBody, buildHistory } from './chatProtocol';
import type { ChatMessage } from './chatProtocol';

describe('encodeFormBody', () => {
  it('codifica claves y valores y los une con &', () => {
    expect(encodeFormBody({ action: 'a b', message: 'ñandú & 100%', n: 3 })).toBe('action=a%20b&message=%C3%B1and%C3%BA%20%26%20100%25&n=3');
  });
  it('un JSON con comillas y corchetes viaja codificado', () => {
    const body = encodeFormBody({ history: JSON.stringify([{ role: 'user', text: 'hola "x"' }]) });
    expect(body).not.toMatch(/[[\]{}" ]/);
    const raw = decodeURIComponent(body.split('=')[1]);
    expect(JSON.parse(raw)).toEqual([{ role: 'user', text: 'hola "x"' }]);
  });
});

const m = (over: Partial<ChatMessage> & { id: number }): ChatMessage => ({ role: 'user', text: 'x', ...over });

describe('buildHistory', () => {
  it('excluye el saludo local y los errores, y traduce bot → model', () => {
    const h = buildHistory([
      m({ id: 1, role: 'bot', text: 'Hola', isGreeting: true }),
      m({ id: 2, text: 'Pregunta' }),
      m({ id: 3, role: 'bot', text: 'Respuesta' }),
      m({ id: 4, role: 'bot', text: 'Falló', isError: true }),
    ]);
    expect(h).toEqual([
      { role: 'user', text: 'Pregunta' },
      { role: 'model', text: 'Respuesta' },
    ]);
  });
  it('descarta turnos vacíos o con rol inválido y recorta los largos', () => {
    const h = buildHistory([
      m({ id: 1, text: '   ' }),
      m({ id: 2, role: 'system' as never, text: 'x' }),
      m({ id: 3, text: 'a'.repeat(5000) }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].text).toHaveLength(1000);
  });
  it('manda como máximo los últimos 10 turnos', () => {
    const msgs = Array.from({ length: 15 }, (_, i) => m({ id: i, text: `t${i}` }));
    const h = buildHistory(msgs);
    expect(h).toHaveLength(10);
    expect(h[0].text).toBe('t5');
    expect(h[9].text).toBe('t14');
  });
});

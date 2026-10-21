import { useChat } from './chatStore';
import * as chatApi from '../api/chat';
import { greetingsFor } from '../constants/chat';

const CHAT_GREETINGS = greetingsFor();

jest.mock('../api/chat');
const api = chatApi as jest.Mocked<typeof chatApi>;

beforeEach(() => {
  jest.resetAllMocks();
  useChat.getState().newConversation();
});

describe('chatStore', () => {
  it('arranca con un saludo local de la lista', () => {
    const { messages } = useChat.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'bot', isGreeting: true });
    expect(CHAT_GREETINGS).toContain(messages[0].text);
  });

  it('los saludos dependen de la hora y el día de Lima (UTC-5)', () => {
    const lima = (iso: string) => greetingsFor(new Date(iso)); // iso en UTC
    // Miércoles 2026-10-21: 10:00 Lima = 15:00 UTC → mañana (3); 12:00 Lima → tarde (3); 19:00 → noche (3); 04:59 → noche
    expect(lima('2026-10-21T15:00:00Z')).toHaveLength(3);
    expect(lima('2026-10-21T15:00:00Z')[0]).toContain('Buenos días');
    expect(lima('2026-10-21T17:00:00Z')[0]).toContain('Buenas tardes');
    expect(lima('2026-10-22T00:00:00Z')[0]).toContain('Buenas noches');
    expect(lima('2026-10-21T09:59:00Z')[0]).toContain('Buenas noches');
    expect(lima('2026-10-21T10:00:00Z')[0]).toContain('Buenos días');
    // Viernes 2026-10-23: extra solo desde las 12:00 Lima
    expect(lima('2026-10-23T16:59:00Z')).toHaveLength(3);
    expect(lima('2026-10-23T17:00:00Z')).toHaveLength(4);
    // Sábado y domingo: extra de finde. Sábado 02:00 Lima (UTC 07:00) sigue siendo sábado.
    expect(lima('2026-10-24T07:00:00Z')).toHaveLength(4);
    expect(lima('2026-10-25T17:00:00Z')).toHaveLength(4);
    // Lunes 00:30 Lima ya no es domingo
    expect(lima('2026-10-26T05:30:00Z')).toHaveLength(3);
  });

  it('el saludo no cambia durante la conversación y "Nueva conversación" elige otro', async () => {
    const first = useChat.getState().messages[0].text;
    api.sendChatMessage.mockResolvedValueOnce({ ok: true, reply: 'R', logId: 1 });
    await useChat.getState().send('P');
    expect(useChat.getState().messages[0].text).toBe(first);
    for (let i = 0; i < 30; i++) {
      const before = useChat.getState().messages[0].text;
      useChat.getState().newConversation();
      const after = useChat.getState().messages[0].text;
      expect(CHAT_GREETINGS).toContain(after);
      expect(after).not.toBe(before);
    }
  });

  it('manda el historial previo (sin saludo ni mensaje actual) y guarda la respuesta con su log_id', async () => {
    api.sendChatMessage.mockResolvedValueOnce({ ok: true, reply: 'R1', logId: 11 });
    await useChat.getState().send('P1');
    expect(api.sendChatMessage).toHaveBeenLastCalledWith('P1', []);

    api.sendChatMessage.mockResolvedValueOnce({ ok: true, reply: 'R2', logId: 12 });
    await useChat.getState().send('P2');
    expect(api.sendChatMessage).toHaveBeenLastCalledWith('P2', [
      { role: 'user', text: 'P1' },
      { role: 'model', text: 'R1' },
    ]);
    expect(useChat.getState().messages.map((m) => m.text)).toEqual([useChat.getState().messages[0].text, 'P1', 'R1', 'P2', 'R2']);
  });

  it('un error se muestra pero no entra en el historial', async () => {
    api.sendChatMessage.mockResolvedValueOnce({ ok: false, reply: 'Falló' });
    await useChat.getState().send('P1');
    expect(useChat.getState().messages[2]).toMatchObject({ text: 'Falló', isError: true });
    api.sendChatMessage.mockResolvedValueOnce({ ok: true, reply: 'R', logId: 1 });
    await useChat.getState().send('P2');
    expect(api.sendChatMessage).toHaveBeenLastCalledWith('P2', [{ role: 'user', text: 'P1' }]);
  });

  it('ignora mensajes vacíos y no manda dos a la vez', async () => {
    await useChat.getState().send('   ');
    expect(api.sendChatMessage).not.toHaveBeenCalled();
    let resolve!: (v: chatApi.ChatReply) => void;
    api.sendChatMessage.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = useChat.getState().send('uno');
    await useChat.getState().send('dos');
    expect(api.sendChatMessage).toHaveBeenCalledTimes(1);
    resolve({ ok: true, reply: 'ok' });
    await first;
  });

  it('una respuesta que llega después de "Nueva conversación" se descarta', async () => {
    let resolve!: (v: chatApi.ChatReply) => void;
    api.sendChatMessage.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const pending = useChat.getState().send('hola');
    useChat.getState().newConversation();
    resolve({ ok: true, reply: 'tarde', logId: 1 });
    await pending;
    expect(useChat.getState().messages).toHaveLength(1);
    expect(useChat.getState().sending).toBe(false);
  });

  it('valora una sola vez por mensaje, y revierte si el envío falla', async () => {
    api.sendChatMessage.mockResolvedValueOnce({ ok: true, reply: 'R', logId: 5 });
    await useChat.getState().send('P');
    const id = useChat.getState().messages[2].id;

    api.rateChatReply.mockResolvedValueOnce(false);
    expect(await useChat.getState().rate(id, 1)).toBe(false);
    expect(useChat.getState().messages[2].rating).toBeUndefined();

    api.rateChatReply.mockResolvedValueOnce(true);
    expect(await useChat.getState().rate(id, -1)).toBe(true);
    expect(api.rateChatReply).toHaveBeenLastCalledWith(5, -1);
    expect(await useChat.getState().rate(id, 1)).toBe(false);
    expect(api.rateChatReply).toHaveBeenCalledTimes(2);
  });

  it('no se puede valorar el saludo', async () => {
    expect(await useChat.getState().rate(useChat.getState().messages[0].id, 1)).toBe(false);
    expect(api.rateChatReply).not.toHaveBeenCalled();
  });
});

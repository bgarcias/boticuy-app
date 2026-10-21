import { parseHttpUrl, validateUrl, validateChatUrl, withUtmSource, buildStoreUrl, storeUrlPolicy, CHAT_LINK_POLICY } from './safeUrl';

const prod = storeUrlPolicy('https://boticuy.com/wp-json/wc/store/v1', true);
const staging = storeUrlPolicy('http://203.0.113.10/wp-json/wc/store/v1', false);

describe('buildStoreUrl', () => {
  it('agrega utm_source=app al permalink de la tienda', () => {
    expect(buildStoreUrl('https://boticuy.com/producto/vitamina-c/', prod)).toBe('https://boticuy.com/producto/vitamina-c/?utm_source=app');
  });

  it('conserva parámetros y fragmento, y reemplaza un utm_source previo', () => {
    expect(buildStoreUrl('https://boticuy.com/p/?a=1&utm_source=otro&b=2#x', prod)).toBe(
      'https://boticuy.com/p/?a=1&b=2&utm_source=app#x'
    );
  });

  it('completa la ruta si falta', () => {
    expect(buildStoreUrl('https://boticuy.com', prod)).toBe('https://boticuy.com/?utm_source=app');
  });

  it.each([
    'http://boticuy.com/p/',
    'https://boticuy.com.otro.com/p/',
    'https://otro.com/boticuy.com/',
    'https://usuario@boticuy.com/p/',
    'https://usuario:clave@boticuy.com/p/',
    'https://boticuy.com:8443/p/',
    'https://boticuy.com@evil.com/p/',
    'https://www.boticuy.com/p/',
    'https://boticuy.com\\@evil.com/',
    'https://boticuy.com/p/ x',
    'javascript:alert(1)',
    'intent://boticuy.com#Intent;end',
    'https://',
    '',
  ])('rechaza %s', (u) => {
    expect(buildStoreUrl(u, prod)).toBeNull();
  });

  it('rechaza null y undefined', () => {
    expect(buildStoreUrl(null, prod)).toBeNull();
    expect(buildStoreUrl(undefined, prod)).toBeNull();
  });

  it('compara el host sin distinguir mayúsculas', () => {
    expect(buildStoreUrl('HTTPS://BOTICUY.COM/p/', prod)).toBe('https://boticuy.com/p/?utm_source=app');
  });

  it('en builds que no son de producción acepta el host de staging por http, y en producción no', () => {
    const url = 'http://203.0.113.10/producto/x/';
    expect(buildStoreUrl(url, staging)).toBe('http://203.0.113.10/producto/x/?utm_source=app');
    expect(buildStoreUrl(url, prod)).toBeNull();
    expect(buildStoreUrl('http://203.0.113.11/producto/x/', staging)).toBeNull();
  });
});

describe('validateUrl con la lista del chat', () => {
  it.each(['https://boticuy.com/x', 'https://drflu.pe/'])('acepta %s', (u) => {
    expect(validateUrl(u, CHAT_LINK_POLICY)).not.toBeNull();
  });

  it.each(['https://evil.com', 'http://boticuy.com', 'https://drflu.pe.evil.com', 'https://wa.me:444/x', 'https://sub.boticuy.com/', 'https://wa.me/51950557599'])(
    'rechaza %s',
    (u) => {
      expect(validateUrl(u, CHAT_LINK_POLICY)).toBeNull();
    }
  );
});

describe('parseHttpUrl / withUtmSource', () => {
  it('separa ruta, consulta y fragmento', () => {
    expect(parseHttpUrl('https://a.com/b/c?d=1#e')).toEqual({ scheme: 'https', host: 'a.com', path: '/b/c', query: 'd=1', hash: '#e' });
  });
  it('withUtmSource rechaza URLs inválidas', () => {
    expect(withUtmSource('no es url', 'app')).toBeNull();
  });
});

describe('validateChatUrl: wa.me solo hacia el número oficial', () => {
  const N = '51950557599';

  it.each([
    'https://wa.me/51950557599',
    'https://wa.me/51950557599/',
    'https://wa.me/51950557599?text=hola',
    'https://wa.me/51950557599?text=Hola%20Boticuy%2C%20quiero%20ayuda&utm_source=chat',
    'https://wa.me/51950557599?text=hola#x',
    'HTTPS://WA.ME/51950557599?text=hola',
  ])('acepta %s', (u) => {
    expect(validateChatUrl(u, N)).not.toBeNull();
  });

  it('normaliza el esquema y el host a minúsculas', () => {
    expect(validateChatUrl('HTTPS://WA.ME/51950557599?text=hola', N)).toBe('https://wa.me/51950557599?text=hola');
  });

  it('un espacio al final se recorta y no cambia el destino', () => {
    expect(validateChatUrl('https://wa.me/51950557599 ', N)).toBe('https://wa.me/51950557599');
  });

  it.each([
    'https://wa.me/51999999999',
    'https://wa.me/51999999999?text=hola',
    'https://wa.me/',
    'https://wa.me',
    'https://wa.me/?text=hola',
    'https://wa.me/5195055759',
    'https://wa.me/519505575990',
    'https://wa.me/51950557599x',
    'https://wa.me/51950557599/otro',
    'https://wa.me//51950557599',
    'https://wa.me/+51950557599',
    'https://wa.me/51950557599%20',
    'https://wa.me/%35%31950557599',
    'https://wa.me/message/ABCDEF',
    'https://wa.me/send?phone=51950557599',
    'https://wa.me/51999999999?text=51950557599',
    'https://wa.me/51999999999/51950557599',
  ])('rechaza %s (otro número o forma engañosa)', (u) => {
    expect(validateChatUrl(u, N)).toBeNull();
  });

  it.each([
    'http://wa.me/51950557599',
    'https://usuario@wa.me/51950557599',
    'https://wa.me@evil.com/51950557599',
    'https://evil.com@wa.me/51950557599',
    'https://wa.me:443/51950557599',
    'https://wa.me.evil.com/51950557599',
    'https://evil-wa.me/51950557599',
    'https://www.wa.me/51950557599',
    'https://api.whatsapp.com/send?phone=51950557599',
    'https://whatsapp.com/51950557599',
    'https://wa.me\\@evil.com/51950557599',
    'https://wа.me/51950557599',
    'javascript:alert(1)',
  ])('rechaza %s (host o esquema no permitido)', (u) => {
    expect(validateChatUrl(u, N)).toBeNull();
  });

  it('sin número configurado no abre ningún wa.me', () => {
    expect(validateChatUrl('https://wa.me/51950557599', '')).toBeNull();
    expect(validateChatUrl('https://wa.me/', '')).toBeNull();
  });

  it('el número configurado puede traer + y espacios', () => {
    expect(validateChatUrl('https://wa.me/51950557599?text=x', '+51 950 557 599')).not.toBeNull();
  });

  it('usa el número que se le pasa, no uno fijo', () => {
    expect(validateChatUrl('https://wa.me/51111111111', '51111111111')).not.toBeNull();
    expect(validateChatUrl('https://wa.me/51950557599', '51111111111')).toBeNull();
  });

  it('boticuy.com y drflu.pe no cambian', () => {
    expect(validateChatUrl('https://boticuy.com/producto/x/', N)).toBe('https://boticuy.com/producto/x/');
    expect(validateChatUrl('https://drflu.pe/', N)).toBe('https://drflu.pe/');
    expect(validateChatUrl('https://boticuy.com.evil.com/', N)).toBeNull();
    expect(validateChatUrl('https://sub.boticuy.com/', N)).toBeNull();
    expect(validateChatUrl('http://boticuy.com/', N)).toBeNull();
  });
});

import { parseChatText } from './chatText';

describe('parseChatText', () => {
  it('texto plano sin marcas queda igual', () => {
    expect(parseChatText('Hola, ¿cómo estás?')).toEqual([{ text: 'Hola, ¿cómo estás?' }]);
  });

  it('negrita', () => {
    expect(parseChatText('Toma **vitamina C** al día')).toEqual([
      { text: 'Toma ' },
      { text: 'vitamina C', bold: true },
      { text: ' al día' },
    ]);
  });

  it('negrita sin cerrar se deja literal', () => {
    expect(parseChatText('mira **esto')).toEqual([{ text: 'mira **esto' }]);
  });

  it('enlace markdown permitido', () => {
    expect(parseChatText('Ver [la tienda](https://boticuy.com/producto/x/) hoy')).toEqual([
      { text: 'Ver ' },
      { text: 'la tienda', url: 'https://boticuy.com/producto/x/' },
      { text: ' hoy' },
    ]);
  });

  it('enlace markdown a un dominio no permitido: sin enlace, se ve el destino', () => {
    expect(parseChatText('[clic aquí](https://evil.com/x)')).toEqual([{ text: 'clic aquí (https://evil.com/x)' }]);
  });

  it('un javascript: o un http no se enlazan', () => {
    expect(parseChatText('[x](javascript:alert(1))').some((s) => s.url)).toBe(false);
    expect(parseChatText('[x](http://boticuy.com/)').some((s) => s.url)).toBe(false);
  });

  it('URL suelta: se quita la puntuación final antes de enlazar', () => {
    expect(parseChatText('Escríbenos: https://wa.me/51950557599.')).toEqual([
      { text: 'Escríbenos: ' },
      { text: 'https://wa.me/51950557599', url: 'https://wa.me/51950557599' },
      { text: '.' },
    ]);
    expect(parseChatText('(ver https://drflu.pe/).')).toEqual([
      { text: '(ver ' },
      { text: 'https://drflu.pe/', url: 'https://drflu.pe/' },
      { text: ').' },
    ]);
  });

  it('URL suelta de otro dominio queda como texto', () => {
    expect(parseChatText('https://boticuy.com.evil.com/a')).toEqual([{ text: 'https://boticuy.com.evil.com/a' }]);
  });

  it('enlace dentro de negrita conserva ambas marcas', () => {
    expect(parseChatText('**[ir](https://boticuy.com/)**')).toEqual([{ text: 'ir', bold: true, url: 'https://boticuy.com/' }]);
  });

  it('nunca interpreta HTML: se devuelve como texto', () => {
    const html = '<a href="https://evil.com">x</a>';
    const segs = parseChatText(html);
    expect(segs.map((s) => s.text).join('')).toBe(html);
    expect(segs.some((s) => s.url)).toBe(false);
  });
});

describe('parseChatText: wa.me', () => {
  const N = '51950557599';

  it('enlace markdown al número oficial, con y sin parámetros, es tocable', () => {
    expect(parseChatText('[Escríbenos](https://wa.me/51950557599?text=Hola)', N)).toEqual([
      { text: 'Escríbenos', url: 'https://wa.me/51950557599?text=Hola' },
    ]);
    expect(parseChatText('[Escríbenos](https://wa.me/51950557599)', N)).toEqual([
      { text: 'Escríbenos', url: 'https://wa.me/51950557599' },
    ]);
  });

  it('URL suelta al número oficial, con el texto prellenado, es tocable', () => {
    expect(parseChatText('Escribe a https://wa.me/51950557599?text=Hola.', N)).toEqual([
      { text: 'Escribe a ' },
      { text: 'https://wa.me/51950557599?text=Hola', url: 'https://wa.me/51950557599?text=Hola' },
      { text: '.' },
    ]);
  });

  it('otro número: el texto del enlace se ve junto al destino y no es tocable', () => {
    expect(parseChatText('[Soporte Boticuy](https://wa.me/51999999999?text=Hola)', N)).toEqual([
      { text: 'Soporte Boticuy (https://wa.me/51999999999?text=Hola)' },
    ]);
  });

  it('otro número como URL suelta: texto plano', () => {
    expect(parseChatText('https://wa.me/51999999999', N)).toEqual([{ text: 'https://wa.me/51999999999' }]);
  });

  it.each([
    'https://wa.me/51950557599x',
    'https://wa.me/51950557599/otro',
    'https://wa.me/+51950557599',
    'https://wa.me@evil.com/51950557599',
    'https://usuario@wa.me/51950557599',
    'https://wa.me.evil.com/51950557599',
    'HTTP://WA.ME/51950557599',
  ])('variante engañosa %s no es tocable', (u) => {
    expect(parseChatText(`[ayuda](${u})`, N).some((s) => s.url)).toBe(false);
    expect(parseChatText(u, N).some((s) => s.url)).toBe(false);
  });

  it('mayúsculas en el esquema y el host del número oficial llegan normalizadas', () => {
    expect(parseChatText('[ok](HTTPS://WA.ME/51950557599?text=a)', N)).toEqual([
      { text: 'ok', url: 'https://wa.me/51950557599?text=a' },
    ]);
  });

  it('boticuy.com y drflu.pe siguen igual', () => {
    expect(parseChatText('[a](https://boticuy.com/x/) y [b](https://drflu.pe/)', N).filter((s) => s.url).length).toBe(2);
  });

  it('por defecto toma el número de la configuración del app', () => {
    // en jest la configuración no define `whatsapp` y rige el valor por defecto de features.ts
    expect(parseChatText('https://wa.me/51950557599').some((s) => s.url)).toBe(true);
    expect(parseChatText('https://wa.me/51000000000').some((s) => s.url)).toBe(false);
  });
});

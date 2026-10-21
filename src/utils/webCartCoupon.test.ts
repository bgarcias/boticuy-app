import { buildWebCartUrl, normalizeCouponCode } from './webCart';
import { storeUrlPolicy } from './safeUrl';

const PROD_API = 'https://boticuy.com/wp-json/wc/store/v1';
const STAGING_API = 'http://203.0.113.10/wp-json/wc/store/v1';
const prod = storeUrlPolicy(PROD_API, true);
const staging = storeUrlPolicy(STAGING_API, false);

describe('normalizeCouponCode (solo formato)', () => {
  it.each([
    ['verano10', 'VERANO10'],
    ['  COPA-10_x ', 'COPA-10_X'],
    ['a', 'A'],
    ['x'.repeat(32), 'X'.repeat(32)],
  ])('acepta %j', (input, code) => {
    expect(normalizeCouponCode(input)).toEqual({ ok: true, code });
  });

  it.each(['', '   ', 'a b', 'x'.repeat(33), 'cupón', 'a;b', '<script>', '10%', 'a/b', 'a&b=c', 'ñandú'])('rechaza %j', (input) => {
    expect(normalizeCouponCode(input)).toEqual({ ok: false });
  });
});

describe('cupón en el enlace de la web', () => {
  const line = [{ productId: 12, quantity: 2 }];

  it('viaja como bcy_coupon (en mayúsculas) junto con los productos, nunca como cupon', () => {
    const link = buildWebCartUrl(line, PROD_API, prod, 'verano-10');
    expect(link!.url).toBe('https://boticuy.com/?bcy_cart=12-2&bcy_coupon=VERANO-10&utm_source=app');
    expect(link!.coupon).toBe('VERANO-10');
    expect(link!.url).not.toMatch(/[?&]cupon=/);
  });

  it('sin cupón, el enlace no lleva el parámetro', () => {
    expect(buildWebCartUrl(line, PROD_API, prod)!.url).toBe('https://boticuy.com/?bcy_cart=12-2&utm_source=app');
    expect(buildWebCartUrl(line, PROD_API, prod, '')!.coupon).toBeUndefined();
  });

  it('un código con formato inválido se ignora (el enlace no lo lleva)', () => {
    const link = buildWebCartUrl(line, PROD_API, prod, 'a b&x=1');
    expect(link!.url).toBe('https://boticuy.com/?bcy_cart=12-2&utm_source=app');
    expect(link!.coupon).toBeUndefined();
  });

  it('sin productos válidos no hay enlace, tampoco con cupón', () => {
    expect(buildWebCartUrl([], PROD_API, prod, 'VERANO10')).toBeNull();
  });

  it('funciona igual en staging por http', () => {
    expect(buildWebCartUrl(line, STAGING_API, staging, 'abc')!.url).toBe('http://203.0.113.10/?bcy_cart=12-2&bcy_coupon=ABC&utm_source=app');
  });
});

import { buildWebCartUrl, normalizeLines, webOrigin, WEB_CART_MAX_LINES, WEB_CART_MAX_QTY } from './webCart';
import { buildStoreUrl, storeUrlPolicy } from './safeUrl';

const PROD_API = 'https://boticuy.com/wp-json/wc/store/v1';
const STAGING_API = 'http://203.0.113.10/wp-json/wc/store/v1';
const prod = storeUrlPolicy(PROD_API, true);
const staging = storeUrlPolicy(STAGING_API, false);

describe('buildWebCartUrl', () => {
  it('arma el enlace con ids y cantidades y utm_source=app', () => {
    const link = buildWebCartUrl(
      [
        { productId: 12, quantity: 2 },
        { productId: 34, quantity: 1 },
      ],
      PROD_API,
      prod
    );
    expect(link!.url).toBe('https://boticuy.com/?bcy_cart=12-2,34-1&utm_source=app');
    expect(link!.truncated).toBe(false);
  });

  it('solo viajan ids y cantidades (ni precios ni nombres)', () => {
    const link = buildWebCartUrl([{ productId: 5, quantity: 1, unitPrice: 9.9, name: 'X' } as never], PROD_API, prod);
    expect(link!.url).toBe('https://boticuy.com/?bcy_cart=5-1&utm_source=app');
  });

  it('en builds que no son de producción acepta el host de staging por http (preview)', () => {
    expect(buildWebCartUrl([{ productId: 7, quantity: 3 }], STAGING_API, staging)!.url).toBe('http://203.0.113.10/?bcy_cart=7-3&utm_source=app');
  });

  it('en producción rechaza un host de staging aunque venga en la configuración', () => {
    expect(buildWebCartUrl([{ productId: 7, quantity: 3 }], STAGING_API, prod)).toBeNull();
    expect(webOrigin(STAGING_API, prod)).toBeNull();
  });

  it('rechaza bases engañosas', () => {
    for (const api of ['https://boticuy.com.evil.com/wp-json', 'https://usuario@boticuy.com/wp-json', 'https://boticuy.com:8443/wp-json', 'http://boticuy.com/wp-json', '']) {
      expect(buildWebCartUrl([{ productId: 1, quantity: 1 }], api, prod)).toBeNull();
    }
  });

  it('sin líneas válidas no hay enlace', () => {
    expect(buildWebCartUrl([], PROD_API, prod)).toBeNull();
    expect(buildWebCartUrl([{ productId: 0, quantity: 1 }, { productId: 3, quantity: 0 }], PROD_API, prod)).toBeNull();
  });
});

describe('normalizeLines', () => {
  it('limita cada cantidad al tope, junta ids repetidos y descarta valores inválidos', () => {
    const { lines } = normalizeLines([
      { productId: 1, quantity: 99 },
      { productId: 2, quantity: 2 },
      { productId: 2, quantity: 3 },
      { productId: -4, quantity: 1 },
      { productId: 1.5, quantity: 1 },
      { productId: 9, quantity: NaN },
      { productId: 10, quantity: 2.9 },
    ]);
    expect(lines).toEqual([
      { productId: 1, quantity: WEB_CART_MAX_QTY },
      { productId: 2, quantity: 5 },
      { productId: 10, quantity: 2 },
    ]);
  });

  it('se queda con los primeros 20 productos y avisa que recortó', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ productId: i + 1, quantity: 1 }));
    const { lines, truncated } = normalizeLines(many);
    expect(lines).toHaveLength(WEB_CART_MAX_LINES);
    expect(lines[19].productId).toBe(20);
    expect(truncated).toBe(true);
  });
});

describe('"Ver en la web" (permalink) en preview y producción', () => {
  it('abre el permalink del host de staging por http solo fuera de producción', () => {
    const url = 'http://203.0.113.10/producto/vitamina-c/';
    expect(buildStoreUrl(url, staging)).toBe('http://203.0.113.10/producto/vitamina-c/?utm_source=app');
    expect(buildStoreUrl(url, prod)).toBeNull();
  });
});

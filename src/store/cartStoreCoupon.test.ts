import type { CartItem, AppliedCoupon } from '../types';

type CartModule = typeof import('./cartStore');

const item = (productId: number): CartItem => ({ productId, name: `P${productId}`, image: '', unitPrice: 10, quantity: 1, stockLimit: null });
const webCoupon: AppliedCoupon = { code: 'COPA10', discount_type: 'web', amount: 0, minimum_amount: 0 };
const oldCoupon: AppliedCoupon = { code: 'VIEJO', discount_type: 'percent', amount: 10, minimum_amount: 0 };

/** Carga cartStore con PURCHASE_ENABLED fijado (la persistencia del cupón depende de ese flag). */
function loadCart(purchaseEnabled: boolean): CartModule {
  let mod!: CartModule;
  jest.isolateModules(() => {
    jest.doMock('../config/features', () => ({ PURCHASE_ENABLED: purchaseEnabled }));
    mod = require('./cartStore');
  });
  return mod;
}

afterEach(() => jest.dontMock('../config/features'));

describe.each([
  ['modo web (PURCHASE_ENABLED apagado)', false],
  ['modo compra (PURCHASE_ENABLED encendido)', true],
])('cartStore, limpieza del cupón: %s', (_label, purchase) => {
  it('se limpia al quitar el último producto del carrito', () => {
    const { useCart } = loadCart(purchase);
    useCart.setState({ items: [item(1), item(2)], coupon: webCoupon });
    useCart.getState().remove(1);
    expect(useCart.getState().coupon).toEqual(webCoupon);
    useCart.getState().remove(2);
    expect(useCart.getState().coupon).toBeNull();
  });

  it('bajar la cantidad a 0 del último producto también lo limpia', () => {
    const { useCart } = loadCart(purchase);
    useCart.setState({ items: [item(1)], coupon: webCoupon });
    useCart.getState().setQty(1, 0);
    expect(useCart.getState().items).toHaveLength(0);
    expect(useCart.getState().coupon).toBeNull();
  });

  it('clear() lo limpia', () => {
    const { useCart } = loadCart(purchase);
    useCart.setState({ items: [item(1)], coupon: webCoupon });
    useCart.getState().clear();
    expect(useCart.getState().coupon).toBeNull();
  });
});

describe('cartStore, modo web: el cupón no sobrevive al cierre del app', () => {
  it('no se guarda en disco: solo los ítems se persisten', () => {
    const { useCart } = loadCart(false);
    const state = { ...useCart.getState(), items: [item(1)], coupon: webCoupon };
    expect(useCart.persist.getOptions().partialize!(state)).toEqual({ items: [item(1)] });
  });

  it('se descarta cualquier cupón que versiones anteriores ya hubieran persistido', () => {
    const { useCart } = loadCart(false);
    const merged = useCart.persist.getOptions().merge!({ items: [item(1)], coupon: oldCoupon }, useCart.getState());
    expect(merged.items).toEqual([item(1)]);
    expect(merged.coupon).toBeNull();
  });

  it('el cupón web (descuento neutro) no genera descuento', () => {
    const { useCart } = loadCart(false);
    useCart.setState({ items: [item(1)], coupon: webCoupon });
    expect(useCart.getState().discount()).toBe(0);
    expect(useCart.getState().total()).toBe(10);
  });
});

describe('cartStore, modo compra: el cupón se guarda en disco como en la versión con compra', () => {
  it('se persisten los ítems y el cupón', () => {
    const { useCart } = loadCart(true);
    const state = { ...useCart.getState(), items: [item(1)], coupon: oldCoupon };
    expect(useCart.persist.getOptions().partialize!(state)).toEqual({ items: [item(1)], coupon: oldCoupon });
  });

  it('al reabrir el app se recupera el cupón persistido', () => {
    const { useCart } = loadCart(true);
    const merged = useCart.persist.getOptions().merge!({ items: [item(1)], coupon: oldCoupon }, useCart.getState());
    expect(merged.items).toEqual([item(1)]);
    expect(merged.coupon).toEqual(oldCoupon);
  });

  it('sigue calculando el descuento del cupón (percent)', () => {
    const { useCart } = loadCart(true);
    useCart.setState({ items: [item(1)], coupon: oldCoupon });
    expect(useCart.getState().discount()).toBe(1);
  });
});

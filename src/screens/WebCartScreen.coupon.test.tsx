import React from 'react';
import { Linking } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { WebCartScreen } from './WebCartScreen';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import type { CartItem } from '../types';

jest.mock('../config/features', () => ({
  PURCHASE_ENABLED: false,
  CART_ENABLED: true,
  IS_PRODUCTION_BUILD: true,
  STORE_API_URL: 'https://boticuy.com/wp-json/wc/store/v1',
}));
jest.mock('../api/products', () => ({ fetchProducts: jest.fn().mockResolvedValue({ products: [], total: 0, totalPages: 1 }) }));
jest.mock('../api/coupons');
jest.mock('../utils/cartRevalidation', () => ({ revalidateCart: jest.fn().mockResolvedValue({ issues: [], priceChanged: false }) }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

import * as couponsApi from '../api/coupons';

const item = (productId: number, quantity = 1): CartItem => ({
  productId,
  name: `Producto ${productId}`,
  image: '',
  unitPrice: 10,
  quantity,
  stockLimit: null,
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
async function render() {
  let r!: TestRenderer.ReactTestRenderer;
  const props = { navigation: { navigate: jest.fn() }, route: {} } as unknown as React.ComponentProps<typeof WebCartScreen>;
  await act(async () => {
    r = TestRenderer.create(<WebCartScreen {...props} />);
  });
  mounted.push(r);
  return r;
}
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat(5).join(''));
const typeCode = async (r: TestRenderer.ReactTestRenderer, value: string) => {
  await act(async () => {
    r.root.findAllByProps({ placeholder: '¿Tienes un cupón? Escríbelo aquí' })[0].props.onChangeText(value);
  });
};
/** Toca el botón (Pressable) que contiene el texto dado: sube desde el Text hasta el primer ancestro con onPress. */
const pressText = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  const textNode = r.root.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === label)[0];
  let node: TestRenderer.ReactTestInstance | null = textNode;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  await act(async () => {
    node!.props.onPress();
  });
};
const apply = (r: TestRenderer.ReactTestRenderer) => pressText(r, 'Aplicar');
const continueOnWeb = async (r: TestRenderer.ReactTestRenderer) => {
  await act(async () => {
    r.root.findAllByProps({ accessibilityLabel: 'Continuar en la web' })[0].props.onPress();
  });
};

let openURL: jest.SpyInstance;
beforeEach(() => {
  useCart.setState({ items: [], coupon: null });
  useToast.setState({ message: null } as never);
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(() => {
  openURL.mockRestore();
  act(() => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
});

describe('WebCartScreen reutiliza el CouponField original (variante web)', () => {
  it('muestra el campo original y deja claro que el descuento y el total se calculan en la web', async () => {
    useCart.setState({ items: [item(1)] });
    const t = texts(await render());
    expect(t).toContain('Aplicar');
    expect(t).toContain('El envío, los descuentos y el total final se calculan en nuestra web.');
  });

  it('"Aplicar" guarda el código (mayúsculas, descuento neutro) sin llamar a ningún servicio', async () => {
    useCart.setState({ items: [item(1)] });
    const r = await render();
    await typeCode(r, 'verano-10');
    await apply(r);
    expect(useCart.getState().coupon).toEqual({ code: 'VERANO-10', discount_type: 'web', amount: 0, minimum_amount: 0 });
    expect(useCart.getState().discount()).toBe(0);
    expect(couponsApi.validateCoupon).not.toHaveBeenCalled();
    const t = texts(r).join(' | ');
    expect(t).toContain('Se aplicará en la web');
    expect(t).toContain('Quitar');
    expect(t).not.toMatch(/−|S\/\s?\d+\.\d\d.*Descuento/);
  });

  it('con formato inválido muestra el error local y no guarda nada', async () => {
    useCart.setState({ items: [item(1)] });
    const r = await render();
    await typeCode(r, 'no valido!');
    await apply(r);
    expect(useCart.getState().coupon).toBeNull();
    expect(texts(r).join(' ')).toContain('Revisa el código: usa solo letras, números, guion (-) y guion bajo (_), hasta 32 caracteres.');
    expect(couponsApi.validateCoupon).not.toHaveBeenCalled();
  });

  it('"Continuar en la web" manda el código guardado como bcy_coupon', async () => {
    useCart.setState({ items: [item(12, 2)] });
    const r = await render();
    await typeCode(r, 'copa10');
    await apply(r);
    await continueOnWeb(r);
    expect(openURL).toHaveBeenCalledWith('https://boticuy.com/?bcy_cart=12-2&bcy_coupon=COPA10&utm_source=app');
  });

  it('sin código el enlace no lleva bcy_coupon, y "Quitar" borra el cupón', async () => {
    useCart.setState({ items: [item(12)] });
    const r = await render();
    await typeCode(r, 'abc');
    await apply(r);
    await pressText(r, 'Quitar');
    expect(useCart.getState().coupon).toBeNull();
    await continueOnWeb(r);
    expect(openURL).toHaveBeenCalledWith('https://boticuy.com/?bcy_cart=12-1&utm_source=app');
  });

  it('al vaciar el carrito el cupón se limpia', async () => {
    useCart.setState({ items: [item(12)] });
    const r = await render();
    await typeCode(r, 'abc');
    await apply(r);
    expect(useCart.getState().coupon?.code).toBe('ABC');
    await act(async () => {
      useCart.getState().remove(12);
    });
    expect(useCart.getState().coupon).toBeNull();
    expect(texts(r)).toContain('Tu carrito está vacío');
  });
});

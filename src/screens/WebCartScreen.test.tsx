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
jest.mock('../utils/cartRevalidation', () => ({ revalidateCart: jest.fn().mockResolvedValue({ issues: [], priceChanged: false }) }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

const item = (over: Partial<CartItem> & { productId: number }): CartItem => ({
  name: `Producto ${over.productId}`,
  image: '',
  unitPrice: 10,
  quantity: 1,
  stockLimit: null,
  ...over,
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

describe('WebCartScreen', () => {
  it('vacío: invita a explorar el catálogo', async () => {
    const t = texts(await render());
    expect(t).toContain('Tu carrito está vacío');
    expect(t).toContain('Ver productos');
  });

  it('muestra subtotal referencial y el botón a la web, sin envío, descuentos, puntos ni pago', async () => {
    useCart.setState({ items: [item({ productId: 1, quantity: 2 }), item({ productId: 2, unitPrice: 5 })] });
    const list = texts(await render());
    const t = list.join(' | ');
    expect(list).not.toContain('Descuento');
    expect(list).not.toContain('Total');
    expect(t).toContain('Subtotal referencial');
    expect(t).toContain('Continuar en la web');
    expect(t).toContain('El envío, los descuentos y el total final se calculan en nuestra web.');
    expect(t).not.toMatch(/Ir a pagar|puntos|Envío gratis|Finalizar/i);
  });

  it('"Continuar en la web" abre el enlace que arma el carrito con ids y cantidades', async () => {
    useCart.setState({ items: [item({ productId: 12, quantity: 2 }), item({ productId: 34 })] });
    const r = await render();
    await act(async () => {
      r.root.findByProps({ accessibilityLabel: 'Continuar en la web' }).props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('https://boticuy.com/?bcy_cart=12-2,34-1&utm_source=app');
  });

  it('no deja pasar de 10 unidades por producto y avisa el tope', async () => {
    useCart.setState({ items: [item({ productId: 1, quantity: 10 })] });
    const r = await render();
    const plus = r.root.findByProps({ accessibilityLabel: 'Aumentar cantidad de Producto 1' });
    expect(plus.props.disabled).toBe(true);
    expect(texts(r).join(' ')).toContain('hasta 20 productos distintos y 10 unidades');
  });
});

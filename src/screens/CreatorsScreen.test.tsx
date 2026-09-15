import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { CreatorsScreen } from './CreatorsScreen';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import * as couponsApi from '../api/coupons';

jest.mock('../api/coupons');

const mockedFetchApoyaCreador = couponsApi.fetchApoyaCreador as jest.Mock;
const mockedFetchMisCupones = couponsApi.fetchMisCupones as jest.Mock;
const mockedValidateCoupon = couponsApi.validateCoupon as jest.Mock;

const navigation = { navigate: jest.fn() } as any;
const route = {} as any;

let renderer: TestRenderer.ReactTestRenderer | undefined;

beforeEach(() => {
  useCart.setState({ items: [], coupon: null });
  useToast.setState({ message: null, seq: 0, variant: 'success', duration: 1800 });
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

// Ver nota en MyCouponsScreen.test.tsx: un macrotask drena toda la cadena de
// promesas (Promise.all/.then/.finally), a diferencia de un solo `await`.
const flush = () => act(() => new Promise<void>((resolve) => setImmediate(() => resolve())));

async function renderAndPressUsar() {
  act(() => {
    renderer = TestRenderer.create(<CreatorsScreen navigation={navigation} route={route} />);
  });
  await flush(); // deja resolver el Promise.all inicial (load())

  // Pressable es un React.memo(); react-test-renderer reporta el `type` de la
  // función interna envuelta, no el wrapper memo, así que findByType(Pressable)
  // nunca matchea — se busca por la prop onPress en su lugar, que sí está
  // presente en la instancia compuesta tal cual se pasó por JSX.
  const [useBtn] = renderer!.root.findAll((n: TestRenderer.ReactTestInstance) => typeof n.props.onPress === 'function');
  act(() => {
    useBtn.props.onPress();
  });
  await flush(); // deja resolver el await validateCoupon() dentro de use()

  return renderer!;
}

describe('CreatorsScreen — "Usar" revalida contra /coupon en vez de aplicar a ciegas', () => {
  test('rechaza el cupón de Copa Boticuy si el subtotal no alcanza el monto mínimo real', async () => {
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 20, quantity: 1, stockLimit: null }],
      coupon: null,
    });
    mockedFetchApoyaCreador.mockResolvedValue([
      { code: 'COPA10', name: 'Creador Copa', channel: 'TikTok', amount: 10, active: true },
    ]);
    mockedFetchMisCupones.mockResolvedValue([]);
    mockedValidateCoupon.mockResolvedValue({
      valid: true,
      coupon: { code: 'COPA10', discount_type: 'percent', amount: 10, minimum_amount: 50 },
    });

    await renderAndPressUsar();

    expect(mockedValidateCoupon).toHaveBeenCalledWith('COPA10', [{ id: 1, qty: 1 }]);
    expect(useCart.getState().coupon).toBeNull();
    expect(useToast.getState().message).toMatch(/Compra mínima/);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('aplica el cupón cuando sí cumple el monto mínimo real', async () => {
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 100, quantity: 1, stockLimit: null }],
      coupon: null,
    });
    mockedFetchApoyaCreador.mockResolvedValue([
      { code: 'COPA10', name: 'Creador Copa', channel: 'TikTok', amount: 10, active: true },
    ]);
    mockedFetchMisCupones.mockResolvedValue([]);
    mockedValidateCoupon.mockResolvedValue({
      valid: true,
      coupon: { code: 'COPA10', discount_type: 'percent', amount: 10, minimum_amount: 50 },
    });

    await renderAndPressUsar();

    expect(useCart.getState().coupon).toEqual({
      code: 'COPA10',
      discount_type: 'percent',
      amount: 10,
      minimum_amount: 50,
    });
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Catalogo' });
  });
});

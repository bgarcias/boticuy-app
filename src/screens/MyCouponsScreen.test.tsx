import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { MyCouponsScreen } from './MyCouponsScreen';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import * as couponsApi from '../api/coupons';

jest.mock('../api/coupons');

const mockedFetchMisCupones = couponsApi.fetchMisCupones as jest.Mock;
const mockedFetchCuponesOro = couponsApi.fetchCuponesOro as jest.Mock;
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

// Deja drenar TODA la cadena de promesas pendiente (Promise.all/.then/.finally
// puede tener más saltos de microtask de los que un solo `await` resuelve) —
// un macrotask (setImmediate) solo se ejecuta después de vaciarse la cola de
// microtasks por completo, sin importar cuántos niveles de `.then` encadenados
// queden pendientes en ese momento.
const flush = () => act(() => new Promise<void>((resolve) => setImmediate(() => resolve())));

async function renderAndPressUsar() {
  act(() => {
    renderer = TestRenderer.create(<MyCouponsScreen navigation={navigation} route={route} />);
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

describe('MyCouponsScreen — "Usar" revalida contra /coupon en vez de aplicar a ciegas', () => {
  test('rechaza el cupón si el subtotal actual no alcanza el monto mínimo real', async () => {
    // El listado de creador no trae minimum_amount (ver tipo Creator) — solo
    // /coupon lo sabe. Carrito con subtotal S/20, cupón real exige S/50.
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 20, quantity: 1, stockLimit: null }],
      coupon: null,
    });
    mockedFetchMisCupones.mockResolvedValue([
      { code: 'CREA10', name: 'Creador', channel: '', amount: 10, active: true },
    ]);
    mockedFetchCuponesOro.mockResolvedValue([]);
    mockedValidateCoupon.mockResolvedValue({
      valid: true,
      coupon: { code: 'CREA10', discount_type: 'percent', amount: 10, minimum_amount: 50 },
    });

    await renderAndPressUsar();

    expect(mockedValidateCoupon).toHaveBeenCalledWith('CREA10');
    expect(useCart.getState().coupon).toBeNull(); // NO se aplicó a ciegas
    expect(useToast.getState().message).toMatch(/Compra mínima/);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('aplica el cupón cuando sí cumple el monto mínimo real', async () => {
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 100, quantity: 1, stockLimit: null }],
      coupon: null,
    });
    mockedFetchMisCupones.mockResolvedValue([
      { code: 'CREA10', name: 'Creador', channel: '', amount: 10, active: true },
    ]);
    mockedFetchCuponesOro.mockResolvedValue([]);
    mockedValidateCoupon.mockResolvedValue({
      valid: true,
      coupon: { code: 'CREA10', discount_type: 'percent', amount: 10, minimum_amount: 50 },
    });

    await renderAndPressUsar();

    expect(useCart.getState().coupon).toEqual({
      code: 'CREA10',
      discount_type: 'percent',
      amount: 10,
      minimum_amount: 50,
    });
    expect(useToast.getState().message).toMatch(/aplicado/);
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Catalogo' });
  });

  test('rechaza el cupón si /coupon lo marca inválido (ej. vencido) aunque el listado lo mostrara', async () => {
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 100, quantity: 1, stockLimit: null }],
      coupon: null,
    });
    mockedFetchMisCupones.mockResolvedValue([
      { code: 'VENCIDO', name: 'Creador', channel: '', amount: 10, active: true },
    ]);
    mockedFetchCuponesOro.mockResolvedValue([]);
    mockedValidateCoupon.mockResolvedValue({ valid: false, reason: 'Cupón vencido' });

    await renderAndPressUsar();

    expect(useCart.getState().coupon).toBeNull();
    expect(useToast.getState().message).toBe('Cupón vencido');
  });
});

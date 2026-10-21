import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { MyCouponsScreen } from './MyCouponsScreen';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { useAuth } from '../store/authStore';
import * as couponsApi from '../api/coupons';

// Sin compra: sin sesión ni niveles. El comportamiento original lo cubre MyCouponsScreen.test.tsx.
jest.mock('../config/features', () => ({ PURCHASE_ENABLED: false, CART_ENABLED: true, COUPONS_ENABLED: true }));
jest.mock('../api/coupons');

const fetchMis = couponsApi.fetchMisCupones as jest.Mock;
const fetchOro = couponsApi.fetchCuponesOro as jest.Mock;
const validate = couponsApi.validateCoupon as jest.Mock;

const navigation = { navigate: jest.fn() } as any;
const route = {} as any;
let renderer: TestRenderer.ReactTestRenderer | undefined;

const cupon = (code: string) => ({ code, name: code, channel: '', amount: 20, active: true });

beforeEach(() => {
  useCart.setState({ items: [], coupon: null });
  useToast.setState({ message: null, seq: 0, variant: 'success', duration: 1800 });
  // Sin sesión: ni usuario ni token leído. La pantalla igual debe mostrarse.
  useAuth.setState({ user: null, tokenReady: false });
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

const flush = () => act(() => new Promise<void>((resolve) => setImmediate(() => resolve())));
const texts = () =>
  renderer!.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat(5).join(''));

async function mount() {
  act(() => {
    renderer = TestRenderer.create(<MyCouponsScreen navigation={navigation} route={route} />);
  });
  await flush();
}

describe('MyCouponsScreen sin compra', () => {
  it('se muestra sin sesión (no usa useRequireAuth) y lista solo /mis-cupones', async () => {
    fetchMis.mockResolvedValueOnce([cupon('VITA20')]);
    await mount();
    expect(fetchMis).toHaveBeenCalledTimes(1);
    expect(fetchOro).not.toHaveBeenCalled();
    const t = texts().join(' | ');
    expect(t).toContain('Disponibles');
    expect(t).toContain('VITA20');
  });

  it('no muestra la sección "Exclusivos Oro"', async () => {
    fetchMis.mockResolvedValueOnce([cupon('VITA20')]);
    await mount();
    expect(texts().join(' | ')).not.toContain('Exclusivos Oro');
  });

  it('las tarjetas muestran "N% de descuento" con el monto del listado, sin importes en soles', async () => {
    fetchMis.mockResolvedValueOnce([cupon('VITA20')]);
    await mount();
    const t = texts().join(' | ');
    expect(t).toContain('20% de descuento');
    expect(t).not.toContain('Condiciones en la web');
    expect(t).not.toContain('S/');
  });

  it('si el listado no trae monto, la tarjeta dice "Condiciones en la web"', async () => {
    fetchMis.mockResolvedValueOnce([{ ...cupon('VITA20'), amount: null }]);
    await mount();
    const t = texts().join(' | ');
    expect(t).toContain('Condiciones en la web');
    expect(t).not.toContain('% de descuento');
  });

  it('"Usar" guarda el código (descuento neutro), avisa y va al tab Carrito, sin validar contra el servidor', async () => {
    fetchMis.mockResolvedValueOnce([cupon('vita20')]);
    await mount();
    const useBtn = renderer!.root.findAll((n) => typeof n.props.onPress === 'function')[0];
    await act(async () => {
      useBtn.props.onPress();
    });
    expect(validate).not.toHaveBeenCalled();
    expect(useCart.getState().coupon).toEqual({ code: 'VITA20', discount_type: 'web', amount: 0, minimum_amount: 0, percent: 20 });
    expect(useCart.getState().discount()).toBe(0);
    expect(useToast.getState().message).toBe('Cupón VITA20 guardado');
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Carrito' });
  });

  it('un código con formato inválido no se guarda', async () => {
    fetchMis.mockResolvedValueOnce([cupon('VITA 20!')]);
    await mount();
    const useBtn = renderer!.root.findAll((n) => typeof n.props.onPress === 'function')[0];
    await act(async () => {
      useBtn.props.onPress();
    });
    expect(useCart.getState().coupon).toBeNull();
    expect(useToast.getState().message).toBe('Este código no se puede usar desde el app.');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('sin cupones muestra el estado vacío', async () => {
    fetchMis.mockResolvedValueOnce([]);
    await mount();
    expect(texts()).toContain('No hay cupones activos por ahora.');
  });

  it('si la llamada falla (por ejemplo 503 con la ruta cerrada) muestra el error con "Reintentar"', async () => {
    fetchMis.mockRejectedValueOnce(Object.assign(new Error('503'), { response: { status: 503 } }));
    await mount();
    const t = texts();
    expect(t).toContain('No pudimos cargar los cupones.');
    expect(t).toContain('Reintentar');
  });
});

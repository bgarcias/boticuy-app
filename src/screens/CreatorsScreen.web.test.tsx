import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { CreatorsScreen } from './CreatorsScreen';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import { analytics } from '../analytics';
import * as couponsApi from '../api/coupons';

// Modo web: sin PURCHASE_ENABLED, con la pantalla de creadores y el carrito encendidos.
jest.mock('../config/features', () => ({ PURCHASE_ENABLED: false, CART_ENABLED: true, CREATORS_ENABLED: true }));
jest.mock('../api/coupons');

const fetchApoya = couponsApi.fetchApoyaCreador as jest.Mock;
const fetchMis = couponsApi.fetchMisCupones as jest.Mock;
const validate = couponsApi.validateCoupon as jest.Mock;

const navigation = { navigate: jest.fn() } as any;
const route = {} as any;
let renderer: TestRenderer.ReactTestRenderer | undefined;

const creator = (code: string, name = 'Creador') => ({ code, name, channel: 'TikTok', amount: 15, active: true });

beforeEach(() => {
  useCart.setState({ items: [], coupon: null });
  useToast.setState({ message: null, seq: 0, variant: 'success', duration: 1800 });
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
    renderer = TestRenderer.create(<CreatorsScreen navigation={navigation} route={route} />);
  });
  await flush();
}

describe('CreatorsScreen en modo web', () => {
  it('solo llama a /apoya-creador: no pide /mis-cupones ni muestra "Otros cupones disponibles"', async () => {
    fetchApoya.mockResolvedValueOnce([creator('COPA10', 'Ana')]);
    await mount();
    expect(fetchApoya).toHaveBeenCalledTimes(1);
    expect(fetchMis).not.toHaveBeenCalled();
    const t = texts().join(' | ');
    expect(t).toContain('Copa Boticuy');
    expect(t).not.toContain('Otros cupones disponibles');
  });

  it('el texto de introducción dice que la web valida el código y aplica el descuento según sus condiciones', async () => {
    fetchApoya.mockResolvedValueOnce([creator('COPA10', 'Ana')]);
    await mount();
    const t = texts();
    expect(t).toContain('Usa el código de tu creador favorito. La web valida el código y aplica el descuento según sus condiciones.');
    expect(t.join(' ')).not.toContain('Tú ahorras y ellos suman');
  });

  it('las tarjetas muestran "N% de descuento" con el monto del listado, sin importes en soles', async () => {
    fetchApoya.mockResolvedValueOnce([creator('COPA10', 'Ana')]);
    await mount();
    const t = texts().join(' | ');
    expect(t).toContain('15% de descuento');
    expect(t).not.toContain('Condiciones en la web');
    expect(t).not.toContain('S/');
  });

  it('si el listado no trae monto, la tarjeta dice "Condiciones en la web"', async () => {
    fetchApoya.mockResolvedValueOnce([{ ...creator('COPA10', 'Ana'), amount: null }]);
    await mount();
    const t = texts().join(' | ');
    expect(t).toContain('Condiciones en la web');
    expect(t).not.toContain('% de descuento');
  });

  it('"Usar" guarda el código (descuento neutro), avisa, registra la analítica y va al tab Carrito, sin validar', async () => {
    fetchApoya.mockResolvedValueOnce([creator('copa10', 'Ana')]);
    const track = jest.spyOn(analytics, 'track').mockImplementation(() => {});
    await mount();
    const useBtn = renderer!.root.findAll((n) => typeof n.props.onPress === 'function')[0];
    await act(async () => {
      useBtn.props.onPress();
    });
    expect(validate).not.toHaveBeenCalled();
    expect(useCart.getState().coupon).toEqual({ code: 'COPA10', discount_type: 'web', amount: 0, minimum_amount: 0, percent: 15 });
    expect(useCart.getState().discount()).toBe(0);
    expect(useToast.getState().message).toBe('Cupón COPA10 guardado');
    expect(track).toHaveBeenCalledWith('apply_creator_coupon', { code: 'COPA10' });
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Carrito' });
    track.mockRestore();
  });

  it('un código con formato inválido no se guarda', async () => {
    fetchApoya.mockResolvedValueOnce([creator('COPA 10!')]);
    await mount();
    const useBtn = renderer!.root.findAll((n) => typeof n.props.onPress === 'function')[0];
    await act(async () => {
      useBtn.props.onPress();
    });
    expect(useCart.getState().coupon).toBeNull();
    expect(useToast.getState().message).toBe('Este código no se puede usar desde el app.');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('si el servidor responde 503 (ruta cerrada) muestra un mensaje amable con "Reintentar", sin romperse', async () => {
    fetchApoya.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } }));
    await mount();
    const t = texts();
    expect(t).toContain('Los códigos de creadores no están disponibles por ahora. Inténtalo más tarde.');
    expect(t).toContain('Reintentar');
  });

  it('"Reintentar" vuelve a pedir y muestra la lista cuando la ruta ya responde', async () => {
    fetchApoya.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce([creator('COPA10', 'Ana')]);
    await mount();
    const retry = renderer!.root.findAll((n) => typeof n.props.onPress === 'function')[0];
    await act(async () => {
      retry.props.onPress();
    });
    await flush();
    expect(texts().join(' | ')).toContain('COPA10');
  });

  it('sin creadores muestra el estado vacío', async () => {
    fetchApoya.mockResolvedValueOnce([]);
    await mount();
    expect(texts()).toContain('Pronto habrá códigos de creadores.');
  });
});

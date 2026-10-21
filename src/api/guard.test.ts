import { bffClient } from './client';
import * as orders from './orders';
import * as payment from './payment';
import * as quote from './quote';
import * as coupons from './coupons';
import * as points from './points';
import * as addresses from './addresses';
import * as auth from './auth';
import * as shipping from './shipping';
import * as ubigeo from './ubigeo';
import * as bank from './bankDetails';
import { PurchaseDisabledError } from './guard';
import { analytics } from '../analytics';

// Sin mock de features: el flag PURCHASE_ENABLED queda en su valor por defecto (apagado).
jest.mock('./client', () => ({
  bffClient: { get: jest.fn(), post: jest.fn() },
  storeClient: { get: jest.fn() },
  wpClient: { get: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

const calls: [string, () => Promise<unknown>][] = [
  ['createOrder', () => orders.createOrder({} as never)],
  ['fetchMyOrders', () => orders.fetchMyOrders()],
  ['getFormToken', () => payment.getFormToken(1)],
  ['validatePayment', () => payment.validatePayment(1, 'a', 'b')],
  ['abandonPayment', () => payment.abandonPayment(1)],
  ['fetchQuote', () => quote.fetchQuote([], undefined, 0, '010101')],
  ['fetchCoupons', () => coupons.fetchCoupons()],
  ['fetchCuponesOro', () => coupons.fetchCuponesOro()],
  ['validateCoupon', () => coupons.validateCoupon('X')],
  ['fetchPoints', () => points.fetchPoints()],
  ['fetchAddresses', () => addresses.fetchAddresses()],
  ['addAddress', () => addresses.addAddress({} as never)],
  ['updateAddress', () => addresses.updateAddress('1', {} as never)],
  ['deleteAddress', () => addresses.deleteAddress('1')],
  ['registerUser', () => auth.registerUser('a@b.c', 'x', 'n')],
  ['loginUser', () => auth.loginUser('a@b.c', 'x')],
  ['refreshSession', () => auth.refreshSession()],
  ['logoutSession', () => auth.logoutSession()],
  ['fetchShipping', () => shipping.fetchShipping('010101', 1)],
  ['fetchShippingConfig', () => shipping.fetchShippingConfig()],
  ['fetchDepartamentos', () => ubigeo.fetchDepartamentos()],
  ['fetchProvincias', () => ubigeo.fetchProvincias('15')],
  ['fetchDistritos', () => ubigeo.fetchDistritos('15', '1')],
  ['fetchBankDetails', () => bank.fetchBankDetails()],
];

describe('modo sin compra: api/ se niega a enviar peticiones', () => {
  it.each(calls)('%s lanza PurchaseDisabledError y no toca la red', async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(PurchaseDisabledError);
    expect(bffClient.get).not.toHaveBeenCalled();
    expect(bffClient.post).not.toHaveBeenCalled();
  });
});

describe('modo sin compra: analítica', () => {
  it('registra los eventos del carrito pero no los del checkout', () => {
    const sink = jest.fn();
    analytics.setSink(sink);
    analytics.track('add_to_cart', { id: 1 });
    analytics.track('remove_from_cart', { id: 1 });
    analytics.track('begin_checkout');
    analytics.track('checkout_submitted');
    analytics.track('search', { query: 'x' });
    expect(sink.mock.calls.map((c) => c[0])).toEqual(['add_to_cart', 'remove_from_cart', 'search']);
    analytics.setSink(null);
  });
});

describe('fetchApoyaCreador: la única función de cupones que se reabre (CREATORS_ENABLED)', () => {
  it('con el flag por defecto (encendido) llama a GET /apoya-creador sin PURCHASE_ENABLED', async () => {
    (bffClient.get as jest.Mock).mockResolvedValueOnce({ data: { ok: true, cupones: [{ code: 'COPA10' }] } });
    await expect(coupons.fetchApoyaCreador()).resolves.toEqual([{ code: 'COPA10' }]);
    expect(bffClient.get).toHaveBeenCalledWith('/apoya-creador');
  });

  it('con CREATORS_ENABLED apagado se niega y no toca la red', async () => {
    jest.resetModules();
    jest.doMock('../config/features', () => ({ PURCHASE_ENABLED: false, CREATORS_ENABLED: false }));
    const isolated = require('./coupons') as typeof import('./coupons');
    const { PurchaseDisabledError: Err } = require('./guard') as typeof import('./guard');
    await expect(isolated.fetchApoyaCreador()).rejects.toBeInstanceOf(Err);
    jest.dontMock('../config/features');
  });

  it('las demás funciones de cupones siguen cerradas aunque CREATORS_ENABLED esté encendido', async () => {
    await expect(coupons.fetchCuponesOro()).rejects.toBeInstanceOf(PurchaseDisabledError);
    await expect(coupons.validateCoupon('X')).rejects.toBeInstanceOf(PurchaseDisabledError);
    expect(bffClient.get).not.toHaveBeenCalled();
  });
});

describe('fetchMisCupones: la segunda función de cupones que se reabre (COUPONS_ENABLED)', () => {
  it('con el flag por defecto (encendido) llama a GET /mis-cupones sin PURCHASE_ENABLED', async () => {
    (bffClient.get as jest.Mock).mockResolvedValueOnce({ data: { ok: true, cupones: [{ code: 'VITA10' }] } });
    await expect(coupons.fetchMisCupones()).resolves.toEqual([{ code: 'VITA10' }]);
    expect(bffClient.get).toHaveBeenCalledWith('/mis-cupones');
  });

  it('con COUPONS_ENABLED apagado se niega y no toca la red', async () => {
    jest.resetModules();
    jest.doMock('../config/features', () => ({ PURCHASE_ENABLED: false, CREATORS_ENABLED: true, COUPONS_ENABLED: false }));
    const isolated = require('./coupons') as typeof import('./coupons');
    const { PurchaseDisabledError: Err } = require('./guard') as typeof import('./guard');
    await expect(isolated.fetchMisCupones()).rejects.toBeInstanceOf(Err);
    jest.dontMock('../config/features');
  });

  it('cupones Oro y validación siguen cerrados sin compra aunque COUPONS_ENABLED esté encendido', async () => {
    await expect(coupons.fetchCuponesOro()).rejects.toBeInstanceOf(PurchaseDisabledError);
    await expect(coupons.validateCoupon('X')).rejects.toBeInstanceOf(PurchaseDisabledError);
    expect(bffClient.get).not.toHaveBeenCalled();
  });
});

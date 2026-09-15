import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';

import { CouponField } from './CouponField';
import { useCart } from '../store/cartStore';
import * as couponsApi from '../api/coupons';

jest.mock('../api/coupons');

const mockedValidateCoupon = couponsApi.validateCoupon as jest.Mock;

const asTree = (node: TestRenderer.ReactTestRenderer) => JSON.stringify(node.toJSON());
const flush = () => act(() => new Promise<void>((resolve) => setImmediate(() => resolve())));

let renderer: TestRenderer.ReactTestRenderer | undefined;

beforeEach(() => {
  useCart.setState({ items: [], coupon: null });
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

describe('CouponField — cupón aplicado bajo el monto mínimo', () => {
  test('muestra el aviso "agrega X más para usarlo" en vez de "−S/ 0.00"', () => {
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 20, quantity: 1, stockLimit: null }],
      coupon: { code: 'PROMO', discount_type: 'percent', amount: 10, minimum_amount: 50 },
    });

    act(() => {
      renderer = TestRenderer.create(<CouponField />);
    });
    const tree = asTree(renderer!);

    expect(tree).toContain('PROMO');
    expect(tree).toContain('agrega');
    expect(tree).toContain('más para usarlo');
    // S/ 30.00 = diferencia entre el mínimo (50) y el subtotal actual (20)
    expect(tree).toContain('30.00');
    // El formato antiguo y engañoso "Cupón X · −S/ 0.00" no debe aparecer.
    expect(tree).not.toContain('· −');
  });

  test('sí muestra el descuento normal cuando el cupón alcanza el mínimo', () => {
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 100, quantity: 1, stockLimit: null }],
      coupon: { code: 'PROMO', discount_type: 'percent', amount: 10, minimum_amount: 50 },
    });

    act(() => {
      renderer = TestRenderer.create(<CouponField />);
    });
    const tree = asTree(renderer!);

    expect(tree).toContain('PROMO');
    expect(tree).toContain('10.00'); // 10% de 100
    expect(tree).not.toContain('agrega');
  });
});

describe('CouponField — validación de restricción de producto (seguimiento de A2)', () => {
  test('manda los ítems del carrito a /coupon y muestra el rechazo real sin aplicar el cupón', async () => {
    useCart.setState({
      items: [{ productId: 1, name: 'Producto', image: '', unitPrice: 20, quantity: 2, stockLimit: null }],
      coupon: null,
    });
    mockedValidateCoupon.mockResolvedValue({
      valid: false,
      reason: 'Este cupón no es válido para el carrito actual',
    });

    act(() => {
      renderer = TestRenderer.create(<CouponField />);
    });

    const input = renderer!.root.findByType(TextInput);
    act(() => {
      input.props.onChangeText('SOLOPROD5');
    });
    const [applyBtn] = renderer!.root.findAll(
      (n: TestRenderer.ReactTestInstance) => typeof n.props.onPress === 'function'
    );
    act(() => {
      applyBtn.props.onPress();
    });
    await flush();

    expect(mockedValidateCoupon).toHaveBeenCalledWith('SOLOPROD5', [{ id: 1, qty: 2 }]);
    const tree = asTree(renderer!);
    expect(tree).toContain('Este cupón no es válido para el carrito actual');
    // No se guarda como aplicado: sigue mostrando el input, no el chip verde.
    expect(useCart.getState().coupon).toBeNull();
  });
});

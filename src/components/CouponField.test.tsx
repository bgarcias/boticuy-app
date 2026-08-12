import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { CouponField } from './CouponField';
import { useCart } from '../store/cartStore';

const asTree = (node: TestRenderer.ReactTestRenderer) => JSON.stringify(node.toJSON());

let renderer: TestRenderer.ReactTestRenderer | undefined;

beforeEach(() => {
  useCart.setState({ items: [], coupon: null });
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

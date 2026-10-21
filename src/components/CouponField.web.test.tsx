import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput, StyleSheet } from 'react-native';

import { CouponField } from './CouponField';
import { useCart } from '../store/cartStore';
import { useToast } from '../store/toastStore';
import * as couponsApi from '../api/coupons';

// Variante web: sin PURCHASE_ENABLED. El comportamiento original lo cubre CouponField.test.tsx.
jest.mock('../config/features', () => ({ PURCHASE_ENABLED: false }));
jest.mock('../api/coupons');

let renderer: TestRenderer.ReactTestRenderer | undefined;

beforeEach(() => {
  useCart.setState({ items: [{ productId: 1, name: 'P', image: '', unitPrice: 20, quantity: 1, stockLimit: null }], coupon: null });
  useToast.setState({ message: null, seq: 0, variant: 'success', duration: 1800 });
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => {
    renderer?.unmount();
  });
  renderer = undefined;
});

const texts = () =>
  renderer!.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat(5).join(''));

function mount() {
  act(() => {
    renderer = TestRenderer.create(<CouponField />);
  });
}
function typeAndApply(value: string) {
  const input = renderer!.root.findByType(TextInput);
  act(() => {
    input.props.onChangeText(value);
  });
  const apply = renderer!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.disabled !== undefined)[0];
  act(() => {
    apply.props.onPress();
  });
}

describe('CouponField, variante web', () => {
  it('conserva el aspecto del campo original (mismo placeholder y botón "Aplicar")', () => {
    mount();
    expect(renderer!.root.findByType(TextInput).props.placeholder).toBe('¿Tienes un cupón? Escríbelo aquí');
    expect(texts()).toContain('Aplicar');
  });

  it('guarda el código en mayúsculas con descuento neutro, sin llamar a ningún servicio', () => {
    mount();
    typeAndApply('copa-10');
    expect(useCart.getState().coupon).toEqual({ code: 'COPA-10', discount_type: 'web', amount: 0, minimum_amount: 0 });
    expect(useCart.getState().discount()).toBe(0);
    expect(couponsApi.validateCoupon).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBe('Cupón guardado');
  });

  it('muestra el recuadro verde con "Se aplicará en la web" y "Quitar", sin cifras ni variante ámbar', () => {
    useCart.setState({ coupon: { code: 'COPA10', discount_type: 'web', amount: 0, minimum_amount: 0 } });
    mount();
    const t = texts().join(' | ');
    expect(t).toContain('COPA10');
    expect(t).toContain('Se aplicará en la web');
    expect(t).toContain('Quitar');
    expect(t).not.toMatch(/−|agrega|válido/);
  });

  it('con el porcentaje guardado al tocar "Usar": "CRWEN2 · 20% de descuento · Se aplicará en la web", sin importes en soles', () => {
    useCart.setState({ coupon: { code: 'CRWEN2', discount_type: 'web', amount: 0, minimum_amount: 0, percent: 20 } });
    mount();
    const t = texts();
    expect(t).toContain('CRWEN2');
    expect(t.some((x) => x.endsWith(' · 20% de descuento · Se aplicará en la web'))).toBe(true);
    expect(t.join(' | ')).not.toContain('S/');
    expect(useCart.getState().discount()).toBe(0);
  });

  it('el texto del aviso se encoge y se parte en líneas, y "Quitar" no se encoge ni queda tapado', () => {
    useCart.setState({ coupon: { code: 'CODIGOMUYLARGO-2026-CREADOR', discount_type: 'web', amount: 0, minimum_amount: 0, percent: 12.5 } });
    mount();
    const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;
    const textNode = renderer!.root.findAll(
      (n) => (n.type as unknown) === 'Text' && [n.props.children].flat(5).join('').includes('Se aplicará en la web')
    )[0];
    expect(flat(textNode.props.style)).toMatchObject({ flex: 1, flexShrink: 1 });
    const quitarText = renderer!.root.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === 'Quitar')[0];
    let btn: TestRenderer.ReactTestInstance | null = quitarText;
    while (btn && typeof btn.props.onPress !== 'function') btn = btn.parent;
    expect(flat(btn!.props.style)).toMatchObject({ flexShrink: 0 });
    expect(texts()).toContain('Quitar');
  });

  it('un código escrito a mano no tiene porcentaje: solo el código, como hoy', () => {
    mount();
    typeAndApply('crwen2');
    expect(useCart.getState().coupon).toEqual({ code: 'CRWEN2', discount_type: 'web', amount: 0, minimum_amount: 0 });
    expect(useCart.getState().coupon?.percent).toBeUndefined();
    const t = texts();
    expect(t).toContain('CRWEN2');
    expect(t.some((x) => x.endsWith(' · Se aplicará en la web') && !x.includes('% de descuento'))).toBe(true);
    expect(t.join(' | ')).not.toContain('% de descuento');
  });

  it('"Quitar" borra el cupón', () => {
    useCart.setState({ coupon: { code: 'COPA10', discount_type: 'web', amount: 0, minimum_amount: 0 } });
    mount();
    const quitar = renderer!.root.findAll((n) => typeof n.props.onPress === 'function')[0];
    act(() => {
      quitar.props.onPress();
    });
    expect(useCart.getState().coupon).toBeNull();
  });

  it.each(['no valido!', 'a b', 'x'.repeat(33), 'cupón', 'a;b'])('con formato inválido (%s) muestra error local y no guarda', (value) => {
    mount();
    typeAndApply(value);
    expect(useCart.getState().coupon).toBeNull();
    expect(texts().join(' ')).toContain('Revisa el código: usa solo letras, números, guion (-) y guion bajo (_), hasta 32 caracteres.');
    expect(couponsApi.validateCoupon).not.toHaveBeenCalled();
  });
});

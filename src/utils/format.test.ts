import { priceToSoles, regularToSoles, formatSoles, stripHtml } from './format';
import type { StorePrice } from '../types';

const price: StorePrice = {
  price: '5500',
  regular_price: '6000',
  sale_price: '5500',
  currency_code: 'PEN',
  currency_minor_unit: 2,
  currency_symbol: 'S/',
};

describe('utils/format', () => {
  test('priceToSoles convierte céntimos a soles', () => {
    expect(priceToSoles(price)).toBe(55);
  });

  test('regularToSoles usa el precio regular', () => {
    expect(regularToSoles(price)).toBe(60);
  });

  test('formatSoles muestra símbolo y 2 decimales', () => {
    const s = formatSoles(55);
    expect(s.startsWith('S/')).toBe(true);
    expect(s).toContain('55.00');
  });

  test('stripHtml quita etiquetas y entidades', () => {
    expect(stripHtml('<ul><li>Hola</li></ul>')).toBe('Hola');
    expect(stripHtml('Bien&nbsp;hecho')).toBe('Bien hecho');
  });
});

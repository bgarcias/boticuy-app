import { useCart } from './cartStore';
import type { Product } from '../types';

const makeProduct = (id: number, priceCents: string): Product =>
  ({
    id,
    name: `Producto ${id}`,
    slug: `p${id}`,
    permalink: '',
    sku: '',
    short_description: '',
    description: '',
    on_sale: false,
    prices: {
      price: priceCents,
      regular_price: priceCents,
      sale_price: priceCents,
      currency_code: 'PEN',
      currency_minor_unit: 2,
      currency_symbol: 'S/',
    },
    images: [],
    brands: [],
    average_rating: '0',
    review_count: 0,
    is_in_stock: true,
    is_purchasable: true,
    low_stock_remaining: null,
  }) as Product;

beforeEach(() => {
  useCart.setState({ items: [], coupon: null });
});

describe('cartStore', () => {
  test('agrega un producto y calcula el subtotal', () => {
    useCart.getState().add(makeProduct(1, '5500'));
    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().subtotal()).toBe(55);
  });

  test('agregar el mismo producto suma cantidades', () => {
    const p = makeProduct(1, '5500');
    useCart.getState().add(p);
    useCart.getState().add(p);
    expect(useCart.getState().count()).toBe(2);
    expect(useCart.getState().subtotal()).toBe(110);
  });

  test('cupón de porcentaje calcula descuento y total', () => {
    useCart.getState().add(makeProduct(1, '10000')); // S/100
    useCart.getState().setCoupon({ code: 'CURWEN', discount_type: 'percent', amount: 15, minimum_amount: 0 });
    expect(useCart.getState().discount()).toBe(15);
    expect(useCart.getState().total()).toBe(85);
  });

  test('respeta el monto mínimo del cupón', () => {
    useCart.getState().add(makeProduct(1, '3000')); // S/30
    useCart.getState().setCoupon({ code: 'X', discount_type: 'percent', amount: 15, minimum_amount: 50 });
    expect(useCart.getState().discount()).toBe(0); // no llega al mínimo
  });

  test('quitar deja el carrito vacío', () => {
    useCart.getState().add(makeProduct(1, '5500'));
    useCart.getState().remove(1);
    expect(useCart.getState().items).toHaveLength(0);
  });
});

import React from 'react';
import { Linking } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { WebCartScreen } from './WebCartScreen';
import { ProductDetailScreen } from './ProductDetailScreen';
import { useCart } from '../store/cartStore';

/**
 * Build que NO es de producción (preview/desarrollo) apuntando a un staging por http:
 * "Continuar en la web" y "Ver en la web" deben abrir el host de staging de la configuración.
 */
jest.mock('../config/features', () => ({
  PURCHASE_ENABLED: false,
  CART_ENABLED: true,
  IS_PRODUCTION_BUILD: false,
  STORE_API_URL: 'http://203.0.113.10/wp-json/wc/store/v1',
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../utils/cartRevalidation', () => ({ revalidateCart: jest.fn().mockResolvedValue({ issues: [], priceChanged: false }) }));
jest.mock('../api/products', () => ({
  fetchProducts: jest.fn().mockResolvedValue({ products: [], total: 0, totalPages: 1 }),
  fetchProduct: jest.fn().mockResolvedValue({
    id: 7,
    name: 'Vitamina C',
    permalink: 'http://203.0.113.10/producto/vitamina-c/',
    sku: 'ABC',
    is_in_stock: true,
    prices: { price: '1000', currency_minor_unit: 2, regular_price: '1000', sale_price: '1000' },
    images: [],
    brands: [],
    review_count: 0,
    average_rating: '0',
    short_description: '',
    description: '',
  }),
  fetchProductExtra: jest.fn().mockResolvedValue(null),
  fetchReviews: jest.fn().mockResolvedValue([]),
}));

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
});

describe('enlaces a la web en preview (staging por http)', () => {
  it('"Continuar en la web" abre el carrito web del host de staging', async () => {
    useCart.setState({ items: [{ productId: 7, name: 'Vitamina C', image: '', unitPrice: 10, quantity: 2, stockLimit: null }], coupon: null });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    let r!: TestRenderer.ReactTestRenderer;
    const props = { navigation: { navigate: jest.fn() }, route: {} } as unknown as React.ComponentProps<typeof WebCartScreen>;
    await act(async () => {
      r = TestRenderer.create(<WebCartScreen {...props} />);
    });
    mounted.push(r);
    await act(async () => {
      r.root.findAllByProps({ accessibilityLabel: 'Continuar en la web' })[0].props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('http://203.0.113.10/?bcy_cart=7-2&utm_source=app');
    openURL.mockRestore();
  });

  it('"Ver en la web" abre el permalink del host de staging con utm_source=app', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    let r!: TestRenderer.ReactTestRenderer;
    const props = {
      navigation: { setOptions: jest.fn(), goBack: jest.fn(), push: jest.fn() },
      route: { params: { id: 7 } },
    } as unknown as React.ComponentProps<typeof ProductDetailScreen>;
    await act(async () => {
      r = TestRenderer.create(<ProductDetailScreen {...props} />);
    });
    mounted.push(r);
    await act(async () => {
      r.root.findAllByProps({ accessibilityLabel: 'Ver en la web' })[0].props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('http://203.0.113.10/producto/vitamina-c/?utm_source=app');
    openURL.mockRestore();
  });
});

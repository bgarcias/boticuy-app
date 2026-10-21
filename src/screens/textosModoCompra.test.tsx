import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { OnboardingScreen } from './OnboardingScreen';
import { ProductDetailScreen } from './ProductDetailScreen';
import { TrustStrip } from '../components/TrustStrip';
import { RootNavigator } from '../navigation';
import * as productsApi from '../api/products';
import type { Product } from '../types';

// Con PURCHASE_ENABLED encendido todos los textos deben ser los originales de la versión etiquetada
// v-con-compra. Los del modo sin compra los cubre textosModoSinCompra.test.tsx.
jest.mock('../config/features', () => ({
  ...(jest.requireActual('../config/features') as object),
  PURCHASE_ENABLED: true,
  CART_ENABLED: true,
  CREATORS_ENABLED: true,
}));
jest.mock('../api/products');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
// Esta pantalla arma una URL con la configuración al cargarse; aquí solo interesa su título en el stack.
jest.mock('./ForgotPasswordScreen', () => ({ ForgotPasswordScreen: () => null }));

// Navegadores simulados: solo guardan las pantallas declaradas para poder leer sus títulos.
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  createNavigationContainerRef: () => ({ getCurrentRoute: () => undefined }),
}));
jest.mock('@react-navigation/native-stack', () => {
  const R = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children),
      Screen: (p: object) => R.createElement('Screen', p),
    }),
  };
});
jest.mock('@react-navigation/bottom-tabs', () => {
  const R = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children),
      Screen: (p: object) => R.createElement('Screen', p),
    }),
  };
});

const products = productsApi as jest.Mocked<typeof productsApi>;

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat(5).join(''));

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: 1,
    name: 'Vitamina C',
    slug: 'vitamina-c',
    permalink: 'https://boticuy.com/producto/vitamina-c/',
    sku: '123',
    short_description: '',
    description: '',
    on_sale: false,
    prices: { price: '2000', regular_price: '2000', sale_price: '2000', currency_minor_unit: 2, currency_symbol: 'S/' },
    images: [],
    brands: [],
    average_rating: '0',
    review_count: 0,
    is_in_stock: true,
    is_purchasable: true,
    low_stock_remaining: null,
    ...over,
  }) as unknown as Product;

async function renderDetail(p: Product) {
  products.fetchProduct.mockResolvedValue(p);
  products.fetchProductExtra.mockResolvedValue(null as never);
  products.fetchProducts.mockResolvedValue({ products: [], total: 0, totalPages: 1 });
  products.fetchReviews.mockResolvedValue([]);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    const props = {
      navigation: { setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn() },
      route: { params: { id: p.id } },
    } as unknown as React.ComponentProps<typeof ProductDetailScreen>;
    r = TestRenderer.create(<ProductDetailScreen {...props} />);
  });
  return r;
}

describe('textos con PURCHASE_ENABLED: los originales de v-con-compra', () => {
  it('onboarding: las tres diapositivas originales, con el monto de envío de la configuración', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<OnboardingScreen {...(({ navigation: { replace: jest.fn() } }) as unknown as React.ComponentProps<typeof OnboardingScreen>)} />);
    });
    const t = texts(r);
    expect(t).toEqual(
      expect.arrayContaining([
        'Tu botica de vitaminas',
        'Vitaminas y suplementos de marcas confiables, a un toque de tu casa.',
        'Envío gratis disponible',
        'En tus compras desde S/69 en zonas seleccionadas. Recíbelo en la puerta de tu casa.',
        'Paga fácil y con asesoría',
        'Yape, Plin o tarjeta. Y te acompañamos por WhatsApp en todo el proceso.',
      ])
    );
    expect(t.join('|')).not.toMatch(/Encuentra lo que necesitas|Explora el catálogo|te llevamos a nuestra web/);
  });

  it('TrustStrip: las cuatro frases originales', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<TrustStrip />);
    });
    expect(texts(r)).toEqual(['Envío gratis\ndisponible', 'Pago\nseguro', 'Productos\noriginales', 'Asesoría\npor WhatsApp']);
  });

  it('ficha: "Pago seguro", "Envío gratis ≥ S/69…" y el botón "Agregar al carrito"', async () => {
    const r = await renderDetail(product());
    const t = texts(r);
    expect(t).toEqual(
      expect.arrayContaining(['Producto original', 'Pago seguro', 'Envío gratis ≥ S/69 en zonas seleccionadas', 'Agregar al carrito'])
    );
    expect(t).not.toContain('Ver en la web');
  });

  it('ficha sin stock: el botón dice "Agregar al carrito" (desactivado), como en la versión original', async () => {
    const r = await renderDetail(product({ is_in_stock: false }));
    expect(texts(r)).toContain('Agregar al carrito');
  });

  it('navegación: título "Pago seguro" en PaymentWebView y "Mi cuenta" en el tab de perfil', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<RootNavigator />);
    });
    const stack = r.root.findAll((n) => (n.type as unknown) === 'Screen');
    const title = (name: string) => stack.find((n) => n.props.name === name)?.props.options?.title;
    expect(title('PaymentWebView')).toBe('Pago seguro');
    expect(title('Login')).toBe('Mi cuenta');

    const tabsComponent = stack.find((n) => n.props.name === 'Tabs')!.props.component as React.ComponentType;
    let tabs!: TestRenderer.ReactTestRenderer;
    act(() => {
      tabs = TestRenderer.create(React.createElement(tabsComponent));
    });
    const tabTitle = (name: string) =>
      tabs.root.findAll((n) => (n.type as unknown) === 'Screen').find((n) => n.props.name === name)?.props.options?.title;
    expect(tabTitle('Perfil')).toBe('Mi cuenta');
    expect(tabTitle('Carrito')).toBe('Carrito');
  });
});

describe('Perfil y navegación con compra: "Mis cupones" sigue en el bloque Cuenta, como antes', () => {
  const renderProfile = (user: { id: number; email: string; nombre: string } | null) => {
    const { useAuth } = require('../store/authStore') as typeof import('../store/authStore');
    act(() => {
      useAuth.setState({ user, tokenReady: true });
    });
    const { ProfileScreen } = require('./ProfileScreen') as typeof import('./ProfileScreen');
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<ProfileScreen {...({ navigation: { navigate: jest.fn() }, route: {} } as unknown as React.ComponentProps<typeof ProfileScreen>)} />);
    });
    return r;
  };

  it('con sesión: la cuenta completa, con "Mis cupones" una sola vez y al final del bloque Cuenta', () => {
    const t = texts(renderProfile({ id: 1, email: 'a@b.c', nombre: 'Ana' }));
    expect(t).toEqual(expect.arrayContaining(['Cerrar sesión', 'Mis favoritos', 'Apoya a tu creador', 'Mis pedidos', 'Mis direcciones', 'Mis puntos', 'Mis cupones']));
    expect(t.filter((x) => x === 'Mis cupones')).toHaveLength(1);
    expect(t.indexOf('Mis cupones')).toBeGreaterThan(t.indexOf('Mis puntos'));
    expect(t.indexOf('Mis cupones')).toBeGreaterThan(t.indexOf('Apoya a tu creador') + 1);
  });

  it('sin sesión: "Inicia sesión" y la lista bloqueada con "Mis cupones" una sola vez', () => {
    const t = texts(renderProfile(null));
    expect(t).toEqual(expect.arrayContaining(['Inicia sesión', 'Al iniciar sesión podrás ver:', 'Mis pedidos', 'Mis puntos', 'Mis cupones', 'Mis direcciones']));
    expect(t.filter((x) => x === 'Mis cupones')).toHaveLength(1);
  });

  it('MyCoupons sigue registrada una sola vez en el stack', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<RootNavigator />);
    });
    const screens = r.root.findAll((n) => (n.type as unknown) === 'Screen' && n.props.name === 'MyCoupons');
    expect(screens).toHaveLength(1);
    expect(screens[0].props.options.title).toBe('Mis cupones');
  });
});

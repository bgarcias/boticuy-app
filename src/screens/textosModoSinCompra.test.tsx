import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { OnboardingScreen } from './OnboardingScreen';
import { ProductDetailScreen } from './ProductDetailScreen';
import { TrustStrip } from '../components/TrustStrip';
import { RootNavigator } from '../navigation';
import * as productsApi from '../api/products';
import type { Product } from '../types';

// Con PURCHASE_ENABLED apagado (el modo por defecto) salen los textos del modo sin compra.
// Los originales de la versión etiquetada v-con-compra los cubre textosModoCompra.test.tsx.
jest.mock('../config/features', () => ({
  ...(jest.requireActual('../config/features') as object),
  PURCHASE_ENABLED: false,
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

describe('textos con PURCHASE_ENABLED apagado: los del modo sin compra', () => {
  it('onboarding: las tres diapositivas nuevas, sin envío ni pago', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<OnboardingScreen {...(({ navigation: { replace: jest.fn() } }) as unknown as React.ComponentProps<typeof OnboardingScreen>)} />);
    });
    const t = texts(r);
    expect(t).toEqual(
      expect.arrayContaining([
        'Tu botica de vitaminas',
        'Vitaminas y suplementos de marcas confiables. Explora el catálogo desde tu celular.',
        'Encuentra lo que necesitas',
        'Busca por producto, marca o necesidad y revisa el detalle de cada uno.',
        'Asesoría cuando la necesites',
        'Pregúntale a Boticuy IA Agente o escríbenos por WhatsApp. Cuando quieras comprar, te llevamos a nuestra web.',
      ])
    );
    expect(t.join('|')).not.toMatch(/Envío gratis|Yape|Plin|tarjeta|Paga fácil|a un toque de tu casa/);
  });

  it('TrustStrip: solo "Productos originales" y "Asesoría por WhatsApp"', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<TrustStrip />);
    });
    expect(texts(r)).toEqual(['Productos\noriginales', 'Asesoría\npor WhatsApp']);
  });

  it('ficha: sin "Pago seguro" ni "Envío gratis"; con "Agregar al carrito" y "Ver en la web"', async () => {
    const r = await renderDetail(product());
    const t = texts(r);
    expect(t).toEqual(expect.arrayContaining(['Producto original', 'Agregar al carrito', 'Ver en la web']));
    expect(t.join('|')).not.toMatch(/Pago seguro|Envío gratis/);
  });

  it('ficha sin stock: el botón dice "Sin stock"', async () => {
    const r = await renderDetail(product({ is_in_stock: false }));
    const t = texts(r);
    expect(t.filter((x) => x === 'Sin stock').length).toBeGreaterThan(1); // etiqueta + botón
    expect(t).not.toContain('Agregar al carrito');
  });

  it('navegación: PaymentWebView no existe en el stack; el tab de perfil se llama "Perfil"', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<RootNavigator />);
    });
    const stack = r.root.findAll((n) => (n.type as unknown) === 'Screen');
    expect(stack.find((n) => n.props.name === 'PaymentWebView')).toBeUndefined();
    expect(stack.find((n) => n.props.name === 'Login')).toBeUndefined();

    const tabsComponent = stack.find((n) => n.props.name === 'Tabs')!.props.component as React.ComponentType;
    let tabs!: TestRenderer.ReactTestRenderer;
    act(() => {
      tabs = TestRenderer.create(React.createElement(tabsComponent));
    });
    const tabTitle = (name: string) =>
      tabs.root.findAll((n) => (n.type as unknown) === 'Screen').find((n) => n.props.name === name)?.props.options?.title;
    expect(tabTitle('Perfil')).toBe('Perfil');
  });
});

describe('Perfil y navegación sin compra: "Mis cupones" sin cuenta', () => {
  const renderProfile = () => {
    const { ProfileScreen } = require('./ProfileScreen') as typeof import('./ProfileScreen');
    const navigate = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<ProfileScreen {...({ navigation: { navigate }, route: {} } as unknown as React.ComponentProps<typeof ProfileScreen>)} />);
    });
    return { r, navigate };
  };

  it('Perfil muestra "Mis cupones" junto a "Apoya a tu creador", sin pedidos, direcciones, puntos ni inicio de sesión', () => {
    const { r } = renderProfile();
    const t = texts(r);
    expect(t).toEqual(expect.arrayContaining(['Mis favoritos', 'Apoya a tu creador', 'Mis cupones']));
    expect(t.indexOf('Mis cupones')).toBe(t.indexOf('Apoya a tu creador') + 1);
    expect(t.join('|')).not.toMatch(/Mis pedidos|Mis direcciones|Mis puntos|Inicia sesión|Al iniciar sesión podrás ver|Cerrar sesión/);
    expect(t.filter((x) => x === 'Mis cupones')).toHaveLength(1);
  });

  it('tocar "Mis cupones" navega a MyCoupons', () => {
    const { r, navigate } = renderProfile();
    let node: TestRenderer.ReactTestInstance | null = r.root.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === 'Mis cupones')[0];
    while (node && typeof node.props.onPress !== 'function') node = node.parent;
    act(() => node!.props.onPress());
    expect(navigate).toHaveBeenCalledWith('MyCoupons');
  });

  it('la pantalla MyCoupons queda registrada en el stack aunque la compra esté apagada', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<RootNavigator />);
    });
    const screens = r.root.findAll((n) => (n.type as unknown) === 'Screen' && n.props.name === 'MyCoupons');
    expect(screens).toHaveLength(1);
    expect(screens[0].props.options.title).toBe('Mis cupones');
  });
});

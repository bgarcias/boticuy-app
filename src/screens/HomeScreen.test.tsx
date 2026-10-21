import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { HomeScreen } from './HomeScreen';
import * as productsApi from '../api/products';
import * as taxApi from '../api/taxonomies';

jest.mock('../api/products');
jest.mock('../api/taxonomies');

const products = productsApi as jest.Mocked<typeof productsApi>;
const tax = taxApi as jest.Mocked<typeof taxApi>;

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat(5).join(''));

async function render() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    const props = { navigation: { navigate: jest.fn() }, route: {} } as unknown as React.ComponentProps<typeof HomeScreen>;
    r = TestRenderer.create(<HomeScreen {...props} />);
  });
  return r;
}

describe('HomeScreen', () => {
  it('si el catálogo falla, el chat sigue visible y cada sección muestra su propio error', async () => {
    products.fetchProducts.mockRejectedValue(new Error('red'));
    tax.fetchNecesidades.mockRejectedValue(new Error('red'));
    tax.fetchMarcas.mockRejectedValue(new Error('red'));
    const r = await render();
    const t = texts(r);
    expect(t).toContain('Boticuy IA Agente');
    expect(t).toContain('en línea');
    expect(t.filter((x) => x === 'No pudimos cargar esta sección.')).toHaveLength(4);
    expect(t.filter((x) => x === 'Reintentar')).toHaveLength(4);
  });

  it('con el catálogo cargado muestra las secciones y no hay hero ni textos de pago o envío', async () => {
    products.fetchProducts.mockResolvedValue({ products: [], total: 0, totalPages: 1 });
    tax.fetchNecesidades.mockResolvedValue([{ id: 1, name: 'Inmunidad', slug: 'inmunidad', count: 3 }]);
    tax.fetchMarcas.mockResolvedValue([]);
    const r = await render();
    const t = texts(r).join(' | ');
    expect(t).toContain('¿Qué necesitas?');
    expect(t).toContain('Inmunidad');
    expect(t).toContain('Boticuy IA Agente');
    expect(t).not.toMatch(/Pago seguro|Envío gratis|Explorar catálogo|Apoya a tu creador/);
  });
});

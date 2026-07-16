/** Productos que no se venden a través del carrito y redirigen a un sitio externo.
 *  No viene de ningún campo de la Store API ni del plugin (ver diagnóstico) —
 *  por eso se mantiene acá, como lista fija de la app. Para agregar un caso
 *  nuevo, solo hace falta sumar un objeto al array. */
export interface ProductoNoVendible {
  sku: string;
  url: string;
}

export const PRODUCTOS_NO_VENDIBLES: ProductoNoVendible[] = [
  { sku: '1400006', url: 'https://drflu.pe/' }, // Dr. Flu – antigripal
];

export function getProductoNoVendible(sku: string | undefined | null): ProductoNoVendible | undefined {
  if (!sku) return undefined;
  return PRODUCTOS_NO_VENDIBLES.find((p) => p.sku === sku);
}

# REQUERIMIENTOS_QA — Boticuy App (auditoría de código, no de diseño)

## Cómo leer este documento

Este documento **no** se basa en `REQUERIMIENTOS.md`, `FUNCIONALIDADES.md`, `ARQUITECTURA.md`, `AUDITORIA.md` ni ningún otro documento de diseño o planeación previa del repositorio. Cada afirmación aquí proviene de leer directamente el código fuente TypeScript/TSX de `boticuy-app/src` (y `App.tsx`) tal como existe hoy. El objetivo es servir de base de auditoría independiente para QA de TI: describe el comportamiento **real observable**, las reglas de negocio **tal como están codificadas** (con archivo y función exactos), y casos de prueba concretos y ejecutables sin contexto previo del proyecto.

Convenciones usadas en todo el documento:
- **Comportamiento observable**: lo que ve/puede hacer el usuario, paso a paso.
- **Reglas de negocio**: validaciones, cálculos, límites y condiciones, citando `archivo:función`.
- **Casos de prueba QA**: divididos en "Deben pasar" (happy path) y "Deben fallar/rechazarse" (validaciones, errores, estados especiales), con datos concretos.
- **Nota/Ambigüedad**: hallazgos donde el código es incompleto, inconsistente, o donde el comportamiento depende de un backend no auditable desde el cliente. Estos NO son necesariamente bugs — son puntos que QA debe confirmar con el equipo de producto/backend antes de reportarlos como defecto.

Cuando dos flujos del código implementan la misma regla de negocio de forma inconsistente entre sí, se documenta explícitamente como hallazgo, ya que representa un riesgo real de comportamiento inesperado para el usuario.

## Índice

1. [Catálogo](#1-catálogo)
2. [Carrito](#2-carrito)
3. [Checkout y pago](#3-checkout-y-pago)
4. [Cuenta / Perfil](#4-cuenta--perfil)
5. [Puntos / Lealtad](#5-puntos--lealtad)
6. [Direcciones](#6-direcciones)
7. [Cupones](#7-cupones)
8. [Favoritos](#8-favoritos)
9. [Pedidos](#9-pedidos)
10. [Autenticación](#10-autenticación)
11. [Navegación global y comportamientos transversales](#11-navegación-global-y-comportamientos-transversales)
12. [Resumen de hallazgos para priorizar](#12-resumen-de-hallazgos-para-priorizar)

---

# 1. Catálogo

## 1.1 Home

**Comportamiento observable:**
1. Al entrar, se muestra un loader de pantalla completa ("Cargando productos…") mientras se hacen 4 llamadas en paralelo: productos destacados, productos de la necesidad "inmunidad", taxonomía de necesidades y taxonomía de marcas (`src/screens/HomeScreen.tsx:42-63`).
2. Si cualquiera de esas llamadas falla, se muestra una pantalla de error de pantalla completa "No pudimos cargar la tienda. Revisa tu conexión." con botón de reintento (`HomeScreen.tsx:57-58,79`).
3. Si carga bien, el usuario ve, en orden: barra de búsqueda, hero con CTA "Explorar catálogo", tira de confianza (`TrustStrip`), banner "Apoya a tu creador favorito", chips horizontales de categorías ("¿Qué necesitas?"), grilla 2 columnas "Más vendidos" (6 productos, no scrolleable, el scroll lo maneja el `ScrollView` padre), fila horizontal "Para tu inmunidad" (hasta 10 productos), fila horizontal "Vistos recientemente" (solo si hay al menos 1 item), y fila de chips "Marcas" (solo si hay al menos 1 marca).
4. Pull-to-refresh (`RefreshControl`) vuelve a ejecutar la misma carga de las 4 llamadas (`HomeScreen.tsx:86-88`).
5. Escribir en la barra de búsqueda y presionar "buscar" (tecla submit) con texto no vacío (tras `trim()`) navega a `Catalogo` con el parámetro `q` y dispara un evento de analítica `SEARCH` con `source: 'home'` (`HomeScreen.tsx:70-76`). Si el texto es vacío o solo espacios, no pasa nada.
6. El botón "x" dentro del input limpia el texto de búsqueda de Home (no navega).
7. Tocar un chip de categoría navega a `Catalogo` con `necesidad: <slug>` y dispara `VIEW_CATEGORY` (`HomeScreen.tsx:138-148`).
8. Tocar un chip de marca navega a `Catalogo` con `marca: <slug>` y dispara `VIEW_BRAND` (`HomeScreen.tsx:177-188`).
9. Tocar el hero CTA o el banner de creador navega a `Catalogo` / `Creators` respectivamente sin parámetros de filtro.
10. Cada `ProductCard` en "Más vendidos"/"Para tu inmunidad"/"Vistos recientemente" permite tocar la tarjeta (ir al detalle) o tocar "Agregar" (añade al carrito sin salir de Home).

**Reglas de negocio:**
- "Más vendidos": `fetchProducts({ perPage: 6, orderby: 'popularity' })` — 6 productos, orden por popularidad descendente (default `order: 'desc'` en `src/api/products.ts:74-79`).
- "Para tu inmunidad": `fetchProducts({ necesidad: 'inmunidad', perPage: 10 })` — filtro fijo por el slug `'inmunidad'`, hasta 10 productos. El slug está hardcodeado en `HomeScreen.tsx:49`; si esa taxonomía no existe en WordPress o no tiene productos, la sección simplemente no se renderiza (`HorizontalProducts` retorna `null` si `products.length === 0`, `src/components/HorizontalProducts.tsx:17`).
- Categorías mostradas = taxonomía `necesidades` completa (`fetchNecesidades()` trae hasta 100 términos vía `wpClient`).
- Marcas mostradas = taxonomía `marcas`, misma regla de 100 términos máx.
- El texto "envío gratis... desde S/69" usa `Constants.expoConfig.extra.envioGratisDesde` (default 69) y `extra.currencySymbol` (default `'S/'`) — configurable por variables de entorno (`EXPO_PUBLIC_ENVIO_GRATIS_DESDE`, `EXPO_PUBLIC_CURRENCY_SYMBOL`).
- "Vistos recientemente" en Home usa el store persistido `useRecentlyViewed` (ver sección 1.5) — se llena únicamente al abrir un detalle de producto, no en Home.

**Casos de prueba QA:**

Deben pasar (happy path):
1. Abrir la app con conexión activa → se muestra loader y luego las secciones descritas; "Más vendidos" muestra exactamente hasta 6 tarjetas en grilla de 2 columnas.
2. Escribir "vitamina c" en el buscador de Home y presionar buscar → navega a Catálogo con ese texto precargado.
3. Tocar el botón "x" del buscador de Home con texto escrito → el campo queda vacío, sin navegar.
4. Deslizar hacia abajo para refrescar → se recargan las 4 fuentes de datos; el indicador de refresh desaparece al finalizar, con o sin error.
5. Tocar una categoría (ej. "Inmunidad") → navega a Catálogo con ese filtro de necesidad ya aplicado.
6. Tocar una marca → navega a Catálogo con ese filtro de marca ya aplicado.
7. Ver un producto en el detalle y volver a Home → la sección "Vistos recientemente" aparece (si antes no había ninguno) mostrando ese producto primero.
8. Tocar "Agregar" en una tarjeta de Home cuando el producto tiene stock → se agrega al carrito sin navegar y se muestra un toast.

Deben fallar/mostrar estados especiales:
1. Sin conexión a internet al abrir Home (o el backend cae) → se muestra pantalla completa de error "No pudimos cargar la tienda. Revisa tu conexión." con botón de reintento; no se muestra ningún contenido parcial (todo-o-nada, por `Promise.all`).
2. Buscar con el input vacío o solo espacios y presionar enter → no navega, no dispara analítica.
3. Si `fetchMarcas()` devuelve 0 marcas → la sección "Marcas" completa (título + chips) no se renderiza.
4. Si no hay ningún producto visto recientemente → la sección "Vistos recientemente" no se renderiza en absoluto.
5. Si la necesidad "inmunidad" no existe o no tiene productos asociados → la sección "Para tu inmunidad" no se renderiza.

**Nota/Ambigüedad:** el slug de la sección curada está fijo en código (`'inmunidad'`); si el equipo de contenido renombra o elimina esa taxonomía en WordPress, la sección desaparece silenciosamente sin mensaje de error visible para QA/usuario.

## 1.2 Listado/Búsqueda de productos (CatalogScreen)

**Comportamiento observable:**
1. Al entrar (con o sin parámetros de navegación `necesidad`/`marca`/`q`), se muestra un skeleton de grilla mientras carga la primera página de productos.
2. Barra de búsqueda propia de Catálogo; escribir un texto muestra, en tiempo real, hasta 3 sugerencias de categoría + 3 de marca cuyo nombre contenga el texto (case-insensitive, `includes`), cada una como "Categoría: X" o "Marca: X" (`CatalogScreen.tsx:44-55`). Tocar una sugerencia limpia el buscador y aplica el filtro de necesidad o marca correspondiente.
3. Si el campo de búsqueda está vacío Y existen búsquedas recientes guardadas, se muestra la sección "Búsquedas recientes" (ver 1.6).
4. Tocar un chip de búsqueda reciente vuelve a agregarlo al frente del historial y coloca el texto en el buscador, disparando una recarga.
5. Al presionar "buscar" con el texto actual, se agrega al historial de búsquedas recientes y se ejecuta `load()`.
6. Fila horizontal de chips de filtro por necesidad: "Todos" (deselecciona) + un chip por cada término de la taxonomía `necesidades`. Solo un filtro de necesidad puede estar activo a la vez; tocar el que ya está activo lo desactiva (toggle) (`CatalogScreen.tsx:176-193`).
7. Si llega un filtro de marca, se muestra una píldora "Marca: <nombre>" con una "x" para quitarlo.
8. Los parámetros de navegación (`route.params.necesidad/marca/q`) se vuelven a aplicar cada vez que cambian.
9. Scroll infinito: al acercarse al final de la lista (`onEndReachedThreshold: 0.5`) se pide la siguiente página y se agrega al final de la lista actual, mostrando un `ActivityIndicator` como footer.
10. Pull-to-refresh reinicia a la página 1 reemplazando la lista completa.
11. Grilla de 2 columnas, igual que en Home.

**Reglas de negocio:**
- Tamaño de página fijo: `PER_PAGE = 20` (`CatalogScreen.tsx:41`).
- `loadMore()` solo se ejecuta si no hay una carga en curso y si la página actual es menor que `totalPages` (`CatalogScreen.tsx:102-106`).
- Orden de resultados: por defecto `orderby: 'popularity'`, `order: 'desc'`; **no existe control de UI para cambiar el orden** (precio, más recientes, etc.), pese a que el título de la funcionalidad sugiere "ordenamiento".
- **Ruteo dual de búsqueda según filtro** (`src/api/products.ts:42-89`, `fetchProducts()`):
  - Sin `necesidad` ni `marca`: usa la Store API pública de WooCommerce directamente (`storeClient.get('/products', ...)`).
  - Con `necesidad` y/o `marca` activos: primero llama al BFF (`bffClient.get('/products', {necesidad, marca, search, page, per_page})`) para resolver a IDs de producto + `total`/`total_pages`; luego pide esos IDs puntuales a la Store API. Si el BFF devuelve 0 IDs, retorna lista vacía sin llamar a la Store API.
  - Si el BFF falla mientras hay un filtro de necesidad/marca activo, la promesa rechaza y `CatalogScreen` muestra el error genérico "No pudimos cargar el catálogo.", salvo que sea un `loadMore` (mode `'more'`), en cuyo caso el error se traga silenciosamente.
- Paginación combinada: con taxonomía, `totalPages` viene del BFF (`total_pages`); sin taxonomía, viene de los headers HTTP `x-wp-totalpages` de la Store API (fallback `1`).
- Historial de búsquedas: `addRecent(search)` internamente hace `trim()` y descarta strings vacíos; duplicados (case-insensitive) se remueven antes de reinsertar al frente; máximo 8 (ver 1.6).
- Estado vacío: si `products.length === 0` tras cargar (sin error), se muestra `Empty` con `"No encontramos productos con ese filtro."`.

**Casos de prueba QA:**

Deben pasar (happy path):
1. Entrar a Catálogo sin parámetros → grilla de hasta 20 productos ordenados por popularidad descendente, "Todos" resaltado.
2. Escribir "colageno" en el buscador → aparecen sugerencias en vivo si alguna categoría/marca contiene ese texto.
3. Presionar enter con "omega 3" → se guarda en búsquedas recientes y se recargan resultados filtrados por ese texto.
4. Con el campo vacío y al menos una búsqueda previa → aparece "Búsquedas recientes"; tocar un chip llena el buscador y recarga.
5. Tocar "Borrar" en Búsquedas recientes → la sección desaparece completamente.
6. Tocar un chip de categoría → la grilla se recarga mostrando solo productos de esa necesidad; el chip queda resaltado.
7. Tocar el mismo chip ya activo → se desactiva (toggle), vuelve "Todos" a estado activo.
8. Llegar desde Home con un filtro de marca → se muestra la píldora "Marca: <Nombre>"; tocar la "x" quita el filtro y recarga sin él.
9. Hacer scroll hasta el final con más páginas disponibles → aparece spinner al pie y se agregan más productos sin reemplazar los ya mostrados.
10. Pull-to-refresh → reinicia a página 1 con los mismos filtros activos.
11. Combinar filtro de necesidad + texto de búsqueda simultáneamente → ambos se envían juntos al BFF.

Deben fallar/mostrar estados especiales:
1. Buscar un texto sin coincidencias (ej. "xyzxyz123") → `Empty` con "No encontramos productos con ese filtro."
2. Error de red en la carga inicial o al cambiar de filtro → `ErrorView` con "No pudimos cargar el catálogo." y botón de reintento.
3. Error de red durante `loadMore` (scroll infinito) → se ignora silenciosamente, sin mensaje visible; QA debe verificar que la página no avanzó y que reintentar el scroll vuelve a intentarla.
4. Filtro de necesidad/marca con el BFF caído → falla toda la carga con "No pudimos cargar el catálogo." (a diferencia del filtro sin taxonomía, que sigue funcionando solo con la Store API).
5. Filtro de necesidad/marca cuyo término no tiene productos asociados → estado vacío, no un error.
6. Enter con buscador vacío/espacios → no se agrega al historial, pero sí recarga sin filtro de texto.
7. Intentar cargar más en la última página → `loadMore()` no hace nada, sin spinner ni repetición.

## 1.3 Detalle de producto (ProductDetailScreen)

**Comportamiento observable:**
1. Al entrar con un `id`, se muestra un skeleton mientras se hacen 4 llamadas en paralelo: producto base, datos "extra" (BFF), productos relacionados (10 más vendidos) y reseñas.
2. Si `fetchProduct`, `fetchReviews` o `fetchProducts` (relacionados) fallan, se muestra `ErrorView` "No pudimos cargar el producto." con reintento. Si solo falla `fetchProductExtra` (BFF), no se rompe la pantalla (devuelve `null` silenciosamente).
3. Al cargar exitosamente, se registra el producto en "Vistos recientemente" y se dispara `VIEW_PRODUCT`.
4. Header con compartir (`Share.share` nativo) y favorito (corazón toggle).
5. Galería de imágenes deslizable con puntos indicadores y modal de pantalla completa.
6. Debajo: marca, nombre, rating (solo si `review_count > 0`), precio, contenido neto (si viene del BFF), aviso de stock, descripción corta, fila de confianza, secciones expandibles de HTML (Beneficios/Composición/Advertencias/Referencias, cada una solo si tiene contenido), fallback a descripción base de WooCommerce si el BFF no respondió, reseñas (si hay al menos 1), y fila "También te puede interesar".
7. Barra inferior fija: si el producto es "no vendible" (ver 1.4), se reemplaza el selector de cantidad/CTA por el aviso de compra externa. Si es vendible, selector de cantidad (mínimo 1, topado a `low_stock_remaining` cuando el backend reporta stock bajo) y botón "Agregar al carrito", deshabilitado si `!product.is_in_stock`.
8. Al agregar: `add(product, qty)`, toast ("Agregado al carrito" o "{qty} agregados al carrito"), evento `ADD_TO_CART` con `source: 'detail'`, y `navigation.goBack()`.
9. Tocar un producto relacionado navega (push) a otro detalle.

**Reglas de negocio:**
- **Rating/estrellas** (`src/components/Stars.tsx`): clamp 0-5; dibuja `star` si `rating >= posición`, `star-half` si `rating >= posición - 0.5`, si no `star-outline` (redondeo visual a medias estrellas hacia abajo, ej. 3.7 → 3 llenas + 1 media + 1 vacía). Texto con 1 decimal fijo y pluralización manual ("1 reseña" vs "N reseñas").
- **La fila de rating solo se muestra si `product.review_count > 0`**, sin importar el valor de `average_rating`.
- **Precio** (`src/components/Price.tsx` + `src/utils/format.ts`): `priceToSoles()`/`regularToSoles()` dividen por `10^currency_minor_unit` (default 2). "En oferta" (`onSale`) se determina por `regular > current` (comparación numérica propia), **no** por el flag `product.on_sale` de la API — mientras que `ProductCard` sí usa `product.on_sale` para el badge "OFERTA". Son dos fuentes distintas que podrían no coincidir si el backend marca `on_sale=true` sin que `regular_price > price`.
- **Stock**: `!product.is_in_stock` → "Sin stock" en rojo, botón deshabilitado. En stock con `low_stock_remaining > 0` → "¡Solo quedan {N}! 🔥" en ámbar. Si es `null` o 0, no se muestra aviso.
- **Selector de cantidad**: "–" nunca baja de 1; "+" se topa a `product.low_stock_remaining` cuando ese valor es un número mayor a 0 (mismo dato usado para el aviso "¡Solo quedan {N}!"), y el botón "+" se deshabilita al llegar al máximo. Si `low_stock_remaining` es `null` (WooCommerce no reporta stock bajo), no hay tope — se asume que hay stock suficiente.
- **Secciones de contenido enriquecido**: cada una se oculta si el HTML viene vacío o si tras `stripHtml` el texto queda vacío.
- **Fallback de descripción**: solo aparece si `extra` es `null` (BFF falló) Y `product.description` no está vacía. Si `extra` respondió pero todas sus secciones vinieron vacías, **no** aparece ningún fallback — el usuario puede quedarse sin descripción visible pese a existir una en la API base.
- **Relacionados**: siempre los 10 productos más populares del catálogo completo, excluyendo el actual por id — pueden salir 9 o 10 según si el producto actual está entre los top 10.
- **Reseñas**: hasta 10, ordenadas por rating descendente (no por fecha). Si falla la llamada, se retorna `[]` silenciosamente.
- **Producto "no vendible"**: determinado por SKU exacto (ver 1.4) — tiene prioridad total sobre el estado de stock.

**Casos de prueba QA:**

Deben pasar (happy path):
1. Producto con stock normal → sin avisos de stock, botón habilitado.
2. `average_rating: "4.5"`, `review_count: 20` → 4 estrellas llenas + 1 media, "4.5 · 20 reseñas".
3. `review_count: 1` → "X.X · 1 reseña" (singular).
4. `regular_price` (100.00) > `price` (79.90) → "S/ 79.90" grande + "S/ 100.00" tachado.
5. Sin descuento (`regular_price === price`) → solo precio actual.
6. `low_stock_remaining: 3`, `is_in_stock: true` → "¡Solo quedan 3! 🔥" en ámbar, botón habilitado.
7. Tocar "+" tres veces desde 1 → cantidad 4; agregar → toast "4 agregados al carrito", analítica `qty: 4`, regresa a la pantalla anterior.
8. Tocar "–" en cantidad 1 → permanece en 1.
9. Compartir → diálogo nativo con nombre y permalink.
10. Favorito → alterna heart/heart-outline, persiste al recargar.
11. `extra.beneficios` no vacío → sección "Beneficios" renderizada.
12. BFF falla pero `description` base no vacía → sección "Descripción" con texto plano.
13. Tocar un relacionado → navega (push) permitiendo volver atrás.
14. `low_stock_remaining: 3` → tocar "+" repetidamente hasta llegar a cantidad 3 → el botón "+" se deshabilita y no permite superar 3.

Deben fallar/mostrar estados especiales:
1. `fetchProduct` falla → `ErrorView` "No pudimos cargar el producto." con reintento; nada del producto se renderiza.
2. `is_in_stock: false` → "Sin stock" rojo, botón deshabilitado (salvo que además sea no vendible, en cuyo caso ni se renderiza el botón).
3. `review_count: 0` → sin fila de estrellas ni texto de calificación.
4. `fetchReviews` falla → sin sección de reseñas, sin mensaje de error.
5. `fetchProductExtra` falla → sin error visible; fallback a "Descripción" solo si hay `description` base.
6. Producto sin imágenes → bloque gris vacío, sin puntos indicadores.
7. Todas las secciones de `extra` vacías pero `extra` no es `null` → ninguna sección se muestra, **ni siquiera el fallback**, aunque `product.description` tenga contenido (hueco de UX a confirmar con negocio).
8. Los 10 relacionados incluyen al producto actual → la fila muestra solo 9.

## 1.4 Productos no vendibles / aviso de compra externa

**Comportamiento observable:**
1. En cualquier `ProductCard` de un producto en la lista fija de no vendibles, el botón "Agregar"/"Sin stock" se reemplaza por un botón compacto "Dónde comprar" (`src/components/ProductCard.tsx:92-93`).
2. En el detalle, la barra inferior completa se reemplaza por un aviso ("Este producto no se vende en la app ni en la web de Boticuy. Cómpralo directamente en su sitio oficial.") y un botón grande "Dónde comprar".
3. Tocar "Dónde comprar" abre la URL configurada en el navegador/app externa (`Linking.openURL`); si falla, el error se descarta silenciosamente sin feedback al usuario.
4. El corazón de favoritos y el detalle del producto siguen funcionando normalmente.

**Reglas de negocio:**
- Determinación exclusivamente por **coincidencia exacta de SKU** contra un array hardcodeado: `PRODUCTOS_NO_VENDIBLES` en `src/constants/productosNoVendibles.ts:10-12`. Actualmente contiene un único registro: `{ sku: '1400006', url: 'https://drflu.pe/' }`.
- `getProductoNoVendible(sku)` devuelve `undefined` si `sku` es `undefined`/`null`/vacío o no coincide.
- Esta lista **no proviene de la API** — es responsabilidad exclusiva del código cliente; agregar/quitar un producto requiere un nuevo release/OTA.
- El estado de stock es irrelevante: aunque tenga stock, un producto no vendible nunca muestra el flujo de agregar al carrito.

**Casos de prueba QA:**

Deben pasar:
1. Producto con SKU `1400006` en cualquier listado → botón "Dónde comprar" en vez de "Agregar"/"Sin stock".
2. Tocar "Dónde comprar" en la tarjeta → abre `https://drflu.pe/`.
3. Detalle del SKU `1400006` → aviso completo + botón grande "Dónde comprar" en vez del selector de cantidad.
4. Tocar "Dónde comprar" en el detalle → abre la misma URL.
5. Favorito sigue funcionando con normalidad en un producto no vendible.
6. Cualquier otro SKU (incluyendo vacío/`null`) → comportamiento de producto vendible normal.

Deben fallar/mostrar estados especiales:
1. SKU `undefined`/`null`/vacío → tratado como vendible normal, sin excepción.
2. Sin app/navegador capaz de abrir la URL → `.catch` silencioso, sin mensaje de error visible.
3. Producto no vendible sin stock → igual muestra compra externa, no "Sin stock" (la regla de no-vendible tiene prioridad total).

**Nota/Ambigüedad:** el matching es por SKU string exacto; variaciones de formato (mayúsculas, espacios, prefijos) no coinciden y el producto se trata como vendible.

## 1.5 Recientemente vistos

**Comportamiento observable:**
1. Cada detalle de producto cargado exitosamente se registra automáticamente al frente de la lista (`ProductDetailScreen.tsx:101`, sin acción del usuario).
2. En Home, si hay al menos 1 producto visto, aparece la fila "Vistos recientemente".
3. Persiste entre sesiones (AsyncStorage).

**Reglas de negocio:**
- `src/store/recentlyViewedStore.ts`, clave `'boticuy-recently-viewed'`, `MAX = 12`.
- `record(product)`: quita duplicados por `id` y coloca el nuevo al frente, recorta a 12.
- Se guarda el snapshot completo del producto (precio/stock "congelados" hasta que se vuelva a ver).
- Existe `clear()` en el store pero **no hay ninguna UI que la invoque** — no hay forma de vaciar el historial manualmente.

**Casos de prueba QA:**

Deben pasar:
1. Lista vacía → ver producto A → Home muestra la fila con A.
2. Ver B después de A → fila muestra B primero, luego A.
3. Re-ver A → A se mueve al frente sin duplicarse.
4. Ver 13 productos distintos → solo quedan los últimos 12.
5. Cerrar/reabrir la app → persiste igual.
6. Tocar un producto en la fila → navega y se re-registra.

Deben fallar/mostrar estados especiales:
1. Sin productos vistos → la sección no aparece en absoluto.
2. Si `fetchProduct` falla al abrir un detalle → el producto NO se registra (solo se registra tras `Promise.all` exitoso).
3. No existe forma de eliminar un ítem individual o vaciar el historial desde la UI — no reportar como bug sin confirmar con el equipo.

## 1.6 Búsquedas recientes

**Comportamiento observable:**
1. Al presionar "buscar" en Catálogo, el texto se agrega al historial.
2. Con el campo vacío y al menos 1 búsqueda guardada, se muestra "Búsquedas recientes" con chips y un enlace "Borrar".
3. Tocar un chip lo mueve al frente y coloca el texto en el buscador (recarga resultados).
4. "Borrar" vacía todo el historial de una vez (no hay borrado individual en la UI).
5. El buscador de **Home** no interactúa con este store en absoluto.

**Reglas de negocio:**
- `src/store/recentSearchesStore.ts`, clave `'boticuy-recent-searches'`, `MAX = 8`.
- `add(q)`: recorta espacios; si queda vacío, no modifica el estado. Elimina duplicados (case-insensitive) antes de insertar al frente.
- `remove(q)` existe en el store pero no se usa en ninguna pantalla.
- Se conserva el texto con las mayúsculas/minúsculas de la búsqueda más reciente (deduplicación case-insensitive puede "perder" la variante anterior).

**Casos de prueba QA:**

Deben pasar:
1. Buscar "colágeno" con historial vacío → aparece como chip al vaciar el campo.
2. Buscar "vitamina d", "zinc", "magnesio" en secuencia → orden de chips: magnesio, zinc, vitamina d.
3. Buscar "OMEGA 3" y luego "omega 3" → una sola entrada "omega 3" (la más reciente).
4. Tocar un chip → llena el buscador, recarga, y lo mueve al frente.
5. "Borrar" con 3 búsquedas → la sección desaparece completamente.
6. 9 búsquedas distintas en secuencia → quedan solo las últimas 8.
7. Cerrar/reabrir la app → historial persiste.

Deben fallar/mostrar estados especiales:
1. Buscar vacío/espacios → no se agrega al historial, pero sí recarga sin filtro.
2. Con texto en el campo, la sección de recientes no se muestra aunque existan guardadas.
3. No hay forma de borrar un solo término (solo "Borrar todo").
4. El buscador de Home nunca alimenta ni lee este historial.

---

# 2. Carrito

## 2.1 Agregar/quitar productos

**Comportamiento observable:**
1. Cada línea muestra imagen, nombre, precio unitario y control de cantidad "–"/"+".
2. El ícono de basura elimina la línea completa sin confirmación, dispara `REMOVE_FROM_CART`.
3. Carrito vacío → estado vacío ("Tu carrito está vacío") con botón "Ver productos"; no se puede ver ningún resumen (envío gratis, cupón, total) en este estado.

**Reglas de negocio:**
- `add()` (`src/store/cartStore.ts`): precio unitario calculado con `priceToSoles()`. Si el producto ya existe, suma la cantidad a la existente en vez de duplicar línea.
- **Tope de cantidad por stock**: `add()` calcula `limit` desde `product.low_stock_remaining` (mismo criterio que el selector de `ProductDetailScreen`, ver 1.3) — si es un número, la cantidad final (nueva o sumada a la existente) se topa a ese valor con `Math.min`; si es `null`, no hay tope. Cada `CartItem` guarda ese tope (`stockLimit`) para que `setQty()` lo siga respetando después (ver 2.2). Si el tope calculado da `≤0`, el producto no se agrega.
- `remove()` filtra por `productId`, elimina sin importar la cantidad.
- Sin imágenes → placeholder gris.
- **Revalidación de stock al abrir el carrito**: `CartScreen` vuelve a consultar `fetchProduct()` para cada ítem cada vez que la pestaña Carrito recibe foco (`useFocusEffect`). Si el producto ya no tiene stock (`!is_in_stock`) o la consulta falla (producto eliminado), se quita del carrito y se agrega el aviso `"{nombre}" ya no está disponible.`; si el stock (`low_stock_remaining`) es menor a la cantidad guardada, se ajusta con `setQty()` y se agrega `Se ajustó la cantidad de "{nombre}" a {qty} (stock limitado).`. Si hubo algún ajuste, se muestra un único toast (`variant:'warning'`, 5000ms) con todos los avisos juntos — mismo patrón que "Volver a pedir" en pedidos (ver 9.4).

**Casos de prueba QA:**

Deben pasar:
1. Agregar Producto A (S/55.00) una vez → 1 línea, cantidad 1, subtotal S/55.00.
2. Agregar el mismo Producto A dos veces → 1 línea, cantidad 2, subtotal S/110.00.
3. Agregar A y B, eliminar A → queda solo B; se dispara `REMOVE_FROM_CART`.
4. Eliminar el único producto → cambia inmediatamente a estado vacío.
5. Producto sin imágenes → bloque gris 64x64.
6. Agregar un producto con `low_stock_remaining: 3` pidiendo cantidad 10 → se agrega con cantidad 3 (topada), sin mensaje de error.
7. Abrir el carrito con un producto cuyo stock real bajó de 5 (guardado) a 2 → al recibir foco la pantalla, la cantidad se ajusta a 2 automáticamente y aparece el toast `Se ajustó la cantidad de "{nombre}" a 2 (stock limitado).`
8. Abrir el carrito con un producto que fue eliminado del catálogo → desaparece de la lista y aparece el toast `"{nombre}" ya no está disponible.`

Deben fallar/rechazarse:
1. Agregar un producto con `low_stock_remaining: 0` → no se agrega ninguna línea (cantidad final `≤0`).
2. Producto agotado (`is_in_stock:false`) detectado recién al abrir el carrito (no al agregarlo) → se quita automáticamente en el siguiente foco de la pantalla, no permanece indefinidamente como si tuviera stock.

## 2.2 Modificar cantidades

**Comportamiento observable:**
1. Botones "–"/"+" llaman `setQty(productId, qty±1)`. No hay campo de texto para escribir cantidad directamente.
2. Bajar a 0 (pulsar "–" en cantidad 1) elimina la línea automáticamente.

**Reglas de negocio:**
- `setQty()`: si `qty <= 0`, elimina el item; si no, topa la cantidad solicitada al `stockLimit` guardado en ese ítem (asignado por `add()`, ver 2.1) antes de actualizar. Si `stockLimit` es `null`, no hay tope.
- Totales se recalculan reactivamente sin acción adicional.

**Casos de prueba QA:**

Deben pasar:
1. Cantidad 3 → "–" una vez → cantidad 2, subtotal recalculado proporcionalmente.
2. Cantidad 1 → "–" → la línea desaparece.
3. Cantidad 1 → "+" x5 → cantidad 6, sin error (producto sin tope de stock conocido).
4. Cambiar cantidad de un producto no afecta a otros.
5. Producto con `stockLimit: 3` guardado, tocar "+" repetidamente desde cantidad 1 → se detiene en 3, no sigue subiendo.

Deben fallar/rechazarse:
1. `setQty(productId, -5)` (no expuesto en UI pero posible vía store directo) → elimina el item, igual que 0.
2. `setQty(productId, 999)` sobre un ítem con `stockLimit: 3` (vía store directo) → la cantidad queda en 3, no en 999.

## 2.3 Cálculo de totales

**Comportamiento observable:**
1. Resumen muestra, en orden: barra de envío gratis, campo de cupón, "Subtotal", "Descuento (CODIGO)" (solo si > 0), "Total" destacado.
2. "Ir a pagar" navega a Checkout y dispara `BEGIN_CHECKOUT`.

**Reglas de negocio (`src/store/cartStore.ts`):**
- `subtotal()` = suma de `unitPrice * quantity`.
- `discount()`:
  - Sin cupón → 0.
  - Con `minimum_amount` y subtotal menor → 0 (el cupón queda "aplicado" pero sin efecto).
  - `discount_type === 'percent'` → `round(subtotal * amount / 100, 2 decimales)`.
  - `discount_type === 'fixed_cart'` → `min(amount, subtotal)`.
  - Cualquier otro tipo → 0.
- `total()` = `max(0, subtotal() - discount())` — nunca negativo.
- El canje de puntos **no** se resta en `cartStore.ts` — se maneja únicamente en Checkout (ver 5.2/3.1).

**Casos de prueba QA (cálculo exacto):**

Deben pasar:
1. 1 x S/55.00, sin cupón → Subtotal S/55.00, sin línea de descuento, Total S/55.00.
2. 2 x S/55.00 → Subtotal S/110.00, Total S/110.00.
3. 1 x S/100.00 + cupón `percent 15%`, `minimum_amount 0` → Descuento S/15.00, Total S/85.00.
4. S/200.00 + cupón `fixed_cart` S/30 → Descuento S/30.00, Total S/170.00.
5. S/20.00 + cupón `fixed_cart` S/50 (mayor que subtotal) → Descuento tope S/20.00, Total S/0.00.
6. S/100.00 + cupón `percent 33%` → Descuento S/33.00, Total S/67.00 (verificar redondeo con montos con tercer decimal, ej. S/33.33 al 15% → S/5.00).

Deben fallar/rechazarse:
1. S/30.00 + cupón `percent 15%` con `minimum_amount 50` → Descuento S/0.00, Total = Subtotal; la línea "Descuento" no debe mostrarse.
2. `discount_type` desconocido → Descuento S/0.00 silenciosamente, sin aviso al usuario.
3. Carrito vacío → no debe poder verse el bloque de totales ni "Ir a pagar".

## 2.4 Barra de envío gratis

**Comportamiento observable:**
1. Siempre visible arriba del campo de cupón, sin depender de sesión.
2. Umbral alcanzado → check verde + "¡Tienes envío gratis en Lima! 🎉", barra al 100%.
3. No alcanzado → bicicleta + "Te faltan S/ X.XX para envío gratis en Lima", barra proporcional.

**Reglas de negocio (`src/components/FreeShippingBar.tsx`):**
- Umbral default (invitado/bronce): `extra.envioGratisDesde ?? 69`.
- Umbral reducido (plata/oro): `extra.envioGratisDesdeNivel ?? 59`.
- Nivel obtenido vía `fetchPoints()` solo si hay sesión; sin sesión, siempre umbral 69.
- `reached = subtotal >= meta` (inclusivo). `pct = clamp(subtotal/meta, 0, 1)`. `falta = max(0, meta - subtotal)`.

**Casos de prueba QA:**

Deben pasar:
1. Invitado, subtotal S/69.00 exacto → `reached=true`, barra 100%.
2. Invitado, subtotal S/40.00 → "Te faltan S/29.00...", barra ≈57.97%.
3. Nivel plata/oro, subtotal S/59.00 → `reached=true` aunque no llegue a 69.
4. Nivel plata, subtotal S/50.00 → "Te faltan S/9.00..." (umbral 59).
5. Nivel bronce → usa umbral 69, igual que invitado.

Deben fallar/rechazarse (validar que no rompan la UI):
1. Subtotal muy superior al umbral → barra queda al 100%, sin desbordarse.
2. Fallo de `fetchPoints()` para usuario logueado → `level=null`, usa umbral default sin error visible.

## 2.5 Aplicar/quitar cupón en carrito

Ver detalle completo de reglas de cupón en la [sección 7](#7-cupones). Resumen específico del carrito:

**Comportamiento observable:**
1. Sin cupón → input "¿Tienes un cupón? Escríbelo aquí" + botón "Aplicar" (deshabilitado si vacío).
2. Texto se autoconvierte a mayúsculas.
3. Válido → toast "Cupón {CODE} aplicado 🎉", chip verde con "Cupón {CODE} · −S/X.XX" y botón "Quitar".
4. Inválido → mensaje de error en rojo, no se aplica.
5. "Quitar" → `setCoupon(null)` inmediato, sin confirmación ni toast.

**Reglas de negocio clave:**
- Solo un cupón a la vez.
- Validación adicional en cliente de `minimum_amount` contra el subtotal actual, independiente de lo que diga el backend.
- Si el subtotal cae debajo del mínimo después de aplicado, el cupón **sigue "aplicado"** en el estado (no se quita solo), pero la UI deja de mostrar el chip verde de descuento y en su lugar muestra un aviso ámbar: "Cupón {CODE} — agrega {monto faltante} más para usarlo" (ver detalle en 7.2).

**Casos de prueba QA:** ver sección 7.2 (contiene los casos detallados con datos concretos).

## 2.6 Canjear puntos en carrito

**Hallazgo crítico:** el canje de puntos **no está implementado en el carrito**. `PointsRedeemField` solo se usa en `CheckoutScreen.tsx` — no hay ninguna referencia en `CartScreen.tsx` ni campos relacionados en `cartStore.ts`. Cualquier caso de prueba de "canjear puntos en el carrito" debe marcarse **No Aplicable** y probarse en Checkout (ver sección 3.1 / 5.2).

## 2.7 Persistencia del carrito

**Comportamiento observable:** el carrito sobrevive a cerrar y reabrir la app.

**Reglas de negocio:**
- Middleware `persist` de Zustand + `AsyncStorage`, clave `'boticuy-cart'`.
- `partialize`: solo se persisten `items` y `coupon`.
- No hay expiración ni re-validación del cupón persistido contra el backend al reabrir la app.
- `clear()` limpia `items` y `coupon` juntos.

**Casos de prueba QA:**

Deben pasar:
1. Agregar 2 productos, cerrar completamente la app, reabrir → mismos productos y cantidades.
2. Aplicar cupón, cerrar/reabrir → sigue aplicado y el descuento se sigue calculando igual.
3. `clear()` (post-compra) → tanto `items` como `coupon` quedan vacíos y así persisten.

Deben fallar/rechazarse (edge cases):
1. AsyncStorage corrupto/vacío en primer arranque → inicializa `items:[]`, `coupon:null` sin crashear.
2. Cupón persistido cuyo mínimo ya no se cumple → no crashea, el chip pasa a mostrar el aviso ámbar "agrega X más para usarlo" (ver 7.2) en vez de un descuento en S/0.00.
3. Cupón persistido ya expirado en WooCommerce → sin re-validación al reabrir, se sigue aplicando localmente con datos viejos hasta que el usuario intente pagar (validar si Checkout re-valida).

---

# 3. Checkout y pago

## 3.1 Datos de envío en checkout

**Comportamiento observable:** con el carrito vacío, `CheckoutScreen` solo muestra "Tu carrito está vacío." Con ítems, se muestra un formulario scrolleable:

- Sin sesión: aviso "Compra sin crear cuenta. Solo necesitamos tus datos de entrega."
- Campos "Tus datos": Nombre completo, Correo, Celular/WhatsApp, DNI (todos obligatorios).
- Con sesión y direcciones guardadas: chips "Usar mis datos guardados" que autocompletan teléfono, DNI, ubigeo y dirección.
- Con sesión: nombre/email se precargan del perfil si están vacíos.
- Si existe un perfil local guardado (SecureStore, clave `boticuy-checkout-profile`), se precarga todo y se marca "Recordar mis datos" automáticamente.
- Checkbox "Recordar mis datos" (opt-in): al confirmar, si está marcado, persiste el perfil completo en SecureStore y (si hay sesión) llama `addAddress()` para guardarla en la cuenta; si no está marcado, borra cualquier perfil guardado.
- Campo "Referencia" opcional.

**Reglas de negocio (`validate()`, `CheckoutScreen.tsx:209-223`):**
- `nombre`: obligatorio → `'Ingresa tu nombre'`.
- `email`: `isValidEmail()` → `'Correo inválido'`.
- `telefono`: longitud (sin espacios) < 9 **o** falla `isValidPhone` (solo dígitos, espacios, `+`, `-`, `(`, `)`) → `'Teléfono inválido'`.
- `numDoc`: longitud (sin espacios internos) < 8 **o** falla `isValidDNI` (solo dígitos) → `'Documento inválido'`.
- `direccion`: obligatoria (no vacía tras trim) → `'Ingresa la dirección'`.
- `numero`: obligatorio → `'Nro'`.
- `interior`/`referencia`: opcionales, sin validación.
- Se genera una `idempotencyKey` única por instancia de pantalla, enviada en cada intento de creación de pedido.
- Cupón y canje de puntos son **mutuamente excluyentes**: aplicar cupón resetea `pointsToRedeem` a 0; mientras haya puntos activos, el campo de cupón se oculta; mientras haya cupón, `PointsRedeemField` no se renderiza.

**Casos de prueba QA:**

Deben pasar:
1. Nombre "Juana Pérez", email "juana@test.pe", teléfono "987654321", DNI "12345678", resto completo, método de pago elegido → sin errores, continúa el flujo.
2. Usuario con dirección guardada → tocar el chip autocompleta todo correctamente.
3. Marcar "Recordar mis datos", confirmar con éxito → en la siguiente sesión, formulario precargado y checkbox marcado.
4. No marcar "Recordar mis datos" → siguiente sesión, formulario vacío.

Deben fallar/rechazarse:
1. Nombre vacío → "Ingresa tu nombre".
2. Email "juana@test" (sin dominio) → "Correo inválido".
3. Teléfono "12345" (5 caracteres) → "Teléfono inválido".
4. Teléfono "98765432a" (con letra) → "Teléfono inválido".
5. DNI "1234567" (7 dígitos) → "Documento inválido".
6. DNI "1234567A" → "Documento inválido".
7. Dirección vacía → "Ingresa la dirección".
8. Número vacío → "Nro".
9. Sin método de pago elegido → "Debes seleccionar un método de pago"; no navega.

## 3.2 Selección de ubigeo

**Comportamiento observable:** tres `SelectField` en cascada Departamento → Provincia → Distrito, cada uno deshabilitado hasta elegir el nivel superior. Modal con buscador por texto (filtra por `includes`, case-insensitive). Elegir Departamento resetea Provincia/Distrito; elegir Provincia resetea Distrito. Elegir Distrito dispara la cotización de envío automáticamente.

**Reglas de negocio:**
- `fetchDepartamentos/Provincias/Distritos` (`src/api/ubigeo.ts`) llaman al BFF y recortan espacios de `nombre`.
- `validate()` exige los tres niveles: `'Elige departamento'`/`'Elige provincia'`/`'Elige distrito'`.
- El distrito debe traer `idUbigeo` para poder cotizar envío; si no, `shipping` se resetea a `null`.
- Si falla la carga de provincias/distritos, **no hay mensaje de error visible** — la lista simplemente queda vacía.

**Casos de prueba QA:**

Deben pasar:
1. Elegir "Lima" → se habilita Provincia con sus opciones.
2. Elegir provincia "Lima" → se habilita Distrito.
3. Elegir "Miraflores" → queda seleccionado y dispara cotización de envío.
4. Buscar "are" en el modal de Departamento → filtra por esa subcadena.
5. Cambiar de departamento tras elegir provincia/distrito → ambos se resetean y recargan.

Deben fallar/rechazarse:
1. Tocar Provincia antes de elegir Departamento → no abre el modal (deshabilitado).
2. Tocar Distrito antes de Provincia → no abre el modal.
3. Confirmar sin Departamento → "Elige departamento".
4. Confirmar con Departamento+Provincia pero sin Distrito → "Elige distrito".
5. Buscar texto sin coincidencias → "Sin resultados".

**Nota/Ambigüedad:** sin mensaje de error visible si `fetchDepartamentos/Provincias/Distritos` fallan por red — QA debe validar manualmente con red cortada.

## 3.3 Cálculo de costo de envío

**Comportamiento observable:** al elegir Distrito, la fila "Envío" pasa de "Elige tu distrito" a "Calculando…" y luego "Gratis" o el monto. Si aplica, aparece texto "Envío gratis en {zona} desde {monto}."

**Reglas de negocio:**
- `fetchShipping(idUbigeo, subtotal)` (`src/api/shipping.ts`) — el cálculo de tarifas ocurre íntegramente en el servidor; el cliente solo consume el resultado.
- Se dispara cada vez que cambia `distrito?.idUbigeo` o `subtotal`. Sin `idUbigeo` → `shipping=null` sin llamar a la API. Si falla → `shipping=null`, se muestra "—" sin mensaje de error.
- `envio = shipping ? shipping.cost : 0`. `finalTotal = max(0, subtotal - discount - pointsDiscount + envio)`.
- Aviso de envío gratis solo si `shipping` existe, `!shipping.is_free` y `free_threshold != null`.

**Casos de prueba QA:**

Deben pasar:
1. Distrito de zona que ya alcanzó envío gratis → "Gratis", sin aviso de umbral.
2. Distrito con costo fijo y subtotal bajo el umbral → monto correcto + aviso de umbral.
3. Superar el umbral agregando productos (sin cambiar distrito) → recalcula automáticamente a "Gratis".
4. Mientras calcula → "Calculando…", `envio=0` en el total provisional.

Deben fallar/rechazarse:
1. Sin distrito → "Elige tu distrito", `envio=0`.
2. Falla `/shipping` → "—", sin mensaje de error, `envio=0`.
3. **Hallazgo:** el formulario puede enviarse con envío en estado "—" o "Calculando…" — no hay bloqueo en `validate()` para este caso; se envía con `envio:0` y el servidor decide el costo real, lo que puede generar discrepancia entre el total mostrado y el cobrado.

## 3.4 Selección de método de pago

**Comportamiento observable:** tres opciones tipo radio, siempre visibles y habilitadas: "Tarjeta de crédito o débito" (Izipay, en la app), "Yape / Plin" (QR + comprobante), "Transferencia bancaria" (depósito + comprobante). Solo una activa a la vez.

**Reglas de negocio:**
- No hay condición alguna (monto mínimo, zona, horario) que oculte/deshabilite un método — las tres siempre están disponibles.
- `validate()` exige `metodoPago` no nulo → `'Debes seleccionar un método de pago'`.
- Tarjeta sigue el flujo Izipay/WebView (3.5); Yape/Transferencia crean el pedido directo sin pasarela (3.6/3.7).

**Casos de prueba QA:**

Deben pasar:
1. Tocar "Tarjeta" → se marca, otras se desmarcan.
2. Tocar "Yape/Plin" luego "Transferencia" → solo la última queda activa.
3. Elegir "Yape/Plin", completar el resto, confirmar → continúa sin pasarela.

Deben fallar/rechazarse:
1. Completar todo excepto el método de pago → "Debes seleccionar un método de pago"; no navega.

## 3.5 Pago con Izipay (webview)

**Comportamiento observable:** con "Tarjeta" elegida, al confirmar: spinner en el botón, se crea el pedido, y se navega a `PaymentWebViewScreen` con el formulario embebido de Izipay (Krypton). Overlay "Cargando pago seguro…" → al enviar, "Confirmando tu pago…". Éxito → navega (replace) a confirmación y vacía el carrito. Fallo → pantalla de error con botón "Volver al checkout".

**Reglas de negocio (`CheckoutScreen.tsx:308-340`, `PaymentWebViewScreen.tsx`):**
1. `createOrder(orderPayload)`. Si `!ok` → mensaje de `reason` o genérico, no continúa.
2. Si `ok` pero sin `order_id` (modo vista previa, `ordersEnabled=false`) → navega directo a confirmación con prefijo "PREVIEW-", sin llamar a Izipay.
3. Con `order_id`, llama `getFormToken()`. Si falla → `'No pudimos iniciar el pago con tarjeta.'` o `reason`.
4. Si todo correcto, navega al WebView con `formToken`/`publicKey`/`checkoutToken`.
5. `originWhitelist` restringido a `['https://boticuy.com', 'https://*.micuentaweb.pe']`.
6. Mensajes del WebView: `submit` → `confirmPayment`; `error` con `answer`/`hash` (rechazo real, ej. tarjeta declinada) → también llama `confirmPayment` para registrar el rechazo; `error` sin `answer`/`hash` (validación de formulario o script no cargó) → mensaje local, default `'Ocurrió un error en el pago'`.
7. `confirmPayment` llama `validatePayment`; `paid:true` → `complete()` (vacía carrito, navega replace a confirmación); si no → mensaje de `reason` o `'El pago no se completó. Intenta de nuevo.'`.
8. Salir sin pago confirmado (`beforeRemove`): si hay validación en curso, **bloquea la salida sin diálogo**; si no, dispara `abandonPayment` en fire-and-forget (marca el pedido fallido de inmediato en vez de esperar 45 min).
9. El carrito **no** se vacía si el pago falla o se abandona.

**Casos de prueba QA:**

Deben pasar:
1. Flujo completo con tarjeta de prueba válida → WebView con monto correcto, confirmación exitosa, carrito vacío.
2. `ordersEnabled=false` → confirmación directa con "PREVIEW-" y aviso de vista previa, sin abrir Izipay.
3. Salir del WebView (back) antes de enviar el formulario → sale sin diálogo, dispara `abandonPayment` en el servidor.

Deben fallar/rechazarse:
1. `createOrder` con `ok:false` y `reason` → se muestra ese mensaje exacto, sin abrir WebView.
2. `createOrder` `ok:true` sin datos suficientes → "No pudimos crear el pedido. Intenta de nuevo."
3. `getFormToken` falla → "No pudimos iniciar el pago con tarjeta." o `reason`.
4. Tarjeta rechazada (ej. código `ACQ_001`) → mensaje de `reason` o "El pago no se completó. Intenta de nuevo."; carrito no se vacía, pedido queda fallido en el servidor.
5. Cortar la conexión durante `validatePayment` → "No pudimos confirmar el pago. Revisa tu conexión."
6. "Volver al checkout" desde error → regresa con todos los datos intactos, mismo total, se puede reintentar.
7. Intentar salir mientras hay una validación en curso → bloqueado sin aviso visible.
8. Script de Izipay no carga → "No se pudo cargar el formulario de pago."

**Nota/Ambigüedad:** no existe timeout explícito para el WebView ni para `validatePayment` — una carga colgada deja el overlay indefinidamente sin fallback; QA debe verificar manualmente este escenario.

## 3.6 Pago con Yape/Plin

**Comportamiento observable:** sin pasarela — al confirmar, se crea el pedido directo y se navega a confirmación mostrando "Te enviaremos el número y el QR de Yape a {email} y por WhatsApp para completar el pago y verificar tu pedido."

**Reglas de negocio:**
- Rama común con Transferencia (`CheckoutScreen.tsx:342-357`): `createOrder` directo sin tokenización. `ok:false` → mensaje de `reason` o genérico, no navega. `ok:true` → navega a confirmación.
- El carrito se vacía en `OrderConfirmationScreen`, no antes — no hay confirmación previa de pago (validación manual por WhatsApp).

**Casos de prueba QA:**

Deben pasar:
1. Completar con email "cliente@test.pe", elegir "Yape/Plin", confirmar → pedido creado, confirmación con el texto exacto usando ese email, carrito vacío.
2. En confirmación, tocar "Coordinar por WhatsApp" → abre WhatsApp con mensaje prellenado.

Deben fallar/rechazarse:
1. `createOrder` `ok:false` (ej. "Producto agotado") → mensaje exacto o genérico; carrito NO se vacía, no navega.
2. Sin conexión → "Error de conexión al crear el pedido."; carrito intacto.

## 3.7 Pago por transferencia bancaria

**Comportamiento observable:** igual que Yape (pedido directo sin pasarela). En confirmación: loader "Cargando datos bancarios…", luego una tarjeta por cuenta bancaria (Titular, N° de cuenta, CCI) + instrucciones del servidor + "Realiza el depósito... y envíanos tu comprobante por WhatsApp..."

**Reglas de negocio:**
- `fetchBankDetails()` (`src/api/bankDetails.ts`) solo se llama si `metodoPago === 'transferencia'`.
- Si falla o `bancos` viene vacío → reemplaza el bloque por "Contáctanos por WhatsApp para los datos de la cuenta." (no bloquea el resto de la confirmación, ya que el pedido ya fue creado).

**Casos de prueba QA:**

Deben pasar:
1. Confirmar con transferencia → pedido creado, loader, luego al menos una cuenta con Titular/N° cuenta/CCI + instrucciones.
2. Dos o más cuentas configuradas → todas se muestran en tarjetas separadas.

Deben fallar/rechazarse:
1. `createOrder` `ok:false` → mensaje correspondiente, no navega, carrito intacto.
2. `fetchBankDetails` falla o sin bancos → "Contáctanos por WhatsApp para los datos de la cuenta." (el pedido ya fue creado y el carrito ya vaciado, esto solo degrada la presentación).

## 3.8 Confirmación de pedido

**Comportamiento observable:** siempre muestra círculo verde + "¡Pedido confirmado!" + "Gracias, {nombre}. Te contactaremos por WhatsApp para coordinar la entrega." + tarjeta resumen (N° de pedido, Entrega en {distrito}, Cupón si aplica, Envío, Total) + bloque específico del método de pago + aviso + botón "Coordinar por WhatsApp" + nota final + botón "Seguir comprando" (resetea navegación a Tabs). El carrito se vacía siempre al montar esta pantalla (redundante pero inofensivo si ya se vació en el flujo de tarjeta).

**Reglas de negocio:**
- Nota final: "PREVIEW-" → aviso de vista previa; tarjeta sin preview → "Tu pago con tarjeta fue confirmado y tu pedido quedó registrado."; otros métodos → "Tu pedido quedó registrado."
- Todos los datos llegan por `route.params`, construidos en `CheckoutScreen`/`PaymentWebViewScreen`.

**Casos de prueba QA:**

Deben pasar:
1. Pedido con cupón y descuento > 0 → fila "Cupón {código}" con descuento negativo, total neto.
2. Envío gratis (`envio=0`) → fila "Envío: Gratis".
3. Pedido normal por tarjeta → nota "Tu pago con tarjeta fue confirmado y tu pedido quedó registrado."
4. Pedido normal por Yape → nota "Tu pedido quedó registrado."
5. "Seguir comprando" → resetea a Tabs, no se puede volver atrás al checkout.
6. Verificar que el carrito aparece vacío en cualquier otra pantalla tras llegar aquí.

**Nota/Ambigüedad:** no hay forma de "corregir" datos desde esta pantalla — la única salida es "Seguir comprando" (comportamiento esperado dado que el pedido ya fue creado, pero QA debe confirmarlo).

---

# 4. Cuenta / Perfil

## 4.1 Perfil / Cuenta

**Comportamiento observable:**
- **Con sesión:** card con ícono, `"Hola, {nombre || 'cliente'} 👋"`, email debajo. Botón "Cerrar sesión" (sin confirmación ni toast posterior visible en este archivo).
- **Sin sesión:** card "Inicia sesión" / "Accede a tus pedidos, puntos y cupones." con botón que navega a Login.
- Sección "Disponible ahora, sin cuenta" (siempre visible): "Mis favoritos" (con badge si `favCount > 0`) → `Favorites`; "Apoya a tu creador" → `Creators`. **Ambas funcionan sin sesión.**
- Sección "Cuenta":
  - **Con sesión:** 4 filas tocables → Mis pedidos (`Orders`), Mis direcciones (`Addresses`), Mis puntos (`Points`), Mis cupones (`MyCoupons`).
  - **Sin sesión:** las mismas 4 opciones renderizadas en gris con candado, **no tocables, sin acción ni redirección a Login al presionarlas.**
- Sección de ayuda (siempre visible): indicador online/offline según horario (ver 11.3), botón "Escríbenos por WhatsApp" con mensaje `"Hola Boticuy, necesito ayuda."`, texto de horario configurable.

**Reglas de negocio:**
- Nombre cae a `"cliente"` si `user.nombre` es falsy.
- Logout inmediato, sin diálogo de confirmación.
- "Mis favoritos" y "Apoya a tu creador" no requieren sesión desde esta pantalla.
- Las opciones "bloqueadas" sin sesión son puramente visuales — no navegan ni disparan acción.

**Casos de prueba QA:**

Deben pasar:
1. Sin sesión → ve card "Inicia sesión", sin email ni botón de logout.
2. Sin sesión, tocar cualquiera de las 4 filas con candado → no pasa nada.
3. Sin sesión, tocar "Mis favoritos" → navega sin pedir login.
4. Sin sesión, tocar "Apoya a tu creador" → navega sin pedir login.
5. Con sesión y 3 favoritos → badge muestra "3"; con 0, no se muestra badge.
6. Con sesión y `nombre` vacío → "Hola, cliente 👋" (no "Hola,  👋" ni "undefined").
7. Con sesión, "Cerrar sesión" → cierra sesión inmediatamente sin diálogo.
8. Con sesión, tocar cada una de las 4 filas → navega a la pantalla correspondiente.
9. Tocar "Escríbenos por WhatsApp" desde Perfil → abre WhatsApp con `"Hola Boticuy, necesito ayuda."` (mensaje distinto al default de otras pantallas, `"...necesito ayuda con mi pedido."`).

**Nota/Ambigüedad:** el comportamiento exacto de `logout()` (si limpia carrito/favoritos, si redirige de pantalla) depende de `authStore.ts` — verificar contra la sección 10.4.

## 4.2 Creadores

**Comportamiento observable:** pantalla "Apoya a tu creador", accesible sin sesión. Carga en paralelo "Copa Boticuy" (`fetchApoyaCreador`) y "Otros cupones disponibles" (`fetchMisCupones`). Cada tarjeta muestra nombre (si distinto del código), código, canal (si existe) y "% de descuento" (si `amount != null`). Botón "Usar" revalida el código contra `/coupon` y, si es válido y alcanza el monto mínimo real, aplica el cupón con esos datos reales y navega al tab Catálogo (ver detalle completo en sección 7.4).

**Reglas de negocio:**
- Si `amount == null`, "Usar" no hace nada (guard defensivo — el código asume que el backend solo envía cupones activos).
- El resto de la lógica de aplicación (revalidación contra `/coupon`, rechazo si no cumple el mínimo real, mensajes de error) es idéntica a la de `MyCouponsScreen` — ver 7.4.

**Casos de prueba QA:**

Deben pasar:
1. Ambas listas con datos → ambas secciones visibles.
2. Solo una lista con datos → solo esa sección aparece.
3. Ambas vacías → "Pronto habrá códigos de creadores."
4. Error de red → "No pudimos cargar los creadores." con reintento.
5. `name` igual (case-insensitive) al `code` → no se muestra la línea de nombre.
6. Tocar "Usar" con `amount` válido y que cumple el mínimo real → cupón aplicado, toast, navega a Catálogo (ver 7.4 para los casos de rechazo).

Deben fallar/rechazarse:
1. Tarjeta con `amount: null` → tocar "Usar" no produce ningún efecto visible.
2. Ver sección 7.4 para los casos de rechazo por cupón inválido o por no alcanzar el monto mínimo real.

## 4.3 Protección de rutas relacionadas con cuenta

Ver sección 11.2 para el análisis completo de navegación y ausencia de guard de sesión real a nivel de rutas.

---

# 5. Puntos / Lealtad

## 5.1 Ver saldo y nivel de puntos

**Comportamiento observable:**
1. `PointsScreen`: loader "Cargando tus puntos…" mientras se llama `fetchPoints()` (`GET /points`).
2. Error → `ErrorView` "No pudimos cargar tus puntos." con reintento.
3. Éxito → saldo grande, badge de nivel, "Equivalen a {soles} de descuento" (valor ya calculado por el servidor), barra de progreso al siguiente nivel (si `next_level_at` no es null), tabla estática de niveles (Bronce 0+, Plata 500+, Oro 1500+ — hardcodeada en el cliente), tarjeta "¿Cómo funciona?" con copy estático, y nota legal del tope de 30%.

**Reglas de negocio:**
- El saldo/nivel/umbral son **enteramente responsabilidad del backend**; el cliente no calcula puntos ganados ni acredita nada.
- Los umbrales de nivel mostrados (0/500/1500) están **hardcodeados en el cliente**, independientes de `next_level_at` real del servidor.
- Tasa: 1 punto = S/0.05 (consistente con la constante de canje).
- Sin lógica de expiración de puntos en el código.

**Casos de prueba QA:**

Deben pasar:
1. `balance=750`, `level='plata'`, `next_level_at=1500`, `soles_value=37.5` → "750 puntos", badge "Nivel Plata", "Equivalen a S/37.50 de descuento", barra al 50%, "Te faltan 750 puntos".
2. `balance=1600`, `next_level_at=null` → no se muestra bloque de progreso.
3. Falla `/points` → `ErrorView`, reintento funcional.

Deben fallar/mostrar estados de borde:
1. `next_level_at <= balance` (dato inconsistente del backend) → barra capada en 100%, pero "Te faltan -50 puntos" podría mostrarse (texto incorrecto, reportar si ocurre).
2. Respuesta sin `balance` → renderiza `undefined` en pantalla (sin validación de forma de respuesta).

## 5.2 Canjear puntos (checkout)

**Comportamiento observable:**
1. En Checkout, si hay sesión, sin cupón aplicado y `pointsBalance > 0`, se renderiza `PointsRedeemField`.
2. Es un **toggle todo-o-nada** ("Usar mis puntos"): activar aplica el máximo permitido; no hay selector de cantidad parcial.
3. Muestra "Tienes {balance} puntos. Puedes descontar hasta {monto} en este pedido."; activo → "Descuento aplicado: −{monto}"; si el límite fue el 30% (no el saldo completo) → nota "Estás usando N de tus M puntos - te quedan (M-N) disponibles."

**Reglas de negocio (`src/components/PointsRedeemField.tsx`, `src/screens/CheckoutScreen.tsx`):**
- `SOLES_PER_POINT = 0.05` (definida por duplicado en ambos archivos — riesgo de desincronización si se cambia en uno solo).
- `capPoints = floor(subtotal * 0.3 / 0.05)` (30% del subtotal expresado en puntos).
- `maxRedeemable = max(0, min(balance, capPoints))`.
- Si `maxRedeemable <= 0` (subtotal muy bajo), el componente no se renderiza en absoluto **aunque el usuario tenga saldo**.
- Cupón y puntos son mutuamente excluyentes (ver 3.1).
- No hay revalidación del saldo justo antes de enviar el pedido — se carga una sola vez al montar Checkout.

**Casos de prueba QA:**

Deben pasar:
1. `balance=200`, `subtotal=S/50.00` → `capPoints=300`, `maxRedeemable=200`, descuento exacto S/10.00, sin nota de "puntos limitados".
2. `balance=1000`, `subtotal=S/50.00` → `maxRedeemable=300`, descuento S/15.00 (30% de 50), nota "Estás usando 300 de tus 1000 puntos - te quedan 700 disponibles."
3. `balance=6`, `subtotal=S/1.00` → `capPoints=6=balance`, descuento S/0.30, sin nota (límite alcanzado por ambos lados a la vez).
4. Desactivar el toggle → descuento vuelve a S/0.00.
5. Aplicar cupón con puntos activos → `pointsToRedeem` se resetea a 0 automáticamente y el campo desaparece.

Deben fallar/rechazarse:
1. `balance=0` → componente no se renderiza.
2. `balance=50`, `subtotal=S/0.10` → `capPoints=0`, `maxRedeemable=0` → componente oculto pese a tener saldo (posible percepción de bug por el usuario: "tengo puntos pero no puedo usarlos").
3. Cupón ya aplicado, `balance=500` → `PointsRedeemField` no aparece en absoluto.
4. Con puntos activos → el campo de cupón debe estar oculto.
5. `subtotal=S/0.00` → `maxRedeemable=0`, componente oculto.

---

# 6. Direcciones

## 6.1 Listado de direcciones

**Comportamiento observable:**
1. Loader "Cargando direcciones…" al entrar; se recarga automáticamente al recibir foco (`useFocusEffect`), no solo al montar.
2. Error → `ErrorView` "No pudimos cargar tus direcciones." con reintento.
3. Vacío → "Aún no tienes direcciones guardadas." + botón "Agregar dirección".
4. Con datos: tarjetas con dirección+número(+interior), distrito/provincia, referencia en cursiva si existe; íconos de editar y eliminar por tarjeta.
5. **No existe ningún indicador visual de "dirección predeterminada"** en ninguna tarjeta.

**Reglas de negocio:**
- `fetchAddresses()` → `GET /addresses`; si falta el arreglo, se asume `[]` sin lanzar error.
- Sin orden explícito en el cliente (orden tal cual lo devuelve el backend).
- **No existe el concepto de "dirección predeterminada"** en ningún punto del código ni en el tipo `SavedAddress` (`src/types/index.ts:160-172`).
- Sin límite máximo de direcciones.

**Casos de prueba QA:**

Deben pasar:
1. Sin direcciones → estado vacío + botón "Agregar dirección".
2. 3 direcciones → 3 tarjetas con sus datos.
3. Agregar y volver → la lista se refresca automáticamente (sin pull-to-refresh manual).
4. Editar y volver → datos actualizados reflejados.
5. Dirección sin `interior` ni `referencia` → tarjeta sin esas líneas ni comas extra.

Deben fallar/mostrar estados especiales:
1. Error de red → `ErrorView` con reintento, sin loader infinito.
2. Backend sin campo `addresses` → se trata como lista vacía.
3. Cualquier caso de prueba sobre "marcar como predeterminada" debe reportarse como **No Aplicable / No implementado**, no como bug.

## 6.2 Crear dirección

**Comportamiento observable:**
1. "Agregar dirección" → formulario con "Datos del destinatario" (Celular/WhatsApp, DNI) y "Dirección de entrega" (Departamento, Provincia, Distrito, Dirección, Número, Dpto/Interior, Referencia opcional).
2. Provincia/Distrito deshabilitados hasta elegir el nivel superior, con reseteo en cascada.
3. Validación al enviar; si pasa, `addAddress()` y `goBack()` (lo que dispara refresco de la lista).
4. Si falla, mensaje genérico "No pudimos guardar la dirección. Intenta de nuevo." sin perder los datos ingresados.

**Reglas de negocio (`validate()`, `AddressFormScreen.tsx:84-95`):**
- Teléfono: obligatorio, inválido si `< 9` caracteres o falla `isValidPhone`.
- DNI: obligatorio, inválido si `< 8` dígitos (tras quitar espacios internos) o falla `isValidDNI` (solo dígitos, **no acepta letras**).
- Departamento/Provincia/Distrito: obligatorios, con dependencia en cascada real (deshabilitado por prop, no solo validación).
- Dirección: obligatoria, sin validación de formato/longitud.
- Número: obligatorio, acepta cualquier formato (incluido "S/N").
- Interior/Referencia: opcionales.
- Todos los campos de texto se envían con `trim()`; DNI además sin espacios internos.
- Sin límite de direcciones a crear.

**Casos de prueba QA:**

Deben pasar:
1. Teléfono "987654321", DNI "12345678", Lima/Lima/Miraflores, "Av. Larco", "123", sin interior/referencia → guarda y vuelve a la lista.
2. Teléfono con formato "+51 987 654 321" → aceptado.
3. DNI "1234 5678" (con espacio interno) → aceptado, se envía como "12345678".
4. Interior "Dpto 302", Referencia "Frente al parque" → se guardan tal cual.
5. Elegir Departamento habilita Provincia solo con las de ese departamento; elegir Provincia habilita Distrito solo con los de esa combinación.
6. Cambiar Departamento tras elegir Provincia/Distrito → ambos se resetean.

Deben fallar/rechazarse:
1. Todos los campos vacíos → 7 errores simultáneos (Teléfono, DNI, Departamento, Provincia, Distrito, Dirección, Número); no se envía nada.
2. Teléfono "12345" → "Teléfono inválido".
3. Teléfono "abcdefghi" (letras) → "Teléfono inválido".
4. DNI "1234567" (7 dígitos) → "Documento inválido".
5. DNI "1234567A" → "Documento inválido".
6. Departamento elegido, sin Provincia/Distrito → "Elige provincia" y "Elige distrito".
7. Tocar Provincia sin Departamento → deshabilitado, no abre modal.
8. Dirección solo espacios → "Ingresa la dirección".
9. Número vacío → "Nro".
10. Backend responde error → mensaje genérico, datos ingresados no se pierden, spinner se detiene.

**Nota/Ambigüedad:** el tipo `SavedAddress` tiene `nombre?: string` pero **ningún campo del formulario lo captura ni lo envía** — confirmar si es intencional o un campo huérfano.

## 6.3 Editar dirección

**Comportamiento observable:** igual al formulario de creación, pero precargado con los datos existentes (incluyendo precarga de provincias/distritos del ubigeo guardado); botón "Guardar cambios"; llama `updateAddress(id, payload)` en vez de `addAddress`.

**Reglas de negocio:**
- Mismas validaciones que crear, sin reglas distintas.
- `POST /addresses/update` envía el objeto completo (no un parche parcial).
- Si falla la precarga de provincias/distritos, se ignora silenciosamente — el usuario puede seguir guardando cambios en otros campos porque `validate()` solo chequea `!provincia`/`!distrito`, no si están en las listas cargadas.
- Sin control de concurrencia/optimistic locking.

**Casos de prueba QA:**

Deben pasar:
1. Abrir edición de dirección con Departamento "Arequipa" → aparece precargado con sus provincias disponibles sin re-seleccionar.
2. Cambiar solo Referencia y guardar → se envían todos los campos originales + el nuevo.
3. Cambiar Departamento en edición → Provincia/Distrito se resetean igual que en creación.
4. Guardar exitosamente → vuelve y la lista refleja los cambios sin duplicar tarjeta.

Deben fallar/rechazarse:
1. Vaciar Dirección y guardar → "Ingresa la dirección"; no llama `updateAddress`.
2. Teléfono inválido → error de validación, todo el submit se bloquea.
3. Backend rechaza el update (ej. dirección ya no existe) → mensaje genérico, sin distinguir la causa, usuario permanece en el formulario con sus datos.
4. Falla la precarga de provincias/distritos → los selects conservan el valor guardado; guardar sin tocarlos funciona igual.

## 6.4 Marcar como predeterminada

**Estado: NO IMPLEMENTADO.** No existe campo `isDefault`, botón, endpoint ni lógica de ordenamiento por defecto en ningún archivo revisado. Cualquier caso de prueba redactado contra este requisito debe marcarse **No Aplicable — funcionalidad no implementada** y reportarse a producto para confirmar si es un requisito pendiente.

## 6.5 Eliminar dirección

**Comportamiento observable:**
1. Ícono de basurero → `Alert` nativo: "¿Seguro que quieres eliminar esta dirección?" con "Cancelar"/"Eliminar".
2. Confirmar → `deleteAddress(id)`; la lista se reemplaza con la respuesta del backend, sin spinner.
3. Si falla, se muestra un toast de error ("No pudimos eliminar la dirección. Intenta de nuevo.", `variant:'warning'`) y la dirección permanece en la lista.

**Reglas de negocio:**
- Confirmación obligatoria vía `Alert.alert` — único punto de confirmación en toda el área de Direcciones.
- `POST /addresses/delete`.
- Sin regla especial para eliminar la "predeterminada" (no existe el concepto) ni la última dirección restante — resultado en ambos casos: lista vacía → estado vacío estándar.
- Sin validación de "dirección en uso" en un pedido/checkout en curso.

**Casos de prueba QA:**

Deben pasar:
1. 3 direcciones, tocar basurero, "Cancelar" → nada cambia.
2. Confirmar "Eliminar" → desaparece inmediatamente, quedan 2, sin ningún toast.
3. Con 1 sola dirección, eliminarla → estado vacío sin mensaje especial.
4. Eliminar varias consecutivas → cada una refleja correctamente el estado restante.

Deben fallar/mostrar comportamiento a validar:
1. Backend responde error al eliminar → la dirección permanece visible y aparece el toast "No pudimos eliminar la dirección. Intenta de nuevo."
2. Eliminar una dirección "en uso" en un pedido en curso → depende enteramente del backend; si lo rechaza, cae en el mismo camino de error y muestra el toast anterior.
3. Doble tap rápido en "Eliminar" sobre dos tarjetas distintas casi simultáneo → sin debounce ni bloqueo, riesgo de condición de carrera (validar manualmente).

---

# 7. Cupones

## 7.1 Listado de mis cupones

**Comportamiento observable:**
1. `MyCouponsScreen` carga en paralelo `fetchMisCupones()` y `fetchCuponesOro()`.
2. Loader → error genérico "No pudimos cargar los cupones." (si cualquiera de las dos falla) → vacío "No hay cupones activos por ahora." → o dos secciones: "Exclusivos Oro" (si hay) y "Disponibles" (si hay).
3. Cada tarjeta: `name` (si distinto de `code`), `code`, "{amount}% de descuento" (si `amount != null`), botón "Usar" **siempre visible incluso si `amount` es null**.
4. Sin pull-to-refresh; sin historial de cupones usados (comentario explícito en el código).

**Reglas de negocio:**
- El campo `Creator.active` **no se usa para filtrar en la UI** — si el backend devuelve un cupón inactivo, se muestra igual.
- Cupón con `amount: null` muestra el botón "Usar" activo visualmente, pero presionarlo no hace nada.
- Sin lógica de expiración/monto mínimo/tipo de descuento en este listado (el tipo `Creator` no tiene esos campos).

**Casos de prueba QA:**

Deben pasar:
1. Solo `cupones-oro` con datos → solo sección "Exclusivos Oro".
2. Solo `mis-cupones` con datos → solo sección "Disponibles".
3. Ambos con datos → Oro primero, luego Disponibles.
4. `name` igual a `code` (case-insensitive) → no se muestra la línea de nombre.
5. Error → reintentar → éxito → carga normal.
6. Ambos vacíos → "No hay cupones activos por ahora."

Deben fallar/mostrar estado degradado:
1. Una de las dos llamadas falla → **toda** la pantalla cae en error genérico (no hay carga parcial).
2. `amount:null` y `active:false` → botón "Usar" sigue habilitado visualmente, sin efecto ni feedback al tocarlo.
3. Timeout/500 en ambos → mismo mensaje genérico, sin distinguir causa.

## 7.2 Aplicar cupón (campo de texto, `CouponField`)

**Comportamiento observable:**
1. Input "¿Tienes un cupón? Escríbelo aquí" + botón "Aplicar" (deshabilitado si vacío). Texto se autoconvierte a mayúsculas.
2. Válido y cumple mínimo → input se limpia, `setCoupon`, toast "Cupón {CODE} aplicado 🎉".
3. Inválido/no cumple mínimo/error de red → el input **no se limpia**, error rojo debajo, no se aplica.

**Reglas de negocio (`CouponField.tsx`, `src/api/coupons.ts`, `cartStore.ts:discount()`):**
- `apply()`: si el código recortado queda vacío, no hace nada (ni siquiera vía submit del teclado).
- `validateCoupon()` → `GET /coupon?code=`. Si `valid:false`, usa `reason` del backend o `'Cupón no válido'` como fallback — **el mensaje específico depende 100% del backend**.
- Validación adicional en cliente: si `minimum_amount` es truthy y `subtotal < minimum_amount` → rechaza con `"Compra mínima S/X.XX para este cupón"` (mínimo de `0` nunca activa esta regla).
- `discount_type` soportados: `'percent'` y `'fixed_cart'`; cualquier otro (incluido un hipotético `'free_shipping'`) → descuento 0, sin lógica de envío gratis implementada.
- Un solo cupón a la vez; aplicar uno nuevo reemplaza al anterior.
- Error de red → `'No pudimos validar el cupón. Intenta de nuevo.'`

**Casos de prueba QA:**

Deben pasar:
1. Subtotal S/100.00, código "VERANO10" válido (`percent 10%`, `minimum_amount 0`) → aplica, toast, descuento −S/10.00.
2. Subtotal S/100.00, "DESC20" (`fixed_cart 20`, `minimum_amount 50`) → subtotal ≥ mínimo, aplica, −S/20.00.
3. Subtotal exacto S/50.00 con `minimum_amount:50` → SÍ se aplica (comparación estricta `<`, 50 no es menor que 50).
4. Código en minúsculas "verano10" → se autoconvierte a "VERANO10".
5. Código con espacios "  VERANO10  " → se recorta antes de validar.
6. Aplicar un segundo cupón → reemplaza al primero.

Deben fallar/rechazarse:
1. Campo vacío/espacios → botón deshabilitado, sin error, sin llamada.
2. "NOEXISTE" con `reason: "El cupón no existe"` → se muestra ese texto exacto.
3. Backend no envía `reason` en el fallo → "Cupón no válido".
4. Subtotal S/30.00, cupón con `minimum_amount:50` → "Compra mínima S/50.00 para este cupón"; no se guarda.
5. Error de red → "No pudimos validar el cupón. Intenta de nuevo."

**Comportamiento cuando un cupón ya aplicado deja de cumplir el mínimo** (ej. el usuario quita productos del carrito después de aplicar el cupón): el chip cambia de verde a ámbar, el ícono pasa de `pricetag` a `alert-circle`, y el texto cambia de "Cupón {CODE} · −{descuento}" a "Cupón {CODE} — agrega {monto faltante} más para usarlo" (`monto faltante = minimum_amount - subtotal`, formateado con `formatSoles`). El cupón sigue "aplicado" en el estado (no se quita solo), pero ya no se muestra ni se aplica ningún descuento hasta que el subtotal vuelva a alcanzar el mínimo — momento en el que vuelve a mostrarse el chip verde normal automáticamente, sin que el usuario tenga que reaplicarlo.

Casos de prueba QA de este comportamiento:
1. Cupón `minimum_amount:50` aplicado sobre S/60, quitar productos hasta S/20 → el chip cambia a ámbar con el texto exacto "Cupón {CODE} — agrega S/ 30.00 más para usarlo"; el total del carrito deja de reflejar el descuento.
2. Desde el estado anterior, agregar productos hasta volver a superar S/50 → el chip vuelve a verde con "Cupón {CODE} · −{descuento}" automáticamente, sin tocar nada más.
3. Cupón sin `minimum_amount` (o en `0`) → nunca entra en el estado ámbar, sin importar cuánto baje el subtotal.

## 7.3 Quitar cupón aplicado

**Comportamiento observable:** con cupón aplicado, chip verde "Cupón {CODE} · −{monto}" + botón "Quitar". Tocarlo ejecuta `setCoupon(null)` inmediatamente, **sin confirmación ni toast**.

**Reglas de negocio:**
- Operación 100% de cliente, sin llamada HTTP.
- Al quitar, `discount()` vuelve a 0 y `total() = subtotal()`.

**Casos de prueba QA:**

Deben pasar:
1. Cupón con −S/10.00 aplicado → "Quitar" → chip desaparece, total sube en S/10.00 inmediatamente.
2. Quitar, cerrar/reabrir la app → sigue removido (persistido).
3. Quitar y aplicar uno nuevo distinto inmediatamente → sin residuos del anterior.

Deben fallar/comportamiento a vigilar:
1. Sin confirmación al quitar — confirmar con producto si se espera un diálogo.
2. Sin toast/feedback de "cupón removido" (a diferencia de aplicar, que sí lo tiene).

## 7.4 Usar cupón desde "Mis cupones" / Creadores

Este flujo (`MyCouponsScreen.tsx`, y el equivalente en `CreatorsScreen.tsx`, sección 4.2) revalida el código contra el mismo endpoint que usa el campo manual de 7.2, en vez de asumir sus datos.

**Comportamiento observable:**
1. Tocar "Usar" en cualquier tarjeta (Disponibles/Exclusivos Oro/Copa Boticuy) con `amount != null`.
2. Se llama `validateCoupon(c.code)` (mismo `GET /coupon` que 7.2). Mientras resuelve, no hay indicador de carga visible en el botón.
3. Si el backend lo marca válido y el subtotal actual alcanza su `minimum_amount` real → se aplica al carrito con los datos reales (`discount_type`/`amount`/`minimum_amount` que devuelve el backend, no los del listado), analítica `apply_creator_coupon`, toast "Cupón {CODE} aplicado 🎉", navega al tab Catálogo.
4. Si el backend lo marca inválido (vencido, inexistente, etc.) → toast de advertencia con el `reason` del backend (o "Cupón no válido" si no viene), no se aplica nada, no navega.
5. Si es válido pero el subtotal no alcanza el `minimum_amount` real → toast de advertencia "Compra mínima {monto} para este cupón", no se aplica, no navega.
6. Si `amount == null` en la tarjeta (cupón listado pero aún no activo), "Usar" no hace nada — no se llega a llamar `validateCoupon`.

**Reglas de negocio:**
- El listado de creador (`Creator`) no trae `minimum_amount` en su forma (ver tipo `Creator`, sección 7.1) — por eso el "Usar" siempre revalida contra `/coupon` antes de aplicar, en vez de confiar en lo que muestra la tarjeta.
- Mismo guard que antes: `amount != null` para mostrar/habilitar el flujo — no verifica `active` por separado.
- Errores de red durante la validación → toast "No pudimos validar el cupón. Intenta de nuevo.", sin aplicar nada.

**Casos de prueba QA:**

Deben pasar:
1. Tarjeta "ORO10" (`amount:10`), backend confirma válido con `discount_type:'percent', amount:10, minimum_amount:0` → "Usar" aplica, toast "Cupón ORO10 aplicado 🎉", navega a Catálogo.
2. Ir al carrito tras usar desde esta pantalla → `CouponField` muestra el chip con "ORO10" aplicado (mismo store compartido).
3. Reemplazar por un cupón distinto desde `CouponField` → el nuevo reemplaza al de creador.
4. Cupón con `minimum_amount:50` real en backend y subtotal actual de S/100 → se aplica normalmente (cumple el mínimo).

Deben fallar/rechazarse:
1. Cupón con `amount:null` en la tarjeta → "Usar" no produce ningún efecto (no llama a `validateCoupon`).
2. Backend responde `valid:false, reason:"Cupón vencido"` → toast "Cupón vencido", no se aplica nada, no navega.
3. Cupón con `minimum_amount:50` real en backend pero subtotal actual de S/20 → toast "Compra mínima S/ 50.00 para este cupón", no se aplica, no navega — **el mínimo real del backend se respeta igual que en el campo manual de 7.2**, sin importar que el listado no lo mostrara.
4. Error de red durante la validación → toast "No pudimos validar el cupón. Intenta de nuevo.", sin aplicar nada.

---

# 8. Favoritos

## 8.1 Favoritos

**Comportamiento observable:**
1. El botón de favorito (corazón) aparece en cada `ProductCard` (esquina superior derecha de la imagen) y en el header de `ProductDetailScreen`.
2. `FavoritesScreen`: grilla 2 columnas; tocar la tarjeta navega al detalle; "Agregar" añade al carrito directamente desde favoritos; tocar el corazón quita de favoritos inmediatamente.
3. Estado vacío: "Aún no tienes favoritos" + "Toca el corazón en cualquier producto para guardarlo aquí."
4. En Perfil, "Mis favoritos" está en la sección **"sin cuenta"** — visible y funcional sin sesión.

**Reglas de negocio (`src/store/favoritesStore.ts`):**
- **No requiere login** — el store no depende de `authStore` ni de ningún token.
- **Persistencia 100% local** vía `AsyncStorage` (clave `'boticuy-favorites'`), **sin sincronización con backend**.
- **Los favoritos no se limpian al hacer logout** (`authStore.ts:logout()` nunca invoca `useFavorites.clear()`) — persisten entre sesiones e incluso entre distintas cuentas en el mismo dispositivo.
- **Sin límite de cantidad de favoritos.**
- `toggle()`: agregar un producto ya favorito lo **quita** (comportamiento toggle real, no rechazo de duplicado).
- Se guarda el **snapshot completo** del producto (precio/stock "congelados"), sin re-sincronización automática contra el catálogo actual.
- `remove()` y `clear()` existen en el store pero **no tienen ningún punto de llamada en la UI** — no hay botón de "vaciar favoritos".
- Abrir el detalle de un favorito sí pide datos frescos al backend (`fetchProduct`), por lo que puede fallar si el producto ya no existe (sin que esto elimine el ítem de favoritos).

**Casos de prueba QA:**

Deben pasar:
1. Sin sesión, marcar un producto como favorito desde cualquier listado → aparece en Perfil > Mis favoritos sin pedir login.
2. Marcar 3 productos desde distintas pantallas → los 3 aparecen, el más reciente primero.
3. Marcar favorito, cerrar/reabrir la app → persiste.
4. En Favoritos, tocar el corazón relleno de un ítem → desaparece inmediatamente.
5. En Favoritos, tocar "Agregar" → se agrega al carrito y permanece en favoritos.
6. Destoggle desde el detalle → se refleja en `FavoritesScreen`.
7. 0 favoritos → sin badge de contador en Perfil.
8. Marcar favoritos, cambiar de cuenta en el mismo dispositivo → los favoritos persisten idénticos (no están atados a la cuenta).

Deben fallar/mostrar estados especiales:
1. Lista vacía → estado vacío correcto, sin `FlatList` parpadeando.
2. Producto favorito eliminado del catálogo → sigue apareciendo con datos "congelados"; al abrir su detalle, `ErrorView` sin eliminarlo automáticamente de favoritos.
3. Doble toggle rápido → debe quedar en el estado contrario una sola vez, sin duplicarse.
4. Precio/stock cambiado en backend tras marcar favorito → la card sigue mostrando el valor **antiguo** (snapshot sin revalidar).
5. Reinstalar la app / borrar datos → favoritos se pierden (sin backup en cuenta ni backend).

**Nota/Ambigüedad:** no hay forma de "vaciar todos" desde la UI pese a que el store lo soporta; confirmar con producto si es intencional. Los favoritos son estrictamente por dispositivo, no por cuenta — si el negocio espera "favoritos por cuenta", hay una discrepancia real con el comportamiento actual.

---

# 9. Pedidos

## 9.1 Listado de pedidos

**Comportamiento observable:**
1. Loader "Cargando tus pedidos…" → error "No pudimos cargar tus pedidos." con reintento → vacío "Aún no tienes pedidos. ¡Tu primera compra aparecerá aquí!" → o lista de tarjetas con número, fecha, estado corto (punto + texto), hasta 4 ítems (+ "N más" si aplica), total.
2. Tocar una tarjeta navega al detalle con el objeto ya cargado (sin nueva llamada al backend).

**Reglas de negocio:**
- `fetchMyOrders()` → `GET /orders`, sin paginación ni filtros — trae todo en una sola llamada.
- El punto de color junto al estado es **siempre del color primario**, sin importar si el pedido está cancelado, con pago fallido, etc. — sin diferenciación visual de severidad en la lista.

**Casos de prueba QA:**

Deben pasar:
1. 3 pedidos en distintos estados (`on-hold`, `processing`, `completed`) → labels correctos ("Recibido", "Confirmado", "Confirmado").
2. Pedido de 6 productos → 4 visibles + "+2 más".
3. Pedido de exactamente 4 → sin línea "+N más".
4. Tocar una tarjeta → detalle idéntico al tocado.
5. Reintento tras error exitoso → reemplaza la vista de error por la lista.

Deben fallar/mostrar estados especiales:
1. Sin pedidos → mensaje exacto de vacío.
2. Error de red/backend → "No pudimos cargar tus pedidos." sin crash.
3. `status_slug` desconocido → cae al texto crudo de WooCommerce (`item.status`), sin traducir.

## 9.2 Detalle de pedido

**Comportamiento observable:**
1. Usa `route.params.order` directamente — **no vuelve a pedir el pedido al backend**.
2. Muestra banner rojo (estados especiales: `pending`/`cancelled`/`failed`/`refunded` o desconocidos) **o** timeline de 2 pasos ("Recibido"→"Confirmado") para `on-hold`/`processing`/`completed` — mutuamente excluyentes.
3. Sección "Productos" con todos los ítems (sin límite, a diferencia del listado) y total.
4. Botón "Volver a pedir" solo si al menos un ítem tiene `product_id` válido (`>0`).
5. Texto fijo de ayuda con WhatsApp, sin importar el estado.

**Reglas de negocio:**
- El detalle **no muestra dirección de envío, método de pago ni tracking** — el tipo `Order` no contiene esos campos.
- Lógica del banner: si `status_slug` está en `ORDER_STATUS_MESSAGES` (pending/cancelled/failed/refunded) → texto largo específico; si es de timeline → sin banner; si es desconocido → texto crudo de WooCommerce (nunca inventa progreso).
- No existe botón de "cancelar pedido".

**Casos de prueba QA:**

Deben pasar:
1. `on-hold` → timeline con "Recibido" completado, "Confirmado" en gris; sin banner.
2. `processing` → ambos pasos completados.
3. `completed` → visualmente idéntico a `processing` (sin un tercer paso "Entregado" — comportamiento esperado, no bug).
4. Pedido con 3 ítems con `product_id` válido → productos completos + botón "Volver a pedir" habilitado.
5. "Volver a pedir" con stock suficiente en todos → se agregan al carrito, toast, navega al tab Carrito.

Deben fallar/mostrar estados especiales:
1. `pending` → banner exacto: "Pago pendiente. Este pedido no será procesado hasta que se confirme el pago."
2. `cancelled` → "Pedido cancelado".
3. `failed` → "Hubo un problema con el pago. Si ya pagaste, escríbenos por WhatsApp."
4. `refunded` → "Pedido reembolsado".
5. `status_slug` desconocido → banner con el texto crudo de `order.status`, no un texto inventado.
6. Sin ítems con `product_id` válido → botón "Volver a pedir" no aparece.
7. "Volver a pedir" con producto ya no disponible → se omite, mensaje `No se pudo agregar "{nombre}" (ya no está disponible).`
8. "Volver a pedir" con producto sin stock → se omite, mensaje `(sin stock).`
9. "Volver a pedir" con stock parcial → se agrega cantidad ajustada, mensaje `Se ajustó la cantidad de "{nombre}" a {qty} (stock limitado).`
10. Todos los productos fallan → NO navega automáticamente al carrito (`added > 0` requerido).

## 9.3 Estados de pedido y su significado

Tabla completa (`src/utils/orderStatus.ts`):

| `status_slug` | Categoría | Texto en lista | Texto en detalle (banner) | Visual |
|---|---|---|---|---|
| `on-hold` | Timeline | "Recibido" | — (timeline) | Paso 1 completado |
| `processing` | Timeline | "Confirmado" | — (timeline) | Pasos 1 y 2 completados |
| `completed` | Timeline | "Confirmado" | — (timeline) | Igual que `processing` |
| `pending` | Especial | "Pago pendiente" | "Pago pendiente. Este pedido no será procesado hasta que se confirme el pago." | Banner rojo |
| `cancelled` | Especial | "Cancelado" | "Pedido cancelado" | Banner rojo |
| `failed` | Especial | "Pago fallido" | "Hubo un problema con el pago. Si ya pagaste, escríbenos por WhatsApp." | Banner rojo |
| `refunded` | Especial | "Reembolsado" | "Pedido reembolsado" | Banner rojo |
| Desconocido | Fallback | texto crudo de WooCommerce | texto crudo de WooCommerce | Lista: punto primario; Detalle: banner rojo |

- No existe estado "En camino" ni "Entregado" (comentario explícito en el código: WooCommerce no tiene un estado nativo para "en camino").

**Casos de prueba QA:**

Deben pasar:
1. Verificar los 7 `status_slug` de la tabla contra el texto exacto mostrado en lista y detalle.
2. `completed` y `processing` deben verse visualmente idénticos en el timeline (comportamiento esperado).

Deben fallar/mostrar estados especiales:
1. `status_slug` vacío/null → cae al fallback en ambas pantallas, sin crashear.
2. Estado nuevo no mapeado (ej. de un plugin de WooCommerce) → texto crudo, con el mismo estilo visual de "error" (banner rojo) aunque semánticamente no lo sea.

**Nota/Ambigüedad:** el banner usa siempre rojo/`close-circle` incluso para `pending` (que no es un error) y para estados desconocidos/futuros — confirmar con negocio si el tratamiento visual uniforme es intencional.

## 9.4 Repetir pedido ("Volver a pedir")

Ver reglas de negocio y casos detallados en 9.2. Resumen de la lógica de ajuste de cantidad (`OrderDetailScreen.tsx:29-63`):
- `qty = available != null ? min(it.qty, available) : it.qty` (si no hay dato de stock bajo, se asume que hay suficiente).
- `!is_in_stock || qty < 1` → se omite con advertencia "sin stock".
- `qty < it.qty` (tras ajuste) → se agrega igual, con advertencia de "cantidad ajustada".
- Excepción al buscar el producto → advertencia "ya no está disponible".
- Botón deshabilitado durante la operación (evita doble tap/duplicados).

---

# 10. Autenticación

## 10.1 Login / Registro

**Comportamiento observable:** `LoginScreen` combina ambos modos con pestañas ("Iniciar sesión"/"Crear cuenta").
- Login: Correo + Contraseña + enlace "¿Olvidaste tu contraseña?" + botón "Entrar".
- Registro: se agrega "Nombre" antes de correo/contraseña; botón "Crear cuenta"; sin enlace de recuperación.
- Al enviar: limpia error previo, valida localmente antes de llamar a la API; si falla, muestra error y **no hace ninguna llamada de red**.
- Válido → spinner → `loginUser`/`registerUser` (`POST /auth/login` o `/auth/register`).
- Respuesta `>=500` → "Error de conexión. Intenta de nuevo." Respuesta `<500` (incluye 400/401/409/422): si `!res.ok` o faltan `token`/`user` → se muestra `res.reason` o "No pudimos completar la operación".
- Éxito → `setAuth(token, user)` (persiste sesión) + `navigation.goBack()`.
- Botón se deshabilita solo durante `loading`, no según validez de campos.

**Reglas de negocio (`LoginScreen.tsx:submit()`, `src/utils/validation.ts`):**
- Nombre obligatorio solo en registro (`.trim()` — solo espacios cuenta como vacío).
- Email: `isValidEmail()` → regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Password: mínimo 6 caracteres (igual en login y registro, sin reglas de complejidad).
- Orden de validación: nombre → email → password; solo se muestra el primer error.
- `bffClient` tiene `validateStatus: s => s < 500` — códigos 400/401/404/409/422 se tratan como respuesta normal, no excepción.
- Persistencia (`setAuth()`): JSON `{token,user}` en `expo-secure-store` (clave `boticuy-auth`), token en memoria para el interceptor HTTP, `analytics.identify()`.

**Casos de prueba QA:**

Deben pasar:
1. Login: email "test@test.com", password "123456" (6 caracteres), backend `ok:true` → sin error, `goBack()`, sesión persistida.
2. Registro: nombre "Juan Pérez", email "nuevo@test.com", password "abcdef", `ok:true` → igual al caso 1.
3. Alternar pestañas sin perder los valores tipeados (mismo estado subyacente).

Deben fallar/rechazarse:
1. Registro con nombre vacío/solo espacios → "Ingresa tu nombre", sin llamada a la API.
2. Email inválido ("correo-sin-arroba.com", "test@", "@test.com", "test @test.com") → "Correo inválido".
3. Password "12345" (5 caracteres) → "La contraseña debe tener al menos 6 caracteres".
4. Backend `ok:false` con `reason:"Credenciales inválidas"` → se muestra ese texto exacto; sin `reason` → "No pudimos completar la operación".
5. Error 5xx / sin conexión → "Error de conexión. Intenta de nuevo."
6. `ok:true` pero sin `token`/`user` → tratado igual que `ok:false`.

**Nota/Ambigüedad:** los textos exactos de `reason` (credenciales inválidas, correo ya registrado) dependen 100% del backend/WordPress — QA debe validarlos contra el ambiente real, no inferirlos del código cliente. No hay debounce/validación en tiempo real mientras se escribe.

## 10.2 Recuperar contraseña

**Comportamiento observable:** `ForgotPasswordScreen` embebe en WebView la página estándar de WordPress `wp-login.php?action=lostpassword` (no es un formulario nativo).
- Overlay "Cargando…" mientras carga.
- CSS/JS inyectado oculta chrome de WordPress ajeno al formulario (título, nav, selector de idioma, política de privacidad).
- `originWhitelist` restringido al dominio de WordPress.
- Fallo de carga → "No pudimos cargar la página de recuperación." + "Reintentar".
- Detección de éxito: la URL contiene `checkemail=confirm` → pantalla "Revisa tu correo" + botón "Volver a iniciar sesión".
- Toda la validación de email/existencia de usuario ocurre **dentro del WebView**, renderizada por WordPress — no por código de Boticuy.

**Reglas de negocio:**
- `LOST_PASSWORD_URL` deriva del origin de `EXPO_PUBLIC_BFF_URL` (no hay env var separada).
- Detección de éxito acoplada directamente a `navState.url.includes('checkemail=confirm')` — si WordPress cambia ese parámetro, la detección deja de funcionar.
- Sin llamada al BFF de Boticuy en este flujo — 100% delegado a WordPress.

**Casos de prueba QA:**

Deben pasar:
1. Abrir desde Login → overlay, luego formulario de WP sin el chrome oculto.
2. Enviar formulario con correo existente → redirige con `checkemail=confirm` → pantalla "Revisa tu correo".
3. "Volver a iniciar sesión" → `goBack()` a Login.
4. Simular fallo de carga y "Reintentar" → vuelve a intentar.

Deben fallar/rechazarse:
1. Sin conexión al entrar → "No pudimos cargar la página de recuperación." + "Reintentar".
2. Navegación fuera del dominio de WordPress → bloqueada por `originWhitelist`.
3. Correo no registrado: comportamiento depende 100% de la configuración de WordPress (puede o no redirigir a `checkemail=confirm`) — QA debe verificar contra el ambiente real, no asumir del código cliente.

## 10.3 Onboarding

**Comportamiento observable:** carrusel de 3 slides estáticos (medkit/bicycle/chatbubbles), con "Saltar" siempre visible y botón inferior "Siguiente"→"Comenzar" en el último slide. Ambos caminos (Saltar o Comenzar) ejecutan `finish()`: persiste `AsyncStorage['boticuy-onboarded']='1'` y navega con `replace('Tabs')`.

**Reglas de negocio:**
- El monto de envío gratis mostrado en el slide 2 usa `extra.envioGratisDesde`/`extra.currencySymbol` (config, no hardcodeado).
- Si falla la escritura en AsyncStorage, igualmente navega a Tabs (try/catch silencioso) — riesgo de que Onboarding reaparezca en el siguiente arranque.
- Independiente de sesión/autenticación.

**Casos de prueba QA:**

Deben pasar:
1. Primera apertura → slide 1.
2. "Siguiente" en slide 1/2 → avanza, dots se actualizan.
3. Botón cambia a "Comenzar" en slide 3.
4. "Comenzar" o "Saltar" (en cualquier slide) → persiste flag y navega (replace) a Tabs.
5. Swipe manual → dots se sincronizan al finalizar el scroll.

**Nota/Ambigüedad:** el punto donde se lee `boticuy-onboarded` para decidir si mostrar Onboarding vive en `navigation/index.tsx` (ver 11.2), no en este archivo — confirmado ahí que si la lectura falla, se **omite** el onboarding (asume `true`).

## 10.4 Persistencia de sesión / renovación de token

**Comportamiento observable:**
- `hydrate()` (`authStore.ts`) lee SecureStore al arrancar; si hay sesión, llama `refreshSession()` (`POST /auth/refresh`, sesión deslizante).
  - `ok:true` con datos → actualiza y re-persiste el token.
  - `ok:false` (401 real) → **cierra sesión** (limpia memoria + SecureStore).
  - Cualquier otro resultado (404 `rest_no_route`, error de red, shape inesperado) → **conserva la sesión local tal cual**, sin cerrarla.
- Adjunto automático de `Authorization: Bearer <token>` en todas las peticiones vía interceptor si hay token en memoria.
- **No hay interceptor de respuesta global que detecte 401 y fuerce logout** — cada pantalla maneja el caso por su cuenta (o no lo maneja).

**Reglas de negocio:**
- Clave `boticuy-auth` en `expo-secure-store`.
- El cierre de sesión automático **solo** ocurre ante `{ok:false}` explícito de `/auth/refresh` — cualquier otra falla (incluida la ausencia del endpoint en producción, ver memoria de proyecto) preserva la sesión.
- `me()` (`GET /auth/me`) existe pero **no se usa** en `authStore.ts` — el store usa `refreshSession()`, no `me()`, para hidratar.

**Casos de prueba QA:**

Deben pasar:
1. Reabrir con sesión válida → refresca token automáticamente, usuario sigue autenticado.
2. Reabrir sin conexión con sesión previa → se restaura localmente con el token viejo, sin forzar logout.
3. Login → cerrar/reabrir → sesión persiste.
4. Logout manual → reabrir → no se restaura ninguna sesión.

Deben fallar/rechazarse:
1. `/auth/refresh` responde `ok:false` (401) → cierra sesión automáticamente.
2. `/auth/refresh` responde 404 (endpoint no desplegado en producción — **caso real conocido**, ver nota de proyecto) → sesión **NO** se cierra, sigue activa con el token anterior.
3. Token corrupto en SecureStore (`JSON.parse` falla) → cae en catch general, `hydrated:true`, sesión no restaurada, sin excepción no controlada.
4. Token expirado en memoria usado en una petición autenticada → el interceptor lo adjunta igual; el manejo del 401 resultante depende de cada pantalla individualmente (no hay logout automático centralizado).

**Nota/Ambigüedad:** confirmado por memoria de proyecto que `/auth/refresh` no existe en producción actualmente — esto significa que, en producción, la sesión **nunca se cierra automáticamente por expiración**, solo por logout manual del usuario. QA debe validar este comportamiento contra el ambiente de producción real, no solo contra un backend de staging que sí tenga el endpoint.

---

# 11. Navegación global y comportamientos transversales

## 11.1 Estado offline / conectividad

**Comportamiento observable:** `OfflineBanner` (montado globalmente en `App.tsx`) usa `NetInfo` y solo marca offline cuando `isConnected === false` **estrictamente** (si es `null`/`undefined`, no se muestra). Banner rojo fijo arriba con "Sin conexión a internet. Revisa tu WiFi o datos." Desaparece automáticamente al reconectar. Puramente informativo — no bloquea ninguna acción.

**Casos de prueba QA:**
1. Desactivar WiFi/datos → banner aparece superpuesto sobre cualquier pantalla.
2. Reactivar conexión → banner desaparece sin recargar.
3. "Conectado a WiFi sin internet real" → validar si `NetInfo` reporta `false`/`true`/`null` y el comportamiento resultante.
4. Verificar si el banner intercepta toques en la franja superior mientras está visible (no tiene `pointerEvents="none"` explícito, a diferencia del Toast).

## 11.2 Navegación global y protección de rutas

**Reglas de negocio (`src/navigation/index.tsx`):**
- Ruta inicial condicional: `AsyncStorage['boticuy-onboarded']==='1'` → `Tabs`; si no → `Onboarding`. Si la lectura falla, se asume `true` (**se omite el onboarding ante error**, no se muestra).
- `OrderConfirmation` se registra con `headerBackVisible:false, gestureEnabled:false` — no se puede volver atrás.
- **Hallazgo crítico: no existe ningún guard de autenticación real en el stack de navegación.** Todas las pantallas (`Checkout`, `Orders`, `Addresses`, `Points`, `MyCoupons`, `OrderDetail`, `PaymentWebView`) se registran incondicionalmente, sin depender de `useAuth`. La única protección es **visual**, dentro de `ProfileScreen` (botones deshabilitados sin sesión) — no un bloqueo real de ruta.

**Casos de prueba QA:**
1. Primera instalación → abre en `Onboarding`.
2. Reabrir tras completar onboarding → abre directo en `Tabs`.
3. **Crítico:** intentar llegar a `Orders`/`Addresses`/`Points`/`MyCoupons` sin sesión por cualquier vía distinta a los botones bloqueados de Perfil (deep link, navegación programática, etc.) → documentar exactamente qué ocurre (si la pantalla de destino redirige a Login, muestra error, o expone datos vacíos/incorrectos). **Este es el caso de prueba de seguridad más importante de todo el documento** — el código de navegación no lo previene por sí mismo.
4. Completar checkout como invitado → confirmar si el flujo intenta acceder a alguna pantalla que requiera sesión.
5. Llegar a `OrderConfirmation` → sin botón atrás ni gesto de swipe-back.

## 11.3 Formato de moneda, horario de atención y contacto WhatsApp

**Moneda (`src/utils/format.ts`):**
- `priceToSoles`: `parseInt(price,10) / 10^currency_minor_unit` (default 2).
- `formatSoles(amount)`: `"{symbol} {2 decimales, es-PE}"`, símbolo configurable (default `'S/'`).
- `decodeHtmlEntities`/`stripHtml` limpian HTML de WordPress.

Casos de prueba: `price:"5500"` → "S/ 55.00"; `"1099"` → "S/ 10.99"; `"Bien&nbsp;hecho"` → "Bien hecho"; `"<ul><li>A</li></ul>"` → "A" sin viñetas; entidades numéricas/hex → decodificadas correctamente.

**Horario de atención (`src/utils/attention.ts`):**
- Lunes a Viernes, 9:00–18:00 (hora Lima, calculada manualmente por offset, no vía librería de zona horaria).
- Feriados peruanos de fecha fija por `MM-DD` (año-agnóstico): Año Nuevo, Día del Trabajo, San Pedro y San Pablo, Fiestas Patrias (28-29 julio), Santa Rosa de Lima, Combate de Angamos, Todos los Santos, Inmaculada Concepción, Batalla de Ayacucho, Navidad.
- **Jueves y Viernes Santo se calculan dinámicamente por año** (`easterSunday(year)`, algoritmo gregoriano de Gauss): se obtiene el Domingo de Pascua del año correspondiente y se restan 3 y 2 días respectivamente — no son fechas fijas, cambian cada año automáticamente.

Casos de prueba QA (hora Lima):
1. Lunes 10:00 a.m. → "En línea ahora".
2. Lunes 8:59 a.m. → "Te respondemos hoy desde las 9:00 a.m."
3. Lunes 18:00 exacto → ya cerrado (`t < CLOSE_HOUR`) → "Te respondemos mañana..."
4. Viernes 19:00 → "Te respondemos el lunes..." (salta fin de semana).
5. 25 de diciembre, cualquier hora → cerrado todo el día por feriado.
6. Jueves Santo del año en curso (calcular la fecha real con un calendario, no asumir 04-02) → cerrado todo el día por feriado.
7. Viernes Santo del año en curso → cerrado todo el día por feriado.
8. Un día que en años anteriores fue Jueves/Viernes Santo pero este año no lo es (ej. 2 de abril en un año donde Semana Santa cae en otra fecha) → NO se marca como feriado, se trata como día hábil normal.

**WhatsApp (`src/utils/whatsapp.ts`):**
- Número: `extra.whatsapp` o default `+51950557599`, limpiado a solo dígitos.
- URL: `https://wa.me/{numero}?text={mensaje}`.
- Mensaje default: "Hola Boticuy, necesito ayuda con mi pedido."; `ProfileScreen` lo sobreescribe con "Hola Boticuy, necesito ayuda." (más corto).
- Fallo al abrir (WhatsApp no instalado) → descartado silenciosamente, **sin feedback al usuario**.

## 11.4 Notificaciones toast

**Reglas de negocio (`toastStore.ts`, `Toast.tsx`):**
- `show(message, {variant, duration})`: default `variant:'success'`, `duration:1800`ms.
- `seq` reinicia el temporizador aunque el mensaje sea idéntico.
- `pointerEvents="none"` — nunca intercepta toques.
- Íconos: `warning` → ámbar; cualquier otro (`success`/default) → check verde.

Casos de prueba: dos toasts en sucesión reinician el timer; desaparece solo a los ~1800ms; interactuar debajo del toast funciona con normalidad.

---

# 12. Resumen de hallazgos para priorizar

Estos son los puntos donde el código revela comportamiento potencialmente inesperado, inconsistente, o no implementado. No son necesariamente bugs — requieren confirmación de producto antes de reportarse como defecto:

1. **[Alto/Seguridad] Sin guard de autenticación real en la navegación** (11.2): las pantallas de Pedidos, Direcciones, Puntos, Cupones y Checkout son accesibles a nivel de ruta sin sesión; la única protección es visual en Perfil.
2. **[Medio] `/auth/refresh` no existe en producción** (10.4, confirmado por contexto de proyecto): la sesión nunca expira automáticamente en producción, solo por logout manual.
3. **[Bajo] "Marcar como predeterminada" no implementado** (6.4): no reportar como bug sin confirmar con producto si es un requisito pendiente.
4. **[Bajo] Sin timeout visible en WebView de Izipay** (3.5): una carga colgada no tiene fallback definido en el código.
5. **[Bajo] Favoritos y Vistos recientemente sin UI de borrado individual** (8.1, 1.5): las funciones `remove()`/`clear()` existen en los stores pero no están conectadas a ningún botón.

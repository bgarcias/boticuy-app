# Changelog

Reconstruido a partir de `docs/historial/CORREO_TI_ORIGINAL.md`, `docs/historial/AUDITORIA.md`, `docs/historial/DIAGNOSTICO_ACTUAL.md`, `docs/historial/PARIDAD_CHECK.md` y `PROGRESO.md` — sin fechas ni hallazgos fuera de esas fuentes. Cada ítem cita el documento (y, cuando la fuente lo dice explícitamente, quién lo encontró: auditoría propia, TI/Luis Almeyda, o correo de Fernando).

**Nota sobre la numeración:** las entradas `[0.9.x]` cubren hitos **anteriores** a que el proyecto fuera recibido para esta migración/rediseño (correos de coordinación con TI, jun 2026, ver `CORREO_TI_ORIGINAL.md`). `[1.0.0]` es la versión recibida. `[1.1.0]`/`[1.2.0]` (jul 2026) documentan la auditoría y el diagnóstico posteriores a la recepción. `[2.0.0]` es la refactorización técnica de esta sesión. Se agregó una entrada más de las 3 sugeridas originalmente porque las fuentes documentan hitos reales e independientes que se habrían mezclado en una sola entrada si se comprimían.

**Nota de desambiguación de versiones (importante):** el plugin backend llevaba su **propia numeración interna** en la cabecera de WordPress, gestionada por el equipo original sin relación con este changelog: pasó a `Version: 1.1.0` el 15 jun 2026 y a `Version: 1.2.0` el 25 jun 2026 (ver `[0.9.3]` y `[0.9.5]`). **Las entradas `[1.1.0]` y `[1.2.0]` de este documento (fechadas jul 2026) NO son esas mismas versiones** — son números de versión coincidentes por casualidad, referidos a momentos y procesos distintos (la numeración interna del archivo `.php` vs. la numeración semántica de este changelog). Como dato adicional: la cabecera del plugin se quedó fija en `1.2.0` incluso después del fix de IDOR/idempotencia del 09 jul 2026 (nunca se volvió a incrementar) — otra evidencia más de que nunca hubo un control de versiones formal.

---

## Semana del 4 al 11 de septiembre — Fixes auditoría TI

Corrección de hallazgos de `boticuy-hallazgos-completo.md` (auditoría 21-ago-2026, 41 hallazgos: C1-C4 críticos, A1-A8 altos, M1-M15 medios, B1-B14 bajos). Tracking aparte del versionado semántico normal — no reemplaza los `## [x.y.z]` de siempre, y no cierra con bump de versión (a diferencia del plugin). Los hallazgos que también tocan el plugin llevan la misma referencia `[ID]` en `boticuy-app-plugin/CHANGELOG.md`. **Verificación real no se hace hallazgo por hallazgo** — se corrige, se documenta y se sigue; una sola tanda de pruebas completas al cerrar la ronda valida todo junto.

### Fixed

- **[A7]** El carrito congelaba el precio (`unitPrice`) al agregar el producto y nada lo refrescaba — el subtotal y el tope de 30% de canje de puntos podían quedar desactualizados sin que el usuario lo notara. Nueva acción `updatePrice` en `cartStore.ts` y lógica de revalidación extraída a `src/utils/cartRevalidation.ts` (compartida, ya no vive solo dentro de `CartScreen.tsx`), aplicada en 3 capas: (1) foco del Carrito (ya existía, ahora también refresca precio, no solo stock), (2) montaje de `CheckoutScreen` (nuevo), (3) justo antes de tocar "Confirmar pedido" (nuevo) — si esta última encuentra un cambio real, corta el submit y el usuario debe reintentar contra los datos ya actualizados; si la revalidación en sí falla por red, no bloquea el submit. El recorte del servidor (`points_redeemed_adjusted`, ver `[A7]` en `boticuy-app-plugin/CHANGELOG.md`) queda como red de seguridad para la ventana de segundos que ni siquiera estas 3 capas pueden cerrar del todo. **Límite conocido, heredado de A1 — resuelto más adelante en esta misma semana, ver `[A1]`/`[B13]` más abajo:** en su momento, la revalidación reutilizaba el mismo manejo de errores de `checkStock()`, que no distinguía una falla de red real de un producto inexistente (A1) — un timeout durante la revalidación pre-submit podía remover un ítem del carrito en vez de simplemente ignorarse.
- **[M1]** La fila de descuento en `OrderConfirmationScreen.tsx` solo se pintaba si había cupón (`!!coupon`), así que un pedido pagado con puntos no mostraba ningún descuento aunque sí lo hubo — y el número que traía `discount` desde `CheckoutScreen.tsx` mezclaba cupón y puntos en un solo valor. Ahora son dos filas independientes: "Cupón" (solo el descuento del cupón) y "Puntos canjeados (N)" (solo el de puntos) — mutuamente excluyentes ya en el servidor, así que nunca compiten entre sí. El descuento por puntos se lee de `ord.points_discount`/`ord.points_redeemed` (respuesta del servidor, contrato de A7), nunca del estado local del checkout — si A7 recortó el canje, el valor calculado en el cliente ya no es el real. Cuando hubo recorte, se muestra un aviso: "Usamos X de tus Y puntos solicitados — el precio cambió antes de confirmar" (`ord.points_redeemed_adjusted`).
- **[M2]** La fila de envío mostraba "Gratis" tanto si el envío era realmente gratis como si la cotización de `/shipping` nunca se resolvió (`envio` caía en 0 en los dos casos, sin nada que los distinga). Nuevo campo `shippingUnavailable` (calculado en `CheckoutScreen.tsx` como `shipping === null` en el momento del submit) — la fila ahora muestra "No disponible" en ese caso, en vez de afirmar un envío gratuito que nunca se confirmó. **No cierra del todo el problema de fondo:** esta pantalla sigue mostrando la cotización que hizo la app *antes* de pagar, que no sabe de cupones con envío gratis — el mismo residuo ya documentado en M9 al cerrar C1. Si el pedido terminó con envío gratis por un cupón, esta fila seguiría sin saberlo. Queda para cuando se resuelva M9, no en este fix.
- **[C3]** El perfil `production` de `eas.json` no definía ninguna variable de entorno — `EXPO_PUBLIC_ORDERS_ENABLED` quedaba sin setear, `ordersEnabled` se resolvía `false`, y `createOrder()` devolvía un `PREVIEW-xxxxxx` simulado sin llamar al backend. Un build de release publicado así habría dejado al cliente ver "¡Pedido confirmado!" sin que existiera pedido ni cobro real. Dos capas de corrección:
  - `eas.json`, perfil `production`: ahora declara `env` explícito (mismas 4 claves que ya tenía `preview`) con las URLs reales de `https://boticuy.com` y `EXPO_PUBLIC_ORDERS_ENABLED: "true"`.
  - `app.config.js`: nueva `assertProductionConfigIsSafe()` — si `EAS_BUILD_PROFILE === 'production'` (variable que EAS Build expone automáticamente) y `ordersEnabled` no es `true`, o alguna de las 3 URLs no apunta a `https://boticuy.com`, el build **falla con un error explícito** en vez de generar un artefacto mal configurado. Vía de escape para un soft-launch intencional con pedidos desactivados: `ORDERS_DISABLED_CONFIRMED=true` (sin prefijo `EXPO_PUBLIC_` a propósito — solo lo lee la evaluación del build, no necesita viajar dentro del bundle de la app).
  - Actualizados los 3 ítems correspondientes del checklist de publicación en `PROGRESO.md` para reflejar que ya son automáticos, dejando explícitos los 3 que siguen siendo manuales (grep de IP de staging, modo `PRODUCTION` de Izipay en WordPress, limpieza de `console.log`).
- **[B11]** La key y el host de PostHog estaban hardcodeados como valor por defecto en `app.config.js` (`posthogKey`/`posthogHost`). Sacados de ahí — ahora se leen de `EXPO_PUBLIC_POSTHOG_KEY`/`EXPO_PUBLIC_POSTHOG_HOST`, definidas en `eas.json` (perfiles `preview`/`production`) y en `.env.staging`, mismo patrón que las URLs de API. Sin la variable definida, `initAnalytics()` ya maneja "sin key" sin romper nada. **El riesgo real siempre fue bajo** — es una Project API Key de PostHog (prefijo `phc_`), diseñada para ir en código cliente y que solo permite mandar eventos, no leer datos ni dashboards — así que esto es consistencia con el resto del proyecto, no el cierre de una fuga de credenciales real. **Pendiente, de gestión y no de código:** la cuenta de PostHog en uso **fue generada por Fernando** — no está confirmado si es personal o corporativa, solo se sabe quién la creó. Queda pendiente validar eso antes de decidir si corresponde migrar a una cuenta propia de la empresa; si se decide migrar, requiere crear el proyecto nuevo ahí y generar su key — una vez exista, el cambio en este repo es solo reemplazar el valor en `eas.json`/`.env.staging`, sin tocar código.

- **[M5]** `envioGratisDesdeNivel` (umbral reducido Plata/Oro) estaba fijado en build (`app.config.js`, `EXPO_PUBLIC_ENVIO_GRATIS_DESDE_NIVEL`), duplicado a mano con el literal equivalente en `class-shipping.php` — cambiarlo exigía editar dos repos y publicar versión nueva de la app. Trabajado junto con `[M6]`/`[M7]`/`[M8]` del plugin (mismo diseño, ver `boticuy-app-plugin/CHANGELOG.md`) porque antes de tocar código había que confirmar si la app podía simplemente dejar de tener su propia copia y confiar en `/shipping` — no del todo: `envioGratisDesdeNivel` (y `envioGratisDesde`) se usan en `HomeScreen`/`OnboardingScreen`/`ProductDetailScreen`/`FreeShippingBar` (carrito) en pantallas sin destino conocido todavía, donde `/shipping` no se puede llamar (no hay `idUbigeo`). Fix: nuevo `useShippingConfig` (`src/store/shippingConfigStore.ts`, mismo patrón `persist`+`AsyncStorage` que `recentSearchesStore.ts`) consulta `GET /shipping/config` una vez al arrancar (`App.tsx`) y cachea el resultado en disco; `FreeShippingBar.tsx` lee de ahí en vez de `Constants.expoConfig.extra.envioGratisDesdeNivel`. El valor de `app.config.js` queda solo como default inicial/offline (antes del primer fetch, o sin red) — ya no hay que mantenerlo en sync a mano con el plugin. `envioGratisDesde` (S/69, marketing) se deja igual, sin endpoint: se verificó que el valor real de envío gratis solo existe en una zona de Lima (S/69.90, "Lima 1 CERCANOS") — las demás zonas de Lima tienen envío gratis desactivado, así que no hay un único número real de "Lima" que exponer sin ser engañoso en las zonas donde no aplica.
- **[M3] + [M4]** (trabajados juntos, mismo diseño, misma función — contraparte de plugin en `boticuy-app-plugin/CHANGELOG.md`): `fetchProducts()` (`src/api/products.ts`), camino con filtro por `necesidad`/`marca`, mezclaba dos problemas de la misma raíz — el orden se perdía entre el BFF y la Store API (M3), y `total`/`total_pages` salían de un conteo (`found_posts` del BFF) que no coincidía con lo que la Store API realmente mostraba (M4). Verificado en vivo contra la Store API real antes de diseñar el fix: con `include=`, ignora por completo cualquier `orderby`/`order` — no hay combinación de parámetros que la haga respetar un orden pedido, así que un fix que dependiera de que la propia Store API ordenara o paginara un `include=` no era viable para ninguno de los dos hallazgos.
  - **[M3]** Popularidad descendente confirmada como decisión de negocio con Bran (consistente con la web actual) — el BFF ahora calcula ese orden (ver `boticuy-app-plugin/CHANGELOG.md`) y `fetchProducts()` reordena el array que devuelve la Store API según la posición de cada producto en el `ids` que ya trajo el BFF (mapa id→índice + `sort()`), en vez de confiar en que la Store API lo preserve.
  - **[M4]** El BFF ya no pagina — devuelve todos los IDs que matchean (hasta un tope de 200, confirmado con Bran según el ritmo real de crecimiento del catálogo) en una sola respuesta. `fetchProducts()` le pide a la Store API el conjunto **completo** en una sola llamada (no solo la página pedida) — así confirma cuáles IDs son realmente visibles antes de calcular nada — y recién ahí calcula `total`/`totalPages` sobre ese conjunto ya confirmado, y recorta (`slice`) la página pedida. Contrato externo de `fetchProducts()` sin cambios (`CatalogScreen.tsx` no se tocó).
  - **Verificado con datos reales antes de diseñar** (no un supuesto): 47 productos en todo el catálogo de Boticuy, máximo 20 en una sola marca — muy por debajo de cualquier volumen donde "traer todo y paginar del lado del cliente" sea costoso.
  - **Trade-off aceptado a propósito, confirmado con Bran:** cada página pedida vuelve a traer y reordenar el conjunto completo, sin ninguna capa de caché — enfoque estándar para catálogos de este tamaño; agregar caché ahora sería optimización prematura para un problema de escala que no existe hoy.
- **[B8] + [B9]** (contraparte de plugin en `boticuy-app-plugin/CHANGELOG.md`, mismo archivo `src/api/addresses.ts` + `AddressFormScreen.tsx`): `add_address()`/`update_address()` en el plugin ahora pueden responder `422` con motivos nuevos (tope de 10 direcciones, lock ocupado) además de los que ya existían (formato inválido) — pero `addAddress()`/`updateAddress()` (`src/api/addresses.ts`) devolvían `res.data?.addresses ?? []` sin revisar `res.data.ok`, y como `bffClient` no lanza excepción para códigos `< 500`, cualquier `422` resolvía como un array vacío sin error. Ya documentado como hueco pendiente en la nota de A3 ("Descubrimiento adicional, fuera de alcance de ese fix") — con el 422 nuevo de B9, ese hueco dejaba de ser un caso raro: todo usuario en el límite de 10 direcciones lo habría disparado siempre, viendo `AddressFormScreen` cerrarse sin haber guardado nada (peor que el descarte silencioso original que B9 vino a arreglar).
  - **`src/api/addresses.ts`**: `addAddress()`/`updateAddress()` ahora lanzan una excepción con el `reason` real del servidor cuando `ok !== true`, en vez de devolver `[]` en silencio.
  - **`AddressFormScreen.tsx::onSave()`**: su `catch` ya existente ahora muestra ese mensaje real (ej. "Ya tienes el máximo de 10 direcciones guardadas — elimina una para agregar otra") en vez del texto genérico fijo que mostraba antes para cualquier error.
  - **Verificado que `CheckoutScreen.tsx` sigue funcionando sin tocarlo:** su opt-in "Recordar mis datos" (fire-and-forget, ver A3) ya tiene un `.catch()` que capturaba errores de red — ahora captura también el `throw` nuevo de `addAddress()`, mismo toast de aviso que ya mostraba. Su comentario sobre "por qué revisar el arreglo resuelto, no solo el `.catch()`" quedó desactualizado (describe el comportamiento anterior) — no se tocó por no estar en el pedido explícito de este fix.
- **[B5]** (contraparte de plugin en `boticuy-app-plugin/CHANGELOG.md`) `authStore.ts::logout()` solo borraba el token de `SecureStore` local — nunca le avisaba al servidor. Un token ya copiado en otro lado (dispositivo robado, tráfico interceptado) seguía siendo válido indefinidamente aunque el usuario "cerrara sesión" en el dispositivo original. Nueva `logoutSession()` (`src/api/auth.ts`), que llama a `POST /auth/logout` (nuevo en el plugin — invalida el token vigente y cualquier otro más viejo del mismo usuario). `authStore.ts::logout()` la llama en un `try/catch` best-effort **antes** de borrar el token local (necesita el Bearer todavía activo, vía el interceptor, para que el servidor sepa de qué usuario se trata) — si falla por red o el servidor no responde, igual se cierra sesión localmente, nunca bloquea el logout.
- **[B4]** `utils/attention.ts::FERIADOS` no tenía dos feriados nacionales de fecha fija: 7 de junio (Batalla de Arica y Día de la Bandera) y 6 de agosto (Batalla de Junín, Ley N.° 31989). Lista completa revisada contra el calendario oficial vigente de feriados nacionales no laborables de Perú — coincidía en todo lo demás, solo faltaban exactamente esos dos. El 23 de julio ("Día de la Fuerza Aérea del Perú") se revisó y **no** se agrega a propósito: es una fecha conmemorativa institucional, no un feriado nacional no laborable para el público general.
- **[A2]** (seguimiento, 2026-09-09 — contraparte de plugin en `boticuy-app-plugin/CHANGELOG.md [2.15.3]`) Probando el rechazo de cupones restringidos por producto con la app real se confirmó que `create_order()` bloquea bien el pedido (capa que protege el dinero, ya cerrada), pero el carrito y el checkout mostraban "Cupón aplicado" con el descuento restado del total durante todo el flujo — `/coupon` no conocía los ítems del carrito, así que no podía anticipar ese rechazo al aplicar el cupón, solo `create_order()` al confirmar. `validateCoupon()` (`src/api/coupons.ts`) ahora acepta un segundo parámetro opcional `items` (mismo shape `{id, qty}[]` que ya usa `createOrder()`), que el servidor usa para validar restricción de producto/categoría contra el carrito real. Los 3 puntos donde la app aplica un cupón mandan sus ítems: **`CouponField.tsx`** (Carrito/Checkout, el que ve todo usuario), **`MyCouponsScreen.tsx`** y **`CreatorsScreen.tsx`** (ambos ya leían `useCart` para el chequeo de monto mínimo, se sumó el mapeo de ítems al mismo `useCart`). Sin cupones `fixed_product` o con restricción real hoy en producción, el camino de entrada sigue siendo el mismo de M10: cualquier código escrito a mano validado por `/coupon`.
- **[M13]** La clave de idempotencia (`CheckoutScreen.tsx`) se generaba una sola vez al montar el checkout (`useState` aleatorio, sin siquiera capturar el setter) y quedaba fija toda la sesión de la pantalla. Si el usuario creaba un pedido, fallaba/abandonaba el pago, y volvía a la misma pantalla a cambiar el cupón o el canje de puntos (ambos editables ahí mismo, sin salir de Checkout) antes de reintentar, el servidor devolvía el pedido original con el cupón/puntos viejos — el cambio se descartaba en silencio. A7 no cubría este caso: sus 3 capas revalidan precio/stock, no cupón ni puntos. Agregar/quitar ítems del carrito, en cambio, ya estaba naturalmente mitigado — eso requiere navegar a `CartScreen` y volver, lo que empuja una instancia nueva de `CheckoutScreen` con una key nueva. Dos capas:
  - **App:** la key ahora se deriva del contenido real (`buildIdempotencyKey()`) — un nonce de sesión (mismo valor aleatorio que antes, solo que ahora es un ingrediente del hash, no la key final) combinado con un hash chico y determinístico de ítems (ordenados por id, para que el orden del carrito no importe) + cupón + canje de puntos, recalculada en cada submit desde el estado actual. Si algo de eso cambió desde el intento anterior, la key sale distinta sola — sin necesidad de acordarse de regenerarla manualmente.
  - **Servidor:** nueva `Boticuy_App_Orders::idempotent_order_matches_request()` — antes de devolver el pedido encontrado por `idempotency_key` tal cual, compara su contenido real (ítems por producto+cantidad, cupón, `_points_requested`) contra el payload entrante. Si coincide, se comporta igual que antes. Si no coincide, no lo devuelve — le quita la meta `_idempotency_key` al pedido viejo (deja de ser `pending` sin key, no se cancela ni se borra — el barrido de A6/C4/A4 lo libera si nunca se paga, igual que cualquier otro abandono) y sigue el flujo normal de creación, que le asigna la MISMA key al pedido nuevo — así un reintento genuino del contenido nuevo sí la encuentra, sin duplicar pedidos en cada reintento.
- **[M10]** `cartStore.ts::discount()` solo calculaba `percent`/`fixed_cart` — un cupón `fixed_product` (u otro tipo no contemplado) devolvía 0 sin avisar: el chip de `CouponField.tsx` mostraba "Cupón X aplicado" con "−S/0.00", dando a entender que el cupón no hacía nada. Revisado junto con A2 antes de tocar código: son bugs en capas distintas — A2 ya garantiza que `create_order()` usa `apply_coupon()` nativo de WooCommerce, que sí calcula `fixed_product` correctamente; el monto que se cobra de verdad siempre fue correcto, el problema era puramente de previsualización en el cliente. Camino de entrada real (no solo teórico): ningún cupón `fixed_product` aparece en los 3 listados de la app (todos filtran a `percent`), pero `CouponField.tsx` acepta cualquier código escrito a mano vía `/coupon`, que no restringe por tipo. **Confirmado con Bran: sin uso real ni planeado de `fixed_product` hoy** (casi todos los cupones son `percent`, ocasionalmente `fixed_cart` en campañas) — se cubre el caso a futuro sin invertir en replicar el cálculo completo (que requeriría que `/coupon` exponga restricciones de producto/categoría, cambio de contrato mayor).
  - **`CouponField.tsx`:** cuando `discount_type` no es `percent`/`fixed_cart`, se muestra "Cupón X válido — el descuento se verá al confirmar tu pedido" en vez del chip "−S/0.00". El cupón se sigue guardando y mandando a `create_order()` sin cambios.
  - **`OrderConfirmationScreen.tsx` (desglose corregido de raíz, no solo el chip):** esa pantalla ya mostraba el `total` correcto (del servidor), pero la fila "Cupón" usaba el `discount` estimado en el cliente — para `fixed_product` esa fila no aparecía aunque el total sí bajara de verdad (mismo tipo de descuadre que C1/M2). `create_order()` ahora devuelve `coupon_discount` (nuevo, `Boticuy_App_Orders::coupon_response_fields()` en el plugin, mismo patrón que `points_response_fields()` — ver `boticuy-app-plugin/CHANGELOG.md`), y `CheckoutScreen.tsx` lo usa para reemplazar el `discount` estimado en los parámetros de navegación a `OrderConfirmation`, para cualquier tipo de cupón, no solo `fixed_product`.
  - **`CheckoutScreen.tsx` (resumen, cerrado el mismo día):** su propia fila "Descuento" tenía el mismo síntoma que el chip de `CouponField` — se ocultaba por completo cuando el `discount` estimado daba 0, sin distinguir "cupón por debajo del monto mínimo" (correcto ocultarla ahí, `CouponField` ya avisa eso con su propio mensaje) de "cupón de tipo no soportado, sí aplica" (antes desaparecía la fila entera, dando a entender que no había cupón). Nuevo derivado `discountPreviewUnsupported` (mismo criterio que `previewUnsupported` en `CouponField.tsx`, basta con `coupon.discount_type` — no hace falta esperar a `coupon_discount` del servidor porque este resumen es previo a llamar a `create_order()`) — la fila pasa a mostrar "Descuento (CODE) — Se verá al confirmar" en vez de desaparecer. Con esto, M10 queda completamente cerrado, sin residuales.

- **[A1] + [B13]** (agrupados, como los agrupa el propio plan de la auditoría) — `revalidateCart()` hacía un `fetchProduct` por ítem, en cadena secuencial (B13), y su `catch {}` ni siquiera capturaba el error para distinguir un 404 real de un timeout/500/caída de DNS (A1): con conexión lenta, un timeout en cualquiera de las N peticiones vaciaba el carrito de ese ítem. Confirmado que la capa 3 de Checkout (pre-submit, A7) heredaba el mismo bug sin cambios. Nueva `fetchProductsByIds()` en `src/api/products.ts` (mismo patrón `include=id1,id2,...` que ya usaba `fetchProducts()` para el filtro por taxonomía) — `revalidateCart()` ahora hace **una sola petición batch** en vez de N: un producto ausente de la respuesta es la señal de "ya no existe" (la Store API lo omite directamente, sin códigos de error que interpretar), y si la petición completa falla, no se toca nada del carrito. Firma pública sin cambios (`{issues, priceChanged}`), así que los 3 puntos que ya usan `revalidateCart()` (foco del Carrito, montaje y pre-submit de Checkout) siguen funcionando sin tocarlos. **Trade-off aceptado:** `isCancelled` ya no puede cortar "entre ítem e ítem" (ahora es una sola llamada) — se acepta porque la espera máxima total también bajó de N peticiones a una sola.

- **[A3]** El checkout llamaba a `addAddress()` sin `telefono` ni `numDoc` — el servidor los exige con formato válido (`class-addresses.php::validate_format()`) y rechazaba con `422`, pero la respuesta se descartaba dos veces (`addAddress()` devuelve `[]` ante un 4xx, ya que `bffClient` no lanza excepción para esos códigos; y el `.catch(() => {})` nunca llegaba a dispararse para ese caso de todos modos). Resultado: "Recordar mis datos" marcaba la casilla, guardaba el perfil local, pero la dirección en la cuenta nunca aparecía, sin aviso. Confirmado que no era un descuido aislado — `AddressFormScreen.tsx` (la pantalla de "Mis direcciones") sí arma el payload completo y sí propaga el error; el checkbox del checkout, que llama al mismo endpoint desde otro lugar, nunca se actualizó para hacer lo mismo. `SavedAddress.telefono`/`numDoc`/`nombre` son opcionales en el tipo, así que TypeScript nunca lo marcó.
  - **`CheckoutScreen.tsx`** ahora completa el payload (los datos ya estaban en el mismo scope, usados dos líneas antes para el perfil local) y deja de tragarse el resultado — revisa tanto el `.catch()` como el arreglo resuelto vacío (el caso real de un 4xx), mostrando un toast si falla. Sigue siendo fire-and-forget, sin bloquear el pago.
  - **Nuevo `buildAddressPayload()`** (`src/utils/addressPayload.ts`), usado ahora por `CheckoutScreen.tsx` y `AddressFormScreen.tsx` — un solo lugar que arma el payload, para que estas dos pantallas no vuelvan a desalinearse.
  - **Descubierto de paso, fuera de alcance:** `AddressFormScreen.tsx::onSave()` tiene el mismo problema de fondo (su `try/catch` tampoco detecta un 4xx) — no se tocó, solo se reemplazó cómo arma el payload. Anotado en `boticuy-hallazgos-completo.md` para revisar aparte si se decide.

- **[A5]** `Orders`, `OrderDetail`, `Addresses`, `AddressForm`, `Points` y `MyCoupons` se registraban en `navigation/index.tsx` sin ningún guard — la única "protección" era que las filas de Perfil son `View` sin `onPress` estando deslogueado (B6, un bug aparte, no un diseño). Agravante: `hydrate()` corre en un `useEffect` sin bloquear el render, y `hydrated` no lo lee nadie — en teoría, una pantalla protegida podía montarse antes de que el token estuviera en memoria. Confirmado que ese riesgo no depende de la red (solo de qué tan rápido responde `SecureStore`, no de `/auth/refresh`) y que el síntoma real no sería un 401 visible sino una pantalla silenciosamente vacía (`bffClient` no lanza para 4xx, cada función de la API colapsa a `[]`/vacío). Dos partes:
  - **`authStore.ts`:** nueva bandera `tokenReady`, separada de `hydrated` — se vuelve `true` apenas termina la lectura local de `SecureStore`, sin esperar el round-trip de red de `/auth/refresh`.
  - **Nuevo `useRequireAuth()`** (`src/hooks/useRequireAuth.ts`), usado por las 6 pantallas afectadas: espera `tokenReady` y, si no hay sesión, redirige con `navigation.replace('Login')` (decisión de negocio: redirigir, no dejar inaccesible en silencio). Mientras `tokenReady` es `false`, no decide nada. Cada pantalla lo integra con dos líneas (`const authorized = useRequireAuth();` + `if (!authorized) return null;`), sin duplicar la lógica de decisión. `Checkout`/`PaymentWebView` quedan fuera a propósito — son de invitado por diseño.
  - **Trade-off aceptado:** el `useEffect` de carga de datos propio de cada pantalla igual se ejecuta una vez en el mismo render en que se decide redirigir a alguien sin sesión — una petición desperdiciada en un caso ya raro, sin implicancia de seguridad.

- **[C5]** (hallazgo nuevo, encontrado el 2026-09-10 al probar en vivo `[C4]`) 3 pagos con tarjeta consecutivos (`#11245`, `#11246`, un tercero) fueron rechazados por Izipay con `PSP_727 — Unable to authenticate`, con tres tarjetas de prueba distintas marcadas como "aprobadas". Se descartó backend (firma HMAC de `validate()` valida antes de que ese rechazo pueda registrarse), `[M13]` (la idempotency key no participa del payload ni de la firma enviados a Izipay) y credenciales (viven en wp-admin, sin tocar por esta ronda). Causa raíz: `originWhitelist={['https://boticuy.com', 'https://*.micuentaweb.pe']}` en `PaymentWebViewScreen.tsx` — el endurecimiento de seguridad correcto que ya cerró el hallazgo original de `docs/historial/AUDITORIA.md`/`REFACTORIZACION_BOTICUY.md` (antes `['*']`) — bloqueaba silenciosamente la navegación al ACS (Access Control Server) del banco emisor durante el challenge 3D Secure, un dominio de terceros que no se puede enumerar de antemano. Reemplazado por `onShouldStartLoadWithRequest`, que permite cualquier navegación `https://` (el ACS puede venir de cualquier banco) y bloquea explícitamente el resto (deep-links externos, `javascript:`, `intent:` — el vector real que el hallazgo original buscaba cerrar), más `thirdPartyCookiesEnabled`/`sharedCookiesEnabled` en el `WebView` para que el ACS mantenga su sesión cross-origin durante el challenge. Mismo hallazgo de seguridad, mecanismo correcto — no una reapertura. Detalle completo en `boticuy-hallazgos-completo.md`, sección C5. **Pendiente de verificación real:** reintentar el pago con tarjeta contra staging y confirmar que el challenge 3DS carga y el pedido pasa a `processing`/`completed`.

- **[C6]** (hallazgo nuevo, encontrado el 2026-09-11, tras resolverse solo el incidente de Izipay/Visa de `[C5]`) un pago con tarjeta **Mastercard** se autenticó y cobró correctamente — el pedido pasó a "Procesando" en WooCommerce — pero la app se quedó congelada en `PaymentWebViewScreen`, sin navegar a la confirmación ni mostrar ningún mensaje. Fue el primer pago que se completó de punta a punta en toda la ronda (los anteriores fallaban antes, en el 3DS), por eso el bug no se había manifestado hasta ahora. **Causa:** el listener de `beforeRemove` de la pantalla revisaba `validatingRef.current` antes que `completedRef.current` — `complete()` llama a `navigation.replace('OrderConfirmation', ...)` mientras `validatingRef.current` todavía es `true` (se resetea recién en el `finally` de `confirmPayment()`, después), así que la propia navegación de éxito disparaba el `beforeRemove` de la pantalla, que la cancelaba con `e.preventDefault()` sin llegar a mirar que el pago ya se había completado. **Independiente de `[C5]`** aunque tocan el mismo archivo: C5 es sobre qué URLs puede navegar el `WebView` interno durante el 3DS; este bug es de React Navigation, después de que el `WebView` ya no tiene ningún rol. **Fix:** se reordenaron los chequeos del listener — `completedRef.current` se revisa primero; si el pago ya se completó, la salida se permite siempre, sin importar `validatingRef`. Detalle completo en `boticuy-hallazgos-completo.md`, sección C6, y en `TESTING-AUDITORIA-TI.md`, sección C4. **Pendiente de verificación real:** repetir el pago con Mastercard y confirmar que la app navega sola a la confirmación.

- **[C5] seguimiento** — investigando por qué el pago con tarjeta seguía fallando incluso con el WebView ya arreglado, se agregó un diagnóstico temporal en `CheckoutScreen.tsx` (`console.log('[DIAG IZIPAY]', ...)` del campo `_izipay_diag` que devolvía `formtoken()`, ver `[2.15.16]` en `boticuy-app-plugin/CHANGELOG.md`) y se retiró el mismo día (`[2.15.17]`) tras confirmar que `formtoken()` funciona perfecto y el fallo real está en el 3D Secure de Izipay, fuera de nuestro código. Detalle completo del incidente en `TESTING-AUDITORIA-TI.md`, sección C4.

- **Limpieza final de la ronda (doble check exhaustivo, 2026-09-10)** — auditoría de código muerto, comentarios desactualizados y duplicación sobre todo lo tocado esta semana. Dos hallazgos reales, corregidos:
  - **`[A5]` había roto 2 suites de test sin que nadie lo notara:** `AddressesScreen.test.tsx` (mock parcial de `@react-navigation/native`, sin `useNavigation` — `useRequireAuth()` explotaba con `TypeError`) y `MyCouponsScreen.test.tsx` (sin mock de navegación en absoluto — `useRequireAuth()` fallaba con "Couldn't find a navigation object"). Ambos test montan la pantalla sin `NavigationContainer`, y ninguno seteaba `authStore` con una sesión activa, así que `useRequireAuth()` habría devuelto `false` (pantalla en blanco) incluso arreglando el mock. Corregido: mock de `useNavigation` (`{ replace: jest.fn() }`) + `useAuth.setState({ user: {...}, tokenReady: true })` en el `beforeEach` de ambos. `npx jest --ci`: **37/37 tests en verde** (antes: 5 fallando en 2 suites).
  - **`[A1]`/`[B13]` sin migrar en `OrderDetailScreen.tsx::onReorder()`** ("Volver a pedir") — seguía con un `fetchProduct()` por ítem, en cadena secuencial, con un `catch {}` que no distinguía un producto inexistente de un timeout/500/caída de DNS (mismo bug exacto que A1, en una tercera pantalla que la revisión original no cubrió). Migrado a `fetchProductsByIds()` (misma petición batch que ya usa `revalidateCart()`) — un producto ausente de la respuesta es la señal de "ya no existe", y si la petición completa falla, no se toca el carrito (mismo criterio "ante la duda, no tocar" de A1).
  - **Comentario/rama muerta en `CheckoutScreen.tsx`** — desde `[B9]` (ver `src/api/addresses.ts`), `addAddress()` lanza ante cualquier fallo en vez de devolver `[]`; el comentario y la rama `.then((addresses) => { if (addresses.length === 0) ... })` describían el comportamiento viejo (pre-B9) y ya eran inalcanzables. Simplificado a un solo `.catch()`.
  - **Verificado sin hallazgos** (revisado con evidencia de código, no descartado a priori): endpoints de diagnóstico temporal (ninguno huérfano), duplicación de `buildAddressPayload`/validadores de teléfono-DNI/`Boticuy_App_Locks` (consolidados, sin segunda implementación), consistencia de versión del plugin (`2.15.18` en header/constante/changelog, alineados).

- **[B6] + [B7] + [B10] + [B12]** (2026-09-14) — cierre de los últimos 4 hallazgos originales de la auditoría (41/41 ya cubiertos):
  - **[B6]** Las 4 filas "bloqueadas" de Perfil sin sesión (`ProfileScreen.tsx:107`) eran `View` sin `onPress` — tocarlas no hacía nada. Ahora son `Pressable` que navegan a `Login`, mismo destino que el botón "Iniciar sesión" que ya existe arriba en la misma pantalla.
  - **[B7]** `decodeHtmlEntities()` (`src/utils/format.ts`) llamaba a `String.fromCodePoint()` sin acotar el rango — un valor fuera de `0-0x10FFFF` (o dentro del rango de surrogates aislado, `0xD800-0xDFFF`) lanza `RangeError` y tumba el render completo. Nueva `safeFromCodePoint()` valida el rango antes de decodificar; si es inválido, deja el texto de la entidad tal cual vino — mismo criterio que ya usaba el propio decodificador para una entidad *nombrada* desconocida (no inventa un placeholder, no rompe el render).
  - **[B10]** `api/auth.ts::me()` era código muerto — confirmado por grep que nadie más lo importaba en `src/` (la hidratación de sesión usa `refreshSession()`). Eliminada la función y su interfaz `MeResult`.
  - **[B12]** El `WebView` de pago no tenía ningún timeout — una carga inicial colgada dejaba el overlay "Cargando pago seguro…" para siempre. Nuevo timer de 30s (`PaymentWebViewScreen.tsx`), armado al montar y cancelado si `onLoadEnd` ya disparó antes: si sigue cargando al cumplirse, reutiliza la pantalla de error ya existente ("Volver al checkout") en vez de un mecanismo nuevo. Deliberadamente **no** cubre el overlay de `validating` (la espera de `/payment/validate`) — ahí ya hay una respuesta real de Izipay en curso, cortarla a los 30s arriesgaría interrumpir un pago que sí se está confirmando.

- **Cierre de la verificación en vivo (2026-09-14)** — últimos 5 pasos de verificación real que quedaban pendientes en la ronda, todos confirmados hoy: `[A3]` (dirección guardada/editada/eliminada por Bran en uso real), `[A4]` (concurrencia real: 2 `POST /order` simultáneos al mismo producto de stock bajo, uno rechazado con `409`, stock final en 0 sin quedar negativo — pedido de prueba `#11278` pendiente de cancelar en `wp-admin`), `[A5]` (candado visible en Perfil sin sesión, camino de UI normal — no se ejecutó la navegación forzada por debugger ni la carrera de arranque), `[A6]` (abandono explícito de un pago con tarjeta sin puntos pasa a "Fallido" al instante — el barrido automático de 45min en sí sigue sin ejercitarse en vivo), `[A7]` (agregado y retirado un `console.log('[DIAG A7]', ...)` temporal en `cartRevalidation.ts` — confirmó en vivo que la revalidación de precio sí detecta un cambio real en wp-admin y dispara el aviso). Detalle completo de cada uno en `TESTING-AUDITORIA-TI.md` y `boticuy-hallazgos-completo.md`.

- **[M9]** (2026-09-15) La barra de envío gratis y otros 4 puntos de la app prometían "envío gratis en Lima" — pero el envío gratis por umbral solo existe hoy en una zona real ("Lima 1 CERCANOS"), no en el resto de Lima ni en provincias. El mensaje era falso para la mayoría de clientes que sí están en Lima pero fuera de esa zona puntual.
  - **Causa raíz:** el texto se escribió cuando "envío gratis" y "Lima" coincidían de hecho; con el tiempo la regla de negocio se acotó a una sola zona, pero el copy de marketing nunca se actualizó.
  - **Fix — se quita la referencia geográfica, no se agrega detección de zona:** `FreeShippingBar.tsx`, `TrustStrip.tsx`, `HomeScreen.tsx`, `OnboardingScreen.tsx` y `ProductDetailScreen.tsx` ahora dicen "envío gratis" / "zonas seleccionadas" en vez de "en Lima" — sin prometer una geografía que no es cierta. El umbral real (`{S/}{monto}`) se sigue mostrando donde ya se mostraba (Home, Onboarding, ProductDetail), sale de la misma fuente de siempre (`extra.envioGratisDesde` de `app.config.js` para invitado/bronce, `useShippingConfig().envioGratisDesdeNivel` — vía `GET /shipping/config` — para Plata/Oro, ver M5) — sin cambios ahí, solo se le quitó "Lima" al copy.
  - **Por qué se descartó detectar la zona real del cliente en estas pantallas:** ninguna de las 5 (Home, Onboarding, ProductDetail, Carrito vía `FreeShippingBar`) conoce el destino del cliente en ese momento — no hay ubigeo ni dirección seleccionada todavía en Home/Onboarding/ProductDetail, y el Carrito tampoco lo pide antes de Checkout. Construir esa detección ahí exigiría pedir ubicación/dirección antes de tiempo (fricción nueva) solo para un mensaje de marketing, cuando el costo y la disponibilidad real de envío gratis **ya se calculan y muestran correctamente más adelante** — en Checkout y en la confirmación del pedido — una vez que el destino real sí se conoce (`Boticuy_App_Shipping::compute_cost()`, ya resuelve la zona real desde el `idUbigeo`). Generalizar el mensaje resuelve la promesa falsa sin ese costo de ingeniería/UX.

- **[M9] seguimiento** (2026-09-15) — el fix anterior de M9 (quitar "en Lima" del copy en las 5 pantallas sin destino conocido) dejó pasar un caso: en **Checkout**, que sí conoce el destino real, el hint de envío gratis interpolaba directamente `shipping.zone` — el nombre **interno** de la zona de WooCommerce tal cual viene de `/shipping` (ej. `"Lima 1 CERCANOS"`, `"Peru, Callao"`), un dato administrativo nunca pensado para el cliente final.
  - **Fix:** `CheckoutScreen.tsx` — el hint ya no interpola `shipping.zone` en absoluto; pasa de `"Envío gratis en {zone} desde {monto}."` a `"Envío gratis desde {monto} en tu zona."` — mismo dato real (`free_threshold`), sin ningún nombre administrativo.
  - **Verificado contra `/shipping` real (staging), 3 destinos, rastreando la condición exacta de render (`!is_free && free_threshold != null`)** — no se pudo tomar captura de pantalla real (sin emulador/dispositivo disponible en esta sesión), así que se verificó trazando el código contra la respuesta real del servidor en cada caso:
    - Miraflores (`Lima 2 CERCANOS`), subtotal bajo el umbral → hint se muestra: *"Envío gratis desde S/69.90 en tu zona."* — sin el nombre de la zona.
    - Mismo destino, subtotal sobre el umbral (`is_free: true`) → el hint no se renderiza en absoluto (fila "Envío" ya dice "Gratis").
    - Callao (sin envío gratis por zona, `free_threshold: null`) → el hint tampoco se renderiza.
  - **Revisado también `OrderConfirmationScreen.tsx` y el resto de `src/`** (`grep -rn ".zone\b"`) — ningún otro punto de la app interpola `shipping.zone` ni ningún otro campo administrativo de WooCommerce en un texto visible; era el único caso.

### Cerrado sin cambios de código

- **[C2]** El build `preview` (`eas.json`) apunta a `http://35.209.93.250` (staging) sin cifrar, con `withCleartextHost` activo — credenciales, JWT, DNI, teléfono y dirección viajarían en texto claro si alguien intercepta el tráfico. **Se decidió no tratarlo como defecto:** un ambiente de staging existe precisamente para no llevar las garantías de producción — igual que tampoco tiene la pasarela de pagos real (Izipay en modo `TEST`), no le corresponde HTTPS de producción. Pedirle TLS real a un servidor de pruebas interno trataría un ambiente de pruebas como si fuera producción, que es justo la distinción que la separación de ambientes busca evitar. Se evaluaron y descartaron dos alternativas de código/infraestructura (HTTPS real en staging, certificado autofirmado con pinning) por el mismo motivo, no por inviabilidad técnica. El riesgo residual real — probar con datos personales propios reales sobre una red no confiable — es una práctica de testing a evitar (usar datos ficticios), no un defecto de código ni una tarea de infraestructura pendiente. El ambiente que sí importa, producción, ya está cubierto por `assertProductionConfigIsSafe()` (ver `[C3]` arriba), que exige HTTPS real a `boticuy.com` sin excepción.

- **[package.json]** (2026-10-02) La versión de `package.json` (y la raíz de `package-lock.json`) se alineó con la de `app.config.js`: de `2.0.0` a `2.5.0`. Sin bump de versión, el valor efectivo de la app no cambia.

---

## [2.5.1] - 2026-10-02

Los productos pedidos por lista de IDs se piden en lotes de 100, el tope de canje de puntos se calcula con la misma aritmética en céntimos que el servidor, el envío que muestra el checkout y la confirmación coincide con el que se cobra, y el checkout muestra los montos de la cotización del servidor.

### Fixed
- **`fetchProducts()` con filtro por necesidad o marca y `fetchProductsByIds()`** (`src/api/products.ts`): pedían todos los IDs en una sola llamada con `per_page` igual a la cantidad de IDs, y la Store API acepta como máximo 100 por llamada, así que una lista de más de 100 IDs fallaba con 400. Nueva función interna `fetchProductsInBatches()`: parte los IDs en lotes de 100, los pide con `Promise.all` y une las respuestas con `flatMap`. Si falla un lote, falla toda la petición, no se devuelve un resultado parcial. `fetchProducts()` sigue reordenando por la posición de cada ID en la lista del servidor y calculando `total`/`totalPages` sobre el conjunto ya unido. El contrato de las dos funciones no cambia.
- **`PointsRedeemField.tsx`**: el tope de canje del 30 % se calculaba con flotantes (`Math.floor((subtotal * 0.3) / 0.05)`), mientras el servidor lo calcula en céntimos enteros, así que la app ofrecía 1 punto (S/0.05) menos que el servidor en cerca del 10 % de los montos (con S/1.00 ofrecía 5 puntos y el servidor aceptaba 6). Ahora `capCents = Math.floor((Math.round(subtotal * 100) * 3 + 5) / 10)` y `capPoints = Math.floor(capCents / 5)`, la misma aritmética en céntimos enteros. Solo cambió el cálculo de `capPoints`.
- **Envío en el checkout y la confirmación** (`src/api/shipping.ts`, `src/api/orders.ts`, `src/screens/CheckoutScreen.tsx`): el checkout cotizaba el envío con el subtotal bruto, pero el servidor compara el umbral de envío gratis contra el subtotal ya descontado por el cupón o los puntos, así que podía mostrar "Envío gratis" y un total menor al que se cobraba, y la confirmación repetía "Gratis". Ahora `fetchShipping()` manda `subtotal_neto` (subtotal menos descuento del cupón menos descuento de puntos, nunca negativo) y el checkout vuelve a cotizar cuando cambian el distrito, el cupón o los puntos; solo cuenta la respuesta de la última cotización y, mientras cotiza, el total muestra "Calculando…". La confirmación usa `shipping_total` de la respuesta de `POST /order` para la fila "Envío"; si no viene (servidor anterior), queda el comportamiento de antes, incluido "No disponible". Muestra "Gratis" solo si el servidor devolvió 0. Requiere el plugin `2.15.39`; con uno anterior la app se comporta como antes.
- **Cotización del servidor en el checkout** (`src/api/quote.ts` nuevo, `src/screens/CheckoutScreen.tsx`): el checkout estimaba el descuento del cupón, el descuento de puntos y el envío en la app, y esa estimación podía diferir de lo cobrado (cupones restringidos a ciertos productos, de monto fijo por producto, envío gratis por cupón o por nivel). Con un distrito elegido, el checkout pide `POST /quote` con los ítems, el cupón, los puntos a canjear y el `idUbigeo`, con un retraso de 400 ms desde el último cambio de ítems, cupón, puntos o distrito. Solo cuenta la respuesta de la última petición: cada cotización queda asociada a la entrada que se cotizó y una respuesta de una petición anterior se descarta. Si la cotización responde bien, el resumen y el total muestran `coupon_discount`, `points_discount` (y `points_redeemed` en la fila de puntos si el servidor recortó el canje), `shipping_total` y `total` del servidor. Respaldo: si no hay distrito, si la petición falla por red o por un error del servidor, o si responde `ok: false`, el checkout usa el cálculo local de antes (`cartStore.discount()`, descuento de puntos local y la cotización de envío de `fetchShipping()` con el subtotal neto) y no muestra ningún error nuevo; el rechazo real, si lo hay, sale al confirmar el pedido como antes. Mientras la cotización de un cambio está en curso (incluido el retraso de 400 ms), el total muestra "Calculando…" y el botón "Confirmar pedido" queda deshabilitado; si la cotización falló, el botón queda habilitado. Requiere el plugin `2.15.40`; con uno anterior, `POST /quote` no existe, la cotización falla y el checkout usa el respaldo.
- **Tiempo de espera de la cotización** (`src/api/quote.ts`): `fetchQuote()` usa un tiempo de espera propio de 4 segundos (`QUOTE_TIMEOUT_MS`), más corto que los 20 segundos generales de `bffClient`. Si se cumple, la petición lanza, el checkout la trata como una cotización fallida, usa el cálculo local y habilita el botón "Confirmar pedido", en vez de dejarlo deshabilitado hasta 20 segundos. El valor sale de cinco mediciones de `POST /quote` contra staging (cupón de 30 % sobre un producto, 1.02 a 1.22 segundos, típico 1.1 segundos): tres veces lo típico serían 3.3 segundos, y el mínimo permitido es 4 segundos.

- **Puntuación de los textos visibles**: se unificó la puntuación de los textos visibles, con coma, punto o guion simple en lugar de guion largo o medio, en el cupón aplicado (`CouponField.tsx`), el aviso de puntos recortados de la confirmación (`OrderConfirmationScreen.tsx`), el botón de restar cantidad (`CartScreen.tsx`, `ProductDetailScreen.tsx`), el marcador de envío no disponible del checkout y el horario de atención por defecto (`ProfileScreen.tsx`). Solo cambia el texto.

**Sin tocar:** lo que se envía a `POST /order` y los parámetros hacia la confirmación (siguen saliendo de la respuesta del pedido), `CouponField.tsx`, `cartStore.discount()`, `fetchShipping()`, `OrderDetailScreen.tsx` y `cartRevalidation.ts` (su manejo de error ante una petición fallida ya deja el carrito intacto y avisa al usuario).

---

## [2.5.0] - 2026-09-08

**Excepción puntual a la nota de arriba** ("no cierra con bump de versión, a diferencia del plugin"): se cierra esta ronda también con un bump en la app, porque `app.config.js::version` había quedado desalineado — seguía en `'2.0.0'` mientras este mismo archivo ya documentaba hitos posteriores reales (hasta `[2.4.1]`, 2026-07-30) que nunca se reflejaron en el campo real de la app. Se aprovecha el cierre de esta ronda para sincronizarlo, antes de subir el plugin/app para la tanda de pruebas.

### Fixed
Referencia a los IDs ya detallados en la sección de arriba (sin repetir descripción) — contraparte de app de la ronda cerrada en `boticuy-app-plugin/CHANGELOG.md` `[2.15.0]`: A1, A3, A5, A7, B4, B5, B8, B9, B11, B13, C2, C3, M1, M2, M3, M4, M5, M10, M13.

---

## [0.9.0] - 2026-06-03 (`docs/historial/CORREO_TI_ORIGINAL.md`)

Primera entrega del proyecto a TI para revisión. Fernando → Luis Almeyda (TI): *"Boticuy App lista para implementacion y testing. Ver version HTML / adjuntos."* (3 jun 2026, 11:47). El acceso al Drive compartido inicialmente falló (Luis Almeyda: *"No se puede acceder al link de drive"*, 4 jun) y Fernando reenvió un nuevo enlace el mismo día.

---

## [0.9.1] - 2026-06-11 (`docs/historial/CORREO_TI_ORIGINAL.md`)

Nota de proceso de TI (Luis Almeyda), previa a la primera revisión formal (que anuncia para el lunes siguiente), sobre desarrollar con IA sin un proceso de ingeniería formal detrás — cita textual:

- *"Para el desarrollo de software se maneja un proceso, donde se documenta toda la información del aplicativo (Hus, Criterios de aceptación, etc.), esto ayuda en todo el proceso de pruebas y automatización."*
- *"Aplicaciones que se generen con IA al lanzarse generará un trabajo adicional para el área de TI, por eso generalmente se utiliza un stack de herramientas que maneja el equipo..."*
- *"Actualmente, veo que en la página de Boticuy están agregando código que no ha sido auditado o revisado (al menos no por nuestra área) y esto puede presentar una brecha en la seguridad."*
- *"...se debe realizar siempre un backup antes de hacer cambios fuertes en cualquier web, para poder hacer regresión si es que sucede algún problema."*

Fernando responde el mismo día con una "Respuesta a observaciones de TI" (HTML + PDF adjuntos, contenido no incluido en el texto del correo disponible).

---

## [0.9.2] - 2026-06-15 (`docs/historial/CORREO_TI_ORIGINAL.md`)

Primera ronda de revisión de TI (Luis Almeyda). Hallazgos, citados textualmente:

1. *"Casi todas las validaciones de algún error retornan el código 200 en lugar de un código http correcto."*
2. *"En el método de 'create order' al poner el método de pago tarjeta no valida con izipay si de verdad está procesando el pedido, no está incluido en el flujo."*
3. *"Al crear el request para izipay el modo TEST esta harcodeado debería usar el parámetro de woocommerce."*
4. *"Al crear el request para izipay la variable 'amount' asume que ese valor viene correcto del cliente, en vez de sacarlo directamente del pedido."*
5. *"No se ve ningún control de errores, cualquier excepción que se genere no es controlada."*
6. *"En el app hay algunos para revisar, pero el que más impacta es el cálculo del monto de pedido, esta debe siempre generarse en el backend."*

Conclusión de TI: *"el app y backend tiene aún más para corregir y no debería ser lanzado a producción aún."* Aclara que no se habían hecho pruebas directas del app ni revisado lo agregado de "copa boticuy", y reitera que React Native no es el stack de TI (Flutter y Android nativo).

---

## [0.9.3] - 2026-06-15 (`docs/historial/CORREO_TI_ORIGINAL.md`)

Correcciones aplicadas por el equipo original, mismo día. Fernando: *"Correcciones aplicadas (plugin v1.1.0). Ver version HTML y adjunto."* — `v1.1.0` es la numeración interna propia de la cabecera del plugin de WordPress (ver nota de desambiguación arriba), no la de este changelog.

---

## [0.9.4] - 2026-06-25 (`docs/historial/CORREO_TI_ORIGINAL.md`)

Segunda ronda de revisión de TI (Luis Almeyda): *"Las observaciones indicadas se han trabajado, ahora se detectaron algunos detalles que pueden afectar la salida a producción."*

**Backend:**
- *"En el tema de inputs revisar la sanitización (Ejm. las direcciones)"*
- *"En los apis de registros (ejm. registro de pedidos y usuarios) revisar una manera de validar el uso del api (rate limiter) o proponer un método adicional."*
- *"Revisar el tiempo de vida de los Tokens (30 días es mucho tiempo en caso que haya leak del mismo)"*

**App:**
- *"Revisar si los datos de los usuarios deben guardarse en AsyncStorage vs SecureStorage (Ejm. datos de checkout)"*

Adicional: *"todo este código fuente debe estar en un repositorio de la empresa. Para poder controlar los cambios que se hagan y poder hacer regresión en caso se necesite."*

---

## [0.9.5] - 2026-06-25 (`docs/historial/CORREO_TI_ORIGINAL.md`)

Segunda corrección aplicada por el equipo original, mismo día. Fernando: *"Segunda ronda de correcciones (plugin v1.2.0). Ver version HTML y adjunto. Cualquier cosa que necesites de contexto, me dices. Gracias, Brandon."* — dirigido explícitamente al destinatario de este proyecto. `v1.2.0` es, de nuevo, la numeración interna del plugin (ver nota de desambiguación), y es la versión con la que arranca `[1.0.0]` a continuación.

---

## [1.0.0] - 2026-06-25 (recibida; ver `CORREO_TI_ORIGINAL.md`)

Versión recibida para esta migración/rediseño, construida con herramientas de IA sin ingeniero de software involucrado en su desarrollo original. Sin control de versiones formal: `boticuy-app-legacy/` nunca tuvo carpeta `.git` (confirmado en `DIAGNOSTICO_ACTUAL.md`, Fuente 2 #3 — "no tiene carpeta `.git`... no versionado"). El propio plugin backend sí llevaba una numeración interna en su cabecera de WordPress (`Plugin Name: Boticuy App API`, `Version: 1.2.0`, ver `AUDITORIA.md` línea 4 y `[0.9.5]` arriba) — pero, como se explica en la nota de desambiguación, esa numeración es del equipo original vía correo, no un control de versiones real ni la numeración de este changelog.

La fecha (2026-06-25) corresponde al correo de Fernando entregando la "Segunda ronda de correcciones (plugin v1.2.0)" dirigido directamente a Brandon — es la evidencia más cercana disponible al momento de recepción; ninguna fuente registra una fecha de "entrega formal" distinta a esa.

---

## [1.1.0] - 2026-07-08 (`docs/historial/AUDITORIA.md`)

### Encontrado (no corregido aún en este punto)
- **IDOR en `/payment/formtoken`** (hallazgo 2.9, auditoría propia): no verificaba que quien pedía el `formToken` tuviera derecho a ese `order_id` — cualquiera podía probar IDs consecutivos y obtener el monto/`formToken` de un pedido ajeno. Severidad media (no permitía robar dinero, sí exponer datos y que un tercero iniciara el cobro de un pedido ajeno).
- **Fuga de mensajes de error internos** en `/auth/register` y `/payment/formtoken` (hallazgo 2.10, auditoría propia): devuelven `$uid->get_error_message()`/`$resp->get_error_message()` crudos al cliente en vez de un mensaje genérico.
- **HTTP 200 para un fallo real en `/auth/register`** (hallazgo 2.4): verificación de un punto reportado originalmente por TI (Luis Almeyda, correos de junio 2026 — ver `[0.9.2]` — y Fuente 2 de `DIAGNOSTICO_ACTUAL.md`), con una inconsistencia puntual identificada en esta auditoría: `is_wp_error($uid)` devuelve 200 en vez de un código de error.
- **`originWhitelist={['*']}` sin acotar** en el WebView de pago — "hallazgo ya señalado en la auditoría original y nunca cerrado" (citado también en `PROGRESO.md`, Sección 2).
- **Autenticación manual por función** en vez de `permission_callback` declarativo (hallazgo 5.2, auditoría propia) — riesgo de mantenibilidad a futuro, no de seguridad en ese momento.
- **Duplicación/inconsistencia de la lista de palabras excluidas de cupones** entre `boticuy_app_creators` y `boticuy_app_coupons` (hallazgo 5.3, auditoría propia) — una lista incluye "envío" con tilde escapada y la otra no.
- **Rate limiting basado en `REMOTE_ADDR`** sin confirmar si el hosting/CDN de producción preserva la IP real del cliente (matiz del hallazgo 2.6) — podría inutilizar el límite si el proxy no está configurado.
- **Sin alerta activa** ante un intento de pago con monto adulterado — hoy solo queda una nota silenciosa en el pedido (recomendación no bloqueante).
- **Sin tests automatizados en el flujo de checkout/pago**, 0% de cobertura (ítem 5 del veredicto final).
- **Discrepancia entre el `README.md` de la app** (marcaba login/pedidos/pago como "pendiente") **y el estado real del plugin** (ya implementados con controles serios) — nota inicial del documento, pendiente de aclarar con el equipo.

### Ya confirmado en este punto (no bloqueante, sin acción)
Monto siempre calculado server-side con doble verificación, validación criptográfica real del pago de Izipay (HMAC + anti-replay + anti-manipulación de monto), modo TEST/PRODUCTION leído de configuración (no hardcodeado — corrige `[0.9.2]` #3), sanitización sistemática de inputs (corrige `[0.9.4]`), rate limiting en registro/login/creación de pedidos (corrige `[0.9.4]`), sin credenciales ni secretos hardcodeados, separación correcta SecureStore/AsyncStorage (corrige `[0.9.4]`).

---

## [1.2.0] - 2026-07-09 (`docs/historial/DIAGNOSTICO_ACTUAL.md`)

### Fixed
- **IDOR en `/payment/formtoken` y `/payment/validate`** (Fuente 1 #8): nuevo `bcy_order_access_ok()` — exige uid autenticado por Bearer si el pedido es de usuario registrado, o `checkout_token` de invitado (128 bits, `hash_equals()`) si es de invitado. Corregido este mismo día.
- **Falta de idempotencia en `/order`** (Fuente 3 #4, hallazgo reportado por correo de Fernando): nuevo `bcy_find_order_by_idempotency_key()` + campo `idempotency_key` en el body — un reintento con la misma key devuelve el pedido ya creado en vez de duplicarlo. Corregido este mismo día.

### Carried over / confirmado (re-verificación, sin cambios de código nuevos en este punto)
- Monto server-side, validación de firma HMAC, modo TEST/PRODUCTION, sanitización — sin cambios respecto a `AUDITORIA.md`.
- Duración del JWT confirmada en 7 días (antes 30 — corrige `[0.9.4]`, "Revisar el tiempo de vida de los Tokens") (Fuente 1 #7 / Fuente 3 #1, correo de Fernando).
- `/payment/formtoken` confirmado que solo devuelve `{ ok, formToken, publicKey, mode, amount }`, nunca llaves privadas de Izipay (Fuente 3 #3, correo de Fernando).

### Pending (marcado explícitamente como "no relacionado con este fix", sin tocar)
- HTTP 200 para el fallo de `/auth/register` (Fuente 2 #1) — sigue sin corregir en este punto.
- Fuga de mensaje interno también en `/payment/formtoken` — sigue sin corregir.
- `try/catch` ausente en `register`, `login`, `addresses_*`, `points`, `shipping`, `coupons`, `products`, `ubigeo_*` (Fuente 2 #2).
- Repositorio Git de la empresa: `boticuy-app-legacy/` sigue sin `.git`; `boticuy-app/` tiene git local pero sin remoto conectado (Fuente 2 #3) — sigue sin resolver el pedido de `[0.9.4]` ("todo este código fuente debe estar en un repositorio de la empresa").
- `deploy_boticuy_app_bff.py` (script con posible app-password de WordPress filtrada, mencionado por Fernando) — no se pudo localizar ni verificar (Fuente 3 #2); tratar como potencialmente comprometido hasta confirmar.

---

## [2.0.0] - 2026-07-10 (`docs/historial/PARIDAD_CHECK.md`, `PROGRESO.md`, reestructuración de esta sesión)

Refactorización técnica completa sobre la v1 original (app + backend), no un proyecto nuevo sin relación.

### Added
- Configuración por entorno vía `app.config.js` → `extra` con overrides `EXPO_PUBLIC_*` (URLs de API, `ordersEnabled`, PostHog, moneda, envío gratis, WhatsApp, horario), reemplazando `src/config.ts` hardcodeado del legacy (`PARIDAD_CHECK.md` sección 5, `PROGRESO.md`).
- `decodeHtmlEntities()` centralizada en `utils/format.ts`, aplicada en la capa de API (`products.ts`, `taxonomies.ts`, `coupons.ts`, `orders.ts`) (`PROGRESO.md`, Fase 5).
- `Toast` y `OfflineBanner` migrados y montados en `App.tsx` (`PARIDAD_CHECK.md`, secciones 3 y 5).
- Analítica PostHog conectada de verdad, con la misma cuenta del legacy (decisión explícita del equipo) (`PARIDAD_CHECK.md`, sección 4).
- Infraestructura de testing completa (`jest`, `jest-expo`, `react-test-renderer`, config, 9 tests en verde) — no existía en el proyecto nuevo antes de este punto (`PARIDAD_CHECK.md`, sección 5).
- Cotización de envío real en el checkout, antes texto fijo "se coordina por WhatsApp" (`PROGRESO.md`, Fase 3).
- `idempotency_key` conectado desde el cliente (`CheckoutScreen`) y `checkout_token` propagado a `/payment/formtoken`/`/payment/validate` para invitados (`PROGRESO.md`, Fase 4).
- Reestructuración completa del backend a plugin real con clases (`boticuy-app-plugin/`, ver su propio `CHANGELOG.md` para el detalle) — mismo salto de versión v1→v2 aplicado en paralelo.

### Fixed
- `/auth/register` ya no devuelve HTTP 200 para un fallo real al crear el usuario (corrige Fuente 2 #1 de `DIAGNOSTICO_ACTUAL.md`, aplicado en `boticuy-app-plugin/`).
- `/payment/formtoken` ya no expone el mensaje interno de red al fallar la conexión con Izipay (corrige la nota adicional de `DIAGNOSTICO_ACTUAL.md`).
- `try/catch` extendido a los endpoints que no lo tenían (corrige Fuente 2 #2 de `DIAGNOSTICO_ACTUAL.md`).
- `originWhitelist` del WebView de pago acotado de `['*']` a `['https://boticuy.com', 'https://*.micuentaweb.pe']` (corrige el hallazgo de `AUDITORIA.md`) (`PROGRESO.md`, Fase 4).
- `/auth/refresh` roto en producción (confirmado con `curl` → 404 `rest_no_route`, código muerto en el legacy): reemplazado por `GET /auth/me` para validar sesión al reabrir la app — corrige el logout silencioso real que sufría cualquier usuario del legacy en producción (`PARIDAD_CHECK.md`, sección 2; `PROGRESO.md`, Sección 2).
- Entidades HTML sin decodificar (`&#8211;`, etc.) en nombres de producto/categoría/marca/reseña/pedido, incluyendo `product.name`, que no pasaba por ninguna función — corregido con `decodeHtmlEntities()` (`PROGRESO.md`, Fase 5).
- Configuración hardcodeada en 5+2 sitios (`envioGratisDesde`, `currencySymbol`, `horarioAtencion`, `utils/format.ts`, `utils/whatsapp.ts`) — centralizada en `app.config.js` (`PARIDAD_CHECK.md`, sección 5).
- Duplicación de la regex de validación de email entre `CheckoutScreen` y `LoginScreen`: unificada en `isValidEmail()` (`utils/validation.ts`). Nota: al momento de la referencia en `PROGRESO.md` Sección 2, solo `LoginScreen` la consumía explícitamente citado ahí — no hay confirmación explícita en las fuentes de que `CheckoutScreen` también la reutilice tras su propia migración en la Fase 3.

### Pending
- Verificación real de pago con tarjeta (Izipay, `ordersEnabled=true`, credenciales TEST) end-to-end (`PROGRESO.md`, Fase 4).
- Verificación real de creación de pedido con `ordersEnabled=true` contra WooCommerce (`PROGRESO.md`, Fase 3).
- IPN (notificación instantánea servidor-a-servidor) de Izipay/Lyra del lado del plugin — no implementado; no se pudo confirmar el esquema de verificación de firma con una fuente autoritativa (`boticuy-app-plugin/README.md` y `CHANGELOG.md`).
- Repositorio Git de la empresa sin remoto conectado, según la última verificación documentada (`DIAGNOSTICO_ACTUAL.md`, Fuente 2 #3) — decisión operativa, no de código. Sigue siendo, en última instancia, el pedido de `[0.9.4]` sin cerrar del todo (hay repo local, no remoto de la empresa).
- `deploy_boticuy_app_bff.py` (posible credencial filtrada) — no localizado ni verificado; tratar como potencialmente comprometido hasta confirmar (`DIAGNOSTICO_ACTUAL.md`, Fuente 3 #2).
- "Mis cupones" sigue mostrando "Pronto" (no migrado, igual que el legacy) (`PROGRESO.md`, Fase 5).
- Reintento de pago desde el detalle de un pedido `pending` — no se construyó (`PROGRESO.md`, Fase 4).

---

## [2.0.1] - 2026-07-10 (rollback de SDK, esta sesión)

**Rollback temporal de Expo SDK 57 → SDK 54.** Motivo: Apple tiene la versión de **Expo Go** publicada en la App Store de iOS **congelada en SDK 54 desde hace meses** (no ha aprobado versiones más nuevas que soporten SDK 55/56/57), y la prioridad de esta sesión era poder probar la app en un iPhone físico. Sin este rollback, Expo Go en un iPhone real no puede abrir un proyecto en SDK 57.

### Changed
- `expo` fijado a `~54.0.0` (antes `^57`); reinstalación completa (`node_modules` + `package-lock.json` borrados y reinstalados) para resolver correctamente todas las versiones hacia atrás — `expo install --fix` no bastó por sí solo porque comparaba contra lo ya instalado, no contra el rango recién editado.
- Todo el árbol de dependencias realineado a SDK 54: `react 19.1.0`, `react-dom 19.1.0`, `react-native 0.81.5`, `expo-constants ~18.0.13`, `expo-font ~14.0.12`, `expo-image ~3.0.11`, `expo-secure-store ~15.0.8`, `expo-status-bar ~3.0.9`, `react-native-gesture-handler ~2.28.0`, `react-native-safe-area-context ~5.6.0`, `react-native-screens ~4.16.0`, `react-native-webview 13.15.0`, `@react-native-community/netinfo 11.4.1`, `jest-expo ~54.0.17`, `react-test-renderer 19.1.0`, `typescript ~5.9.2`, `@types/react ~19.1.10`. `@react-native-async-storage/async-storage` (2.2.0) y `posthog-react-native` (^4.55.0) no cambiaron — ya eran compatibles con ambos SDKs.
- `app.config.js` → `plugins`: se quitó `'expo-image'` de la lista (quedó `['expo-font', 'expo-secure-store']`). Causa: un choque entre Node.js v24 (instalado en esta máquina) y cómo `@expo/config-plugins` de SDK 54 resuelve `expo-image` como config plugin (su `package.json` en la versión de SDK 54 apunta `"main": "src/index.ts"`, fuente TS cruda con imports sin extensión, que el resolver de plugins intenta `require()` directo y choca con el soporte nativo y estricto de TypeScript de Node 24 para archivos dentro de `node_modules`). No afecta el uso del componente `<Image>` en ningún archivo — solo se usaba como string en `plugins` sin ninguna opción de configuración nativa.

### Fixed
- `PaymentWebViewScreen.tsx:128`: `{ ...StyleSheet.absoluteFill, ... }` → `{ ...StyleSheet.absoluteFillObject, ... }`. En RN 0.86 (SDK 57) el tipo de `StyleSheet.absoluteFill` estaba relajado a `any`, permitiendo el spread; en RN 0.81.5 (SDK 54) es `RegisteredStyle<T>` (un ID opaco, no spreadable), y `npx tsc --noEmit` lo marcó como error real. `absoluteFillObject` es el API que la propia documentación de tipos de React Native recomienda para spread + overrides — mismo comportamiento en runtime, tipado correcto en ambas versiones.

### Verificado (mismo nivel que la subida a SDK 57)
- `npx expo-doctor` → 18/18 checks passed.
- `npx tsc --noEmit` → limpio (tras el fix de `absoluteFill`).
- `npm test` → 9/9 tests pasando (los mismos que antes del rollback).
- `npx expo install --check` → "Dependencies are up to date".
- `npx expo start` → arrancó limpio, Metro sirviendo en `:8081` (`curl .../status` → `packager-status:running`).
- Revisión dirigida de `expo-secure-store`, `react-native-webview`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo` y `posthog-react-native`: ninguna API que usa el código (`getItemAsync`/`setItemAsync`/`deleteItemAsync`, props del `WebView` de pago, `addEventListener`/`isConnected` de NetInfo, `capture`/`identify` de PostHog) falta o cambia de forma en las versiones de SDK 54. La única diferencia real encontrada en toda la revisión fue la de `absoluteFill` (ya corregida arriba).

### Pending
- **Este rollback es temporal.** Cuando Apple apruebe una versión de Expo Go compatible con SDK 55/56/57 (o superior), corresponde re-evaluar volver a subir de SDK, siguiendo el mismo proceso de verificación exhaustiva documentado en esta entrada.
- No se tocó `boticuy-app-plugin/` ni el backend — este rollback es exclusivamente de la app cliente (`boticuy-app/`).

---

## [2.0.2] - 2026-07-13

### Fixed
- **`ProductCard.tsx:25`**: pedía `product.images?.[0]?.src` (tamaño completo, hasta 1200px de ancho) para renderizar una tarjeta de solo 130px de alto, en vez de `.thumbnail` (300×300) que la Store API de WooCommerce ya devuelve en cada imagen. Encontrado en un diagnóstico de rendimiento de Home/ProductDetail/Catálogo, medido contra una imagen real de producto: 315,630 bytes (`.src`) → 34,701 bytes (`.thumbnail`), **~9.1× menos peso por imagen**. Fix: `product.images?.[0]?.thumbnail ?? product.images?.[0]?.src` — mismo patrón que ya estaba bien hecho en `cartStore.ts:40` (copiado de ahí, no reinventado). Como `ProductCard` es el componente de tarjeta compartido, el fix se propaga sin tocarlas a `HomeScreen`, `HorizontalProducts` (Home y `ProductDetailScreen`), `CatalogScreen` y `FavoritesScreen`. Estimado para la carga inicial de Home (≥16 tarjetas montadas sin scrollear, sección "Más vendidos" sin virtualización + "Para tu inmunidad" + "Vistos recientemente"): **~5 MB → ~550 KB**. `ImageGallery.tsx` (foto grande con zoom del detalle de producto) se dejó igual a propósito — ahí sí corresponde `.src` a tamaño completo. Detalle y verificación (typecheck, comparación visual) en `PROGRESO.md`.

### Docs
- `AGENTS.md`: la instrucción de consultar la documentación versionada de Expo apuntaba a `v56.0.0`, desactualizada desde el rollback a SDK 54 (`[2.0.1]`, 2026-07-10 — nunca se había corregido esa referencia). Corregida a `v54.0.0`, con una nota aclarando el rollback para que no se repita la confusión.

---

## [2.0.3] - 2026-07-13

### Added
- **`refreshSession()`** en `src/api/auth.ts`: llama a `POST /auth/refresh` (Bearer token vigente vía interceptor, sin body), firma confirmada contra `boticuy-app-plugin/API-CONTRACT.md` — `200 { ok:true, token, user }` o `401 { ok:false, reason:"Sesión expirada" }`.
- `authStore.hydrate()` ahora llama a `refreshSession()` en vez de `me()` al arrancar la app: si la sesión sigue vigente, el plugin reemite un token nuevo (otros 7 días) que se guarda en memoria, en el interceptor y en SecureStore — sesión deslizante real, en vez de la sesión de 7 días fijos sin renovación que había desde `[2.0.0]`.
- **Manejo explícito de tres resultados**, no un simple truthy/else: `ok === true` (+ `token` + `user`) renueva la sesión; `ok === false` (401 real del plugin, `reason:"Sesión expirada"`) cierra sesión; **cualquier otra respuesta se trata igual que un error de red — mantiene la sesión local sin cerrarla**. Este tercer caso es intencional, no defensivo de sobra: ver nota abajo.

### Verificado
- `npx tsc --noEmit` limpio, `npx expo-doctor` 18/18.
- **Hallazgo real contra producción** (sin crear ninguna cuenta): `POST /auth/refresh` contra `boticuy.com` devuelve hoy `404 {"code":"rest_no_route",...}` — confirmado con `/ping` (200) y `/auth/me` (401 normal) que el BFF sí está vivo, así que el 404 es específico de esta ruta. Esto confirma que **`boticuy-app-plugin/` (donde se implementó `/auth/refresh`, `[2.0.0]` de su propio changelog) todavía no está desplegado en WordPress** — sigue corriendo la versión anterior sin esta ruta.
- Por eso el manejo de "cualquier otra respuesta" de arriba no es opcional: una respuesta `rest_no_route` no tiene campo `ok`, así que con la lógica anterior (truthy/else) habría caído en la rama de "sesión inválida" y cerrado la sesión de **todos** los usuarios en cada apertura de la app — el mismo bug de logout silencioso que ya se había corregido una vez (`PROGRESO.md`, Sección 2). Con el manejo explícito, hoy este cambio es un no-op seguro en producción (la app sigue comportándose como antes) y se activa solo, sin tocar código de nuevo, en cuanto se despliegue el plugin nuevo.
- **Pendiente, fuera del alcance de este cambio:** desplegar `boticuy-app-plugin/` a WordPress (paso operativo). El camino de éxito (token válido → token renovado) queda verificado por contrato (`API-CONTRACT.md`) pero no de forma empírica contra una respuesta 200 real, porque no se puede provocar ese caso hasta ese despliegue.

---

## [2.0.4] - Semana de pruebas en staging (2026-07-16 a 2026-07-23)

Trabajo de esta semana relacionado con las pruebas de staging (`http://35.209.93.250/`, sin dominio propio todavía). Las validaciones funcionales de extremo a extremo (checkout Yape/Plin, precio dinámico, cupón, envío gratis) se probaron desde la app pero se documentan del lado del backend en `boticuy-app-plugin/CHANGELOG.md`, porque son en su mayoría comportamiento del servidor (cálculo de totales, estado del pedido) que la app solo refleja.

### Added
- **Entorno de staging seleccionable sin hardcodear ni tocar producción**: `.env.staging` (URLs de API + `EXPO_PUBLIC_ORDERS_ENABLED=true`, solo para este entorno), scripts `start:staging`/`android:staging`/`prebuild:staging` en `package.json` (usan `cross-env NODE_ENV=staging` para que Expo cargue `.env.staging`), `plugins/withCleartextHost.js` (config plugin de Expo que habilita tráfico HTTP en Android **solo** para el host de la URL de API activa — nunca de forma global, nunca en producción porque ahí la URL es `https://`). `app.config.js` deriva el host y decide si incluye el plugin según el protocolo de `EXPO_PUBLIC_BFF_URL`. Confirmado con `npx expo config --type public --json` (resolución real del CLI, no simulada) que sin `NODE_ENV=staging` todo cae a los defaults de producción existentes.

### Fixed
- **`ProductCard.tsx`**: agregado fallback `onError` — si el thumbnail 300×300 de un producto no carga (ej. WooCommerce nunca generó ese tamaño para esa imagen), reintenta con la imagen original (`.src`) en vez de quedar en blanco. Encontrado en la sección "Completa tu compra" del Carrito; como `ProductCard` es el componente compartido, el fix aplica también en Home, Catálogo, Favoritos y "También te puede interesar". No se tocó el backend — la causa de fondo (falta ese tamaño de imagen para ese producto en WordPress) sigue sin corregir ahí.
- **`CheckoutScreen.tsx`**: el mensaje "Compra sin crear cuenta. Solo necesitamos tus datos de entrega." se mostraba siempre, incluso logueado. Ahora condicionado a `!user` (mismo `user` de `useAuth((s) => s.user)` que ya usaba la pantalla para precargar nombre/correo) — si hay sesión, el bloque no se renderiza, sin reemplazarlo por otro texto.

### Pending
- **Diagnóstico temporal activo en `src/api/orders.ts`**: dos `console.log` (carga del módulo y dentro de `createOrder()`) agregados para confirmar en tiempo real qué valores de `ordersEnabled`/`bffUrl` usa la instancia corriendo, mientras se investiga por qué un pedido de prueba en staging seguía saliendo como `PREVIEW-...`. Quitar una vez confirmado el diagnóstico.
- **"Mis direcciones"**: permite eliminar una dirección guardada pero no editarla. Evaluar si conviene agregar edición.
- **Mapeo de estados de pedido**: los 4 estados que muestra la app (Recibido, Preparando, En camino, Entregado) no tienen correspondencia confirmada contra los estados reales de WooCommerce — falta diagnosticar cómo está conectado esto hoy (detalle en `boticuy-app-plugin/CHANGELOG.md`).
- **"Olvidé mi contraseña"**: no existe este flujo en la app. Opciones evaluadas sin decidir: redirección externa, WebView embebido, o flujo nativo contra un endpoint nuevo del plugin.

---

## [2.0.5] - Semana de pruebas en staging (2026-07-16 a 2026-07-23), continuación

Fixes en `OrderDetailScreen.tsx` a partir de hallazgos de la misma semana de pruebas en staging — resuelve el pendiente "Mapeo de estados de pedido" de `[2.0.4]`. Validaciones funcionales de backend de esta tarde (cambio manual de estado en WooCommerce reflejado en el timeline) documentadas en `boticuy-app-plugin/CHANGELOG.md`.

### Fixed
- **Mapeo de estados de pedido**: `STEPS` tenía 4 pasos (Recibido, Preparando, **En camino**, Entregado) con slugs que WooCommerce nunca emite (`shipped`, `in-transit`, `delivered`) — el paso "En camino" era inalcanzable en la práctica. Corregido a **3 pasos reales**: Recibido (`pending`/`on-hold`), Preparando (`processing`), Entregado (`completed`). Los estados fuera del timeline (`cancelled`, `failed`, `refunded`) ahora muestran mensajes **diferenciados** en vez de tratarse todos igual como "cancelado": "Pedido cancelado", "Hubo un problema con el pago. Si ya pagaste, escríbenos por WhatsApp.", "Pedido reembolsado".
- **Fallback silencioso a "Recibido"**: un `status_slug` no reconocido (`findIndex` devolviendo `-1`) hacía que el pedido se mostrara siempre en el paso 0, sin importar el estado real. Ahora, si el estado no es ninguno de los 3 del timeline ni `cancelled`/`failed`/`refunded`, se muestra la etiqueta real de WooCommerce (`order.status`) tal cual, en vez de asumir progreso cero. Como consecuencia, `current` (el índice del paso activo) ya no necesita ningún fallback — el timeline solo se calcula cuando el estado sí pertenece a él, así que siempre hay match.
- **"Volver a pedir" fallaba en silencio**: productos sin stock, con stock insuficiente, o ya no disponibles (404 al buscar el producto) se omitían del carrito sin avisar cuál ni por qué — solo un toast genérico si *nada* se pudo agregar. Ahora cada producto valida `is_in_stock` y compara la cantidad original contra `low_stock_remaining` (la única cantidad exacta que expone la Store API; si viene `null`, se asume que alcanza). Se ajusta la cantidad cuando el stock es menor al pedido, y se notifica específicamente qué pasó con cada producto ("No se pudo agregar...", "Se ajustó la cantidad de... a N").

### Changed
- **`toastStore.ts` / `Toast.tsx`**: el `Toast` compartido ahora acepta `variant` (`'success' | 'warning'`) y `duration` opcionales en `show(mensaje, opts)` — antes el ícono (siempre de éxito) y la duración (1800ms fijos) estaban hardcodeados dentro del componente. Se usó para el aviso de "Volver a pedir" de arriba (ícono de advertencia, 5000ms — una lista de varios productos no se lee en 1.8s). Cambio retrocompatible: los 5 usos existentes de `showToast(mensaje)` en el resto de la app (`CreatorsScreen`, `ProductDetailScreen`, `CouponField`, `ProductCard`) siguen llamando con un solo argumento y no cambian de comportamiento (default `variant: 'success'`, `duration: 1800`). También se agregó `maxWidth`/`flexShrink` al estilo del toast para que un mensaje de varias líneas haga wrap en vez de desbordarse.

---

## [2.0.6] - Semana de pruebas en staging (2026-07-16 a 2026-07-23), continuación

Caso "producto no vendible online" (ejemplo: Dr. Flu antigripal, SKU `1400006`) — diagnóstico previo (`boticuy-app-plugin/CHANGELOG.md`, misma semana) confirmó que en la web esto se resuelve con un link externo agregado a mano en el contenido Elementor de esa página puntual, sin ningún campo estructurado (categoría/atributo/meta) detrás. Se optó por resolverlo 100% del lado de la app en vez de esperar un cambio en WordPress/plugin.

### Added
- **`src/constants/productosNoVendibles.ts`**: lista fija `PRODUCTOS_NO_VENDIBLES` (`{ sku, url }[]`) + helper `getProductoNoVendible(sku)`. Agregar un caso futuro es sumar un objeto al array, nada más — no depende de ningún dato que venga de la Store API o del plugin.
- **`ExternalPurchaseNotice.tsx`**: componente compartido con dos variantes — completa (texto explicando que el producto no se vende en línea + botón "Dónde comprar") y `compact` (solo el botón, para tarjetas de listado). Ambas abren la URL externa vía `Linking.openURL()`. Ícono `open-outline` de `@expo/vector-icons` (Ionicons) — no se agregó `lucide-react-native`, que no estaba instalado en el proyecto.

### Changed
- **`ProductDetailScreen.tsx`**: si el SKU del producto está en `productosNoVendibles`, la barra inferior completa (stepper de cantidad + "Agregar al carrito") se reemplaza por `ExternalPurchaseNotice` — chequeado antes que el stock, así que reemplaza el flujo de compra sin importar `is_in_stock`.
- **`ProductCard.tsx`**: mismo chequeo: si el SKU está en la lista, el botón "Agregar"/"Sin stock" se reemplaza por `ExternalPurchaseNotice` en variante `compact`. Como `ProductCard` es el componente de tarjeta compartido, esto cubre Home, Catálogo, Favoritos y la sección "Completa tu compra" del Carrito automáticamente, sin tocar esas pantallas.

---

## [2.0.7] - Semana de pruebas en staging (2026-07-16 a 2026-07-23), continuación

### Fixed
- **`OrderDetailScreen.tsx`**: el estado `pending` (pendiente de pago) estaba dentro del timeline de 3 pasos, agrupado con `on-hold` en el paso "Recibido" — daba a entender que el pedido avanzaría solo, sin que nadie confirmara el pago. Ahora `pending` sale del timeline (`STEPS` solo mapea `on-hold`/`processing`/`completed`) y se muestra como aviso independiente, mismo tratamiento que `cancelled`/`failed`/`refunded`: "Pago pendiente. Este pedido no será procesado hasta que se confirme el pago." Confirmado que "Mis pedidos" (`OrdersScreen.tsx`) no se ve afectado — esa pantalla muestra la etiqueta cruda de WooCommerce (`item.status`) sin pasar por este mapeo.

---

## [2.0.8] - Semana de pruebas en staging (2026-07-16 a 2026-07-23), continuación

Diagnóstico y fixes de "Apoya a tu creador" (Copa Boticuy + Creadores Aliados) — cambios de backend (detección automática, exclusiones, parsing de nombre/redes) documentados en `boticuy-app-plugin/CHANGELOG.md`; esta entrada cubre solo lo tocado en `boticuy-app/`.

### Fixed
- **`CreatorsScreen.tsx`**: Copa Boticuy ahora oculta por completo los cupones vencidos (`setCopa(r.copa.filter((c) => c.active))`) en vez de mostrarlos como "Próximamente" — un cupón vencido de la temporada no va a reactivarse, así que no tiene sentido seguir listándolo.

### Removed
- **Código muerto de la variante "Próximamente"** en `CreatorsScreen.tsx`: como consecuencia del fix anterior, ningún creador que llega a `Card` puede tener `active: false` (copa ya viene filtrado, y "fijo" siempre fue `active: true`) — se quitó la rama `soonPill`/"Próximamente" del componente `Card` y los estilos `soonPill`/`soonText`, sin ningún caso de uso real que la siguiera necesitando. Confirmado con `tsc --noEmit` y grep que no queda ningún rastro en código (solo en comentarios explicativos).

---

## [2.0.9] - Semana de pruebas en staging (2026-07-16 a 2026-07-23), continuación

### Fixed
- **Validación de formato en el checkout** (`src/utils/validation.ts`, `CheckoutScreen.tsx`): teléfono ahora rechaza cualquier carácter que no sea dígito, espacio, `+`, `-`, `(` o `)` (`isValidPhone`, mismo criterio que `WC_Validation::is_phone()` de WooCommerce en la web) — antes solo se exigía una longitud mínima, sin chequear que fueran caracteres válidos. DNI ahora exige solo dígitos (`isValidDNI`), con limpieza de espacios internos antes de validar y antes de enviarlo en el payload del pedido (`stripInnerSpaces`, no solo `trim()` de los extremos) — así `"12 345 678"` se valida y se envía igual que `"12345678"`.

---

## [2.4.1] - 2026-07-30

### Changed
- **`CreatorsScreen.tsx` ("Apoya a tu creador")**: agregada una segunda sección, "Otros cupones disponibles", con los cupones de `/mis-cupones` mostrados debajo de "Copa Boticuy" — siempre que haya alguno, no solo cuando Copa Boticuy viene vacío. Así la pantalla nunca se siente vacía y el usuario siempre tiene algo que usar.
- **`MyCouponsScreen.tsx` ("Mis cupones")**: invertido el orden de las secciones — "Exclusivos Oro" ahora aparece primero (arriba) y "Disponibles" después (abajo), dado que los descuentos Oro suelen ser más altos y van con prioridad visual.

### Verification
- `npx tsc --noEmit` sin errores.

---

## [2.4.0] - 2026-07-30

Consumo de los 3 endpoints nuevos que reemplazan `/creators` en el plugin (ver `boticuy-app-plugin/CHANGELOG.md` `[2.8.0]`).

### Changed
- **`src/api/coupons.ts`**: `fetchCreators()` reemplazado por `fetchApoyaCreador()` (`/apoya-creador`), `fetchMisCupones()` (`/mis-cupones`) y `fetchCuponesOro()` (`/cupones-oro`), cada uno devolviendo `Creator[]` directo (ya no hay un objeto `{copa, fijo}` que desarmar). Tipo `CreatorsResponse` eliminado de `types/index.ts` (ya no aplica).
- **`CreatorsScreen.tsx` ("Apoya a tu creador")**: simplificada a un solo grupo (Copa Boticuy), vía `fetchApoyaCreador()`. Se quitó la sección "Creadores aliados" — ese bucket ya no existe como concepto separado: los cupones que antes caían ahí (no-Copa, no-Oro) ahora son indistinguibles de "Mis cupones" y viven en `/mis-cupones`.
- **`MyCouponsScreen.tsx` ("Mis cupones")**: llama a `fetchMisCupones()` y `fetchCuponesOro()` en paralelo, mostrando dos grupos con encabezado — "Disponibles" y "Exclusivos Oro" (esta segunda sección solo aparece si el usuario tiene acceso a al menos un cupón Oro vigente, resuelto enteramente por el servidor).

### Verification
- `npx tsc --noEmit` sin errores.

---

## [2.3.0] - 2026-07-30

Nuevo método de pago "Transferencia bancaria", mismo patrón que Yape/Plin (sin pasarela — coordinación manual del comprobante por WhatsApp). Cambios de backend correspondientes en `boticuy-app-plugin/CHANGELOG.md` `[2.6.0]`.

### Added
- `PaymentMethod` (`types/index.ts`) y los tipos de payload/params relacionados (`api/orders.ts`, `navigation/types.ts`) incluyen `'transferencia'`.
- **`CheckoutScreen.tsx`**: nuevo `PayOption` "Transferencia bancaria". El flujo de envío (`onSubmit`) no necesitó ningún cambio de lógica — ya caía en la misma rama genérica que Yape (crear pedido y confirmar directo, sin paso de pasarela).
- **Nuevo `src/api/bankDetails.ts`** (`fetchBankDetails()`) y tipo `BankAccount` (`types/index.ts`), consumiendo el endpoint nuevo `GET /bank-details` del plugin.
- **`OrderConfirmationScreen.tsx`**: nueva rama para `metodoPago === 'transferencia'` — pide los datos bancarios al montar, muestra una cajita por banco (banco, titular, número de cuenta, CCI) más el texto de instrucciones de envío de comprobante y tiempos de entrega, con estado de carga y un mensaje de fallback ("Contáctanos por WhatsApp para los datos de la cuenta.") si el endpoint no puede parsear los datos.

### Verification
- `npx tsc --noEmit` sin errores.

---

## [2.2.1] - 2026-07-30

### Changed
- **`ForgotPasswordScreen.tsx`**: inyecta CSS vía `injectedJavaScript` para ocultar el "chrome" de administración de la página nativa de recuperación de WordPress (`wp-login.php?action=lostpassword`) — logo de WordPress, link "Ir a Boticuy" (`#nav`/`#backtoblog`), selector de idioma + botón "Cambiar" (`.language-switcher`), y "Políticas de privacidad" (`#privacy-policy-page-link`). El script se reinyecta en cada navegación del WebView (incluida la página "revisa tu correo" tras enviar el formulario), no toca el formulario ni sus campos — solo `display:none` sobre elementos ajenos a él.

---

## [2.2.0] - 2026-07-30

Tres ajustes independientes, continuación de `[2.1.0]` (mismo día). Cambios de backend correspondientes en `boticuy-app-plugin/CHANGELOG.md` `[2.4.0]`.

### Removed — Pago contra entrega
- `PaymentMethod` (`types/index.ts`) y los tipos de payload/params relacionados (`api/orders.ts`, `navigation/types.ts`) ya no incluyen `'cod'` — solo `'yape' | 'tarjeta'`. `CheckoutScreen.tsx`: quitado el `PayOption` de "Pago contra entrega". `OrderConfirmationScreen.tsx`: quitada la rama muerta correspondiente en el resumen de pago. Copy actualizado en `OnboardingScreen.tsx` ("Yape, Plin o tarjeta").

### Added — Envío gratis por nivel en el Carrito
- **`FreeShippingBar.tsx`**: nuevo prop `level` — si es `'plata'`/`'oro'`, usa el umbral reducido (`extra.envioGratisDesdeNivel`, default S/59) en vez del general (`extra.envioGratisDesde`, S/69), mismo cálculo que ahora aplica el checkout real (`class-shipping.php`).
- **`CartScreen.tsx`**: obtiene el nivel del usuario logueado vía `fetchPoints()` y lo pasa a `FreeShippingBar` — evita el mensaje inconsistente de "te faltan S/X" calculado sobre el umbral equivocado para un usuario Plata/Oro.
- **`app.config.js`**: nueva variable `envioGratisDesdeNivel` (`EXPO_PUBLIC_ENVIO_GRATIS_DESDE_NIVEL`, default 59), mismo patrón que `envioGratisDesde`.

### Verification
- `npx tsc --noEmit` sin errores en cada uno de los tres cambios.

---

## [2.1.0] - 2026-07-30

Cuatro cambios independientes pedidos por el usuario. Cambios de backend correspondientes documentados en `boticuy-app-plugin/CHANGELOG.md` `[2.3.0]`.

### Changed
- **`OrderDetailScreen.tsx`**: timeline colapsado de 3 a 2 pasos — "Recibido" (`on-hold`) → "Confirmado" (`processing`/`completed`, antes "Entregado" solo con `completed`). Se eliminó "Preparando" porque quedó sin ningún estado de WooCommerce distinto que lo disparara una vez que "Confirmado" pasó a activarse con `processing`. Copy correspondiente actualizado en `PointsScreen.tsx` ("los puntos se acreditan cuando tu pedido llega a 'Confirmado'").

### Added — Canje de puntos en el checkout
- **`PointsRedeemField.tsx`** (nuevo componente, mismo patrón que `CouponField.tsx`): balance disponible, tope visual del 30% del subtotal, input numérico + "Usar máximo".
- **`CheckoutScreen.tsx`**: saldo de puntos cargado vía `fetchPoints()` al iniciar sesión; sección "Canjear puntos" mutuamente excluyente con el cupón (oculta una si la otra está activa, en ambas direcciones); `points_redeem` agregado al payload de `createOrder()`; total final resta también el descuento por puntos.

### Added — Mis cupones
- **`MyCouponsScreen.tsx`** (nueva pantalla, ruta `MyCoupons`): reemplaza el placeholder "Pronto" en "Mi cuenta". Lista general de cupones activos, reutilizando `fetchCreators()` (`/creators`) — el mismo endpoint que ya usa la lista pública "Apoya a tu creador" (`CreatorsScreen.tsx`). Sin historial de uso ni cupones exclusivos por usuario, tal como se pidió.

### Added — Recuperar contraseña
- **`ForgotPasswordScreen.tsx`** (nueva pantalla, ruta `ForgotPassword`): WebView embebido apuntando a `wp-login.php?action=lostpassword` del sitio (origen derivado de `EXPO_PUBLIC_BFF_URL`, sin env var nueva), mismo patrón que `PaymentWebViewScreen.tsx` (Izipay) — `originWhitelist` acotado al dominio de WordPress, sin salir a un navegador externo. Detecta la confirmación de envío vía `onNavigationStateChange` (`checkemail=confirm`) y muestra una pantalla nativa de "Revisa tu correo". Link "¿Olvidaste tu contraseña?" agregado en `LoginScreen.tsx`, visible solo en modo login.

### Verification
- `npx tsc --noEmit` sin errores. Sin suite de tests automatizados en el proyecto — verificación end-to-end en staging pendiente (canje de puntos con los 3 métodos de pago, reversión por cancelación/pago rechazado, "Mis cupones" y "Olvidé mi contraseña" en un dispositivo real).

---

**Este changelog se actualiza con cada cambio futuro agregando una nueva entrada de versión**

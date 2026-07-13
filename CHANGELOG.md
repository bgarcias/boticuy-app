# Changelog

Reconstruido a partir de `docs/historial/CORREO_TI_ORIGINAL.md`, `docs/historial/AUDITORIA.md`, `docs/historial/DIAGNOSTICO_ACTUAL.md`, `docs/historial/PARIDAD_CHECK.md` y `PROGRESO.md` — sin fechas ni hallazgos fuera de esas fuentes. Cada ítem cita el documento (y, cuando la fuente lo dice explícitamente, quién lo encontró: auditoría propia, TI/Luis Almeyda, o correo de Fernando).

**Nota sobre la numeración:** las entradas `[0.9.x]` cubren hitos **anteriores** a que el proyecto fuera recibido para esta migración/rediseño (correos de coordinación con TI, jun 2026, ver `CORREO_TI_ORIGINAL.md`). `[1.0.0]` es la versión recibida. `[1.1.0]`/`[1.2.0]` (jul 2026) documentan la auditoría y el diagnóstico posteriores a la recepción. `[2.0.0]` es la refactorización técnica de esta sesión. Se agregó una entrada más de las 3 sugeridas originalmente porque las fuentes documentan hitos reales e independientes que se habrían mezclado en una sola entrada si se comprimían.

**Nota de desambiguación de versiones (importante):** el plugin backend llevaba su **propia numeración interna** en la cabecera de WordPress, gestionada por el equipo original sin relación con este changelog: pasó a `Version: 1.1.0` el 15 jun 2026 y a `Version: 1.2.0` el 25 jun 2026 (ver `[0.9.3]` y `[0.9.5]`). **Las entradas `[1.1.0]` y `[1.2.0]` de este documento (fechadas jul 2026) NO son esas mismas versiones** — son números de versión coincidentes por casualidad, referidos a momentos y procesos distintos (la numeración interna del archivo `.php` vs. la numeración semántica de este changelog). Como dato adicional: la cabecera del plugin se quedó fija en `1.2.0` incluso después del fix de IDOR/idempotencia del 09 jul 2026 (nunca se volvió a incrementar) — otra evidencia más de que nunca hubo un control de versiones formal.

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

**Este changelog se actualiza con cada cambio futuro agregando una nueva entrada de versión — no se reescribe desde cero.**

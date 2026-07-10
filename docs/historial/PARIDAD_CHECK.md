# Barrido de paridad — boticuy-app-legacy vs boticuy-app

Fecha del barrido: 2026-07-10
Fecha de cierre de hallazgos: 2026-07-10
Método: lectura y diff directo de archivos reales de ambos proyectos (no se usó PROGRESO.md ni memoria de fases anteriores como fuente de verdad). El barrido original no modificó archivos; los hallazgos que arrojó sí se cerraron después, en una sesión de trabajo aparte (ver estado ✅ RESUELTO en cada sección).

**Estado final: los 3 hallazgos funcionales (Toast, OfflineBanner, PostHog) y los 2 de mantenibilidad/cobertura (config hardcodeada, tests faltantes) están cerrados.** Verificado con `npx tsc --noEmit` (limpio), `npx expo-doctor` (21/21) y `npm test` (9/9) tras cada cambio.

---

## 1. Pantallas (`src/screens/`)

Los 15 archivos del legacy tienen archivo homónimo en el nuevo proyecto. Comparación función por función de las 15 pantallas:

| Pantalla | Estado | Funcionalidad legacy faltante en el nuevo |
|---|---|---|
| AddressesScreen.tsx | ✅ Idéntico byte a byte | Ninguna |
| CartScreen.tsx | ✅ Idéntico byte a byte | Ninguna |
| CatalogScreen.tsx | ✅ Idéntico byte a byte | Ninguna |
| CheckoutScreen.tsx | ✅ Paridad completa + mejoras | Ninguna |
| CreatorsScreen.tsx | ✅ Idéntico byte a byte | Ninguna |
| FavoritesScreen.tsx | ✅ Idéntico byte a byte | Ninguna |
| HomeScreen.tsx | ✅ Paridad completa | Ninguna |
| LoginScreen.tsx | ✅ Paridad completa | Ninguna |
| OnboardingScreen.tsx | ✅ Paridad completa | Ninguna |
| OrderConfirmationScreen.tsx | ✅ Paridad completa + mejoras | Ninguna |
| OrderDetailScreen.tsx | ✅ Idéntico línea por línea | Ninguna |
| OrdersScreen.tsx | ✅ Paridad completa | Ninguna |
| PaymentWebViewScreen.tsx | ✅ Paridad completa + mejoras | Ninguna |
| PointsScreen.tsx | ✅ Idéntico línea por línea | Ninguna |
| ProductDetailScreen.tsx | ✅ Paridad completa | Ninguna |
| ProfileScreen.tsx | ✅ Paridad completa | Ninguna |

**Conclusión de pantallas: 100% paridad funcional.** No se encontró ninguna funcionalidad, validación, manejo de error, estado de carga, tracking de analítica ni caso límite del legacy que falte en el nuevo.

Diferencias no funcionales detectadas (no afectan comportamiento, solo mantenibilidad) — **✅ RESUELTO**:
- `HomeScreen.tsx`, `OnboardingScreen.tsx`, `ProductDetailScreen.tsx`: el legacy interpolaba `CONFIG.envioGratisDesde`/`CONFIG.currency.symbol` dinámicamente; el nuevo tenía el texto literal `"S/69"` hardcodeado. **Corregido**: ahora leen `extra.currencySymbol`/`extra.envioGratisDesde` desde `app.config.js` (`Constants.expoConfig.extra`).
- `ProfileScreen.tsx`: mismo patrón con `HORARIO_ATENCION` → ahora lee `extra.horarioAtencion` desde `app.config.js`.
- `FreeShippingBar.tsx`: mismo patrón de hardcodeo → ahora lee `extra.envioGratisDesde` desde `app.config.js` (ver sección 3).
- De paso se encontraron y corrigieron 2 casos más del mismo patrón no listados originalmente: `utils/format.ts` (`formatSoles` tenía `'S/'` hardcodeado) y `utils/whatsapp.ts` (número de WhatsApp hardcodeado) — ambos ahora leen de `app.config.js` también.

Mejoras aditivas encontradas en el nuevo (no requieren acción, están de más, no de menos):
- `CheckoutScreen.tsx`: cotización de envío real (vs. texto fijo "se coordina" en legacy), `idempotencyKey` para evitar pedidos duplicados.
- `OrderConfirmationScreen.tsx`: muestra envío real y distingue pedidos PREVIEW de reales.
- `PaymentWebViewScreen.tsx`: `originWhitelist` restringido (antes `['*']`, endurecimiento de seguridad) y soporte de `checkoutToken` para invitados.
- `OrdersScreen.tsx` / `ProductDetailScreen.tsx`: decodificación de entidades HTML en nombres de producto/reviewer.

---

## 2. Funciones de API (`src/api/*.ts`)

Se verificó cada función **exportada** del legacy contra todo el directorio `src/api/` del nuevo proyecto (sin asumir mismo nombre de archivo).

| Archivo legacy | Función | Estado en el nuevo |
|---|---|---|
| addresses.ts | fetchAddresses, addAddress, deleteAddress | ✅ Idéntico byte a byte |
| authToken.ts | setAuthToken, getAuthToken | ✅ Idéntico byte a byte |
| client.ts | storeClient, wpClient, bffClient + interceptores | ✅ Equivalente (URLs migradas a `app.config.js`/`extra`, mismo timeout 20000ms, mismos headers, mismo `validateStatus`) |
| coupons.ts | fetchCoupons, fetchCreators, validateCoupon | ✅ Paridad + decodeHtmlEntities (mejora) |
| points.ts | fetchPoints | ✅ Idéntico byte a byte |
| products.ts | fetchProducts, fetchProduct, fetchReviews, fetchProductExtra | ✅ Paridad + decodeHtmlEntities (mejora). Nota menor: `fetchProductExtra` nuevo decodifica `contenido_neto` sin chequear que exista, pero queda protegido por el mismo try/catch, sin romper el fallback. |
| shipping.ts | fetchShipping | ✅ Idéntico byte a byte |
| taxonomies.ts | fetchNecesidades, fetchMarcas | ✅ Paridad + decodeHtmlEntities (mejora) |
| ubigeo.ts | fetchDepartamentos, fetchProvincias, fetchDistritos | ✅ Idéntico byte a byte |
| auth.ts | registerUser, loginUser | ✅ Idéntico |
| auth.ts | **refreshSession()** | ⚠️ **No tiene equivalente que renueva el token.** Reemplazada por `me()` (`GET /auth/me`) en `auth.ts` nuevo, que solo *valida* la sesión sin renovarla. Ver detalle abajo. |
| auth.ts | fetchMyOrders() | ✅ Movida a `orders.ts` (reorganización ya conocida), mismo endpoint, + decodeHtmlEntities en items |
| orders.ts | createOrder(payload) | ✅ Equivalente. El chequeo de `CONFIG.ordersEnabled` se movió del screen (legacy) a la propia función `createOrder` (nuevo, vía `EXPO_PUBLIC_ORDERS_ENABLED`), pero el resultado final (no crear pedido real si está apagado) es el mismo. |
| payment.ts | getFormToken, validatePayment | ✅ Paridad, firma ampliada con `checkoutToken` opcional (mecanismo nuevo para invitados, aditivo, no rompe el caso legacy) |

**Único hallazgo real de paridad en API — `refreshSession()`:**
- Legacy: `POST /auth/refresh` — sesión deslizante; cada vez que la app abre, `authStore.ts` la llama y **renueva** el JWT y los datos de usuario.
- Nuevo: `GET /auth/me` — solo valida que la sesión siga siendo válida, **no renueva** el token. La sesión ahora tiene duración fija (7 días según el propio código).
- Esto coincide con una regla ya verificada del proyecto: el endpoint `/auth/refresh` **no existe en producción** (probado con curl → 404 `rest_no_route`), aunque sí está codeado en el plugin local `boticuy-app-api.php`. Es decir, **la función `refreshSession()` del legacy nunca funcionó contra producción tampoco** — es código muerto/roto en el legacy. El nuevo comportamiento (`/auth/me`, sin renovación) es el correcto dado el backend real, no una regresión de paridad sino una corrección.

**Conclusión de API: paridad funcional completa.** Todo lo demás son mejoras (decodificación de HTML, idempotencia, seguridad de invitado) o reorganizaciones ya conocidas (fetchMyOrders).

---

## 3. Componentes (`src/components/`)

12 de 15 archivos son **idénticos byte a byte**: CouponField, Feedback, HorizontalProducts, ImageGallery, Price, ProductCard, RichHtml (con mejora en decodificación HTML), SelectField, Skeleton, Stars, TextField, TrustStrip.

| Componente | Estado |
|---|---|
| FreeShippingBar.tsx | ✅ Paridad + config centralizada (ver arriba) |
| **OfflineBanner.tsx** | ✅ **RESUELTO — migrado y montado en `App.tsx`** |
| **Toast.tsx** | ✅ **RESUELTO — migrado y montado en `App.tsx`** |

### ✅ OfflineBanner.tsx — RESUELTO
- Legacy: usa `@react-native-community/netinfo` para detectar `state.isConnected === false` y muestra una barra fija indicando "Sin conexión a internet". Se monta explícitamente en `App.tsx` (`<OfflineBanner />`).
- Estado original del nuevo (al momento del barrido): no existía el archivo, no había ningún grep positivo de `NetInfo`/`isConnected`/`offline` en todo `boticuy-app/src`, y el paquete `@react-native-community/netinfo` ni siquiera estaba en `package.json`.
- **Resolución**: se instaló `@react-native-community/netinfo` vía `npx expo install`, se migró `src/components/OfflineBanner.tsx` idéntico al legacy, y se montó `<OfflineBanner />` en `App.tsx`.

### ✅ Toast.tsx — RESUELTO (era bug activo)
- Legacy: componente `<Toast />` montado en `App.tsx`, se suscribe al store `toastStore.ts` y anima la aparición de un aviso flotante (snackbar) con auto-hide (~1.8s).
- Estado original del nuevo (al momento del barrido): el store `toastStore.ts` sí existía (idéntico al legacy) y `showToast(...)` se seguía llamando desde 5 sitios (`CouponField.tsx`, `ProductCard.tsx`, `CreatorsScreen.tsx`, `OrderDetailScreen.tsx`, `ProductDetailScreen.tsx`), pero no había ningún componente suscrito al store que mostrara el aviso — bug funcional activo, no solo funcionalidad ausente.
- **Resolución**: se migró `src/components/Toast.tsx` idéntico al legacy (reutiliza `toastStore.ts` sin cambios) y se montó `<Toast />` en `App.tsx`. Verificado que los 5 puntos que llaman `showToast()` ahora tienen feedback visual real.

**Conclusión de componentes: 15/15 con paridad, ambos faltantes cerrados.**

---

## 4. Analítica (`analytics/`)

Se verificó el estado exacto del legacy antes de decidir si esto es tarea de paridad o funcionalidad nueva.

**Estado real en el legacy: SÍ estaba realmente conectado y funcionando, no solo parcialmente armado.**

Evidencia:
- `boticuy-app-legacy/src/config.ts` tiene una **key real de PostHog**: `phc_xtJYcWtSZaFUGW7fHbCDpumWgxr2eUi5gRL2nFkomfHS` (host `https://us.i.posthog.com`), no un placeholder vacío.
- `boticuy-app-legacy/src/analytics/posthog.ts` instancia `new PostHog(CONFIG.posthog.key, ...)` y conecta `analytics.setSink(...)`/`analytics.setIdentifySink(...)` al cliente real.
- `boticuy-app-legacy/App.tsx` **llama `initAnalytics()`** en el `useEffect` inicial — se ejecuta en cada arranque de la app.
- La dependencia `posthog-react-native@^4.46.9` está declarada en `package.json` del legacy.

Estado original del nuevo proyecto (al momento del barrido):
- `boticuy-app/src/analytics/index.ts` y `events.ts` eran **idénticos** al legacy (capa "provider-agnóstica" que loguea a consola y expone `setSink`).
- **No existía `posthog.ts`** ni ningún archivo que instanciara un proveedor real.
- `posthog-react-native` no estaba en `package.json` del nuevo proyecto (no se había instalado).
- `App.tsx` nuevo no llamaba a ninguna función de inicialización de analítica.

**✅ RESUELTO — conectado, usando la misma cuenta del legacy (decisión explícita del equipo).**
- Se instaló `posthog-react-native` vía `npx expo install`.
- Se migró `src/analytics/posthog.ts`, adaptado para leer `posthogKey`/`posthogHost` desde `app.config.js` → `extra` (vía `Constants.expoConfig.extra`, en vez del `config.ts` hardcodeado que tenía el legacy) — `initAnalytics()` no falla y simplemente no hace nada si la key llegara vacía.
- `app.config.js` define `extra.posthogKey`/`extra.posthogHost` con **la key/host real del legacy como default** (`phc_xtJYcWtSZaFUGW7fHbCDpumWgxr2eUi5gRL2nFkomfHS`, `https://us.i.posthog.com`), sobreescribibles por `EXPO_PUBLIC_POSTHOG_KEY`/`EXPO_PUBLIC_POSTHOG_HOST`. El equipo confirmó que esta es la cuenta correcta a usar mientras se desarrolla el rediseño.
- Se agregó la llamada `initAnalytics()` en `App.tsx`, igual que el legacy.
- **Importante, documentado también en `PROGRESO.md`:** mientras ambas apps sigan activas, los eventos de desarrollo del rediseño se mezclarán con los del legacy en la misma cuenta de PostHog. Todavía no está decidido si el rediseño se queda con esta cuenta o si se abrirá una nueva antes de producción.

---

## 5. Otros hallazgos no mencionados en fases anteriores

- **`App.tsx` del nuevo no montaba `<Toast />` ni `<OfflineBanner />`** ni llamaba `initAnalytics()` — consecuencia directa de los 3 puntos anteriores. **✅ RESUELTO**: los tres ahora están montados/llamados en `App.tsx`, igual que el legacy.
- **Archivos de test del legacy sin equivalente:** `src/store/cartStore.test.ts` y `src/utils/format.test.ts` existían en el legacy sin equivalente en el nuevo proyecto. **✅ RESUELTO**: ambos migrados tal cual (ningún import cambió de ubicación). Al migrarlos se descubrió que el gap era mayor de lo reportado originalmente — el nuevo proyecto no tenía **ninguna infraestructura de testing** (sin `jest`/`jest-expo`/`react-test-renderer`, sin script `test`, sin config de jest, sin `types: ["jest",...]` en `tsconfig.json`). Se instaló y configuró todo eso también; `npm test` corre los 9 tests (5 de `cartStore`, 4 de `format`) en verde.
- **`src/config.ts` del legacy** centralizaba varios valores (`envioGratisDesde`, `currency.symbol`, `horarioAtencion`, `posthog.key/host`) que en el nuevo proyecto habían quedado parcialmente hardcodeados en 5 sitios (`HomeScreen`, `OnboardingScreen`, `ProductDetailScreen`, `ProfileScreen`, `FreeShippingBar`) más 2 no listados originalmente (`utils/format.ts`, `utils/whatsapp.ts`). **✅ RESUELTO**: todos centralizados en `app.config.js` → `extra` (no en un `config.ts` aparte, para mantener consistencia con cómo ya se manejan las URLs), con overrides por `EXPO_PUBLIC_*`.

---

## Conclusión final

**Estado al cierre del barrido: 100% de paridad funcional con el legacy, con los 3 hallazgos reales cerrados:**

1. **`OfflineBanner`** — ✅ migrado y montado en `App.tsx`; `@react-native-community/netinfo` instalado.
2. **`Toast`** — ✅ migrado y montado en `App.tsx`; los 5 puntos que llaman `showToast()` ya no son un bug muerto.
3. **PostHog / analítica real** — ✅ conectado con la misma cuenta del legacy (decisión explícita del equipo), key/host leídos desde `app.config.js` en vez de hardcodeados; queda documentado en `PROGRESO.md` que la cuenta es compartida temporalmente con el legacy y que aún no se decide si se abrirá una cuenta propia.

Adicionalmente cerrado, de menor prioridad: 2 archivos de test migrados (`cartStore.test.ts`, `format.test.ts`) junto con toda la infraestructura de testing que faltaba, y 7 valores de configuración (5 reportados + 2 encontrados del mismo patrón) centralizados en `app.config.js` en vez de hardcodeados.

Verificación final: `npx tsc --noEmit` limpio, `npx expo-doctor` 21/21, `npm test` 9/9.

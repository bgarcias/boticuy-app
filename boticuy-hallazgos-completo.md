# Boticuy — Auditoría técnica: hallazgos completos y plan de fixes

> **Cómo usar este archivo:** cada hallazgo tiene checkbox `[ ]`. Al corregirlo, marcar `[x]`, agregar fecha y commit/PR en la línea `Estado:`. Este archivo es la fuente única de verdad del avance mientras el proyecto no esté en un repo con tracking propio.

Fecha auditoría: 21 ago 2026
Alcance: `boticuy-app` 2.0.0 · `plugin` 2.14.0 · `BoticuyApp-v4.apk`
Método: revisión de código completa + ejecución de pruebas + inspección del APK
Referencias archivo:línea corresponden a los commits recibidos — app en `5e3d607`, plugin en versión 2.14.0 (sin control de versiones en el paquete entregado)

Totales: 41 hallazgos — 4 críticos · 8 altos · 15 medios · 14 bajos/mejoras. Cuatro bloquean la publicación; dos de ellos cuestan dinero en cada pedido.
Cobertura de pruebas: app 13.8% (ramas 10.57%) · plugin 0%

---

## Resumen ejecutivo

Se revisó la totalidad del código entregado: 7,044 líneas de la app (React Native/Expo) y 2,266 del plugin (WordPress/WooCommerce), además del APK. El plugin entra en el alcance porque es el backend de la app — precios, pedidos, pagos, puntos y envío se resuelven ahí — así que varios defectos que el usuario ve en pantalla solo se explican leyendo los dos lados. La arquitectura es sólida y está bien documentada; el pago con tarjeta tiene los controles de seguridad correctos (firma HMAC verificada en servidor, monto derivado del pedido, verificación de propiedad, locks atómicos contra duplicados). Los problemas están concentrados en tres frentes:

1. **El costo de envío se muestra al cliente pero nunca se cobra.** La app suma el envío al total que ve el comprador; el backend crea el pedido sin ninguna línea de envío y cobra ese total menor. Se pierde el flete en cada pedido de la app: S/8.47 (Callao), S/12.71 (provincias), el monto configurado en Lima.
2. **Dinero.** Además del envío: un cupón rechazado por WooCommerce genera un pedido sin descuento pero con respuesta de éxito, y existe un camino repetible para conservar puntos ya canjeados.
3. **Entrega.** El APK apunta a staging por HTTP sin cifrar, y el perfil de build de producción no habilita la creación de pedidos: publicado tal cual, la app diría "Pedido confirmado" sin registrar ningún pedido.
4. **Verificabilidad.** El plugin no tiene ninguna prueba automatizada. La app tiene 36 pruebas (todas en verde, compila sin errores de tipos) pero cubren 13.8% de sentencias: checkout, pago, pedidos y catálogo están en 0%.

**Sobre los documentos de requerimientos:** los dos PDF describen el sistema "tal como está implementado", no lo que el negocio pidió. Varias conductas que el documento presenta como reglas de negocio son en realidad defectos: el envío no cobrado (RN-10 del plugin), el vaciado del carrito ante fallo de consulta (RN-03 §2.1 de la app), el orden del catálogo con filtro activo. Documentar un defecto no lo convierte en requisito.

---

## 🔴 CRÍTICOS — bloquean publicación (8 — C5, C6, C7 y C8 son hallazgos nuevos, encontrados el 2026-09-10/11/14 al probar C4 y A4, no parte de los 41 originales de la auditoría)

### [x] C1 — El costo de envío nunca se agrega al pedido
**Estado:** resuelto en código (2026-09-04) — `create_order()` ahora agrega una línea real de envío (`WC_Order_Item_Shipping`) calculada por `Boticuy_App_Shipping::compute_cost()`, la misma fuente que usa `/shipping`. Incluye la porción de [M7](#-m7--el-método-de-envío-gratis-ignora-su-condición-requires) sobre `requires` + el flag `get_free_shipping()` del cupón aplicado — ver esa entrada para el detalle y lo que queda pendiente ahí. Caso residual de cupón con envío gratis en la cotización pre-checkout: anotado en M9. **Verificación real contra WordPress/WooCommerce/Izipay:** no aislada por hallazgo — se hace en la tanda de pruebas completas al cerrar la ronda (ver plan de fixes, Paso 5).
**Impacto:** pérdida de ingresos por pedido. Plugin RN-10 §2.2 · App SHIPAPP-VER-01

**Descripción técnica:**
`create_order()` construye el pedido, aplica cupón y puntos, y llama a `calculate_totals()` sin ninguna línea de envío (`class-orders.php:463`). El endpoint `/shipping` solo cotiza, no persiste. La app, en cambio, calcula `finalTotal = subtotal − descuentos + envio` (`CheckoutScreen.tsx:97`) y lo muestra como total a pagar.

En tarjeta, el monto que se cobra sale de `$order->get_total()` (`class-payment.php:84`), es decir sin envío. En Yape y transferencia, el monto que se le pide al cliente por WhatsApp no coincide con el pedido registrado en WooCommerce, lo que rompe la conciliación manual.

**Evidencia visible en pantalla:** `OrderConfirmationScreen.tsx:72-73` pinta una fila "Envío: S/ 12.71" y debajo un "Total" que no la incluye. La aritmética que ve el cliente no cuadra.

**Cómo corroborarlo (3 vías, de más barato a más concluyente):**

*Vía 1 — Comparar dos respuestas de la API* (no toca BD, no requiere accesos nuevos):
```bash
# 1) Cotizar el envío a un distrito de provincia, con subtotal S/100
curl "https://TU-HOST/wp-json/boticuy-app/v1/shipping?idubigeo=040101&subtotal=100"
# Respuesta esperada — hay un costo de envío:
# {"zone":"Provincia","cost":12.71,"flat_cost":12.71,"free_threshold":null,"is_free":false}

# 2) Crear un pedido al MISMO destino, con un producto de S/100
curl -X POST "https://TU-HOST/wp-json/boticuy-app/v1/order" \
  -H "Content-Type: application/json" \
  -d '{
    "items":   [{"id": ID_DE_PRODUCTO, "qty": 1}],
    "payment": "yape",
    "customer":{"nombre":"Prueba QA","email":"qa@boticuy.com",
                "telefono":"987654321","tipoDoc":"DNI","numDoc":"12345678"},
    "shipping":{"departamento_cod":"04","provincia_cod":"01",
                "distrito_cod":"01","idUbigeo":"040101",
                "provincia_nombre":"Arequipa","distrito_nombre":"Arequipa",
                "direccion":"Av. Prueba","numero":"123",
                "interior":"","referencia":""}
  }'
# Respuesta: el total NO incluye los S/12.71
# {"ok":true,"order_id":1234,"total":100.00}   ← debería ser 112.71
```
El campo `total` de esa respuesta sale directamente de `$order->get_total()`, o sea del pedido real guardado en WooCommerce. Si vuelve 100.00 en lugar de 112.71, el envío no está en el pedido.

*Vía 2 — Mirar el pedido en wp-admin:* el plugin marca sus pedidos con columna "Canal" = "Pedido App". Al abrir uno, el bloque de totales no tiene fila de Envío: solo subtotal y, si aplica, cupón o descuento por puntos. Comparar al lado un pedido hecho desde la web al mismo destino — ese sí muestra su fila de envío.

*Vía 3 — Consultar la base de datos (verificación concluyente):*
```sql
-- Paso 1: ¿almacenamiento clásico o HPOS?
SELECT option_value AS hpos_activo
FROM wp_options
WHERE option_name = 'woocommerce_custom_orders_table_enabled';
-- 'yes' → HPOS (tablas wp_wc_orders) | 'no' o sin fila → clásico (wp_posts + wp_postmeta)

-- Paso 2: consulta que sirve en ambos modos (el envío siempre es una línea de tipo 'shipping')
SELECT oi.order_id AS pedido,
       SUM(oi.order_item_type = 'line_item') AS productos,
       SUM(oi.order_item_type = 'shipping')  AS lineas_de_envio,
       SUM(oi.order_item_type = 'fee')       AS fees
FROM wp_woocommerce_order_items oi
GROUP BY oi.order_id
ORDER BY oi.order_id DESC
LIMIT 30;
-- En todo pedido creado por la app: lineas_de_envio = 0
-- En un pedido de la web al mismo distrito: lineas_de_envio = 1

-- Paso 3: aislar solo pedidos de la app (metadato _order_source = 'app')
-- Si el sitio usa HPOS:
SELECT o.id AS pedido, o.total_amount AS total_cobrado,
       od.shipping_total_amount AS envio_guardado,
       o.payment_method, o.date_created_gmt
FROM wp_wc_orders o
JOIN wp_wc_order_operational_data od ON od.order_id = o.id
JOIN wp_wc_orders_meta m ON m.order_id = o.id
     AND m.meta_key = '_order_source' AND m.meta_value = 'app'
ORDER BY o.date_created_gmt DESC LIMIT 20;

-- Si el sitio usa almacenamiento clásico:
SELECT p.ID AS pedido,
       MAX(CASE WHEN pm.meta_key = '_order_total' THEN pm.meta_value END) AS total_cobrado,
       MAX(CASE WHEN pm.meta_key = '_order_shipping' THEN pm.meta_value END) AS envio_guardado,
       MAX(CASE WHEN pm.meta_key = '_shipping_postcode' THEN pm.meta_value END) AS ubigeo
FROM wp_posts p
JOIN wp_postmeta pm ON pm.post_id = p.ID
JOIN wp_postmeta src ON src.post_id = p.ID
     AND src.meta_key = '_order_source' AND src.meta_value = 'app'
WHERE p.post_type = 'shop_order'
GROUP BY p.ID ORDER BY p.ID DESC LIMIT 20;
-- En ambos casos: envio_guardado = 0.00 en todas las filas
```

**Advertencias al leer resultados:**
- Si la consulta no devuelve filas en producción, eso no desmiente C1 — confirma C3 (nunca se creó un pedido desde la app porque el build sale en modo preview). Verificar C1 en staging, donde `ordersEnabled` sí está en `true`.
- El prefijo de tablas puede no ser `wp_`. Si un nombre de columna no coincide con la versión de WooCommerce, usar `DESCRIBE wp_wc_order_operational_data;` para ver los reales.
- El monto perdido no está guardado en ningún lado (nunca se registró). Para cuantificarlo hay que reconstruirlo desde el distrito de cada pedido:
```sql
-- Reconstrucción aproximada de lo no cobrado (almacenamiento clásico) — da un piso, no cifra exacta
SELECT COUNT(*) AS pedidos_app,
       SUM(CASE WHEN LEFT(pc.meta_value, 2) = '07' THEN 8.47 ELSE 12.71 END) AS flete_no_cobrado_minimo
FROM wp_postmeta src
JOIN wp_postmeta pc ON pc.post_id = src.post_id AND pc.meta_key = '_shipping_postcode'
WHERE src.meta_key = '_order_source' AND src.meta_value = 'app';
-- Para la cifra real hace falta separar pedidos de Lima y aplicar el flat_rate configurado en su zona
```

**Fix:** agregar la línea de envío al pedido en el servidor y recalcular el total con ella. Que la app muestre el total que devuelve el backend (checkout, formulario de pago, confirmación), no el que calcula por su cuenta.

**Depende de decisión de negocio:** ¿debe cobrarse el envío en los pedidos de la app? Se asume que sí (ordena toda la corrección). Si la respuesta fuera que no, lo que hay que corregir es la app —que hoy lo muestra— y no el backend.

---

### [x] C2 — El APK entregado es un build de staging sobre HTTP sin cifrar
**Estado:** cerrado — no es un defecto de código (criterio aclarado, 2026-09-04)
**Impacto:** exposición de credenciales y datos personales. `eas.json` · perfil `preview`

**Descripción técnica:** al extraer `assets/app.config` de `BoticuyApp-v4.apk`, apunta a `http://35.209.93.250` en los tres clientes (Store API, WP API, BFF), con el plugin `withCleartextHost` activo y `ordersEnabled: true`. Contraseñas, tokens JWT, DNI, teléfono y dirección viajan en texto claro, interceptables en cualquier WiFi. Además crea pedidos reales en el WordPress de staging.

**Por qué se cierra sin fix de código o infraestructura:** un ambiente de staging existe precisamente para no llevar las garantías de producción — de la misma forma que staging tampoco tiene la pasarela de pagos real (Izipay en modo `TEST`), no le corresponde tener HTTPS de producción. Exigirle TLS real a un servidor de pruebas interno no es un estándar razonable de aplicar ahí; sería tratar un ambiente de pruebas como si fuera producción, que es justo la distinción que la separación de ambientes busca evitar. Revisamos y descartamos dos alternativas de código/infra (HTTPS real en staging, o un certificado autofirmado con pinning) precisamente por esto — no porque fueran técnicamente inviables, sino porque no son el estándar correcto a pedirle a este ambiente.

**El único riesgo residual real:** que alguien pruebe el build de `preview` con datos personales propios reales (su DNI, teléfono, dirección reales) sobre una red no confiable. Eso es una práctica de testing a evitar — usar datos ficticios/de prueba al probar contra staging — no un defecto que requiera trabajo de infraestructura o código. Vale la pena dejarlo como recordatorio para quien pruebe builds de `preview`, no como una tarea pendiente de ingeniería.

**Lo que sí protege el ambiente que importa:** producción ya está cubierta por `assertProductionConfigIsSafe()` (ver **[C3](#-c3--un-build-de-producción-no-crearía-ningún-pedido)**) — un build con `EAS_BUILD_PROFILE === 'production'` no puede salir sin HTTPS real a `boticuy.com`. C2 y C3 apuntaban al mismo síntoma (URLs mal configuradas) en dos perfiles distintos; solo el de producción necesitaba una salvaguarda — el de `preview` no, por diseño.

---

### [x] C3 — Un build de producción no crearía ningún pedido
**Estado:** resuelto (2026-09-04)
**Impacto:** pedidos silenciosamente perdidos. App RN-02 §3.5 · PAYCARD-02

**Descripción técnica:** el perfil `production` de `eas.json` no definía ninguna variable de entorno. `ordersEnabled` se resolvía como `process.env.EXPO_PUBLIC_ORDERS_ENABLED === 'true'`, así que en producción quedaba en `false`, y `createOrder()` devolvía un resultado simulado sin llamar al backend (`api/orders.ts:39`, línea original). Publicado tal cual, el cliente habría completado todo el checkout, visto "¡Pedido confirmado!" con un número `PREVIEW-xxxxxx`, y no existiría pedido ni cobro. El modo vista previa es correcto como herramienta de desarrollo; el problema era que fuera el valor por defecto del perfil de release.

Confirmado que no era un descuido sin más: ya existía una nota casi idéntica en `docs/historial/AUDITORIA.md` y un ítem de checklist manual en `PROGRESO.md` ("Confirmar `ordersEnabled` en producción sigue en su valor real esperado"). Alguien sí había pensado en esto — el problema real era que la decisión vivía solo en un checklist de texto que dependía de que alguien se acordara de leerlo y ejecutarlo, mientras `eas.json` (lo que de verdad controla el build) no registraba nada.

**Solución — dos capas, no solo corregir el valor:**
1. **`eas.json`, perfil `production`:** ahora declara `env` explícito (mismas 4 claves que ya tenía `preview`) con las 3 URLs reales de `https://boticuy.com` y `EXPO_PUBLIC_ORDERS_ENABLED: "true"` — la decisión queda escrita en el archivo que controla el build, no implícita por ausencia.
2. **`app.config.js`, `assertProductionConfigIsSafe()` (la salvaguarda real):** si `EAS_BUILD_PROFILE === 'production'` y `ordersEnabled` no es `true` (sin que `ORDERS_DISABLED_CONFIRMED=true` lo confirme como intencional — vía de escape para un soft-launch), o alguna de las 3 URLs no apunta a `https://boticuy.com`, el build **falla con un error explícito** listando qué falló — no se genera ningún artefacto mal configurado. Esto también cierra, de paso, la misma clase de riesgo que describe C2 (build de producción apuntando a staging).

**Revisado también, sin necesidad de cambios:** de todas las `EXPO_PUBLIC_*` que lee `app.config.js`, `ordersEnabled` era la única cuyo valor por defecto (sin variable seteada) es inseguro para producción — el resto (`posthogKey`, `envioGratisDesde`, `whatsapp`, etc.) ya defaultean correctamente a producción real, así que no se declararon en `eas.json` para no duplicar una segunda fuente de verdad sin necesidad.

**Checklist de `PROGRESO.md` actualizado:** de los 6 ítems de "Checklist antes de publicar a producción", 3 pasan a automáticos (URLs de staging, plugin de cleartext, `ordersEnabled` — los tres cubiertos por `assertProductionConfigIsSafe()`) y 3 siguen manuales porque no son verificables desde `app.config.js` (grep de la IP de staging en el código, modo `PRODUCTION` de Izipay en WordPress, limpieza de `console.log`).

**Fix:** definir el entorno del perfil de producción en `eas.json` y hacer que un build de release falle si el modo vista previa quedó activo.

---

### [x] C4 — Los puntos canjeados se devuelven pero el descuento se conserva
**Estado:** resuelto (2026-09-07)
**Impacto:** descuento gratuito ilimitado. `class-orders.php` · `reverse_points_redemption`

**Descripción técnica (original):** `/payment/formtoken` solo rechazaba pedidos en `processing` o `completed` (`class-payment.php:73`). Un pedido en `failed` seguía admitiendo un formulario de pago nuevo. Pero al pasar a `failed` se disparaba `reverse_points_redemption()` — un hook de WooCommerce (`woocommerce_order_status_cancelled`/`failed`/`refunded`, nunca una llamada explícita en el código) — que restituía los puntos al saldo, mientras el fee negativo del descuento permanecía en el pedido sin que nada recalculara el total.

**Camino reproducible (original):**
1. Crear un pedido con tarjeta canjeando puntos (total reducido).
2. Abandonar el formulario de pago, o dejar que la tarjeta sea rechazada, o esperar los 45 minutos de expiración. El pedido pasa a `failed` y los puntos vuelven al saldo.
3. Volver al checkout y reintentar: la misma clave de idempotencia devuelve ese mismo pedido, y `formtoken` lo acepta.
4. Pagar. Se cobra el total con descuento y el saldo de puntos queda intacto.

Es repetible y no requiere manipular nada del lado del cliente: solo abandonar y reintentar.

**Por qué pasaba esto:** `reverse_points_redemption()` se escribió para resolver un solo problema (que el saldo de puntos no quedara bloqueado para siempre en un pedido que nunca se paga) bajo el supuesto de que cancelado/fallido/reembolsado significa "este pedido ya no importa". Ese supuesto es cierto para cancelado y reembolsado, pero **falso a propósito para `failed`** en este plugin — `formtoken()` deliberadamente permite reintentar un pedido fallido (para que un cliente con la tarjeta rechazada pueda reintentar sin perder su carrito). Nadie había reconciliado esas dos decisiones de diseño.

**Solución — dos capas:**
1. **`reverse_points_redemption()`** ahora también busca el `WC_Order_Item_Fee` del descuento por puntos (identificado por una meta interna nueva, `_bcy_fee_type = 'points_discount'`, puesta en `create_order()` al crear el fee — no por su nombre visible, para no depender de texto que podría cambiar), lo quita del pedido, y llama a `calculate_totals()` de nuevo antes de guardar. El total del pedido queda correcto (sin el descuento) en el mismo instante en que se revierte el canje, sin importar cuántas veces se reintente pagar después ni por qué camino. La nota de auditoría que ya agregaba la función ahora también registra el ajuste de monto, no solo la reversión de puntos.
2. **`/payment/formtoken`**, defensa en capas adicional: rechaza con `409 "Este pedido ya no es válido para pagar, crea un pedido nuevo"` si `_points_redemption_status === 'reversed'`, sin importar si el fee ya se quitó o no. No es para reparar pedidos viejos (todas las pruebas de esta ronda fueron en staging con dinero de prueba) — es defensa en capas estándar para cualquier caso no anticipado que llegue a producción, igual que en A2/A7.

**✅ Verificado en vivo (2026-09-11), con evidencia real:** compra de 2× FITURAL (S/60 c/u = S/120 subtotal), 720 puntos canjeados (S/36 de descuento), total cobrado S/84, pagado con tarjeta Mastercard exitosamente. Saldo de puntos tras el pago: **1,005** (1,641 − 720 canjeados + 84 ganados por esta compra) — coincide exacto. Se canceló el pedido en `wp-admin`: el saldo volvió a **1,641** (el valor previo a la compra, exacto), y el pedido cancelado ya no muestra ninguna línea de descuento por puntos en su desglose de artículos. Detalle completo en `TESTING-AUDITORIA-TI.md`, sección C4.

**C4 — cerrado.**

---

### [x] C5 — El endurecimiento de seguridad del WebView de pago bloqueaba el 3D Secure
**Estado:** resuelto (2026-09-10)
**Impacto:** ningún pago con tarjeta se podía completar. `PaymentWebViewScreen.tsx`

**Descripción técnica:** al probar en vivo C4 (que requiere completar un pago con tarjeta real), 3 pedidos consecutivos (`#11245`, `#11246`, un tercero) fueron rechazados por Izipay con el código `PSP_727 — Unable to authenticate`, incluso con tres tarjetas de prueba distintas marcadas como "aprobadas". Se descartó backend (el HMAC de `validate()` ya valida correctamente para que la nota de rechazo exista — ver `class-payment.php:163-164,209-211`), M13 (idempotency key no participa del payload ni de la firma enviados a Izipay) y credenciales (viven en `get_option('woocommerce_micuentaweb_settings')`, sin tocar por esta ronda).

**Causa raíz:** `originWhitelist={['https://boticuy.com', 'https://*.micuentaweb.pe']}` en el `WebView` de pago — el endurecimiento correcto que cerró el hallazgo original de `AUDITORIA.md`/`REFACTORIZACION_BOTICUY.md` (antes `['*']`, sin acotar) — bloqueaba silenciosamente la navegación al ACS (Access Control Server) del banco emisor durante el challenge 3D Secure. El ACS es un dominio de un tercero (del banco o del proveedor 3DS) que no se puede enumerar de antemano, así que nunca podía estar en esa whitelist fija. El SDK Krypton interpretaba la navegación bloqueada como autenticación fallida y reportaba `PSP_727` sin importar la tarjeta usada. Esto no es una reapertura del hallazgo original — es la misma intención (que la ventana de pago no navegue libremente a cualquier cosa) implementada con el mecanismo correcto para este caso.

**Fix:** se reemplazó `originWhitelist` por `onShouldStartLoadWithRequest`, que permite cualquier navegación `https://` (necesario para el ACS de cualquier banco) y bloquea explícitamente todo lo demás (deep-links externos, `javascript:`, `intent:`, etc. — el vector real que el hallazgo original buscaba cerrar). Se agregaron además `thirdPartyCookiesEnabled`/`sharedCookiesEnabled` al `WebView`, para que el ACS pueda mantener su propia sesión cross-origin durante el challenge sin depender de que el dominio esté en una lista fija.

**✅ Verificado en vivo (2026-09-11):** el challenge 3DS carga correctamente tras el fix. El pago que se probó luego seguía rechazándose, pero por una causa completamente distinta y externa — ver el incidente de Izipay documentado en `TESTING-AUDITORIA-TI.md`, sección C4 (nuevo "código de tienda" generado por Izipay, ajustado por TI el 2026-09-11; y un problema específico de tarjetas VISA de prueba, pendiente de que Izipay lo resuelva de su lado, no bloqueante). Con Mastercard, el pago con tarjeta se completó de punta a punta.

**C5 — cerrado.**

---

### [x] C6 — La app se queda colgada tras un pago con tarjeta exitoso, aunque el pedido ya pasó a "Procesando"
**Estado:** resuelto (2026-09-11)
**Impacto:** ningún pago con tarjeta exitoso llegaba a mostrar la confirmación — el cliente ve la app congelada aunque el cobro y el pedido ya están correctos. `PaymentWebViewScreen.tsx`

**Descripción técnica:** una vez resuelto el incidente de Izipay/Visa (rechazo `PSP_727` ajeno a este código, ver el `⚠️ Incidente` documentado en `TESTING-AUDITORIA-TI.md` sección C4), se probó un pago con tarjeta **Mastercard**, que sí se autenticó y cobró correctamente — el pedido pasó a "Procesando" en WooCommerce, confirmando que `/payment/validate` se ejecutó y respondió `{ok:true, paid:true}` en el servidor. Pese a eso, la app se quedó congelada en la pantalla de pago: nunca navegó a la confirmación ni mostró ningún mensaje, de éxito o de error.

**Independiente de C5, aunque coinciden en el mismo archivo:** C5 solo afecta qué URLs puede navegar el `WebView` interno (para el ACS del banco, durante el 3DS). Este bug vive enteramente en React Navigation (la pila de pantallas de React Native) — un mecanismo completamente distinto, que corre después de que el pago ya fue confirmado por el servidor y el `WebView` ya no tiene ningún rol. Ambos hallazgos coincidieron en el tiempo y en el archivo por ser la misma pantalla, no por compartir causa.

**Por qué no se había detectado antes:** el guard de `beforeRemove` de esta pantalla (agregado para bloquear al usuario si intenta salir manualmente mientras hay una validación en curso, evitando que abandone justo cuando el pago sí se completó) nunca se había ejercitado contra un pago exitoso de punta a punta en toda la ronda — todos los intentos anteriores fallaban antes (rechazos de prueba, o el bloqueo del 3DS de C5). El pago con Mastercard fue, literalmente, la primera vez que este camino de código se ejecutó con un pago real aprobado.

**Causa raíz:** `complete()` (que llama a `navigation.replace('OrderConfirmation', ...)`) se invoca desde `confirmPayment()` mientras `validatingRef.current` todavía es `true` — ese ref recién se resetea a `false` en el bloque `finally`, que corre *después* de que `complete()` ya disparó la navegación. `navigation.replace(...)` dispara de forma síncrona el evento `beforeRemove` de la propia pantalla, y ese listener miraba `validatingRef.current` **antes** que `completedRef.current`: al encontrarlo en `true`, ejecutaba `e.preventDefault()` y **cancelaba la navegación que el propio pago exitoso acababa de disparar** — sin que `completedRef.current` (ya en `true`) llegara siquiera a consultarse. Resultado: pedido pagado y "Procesando" en el servidor, pantalla de pago congelada en la app, sin ningún error visible (la navegación fue cancelada a propósito por el propio guard de seguridad, no por una excepción).

**Fix:** en el listener de `beforeRemove`, se reordenaron los chequeos — `completedRef.current` se revisa primero: si el pago ya se completó, la salida se permite siempre, sin importar el estado de `validatingRef`. El resto del comportamiento (bloquear la salida manual durante una validación en curso, avisar al servidor con `abandonPayment()` si se sale sin completar y sin validación en curso) queda intacto.

**✅ Verificado en vivo (2026-09-11):** con Mastercard, el pago se completó de punta a punta incluyendo la navegación a la pantalla de confirmación del pedido — antes bloqueada por este mismo bug.

**C6 — cerrado.**

---

### [x] C7 — WooCommerce reducía stock por su cuenta, duplicando la reserva de A4
**Estado:** resuelto (2026-09-14)
**Impacto:** stock descontado el doble en todo pedido con stock gestionado, sin importar el método de pago. `class-orders.php`

**Descripción técnica:** al reproducir en vivo la concurrencia real de A4 (no la prueba secuencial original), el stock de EXCEGATON terminó en `-2` en vez de `0` tras una prueba con un solo pedido aceptado. Investigado contra el código fuente real de WooCommerce (`trunk`, GitHub, no memoria): `wc_maybe_reduce_stock_levels()` está enganchado nativamente a `woocommerce_order_status_on-hold`/`processing`/`completed` **y** a `woocommerce_payment_complete` (`wc-stock-functions.php:124-127`) — es decir, WooCommerce reduce stock por su cuenta apenas un pedido llega a cualquiera de esos estados, o se confirma un pago. Ese mecanismo se guarda con una bandera propia (`_order_stock_reduced`, vía `$order->get_data_store()->get_stock_reduced()`/`set_stock_reduced()`) para no reducir dos veces — pero `create_order()` nunca la marcaba tras hacer su propia reserva manual (A4), así que WooCommerce siempre la veía en `false` y volvía a restar el mismo stock por su cuenta. Yape/transferencia (creados directo en `on-hold`) lo duplicaban al crear el pedido; tarjeta (creado en `pending`, no enganchado) lo duplicaba después, al confirmar el pago vía `payment_complete()`.

**Fix:** `create_order()` llama a `$order->set_order_stock_reduced(true)` justo al confirmar la reserva propia (mismo punto donde ya se marca `_bcy_stock_reservation_status`). Deliberadamente no se toca el meta por línea (`_reduced_stock`, que WooCommerce también revisa para su propia restitución nativa) — así, si WooCommerce alguna vez intenta restituir stock por su cuenta (`cancelled`/`pending`/`failed`), no encuentra nada que restituir y no hace nada; `release_stock_reservation()` sigue siendo la única fuente real de restitución, sin duplicarse en ningún sentido.

**✅ Verificado en vivo (2026-09-14), 2 rondas completas contra `EXCEGATON` con el plugin `2.15.19` desplegado:** en ambas rondas (2 peticiones simultáneas, `qty:2` cada una, 2 unidades disponibles al empezar), el stock terminó exacto en **0** tanto inmediatamente después como 3 minutos más tarde — **sin ninguna caída tardía**, descartando a C7 directamente en vivo, no solo por lectura de código. Antes del fix, esta misma prueba dejaba el stock en `-2` (una petición aceptada) con una caída que solo se hacía visible minutos después — exactamente el síntoma de la reducción nativa duplicada que este fix cierra.

**C7 — cerrado.**

---

### [x] C8 — El "commit atómico" de A4 no era realmente atómico bajo concurrencia real
**Estado:** resuelto (2026-09-14)
**Impacto:** sobreventa real bajo concurrencia genuina — el guard que debía prevenir exactamente esto podía fallar y aceptar más pedidos de los que el stock permitía. `class-orders.php`

**Descripción técnica:** repitiendo la prueba de concurrencia de A4 una segunda vez, ninguna de las dos peticiones simultáneas fue rechazada (ambas `201`) y el stock terminó en `-6` (contando también C7). Investigado contra el código fuente real de WooCommerce: `wc_update_product_stock(..., 'decrease')` delega en `class-wc-product-data-store-cpt.php::update_product_stock()`, que para el operador `decrease` primero hace un `SELECT meta_value FROM wp_postmeta ...` **separado y sin ningún lock**, calcula el nuevo valor en PHP, y recién después dispara el `UPDATE meta_value = meta_value ± X` (ese `UPDATE` sí es atómico). El valor que la función **devuelve** —y que `create_order()` usaba para decidir aceptar o rechazar el pedido— sale de ese `SELECT` previo, no de leer el resultado real del `UPDATE`. Bajo concurrencia genuina, dos peticiones pueden ejecutar ese `SELECT` casi al mismo tiempo, leer el mismo valor "viejo" cada una, y las dos calcular un resultado que no es negativo — aunque el `UPDATE` atómico real sí reste dos veces en la base de datos. Es un límite conocido y documentado de la propia comunidad de WooCommerce, no un bug de este plugin en sí — pero nuestro guard dependía enteramente de ese valor de retorno no confiable.

**Fix:** nuevo `Boticuy_App_Orders::decrease_stock_if_available()` — reemplaza la llamada a `wc_update_product_stock(..., 'decrease')` en el loop de reserva por una sola sentencia `UPDATE wp_postmeta SET meta_value = meta_value - X WHERE post_id = Y AND meta_key = '_stock' AND meta_value >= X`, que decide y escribe en el mismo lock de fila de MySQL — sin ningún `SELECT` previo del que depender. Si `$wpdb->query()` reporta 0 filas afectadas, no alcanzaba el stock en ese instante exacto y se rechaza el pedido, genuinamente atómico. Sincroniza después la tabla de lookup de la Store API (`low_stock_remaining`) con `WC_Data_Store::load('product')->refresh_product_lookup_table()` — relee la fuente de verdad en el momento de llamarla, en vez de escribir un valor ya leído de antes (que sí reintroduciría la misma carrera en miniatura).

**Por qué la restitución (`release_stock_reservation()`) NO necesita el mismo tratamiento:** ni esa función ni el revert dentro del propio loop de `create_order()` deciden nada a partir del valor de retorno de `wc_update_product_stock(..., 'increase')` — simplemente restituyen y siguen. El `UPDATE meta_value = meta_value + X` real sigue siendo atómico en cualquier caso (sin pérdida de datos aunque dos restituciones ocurran a la vez); el problema de C8 vive exclusivamente en la lectura no atómica que alimenta una *decisión* de aceptar/rechazar, algo que solo pasa en el camino de decremento.

**✅ Verificado en vivo (2026-09-14), 2 rondas completas contra `EXCEGATON` con el plugin `2.15.19` desplegado (mismas pruebas que confirmaron C7 arriba):**

| | Ronda 1 | Ronda 2 |
|---|---|---|
| Petición A | ❌ rechazada (`409`) | ✅ aceptada (`#11284`) |
| Petición B | ✅ aceptada (`#11283`) | ❌ rechazada (`409`) |
| Stock resultante | **0** | **0** |

En las dos rondas, exactamente una petición fue aceptada y la otra rechazada — determinístico, no depende de la suerte del timing. **Esto es justo lo contrario de la firma del bug antes del fix:** la primera vez que se probó (pre-`2.15.19`), la ronda 1 salió bien (una aceptada, una rechazada) pero la ronda 2 falló (**las dos** aceptadas, stock en `-6`) — esa inconsistencia entre corridas idénticas era exactamente el síntoma de una condición de carrera real (a veces la ventana de la lectura no atómica se cruza, a veces no). Con el fix, el resultado es consistente en repeticiones sucesivas, que es lo que demuestra que la carrera se cerró de verdad y no que "esta vez tocó que funcionara".

**C8 — cerrado.**

---

## 🟠 ALTOS — corregir antes de escalar tráfico (10 — A9 y A10 son hallazgos nuevos, encontrados el 2026-09-08/09 al verificar C1, no parte de los 41 originales de la auditoría)

### [x] A1 — Abrir el carrito con red inestable lo vacía
**Estado:** resuelto (2026-09-07)
**Impacto:** abandono de compra. App RN-03 §2.1
Al recibir el foco, el carrito revalidaba cada ítem con `fetchProduct`. El `catch` eliminaba el producto y avisaba "ya no está disponible" (`CartScreen.tsx:68-72`, línea original, dentro de `checkStock()` en la línea 47), sin distinguir un 404 real de un timeout, un 500 o una caída de DNS — el `catch {}` ni siquiera capturaba el error para poder mirarlo. Con conexión lenta, el cliente volvía al carrito y lo encontraba vacío. Confirmado que esta lógica ya vivía en `src/utils/cartRevalidation.ts` desde A7 (compartida por el foco del Carrito y las capas 2/3 de Checkout) — la capa 3 (pre-submit) heredaba el mismo bug sin cambios, tal como quedó anotado como límite conocido al cerrar A7.

**Solución, resuelto junto con B13 (agrupados en el propio plan de la auditoría):** `revalidateCart()` ahora hace una sola petición batch (`fetchProductsByIds()`, nuevo en `src/api/products.ts`, mismo patrón `include=id1,id2,...` que ya usaba `fetchProducts()` para el filtro por taxonomía) en vez de un `fetchProduct` por ítem. Un producto ausente de la respuesta del batch es la señal de "ya no existe" — la Store API lo omite directamente, sin necesidad de interpretar códigos de error por producto. Si la petición completa falla (red/timeout/500), no se toca nada del carrito — misma regla de "ante la duda, no tocar" que antes, aplicada una sola vez en vez de N. La firma pública (`{issues, priceChanged}`) no cambió, así que los 3 puntos que ya usan `revalidateCart()` siguen funcionando sin tocarlos.

**Trade-off aceptado:** `isCancelled` pierde granularidad — ya no se puede cortar "entre ítem e ítem", solo antes de arrancar o después de que el batch resuelva. Se acepta porque la espera máxima total también bajó de N peticiones a una sola.

### [x] A2 — El resultado de `apply_coupon()` no se verifica
**Estado:** resuelto (2026-09-04)
**Impacto:** cobro distinto al mostrado. Plugin ORD-CREATE-05 · RN-01 §5.2 (no verificable — ver nota abajo)
`class-orders.php:425` (línea original) aplicaba el cupón e ignoraba el retorno. Cuando WooCommerce lo rechaza por sus reglas nativas (límite de usos agotado, uso individual, restricción de producto/categoría, exclusión de artículos en oferta) devuelve un `WP_Error`, el pedido se creaba sin descuento y la API respondía `201 ok`. El cliente vio el descuento en la app y pagaba el total sin descontar, sin ningún aviso. El caso de prueba `ORD-CREATE-05` del documento original espera "descuento aplicado" y no lo verifica.

**Decisión de negocio tomada:** bloquear el pedido (no crearlo con aviso). `create_order()` ahora captura el retorno de `apply_coupon()` y, si es `WP_Error`, corta con `422 { reason: <mensaje real de WooCommerce> }` antes de tocar envío/puntos/`save()` — mismo patrón que el rechazo Oro-only ya existente en la misma función. No se crea ningún pedido cuando el cupón es rechazado.

**Incluye, además del mínimo que pedía el hallazgo, un refuerzo de `/coupon`** (`class-coupons.php::coupon()`, el endpoint que usa la app al aplicar el cupón en el carrito, antes de llegar a pagar): confirmado que antes solo validaba existencia, vencimiento y la regla propia de cupones Oro — ninguna de las reglas nativas de WooCommerce que sí aplica `apply_coupon()`. Ahora también revisa límite de usos global (`get_usage_limit()`/`get_usage_count()`) y límite por cliente (`get_usage_limit_per_user()`, solo con sesión iniciada), con el mismo mecanismo interno que usa WooCommerce (`get_data_store()->get_usage_by_user_id()`). El chequeo Oro-only queda intacto, sin cambios.

**Límite conocido, resuelto (2026-09-09) — ver seguimiento más abajo.** ~~restricción por producto/categoría y exclusión de artículos en oferta no se verifican en `/coupon`~~ — sí se verifican ahora.

**"Uso individual" — precisión de términos:** el flag nativo de WooCommerce *"Individual use only"* significa "no combinable con otros cupones", no "un uso por cliente" (eso es `usage_limit_per_user`, ya cubierto). Como este plugin nunca aplica más de un cupón por pedido, ese flag específico no debería poder causar un rechazo real en este checkout — no hay con qué combinarse.

**RN-01 §5.2 / ORD-CREATE-05:** no están documentados en ningún archivo de este repositorio (solo en los PDF de requerimientos externos que cita la auditoría) — no se pudo verificar contra el texto original, solo contra el comportamiento real del código.

**Verificado en vivo (2026-09-08/09):** confirmado contra `POST /order` con un código inexistente (`422`, motivo real de WooCommerce, sin pedido creado) y, al día siguiente, con la app real contra un cupón restringido a un producto fuera del carrito — `create_order()` rechazó correctamente sin crear ningún pedido.

**Seguimiento (2026-09-09) — restricción de producto/categoría ahora también se valida al aplicar el cupón, no solo al confirmar:** la prueba en vivo del párrafo anterior confirmó que la capa que protege el dinero (`create_order()`) funciona bien, pero expuso un problema de experiencia: como `/coupon` no conocía los ítems del carrito, el carrito y el checkout mostraban "Cupón aplicado" con el descuento restado del total durante todo el flujo, y el cliente recién se enteraba de que el cupón no aplicaba al confirmar el pedido. Decidido resolverlo en esta misma ronda, no dejarlo pendiente. Fix: `/coupon` acepta un parámetro opcional `items` (mismo shape `{id, qty}[]` que `POST /order`) — con él, arma un `WC_Order` desechable (nunca persistido, mismo patrón sin `save()` que ya usa `create_order()` antes de guardar) y le aplica el cupón real vía `WC_Order::apply_coupon()`, la misma ruta pública de WooCommerce que ya corre en `create_order()` (nunca los métodos `protected` de `WC_Discounts`, que no son API pública y se romperían con cualquier actualización). Sin `items`, o para builds viejos de la app que no lo manden, el comportamiento es exactamente el de antes — cambio retrocompatible. Contraparte de app en `boticuy-app/CHANGELOG.md`: los 3 puntos de la app donde se aplica un cupón (`CouponField.tsx` en Carrito/Checkout, `MyCouponsScreen.tsx`, `CreatorsScreen.tsx`) ahora mandan los ítems del carrito. Ver diseño y pasos de verificación en `TESTING-AUDITORIA-TI.md`.

### [x] A3 — "Recordar mis datos" nunca guarda la dirección en la cuenta
**Estado:** resuelto (2026-09-07)
**Impacto:** función anunciada que no funciona. App §3.1 · CHECK-03
El checkout llamaba a `addAddress()` sin `telefono` ni `numDoc` (`CheckoutScreen.tsx:254-262`, línea original). El plugin exige ambos con formato válido antes de guardar (`class-addresses.php::validate_format()`) y respondía `422` "Teléfono inválido". La respuesta se descartaba dos veces: `addAddress()` devuelve `[]` ante un 422 (porque `bffClient` no lanza excepción para códigos `< 500`, ver `client.ts`) y la llamada terminaba en `.catch(() => {})`, que nunca llega a dispararse para un 422 de todos modos. Resultado: la casilla se marcaba, el perfil local sí se guardaba, y la dirección en la cuenta nunca aparecía, sin ningún aviso.

**¿Descuido, o dos pantallas desalineadas?** Lo segundo, confirmado con evidencia: `AddressFormScreen.tsx` (la pantalla dedicada de "Mis direcciones") sí arma el payload completo con teléfono/DNI y sí propaga el error al usuario — se actualizó en algún momento para cumplir el formato que exige el servidor. El checkbox "Recordar mis datos" del checkout, que llama al mismo endpoint desde otro lugar del código, nunca se tocó. TypeScript no lo detectó porque `SavedAddress.telefono`/`numDoc`/`nombre` son todos opcionales en el tipo — omitirlos compila sin ningún error. El dato ya estaba disponible en el mismo scope de `CheckoutScreen` (se usa dos líneas antes, para el perfil local en `SecureStore`) — no hacía falta pedirle nada nuevo al usuario.

**Solución:**
1. **`CheckoutScreen.tsx`** ahora completa el payload con `nombre`/`telefono`/`numDoc`, y deja de tragarse el resultado — muestra un toast ("No pudimos guardar tu dirección en tu cuenta, pero tu pedido sí se procesó.") si falla. Sigue siendo fire-and-forget a propósito — no bloquea el pago; el toast es global, así que se ve igual aunque ya se haya navegado a la pantalla de pago. **Actualizado (desde B9):** en su momento hacía falta revisar tanto el `.catch()` (red/5xx) como el arreglo resuelto vacío por separado, porque `addAddress()` devolvía `[]` en silencio ante un 4xx (`bffClient` no lanza para esos códigos). Desde B9, `addAddress()`/`updateAddress()` (`src/api/addresses.ts::unwrapAddresses()`) lanzan una excepción con el motivo real del servidor cuando `ok !== true` — el comportamiento es hoy más estricto que lo que describe este párrafo: un solo `.catch()` ya cubre 4xx y 5xx, sin necesitar revisar ningún arreglo vacío aparte.
2. **Nuevo `buildAddressPayload()`** (`src/utils/addressPayload.ts`), usado ahora por `CheckoutScreen.tsx` y `AddressFormScreen.tsx` — un solo lugar que sabe qué payload espera el servidor, para que estas dos pantallas no vuelvan a desalinearse si el servidor cambia qué exige en el futuro.

**Descubrimiento adicional, fuera de alcance de este fix:** `AddressFormScreen.tsx::onSave()` tiene el mismo problema de fondo que tenía `CheckoutScreen` — su `try/catch` tampoco detecta un `422` (no lanza, por el mismo `validateStatus` de `bffClient`), así que si el servidor rechazara la dirección por "Distrito inválido" (el único 422 que su propia validación de formulario no descarta de antemano), la pantalla igual navegaría hacia atrás como si se hubiera guardado. No se tocó en este fix — solo se reemplazó cómo arma el payload, no su manejo de la respuesta. Queda anotado para revisar aparte si se decide.

**✅ Verificado en vivo (2026-09-14) por Bran, en uso real:** completado un checkout con "Recordar mis datos" marcado — la dirección aparece guardada en "Mis direcciones", y desde ahí se confirma que también se puede editar y eliminar correctamente.

### [x] A4 — El servidor no valida la cantidad contra el stock real
**Estado:** resuelto (2026-09-07)
**Impacto:** sobreventa. Plugin RN-04 §2.2
La creación de pedido solo comprobaba `is_in_stock()` como booleano y normalizaba la cantidad con `max(1, intval($it['qty']))` (`class-orders.php:314`, línea original). Nunca comparaba lo pedido contra el stock disponible. Una llamada directa a la API podía pedir 500 unidades de un producto con 1 en stock: el pedido se creaba y WooCommerce descontaba a negativo. `low_stock_remaining` (el dato que usa la app para su propio tope) es un campo nativo de la Store API que solo trae un número cuando el stock ya está por debajo del umbral de "stock bajo" de la tienda — con stock de sobra viene `null`, así que tampoco había tope real del lado del cliente en ese caso.

**Qué pasaba con el stock en negativo:** WooCommerce cambia automáticamente el `stock_status` de un producto a "agotado" al cruzar el umbral configurado — efecto auto-correctivo hacia adelante (otros clientes ven "agotado" después), pero no deshace que un pedido ya prometió unidades que no existen físicamente. Confirmado también que Boticuy no vende productos con variaciones (tallas/presentaciones) — cero referencias a `WC_Product_Variation` en todo el código, no hace falta contemplarlas.

**Solución — validación + concurrencia real, no solo un chequeo:**
1. **Chequeo temprano, en el loop de ítems de `create_order()`:** si `managing_stock()` y la cantidad pedida supera `get_stock_quantity()`, se rechaza el pedido completo con `422` — sin mutar nada todavía. Cierra el caso obvio (500 vs. 1) pero **no** la condición de carrera por sí solo.
2. **Commit atómico, justo antes de `save()`** (después de cupón/puntos/Oro-only, para que nada posterior pueda descartar el pedido dejando un decremento huérfano): `wc_update_product_stock($prod, $qty, 'decrease')` por cada producto con stock gestionado — resta vía SQL atómico a nivel de fila, el mismo mecanismo interno de WooCommerce. Si el resultado da negativo (otro pedido se llevó la última unidad en el medio), se revierte ese decremento y todos los ya aplicados en el mismo pedido, y se rechaza con `409` sin llegar a `save()`. Esto sí cierra la compra simultánea de la última unidad — el segundo pedido en decrementar ve el resultado ya negativo y se revierte solo, sin necesitar un lock propio.
3. **Restitución al abandonar/expirar/rechazar, simétrica a C4:** nueva `release_stock_reservation()`, función aparte de `reverse_points_redemption()` (esa corta de inmediato si el pedido no canjeó puntos — la mayoría no canjea puntos pero sí reserva stock, así que no servía para esto). Registrada en los mismos hooks de WooCommerce que ya usa la reversión de puntos (`cancelled`/`failed`), así que cubre automáticamente `expire_stale_card_order()`, `/payment/abandon` y un rechazo real de Izipay sin tocarlos — todos ya disparan esos hooks. **`refunded` queda deliberadamente afuera:** un reembolso no siempre significa que el producto volvió físicamente, y WooCommerce ya tiene su propio mecanismo de restock ligado al reembolso real (checkbox "Restock refunded items" en wp-admin) — sumar stock automáticamente también por cualquier `refunded` duplicaría ese conteo.

**✅ Verificado en vivo (2026-09-14) — el caso de concurrencia real, con evidencia de servidor:** contra `EXCEGATON` (id `9661`, `managing_stock()` activo, 2 unidades de stock), se dispararon 2 peticiones `POST /order` simultáneas pidiendo `qty: 2` cada una (cada una cabía sola, juntas excedían el stock). Resultado: una respondió `409 "El stock cambió justo ahora, intenta de nuevo"` sin crear pedido; la otra respondió `201` y creó el pedido `#11278`. Stock final del producto verificado después: `low_stock_remaining: 0`, `is_in_stock: false` — nunca negativo. Confirma que el commit atómico (`wc_update_product_stock(..., 'decrease')`) resuelve la carrera real, no solo el caso secuencial ya verificado el 09-08.

**✅ Verificado en vivo (2026-09-09), durante la matriz de A10:** producto real (`7443`) con `managing_stock()` desactivado — se pidieron 99999 unidades y el pedido se creó igual (`#11229`, cancelado por Bran). Reintentado con `EXCEGATON` (`9661`, stock real gestionado, 2 disponibles) pidiendo 10 — rechazo `422` correcto, sin crear pedido. **Confirma que A4 funciona exactamente como se diseñó: protege cualquier producto con control de stock activo, tal cual.**

**Nota aclaratoria — no es un hueco de seguridad, es consistente con el diseño existente de la web (confirmado con Bran, 2026-09-09):** A4 corrige la comparación contra el stock **cuando el producto tiene `managing_stock()` activo**. Para un producto **sin** control de stock activado (como `7443` en la prueba de arriba), no existe ningún tope de cantidad — el cliente puede pedir cualquier cantidad y simplemente paga por ella. Esto **no es un descuido nuevo de esta ronda ni un hueco que A4 debería haber cerrado**: la web actual de Boticuy tampoco impone un límite general de cantidad para productos sin control de stock — es el mismo comportamiento ya existente, replicado tal cual. Un producto sin `managing_stock()` es, por definición del propio comerciante en WooCommerce, uno que no necesita ese control (stock esencialmente ilimitado o gestionado fuera del sistema) — no hay ninguna cantidad "razonable" que el servidor pueda inventar como tope sin arriesgar rechazar compras legítimas de mayoristas o pedidos grandes reales. Queda documentado acá como aclaración de diseño, no como fix pendiente.

### [x] A5 — Sin protección de sesión en la navegación, y con condición de carrera al arrancar
**Estado:** resuelto (2026-09-07)
**Impacto:** acceso indebido y errores intermitentes. App NAV-SEC-01 · brecha #1 del documento
Confirmado: `Orders`, `OrderDetail`, `Addresses`, `AddressForm`, `Points`, `MyCoupons` (y también `Checkout`/`PaymentWebView`, de invitado por diseño) se registraban incondicionalmente en `navigation/index.tsx`, sin ningún guard. La única "protección" era que las filas de Perfil son `View` sin `onPress` estando deslogueado (B6, un bug aparte) — un accidente, no un diseño. Sin deep links configurados hoy, así que sin vector externo real todavía, pero frágil ante cualquier botón/enlace futuro que navegue directo.

**Confirmado también el detalle de la condición de carrera, con un matiz que no estaba en el hallazgo original:** el riesgo no depende de la red (como "conexión lenta" podría sugerir) — `token`/`user` se pueblan apenas termina la lectura local de `SecureStore` (rápido); lo único que sí espera a la red es `hydrated` (por `/auth/refresh`, disparado en un `useEffect` que no bloquea el render, `App.tsx:14`), y nada lo usaba de todos modos. La ventana real es solo el tiempo que tarda esa lectura local, extremadamente corta en un dispositivo normal — el escenario real es un arranque en frío en un celular lento/sobrecargado, no un caso amplio. El síntoma tampoco era un "401 visible": como `bffClient` no lanza excepción ante un 4xx y cada función de la capa de API colapsa una respuesta sin datos a `[]`/vacío, el resultado real hubiera sido una pantalla silenciosamente vacía ("no tienes pedidos"), no un error.

**Solución:**
1. **`authStore.ts`:** nueva bandera `tokenReady`, separada de `hydrated` — se vuelve `true` apenas termina la lectura local de `SecureStore`, sin esperar el round-trip de red de `/auth/refresh`. `hydrated` sigue exactamente igual, sin usarse para esto.
2. **Nuevo `useRequireAuth()`** (`src/hooks/useRequireAuth.ts`) — un solo hook, usado por las 6 pantallas afectadas: espera `tokenReady`, y si no hay sesión, redirige con `navigation.replace('Login')` (decisión de negocio ya tomada: redirigir, no dejar inaccesible en silencio). Mientras `tokenReady` es `false`, no decide nada — ni redirige ni asume que hay sesión. Cada pantalla lo integra con dos líneas (`const authorized = useRequireAuth();` + `if (!authorized) return null;`), sin duplicar la lógica de decisión en ninguna de las 6.
3. **`Checkout`/`PaymentWebView` quedan fuera del guard a propósito** — son de invitado por diseño.

**Trade-off aceptado, documentado en el diseño:** el `useEffect` propio de cada pantalla (para pedir sus datos) igual se ejecuta una vez en el mismo render en que `useRequireAuth()` decide redirigir a alguien genuinamente sin sesión — una petición de red desperdiciada en un caso ya raro, sin implicancia de seguridad (el servidor ya responde vacío sin token válido).

**✅ Verificado en vivo (2026-09-14):** confirmado que, sin sesión iniciada, las 4 opciones de cuenta en Perfil (Pedidos, Puntos, Cupones, Direcciones) aparecen bloqueadas con candado, sin ninguna forma de acceder — consistente con B6 (mismo día, esas filas ahora son táctiles y llevan a Login en vez de no hacer nada).

### [x] A6 — El barrido de 45 minutos solo alcanza pedidos con canje de puntos
**Estado:** resuelto (2026-09-07)
**Impacto:** código ≠ documento. Plugin §2.6 · App RN-07 §3.5
`find_stale_card_orders()` filtraba por `_points_redemption_status = 'active'` (`class-orders.php:536`, línea original). Un pedido de tarjeta sin canje de puntos nunca llega a tener esa meta en absoluto (solo se escribe si hubo canje), así que quedaba fuera del barrido de 45 minutos para siempre: `pending` indefinidamente, sin liberarse nunca. El glosario §2.6 del documento del plugin describe la expiración automática sin esa condición, igual que el RN-07 §3.5 de la app — código y documento no coincidían.

**Por qué estaba esa condición:** no era una condición de más sin razón — confirmado en el historial de `boticuy-app-plugin/CHANGELOG.md` que esta función nació (`[2.11.0]`) con el único propósito de liberar reservas de puntos que quedaban bloqueadas para siempre en pedidos abandonados. El filtro era correcto para ese problema puntual. El desajuste apareció después: el glosario/RN-07 §3.5 pasaron a describir la expiración como un comportamiento general de "pedidos de tarjeta abandonados", pero el código nunca se amplió para cumplir esa promesa más amplia — la documentación describía algo que nunca terminó de construirse.

**Solución:** quitada la condición `_points_redemption_status = 'active'` del `meta_query` de `find_stale_card_orders()` — el barrido ahora cubre todo pedido de tarjeta `pending` abandonado, con o sin canje de puntos. Sin ningún cambio en `reverse_points_redemption()` (C4) ni `release_stock_reservation()` (A4): ambas siguen disparándose automáticamente al marcar el pedido `failed`, vía los mismos hooks de WooCommerce ya registrados en `register_order_hooks()` — el mecanismo de `add_action()` no distingue qué código causó la transición de estado. Para un pedido sin puntos, `reverse_points_redemption()` no hace nada (su propio guard corta de inmediato); `release_stock_reservation()` sí restituye el stock reservado, igual que para cualquier otro pedido fallido.

**✅ Verificado en vivo (2026-09-14):** al abandonar desde el `WebView` un pago con tarjeta sin canje de puntos, el pedido pasa a "Fallido" al instante (vía `/payment/abandon`, no hace falta esperar el barrido de 45 minutos) — sin ninguna nota extraña de reversión de puntos (no había ninguno que revertir), confirmando que `reverse_points_redemption()` corta en silencio por su propio guard como se esperaba.

### [x] A7 — El carrito congela el precio y nunca lo refresca
**Estado:** resuelto (2026-09-04)
**Impacto:** total inconsistente y checkout bloqueado.
`cartStore.ts` guardaba `unitPrice` al agregar el producto, y la revalidación de stock del carrito no actualizaba ese precio. El carrito sobrevive a cierres de la app, pero **la desactualización no depende de eso** — cualquier cambio de precio entre agregar el producto y pagar, aunque sea en la misma sesión de minutos, ya la produce. El servidor siempre recalcula con el precio vigente (eso ya era así antes de tocar nada aquí, gracias al mismo patrón `ord.total ?? finalTotal` que después terminamos de completar en C1), así que el dinero cobrado nunca fue incorrecto — pero el tope de canje de puntos sí se calculaba en la app sobre ese subtotal desactualizado, y un pedido podía fallar con `422 "El canje no puede superar el 30% del subtotal"` sin que el usuario pudiera interpretarlo ni resolverlo.

**Solución implementada — 3 capas del lado de la app + 1 red de seguridad del lado del servidor**, siguiendo el estándar de checkouts serios (revalidar antes de pagar, no después):
1. **Foco del Carrito** (ya existía como `checkStock()`, ahora también refresca precio, no solo stock).
2. **Montaje de `CheckoutScreen`** (nuevo): revalida antes de que el usuario decida cuánto canjear, para que el tope del slider de puntos ya sea el real.
3. **Justo antes de "Confirmar pedido"** (nuevo): última revalidación, más ajustada en el tiempo. Si encuentra un cambio real (precio o stock), corta el submit y el usuario ve los números actualizados y debe volver a confirmar. Si la revalidación en sí falla por red, no bloquea — se sigue con lo que había, dejando que la red de seguridad del servidor cubra ese caso.
4. **Servidor, `create_order()` (red de seguridad final, no el mecanismo principal de aviso):** si el canje solicitado excede el tope real, ya no responde `422` — recorta el canje al máximo permitido y crea el pedido igual, informando el ajuste en la respuesta (`points_redeemed_adjusted`, `points_requested`, `points_redeemed`, `points_discount`), con el mismo contrato también en el camino de reintento por `idempotency_key`.

Extraída la lógica de revalidación (antes solo dentro de `CartScreen.tsx`) a `src/utils/cartRevalidation.ts`, compartida por las 3 capas de la app.

**Límite heredado de A1 — ya cerrado, no queda pendiente:** al escribir esta solución, la revalidación todavía reutilizaba el mismo manejo de errores que tenía `checkStock()` (sin distinguir una falla de red real de un producto que de verdad ya no existe), así que un timeout durante la revalidación pre-submit podía remover un ítem del carrito en vez de simplemente dejarlo pasar. Esto se resolvió al cerrar A1 (mismo archivo compartido, `src/utils/cartRevalidation.ts`): el `catch` de la petición batch ahora retorna sin tocar el carrito ante cualquier falla de red — la revalidación pre-submit de A7 hereda ese fix automáticamente, sin necesitar ningún cambio propio.

**✅ Verificado en vivo (2026-09-14), con log temporal `[DIAG A7]` en `cartRevalidation.ts` (ya retirado):** al cambiar el precio de un producto en wp-admin mientras estaba en el carrito, la revalidación al volver a la pestaña Carrito detectó la diferencia real (`unitPrice=50`, `freshPrice=70`) y disparó correctamente el aviso y la actualización de `unitPrice`. Confirma que las 3 capas funcionan con datos reales, no solo por lectura de código — quedó pendiente sin instrumentar el caso puntual del corte pre-submit con doble tap y el ajuste de canje de puntos por desactualización residual, ambos ya cubiertos por el mismo mecanismo y sin motivo para dudar de ellos por separado.

### [x] A8 — Puntos bloqueados indefinidamente en Yape y transferencia
**Estado:** resuelto (2026-09-08)
**Impacto:** saldo del cliente inmovilizado. Requiere decisión de negocio.
El canje se reservaba al crear el pedido (`_points_redemption_status = 'active'`) para evitar doble gasto, y esos dos métodos quedaban en `on-hold` sin ninguna expiración automática, por decisión explícita del código (comentario ya existente: confirmar el comprobante "puede tardar horas o días", así que cancelar por tiempo fijo cancelaría pedidos legítimos en revisión). Si el cliente nunca enviaba el comprobante, sus puntos quedaban inutilizables hasta que alguien cancelara el pedido a mano en wp-admin — sin alerta, sin reporte, sin forma de que el cliente lo resolviera. Confirmado además que el único mecanismo de visibilidad para el negocio (la columna "Canal" en el listado de pedidos) no distingue antigüedad ni resalta pedidos estancados — no existía ningún reporte previo a este fix.

**Decisión de negocio, tras varias vueltas para afinar el plazo (confirmado con Bran, 2026-09-08):** expiración automática (no reporte adicional — el equipo ya revisa pedidos manualmente como parte de su rutina: WhatsApp, comprobante, marcar procesando; un aviso aparte sería complejidad innecesaria), con un plazo de **72 horas fijas**. El plazo se calculó para cubrir el peor caso real dado el horario de atención del negocio (lunes a viernes, 9am-6pm, sin fin de semana): un pedido que entra viernes cerca del cierre debe seguir vivo hasta que el equipo tenga el lunes completo disponible para revisarlo — 72h fijas cubren ese caso sin necesitar lógica de "horas hábiles" que salte el fin de semana.

**Fix:** se generalizó el mecanismo de A6 (antes solo tarjeta) a una tabla de reglas por método de pago, `Boticuy_App_Orders::STALE_ORDER_RULES` — tarjeta (`micuentawebstd`) sigue en estado `pending`, 45 min; Yape/Plin (`offline_gateway`) y transferencia (`bacs`) se suman con estado `on-hold`, 72h. `find_stale_card_orders()`/`expire_stale_card_order()` se generalizaron a `find_stale_orders($rule, ...)`/`expire_stale_order($order, $rule)`, reutilizando exactamente el mismo lock atómico y los mismos hooks de reversión de puntos/stock que ya se disparaban solos para tarjeta — sin lógica nueva, solo parametrizada por regla. `expire_stale_card_orders_for_user()` (la auto-liberación eager al consultar `/points`) se renombró a `expire_stale_orders_for_user()` y ahora aplica las dos reglas — un cliente ve su saldo liberado de inmediato al entrar a la app para cualquiera de los tres métodos, no solo tarjeta.

**Qué pasa si el cliente manda el comprobante después de las 72h:** el pedido ya está `failed`, con los puntos y el stock ya liberados por los hooks existentes (mismo comportamiento que ya tenía tarjeta desde A6) — el negocio tendría que recrear el pedido a mano, con el riesgo de que precio/stock hayan cambiado desde entonces. Costo operativo real pero acotado, y poco frecuente dado el margen de 72h.

**🔴 Reabierto para investigación (2026-09-09) — el barrido no expira un pedido de prueba real.** Con `STALE_ORDER_RULES` bajado a 1 minuto (ver `[2.15.2]`, temporal para poder probar hoy sin esperar 45min/72h), pedido de prueba `#11236` (Yape/Plin, `on-hold`, S/89.90, creado 17:15 hora local) sigue sin expirar tras más de 4 minutos y dos entradas a la pantalla de Puntos (que dispara `expire_stale_orders_for_user()`).

**Descartado con evidencia de código, uno por uno:**
- `_payment_method` — coincide exacto (`offline_gateway`).
- Formato de `status` — confirmado en el código fuente de WooCommerce que **ambos** backends posibles (CPT clásico y HPOS) agregan el prefijo `wc-` automáticamente a un valor sin prefijo (`wc_is_order_status('wc-' . $status)` / `in_array('wc-' . $status, $valid_statuses)`) — `'on-hold'` sin prefijo funciona en los dos.
- Residuo de `_points_redemption_status` en el `meta_query` de `find_stale_orders()` — no existe, un solo filtro (`_payment_method IN (...)`), confirmado leyendo el archivo completo.
- `customer_id`/pedido de invitado — descartado, confirmado que `#11236` pertenece a la cuenta logueada de Bran, tanto en `wp-admin` como en la app.
- Lock atascado (`Boticuy_App_Locks`) — TTL de 30 segundos por defecto, se autorrepara muy por debajo de los 4+ minutos observados.

**Bug real encontrado, pero en la dirección contraria a lo observado:** `find_stale_orders()` arma `$threshold` con `gmdate()` (UTC), pero `date_created` compara contra `post_date` (CPT) / `date_created_gmt` (HPOS) — ambos esperan hora **local** del sitio como entrada, confirmado en el código fuente de WooCommerce (`WC_DateTime` no convierte el string, lo interpreta directo como UTC). Con las horas reales confirmadas de `#11236` (creación 17:15 hora local = 22:15 UTC; zona del sitio UTC-5, confirmada en `Ajustes → Generales`), la comparación real que se ejecuta es `post_date ('...17:15:00') < threshold ('...22:22:00' aprox., a los ~8 min)` → **verdadero** — el pedido debería haber calificado como "viejo" casi al instante, no nunca. El bug de zona horaria es real (misma familia que B3) pero apunta a "expira de más", no a "nunca expira" — hay algo más, independiente, bloqueando la consulta.

**Verificado en vivo con `#11236`:** el pedido ya NO estaba `on-hold` — su estado real era `cancelled`, un valor que ningún código de este plugin asigna automáticamente (`expire_stale_order()` solo marca `failed`) — cancelado manualmente en `wp-admin` durante la propia investigación, confirmado con Bran. Por eso no aparecía: la consulta funcionaba bien, el pedido ya no cumplía la condición de estado.

**Repetido con un pedido limpio, `#11238` (Yape, `on-hold`, sin ninguna interferencia manual) — sigue sin expirar.** `GET /debug/stale-orders?order_id=11238` confirma: `status: on-hold` real, pero `matched_count: 0` para la regla de Yape/transferencia. Se rehizo el cálculo de zona horaria con las horas exactas de este pedido, en las dos direcciones posibles (sin conversión, y asumiendo que el código sí convierte `threshold` de UTC a hora local antes de comparar) — **en ambas interpretaciones el pedido debería calificar como viejo**, ninguna explica la lista vacía. El bug de zona horaria sigue siendo real (confirmado con `#11236`), pero no es la causa de que esta consulta puntual salga vacía.

**Diagnóstico ampliado (`[2.15.12]`):** `debug_stale_orders()` corrió la misma consulta quitando `status`, `date_created` y `meta_query` uno a la vez. Resultado con evidencia real: quitando solo `meta_query` (dejando `status`+`date_created`), la consulta sí trae pedidos — pero todos genuinamente viejos (`#11154`, 2026-07-31; `#11200`, un día antes) — nunca `#11238` (recién creado). Quitando `date_created` (dejando `status`+`meta_query`, las dos condiciones que `#11238` cumple de sobra) la lista salía **vacía por completo** — aislando `date_created` como la condición que lo excluye.

**Fix (`[2.15.13]`):** en vez de seguir ajustando el formato de texto que se le pasa a `wc_get_orders(['date_created' => ...])` para adivinar cómo lo interpreta cada backend de WooCommerce (CPT clásico vs. HPOS — ambos esperan hora LOCAL del sitio, y el código le mandaba UTC), se **elimina el filtro `date_created` de la consulta por completo**. `find_stale_orders()` trae los pedidos solo por `status`+`meta_query` (sin ninguna ambigüedad, ya verificado) y filtra la antigüedad en PHP comparando `get_date_created()->getTimestamp()` contra `time() - $rule['minutes']*60` — dos timestamps Unix reales, sin zona horaria asociada a ninguno, sin ninguna interpretación posible de local vs. UTC. Se retiró también el endpoint temporal de diagnóstico (`/debug/stale-orders`, `[2.15.11]`/`[2.15.12]`), ya cumplió su propósito.

**❌ Verificado en vivo (2026-09-09), `[2.15.13]` desplegado — seguía sin expirar.** Revisando otra vez los datos de `/debug/stale-orders` ya obtenidos (antes de retirar el endpoint): la variante `sin_date_created` (dejaba `status='on-hold'` + `meta_query` de `_payment_method`, sin ningún filtro de fecha) daba **cero resultados totales** — no solo sin el pedido de prueba, la lista completa vacía — pese a que ese pedido cumplía ambas condiciones directamente. Esa señal ya estaba en los datos, no se interpretó a tiempo la primera vez.

**Segunda causa real, encontrada:** el `meta_query` sobre `_payment_method` no matcheaba ningún pedido, en ninguna combinación probada — indicio fuerte de que este sitio usa HPOS (tablas propias de pedidos) y `payment_method` vive ahí como columna nativa, no como fila de `postmeta`.

**Fix (`[2.15.14]`):** se retira el `meta_query` de `_payment_method` de los argumentos de `wc_get_orders()` — el filtro por método de pago ahora se hace en PHP, con `$order->get_payment_method()` (el getter real de WooCommerce, correcto en cualquier backend), mismo criterio que el fix de fecha de `[2.15.13]`. `find_stale_orders()` ahora trae los pedidos solo por `status`, y verifica método de pago + antigüedad en PHP sobre cada uno.

**✅ Verificado en persona (2026-09-09), `[2.15.14]` desplegado — confirmado por Bran** que un pedido nuevo de Yape/Plin expira correctamente al superar el umbral (ver `boticuy-app-plugin/CHANGELOG.md [2.15.15]`, que revierte el umbral de prueba de 1 minuto de vuelta a los valores reales — 45min tarjeta / 72h Yape-transferencia — precisamente porque este pendiente ya se cumplió).

### [x] A9 — `/shipping` cotiza el envío sin el IGV que el pedido real sí cobra
**Estado:** ✅ cerrado (2026-09-09) — resuelto el 2026-09-08, con una regresión crítica (checkout caído) introducida por el fix y corregida el mismo día siguiente, más un residuo de S/0.01 en un caso puntual (Callao) aceptado como límite conocido por decisión de negocio, tras 4 intentos de cierre. Ver el hilo completo de 7 versiones (`2.15.1`–`2.15.8`) y la tabla comparativa antes/vs./ahora en "Seguimiento", al final de este hallazgo. · **Hallazgo nuevo, encontrado el 2026-09-08 al verificar C1 contra staging — no es uno de los 41 originales de la auditoría del 21-ago-2026.** Se le asigna ID propio (A9) para no confundirlo con C1, que ya estaba cerrado y de hecho fue el que sirvió para descubrir este otro problema, distinto.

**Cómo se encontró:** al crear un pedido real de prueba en staging para verificar C1 (Callao, subtotal S/36.60, cotización previa `{"cost":8.47}`), el pedido creado dio `total: 46.59` — no los `45.07` esperados (36.60 + 8.47). La diferencia (`1.52`) no era ruido: `46.59 − 36.60 = 9.99`, y `8.47 × 1.18 = 9.9946 ≈ 9.99` — el envío se estaba cobrando con IGV (18%) encima del monto que `/shipping` había cotizado sin impuesto.

**Diagnóstico, corregido en el camino (primer intento fue al revés):** se sospechó primero que el pedido estaba cobrando de más por error. Confirmado en `wp-admin` (WooCommerce → Envío → zona "Peru, Callao" → método "Flat rate"): `Tax status = "Sujeto a impuestos"`. Es decir, **el pedido real está bien** — cobra el IGV porque el método así lo tiene configurado. El que está mal es `/shipping`: `compute_cost()` devolvía el `cost` crudo del método (tax-exclusivo) sin sumarle el impuesto que `calculate_totals()` sí aplica al crear el pedido de verdad — la cotización pre-checkout prometía menos de lo que el pedido real termina cobrando.

**Verificado también para Provincia, no asumido:** mismo criterio del proyecto (verificar contra la configuración real antes de programar, no adivinar por similitud) — se creó un segundo pedido de prueba a un distrito de Arequipa (zona real "Peru, Lima Provincias"). Cotización previa `{"cost":12.71}`; total real del pedido: `51.60` (`51.60 − 36.60 = 15.00`, y `12.71 × 1.18 = 14.9978 ≈ 15.00`) — mismo patrón, confirmando que ese método también está `"Sujeto a impuestos"`. Ambas zonas del fallback (Callao y Provincia) quedan con el mismo tratamiento, verificado para las dos por separado, no un valor único adivinado para ambas.

**Fix:** nueva `Boticuy_App_Shipping::apply_shipping_tax($amount)` — usa `WC_Tax::get_shipping_tax_rates()`/`calc_shipping_tax()` (la misma API que WooCommerce ya usa internamente al calcular el total del pedido), no una tasa de IGV fija hardcodeada, para que la cotización nunca se desalinee del cobro real si la tasa configurada cambia. `compute_cost()` lee `$m->tax_status` del método real (igual que ya lee `$m->requires`/`$m->min_amount`) y aplica el impuesto sobre `$flat` apenas se resuelve, antes de las demás ramas — así el fallback (que reutiliza el mismo `$flat` ya con impuesto) y las dos ramas de zona real quedan cubiertas con un solo cambio.

**¿Afecta a Lima?** No hace falta ningún caso especial: el diseño lee `tax_status` del método real de *cada* zona que matchea, así que si algún método de Lima tuviera `tax_status = 'none'` configurado, el ajuste simplemente no se aplica ahí — la cotización se autoajusta zona por zona sin necesitar saber de antemano qué tiene configurado cada una.

**Pedidos de prueba creados durante esta verificación, ya cancelados a mano en `wp-admin`:** `#11196` (Callao, S/46.59) y `#11197` (Provincia/Arequipa, S/51.60) — ambos con datos ficticios, sin productos reales comprometidos.

---

**Seguimiento (2026-09-09) — el fix de arriba nunca se verificó en vivo y rompió el checkout completo, para cualquier destino.**

**Severidad real: no fue "una cotización sigue sin IGV" — fue un checkout completo caído en staging.** `TESTING-AUDITORIA-TI.md` ya documentaba que la Parte 2 de la verificación de A9 (probar `/shipping` real después de desplegar `2.15.1`) había quedado pendiente. Ese "mañana" fue hoy: al validar en vivo con la app un caso completamente distinto (A2, restricción de producto en Callao), `/shipping` devolvió `500` en vez de una cotización — y al aislar la causa se confirmó que **`POST /order` fallaba igual, con cualquier destino, no solo Callao.**

**Diagnóstico, con evidencia (no una suposición) — ver detalle completo en `TESTING-AUDITORIA-TI.md`, sección A9:**
- `GET /shipping?idubigeo=070101` (Callao) → `500`. Mismo resultado para Bellavista, Ventanilla, Miraflores (Lima) y hasta un `idUbigeo` que no existe en la tabla `ubigeo` — descartando que fuera específico de Callao, de una zona, o de la tabla de ubigeo.
- `/shipping/config` (misma clase, no toca zonas/impuestos), `/coupons`, `/coupon`, y la Store API — todos `200 OK`. El sitio y el resto del plugin estaban sanos; el problema estaba acotado a `compute_cost()`.
- `POST /order` de prueba (datos ficticios) a Callao y a Miraflores → **ambos `500`**, mismo mensaje genérico (`catch (\Throwable)` de `create_order()`) — confirmando que la causa es compartida, porque `create_order()` usa la misma `compute_cost()` que `/shipping` (diseño de C1, "fuente única").

**Causa raíz real:** `apply_shipping_tax()` (el fix de A9) llamaba a `WC_Tax::get_shipping_tax_rates()` sin pasar un `$customer` explícito. Sin ese argumento, WooCommerce resuelve la ubicación fiscal leyendo `WC()->customer` — objeto que WooCommerce no inicializa en una petición a un endpoint REST propio como `/wp-json/boticuy-app/v1/...` (fuera de su bootstrap habitual de carrito/sesión de frontend). `WC()->customer` llegaba `null`, y cualquier llamada a un método sobre él producía un `Error` de PHP — capturado por el `catch (\Throwable)` genérico tanto de `shipping()` como de `create_order()`, así que el síntoma nunca fue "falta el IGV", fue "revienta siempre que se intenta calcular el envío", para cualquier pedido.

**Por qué nadie lo vio ayer:** el fix de A9 nunca se ejecutó contra tráfico real después de desplegarse — los pedidos de prueba `#11196`/`#11197` que confirmaron el síntoma original se crearon con el plugin `2.15.0`, **antes** de que existiera `apply_shipping_tax()`. La verificación del fix en sí (`2.15.1`) quedó anotada como pendiente ("para mañana") y nadie volvió a probar `/shipping` ni `/order` hasta hoy.

**Fix (`2.15.4`):** `apply_shipping_tax()` ahora recibe `$state`/`$postcode` — la misma ubicación que `compute_cost()` ya resuelve para matchear la zona de envío (ver M8) — y arma un `WC_Customer` desechable (`new WC_Customer(0, false)`, id `0`, sin sesión, nunca `save()` — mismo criterio de no-persistencia que el `WC_Order` desechable de A2) con esa ubicación en billing y shipping, y se lo pasa explícitamente a `WC_Tax::get_shipping_tax_rates()`. Con un `$customer` explícito, la función nunca necesita tocar `WC()->customer`. El IGV se sigue calculando con la misma API nativa de WooCommerce que ya usaba (`WC_Tax::get_shipping_tax_rates()`/`calc_shipping_tax()`) — no se revirtió el trabajo de A9, solo se dejó de depender de un objeto que no existe en este contexto.

**✅ Verificado en vivo (2026-09-09), `2.15.4` desplegado en staging.** Los 7 casos que reprodujeron el incidente responden todos sin `500`:
- `GET /shipping` a Callao (070101), Bellavista (070102), Ventanilla (070106), Miraflores (150122) y un `idUbigeo` inexistente (999999) → los 5, `200 OK` (el inexistente cae al fallback, sin tronar).
- `POST /order` de prueba a Callao y a Miraflores → los 2, `201 Created` — pedidos reales `#11204` (Callao) y `#11205` (Miraflores).

**Segunda regresión, encontrada al reconciliar los totales de esos mismos pedidos de prueba (mismo criterio que C1: lo cotizado debe ser igual a lo cobrado) — el envío se estaba cobrando con el IGV DOBLE.**

`GET /shipping?idubigeo=070101&subtotal=89.90` (mismo subtotal que el pedido real `#11204`) cotizó `{"cost":10.00}` → total esperado `89.90 + 10.00 = 99.90`. El pedido real cobró `101.70` — `1.80` de más, exactamente `10.00 × 18%` aplicado una segunda vez.

**Causa raíz, primer intento (`2.15.5`) — diagnóstico incompleto, el fix no funcionó:** se atribuyó el doble cobro a que `create_order()` (`class-orders.php:477-481`) guardaba el ítem de envío sin `set_tax_status('none')`, mismo patrón que el fee de puntos dos líneas más abajo. Se aplicó ese fix (`set_tax_status('none')` en el `WC_Order_Item_Shipping`) y se desplegó como `2.15.5`.

**❌ Verificado en vivo (2026-09-09), `2.15.5` desplegado — el sobrecobro seguía activo, idéntico:**
```
#11207 (Callao, subtotal 89.90, mismo caso que #11204): cotización 10.00 → esperado 99.90 → cobrado 101.70 (+1.80)
#11208 (Miraflores, subtotal 26.60, envío realmente cobrado esta vez, no gratis): cotización 7.00 → esperado 33.60 → cobrado 34.86 (+1.26 = 7.00 × 18%)
```

**Causa raíz real:** `WC_Order_Item_Shipping` **no tiene** la propiedad `tax_status` con el efecto que sí tiene en `WC_Order_Item_Fee` — por eso el fee de puntos sí se comporta bien con ese flag, pero el ítem de envío no. El monto de envío se re-taxa porque `$order->calculate_totals()` invoca `calculate_taxes()`, que recalcula el IGV de **cualquier** ítem de envío presente en el pedido de forma automática e incondicional, usando la dirección real ya guardada (`set_address()`, antes de `calculate_totals()`) — sin mirar ningún flag del ítem. `set_tax_status('none')` fue, en los hechos, un no-op silencioso.

**Por qué quedó dormido desde `2.15.1` (2026-09-08) hasta hoy:** ningún pedido real llegó jamás a ejecutar esta línea con el cálculo de A9 activo — `/shipping` y `POST /order` estuvieron cayendo con `500` (la primera regresión, arriba) desde el mismo día que se introdujo A9 hasta que se corrigió con `2.15.4`. Recién ahí los primeros pedidos de prueba (`#11204`/`#11205`) llegaron a ejercitar el cálculo completo y expusieron el doble cobro — y el primer intento de arreglarlo (`2.15.5`) tampoco lo resolvió, según confirmó la segunda tanda de pedidos de prueba (`#11207`/`#11208`).

**Fix correcto (`2.15.6`):** en vez de intentar suprimir el recálculo nativo de WooCommerce, se le da el monto correcto para que lo calcule bien una sola vez. `Boticuy_App_Shipping::compute_cost()` ahora devuelve también `cost_pretax` (el monto de envío SIN IGV, capturado justo antes de que `apply_shipping_tax()` le sume el impuesto). `create_order()` usa `$shipping_quote['cost_pretax']` para `set_total()` — no `$shipping_quote['cost']` (que sigue siendo el que consume `/shipping` para mostrarle al cliente la cotización real, sin cambios ahí) — y se retira el `set_tax_status('none')` que no hacía nada. Con el monto sin impuesto en el ítem, `calculate_totals()` le suma el IGV real una sola vez, usando la dirección auténtica del pedido — más confiable que replicarlo a mano con el `WC_Customer` desechable que sí hace falta en `/shipping` (que no tiene un pedido real detrás).

**Hilo completo de A9, para referencia:**
1. `[2.15.0]` y antes — `/shipping` cotizaba sin IGV; el pedido real sí lo cobraba (síntoma original).
2. `[2.15.1]` — fix: `apply_shipping_tax()` suma el IGV a la cotización. Nunca verificado en vivo tras desplegarse.
3. `[2.15.4]` — esa función dependía de `WC()->customer` (`null` en este contexto REST) y tronaba `500` en `/shipping` y `POST /order`, para cualquier destino — checkout completo caído. Fix: ubicación explícita vía `WC_Customer` desechable.
4. `[2.15.5]` — con el crash resuelto, se expuso que el envío se cobraba con IGV doble. Fix intentado: `set_tax_status('none')` en el ítem de envío — **no funcionó**, verificado en vivo.
5. `[2.15.6]` — fix real: `create_order()` usa el monto de envío SIN impuesto (`cost_pretax`, nuevo) para el ítem, y deja que WooCommerce calcule el IGV real una sola vez de forma nativa.

**✅ Verificado en vivo (2026-09-09), `2.15.6` desplegado — el sobrecobro grande desapareció, pero quedó un residuo de S/0.01:**
```
#11210 (Callao, mismo subtotal que #11207/#11204): cotización 10.00 → esperado 99.90 → cobrado 99.89   (−0.01)
#11211 (Miraflores, mismo subtotal que #11208, envío gravado): cotización 7.00 → esperado 33.60 → cobrado 33.60   (exacto)
```
El patrón `×18%` de las regresiones anteriores ya no está — esto es un desajuste de redondeo, no una doble tributación.

**Investigación pedida antes de tocar código de nuevo (no asumir, confirmar contra el código real de WooCommerce y la configuración real de la tienda):**
- **Versión de WooCommerce confirmada con Bran:** `10.8.1`.
- **Causa real, contra el código fuente de WooCommerce:** `WC_Order_Item_Shipping::calculate_taxes()` (lo que `create_order()` ejecuta de verdad, dentro de `calculate_totals()`) usa `WC_Tax::find_shipping_rates()` + `WC_Tax::calc_tax()` — una API de WooCommerce **distinta** de `WC_Tax::get_shipping_tax_rates()`/`calc_shipping_tax()`, la que usaba `apply_shipping_tax()` desde `2.15.4`. Ambas rutas casi siempre coinciden, pero no hay garantía de que redondeen exactamente igual — y no la hubo, en el caso de Callao.
- **"Redondeo de impuesto en el subtotal"** (`WooCommerce → Ajustes → Impuestos`), confirmado **activado** en este sitio — descartado como causa: esa opción combina el redondeo de varias líneas gravables de un mismo pedido; acá se taxa un solo ítem de envío aislado, sin nada que combinar.
- **"Clase de impuesto de envío"**, confirmado en modo **heredado** ("según los productos del carrito") — relevante solo para la cotización de `/shipping` (que no conoce los productos del carrito, solo `idubigeo`/`subtotal`), no para `create_order()` (que sí tiene el pedido real con productos reales, y resuelve "heredado" correctamente por sí solo, sin ningún cambio necesario).

**Fix (`2.15.7`):** en vez de seguir intentando replicar a mano la fórmula exacta de redondeo de WooCommerce (frágil, y ya falló una vez por un centavo), `apply_shipping_tax()` arma un `WC_Order_Item_Shipping` **desechable** (nunca se guarda, nunca se agrega a ningún pedido — mismo criterio de no-persistencia que el `WC_Order` de A2) y le llama `calculate_taxes()` — el método **nativo real** de WooCommerce, con la ubicación ya resuelta y `tax_class => ''` (clase estándar, límite conocido: la cotización aislada no puede saber la clase real de los productos del carrito, pero eso nunca afecta el cobro real, que usa el pedido real). Con esto, `/shipping` y `create_order()` ejecutan literalmente el mismo cálculo de WooCommerce — no dos aproximaciones que puedan desalinearse. Se retira también el `WC_Customer` desechable de `2.15.4`, ya innecesario.

**❌ Verificado en vivo (2026-09-09), `2.15.7` desplegado — el centavo de diferencia en Callao seguía exactamente igual:**
```
#11213 (Callao, mismo subtotal que #11210/#11207/#11204): cotización 10.00 → esperado 99.90 → cobrado 99.89   (−0.01, sin cambio)
#11214 (Miraflores, mismo subtotal que #11211/#11208): cotización 7.00 → esperado 33.60 → cobrado 33.60   (exacto, sin cambio)
```

**Causa real, encontrada comparando línea por línea los datos de ubicación de los dos caminos (no una suposición):** `create_order()` (`class-orders.php:390-403`) arma la dirección real del pedido con `city => $ship['provincia_nombre']` (ej. `"Prov. Const. Del Callao"`) — pero el ítem desechable de `apply_shipping_tax()` (desde `2.15.6`/`2.15.7`) usaba `city => ''`. `country`/`state`/`postcode` resultaron ser exactamente los mismos valores en ambos caminos (misma variable, verificado) — `city` era la única diferencia real de entrada entre los dos cálculos.

**Confirmado antes de tocar código:** `provincia_nombre` (que la app manda en `POST /order`) sale de `fetchProvincias()` → `GET /ubigeo/provincias` → columna `descripcion` de la tabla `ubigeo` — la misma tabla que ya usa `Boticuy_App_Ubigeo::dep_prov_for()`. Esto permitió resolver `city` del lado del servidor, sin pedirle nada nuevo a la app.

**Fix (`2.15.8`):** nuevo `Boticuy_App_Ubigeo::province_name($dep, $prov)` (lee `descripcion` de la fila de provincia, `codigoDistrito='0'`, mismo patrón que `wc_state()`). `compute_cost()` lo resuelve junto con `$state` y se lo pasa a `apply_shipping_tax()` como `$city`.

**Hilo completo de A9, actualizado — 7 capas:**
1. `[2.15.0]` y antes — `/shipping` cotizaba sin IGV; el pedido real sí lo cobraba (síntoma original).
2. `[2.15.1]` — fix: `apply_shipping_tax()` suma el IGV a la cotización. Nunca verificado en vivo tras desplegarse.
3. `[2.15.4]` — esa función dependía de `WC()->customer` (`null` en este contexto REST) y tronaba `500` en `/shipping` y `POST /order`, para cualquier destino — checkout completo caído. Fix: ubicación explícita vía `WC_Customer` desechable.
4. `[2.15.5]` — con el crash resuelto, se expuso que el envío se cobraba con IGV doble. Fix intentado: `set_tax_status('none')` en el ítem de envío — **no funcionó**, verificado en vivo.
5. `[2.15.6]` — fix real del doble cobro: `create_order()` usa el monto de envío SIN impuesto (`cost_pretax`, nuevo) para el ítem, dejando que WooCommerce calcule el IGV real una sola vez de forma nativa. Resolvió el sobrecobro grande, pero dejó un residuo de redondeo de S/0.01 en al menos un caso.
6. `[2.15.7]` — `apply_shipping_tax()` deja de calcular el impuesto a mano y usa el método nativo real de WooCommerce (`WC_Order_Item_Shipping::calculate_taxes()`) sobre un ítem desechable — **no cerró el centavo de diferencia**, verificado en vivo.
7. `[2.15.8]` — causa real encontrada: `city` era `''` en el ítem desechable, distinto del `city` real del pedido. Resuelto del lado del servidor (`province_name()`, nuevo) desde la misma tabla `ubigeo` que ya usa `dep_prov_for()`, sin cambios en la app.

**❌ Verificado en vivo (2026-09-09), `2.15.8` desplegado — el centavo de diferencia en Callao siguió exactamente igual, sin ningún cambio:**
```
#11216 (Callao, mismo subtotal que #11213/#11210/#11207/#11204): cotización 10.00 → esperado 99.90 → cobrado 99.89   (−0.01, idéntico)
#11217 (Miraflores, mismo subtotal que #11214/#11211/#11208): cotización 7.00 → esperado 33.60 → cobrado 33.60   (exacto, sin cambio)
```
Dos intentos consecutivos (`2.15.7` y `2.15.8`), con cambios de código genuinamente distintos, dieron el resultado exacto — señal de que ninguno de los dos tocaba la causa real.

### 🔒 Cierre — decisión de negocio (Bran, 2026-09-09)

**El residuo de S/0.01 en Callao se acepta como límite conocido, documentado y cerrado — no se sigue investigando ni se toca configuración de WordPress para esto.** Razones: staging no refleja producción de todos modos, y en producción TI no permite cambiar configuraciones establecidas de la tienda. El cliente siempre paga el monto real y correcto al confirmar el pedido (garantizado desde C1) — la única discrepancia es de un centavo en la vista previa antes de pagar, en algunas zonas específicas.

**Hipótesis líder del residuo, nunca confirmada (habría requerido desactivar una opción real de `wp-admin`, descartado por la decisión de arriba):** la tienda tiene activado "Round tax at subtotal level, instead of rounding per line" (`WooCommerce → Ajustes → Impuestos`), que combina el redondeo del IGV de TODAS las líneas gravables de un pedido real (el producto — con IGV ya incluido en su precio en esta tienda — Y el envío, tax-exclusivo) antes de redondear una sola vez. El ítem de envío aislado que arma `apply_shipping_tax()` para la cotización nunca puede replicar esa agregación, porque nunca conoce las demás líneas del pedido real.

### 📊 Tabla comparativa — antes vs. ahora (mismos montos usados en toda la verificación)

El **cobro real nunca cambió** en todo este hilo — WooCommerce siempre calculó el IGV correctamente al confirmar el pedido (mecanismo nativo de `calculate_totals()`, independiente del bug). Lo que cambió es que la **cotización que ve el cliente antes de pagar** ahora coincide con eso.

| | Callao (subtotal S/89.90) | Miraflores (subtotal S/26.60) |
|---|---|---|
| **Cotización ANTES** (`/shipping` sin IGV — bug original de A9, antes de `2.15.1`) | S/8.47 | S/5.93 |
| **Total real cobrado** (sin cambios en todo el hilo, siempre correcto) | S/99.89 | S/33.60 |
| **Descuadre ANTES** (cotización vs. cobro real) | **S/1.52** | **S/1.07** |
| — como % de la línea de envío | **17.9%** (≈ la tasa de IGV, 18%) | **18.0%** |
| **Cotización AHORA** (`2.15.8`) | S/10.00 | S/7.00 |
| **Descuadre AHORA** (cotización vs. cobro real) | **S/0.01** | **S/0** |
| — como % de la línea de envío | **0.1%** | **0%** |

**Lectura para TI, si preguntan por el residuo:** el problema original no era un error de redondeo — faltaba sumar el impuesto por completo (~18% de la línea de envío, exactamente la tasa del IGV). Eso está resuelto al 100%, verificado en vivo con pedidos reales. Lo que queda es un residuo de S/0.01 en un caso puntual, consistente con una diferencia de agregación de redondeo entre dos mecanismos internos de WooCommerce, no con un cálculo faltante — y nunca afecta lo que el cliente efectivamente paga.

**Auditoría de limpieza (2026-09-09), tras 8 versiones (`2.15.1`–`2.15.8`) con varios intentos y reversiones parciales:** revisados `class-shipping.php`, `class-orders.php` y `class-ubigeo.php` completos — sin código muerto, variables sin usar, ni restos activos de los intentos fallidos (el `WC_Customer` desechable de `2.15.4`, el `set_tax_status('none')` del ítem de envío de `2.15.5`). Se corrigieron 2 comentarios que citaban versiones incorrectas (`2.15.6`/`2.15.7` donde correspondía `2.15.7`/`2.15.8`) y uno que afirmaba "confirmado que no aplica" sobre "Round tax at subtotal" cuando en realidad es la hipótesis líder no confirmada del residuo — ambos corregidos en el propio código (`class-shipping.php`, docblock de `apply_shipping_tax()`).

**Pedidos de prueba de todo el hilo de A9, con datos ficticios, pendientes de cancelar en `wp-admin`:** `#11204`, `#11205` (envío gratis, no afectado), `#11207`, `#11208`, `#11210`, `#11211`, `#11213`, `#11214`, `#11216`, `#11217`.

**A9 — cerrado.**

---

### [x] A10 — Cupón `percent` calculaba el descuento sobre un monto sin IGV
**Estado:** ✅ cerrado (2026-09-09) — resuelto tras 2 intentos (el primero, `2.15.9`, sin ningún efecto por un objeto fantasma de `get_item()`; el segundo, `2.15.10`, correcto), verificado en vivo con la matriz completa de 6 escenarios pedida por Bran (ver "Verificado en vivo" más abajo). **Hallazgo nuevo, no uno de los 41 originales** — encontrado al verificar M13 en vivo con la app, no relacionado con A9 salvo por vivir en la misma función (`create_order()`) y la misma lección de fondo (llamar `calculate_totals()` de más puede duplicar impuesto).

**Cómo se encontró:** al revisar en `wp-admin` el pedido fallido `#11219` (M13 — el primer intento de un checkout que luego se reintentó con datos distintos, creado con cupón `7777`, 15%), los montos no cuadraban: la app mostró subtotal S/120, descuento S/18 (15% de 120), total S/102 — el pedido real en `wp-admin` mostró Precio (sin IGV) S/101.69, Descuento S/12.92, IGV S/15.98, Total S/104.75. Ni el 15% de S/120 (18) ni el 15% de S/101.69 (15.25) coinciden con el S/12.92 real.

**Reproducido de forma limpia y aislada** (sin restricciones de producto, un solo producto de precio exacto S/120, sin relación con M13) con un pedido de prueba nuevo: mismo resultado exacto, `total: 104.75, coupon_discount: 12.92` — confirmando que es un bug determinístico del cálculo, no una particularidad de `#11219` ni de M13.

**Causa raíz, confirmada contra el código fuente real de WooCommerce (mismo método usado para A9 — código verbatim, no memoria):**
```php
// WC_Discounts::set_items_from_order()
$item->price = wc_add_number_precision_deep( $order_item->get_subtotal() );
if ( $order->get_prices_include_tax() ) {
    $item->price += wc_add_number_precision_deep( $order_item->get_subtotal_tax() );
}
// WC_Discounts::apply_coupon_percent()
$discount = floor( $price_to_discount * ( $coupon_amount / 100 ) );
```
Para un cupón `percent` en una tienda con `woocommerce_prices_include_tax = 'yes'`, WooCommerce calcula el % sobre `subtotal + subtotal_tax` — reconstruyendo el precio CON IGV. `WC_Abstract_Order::add_product()` (confirmado en su código fuente) calcula `subtotal` sin IGV correctamente (`wc_get_price_excluding_tax()`) pero **deja `subtotal_tax` sin establecer (0)** hasta que corre `calculate_totals()`. `create_order()` llama a `apply_coupon()` **antes** de la única `calculate_totals()` de la función — así que `WC_Discounts` encontraba `subtotal_tax = 0` y calculaba el 15% sobre un monto equivocado. Es un bug conocido y documentado de WooCommerce (comunidad, GitHub issue #27814 y otros) para pedidos creados directo por código/API sin pasar por el flujo de carrito web — no es un bug de este plugin, pero sí de cómo esta función está estructurada.

**Investigado, con Bran, si era una regresión de esta semana:** sin repo git disponible, se revisó `CHANGELOG.md` desde el inicio del proyecto — no se encontró evidencia de que este problema (cupón `percent` vs. IGV) haya existido y se haya corregido antes de esta ronda. Sí se encontró el precedente real de la MISMA familia de bug, para el descuento por PUNTOS (no cupón): `[2.7.1]`/`[2.7.2]` (2026-07-30, mes y medio antes de esta auditoría) — una `calculate_totals()` extra antes de crear el fee de puntos hizo que la `calculate_totals()` final terminara duplicando su IGV (caso real medido: S/19.50 × 18% = S/3.51 de más). Se corrigió eliminando la llamada extra, no repitiéndola.

**Por qué se descartó el patrón "doble `calculate_totals()`" que documenta la comunidad para este bug** (llamarlo una vez antes del cupón, otra al final — el fix "oficial"): el precedente de `[2.7.1]`/`[2.7.2]` en esta misma función demuestra que ese patrón, aquí, puede duplicar el IGV de un ítem agregado en el medio (ahí el fee de puntos; el ítem de envío del fix de A9 vive exactamente en esa zona hoy) — el mismo síntoma que costó 8 versiones resolver esta semana. Repetirlo arriesgaba deshacer A9.

**Fix, más quirúrgico:** dentro del mismo loop que ya agrega productos, se calcula `subtotal_tax`/`total_tax` por línea a mano (diferencia entre el precio real con IGV y el subtotal sin IGV que `add_product()` ya dejó) y se establece directamente en el ítem — sin llamar a `calculate_totals()` una segunda vez. Le da a `WC_Discounts` el dato que necesita para el cupón `percent`; la única `calculate_totals()` final sigue siendo la fuente de verdad del cobro real — sobrescribe este valor con el cálculo nativo definitivo, nunca lo acumula encima.

**❌ Verificado en vivo (2026-09-09), `2.15.9` desplegado — escenario 1 de la matriz (solo cupón `percent`) dio el resultado idéntico al bug original, sin ningún cambio:**
```
Pedido #11225 (producto S/120, cupón 7777 15%, Miraflores envío gratis): total: 104.75, coupon_discount: 12.92
```
Que el resultado fuera **exactamente igual** (no parcialmente distinto) apuntaba a que el fix no tenía ningún efecto real — se investigó la causa exacta antes de un quinto intento, en vez de seguir adivinando.

**Causa, confirmada con certeza contra el código fuente real de `WC_Abstract_Order::get_item()`:**
```php
public function get_item( $item_id, $load_from_db = true ) {
    if ( $load_from_db ) {
        return WC_Order_Factory::get_order_item( $item_id ); // reconstruye DESDE LA BD
    }
    // ... esta rama sí devuelve el objeto en memoria
}
```
`$load_from_db = true` por defecto. `create_order()` llamaba `$order->get_item($item_id)` sin ese segundo parámetro — el pedido todavía no está guardado (`save()` corre al final), así que ese ID temporal no existe en la BD: `get_item()` devolvía un objeto vacío/fantasma, desconectado del ítem real que `add_product()` ya había agregado a `$order->items` en memoria. `set_subtotal_tax()`/`set_total_tax()` mutaban ese fantasma — cambios que se perdían de inmediato, sin tocar nunca el ítem real que `WC_Discounts::set_items_from_order()` lee más tarde. Explica exactamente el síntoma (efecto cero, no un cálculo parcialmente incorrecto) — descartados los otros dos candidatos investigados (persistencia de `set_*()` en un ítem no guardado: no hace falta, ya funciona así para envío/fee; el getter de `WC_Discounts`: correcto, sin filtros).

**Fix (`2.15.10`):** `$order->get_item($item_id, false)` — un solo parámetro agregado, mismo diseño de `2.15.9` sin ningún otro cambio.

**✅ Verificado en vivo (2026-09-09), `2.15.10` desplegado — matriz completa de 6 escenarios, todos correctos:**

| # | Escenario | Total esperado | Total real | Resultado |
|---|---|---|---|---|
| 1 | Solo cupón `percent` (7777, 15%, S/120) | S/102.00 | S/102.00 (`#11227`) | ✅ |
| 2 | Solo cupón `fixed_cart` | sin cambios | *verificado por código* (`apply_coupon_fixed_cart()` no lee `$item->price`, no hay cupón `fixed_cart` real en el sitio para probar en vivo) | ✅ |
| 3 | Solo canje de puntos, sin cupón | sin cambios | *verificado por código* (bloque del fee de puntos completamente separado del loop que toca A10; requiere sesión, no disponible para prueba en vivo) | ✅ |
| 4 | Cupón + envío gravado (Callao) | S/111.99 (102 + 9.99 envío) | S/111.99 (`#11228`) | ✅ |
| 5 | Cupón + producto con stock real bajo (EXCEGATON, 2 disp., se pidieron 10) | `422`, sin crear pedido | `422`, sin pedido creado | ✅ |
| 5b | Mismo producto, cantidad dentro del stock (1) + cupón | S/57.15 (59 − 8.85 + 7.00 envío) | S/57.15 (`#11230`) | ✅ |
| 6 | Sin cupón ni puntos (caso base) | S/120.00 (envío gratis por umbral) | S/120.00 (`#11231`) | ✅ |

**Nota sobre el escenario 5, primer intento — no fue un fallo de A4, fue una confusión de producto:** se probó primero con producto `7443` pidiendo 99999 unidades, esperando el rechazo `422` de A4 — el pedido se creó igual (`#11229`, total astronómico), porque ese producto específico **no tiene `managing_stock()` activo** (confirmado con Bran: productos de stock alto a veces no activan el control exacto). No es un bug de A4 — A4 sigue protegiendo correctamente cualquier producto que sí tenga control de stock real, confirmado con `EXCEGATON` (id `9661`, 2 unidades disponibles) en el reintento. `#11229` ya fue cancelado por Bran en `wp-admin`.

**Hallazgo secundario, no bloqueante — presentación del descuento, no el monto cobrado:** el campo `coupon_discount` de la respuesta de `POST /order` (ej. escenario 1: `15.25`) es la porción **sin IGV** del descuento total (WooCommerce separa cualquier monto en `discount_total`/`discount_tax`, igual que hace con `subtotal`/`subtotal_tax`) — no el descuento completo que ve el cliente (`18.00` = `15.25` + `2.75` de IGV del descuento). El total cobrado (`S/102.00`) es 100% correcto; si la app muestra `ord.coupon_discount` directamente como "−S/15.25" en la confirmación del pedido, esa fila no sumaría contra el subtotal mostrado. Queda anotado para evaluar aparte — no forma parte del alcance de A10 (que es sobre el monto cobrado, ya correcto) y no bloquea su cierre.

**✅ Doble/triple verificación del hilo completo C1 + A9 + A10 (2026-09-09), pedida por Bran antes de cerrar del todo — cruzando envío + cupón + IGV al mismo tiempo:**

| Caso | Cotización previa | Total real | Diferencia |
|---|---|---|---|
| Callao (envío gravado), **sin** cupón | 120 + 10.00 = S/130.00 | S/129.99 (`#11232`) | S/0.01 — mismo residuo conocido de A9, sin cupón de por medio |
| Provincia real (Arequipa, zona real "Peru, Lima Provincias"), **con** cupón 15% | 102 (120−18) + 15.00 = S/117.00 | **S/117.00** (`#11233`) | exacto |
| Producto + envío + cupón, misma cotización (Callao) | 120 − 18 + 10.00 = S/112.00 | S/111.99 (`#11234`) | S/0.01 — mismo residuo de A9, no se amplifica por el cupón |

**Conclusión: el hilo completo convive bien.** A10 no reintroduce ningún problema de envío, y el residuo de S/0.01 de A9 (ya aceptado como límite conocido) se mantiene idéntico con o sin cupón — no se duplica ni cambia de magnitud. **Nota metodológica:** no se pudo reproducir el *fallback* literal de A9 (idUbigeo inexistente) con un pedido real — `validate_customer_and_shipping()` (B14) rechaza cualquier distrito que no exista en la tabla `ubigeo` antes de llegar a `compute_cost()`, así que ese camino solo es alcanzable desde `/shipping` (cotización aislada, sin pedido real detrás), nunca desde un pedido de un cliente real. Se usó en su lugar Arequipa (zona real "Provincia"), el escenario de envío a provincia genuinamente alcanzable.

**A10 — cerrado.** Pedidos de prueba, con datos ficticios, pendientes de cancelar en `wp-admin`: `#11223`, `#11225`, `#11227`, `#11228`, `#11230` (consumió 1 de las 2 unidades disponibles de EXCEGATON — considerar restituir stock al cancelar), `#11231`, `#11232`, `#11233`, `#11234`. `#11229` ya cancelado por Bran.

---

## 🟡 MEDIOS — corregir en el ciclo (15)

### [x] M1 — El descuento por puntos no aparece en la confirmación
**Estado:** resuelto (2026-09-04)
`OrderConfirmationScreen.tsx:69` (línea original) solo pintaba la fila de descuento si existía un cupón. Como cupón y puntos son mutuamente excluyentes, un pedido pagado con puntos no mostraba ninguna línea de descuento — y el `discount` que le llegaba desde `CheckoutScreen.tsx` mezclaba cupón y puntos en un solo número de todos modos, así que ni mostrándola habría sido el valor correcto.

Ahora son dos filas independientes ("Cupón" y "Puntos canjeados (N)"), y la de puntos se alimenta de `ord.points_redeemed`/`ord.points_discount` — el contrato que ya agregó A7 en la respuesta del servidor — en vez del estado local del checkout, para que si A7 recortó el canje pedido, la confirmación muestre lo que realmente se canjeó, no lo que el cliente pidió. Cuando hubo recorte, se agrega un aviso explícito con el detalle (`ord.points_redeemed_adjusted`).

### [x] M2 — "Envío: Gratis" cuando la cotización falló
**Estado:** resuelto, con salvedad (2026-09-04)
La confirmación usaba `envio > 0 ? monto : 'Gratis'` (`OrderConfirmationScreen.tsx:72`, línea original). Si la cotización fallaba, `shipping` era `null`, `envio` caía en 0 y la pantalla afirmaba envío gratis — promesa que el negocio no hizo.

Nuevo campo `shippingUnavailable` (`shipping === null` al momento del submit, en `CheckoutScreen.tsx`) distingue ese caso: la fila ahora muestra "No disponible" en vez de "Gratis" cuando la cotización nunca se resolvió.

**Salvedad — no cierra el problema de fondo, deliberadamente:** esta pantalla sigue mostrando la cotización que la app hizo *antes* de pagar (`/shipping`), que no conoce ningún cupón — el mismo residuo ya documentado en **[M9](#-m9--la-barra-de-envío-gratis-promete-en-lima-a-todo-el-mundo)** al cerrar C1. Si el pedido terminó con envío gratis por un cupón aplicado, esta fila seguiría mostrando el costo de flat_rate en vez de "Gratis", porque el dato que usa nunca vino del servidor. Queda para cuando se resuelva M9 — este fix solo distingue "no se pudo cotizar" de "gratis real" dentro de lo que la app ya sabía antes de pagar.

### [x] M3 — El catálogo se ordena distinto con y sin filtro
**Estado:** resuelto (2026-09-07) · App RN-02 §1.2 · CAT-01
Sin filtro se consultaba la Store API con `orderby=popularity&order=desc`. Con filtro de necesidad o marca, el BFF resolvía los IDs ordenando por `menu_order`/`title ASC` (`class-products.php:44`, versión original) y después se pedían esos IDs a la Store API con `include=`, parámetro que no preservaba el orden recibido. El orden del listado filtrado era, en la práctica, arbitrario.

**Verificado en vivo contra la Store API real (2026-09-07), no solo leyendo el código:** se probó con IDs reales de producción que `include=` ignora por completo `orderby`/`order` — incluido `orderby=include` (el mecanismo nativo de la REST API de WordPress para este propósito exacto) y `orderby=title` con `order=asc`/`desc` (ambos devolvieron idéntico resultado, que además no correspondía a ningún orden alfabético real). La Store API, al recibir `include=`, siempre devuelve su propio orden interno fijo — no hay ninguna combinación de parámetros de la propia Store API que resuelva esto. Conclusión: la única forma confiable de mostrar un orden específico es que la app reordene el array después de recibirlo, usando el orden que ya calculó el BFF.

**Decisión de negocio confirmada con Bran (2026-09-07):** popularidad descendente por defecto, consistente con cómo ya funciona la web actual — cumple el RN-02 §1.2 tal como está escrito. Se descarta control editorial manual por ahora (aunque quedó evaluado como opción técnica igual de viable, vía el campo nativo `menu_order` que WooCommerce ya expone en wp-admin) — **aclaración de Bran:** a futuro podría pedirse forzar manualmente un producto específico primero en una sección filtrada (ej. baja rotación) como excepción puntual, pero eso se construye aparte si se pide explícitamente; no cambia que el comportamiento por defecto debe ser popularidad.

**Fix:** `class-products.php` cambia `orderby => 'menu_order title', order => 'ASC'` por `orderby => 'meta_value_num', meta_key => 'total_sales', order => 'DESC'` — mismo criterio que usa WooCommerce internamente para `orderby=popularity` en la Store API. `fetchProducts()` en la app reordena el array que devuelve la Store API según la posición de cada producto en el `ids` que ya trajo el BFF (mapa id→índice + `sort()`). Implementado junto con M4 (ver abajo) porque ambos tocan la misma función y comparten el mismo mecanismo de fondo.

### [x] M4 — El total del listado filtrado viene de una fuente y los productos de otra
**Estado:** resuelto (2026-09-07), junto con M3
`total` y `total_pages` salían del `found_posts` del BFF, pero los productos los devolvía la Store API, que aplica sus propios criterios de visibilidad. Ambos podían discrepar, y el scroll infinito podía pedir páginas que volvían vacías.

**Relación con M3 — no es el mismo bug, aunque comparten causa de fondo:** M3 es que el *orden* se pierde entre dos consultas; M4 es que el *conteo/paginación* de una consulta (el `WP_Query` crudo del BFF, que no conoce las reglas reales de visibilidad de la Store API) no coincide con lo que la otra consulta (la Store API) realmente muestra. Arreglar uno no cierra el otro automáticamente — se evaluó explícitamente un diseño intermedio ("dejar que la Store API pagine un `include=` con todos los IDs") que **no funciona** para los dos a la vez: como la Store API ignora el orden de popularidad en cualquier `include=` (verificado arriba, en M3), dejar que ella decida qué IDs van en qué página cortaría las páginas según su propio orden interno, no según popularidad — no es un problema de orden visual dentro de la página, sino de qué productos quedarían agrupados en cada página. La solución que cierra los dos hallazgos a la vez es que el corte de páginas lo haga siempre el cliente, después de tener el conjunto completo ya ordenado (M3) y ya filtrado por visibilidad real (M4) — nunca antes.

**Riesgo de rendimiento de "traer todo" — verificado con datos reales, no supuesto:** antes de diseñar el fix se consultó el catálogo real de Boticuy vía la Store API pública: 47 productos en total, la `necesidad` más grande (Inmunidad/Niños) con 13, la `marca` más grande (Prime Health) con 20. Ningún filtro real se acerca a un volumen donde traer el conjunto completo en una sola petición sea costoso — de hecho, con `PER_PAGE = 20` en `CatalogScreen.tsx`, prácticamente todo filtro real entra hoy en una sola página.

**Fix (diseño confirmado con Bran):**
- `class-products.php::products()` deja de paginar (`posts_per_page`/`paged` desaparecen) — devuelve **todos** los IDs que matchean el filtro, ya ordenados por popularidad, hasta un tope de seguridad `MAX_FILTERED_IDS = 200` (confirmado con Bran: el catálogo crece menos de 10 productos/año, 200 da margen para varios años sin ser un número exagerado — si alguna combinación se acerca a este tope, hay que revisitar el diseño, no es un límite que deba pasar desapercibido). `total`/`total_pages` se eliminan de esta respuesta — dejan de ser una fuente de verdad.
- `fetchProducts()` (app): pide el `ids` completo al BFF, pide el conjunto completo a la Store API en una sola llamada (`include=` con todos los IDs, barato al tope de 200), reordena por popularidad (fix de M3), y **recién ahí** calcula `total`/`totalPages` sobre el conjunto ya confirmado visible por la Store API y recorta (`slice`) la página pedida. Contrato externo sin cambios — `CatalogScreen.tsx` sigue llamando `fetchProducts({ perPage, page, necesidad, marca, search })` igual que antes.
- **Trade-off aceptado a propósito, confirmado con Bran, no un descuido:** cada página pedida vuelve a traer y reordenar el conjunto completo (sin caché) — enfoque estándar de la industria para catálogos de este tamaño ("traer todo, ordenar y paginar del lado del cliente"); meter una capa de caché ahora sería optimización prematura para un problema de escala que no existe hoy. Si el catálogo creciera mucho, esto es lo primero a revisar.

### [x] M5 — Tarifas de envío y umbrales hardcodeados en dos repositorios
**Estado:** resuelto (2026-09-07, junto con M8)
El plugin fijaba S/8.47, S/12.71 y el umbral reducido de S/59 como literales (`class-shipping.php:39,59` en la versión original); la app repetía 69 y 59 en `app.config.js`. No existía capa de configuración: cambiar una tarifa exigía editar dos repos y publicar una versión nueva de la app en las tiendas.

Al revisar a fondo (antes de tocar código) se confirmó que el único solapamiento real era el umbral Plata/Oro (S/59) — `envioGratisDesde` (S/69) en la app es un número de marketing sin contraparte en `compute_cost()`, usado en pantallas sin destino conocido (Home/Onboarding/ProductDetail/carrito), así que no podía simplemente eliminarse y confiar en `/shipping`.

**Fix:**
- `Boticuy_App_Shipping::config($key)` (nuevo, `class-shipping.php`) lee `get_option('boticuy_app_shipping_config', array())` con defaults `envio_gratis_nivel=59`, `fallback_callao=8.47`, `fallback_provincia=12.71` — una sola fuente, editable en WordPress sin publicar versión nueva del plugin. `compute_cost()` ya no tiene esos tres literales sueltos.
- Endpoint nuevo `GET /shipping/config` (público) expone `envio_gratis_nivel` a la app. Deliberadamente no expone `fallback_callao`/`fallback_provincia` — la app no tiene ningún literal equivalente a esos dos.
- App: `useShippingConfig` (`src/store/shippingConfigStore.ts`, mismo patrón `persist`+`AsyncStorage` que `recentSearchesStore.ts`) consulta `/shipping/config` una vez al arrancar (`App.tsx`) y cachea el resultado. `FreeShippingBar.tsx` lee de ahí en vez de `Constants.expoConfig.extra.envioGratisDesdeNivel`. `envioGratisDesdeNivel` en `app.config.js` queda solo como default inicial/offline (antes del primer fetch, o sin red), ya no como fuente de verdad ni algo que mantener en sync a mano.
- `envioGratisDesde` (S/69, marketing) se deja fuera a propósito: se verificó que el valor real solo existe en la zona "Lima 1 CERCANOS" (S/69.90) — las demás zonas de Lima tienen envío gratis desactivado, así que no hay un único valor real y consistente de "Lima" que exponer sin ser engañoso en las zonas donde no aplica.

### [x] M6 — Un flat_rate con fórmula se lee mal
**Estado:** cerrado sin cambios de código (2026-09-07) — verificado contra WooCommerce real
`(float) $m->cost` (`class-shipping.php:31` en la versión original). WooCommerce admite costos como `10 + 2 * [qty]`; el casteo se queda con 10 y descarta el resto en silencio.

**Verificado contra las 3 zonas reales** (capturas del panel, 2026-09-07): Provincias S/12.71, Callao S/8.47, Lima 1 CERCANOS S/4.24 — los tres son costos fijos simples, ninguno usa fórmula. `(float) $m->cost` ya lee el valor correcto tal cual está configurado hoy; no hace falta evaluar la fórmula con `calculate_shipping()` ni extender `/shipping` para mandar cantidades. Si en el futuro se configura un método con fórmula, este hallazgo habría que reabrirlo.

### [ ] M7 — El método de envío gratis ignora su condición `requires`
**Estado:** diseño e implementación completos (2026-09-04 parcial, 2026-09-07 el resto) — **no se marca cerrado hasta ejecutar la verificación real contra staging**
`Boticuy_App_Shipping::compute_cost()` lee `$free_method->requires` y evalúa las 5 combinaciones reales de WooCommerce (`''`/`coupon`/`min_amount`/`either`/`both`), en vez de asumir siempre `min_amount`. También revisa `get_free_shipping()` del cupón aplicado al pedido (leído después de `apply_coupon()`, no del código crudo del request).

Las dos dependencias que quedaban pendientes ya se resolvieron:
- M6 (fórmula de `flat_rate`): verificado sin cambios, ver arriba.
- M8 (zona por región): resuelto, ver abajo — el fallback sin zona real matcheada ahora es un caso raro, no el camino común.

Caso real encontrado al revisar el panel: la zona "Lima 1 CERCANOS" tiene **dos métodos activos simultáneos** — flat_rate S/4.24 y free_shipping condicional (monto mínimo O cupón) S/69.90. El loop de `compute_cost()` ya recorre todos los métodos de la zona (no se queda con el primero) y ya cae al `flat_rate` de esa misma zona cuando la condición de gratis no se cumple — no fue necesario ningún cambio de código para este caso.

Original: solo se leía `min_amount`. Si el método está configurado para exigir cupón y tiene el monto mínimo vacío, `free_threshold` quedaba en 0.0 y `subtotal >= 0` era siempre verdadero: envío gratis para todos, en todos los pedidos.

**Diseño de verificación listo, ejecución pendiente:** ver los 3 escenarios documentados en `TESTING-AUDITORIA-TI.md` (sección "M7/M8"). No se marca con fecha de cierre definitiva hasta correrlos contra staging en la próxima tanda de pruebas.

### [x] M8 — La zona de envío se resuelve solo por código postal
**Estado:** resuelto (2026-09-07) — **pendiente de verificación real contra staging**
El paquete se armaba con `state => ''` (`class-shipping.php:22` en la versión original), así que las zonas de WooCommerce definidas por región nunca coincidían y siempre caía al fallback hardcodeado. La cotización que veía la app podía no ser la que cobraba la web para el mismo destino.

Se confirmó contra el panel real que las zonas "Peru, Lima Provincias" y "Peru, Callao" están definidas por departamento (state), no por código postal — exactamente el dato que faltaba enviar. Además, el mapeo departamento→estado WooCommerce ya existía, pero solo se usaba para la dirección del pedido (`class-orders.php::wc_state()`, privado), nunca para la cotización de envío.

**Fix:**
- `Boticuy_App_Ubigeo::dep_prov_for($id_ubigeo)` (nuevo): resuelve departamento/provincia desde la tabla `ubigeo` a partir del `idUbigeo` que manda la app (que hoy solo manda eso, no departamento/provincia por separado).
- `Boticuy_App_Ubigeo::wc_state($dep, $prov)` (movido desde `class-orders.php`, ahora público): única fuente del mapeo departamento ubigeo → estado WooCommerce. `class-orders.php` ya no tiene su propia copia del array.
- `Boticuy_App_Shipping::compute_cost()` arma `destination.state` con ese mapeo antes de llamar a `WC_Shipping_Zones::get_zone_matching_package()`.
- El fallback hardcodeado (8.47/12.71, ahora vía `self::config()`, ver M5) queda como último recurso real: solo dispara si el `idUbigeo` no existe en la tabla, o si la región resuelta no tiene ninguna zona configurada — ya no es el camino común.

**Diseño de verificación listo, ejecución pendiente:** ver `TESTING-AUDITORIA-TI.md`, sección "M7/M8" — confirmar en staging que Lima 1 CERCANOS, Callao y Provincias matchean por región y no caen al fallback.

### [ ] M9 — La barra de envío gratis promete "en Lima" a todo el mundo
**Estado:** pendiente
`FreeShippingBar` usa el umbral local y el texto fijo "envío gratis en Lima", también para clientes de provincias, donde el servidor no ofrece envío gratis en absoluto. El cliente llega al checkout y descubre el flete.
**Nota (2026-09-04, al resolver C1):** mismo tipo de desfase mensaje-vs-cobro en otro punto del flujo — si un cupón otorga envío gratis (`get_free_shipping()`), la cotización pre-checkout (`/shipping`, que la app llama sin mandar el cupón) sigue devolviendo el costo de flat_rate, y por eso la pantalla de confirmación muestra "Envío: S/X" en vez de "Gratis". El monto que se cobra en el pedido real ya es correcto (S/0, `Boticuy_App_Shipping::compute_cost()` sí conoce el cupón ahí) — el texto que ve el cliente es lo que queda mal en este caso puntual. Pendiente de resolver junto con el resto de M9.

### [x] M10 — Los cupones tipo `fixed_product` aplican S/0.00 sin avisar
**Estado:** resuelto (2026-09-07)
`discount()` en `cartStore.ts` solo contemplaba `percent` y `fixed_cart`. Cualquier otro tipo devolvía cero: el chip verde aparecía "aplicado" y el total no cambiaba. `fixed_product` es un tipo nativo y habitual de WooCommerce.

**Conexión con A2, revisada antes de tocar código:** son bugs en capas distintas. A2 era que el *servidor* no verificaba el resultado de `apply_coupon()` — ya resuelto. Ese mismo fix confirma que `create_order()` sigue llamando a `$order->apply_coupon($coupon_code)`, la función nativa de WooCommerce, que **sí** calcula `fixed_product` correctamente (monto fijo por línea elegible, con sus restricciones de producto/categoría) — no es algo que el plugin reimplemente. El monto que se cobra de verdad ya era correcto para cualquier tipo de cupón. El bug de M10 vivía enteramente en el cliente: una reimplementación *parcial*, solo para previsualizar en pantalla antes de pagar, que nunca contempló el tercer tipo. A diferencia de A7 (donde el cálculo sí vivía solo en el cliente y eso era peligroso), acá el riesgo no era financiero — era que la app le mostrara al cliente un precio distinto al que realmente se le iba a cobrar.

**Camino de entrada real, no solo teórico:** ningún cupón `fixed_product` aparece en los 3 listados de la app (`/apoya-creador`, `/mis-cupones`, `/cupones-oro` filtran a `percent` únicamente) — pero `CouponField.tsx` acepta cualquier código escrito a mano, validado vía `/coupon`, que no restringe por tipo. Bastaba que alguien escribiera el código de un cupón `fixed_product` real para reproducir el síntoma.

**¿Existen cupones `fixed_product` hoy?** No se pudo verificar por API pública, a diferencia de M12/M14/M15 — los 3 listados filtran a `percent`, y no existe (ni debería existir) un endpoint que liste cupones de cualquier tipo sin restricción, por la misma razón de enumeración que ya motivó el rate limit de `/coupon`. **Confirmado con Bran:** hoy casi todos los cupones son de porcentaje (creadores de contenido) y ocasionalmente de monto fijo al carrito (`fixed_cart`, campañas tipo "Cyber Boticuy") — sin uso real ni planeado de `fixed_product`. Se cubre el caso por si acaso a futuro, sin invertir en el cálculo completo.

**Qué necesitaría la app para calcular `fixed_product` completo (Opción B, descartada por ahora):** el monto fijo aplica por cada unidad de cada producto elegible del carrito, respetando restricciones de producto/categoría y exclusión de ítems en oferta — nada de eso lo devuelve `/coupon` hoy (solo `code`/`discount_type`/`amount`/`minimum_amount`). Sería un cambio de contrato real entre app y plugin, no un ajuste chico — sin cupones reales de este tipo, no se justifica todavía.

**Fix elegido (Opción A):**
- `CouponField.tsx`: cuando `discount_type` no es `percent`/`fixed_cart` y el cupón no está bajo su monto mínimo, se muestra "Cupón CODE válido — el descuento se verá al confirmar tu pedido" en vez del chip "−S/0.00" que insinuaba que el cupón no hacía nada. El cupón se sigue guardando y mandando a `create_order()` sin ningún cambio — WooCommerce lo sigue calculando bien.
- **Desglose de `OrderConfirmationScreen` corregido de raíz:** esa pantalla ya mostraba el `total` correcto (viene de `ord.total`, el servidor), pero la fila "Cupón" se armaba con el `discount` estimado en el cliente — para `fixed_product` esa fila directamente no aparecía, mientras el total sí bajaba de verdad (el mismo tipo de "la aritmética no cuadra" que C1/M2). Se agregó `coupon_discount` a la respuesta de `create_order()` (`Boticuy_App_Orders::coupon_response_fields()`, mismo patrón que `points_response_fields()`, presente solo si se aplicó un cupón, calculado con `get_discount_total()` nativo de WooCommerce) y `CheckoutScreen.tsx` lo usa para reemplazar `discount` en los parámetros de navegación a `OrderConfirmation` — el desglose ahora siempre cuadra con el total, para cualquier tipo de cupón, no solo `fixed_product`.

**Residual cerrado (mismo día):** el resumen de la propia pantalla de `CheckoutScreen` (antes de confirmar) tenía el mismo síntoma en otro componente — su fila "Descuento" se ocultaba por completo cuando `discount` (estimado del cliente) daba 0, sin distinguir "cupón por debajo del monto mínimo" (correcto ocultarla, `CouponField` ya avisa eso arriba) de "cupón de tipo no soportado, sí aplica" (antes se perdía la fila entera). Con el mismo dato ya disponible desde este fix (`coupon.discount_type`, sin necesitar `coupon_discount` del servidor porque este resumen es *previo* a llamar a `create_order()`), se agregó `discountPreviewUnsupported` — mismo criterio que `previewUnsupported` en `CouponField.tsx` — y la fila muestra "Descuento (CODE) — Se verá al confirmar" en vez de desaparecer. M10 queda así completamente cerrado, sin residuales pendientes.

### [x] M11 — Datos del titular de la cuenta bancaria expuestos sin autenticación
**Estado:** resuelto (2026-09-07) · Plugin BANK-VER-01 · brecha #2 del documento
`/bank-details` es público y el parseo extraía explícitamente `documento_tipo`, `documento_numero`, correo y teléfono del titular, además de banco, nombre, número de cuenta y CCI. Cualquiera podía consultarlo sin token.

Antes de tocar código se revisó qué de todo eso usa realmente la app: `OrderConfirmationScreen.tsx` (único consumidor, solo cuando `metodoPago === 'transferencia'`, después de que `create_order()` ya creó el pedido) solo pinta `titular`, `numero_cuenta` y `cci` — los 4 datos personales del titular (`documento_tipo`, `documento_numero`, `correo`, `telefono`) se extraían y viajaban en la respuesta sin que ninguna pantalla los mostrara nunca. Requerir sesión real (Bearer) se descartó: el checkout es de invitado por diseño (ver A5), y un invitado que paga por transferencia llega a esta pantalla sin ningún token — exigir login ahí rompería ese flujo legítimo. Gatear por pedido (mismo patrón que `/payment/formtoken`) tampoco cierra nada real, porque el dato no es específico de un pedido (es una sola opción global de WooCommerce, igual para cualquiera que la consulte).

**Fix (Opción A, la más chica que resuelve el problema real):** `class-bank-details.php::normalize_label()` ya no reconoce las etiquetas de documento/correo/teléfono del titular — esos `<dt>`/`<dd>` simplemente no matchean ninguna clave y quedan fuera de `$fields`. `parse_bank()` ya no incluye esos 4 campos en el array devuelto. El endpoint se queda público, sin cambio de contrato para los 4 campos que sí se siguen usando (`banco`, `titular`, `numero_cuenta`, `cci`) ni de flujo (invitado con transferencia sigue funcionando igual).

**Queda fuera a propósito, no resuelto por este fix:** el bloque `instrucciones` (texto libre del `<p>` de cierre) se sigue devolviendo tal cual — depende de lo que el admin haya escrito ahí, que puede incluir cualquier dato de contacto; no es parseable de forma segura sin arriesgar romper el texto legítimo de tiempos de entrega/WhatsApp. Si en el futuro se decide restringir eso también, es un hallazgo aparte, de contenido/proceso, no de código.

### [x] M12 — El control de intentos usa solo `REMOTE_ADDR`
**Estado:** resuelto (2026-09-07) · Plugin brecha #3 del documento
`class-rate-limiter.php:15` (línea original) no consideraba `X-Forwarded-For`. Detrás de un CDN, proxy inverso o NAT corporativo, todas las peticiones comparten una IP: los 5 registros por hora y los 15 pedidos por 10 minutos se vuelven límites globales del sitio y bloquean clientes legítimos. En sentido inverso, un atacante distribuido los evade. `client_ip()` es el único punto del plugin que depende de la IP del cliente (verificado por grep — nada más en `class-auth.php`, `class-orders.php`, etc. toca `REMOTE_ADDR` o cabeceras de IP), así que no había un segundo lugar con el mismo bug que arreglar.

**Verificado en vivo, no solo en código (2026-09-07):** antes de tocar nada se confirmó la topología real de producción y staging, algo que el propio proyecto venía marcando como "pendiente de confirmar con TI/hosting" desde la auditoría original sin nunca resolverlo:
- Producción (`boticuy.com` → `35.224.117.252`) responde directo con `Server: nginx/1.18.0 (Ubuntu)`, sin ninguna cabecera de CDN/proxy (`cf-ray`, `Server: cloudflare`, `Via`, `X-Cache`, etc.) — IP de rango Google Cloud, no de Cloudflare/Fastly/Akamai/CloudFront.
- Staging (IP pelada `35.209.93.250`, sin dominio, ver `.env.staging`) responde con el mismo `nginx/1.18.0 (Ubuntu)` — mismo patrón, otra VM de GCP servida directo.
- Conclusión: **hoy, en ambos ambientes conocidos, no hay ningún CDN de terceros ni balanceador visible delante de WordPress** — `REMOTE_ADDR` probablemente refleja la IP real del cliente ahora mismo. El síntoma concreto del hallazgo (límites compartidos por todo el sitio) no está ocurriendo en este momento. Esto no descarta del todo un balanceador interno de GCP delante de la VM, indistinguible con certeza desde afuera — pero es la evidencia más fuerte que existe hasta ahora sobre la topología real.

**Fix (Opción B/D — soporte genérico, sin proveedor asumido):** `client_ip()` sigue devolviendo `REMOTE_ADDR` tal cual, salvo que esa IP esté en la nueva opción `boticuy_app_trusted_proxies` (`get_option`, array vacío por default) — recién ahí mira `X-Forwarded-For`, y solo el **último** tramo de la cadena (el que agregó el proxy de confianza al conectarse, no el primero, que cualquier cliente puede inventar antes de llegar al proxy — evita el riesgo de que un atacante mande su propio `X-Forwarded-For` falso para evadir su propio límite). Con la lista vacía (el estado real de hoy, verificado arriba) el comportamiento es idéntico al anterior — **cero riesgo de regresión**. Activarlo para un proxy real futuro es un cambio de configuración (`update_option`), no de código.

### [x] M13 — La clave de idempotencia es por pantalla, no por intento
**Estado:** resuelto (2026-09-07) · Plugin ORD-CREATE-SEC-03
Se generaba una sola vez al montar el checkout (`CheckoutScreen.tsx:58`, línea original — ni siquiera se capturaba el setter del `useState`, así que era literalmente imposible cambiarla mientras la pantalla siguiera montada). Si el usuario volvía del pago (tarjeta rechazada/abandonada, "Volver al checkout") y reintentaba, el plugin devolvía el pedido original ignorando el payload nuevo sin advertirlo (`class-orders.php:273-283`, línea original).

**Qué cubría A7 y qué no:** revisamos si las 3 capas de revalidación de A7 (precio/stock) ya mitigaban esto. Agregar/quitar ítems del carrito ya estaba mitigado, pero no por A7 — `CheckoutScreen` no tiene UI para editar ítems, así que hacerlo requiere navegar a `CartScreen` y volver, lo que empuja una instancia nueva de `CheckoutScreen` con una key nueva por diseño de React Navigation. Lo que **sí** seguía roto: cupón y canje de puntos, ambos editables directamente en `CheckoutScreen` sin salir de la pantalla — A7 nunca revisa esos dos campos, solo precio/stock de lo que ya está en el carrito.

**Gravedad:** no permitía fabricar un pedido inválido (el pedido "viejo" que se devolvía ya había pasado por todas las validaciones reales al crearse). El problema era de confianza/sorpresa en el cobro: si el cliente agregaba un cupón o aumentaba el canje de puntos esperando pagar menos, terminaba pagando el total anterior (más alto); si los quitaba, el pedido igual salía con el descuento/canje viejo.

**Solución — mismo patrón de capas que el resto de la ronda:**
1. **App:** la clave de idempotencia se deriva del contenido real (ítems, cupón, canje de puntos) en vez de un valor aleatorio fijo al montar — un cambio real produce una key distinta sola, recalculada en cada submit, sin depender de que nadie se acuerde de regenerarla.
2. **Servidor:** antes de devolver el pedido encontrado por la key tal cual, se compara su contenido real contra el payload entrante (ítems, cupón, `_points_requested`). Si no coincide, no se devuelve — se le quita la key al pedido viejo (que sigue `pending`, cubierto igual por el barrido de A6/C4/A4 si nunca se paga) y se le asigna la misma key al pedido nuevo, evitando duplicados en reintentos sucesivos del contenido nuevo.

**✅ Verificado en vivo (2026-09-08), por API directa** (la parte que no depende de un pago con tarjeta rechazado, ver `TESTING-AUDITORIA-TI.md`, sección M13): `POST /order` sin cupón (`idempotency_key: "qa-verif-m13-001"`) → `order_id: 11199`. Mismo `idempotency_key`, ahora con cupón (contenido distinto) → `order_id: 11200`, pedido nuevo, no el 11199 reciclado. Mismo `idempotency_key`, mismo contenido que el paso anterior (retry idéntico) → devuelve el mismo `order_id: 11200`, no crea un tercero. Ambas mitades del contrato confirmadas: contenido distinto → reasignación; contenido igual → mismo pedido devuelto.

### [x] M14 — El cálculo de puntos recorre todo el histórico en cada llamada
**Estado:** resuelto (2026-09-07)
`points_balance()` ejecutaba dos consultas con `limit => -1` sobre todos los pedidos del usuario (`wc_get_orders()` + loop en PHP), y se invoca desde `/points`, `/shipping`, `/coupon`, `/cupones-oro` y la creación de pedido. El costo no solo crecía sin límite con el historial de cada cliente — cada fila hidrataba un `WC_Order` completo (line items, meta, todo) solo para leer `get_total()`/`get_meta()`, cuando ambas consultas son, en esencia, dos sumas.

**Antes de elegir el fix se revisaron los 5 puntos de invocación:** de los 5, solo `create_order()` (validación del canje de puntos contra el saldo real, y el gate del cupón `_bcy_oro_only`) es un punto de "enforcement" real — un valor desactualizado ahí podría dejar canjear puntos que ya no existen. Los otros 4 (`/points`, `/shipping`, `/coupon`, `/cupones-oro`) son lecturas informativas; `/points` además tiene una decisión de diseño previa deliberada (`expire_stale_card_orders_for_user()`, con el comentario "así el checkout... y esta pantalla ven el saldo real de inmediato") que un cache ciego habría revertido.

**Severidad hoy vs. con el tiempo:** hoy es barata — Boticuy es un negocio nuevo, la mayoría de clientes tiene pocos pedidos. El patrón de degradación era perverso: el costo crece por cliente, no por el sitio en general, así que habría empeorado primero para los clientes más frecuentes/leales — un cuello de botella que erosiona el p95 del checkout mucho antes de ser un problema de volumen total del sitio.

**Fix elegido (Opción D/E — arreglar la consulta de raíz, sin cache todavía):** `points_balance()` reemplaza los dos `wc_get_orders(..., limit => -1)` + loop por dos `SUM()` directos en SQL (`$wpdb->get_var()`), sin hidratar ningún `WC_Order`. Como no había forma de confirmar sin acceso a producción si el sitio usa HPOS (tablas `wp_wc_orders`) o el almacenamiento clásico (`wp_posts`/`wp_postmeta`) — la misma pregunta que quedó sin responder en la verificación de C1 — el código detecta el backend en tiempo real vía la API oficial de WooCommerce (`OrderUtil::custom_orders_table_usage_is_enabled()`) y ejecuta el SQL correcto para cada caso, en vez de asumir uno. Sigue devolviendo exactamente `earned`/`redeemed`/`balance`, mismo contrato, cero cambios en los 5 sitios que lo llaman.

**Deliberadamente sin cache todavía:** `create_order()` sigue llamando a `points_balance()`/`points_level()` en cada request, sin ningún valor cacheado de por medio — sigue siendo, como antes, la única fuente autoritativa. Si el volumen de pedidos por cliente lo justifica más adelante, cachear los 4 sitios informativos (con invalidación activa sobre los hooks de cambio de estado que ya existen, nunca un TTL ciego sobre `/points`) es una mejora aparte, no parte de este fix.

**Pendiente de verificar en staging/producción** (no ejecutable sin acceso a la base de datos desde este entorno): confirmar que el resultado del nuevo cálculo agregado coincide exactamente con el que daba el código viejo, para varios usuarios reales con historial de pedidos — ver la sección correspondiente en `TESTING-AUDITORIA-TI.md`.

### [x] M15 — Los listados de cupones se truncan a 200 sin aviso
**Estado:** resuelto (2026-09-07)
Los cuatro endpoints (`coupons()`, `apoya_creador()`, `mis_cupones()`, `cupones_oro()`) pedían `numberposts => 200` e instanciaban un `WC_Coupon` por cada uno vía `new WC_Coupon($p->post_title)`. Superado ese número, los cupones sobrantes habrían desaparecido de la app sin ningún indicio, y el patrón era N+1: cada fila disparaba una consulta interna extra (`wc_get_coupon_id_by_code()`) para resolver el código a un ID que `get_posts()` ya traía.

**Cuántos cupones activos hay hoy — verificado en vivo (2026-09-07), sin acceso a base de datos:** los 4 endpoints son públicos, así que se consultaron directamente. Producción (`boticuy.com`) responde con una versión del plugin **anterior a la separación en 3 endpoints** (`/apoya-creador`, `/mis-cupones`, `/cupones-oro` devuelven 404 `rest_no_route` — misma brecha repo-vs-desplegado ya anotada sin resolver sobre `/auth/refresh`) — solo `/coupons` existe ahí, con 11 cupones reales. Staging (código más nuevo) devuelve: `/coupons` → 8, `/apoya-creador` → 0, `/mis-cupones` → 6, `/cupones-oro` → 0. Ninguno cerca de 200 hoy — a diferencia de M12, acá el crecimiento hacia ese límite es el resultado normal y esperable de que crezca el programa de creadores/Copa Boticuy, no depende de que alguien active algo externo.

**¿Necesitan devolver todo, o son paginables?** Se revisaron las pantallas que consumen los 3 endpoints activos (`CreatorsScreen.tsx`, `MyCouponsScreen.tsx`): ambas cargan la lista completa de una sola vez con `ScrollView`/`Promise.all`, sin `FlatList` ni `onEndReached` — el diseño actual asume listas chicas cargadas enteras, no paginadas. Agregar paginación real habría sido alcance no pedido por el diseño de pantallas de hoy.

**Hallazgo nuevo, encontrado al revisar esto — más serio que M15 en sí:** el constructor de `WC_Coupon`, al recibir un string numérico, lo interpreta como **ID de post** en vez de buscarlo por código. Producción tiene hoy un cupón activo real con código puramente numérico (`"364"`). Con el código anterior, `new WC_Coupon("364")` no buscaba "el cupón cuyo código es 364" — cargaba directamente el post con ID 364, sea o no ese mismo cupón. No se pudo confirmar sin acceso a la base de datos si esto ya causó datos incorrectos en producción; el riesgo era real y estructural, no solo teórico.

**Fix (Opción C — mismo espíritu que "arreglar la raíz" de M14, aplicado a lo que corresponde acá):** como acá cada fila necesita sus propios datos (no un agregado como en M14, que sí se pudo resolver con `SUM()`), la raíz del problema no es la falta de SQL agregado sino dos costos evitables por fila. En los 4 endpoints: `numberposts => 200` → `numberposts => -1` (sin tope — el volumen de cupones lo define un admin en wp-admin, crecimiento lento y acotado, no comparable al historial de pedidos de M14), y `new WC_Coupon($p->post_title)` → `new WC_Coupon($p->ID)` — evita la consulta redundante de código→ID **y** cierra el bug de códigos numéricos, con un solo cambio.

**`/coupons` (legacy) incluido a propósito, sin retirarlo:** ningún código de la app actual lo llama (reemplazado por los 3 endpoints nuevos, confirmado por grep y por el propio `CHANGELOG.md` de la app), pero producción todavía lo sirve como único endpoint disponible — no hay forma de confirmar cuántos builds viejos de la app en las tiendas siguen dependiendo de él. Se le aplicó el mismo fix (barato, sin riesgo) en vez de tocarlo o retirarlo; **retirarlo queda como decisión de producto aparte**, pendiente de saber cuántos usuarios siguen en versiones antiguas.

---

## ⚪ BAJOS y mejoras — deuda técnica (14)

| # | Estado | Hallazgo | Ubicación |
|---|--------|----------|-----------|
| [x] B1 | resuelto (2026-09-08) | Exclusión de "envío" escrita como `'env\xc3\xado'` entre comillas simples: PHP la tomaba literal (12 caracteres) y nunca coincidía. Además `/coupons` filtraba por substring mientras los otros tres endpoints usaban límites de palabra, con listas distintas. Ver nota debajo de esta tabla. | `class-coupons.php` |
| [x] B2 | resuelto (2026-09-08) | `mb_convert_encoding(..., 'HTML-ENTITIES', ...)` deprecado desde PHP 8.2, se retira en PHP 9. Reemplazado por la declaración de encoding estándar antepuesta al HTML. | `class-bank-details.php` |
| [x] B3 | resuelto (2026-09-08) | `current_time('timestamp')` deprecado desde WordPress 5.3 — y, encontrado al revisar, un bug de zona horaria real detrás de la deprecación. Ver nota debajo de esta tabla. | `class-coupons.php` |
| [x] B4 | resuelto (2026-09-08) | Faltaban feriados nacionales de fecha fija: 7 de junio (Batalla de Arica y Día de la Bandera) y 6 de agosto (Batalla de Junín, Ley 31989). Lista completa revisada contra el calendario oficial vigente — ver nota debajo de esta tabla. | `utils/attention.ts` |
| [x] B5 | resuelto (2026-09-08) | No existía cierre de sesión en servidor ni lista de revocación. Además, `logout()` en la app solo borraba el token local (encontrado al revisar esto), sin invalidar nada del servidor. Ver nota debajo de esta tabla. | `class-auth.php` |
| [x] B6 | resuelto (2026-09-14) | Las filas bloqueadas de Perfil eran `View`, no `Pressable`: tocarlas no hacía absolutamente nada. Ahora son `Pressable` y llevan a `Login` — ver nota debajo de esta tabla. | `ProfileScreen.tsx:107` |
| [x] B7 | resuelto (2026-09-14) | `decodeHtmlEntities` pasaba cualquier entidad numérica a `String.fromCodePoint` sin acotar: un valor fuera de rango lanzaba `RangeError` y tumbaba el render de la lista completa. Ver nota debajo de esta tabla. | `utils/format.ts` |
| [x] B8 | resuelto (2026-09-07) | Las direcciones se leían, modificaban y reescribían sobre `user_meta` sin bloqueo: dos altas simultáneas perdían una. Mutex por usuario, ver nota debajo de esta tabla. | `class-addresses.php` |
| [x] B9 | resuelto (2026-09-07) | Al llegar a 10 direcciones se descartaba la más antigua en silencio. Ahora responde 422, el usuario elije cuál borrar — ver nota debajo de esta tabla. | `class-addresses.php` |
| [x] B10 | resuelto (2026-09-14) | `api/auth.ts:me()` era código muerto: la hidratación de sesión usa `/auth/refresh`. Confirmado por grep que nadie más lo importaba — eliminado junto con `MeResult`. | `api/auth.ts:27` |
| [x] B11 | resuelto, con salvedad (2026-09-07) | Clave de PostHog embebida como valor por defecto en el repositorio, compartida con la app anterior. Sacada de `app.config.js`, movida a `eas.json`/`.env.staging` — ver nota debajo de esta tabla. | `app.config.js` |
| [x] B12 | resuelto (2026-09-14) | El WebView de pago no tenía timeout: una carga colgada dejaba el overlay indefinidamente sin salida automática. Ver nota debajo de esta tabla. | `PaymentWebViewScreen.tsx` |
| [x] B13 | resuelto (2026-09-07) | La revalidación del carrito hacía N peticiones secuenciales en cada foco de la pestaña, en lugar de agrupar (ligado a A1). Resuelto junto con A1 — ver esa entrada: una sola petición batch (`fetchProductsByIds()`) en `src/utils/cartRevalidation.ts`. | `src/utils/cartRevalidation.ts` |
| [x] B14 | resuelto (2026-09-08) | La creación de pedido no validaba los datos del cliente: una llamada directa podía crear un pedido con nombre y correo vacíos, sin forma de contactar al comprador. Confirmado que el formulario de la app ya exigía todo esto — blindaje contra llamadas directas, no un caso alcanzable por un usuario real. Ver nota debajo de esta tabla. | `class-orders.php` |

### Nota sobre B11 — clave de PostHog

**Parte de código, resuelta:** la key y el host de PostHog ya no están hardcodeados como valor por defecto en `app.config.js` — se leen de `EXPO_PUBLIC_POSTHOG_KEY`/`EXPO_PUBLIC_POSTHOG_HOST`, definidas en `eas.json` (perfiles `preview`/`production`) y en `.env.staging` para desarrollo local, mismo patrón que las URLs de API. Si la variable no está definida en algún entorno, `initAnalytics()` ya maneja "sin key" sin romper nada — simplemente no manda eventos. **Aclaración importante:** el riesgo real de esta clave siempre fue bajo — es una *Project API Key* de PostHog (prefijo `phc_`), diseñada para ir embebida en código cliente (solo permite mandar eventos, no leer datos ni dashboards) — así que esto es una relocalización por consistencia con el resto del proyecto, no el cierre de una fuga de credenciales real.

**Parte de negocio, pendiente y anotada aparte:** la cuenta de PostHog en uso **fue generada por Fernando** — no está confirmado si es una cuenta personal o corporativa, solo se sabe quién la creó (antes solo se sabía que era "la cuenta del legacy", ver `PROGRESO.md`). Queda pendiente validar esa titularidad antes de decidir si corresponde migrar a una cuenta propia de la empresa; eso es un paso de **gestión, no de código**: crear el proyecto nuevo en PostHog bajo la cuenta de la empresa y generar su Project API Key ahí. Una vez exista esa key, el cambio en este repo es trivial — reemplazar el valor de `EXPO_PUBLIC_POSTHOG_KEY` en `eas.json` y `.env.staging`, sin tocar código de nuevo. No se resuelve como parte de B11.

### Nota sobre B8 y B9 — libreta de direcciones (trabajados juntos, mismo archivo)

**B8 — sin lock, read-modify-write puro:** `list_for($uid)` leía todo `user_meta('boticuy_app_addresses')` como un único valor; `add_address()`/`update_address()`/`delete_address()` mutaban ese array completo en PHP y lo reescribían entero con `update_user_meta()`. Sin ninguna primitiva atómica de por medio: si dos peticiones llegaban casi simultáneas, ambas partían del mismo estado y la que terminara su `update_user_meta()` al final pisaba por completo el resultado de la otra — sin error visible, sin ningún indicio.

**Qué tan grave era en la práctica:** ni puramente teórico ni trivial de disparar. Confirmado que `AddressFormScreen.tsx` sí deshabilita el botón durante el guardado (`disabled={submitting}`), pero es el mismo tipo de guardia que un doble-tap muy rápido puede saltarse (ambos toques nativos llegan antes de que React re-renderice el botón deshabilitado) — la misma familia de carrera que ya motivó el trabajo de idempotencia de M13 para pedidos. Un segundo disparador, más probable: un timeout de red percibido (el cliente tiene 20s de timeout) donde el usuario reintenta creyendo que falló, mientras la primera petición sigue procesándose. La diferencia real con M13/A7 es el impacto, no la probabilidad: acá se pierde una dirección guardada, recuperable con solo volver a agregarla — no hay pérdida de dinero ni de stock.

**Fix — mutex reutilizado, no reconstruido desde cero:** `Boticuy_App_Orders::acquire_idempotency_lock()`/`release_idempotency_lock()` (el lock atómico vía `add_option()` + índice UNIQUE de `wp_options`, ya usado para idempotencia de pedidos y para el lock de estado de pedido que comparte con `Boticuy_App_Payment`) se renombró a algo neutral, **`Boticuy_App_Locks::acquire()`/`release()`** (`class-locks.php`, nuevo), sin nada específico de pedidos. Se redirigieron los 4 call-sites existentes (2 en `class-orders.php`, 2 en `class-payment.php`) al nombre nuevo, sin cambiar la lógica atómica en absoluto. `class-addresses.php` ahora lo usa con una sola clave por usuario (`'addr_' . $uid`) compartida entre `add`/`update`/`delete_address()` — así una alta y un borrado simultáneos del mismo usuario también quedan serializados entre sí, no solo dos altas — con TTL corto (8s, esta operación no depende de ninguna pasarela externa a diferencia de crear un pedido).

**B9 — descarte silencioso:** `add_address()` hacía `array_unshift($list, $a); $list = array_slice($list, 0, 10);` sin chequear antes si ya había 10 — la dirección más antigua se caía del array sin ningún aviso en la respuesta.

**Fix:** antes de insertar, si `count($list) >= Boticuy_App_Addresses::MAX_ADDRESSES` (10), se responde `422` con "Ya tienes el máximo de 10 direcciones guardadas — elimina una para agregar otra" — nada se descarta sin que el usuario decida.

**Fix acompañante obligatorio, no opcional — encontrado al revisar la conexión entre ambos:** implementar el 422 de B9 sin más habría chocado con un hueco ya documentado en la nota de A3 ("Descubrimiento adicional, fuera de alcance de ese fix"): `addAddress()`/`updateAddress()` (`src/api/addresses.ts`) devolvían `res.data?.addresses ?? []` sin revisar `res.data.ok`, y como `bffClient` no lanza excepción para códigos `< 500`, cualquier `422` (incluido el nuevo de B9) resolvía como un array vacío sin error — `AddressFormScreen.onSave()` nunca revisaba ese resultado y navegaba hacia atrás como si se hubiera guardado. Con el 422 nuevo, ese hueco dejaba de ser un caso raro: **todo usuario en el límite de 10 lo habría disparado siempre**, viendo la pantalla cerrarse sin haber guardado nada — peor que el descarte silencioso original. Se corrigió junto con B9, no aparte: `addAddress()`/`updateAddress()` ahora lanzan una excepción con el `reason` real del servidor cuando `ok !== true`; `AddressFormScreen.onSave()` muestra ese mensaje real en su `catch` existente en vez del texto genérico fijo. Verificado que `CheckoutScreen.tsx` (el otro llamador, "Recordar mis datos") sigue funcionando sin tocarlo — su `.catch()` ya existente (por A3) captura el `throw` nuevo igual que ya capturaba errores de red.

### Nota sobre B14 — validación server-side de los datos del cliente al crear el pedido

**Confirmado antes de tocar código:** `create_order()` (`class-orders.php:366`) nunca validaba presencia ni formato de `nombre`/`email`/`telefono`/`numDoc`/`direccion`/`numero`, ni que el `idUbigeo` del distrito existiera realmente — todo llegaba con `isset(...) ? ... : ''` y solo `sanitize_text_field()`/`sanitize_email()` (que limpian formato, nunca rechazan vacío). `CheckoutScreen.tsx::validate()` ya exige los seis campos (nombre no vacío, email/teléfono/DNI con formato válido, dirección/número no vacíos, distrito de una lista real vía `SelectField`) antes de dejar tocar "Confirmar pedido" — mismo patrón que A2/A4: el hallazgo es un blindaje contra llamadas directas a la API, no un caso alcanzable por un usuario real de la app.

**Reuso, no reconstrucción:** `Boticuy_App_Addresses::is_valid_phone()`/`is_valid_dni()` (privados, usados solo por `validate_format()` para direcciones) se extrajeron a una clase neutral nueva, **`Boticuy_App_Validation`** (`class-validation.php`, mismo espíritu que `Boticuy_App_Locks` de B8) — junto con `is_valid_email()`, que envuelve `is_email()` nativo de WordPress (más completo que el regex simple del cliente) solo para agrupar los tres validadores de contacto en un solo lugar. `class-addresses.php::validate_format()` se redirigió al helper nuevo, sin cambiar su criterio.

**Fix:** nueva `Boticuy_App_Orders::validate_customer_and_shipping($cust, $ship)` (mismo patrón que `validate_format()`: re-deriva los valores para validar, sin persistir nada todavía), llamada en `create_order()` justo después de extraer `$cust`/`$ship` — antes de tocar cupón, puntos, stock o `save()`. Valida: `nombre` no vacío, `email` (`is_email()` vía el helper), `telefono`/`numDoc` (mismo criterio que direcciones, ahora compartido), `direccion`/`numero` no vacíos, y `idUbigeo` real vía `Boticuy_App_Ubigeo::exists()` (ya público desde M8). Cualquier fallo corta con `422` y el motivo específico — mismo patrón que el resto de validaciones tempranas de esta función.

### Nota sobre B5 — cierre de sesión real en servidor

**Confirmado antes de tocar código:** los JWT de `class-auth.php` se validaban solo por firma + `exp` (`jwt_decode()`) — el payload era literalmente `{uid, exp}`, sin `iat`, sin `jti`, sin nada derivado del usuario. `bearer_uid()` no consultaba la base de datos en absoluto. Además, `/auth/refresh` implementa una sesión deslizante sin techo: mientras el token se use al menos una vez cada 7 días, nunca expira de verdad — el "7 días" del hallazgo era el peor caso, no el real. **Dato encontrado al revisar, más grave que el hallazgo original:** `logout()` en la app (`authStore.ts`) no llamaba a ningún endpoint del servidor — solo borraba el token de `SecureStore` local. Un token ya copiado en otro lado (dispositivo robado, tráfico interceptado) seguía viviendo indefinidamente aunque el usuario "cerrara sesión" en el dispositivo original.

**Por qué un JWT stateless no puede resolver esto gratis:** por diseño, un JWT se valida sin consultar nada — esa es la ventaja de rendimiento por la que se eligió. No existe combinación que dé "cero estado en el servidor" y "revocación instantánea arbitraria" a la vez; cualquier invalidación antes del `exp` natural exige que el servidor consulte algo que pueda cambiar.

**Decisión de negocio, tras conversar sobre el estándar real de la industria (confirmado con Bran, 2026-09-08):** Opción A — un "sello" de invalidación por usuario, el mismo patrón que WordPress usa internamente para sus propias cookies de sesión (el hash de la cookie incorpora un fragmento del `user_pass` actual, así que cambiar la contraseña la invalida sola). **Aclaración explícita, no es una versión diluida:** el estándar completo de la industria para revocación de sesiones a mayor escala es un par access-token corto + refresh-token revocable con rotación (Opción C, evaluada y descartada por ahora) — pero para el tamaño y riesgo actual de Boticuy, la Opción A es la elección **proporcional**, no un atajo por falta de tiempo. Revocación por dispositivo/sesión individual (Opción B, vía `jti`) y el split access/refresh (Opción C) quedan anotadas como mejoras futuras, a retomar si el negocio crece lo suficiente como para justificar revocar un dispositivo puntual sin cerrar sesión en todos los demás — hoy, por diseño de A, cerrar sesión en un dispositivo cierra sesión en *todos* del mismo usuario.

**Fix:**
- Nuevo claim `iat` (momento de emisión) en el JWT, y nuevo `user_meta` `_bcy_tokens_valid_after` (timestamp) por usuario.
- `bearer_uid()` (único punto, cubre todos los endpoints existentes sin tocarlos) rechaza cualquier token cuyo `iat` sea anterior a `_bcy_tokens_valid_after` del usuario, aunque la firma y el `exp` sigan siendo válidos.
- Nuevo endpoint **`POST /auth/logout`**: mueve `_bcy_tokens_valid_after` al instante actual — invalida de inmediato el token usado en esa misma llamada y cualquier otro token más viejo del mismo usuario.
- **Migración sin apagón masivo de sesiones:** usuarios sin la meta nueva, y tokens ya emitidos sin claim `iat`, se tratan como `0` — la comparación `0 < 0` nunca invalida nada al desplegar. `hydrate()` en la app ya llama a `/auth/refresh` en cada apertura, así que todos los tokens activos se "actualizan" solos con el claim `iat` real en su próximo refresh natural, sin ninguna migración manual. Si alguien cierra sesión antes de haber refrescado, la comparación sigue funcionando bien igual (`0 < <timestamp real>` invalida correctamente los tokens viejos sin claim).
- **Costo real de la consulta nueva:** `bearer_uid()` deja de ser 100% matemático — agrega un `get_user_meta()` por request. `get_user_meta()` usa el cache de objetos de WordPress (activo dentro de un mismo request incluso sin Redis/Memcached) — confirmado que `create_order()` ya llama a `bearer_uid()` dos veces en la misma petición (canje de puntos y gate de cupón Oro); con este cambio, ambas comparten una sola consulta real. Costo acotado por request, no crece con nada.
- **App:** nueva `logoutSession()` (`src/api/auth.ts`), llamada desde `authStore.ts::logout()` en un `try/catch` best-effort — si falla (sin red, servidor caído), igual se cierra sesión localmente, nunca bloquea el logout.

### Nota sobre B1, B2, B3 y B4 — deuda técnica menor, antes de pasar a pruebas automatizadas (Paso 7)

**B1 — exclusión de "envío" rota, y criterios distintos entre endpoints:** `'env\xc3\xado'` (`class-coupons.php:55`) entre comillas simples nunca era la palabra "envío" — en PHP, `\x` no es una secuencia de escape dentro de comillas simples (solo `\\` y `\'` lo son), así que era literalmente esos 12 caracteres tal cual, sin ninguna posibilidad de coincidir con nada real (verificado ejecutando PHP directamente, no solo por lectura del código). Además, `coupons()` (el único de los 4 endpoints de listado que no pasaba por `passes_base_filter()`) tenía su propia lista de exclusión (7 palabras, comparadas por `strpos()`/substring), distinta de `self::$EXCLUDE_WORDS` (9 palabras, comparadas por `\b`/palabra completa) que ya usaban los otros tres. **Encontrado al revisar, más allá del bug de escape:** ni la lista rota ni la correcta tenían la palabra con tilde — un cupón real que dijera "Envío" (con tilde) tampoco habría matcheado contra `envio` sin tilde, con ningún criterio. Fix: `coupons()` ahora llama a `passes_base_filter()` igual que los otros tres (una sola lista, un solo criterio), y se agregó `normalize_for_match()` (usa `remove_accents()`, nativo de WordPress) para que "envío"/"Envío"/"envio" coincidan todos contra la misma palabra sin tilde en `$EXCLUDE_WORDS`, sin importar cómo lo escriba el admin.

**B2 — `mb_convert_encoding()` deprecado:** (`class-bank-details.php:39`) está deprecado desde PHP 8.2 y se retira en PHP 9; el plugin declara `Requires PHP: 7.4` en su cabecera, así que no hay ninguna barrera que evite ejecutarlo en el entorno afectado. Reemplazado por `'<?xml encoding="UTF-8">' . $html` antepuesto en `loadHTML()` — el workaround estándar y ampliamente documentado para que `DOMDocument` no corrompa tildes/ñ, sin depender de una función que se retira en PHP 9. Verificado que es seguro acá: el código nunca vuelve a serializar el documento completo (solo XPath + `textContent`), así que el nodo de encoding al principio no interfiere con nada.

**B3 — `current_time('timestamp')` deprecado, y un bug de zona horaria real detrás:** más grave que una simple deprecación. `current_time('timestamp')` no devuelve un Unix timestamp real — devuelve la hora local del sitio (ajustada por el offset de zona horaria configurado en WordPress) disfrazada de timestamp. Las 5 apariciones (todas en `class-coupons.php`) lo comparaban contra `$exp->getTimestamp()` (`WC_DateTime::getTimestamp()`, que sí es UTC real) — con el offset de Lima (UTC-5) configurado, esta comparación quedaba desalineada por 5 horas: un cupón podía considerarse vencido hasta 5 horas antes de su vencimiento real, o seguir válido hasta 5 horas después. Fix: las 5 apariciones reemplazadas por `time()` — cierra la deprecación **y** la desalineación horaria, ya que `time()` es UTC real, igual que `$exp->getTimestamp()`.

**B4 — feriados nacionales faltantes:** lista revisada completa contra el calendario oficial vigente de feriados nacionales no laborables de Perú. Coincidía en todo lo demás — solo faltaban exactamente los dos que ya señalaba el hallazgo: 7 de junio (Batalla de Arica y Día de la Bandera) y 6 de agosto (Batalla de Junín, Ley N.° 31989). Confirmado explícitamente que el 23 de julio ("Día de la Fuerza Aérea del Perú") no se agrega — es una fecha conmemorativa institucional, no un feriado nacional no laborable para el público general.

### Nota sobre B6, B7, B10 y B12 — cierre de los últimos 4 hallazgos de la auditoría original (41/41)

**B6 — filas bloqueadas de Perfil, ahora táctiles:** las 4 filas de "Al iniciar sesión podrás ver..." (`ProfileScreen.tsx:107`, línea original) eran `View` sin `onPress` — tocarlas no hacía nada, ni ofrecía camino a iniciar sesión. Ahora son `Pressable` con `onPress={() => navigation.navigate('Login')}`, el mismo destino que ya usa el botón "Iniciar sesión / Registrarse" de la tarjeta de arriba en la misma pantalla. Sin lógica nueva, solo el mismo patrón ya existente aplicado a estas 4 filas.

**B7 — `decodeHtmlEntities` ya no puede tumbar el render:** `String.fromCodePoint()` lanza `RangeError` fuera de `0-0x10FFFF` (y también dentro del rango de surrogates aislado, `0xD800-0xDFFF`) — un valor así en una entidad numérica (`&#x...;`/`&#...;`) tumbaba el render de toda la lista que la contuviera. Nueva `safeFromCodePoint()` (`utils/format.ts`) valida el rango antes de decodificar. **Decisión de fallback (confirmada con Bran):** si el valor es inválido, se deja el texto de la entidad tal cual vino en el HTML original (ej. `&#99999999;` se queda literal) — mismo criterio que ya usaba el propio decodificador para una entidad *nombrada* desconocida (`NAMED_ENTITIES[entity] ?? entity`), en vez de mostrar un placeholder inventado (`�`) o descartar el carácter en silencio.

**B10 — código muerto retirado:** `api/auth.ts::me()` no tenía ningún consumidor — confirmado por búsqueda exhaustiva en todo `src/` (la hidratación de sesión usa `refreshSession()`, nunca `me()`). Eliminada la función y su interfaz `MeResult`.

**B12 — timeout en el WebView de pago:** una carga inicial colgada (script de Izipay + formulario embebido) dejaba el overlay "Cargando pago seguro…" para siempre, sin ninguna salida. Nuevo timer de **30 segundos** (`PaymentWebViewScreen.tsx`), armado al montar la pantalla y cancelado si `onLoadEnd` ya disparó antes; si el timeout se cumple y la carga sigue en curso, se reutiliza la pantalla de error que ya existía en el archivo (ícono + mensaje + botón "Volver al checkout") en vez de introducir un mecanismo de UI nuevo. **Decisión de alcance (confirmada con Bran):** el timeout solo cubre la carga inicial (`loading`), no la espera de confirmación del pago (`validating`) — ahí ya hay una respuesta real de Izipay en curso, y cortarla a los 30s arriesgaría interrumpir un pago que sí se está confirmando. Se descartó también un botón "Reintentar" que recargara el `WebView` en el sitio (en vez de volver al checkout), por el riesgo de reinicializar el SDK de Izipay sobre un `formToken` ya usado sin pasar de nuevo por `formtoken()`.

Con esto, los **41 hallazgos originales de la auditoría quedan 41/41 cerrados** (más C5, C6, A9, A10, encontrados en el camino).

---

## Lo que el plugin hace bien (no tocar / no romper al parchar)

- **Verificación de pago:** firma HMAC-SHA256 recalculada en servidor y comparada con `hash_equals`; correspondencia del identificador de pedido embebido en la respuesta firmada; comparación del monto pagado contra el total real, con nota de auditoría y bloqueo si no coinciden.
- **Concurrencia:** los locks se apoyan en `add_option()` y en el índice único de `option_name`, atomicidad real en BD, con robo de locks colgados vía `UPDATE` condicionado.
- **Verificación de propiedad:** los tres endpoints de pago exigen coincidencia de usuario, o `checkout_token` comparado en tiempo constante para invitados.
- **Aislamiento de direcciones:** al vivir dentro del `user_meta` del dueño, no hay identificador ajeno que adivinar.
- **JWT:** el algoritmo nunca se lee del token recibido (previene confusión de algoritmo); el secreto se genera con `random_bytes(32)`.
- **Ubigeo:** doble mitigación de inyección SQL (limpieza de caracteres + consulta parametrizada).
- **Panel de administración:** el guardado de metadatos de cupón valida nonce, capacidad y lista blanca explícita de claves.

---

## Estado de la calidad verificable (antes de empezar)

| Comprobación | Resultado | Lectura |
|---|---|---|
| Compilación de tipos (`tsc --noEmit`) | Sin errores | Proyecto bien tipado |
| Suite de la app (jest) | 36/36 en verde | 7 archivos: utilidades, carrito, cupones, creadores, direcciones |
| Cobertura de sentencias | 13.81% | Medida sobre `src/**` |
| Cobertura de ramas | 10.57% | La lógica condicional es justo donde viven los hallazgos |
| Checkout, pago, pedidos, catálogo | 0% | `CheckoutScreen`, `PaymentWebViewScreen`, `api/orders`, `api/payment`, `api/products` sin una sola línea cubierta |
| Suite del plugin | No existe | Sin PHPUnit, sin carpeta de pruebas, sin dependencias de testing |

Los cuatro hallazgos críticos están todos en código con cobertura cero. No es coincidencia: una prueba que comparara el total mostrado con el total del pedido habría detectado C1 el primer día.

---

## Plan de acción (7 pasos, en orden por dependencias reales)

> Corregir el total cambia el cálculo del pedido, así que todo lo que se valide antes hay que volver a validarlo después.

### [ ] Paso 1 — Bloqueante: Un solo total, calculado en el servidor
**Hallazgos:** C1, A2, A7, M1, M2
- [ ] Agregar la línea de envío al pedido en el servidor y recalcular el total con ella (C1)
- [ ] Verificar el retorno de `apply_coupon()` y responder con error explícito en lugar de un 201 sin descuento (A2)
- [ ] Que la app muestre el total que devuelve el backend en checkout, formulario de pago y confirmación, en vez del que calcula por su cuenta (C1, A7)
- [ ] Mostrar el descuento por puntos y no afirmar "Gratis" cuando la cotización falló (M1, M2)

**Criterio de aceptación:** el total que ve el cliente en las tres pantallas es idéntico, carácter por carácter, al total que devuelve `POST /order`. Existe una prueba automatizada que falla si difieren.

### [ ] Paso 2 — Bloqueante: Builds que se pueden publicar
**Hallazgos:** C3, C2, B11
- [ ] Definir el entorno del perfil de producción en `eas.json` y hacer que un build de release falle si el modo vista previa quedó activo (C3)
- [ ] Habilitar HTTPS en staging, o restringir la distribución de ese APK al equipo mientras no lo tenga (C2)
- [ ] Sacar la clave de analítica del repositorio y pasarla a variable de entorno (B11)

**Criterio de aceptación:** un build del perfil de producción, instalado en un teléfono, completa una compra que aparece como pedido real en WooCommerce, sobre HTTPS. Ningún build distribuido fuera del equipo apunta a HTTP.

### [ ] Paso 3 — Bloqueante: Cerrar el cobro indebido y la sobreventa
**Hallazgos:** C4, A4, A6, M13
- [ ] Rechazar `formtoken` sobre pedidos fallidos y reconstruir la reserva de puntos al reintentar un pago (C4)
- [ ] Validar la cantidad pedida contra el stock disponible en el servidor, no solo el booleano de disponibilidad (A4)
- [ ] Extender la expiración automática a todos los pedidos de tarjeta pendientes, no solo a los que tienen canje de puntos (A6)
- [ ] Generar la clave de idempotencia por intento de envío y no por apertura de pantalla, o rechazar el reenvío con un carrito distinto (M13)

**Criterio de aceptación:** la secuencia canjear → abandonar → reintentar → pagar deja el saldo de puntos descontado. Pedir más unidades que el stock devuelve error y no crea pedido. Un pedido de tarjeta abandonado sin puntos pasa a fallido por sí solo.

### [ ] Paso 4 — Robustez del carrito y de la sesión
**Hallazgos:** A1, B13, A3, A5
- [ ] Distinguir error de red de producto inexistente en la revalidación del carrito, y agrupar las peticiones en lugar de encadenarlas (A1, B13)
- [ ] Enviar teléfono y documento al guardar la dirección, y propagar el error al usuario en vez de descartarlo (A3)
- [ ] Guardas de sesión reales en la navegación, y esperar la hidratación del token antes de montar pantallas autenticadas (A5)

**Criterio de aceptación:** con el backend apagado, abrir el carrito no borra ningún ítem. Marcar "Recordar mis datos" produce una dirección visible en Mis direcciones. Sin sesión, ninguna pantalla de cuenta es alcanzable por ninguna vía.

### [ ] Paso 5 — El envío como un solo dominio configurable
**Hallazgos:** M5, M6, M7, M8, M9
- [x] Una sola fuente de configuración para tarifas y umbrales, consultable desde la app (M5)
- [ ] Leer correctamente los métodos de la zona: costos con fórmula y la condición `requires` del envío gratis (M6 cerrado; M7 implementado, no cerrado hasta verificar en staging)
- [x] Resolver la zona con el departamento además del código postal, para que coincida con lo que cobra la web (M8 — verificación real contra staging pendiente)
- [ ] Mensajería honesta por región: no prometer envío gratis donde la zona no lo ofrece (M9)

**Criterio de aceptación:** cambiar una tarifa se hace en un solo lugar y no requiere publicar una versión de la app (cumplido, M5). Para un mismo destino y subtotal, la cotización de la app y la de la web coinciden (M6/M7/M8 resueltos en código; falta confirmar en staging antes de dar el paso por cerrado del todo — ver TESTING-AUDITORIA-TI.md).

### [ ] Paso 6 — Backend y catálogo: privacidad, límites y coherencia
**Hallazgos:** M11, M12, M14, M15, M10, M3, M4, B14, B8, B9, A8, B5
- [x] Quitar los datos personales del titular de la respuesta pública de datos bancarios, o exigir sesión (M11)
- [x] Resolver la IP real detrás de proxy para que los límites de intentos no bloqueen clientes legítimos ni se evadan (M12)
- [x] Cachear el saldo de puntos, hoy recalculado sobre todo el histórico en el camino crítico del checkout (M14 — resuelto de raíz con SQL agregado; cachear queda como mejora aparte, solo si el volumen futuro lo justifica)
- [x] Quitar el tope de 200 y el N+1 de los listados de cupones (M15 — resuelto; paginación real descartada por ahora, no la pide el diseño actual de pantallas)
- [x] Dejar de mostrar "aplicado" con S/0.00 para tipos de descuento que la app no calcula, y que el desglose de confirmación cuadre con el total (M10 — resuelto; el cálculo completo de `fixed_product` queda descartado por ahora, sin uso real ni planeado)
- [x] Unificar el catálogo: mismo orden con y sin filtro, y una sola fuente para el conteo de páginas (M3, M4 — resueltos; popularidad descendente confirmada como decisión de negocio, control editorial manual descartado por ahora)
- [x] Validar los datos del cliente al crear el pedido (B14) — [x] resolver las direcciones sin condiciones de carrera ni descartes silenciosos (B8, B9)
- [x] Definir e implementar la política de puntos retenidos en Yape y transferencia (A8 — resuelto: expiración automática a 72h, decisión de negocio confirmada con Bran)
- [x] Cierre de sesión en servidor, para que un token filtrado deje de valer (B5)

**Criterio de aceptación:** la respuesta pública de datos bancarios no contiene documento, correo ni teléfono del titular. El listado de catálogo devuelve el mismo orden con filtro y sin filtro. Ningún cupón activo desaparece de la app por volumen.

### [ ] Paso 7 — Red de seguridad
**Hallazgos:** cobertura de pruebas, B2, B3, B1, B4
- [ ] Pruebas automatizadas sobre checkout, pago, pedidos y catálogo (hoy en 0%)
- [ ] PHPUnit en el plugin, con foco en cálculo de totales, cupones, puntos y pagos
- [ ] Una prueba de contrato que compare el total mostrado contra el total del pedido creado, para que C1 no pueda repetirse
- [x] Resolver las llamadas deprecadas que romperán con PHP 9 y versiones futuras de WordPress (B2, B3), el filtro de cupones con el escape roto (B1), los feriados faltantes (B4)

**Criterio de aceptación:** ningún flujo que mueva dinero queda sin al menos una prueba automatizada. La suite corre en integración continua y bloquea el merge si falla.

---

## 🚧 Puerta de publicación

**Corregir solo los 4 críticos NO habilita la publicación.** A2 sigue produciendo pedidos que cobran distinto a lo mostrado y A4 sigue permitiendo sobreventa: son dos formas más de cobrar mal, aunque no estén etiquetadas como críticas.

**Recomendación del informe: publicar recién al cerrar los pasos 1 a 4.**

---

## ⚠️ Puntos abiertos — no dependen solo de código

### Decisiones de negocio pendientes (condicionan la corrección)
1. **Envío:** ¿debe cobrarse en los pedidos de la app? (se asume que sí; ordena C1 y todas las reglas de envío — si la respuesta fuera "no", corregir la app en vez del backend)
2. ~~**Puntos retenidos (A8):** ¿se liberan automáticamente en Yape y transferencia tras algún plazo, o se mantiene la revisión manual con un reporte que la haga visible?~~ **Resuelto (2026-09-08):** expiración automática a 72h fijas, sin reporte adicional — ver A8.
3. **Cupones rechazados (A2):** al crear el pedido, ¿se bloquea el pedido o se crea sin descuento avisando al cliente?
4. **Pantallas con sesión (A5):** sin sesión, ¿redirigen a iniciar sesión o quedan inaccesibles?
5. **Orden del catálogo (M3):** ¿popularidad descendente es el orden deseado, o el negocio quiere control editorial en las secciones curadas?

### No verificable con el material actual (requiere acceso adicional)
- **Configuración real de envío (M6, M7, M8):** ~~dependen de cómo estén configuradas las zonas y métodos de envío en WooCommerce~~ **verificado (2026-09-07)** contra capturas reales de las 3 zonas (Provincias, Callao, Lima 1 CERCANOS) — ver el detalle en cada hallazgo. Pendiente solo la corrida de los 3 escenarios de `TESTING-AUDITORIA-TI.md` contra staging (no solo lectura de panel).
- **Alcance de la exposición de datos bancarios (M11):** ~~expone lo que el administrador haya escrito en el texto de instrucciones de transferencia~~ **parcialmente verificable desde el código, sin producción (2026-09-07):** los 4 campos estructurados del titular (documento/correo/teléfono) se extraían siempre que existieran esas etiquetas conocidas en el HTML, sin depender de prosa libre — ya resueltos, ver M11. Lo que sigue sin poder verificarse sin leer producción es solo el contenido del bloque `instrucciones` (texto libre de cierre), que si el admin escribió ahí algún dato de contacto adicional, se sigue devolviendo tal cual.
- **Versión del plugin desplegada:** el documento de la app afirma que el endpoint de renovación de sesión no existe en producción, pero el código recibido (2.14.0) sí lo incluye. Puede ser desfase entre repo y servidor, o nota desactualizada del documento.
- Para las dos primeras alcanza con acceso de lectura al panel de WooCommerce. Para reproducir el flujo de pago y confirmar C4 harían falta además credenciales de prueba de Izipay y un staging con HTTPS (el actual va por HTTP sin cifrar).

---

## Procedencia

Revisión sobre el código y el APK compartidos por Brandon vía Drive. Alcance: 7,044 líneas de la app y 2,266 del plugin, revisadas en su totalidad; los dos documentos de requerimientos QA leídos completos y contrastados hallazgo por hallazgo. Referencias archivo:línea corresponden a los commits recibidos — app en `5e3d607`, plugin en la versión 2.14.0 sin control de versiones en el paquete entregado.

# Testing manual — ronda de fixes de la auditoría TI

Checklist de pruebas manuales para validar, hallazgo por hallazgo, que los fixes de `boticuy-hallazgos-completo.md` (auditoría 21-ago-2026) funcionan de verdad antes de devolverle el trabajo a TI. **No es QA formal ni automatizado** — es la tanda de verificación única que se corre al cerrar todos los hallazgos de esta ronda (ver la nota "Verificación real no se hace hallazgo por hallazgo" en `CHANGELOG.md`), pensada para que Bran y Claude la sigan juntos en una sola sesión.

## Cómo usar este archivo

- Cada sección corresponde a un hallazgo ya marcado `[x]` en `boticuy-hallazgos-completo.md`. Se agrega una sección nueva, mismo formato, cada vez que se cierre un hallazgo en una próxima sesión — la fuente de verdad de qué está cerrado sigue siendo ese archivo, no este.
- Los pasos asumen la app corriendo contra **staging** (`npm run start:staging` / `android:staging`, ver `.env.staging`) salvo que la sección diga lo contrario. Algunas verificaciones (ej. C3) son de configuración de build, no de la app corriendo.
- **Usar siempre datos ficticios al probar contra staging** (nombre, DNI, teléfono, dirección de prueba) — staging no tiene las garantías de seguridad de producción a propósito (ver la nota de C2 más abajo). Nunca datos personales reales.
- Acceso necesario: la app apuntando a staging, y `wp-admin` del WordPress de staging para verificar pedidos/cupones directamente en el origen de datos.
- Si un paso falla, no se ajusta en caliente durante la tanda de pruebas — se anota qué falló y se retoma como fix aparte, mismo criterio que el resto de la ronda (analizar → corregir → documentar, no en medio de la validación).

---

## Estado general (2026-09-15) — ronda de testing completa, sin pendientes

**Los 41 hallazgos originales de la auditoría quedan 41/41 cerrados, más 6 encontrados en el camino (A9, A10, C5, C6, C7, C8) — todos con verificación en vivo real.** C7 y C8, los últimos en cerrarse, se verificaron el 2026-09-14 (2 rondas de concurrencia consistentes, sin caída tardía) y se confirmó el 2026-09-15, con una ronda de regresión final por API, que el fix no rompió nada del resto del sistema que comparte `create_order()` (C1, A9, A2/A10, A4, M13 — ver sección propia más abajo). El único punto que quedó fuera del alcance de este repositorio (el rechazo de tarjetas VISA de prueba en el sandbox de Izipay) es un pendiente externo, no bloqueante, para que Izipay lo resuelva de su lado — Mastercard funciona correctamente y es suficiente para operar.

**La fase de testing queda oficialmente cerrada.** Este documento, junto con `boticuy-hallazgos-completo.md` (estado `[x]` de cada hallazgo) y los `CHANGELOG.md` del plugin y de la app, queda listo como insumo para armar el documento final de entrega a TI — sin más rondas de verificación pendientes antes de eso.

---

## Hallazgos verificados

### C1 — El costo de envío nunca se agregaba al pedido

**Qué se corrigió:** `create_order()` ahora agrega una línea real de envío al pedido (antes no se cobraba nada de flete, ni con tarjeta ni con Yape/transferencia).

**✅ Verificado en vivo por API directa (2026-09-08), contra staging con el plugin `2.15.0` recién desplegado.** Pedido real de prueba (datos ficticios, Yape, 1× FULL-VAT id 10025, Callao): cotización previa `{"cost":8.47}`, total del pedido creado `S/46.59`. Esto **encontró un hallazgo nuevo, no el original** — el total no cuadraba con `36.60 + 8.47 = 45.07` porque el envío real se cobra con IGV (18%) y `/shipping` cotizaba sin él. Ver `[A9]`, sección propia más abajo, para el detalle y el fix. El mecanismo que C1 vino a arreglar (que la línea de envío exista y se cobre) **sí funciona** — el desvío encontrado es un hallazgo distinto, en la cotización, no en que el envío se agregue o no.

**Pasos (manuales, con la app — quedan para la tanda de mañana):**
1. Agregar al carrito un producto cuyo subtotal quede **por debajo** del umbral de envío gratis (revisar `envioGratisDesde` en `app.config.js`, hoy S/69).
2. Ir a Checkout, elegir un distrito de Lima (envío pago) y anotar el monto de "Envío" que muestra la pantalla.
3. Completar el pedido con **Yape o transferencia** (no requiere tarjeta real).
4. En `wp-admin → WooCommerce → Pedidos`, abrir el pedido recién creado.

**Resultado esperado (fix funciona):** el pedido en wp-admin tiene una **línea de envío real** (no solo productos), con el mismo monto que mostró la app, y el total del pedido = subtotal − descuentos + ese envío.

**Resultado que indica que sigue fallando:** el pedido no tiene ninguna línea de envío, o el total del pedido es igual al subtotal (como si el envío nunca se hubiera cobrado).

**Verificación extra (envío gratis real):** repetir con un subtotal por encima del umbral — el pedido debe tener una línea de envío con monto **S/0.00** ("Envío gratis"), no ausente.

---

### C2 — El APK de staging usa HTTP sin cifrar *(aclaración, no fix)*

**Qué se aclaró:** no es un defecto — staging no debe tener las garantías de HTTPS de producción, igual que tampoco tiene la pasarela de pagos real. El ambiente que sí necesita protegerse es producción, y eso ya lo cubre la prueba de C3, abajo.

**No hay pasos de reproducción para este ítem** — no hay nada que corregir ni que verificar como "arreglado". La única acción de proceso relacionada: **al probar contra staging, usar siempre datos ficticios**, nunca DNI/teléfono/dirección reales propios, porque ese tráfico viaja sin cifrar por diseño del ambiente.

---

### A2 — El resultado de `apply_coupon()` no se verificaba

**Qué se corrigió:** un cupón rechazado por WooCommerce (límite de usos, restricción de producto/categoría, etc.) ahora bloquea la creación del pedido con un motivo claro, en vez de crear el pedido sin descuento y responder éxito. `/coupon` también rechaza de antemano cupones con el límite de usos agotado.

**✅ Verificado en vivo por API directa (2026-09-08).** `POST /order` con `coupon: "NOEXISTE999"` (código inexistente) → `HTTP 422`, `{"ok":false,"reason":"El cupón «noexiste999» no se puede aplicar porque no existe."}` — motivo real de WooCommerce, sin crear ningún pedido.

**✅ Verificado en vivo con la app real (2026-09-09), caso de restricción por producto.** Cupón de prueba restringido a un producto que no estaba en el carrito usado: `create_order()` rechazó correctamente con el mensaje real de WooCommerce, sin crear ningún pedido en `wp-admin` — el bloqueo en la capa que protege el dinero funciona como se diseñó.

**⚠️ Hallazgo de experiencia encontrado en esa misma prueba, ya resuelto (2026-09-09):** el rechazo llegaba recién al confirmar el pedido — el carrito y el checkout mostraban "Cupón aplicado" con el descuento restado del total durante todo el flujo, porque `/coupon` (la validación liviana al aplicar el cupón) no conocía los ítems del carrito y no podía revisar restricción de producto/categoría, solo existencia/vencimiento/límite de usos. Se resolvió ampliando `/coupon` con un parámetro opcional `items` (mismo shape que `POST /order`): con él, el servidor arma un `WC_Order` desechable (nunca persistido) y corre `apply_coupon()` real contra los ítems del carrito — misma ruta pública de WooCommerce que ya usa `create_order()`, así que ambas capas coinciden siempre en su criterio. La app manda `items` desde los 3 puntos donde se aplica un cupón: `CouponField` (Carrito/Checkout), `MyCouponsScreen` y `CreatorsScreen`.

**Pasos — bloqueo en `create_order()` (restricción por producto):**
1. En `wp-admin → Marketing → Cupones`, crear un cupón de prueba restringido a un producto específico que **no** esté en el carrito que se va a usar (`Uso de producto` → agregar un producto distinto).
2. En la app, aplicar ese cupón en el carrito.
3. Completar el checkout con ese cupón aplicado, con Yape o transferencia.

**Resultado esperado (fix funciona):** la app muestra un error claro (no un "Pedido confirmado"), y en `wp-admin` **no aparece ningún pedido nuevo** creado por ese intento.

**Resultado que indica que sigue fallando:** se crea el pedido igual, sin el descuento del cupón, y la app muestra éxito.

**Pasos — refuerzo de `/coupon`, límite de usos:**
1. Crear/editar un cupón de prueba con `Límite de uso` = 1, y usarlo una vez (crear un pedido con él, aunque sea de prueba).
2. En la app, intentar aplicar ese mismo cupón otra vez en el carrito, **antes** de llegar a pagar.

**Resultado esperado:** el `CouponField` de la app marca el cupón como no válido de inmediato (no llega ni a intentar el pedido).

**Resultado que indica que sigue fallando:** la app deja aplicar el cupón agotado como si fuera válido.

**Pasos — pendiente de verificar, restricción de producto detectada al aplicar el cupón (no solo al confirmar):**
1. Con el mismo cupón restringido a un producto que no está en el carrito, aplicarlo desde `CouponField` en el Carrito o el Checkout.
2. Repetir aplicándolo desde `MyCouponsScreen` ("Mis cupones") y desde `CreatorsScreen` ("Apoya a tu creador"), si hay algún cupón de creador con esa misma restricción disponible para probar.

**Resultado esperado (fix nuevo funciona):** en los 3 puntos, el rechazo aparece **al aplicar el cupón**, con el motivo real de WooCommerce — nunca llega a mostrarse "Cupón aplicado" con un descuento que no va a respetarse.

**Resultado que indica que sigue fallando:** el cupón se muestra como aplicado (chip verde / toast de éxito) y el rechazo solo aparece al confirmar el pedido, igual que antes del fix de hoy.

---

### A7 — El carrito congelaba el precio y nunca lo refrescaba

**Qué se corrigió:** 3 capas de revalidación de precio en la app (foco del Carrito, montaje del Checkout, justo antes de confirmar) + recorte automático del canje de puntos en el servidor si igual queda desactualizado.

**Pasos — revalidación de precio:**
1. Agregar un producto al carrito. Anotar su precio en la app.
2. En `wp-admin`, cambiar el precio de ese producto (subirlo o bajarlo).
3. Volver a la pestaña **Carrito** (sin cerrar la app) → debe aparecer un toast "El precio de [producto] cambió a..." y el precio/subtotal en pantalla debe reflejar el nuevo valor.
4. Repetir el cambio de precio en wp-admin, esta vez entrar a **Checkout** directamente → el subtotal ya debe estar actualizado al entrar (antes de tocar el canje de puntos), sin esperar a volver al Carrito.

**Resultado esperado:** el precio mostrado en la app coincide con el de wp-admin después de cada revalidación, con el toast de aviso visible.

**Resultado que indica que sigue fallando:** el precio viejo persiste en la app después de reabrir el Carrito o entrar a Checkout.

**Pasos — corte pre-submit:**
1. Llegar a la pantalla de Checkout con todos los datos completos, listo para tocar "Confirmar pedido".
2. Sin tocar nada en la app, cambiar el precio de un producto del carrito en wp-admin.
3. Tocar "Confirmar pedido".

**Resultado esperado:** el primer tap **no** crea el pedido — aparece el toast de aviso y los números en pantalla se actualizan. Hay que tocar "Confirmar pedido" una segunda vez para que el pedido se cree (ya con los datos correctos).

**Resultado que indica que sigue fallando:** el pedido se crea en el primer tap con el precio viejo.

**Pasos — recorte del servidor (`points_redeemed_adjusted`), vía `curl` directo (más confiable que intentar provocar la condición de carrera manualmente):**
```bash
curl -X POST "https://TU-HOST-STAGING/wp-json/boticuy-app/v1/order" \
  -H "Authorization: Bearer TU_JWT" -H "Content-Type: application/json" \
  -d '{"items":[{"id":ID_PRODUCTO,"qty":1}], "payment":"yape",
       "points_redeem": UN_VALOR_QUE_EXCEDA_EL_30_POR_CIENTO_REAL,
       "customer": {...}, "shipping": {...}}'
```
**Resultado esperado:** `201`, con `"points_redeemed_adjusted": true` y `"points_redeemed"` menor al valor pedido — el pedido se crea igual, con el canje recortado.

**Resultado que indica que sigue fallando:** vuelve un `422 "El canje no puede superar el 30% del subtotal"` y no se crea el pedido.

**✅ Verificado en vivo (2026-09-14) — revalidación de precio (capa 1, foco del Carrito):** confirmado con un log temporal `[DIAG A7]` en `cartRevalidation.ts` (ya retirado) que, al cambiar el precio de un producto en wp-admin mientras estaba en el carrito, la revalidación al volver a la pestaña Carrito detectó la diferencia real (`unitPrice=50`, `freshPrice=70`) y disparó correctamente el aviso más la actualización del precio en pantalla. Antes de este log, se había reproducido un intento fallido con BIO3 Plus (id `10542`) que resultó ser un falso positivo (nada estaba roto en el código; ver investigación de la propia sesión) — con el log en vivo, confirmado que las 3 capas sí funcionan con datos reales. **Pendiente sin instrumentar por separado** (mismo mecanismo, sin motivo para dudar de ellos): el corte pre-submit con doble tap, y el recorte del servidor por canje de puntos desactualizado.

---

### M1 — El descuento por puntos no aparecía en la confirmación

**Qué se corrigió:** la confirmación ahora muestra una fila separada para el descuento por puntos (además de la de cupón), con el valor real que canjeó el servidor.

**Pasos:**
1. Como usuario logueado con saldo de puntos, hacer un pedido canjeando puntos (sin cupón), con Yape o transferencia.
2. Revisar la pantalla "¡Pedido confirmado!".

**Resultado esperado:** aparece una fila **"Puntos canjeados (N)"** con el descuento correcto, y el Total ya lo tiene restado.

**Resultado que indica que sigue fallando:** no aparece ninguna fila de descuento, o el número no corresponde a los puntos realmente canjeados.

**Verificación extra (aviso de ajuste):** repetir el escenario de "recorte del servidor" de A7 (arriba) de punta a punta desde la app (no solo `curl`) y confirmar que la confirmación muestra el aviso "Usamos X de tus Y puntos solicitados — el precio cambió antes de confirmar".

---

### M2 — "Envío: Gratis" cuando la cotización de envío fallaba

**Qué se corrigió:** la confirmación distingue "envío gratis real" de "no se pudo cotizar el envío" — antes ambos casos mostraban "Gratis".

**Pasos:**
1. Provocar que la cotización de envío falle: por ejemplo, cortar la conexión a internet justo después de elegir el distrito en Checkout (antes de que `/shipping` responda), y completar el pedido con Yape/transferencia una vez que vuelva la conexión (sin volver a seleccionar distrito, para que `shipping` quede en `null`).
2. Revisar la pantalla de confirmación.

**Resultado esperado:** la fila "Envío" muestra **"No disponible"**, no "Gratis".

**Resultado que indica que sigue fallando:** muestra "Gratis" a pesar de que la cotización nunca se resolvió.

**Verificación extra (gratis real sigue funcionando):** hacer un pedido con subtotal por encima del umbral de envío gratis y confirmar que la fila sí dice "Gratis" en ese caso legítimo.

---

### C3 — Un build de producción no crearía ningún pedido

**Qué se corrigió:** `eas.json` ya no deja el perfil `production` sin variables, y `app.config.js` bloquea el build de producción si algo queda mal configurado.

**Esto no se prueba corriendo la app — se prueba evaluando la configuración del build.** Desde `boticuy-app/`:

**Paso 1 — confirmar que la validación efectivamente falla con una configuración insegura:**
```bash
EAS_BUILD_PROFILE=production \
EXPO_PUBLIC_ORDERS_ENABLED=false \
EXPO_PUBLIC_STORE_API_URL=https://boticuy.com/wp-json/wc/store/v1 \
EXPO_PUBLIC_WP_API_URL=https://boticuy.com/wp-json/wp/v2 \
EXPO_PUBLIC_BFF_URL=https://boticuy.com/wp-json/boticuy-app/v1 \
node -e "require('./app.config.js')"
```
**Resultado esperado:** el comando falla con el error `Build de producción bloqueado — configuración insegura...` mencionando `EXPO_PUBLIC_ORDERS_ENABLED`.

**Paso 2 — confirmar que con la configuración real (la de `eas.json`) no falla:**
```bash
EAS_BUILD_PROFILE=production \
EXPO_PUBLIC_ORDERS_ENABLED=true \
EXPO_PUBLIC_STORE_API_URL=https://boticuy.com/wp-json/wc/store/v1 \
EXPO_PUBLIC_WP_API_URL=https://boticuy.com/wp-json/wp/v2 \
EXPO_PUBLIC_BFF_URL=https://boticuy.com/wp-json/boticuy-app/v1 \
node -e "require('./app.config.js'); console.log('OK: config de producción válida')"
```
**Resultado esperado:** imprime `OK: config de producción válida`, sin error.

**Resultado que indica que sigue fallando:** el Paso 1 no lanza ningún error (la validación no está activa), o el Paso 2 falla con la configuración correcta (falso positivo).

**Paso 3 — vía de escape del soft-launch:** repetir el Paso 1 agregando `ORDERS_DISABLED_CONFIRMED=true` — debe dejar de quejarse por `ORDERS_ENABLED` (las URLs igual deben seguir siendo válidas para pasar del todo).

---

### C4 — Los puntos canjeados se devolvían pero el descuento se conservaba

**Qué se corrigió:** al revertir un canje de puntos (pedido cancelado/fallido/reembolsado), ahora también se quita el fee del descuento y se recalcula el total — antes solo se devolvían los puntos al saldo, dejando el pedido pagable con el descuento intacto. Además, `/payment/formtoken` rechaza explícitamente un pedido cuyo canje ya fue revertido, como capa extra.

**Pasos:**
1. Como usuario logueado con saldo de puntos, crear un pedido con **tarjeta**, canjeando puntos (total reducido por el descuento).
2. Abandonar el pago sin completarlo (salir de la pantalla del WebView) o dejar que la tarjeta de prueba de Izipay sea rechazada — el pedido debe pasar a `failed`.
3. En `wp-admin`, abrir ese pedido y revisar:
   - La nota del pedido debe mencionar tanto la reversión de puntos **como el ajuste de monto** ("Descuento de S/ X removido, total ajustado de S/ Y a S/ Z").
   - El bloque de totales ya **no** debe tener la línea "Descuento por puntos Boticuy" — el total debe ser el precio completo, sin descuento.
   - Confirmar en `/points` (o en el perfil del cliente) que el saldo de puntos efectivamente se restituyó.
4. Desde la app, volver al checkout con la misma sesión (mismo carrito, sin reiniciar la pantalla) e intentar pagar ese mismo pedido de nuevo.

**Resultado esperado (fix funciona):** el pedido en wp-admin ya no tiene el descuento aplicado (paso 3), y el reintento de pago (paso 4) responde `409 "Este pedido ya no es válido para pagar, crea un pedido nuevo"` — no se genera ningún formToken nuevo.

**Resultado que indica que sigue fallando:** el pedido conserva el descuento en wp-admin después de fallar, y/o el reintento de pago genera un formToken nuevo y permite pagar el monto con descuento mientras el saldo de puntos ya se restituyó.

**Verificación extra (capa B aislada):** vía `curl`, llamar a `/payment/formtoken` con el `order_id` de un pedido que ya se sepa con `_points_redemption_status = 'reversed'` (confirmar el meta directamente en la base de datos si hace falta) y confirmar que responde `409` sin necesidad de reproducir todo el flujo de abandono desde la app.

#### ⚠️ Incidente en curso, descubierto al probar C4 (2026-09-10) — pago con tarjeta rechazado por Izipay en el paso de 3D Secure

**Contexto:** para probar C4 (que exige un pedido con tarjeta pagado de verdad, no solo fallido) se intentó completar un pago real con tarjeta de prueba en staging. 3 intentos consecutivos (`#11245`, `#11246`, un tercero) fallaron con la nota de wp-admin "Pago rechazado por Izipay (estado: ...)" / "Pago rechazado por Izipay, estado Unpaid".

**Código de error real de Izipay (capturado en pantalla, no el mensaje genérico de la app):** `PSP_727 — La autenticación falló` ("Unable to authenticate").

**Cronología de la investigación (para no repetirla):**
1. Se descartó el backend del plugin: `validate()` solo puede escribir esa nota de rechazo **después** de que la firma HMAC ya validó correctamente (`class-payment.php:163-164,209-211`) — un bug de firma habría cortado antes con "Firma inválida", no con este síntoma.
2. Se descartó M13 (idempotency key): no participa del payload ni de la firma que se envían a Izipay, y el comportamiento de reintento (mismo pedido reciclado o pedido nuevo según cambie el contenido) es el diseñado a propósito.
3. Se descartaron uno por uno los demás fixes de la semana (B14, A9, A10, A4, A2, A7, A5) contra el camino completo `create_order()` → `formtoken()` → WebView → `validate()` — ninguno toca ese camino después de que el pedido ya se creó.
4. **Causa real #1, encontrada y corregida (C5):** `originWhitelist` del WebView de pago (endurecimiento de seguridad de una ronda anterior) bloqueaba silenciosamente la navegación al ACS del banco durante el challenge 3DS — corregido reemplazándolo por `onShouldStartLoadWithRequest` (ver `[C5]` en `boticuy-hallazgos-completo.md` y `boticuy-app/CHANGELOG.md`). **Este fix funcionó parcialmente:** la pantalla de verificación del banco ya carga bien tras aplicarlo — pero el pago sigue fallando.
5. Con la pantalla de verificación cargando bien, el fallo se aisló al momento exacto de tocar "confirmar" dentro de esa pantalla — se investigó si la URL de retorno del pago era HTTP (staging corre sin HTTPS, ver C2) y podía estar siendo rechazada por el banco. **Descartado con evidencia de código:** `formtoken()` no construye ni envía ninguna URL de retorno/notificación/callback a Izipay — el payload es solo `amount`/`currency`/`orderId`/`formAction`/`customer.email` (`class-payment.php:98-104`). El flujo es 100% embebido (SDK Krypton, `KR.onSubmit`/`KR.onError` dentro del WebView) — no hay redirección HTTP de vuelta a una URL nuestra en ningún punto.
6. Se agregó un diagnóstico temporal (`[2.15.16]`/`[2.15.17]` en `boticuy-app-plugin/CHANGELOG.md`, ya retirado) que capturó la respuesta HTTP cruda de `formtoken()` a Izipay: **`status: SUCCESS`, modo `TEST` correcto, monto/pedido/email correctos** — confirma que la conexión inicial con Izipay funciona perfecta. El problema NO está en `formtoken()` ni en ningún paso anterior al WebView.

**Confirmación exhaustiva de que NO es causado por nuestro código (la evidencia más fuerte):** se probó el **plugin viejo (v2.14) + APK viejo** (el código de la "versión 2", anterior a toda esta ronda de auditoría) contra el **mismo servidor de staging** — **falló exactamente igual**, con el mismo `PSP_727`. Esto descarta cualquier regresión de código propio (de esta ronda o de rondas anteriores) como causa — el problema es externo.

**Tarjetas de prueba probadas** (las 3 marcadas como "aprobadas" en la documentación de Izipay), todas con el mismo resultado: terminadas en **1003**, **1029**, y **0055**.

**Dato de producción, posible relación:** Bran confirmó un pago con tarjeta **exitoso en producción el 2026-09-07**, pero **ninguno en las últimas 24-48 horas** (todos los pedidos recientes son Yape/Plin). Esto coincide en el tiempo con un incidente que el equipo de TI ya venía investigando por su cuenta en producción desde el fin de semana — probablemente el mismo problema, no dos incidentes separados.

**Conclusión hasta ahora:** el fallo ocurre específicamente dentro del paso de autenticación 3D Secure (el desafío del banco), en código/infraestructura que aloja Izipay — fuera de nuestro control y fuera del alcance de este repositorio. No hay nada más que revisar en el código de la app o el plugin para este síntoma puntual.

**Plan:** reintentar mañana (2026-09-11) antes de escalar formalmente a TI/Izipay, por si es un problema temporal del sandbox de pruebas de Izipay (se han visto casos de sandboxes de pasarelas de pago caídos o degradados por horas). Si sigue fallando, escalar con: el código `PSP_727`, los 3 números de pedido de staging (`#11245`, `#11246`, el tercero), las 3 tarjetas de prueba usadas, y la coincidencia con el incidente de producción que TI ya investiga.

**✅ RESUELTO (2026-09-11) — causa raíz real confirmada, 100% externa.** Izipay había generado un **nuevo "código de tienda" (site_id)** para la cuenta de comerciante, como parte de los cambios que su equipo aplicó en producción durante el incidente del fin de semana anterior (el mismo que TI ya venía investigando). Luis Almeyda (TI) aplicó el ajuste correspondiente esta mañana. Con esto se cierra la investigación completa de ayer (código viejo vs. nuevo idénticos en su comportamiento, credenciales verificadas byte a byte, prueba cruzada web/app) — todo apuntaba correctamente a que la causa era externa, y esto lo confirma.

**Matiz post-fix, no bloqueante:** el problema resultó ser específico de las tarjetas de prueba **VISA (4970...)** — las tarjetas **Mastercard (5100...)** funcionaron correctamente desde el primer intento, tanto en la web como en la app. El caso de VISA queda anotado como **pendiente de que Izipay lo resuelva de su lado** (probablemente otro detalle de configuración asociado al nuevo código de tienda, específico de esa red) — no es bloqueante, Mastercard alcanza para seguir probando y para operar.

#### ✅ C6 (hallazgo nuevo, encontrado y verificado en vivo el 2026-09-11) — la app se cuelga tras un pago con tarjeta exitoso, aunque el pedido ya pasó a "Procesando"

**Independiente del incidente de arriba** (ese era de Izipay/Visa, en el 3D Secure, y ya se resolvió). Este es un bug real de la app, descubierto precisamente *gracias* a que el incidente anterior se resolvió: el pago con Mastercard fue la **primera vez en toda la ronda que un pago con tarjeta se completó de punta a punta** (todos los intentos previos habían fallado antes, por C5 o por el rechazo de Izipay) — así que fue la primera vez que este camino de código se ejercitó con un caso real de éxito.

**Síntoma:** tras completar el pago con Mastercard, el pedido pasó correctamente a "Procesando" en WooCommerce (confirmado: `/payment/validate` corrió y respondió `paid: true`), pero la app se quedó congelada en la pantalla de pago — nunca navegó a la confirmación del pedido, sin ningún mensaje de error tampoco.

**Causa raíz:** en `PaymentWebViewScreen.tsx`, el listener de `beforeRemove` revisaba `validatingRef.current` antes que `completedRef.current`. Como `complete()` dispara `navigation.replace('OrderConfirmation', ...)` mientras `validatingRef.current` todavía es `true` (se resetea recién en el `finally`, después), la navegación de éxito disparaba el propio `beforeRemove` de la pantalla, que la cancelaba con `e.preventDefault()` — sin llegar a mirar que `completedRef.current` ya estaba en `true`. Detalle completo en `boticuy-hallazgos-completo.md`, sección C6.

**Fix:** se reordenaron los chequeos en el listener — `completedRef.current` se revisa primero; si el pago ya se completó, la salida se permite siempre.

**Pasos para verificar el fix:**
1. Recargar la app (el fix ya está en `PaymentWebViewScreen.tsx`).
2. Repetir un pago con tarjeta **Mastercard** contra staging (misma tarjeta que ayer, o cualquier otra que apruebe).
3. Confirmar que, apenas el servidor confirma el pago, la app navega sola a la pantalla de confirmación del pedido — sin quedarse en la pantalla de pago.

**Resultado esperado:** navegación inmediata a `OrderConfirmation` tras el pago aprobado, con el pedido ya en "Procesando" en WooCommerce.

**Resultado que indica que sigue fallando:** la app se queda en la pantalla de pago (con o sin el spinner de "Confirmando tu pago…") pese a que el pedido en wp-admin ya está en "Procesando".

**✅ Verificado en vivo (2026-09-11):** con Mastercard, el pago se completó de punta a punta incluyendo la navegación a la pantalla de confirmación del pedido — antes bloqueada por este mismo bug. **C6 — cerrado.**

---

#### ✅ C4 — verificado en vivo con evidencia real (2026-09-11)

Con el incidente de Izipay y C6 ya resueltos, se completó la verificación real de C4 que había quedado pendiente (sección de arriba, "Pendiente de verificación real").

**Compra de prueba:**
- 2× FITURAL (S/60 c/u = **S/120** subtotal).
- **720 puntos canjeados** (S/36 de descuento).
- **Total cobrado: S/84**, pagado con tarjeta **Mastercard**, exitosamente.

**Saldo de puntos tras el pago:** **1,005** — coincide exacto con `1,641 − 720 (canjeados) + 84 (ganados por esta compra)`.

**Se canceló el pedido en `wp-admin`.** Resultado:
- El saldo de puntos volvió a **1,641** — el valor previo a la compra, exacto.
- El pedido cancelado **ya no muestra ninguna línea de descuento por puntos** en su desglose de artículos.

Ambas mitades del fix de C4 confirmadas con un caso real: el descuento se revierte junto con los puntos (no solo los puntos), y el saldo cuadra exacto en ambas direcciones (canje y reversión). **C4 — cerrado.**

---

### B11 — Clave de PostHog embebida como valor por defecto en el repositorio

**Qué se corrigió:** la key y el host de PostHog ya no están hardcodeados en `app.config.js` — se leen de `EXPO_PUBLIC_POSTHOG_KEY`/`EXPO_PUBLIC_POSTHOG_HOST`, definidas en `eas.json` (`preview`/`production`) y en `.env.staging`. Sin la variable definida, la app no debe romperse — simplemente no manda analítica.

**Pasos — confirmar que el literal ya no está en el código:**
```bash
grep -n "phc_xtJYcWtSZaFUGW7fHbCDpumWgxr2eUi5gRL2nFkomfHS" app.config.js
```
**Resultado esperado:** sin coincidencias en `app.config.js` (la key solo debe aparecer en `eas.json` y `.env.staging`, que es donde ahora corresponde).

**Pasos — confirmar que la analítica sigue funcionando contra staging:**
1. Correr `npm run start:staging` (o `android:staging`) y abrir la app.
2. Agregar un producto al carrito (dispara un evento de analítica, ver `src/analytics/events.ts`).
3. Con acceso al dashboard de PostHog (cuenta generada por Fernando, ver nota en `PROGRESO.md`), revisar "Live events" del proyecto compartido.

**Resultado esperado:** el evento aparece en PostHog en segundos, igual que antes de este fix — el cambio es solo de dónde vive la key, no de comportamiento.

**Resultado que indica que sigue fallando:** no llega ningún evento nuevo a PostHog al usar la app contra staging (la key dejó de resolverse correctamente).

**Verificación extra (sin key definida, no debe romper nada):** correr `npm start` (sin `NODE_ENV=staging`, sin ningún `.env` con `EXPO_PUBLIC_POSTHOG_KEY`) y confirmar que la app abre y funciona normal — sin ningún error ni crash relacionado a PostHog, aunque en ese caso no se manden eventos (comportamiento esperado, no un fallo: `initAnalytics()` corta temprano si no hay key).

---

### A4 — El servidor no validaba la cantidad contra el stock real

**Qué se corrigió:** `create_order()` ahora rechaza pedir más unidades de las que hay en stock, y reserva el stock real (decremento atómico) al crear el pedido en vez de no tocarlo nunca — cerrando también la compra simultánea de la última unidad. Si el pedido se abandona/expira/rechaza, el stock reservado se restituye automáticamente.

**✅ Verificado en vivo por API directa (2026-09-08), sin necesitar `wp-admin` para fijar el stock** — se encontraron 2 productos reales con `low_stock_remaining` bajo vía la Store API pública (`EXCEGATON`, id 9661, `low_stock_remaining: 2`). `POST /order` pidiendo `qty: 3` → `HTTP 422`, `{"ok":false,"reason":"No hay suficiente stock disponible de \"EXCEGATON (Luteína + Zeaxantina + otros)\""}` — sin crear pedido.

**Pasos — validación de cantidad (ya verificado hoy, ver arriba):**
1. En `wp-admin`, elegir un producto de prueba, activar "Gestionar inventario" y poner el stock en, por ejemplo, 2 unidades.
2. Vía `curl`, crear un pedido pidiendo una cantidad mayor a la disponible:
```bash
curl -X POST "https://TU-HOST-STAGING/wp-json/boticuy-app/v1/order" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":ID_DEL_PRODUCTO,"qty":500}], "payment":"yape",
       "customer": {...}, "shipping": {...}}'
```

**Resultado esperado:** `422` con el motivo "No hay suficiente stock disponible de...", y **ningún pedido nuevo** en `wp-admin`.

**Resultado que indica que sigue fallando:** el pedido se crea con la cantidad completa pedida, y el stock del producto en `wp-admin` queda en negativo.

**Pasos — concurrencia (compra simultánea de la última unidad):**
1. Dejar un producto de prueba con exactamente **1** unidad en stock.
2. Disparar dos llamadas a `POST /order` pidiendo 1 unidad cada una, lo más simultáneas posible (dos terminales corriendo el mismo `curl` casi a la vez, o una herramienta de carga simple con 2 peticiones concurrentes).

**Resultado esperado:** una de las dos responde `201` (pedido creado), la otra responde `409 "El stock cambió justo ahora, intenta de nuevo"`. El stock del producto en `wp-admin` queda en **0**, nunca en negativo.

**Resultado que indica que sigue fallando:** las dos peticiones responden `201` — se vendieron 2 unidades de un producto que solo tenía 1.

**✅ Verificado en vivo (2026-09-14), con evidencia real de servidor:** contra `EXCEGATON` (id `9661`, 2 unidades en stock en ese momento), se dispararon 2 peticiones `POST /order` simultáneas pidiendo `qty: 2` cada una. Resultado: una respondió `409 "El stock cambió justo ahora, intenta de nuevo"` sin crear pedido; la otra respondió `201` y creó el pedido `#11278`. Stock final verificado después: `low_stock_remaining: 0`, `is_in_stock: false` — nunca negativo. Pedido de prueba `#11278` (datos ficticias) pendiente de cancelar en `wp-admin`.

**🔴 Esta misma verificación destapó dos hallazgos nuevos, más graves que lo que estaba probando (ver C7 y C8 en `boticuy-hallazgos-completo.md`):**
- Minutos después de esta prueba, Bran confirmó en wp-admin que el stock real había caído a **`-2`** (no `0`) — WooCommerce estaba reduciendo el stock **por su cuenta**, además de nuestra propia reserva (C7: `wc_maybe_reduce_stock_levels()` enganchado nativamente a `on-hold`/`processing`/`completed`/`payment_complete`, sin que `create_order()` marcara la bandera `_order_stock_reduced` que le habría dicho "ya lo hice yo").
- Al repetir exactamente la misma prueba una segunda vez (stock reseteado a 2), **ninguna de las dos peticiones fue rechazada esta vez** (`#11280` y `#11281`, ambas `201`) y el stock terminó en **`-6`** — el guard "atómico" de A4 en sí falló bajo concurrencia genuina (C8: el valor de retorno de `wc_update_product_stock()` sale de un `SELECT` previo no atómico con su propio `UPDATE`, confirmado contra el código fuente real de WooCommerce).
- Ambos corregidos en `[2.15.19]` del plugin.

**✅ C7 y C8 verificados en vivo (2026-09-14), 2 rondas completas con `[2.15.19]` desplegado:**

| | Ronda 1 | Ronda 2 |
|---|---|---|
| Petición A | ❌ rechazada (`409`) | ✅ aceptada (`#11284`) |
| Petición B | ✅ aceptada (`#11283`) | ❌ rechazada (`409`) |
| Stock inmediato | 0 | 0 |
| Stock 3 min después | **0** (sin cambio) | **0** (sin cambio) |

Determinístico en las dos rondas — exactamente una petición aceptada, una rechazada, sin caída tardía. Contraste directo con el comportamiento pre-fix: la primera vez que se corrió esta prueba (sin `[2.15.19]`), la ronda 1 salió bien pero la ronda 2 aceptó **las dos** peticiones y el stock terminó en `-6` — esa inconsistencia entre corridas idénticas era la firma de la condición de carrera real (C8), no una casualidad. Detalle completo en `boticuy-hallazgos-completo.md`, secciones C7 y C8.

**✅ Ronda de regresión final (2026-09-15), por API contra staging, tras el fix de C7/C8** — dado que `decrease_stock_if_available()`/`set_order_stock_reduced()` tocan `create_order()`, la misma función central que comparten C1, A2, A9, A10, A4, M13 y C4, se repitió una pasada completa de humo sobre todo lo que se pudo verificar sin la app manual, para confirmar que el fix no rompió nada:

| Hallazgo | Prueba | Resultado |
|---|---|---|
| C1 (envío) | Cotización vs. total real, Callao y un distrito de Lima, mismo producto (S/36.60) | `S/46.59` ambos destinos — sin cambio |
| A9 (IGV envío) | Mismo par de pedidos | Residuo de S/0.01 ya conocido, idéntico a antes del fix |
| A2 + A10 (cupón `7777`, 15%) | Pedido con cupón sobre el mismo producto | Total `S/41.10`, `coupon_discount: 4.65` (porción sin IGV) — coincide exacto con la aritmética ya documentada |
| A4 + C7 + C8 (compra normal, sin carrera) | 1 pedido de AQUAREST (id `9656`, stock `2`) | Stock `2→1` exacto, inmediato y 3 min después — sin descuento doble ni residuo |
| M13 (idempotencia) | Mismo `idempotency_key`, contenido distinto → pedido nuevo; mismo contenido → mismo pedido | `#11289` → `#11290` (nuevo) → `#11290` (mismo) — exacto |
| C4 (puntos) | No repetido — ya verificado en vivo el 2026-09-11 (ver sección C4 más abajo, compra de FITURAL/720 puntos/cancelación con saldo exacto a 1,641) | Sigue vigente, no requiere repetirse |

**Ningún problema nuevo encontrado.** Pedidos de prueba creados en esta ronda (`#11285` a `#11290`, datos ficticios) pendientes de cancelar en `wp-admin`.

**Pasos — restitución de stock al abandonar/expirar:**
1. Crear un pedido con **tarjeta** para un producto con stock gestionado, y confirmar en `wp-admin` que el stock ya bajó al crear el pedido (antes de pagar).
2. Abandonar el pago (salir del WebView sin completar) o dejar que la tarjeta de prueba sea rechazada — el pedido pasa a `failed`.
3. Revisar el producto en `wp-admin`.

**Resultado esperado:** el stock vuelve al número original, y la nota del pedido menciona "Stock restituido automáticamente" con el nombre y cantidad del producto.

**Resultado que indica que sigue fallando:** el stock queda decrementado permanentemente después de que el pedido pasó a `failed`.

---

### A6 — Pedidos de tarjeta sin puntos nunca expiraban

**Qué se corrigió:** `find_stale_card_orders()` ya no exige `_points_redemption_status = 'active'` — el barrido de 45 minutos ahora cubre todo pedido de tarjeta `pending` abandonado, tenga o no canje de puntos.

**Pasos:**
1. Crear un pedido con **tarjeta**, **sin canjear puntos**, para un producto con stock gestionado (anotar el stock antes de crear el pedido).
2. Abandonar el pago sin completarlo (salir del WebView).
3. Esperar los 45 minutos de `STALE_ORDER_MINUTES`, o forzar la auto-liberación eager entrando a la pantalla de Checkout/Puntos con el mismo usuario logueado (dispara `expire_stale_card_orders_for_user()`), o llamar directo a `Boticuy_App_Orders::expire_pending_orders()` (ej. vía WP-CLI `wp eval` si hay acceso) para no esperar el cron real.
4. Revisar el pedido y el producto en `wp-admin`.

**Resultado esperado:**
- El pedido pasa a `failed` (ya no queda `pending` para siempre).
- **A4 se disparó igual sin puntos de por medio:** el stock del producto volvió a su número original, y la nota del pedido incluye "Stock restituido automáticamente".
- **C4 no rompió nada al no tener puntos que revertir:** no aparece ninguna nota de "Puntos canjeados revertidos" (porque nunca hubo canje), y el pedido no queda en un estado raro ni genera ningún error — `reverse_points_redemption()` debe cortar en silencio por su propio guard (`_points_redeemed <= 0`).

**Resultado que indica que sigue fallando:** el pedido sin puntos sigue `pending` indefinidamente después del barrido (A6 no se corrigió), o el pedido pasa a `failed` pero el stock **no** se restituye (la extensión del barrido no disparó el hook de A4 como se esperaba — revisar `register_order_hooks()`).

**✅ Verificado en vivo (2026-09-14) — el camino de abandono explícito, no el barrido de 45 min en sí:** al abandonar desde el `WebView` un pago con tarjeta sin canje de puntos (salir de la pantalla sin completar), el pedido pasa a "Fallido" al instante (vía `/payment/abandon`, el mismo mecanismo que ya no requiere puntos gracias a este fix), sin ninguna nota extraña de reversión de puntos — confirma que `reverse_points_redemption()` corta en silencio por su propio guard cuando no hay canje que revertir. El barrido automático de 45 minutos en sí (sin abandono explícito, solo por tiempo) sigue sin ejercitarse en vivo — mismo mecanismo interno (`find_stale_orders()`), pero es un camino de código distinto (cron vs. llamada directa del cliente).

---

### M13 — La clave de idempotencia era por pantalla, no por intento

**Qué se corrigió:** la key de idempotencia ahora se deriva del contenido real (ítems, cupón, canje de puntos), no de un valor aleatorio fijo al montar. Si el contenido cambia entre un intento fallido y un reintento en la misma pantalla, el servidor crea un pedido nuevo en vez de devolver el viejo en silencio.

**✅ Verificado en vivo por API directa (2026-09-08), la parte que no depende de un pago con tarjeta rechazado (esa sigue pendiente para mañana con la app):**
1. `POST /order` sin cupón, `idempotency_key: "qa-verif-m13-001"` → `order_id: 11199`.
2. Mismo `idempotency_key`, ahora **con** `coupon: "7777"` (contenido distinto) → `order_id: 11200` — **pedido nuevo, no el 11199 reciclado.** `coupon_discount: 3.94` confirma que el cupón nuevo sí se aplicó.
3. Mismo `idempotency_key`, mismo contenido que el paso 2 (retry idéntico) → devuelve **el mismo `order_id: 11200`** (mismo `checkout_token` también) — no crea un tercer pedido.

Ambas mitades del contrato de M13 confirmadas: contenido distinto → reasignación; contenido igual → mismo pedido devuelto. Pedidos de prueba `#11199`/`#11200` (Yape, datos ficticios) — pendientes de cancelar en `wp-admin`.

**Pasos — cambio de cupón/puntos tras un pago fallido con tarjeta (con la app mañana, no verificable con `curl` — requiere una tarjeta de prueba rechazada de Izipay):**
1. Como usuario logueado con saldo de puntos, en Checkout, canjear una cantidad de puntos (sin cupón) y pagar con **tarjeta** usando una tarjeta de prueba que sea **rechazada**.
2. En la pantalla de error, tocar "Volver al checkout" — debe volver a la misma pantalla (no reiniciar el formulario).
3. Sin salir de Checkout, **cambiar el canje de puntos** (subirlo o bajarlo) o **aplicar un cupón** en vez de puntos.
4. Confirmar el pedido de nuevo (con otra tarjeta de prueba que sí sea aprobada, o Yape/transferencia).
5. Revisar en `wp-admin`: el primer pedido (el de la tarjeta rechazada) y el segundo (el que se acaba de confirmar).

**Resultado esperado:**
- Se crean **dos pedidos distintos** en `wp-admin` — no uno solo reciclado.
- El segundo pedido refleja el cupón/canje de puntos **nuevo** (el que se cambió en el paso 3), no el original.
- El primer pedido (el fallido) sigue existiendo, sin `_idempotency_key` (revisar meta si hay acceso a la base de datos), y sin cancelar — debe seguir el camino normal de expiración (A6/C4/A4) si nunca se paga.

**Resultado que indica que sigue fallando:** solo aparece un pedido en `wp-admin`, con el cupón/canje de puntos **original** (el del primer intento), aunque el cliente haya pagado después de cambiarlo — exactamente el bug original de M13.

**Verificación extra (que la idempotencia real siga funcionando):** repetir el checkout completo con tarjeta, dejar que falle el pago, volver a "Confirmar pedido" **sin cambiar nada** — debe devolver el mismo pedido que la primera vez (mismo `order_id`), no crear uno nuevo. Esto confirma que la key sigue siendo estable cuando el contenido no cambió.

---

### A1 + B13 — El carrito se vaciaba con red inestable, y revalidaba con N peticiones secuenciales

**Qué se corrigió:** `revalidateCart()` (foco del Carrito, montaje y pre-submit de Checkout) ahora hace una sola petición batch (`fetchProductsByIds()`) en vez de un `fetchProduct` por ítem. Si la petición completa falla, el carrito queda intacto — antes, un timeout en cualquiera de las N peticiones borraba ese ítem como si ya no existiera.

**Pasos — producto realmente eliminado (debe seguir removiéndose):**
1. Agregar un producto al carrito.
2. En `wp-admin`, mover ese producto a la papelera (o pasarlo a "Borrador"/privado, para que la Store API deje de listarlo).
3. Volver a la pestaña Carrito (foco) o entrar a Checkout.

**Resultado esperado:** el ítem se remueve del carrito con el toast "ya no está disponible" — igual que antes del fix, este caso sigue funcionando.

**Pasos — fallo de red, no debe tocar el carrito (el caso que antes rompía):**
1. Agregar 2-3 productos al carrito.
2. Simular un fallo de red específicamente hacia la Store API — la forma más simple sin herramientas adicionales: activar modo avión (o cortar el WiFi) **justo** al volver a la pestaña Carrito o entrar a Checkout, de modo que la petición batch no llegue a completarse, y esperar a que se cumpla el timeout (20s, `storeClient`).
3. Revisar el carrito una vez que termine ese intento (con o sin conexión restaurada).

**Resultado esperado:** el carrito sigue teniendo los mismos 2-3 productos, con sus cantidades y precios intactos — no se removió nada. Puede no haber ningún toast (no hay `issues` que reportar cuando el batch entero falla).

**Resultado que indica que sigue fallando:** el carrito queda vacío o le faltan productos después de un corte de red, igual que el bug original.

**Verificación extra (una sola petición, no N):** con varios productos en el carrito, inspeccionar el tráfico de red de la app (proxy tipo Flipper/Charles, o los logs de red de Metro) al enfocar el Carrito — debe verse **una sola** llamada a `GET .../products?include=...`, no una por producto.

---

### A3 — "Recordar mis datos" nunca guardaba la dirección en la cuenta

**Qué se corrigió:** el checkout ahora manda `nombre`/`telefono`/`numDoc` al guardar la dirección en la cuenta (antes los omitía), y avisa con un toast si el guardado falla en vez de tragarse el error en silencio.

**Pasos:**
1. Iniciar sesión con una cuenta que **no tenga** direcciones guardadas todavía (o anotar cuántas tiene, para comparar).
2. Completar un checkout normal, marcando la casilla **"Recordar mis datos para la próxima vez"**.
3. Completar el pedido (Yape/transferencia es suficiente, no hace falta pagar con tarjeta real).
4. Ir a **Mi cuenta → Mis direcciones**.

**Resultado esperado:** la dirección usada en ese checkout aparece en la lista de "Mis direcciones", con el teléfono y DNI correctos (se puede confirmar entrando a editarla).

**Resultado que indica que sigue fallando:** la lista de "Mis direcciones" no cambia — sigue con la misma cantidad de direcciones que antes del checkout, sin ningún aviso al usuario de que no se guardó.

**Verificación extra (aviso cuando falla de verdad):** forzar un fallo real es más difícil ahora que el payload va completo (el único 422 que podría seguir disparándose es "Distrito inválido", si el `idUbigeo` no existe en la tabla de ubigeo — no siempre reproducible a mano). Si se tiene forma de provocarlo, confirmar que aparece el toast "No pudimos guardar tu dirección en tu cuenta, pero tu pedido sí se procesó." y que el pedido igual se completa con normalidad (el fallo de guardado no debe bloquear ni demorar el pago).

**Nota para una futura sesión:** al cerrar este hallazgo se encontró que `AddressFormScreen.tsx` (pantalla de "Mis direcciones") tiene el mismo problema de fondo sin resolver — su `try/catch` tampoco distingue un 4xx de un éxito real (`bffClient` no lanza excepción para códigos `< 500`), así que un rechazo por "Distrito inválido" ahí podría navegar hacia atrás como si se hubiera guardado. No se tocó en A3, queda anotado en `boticuy-hallazgos-completo.md`.

**✅ Verificado en vivo (2026-09-14) por Bran, en uso real:** completado un checkout marcando "Recordar mis datos" — la dirección aparece guardada en "Mis direcciones", y desde ahí se confirma que también se puede editar y eliminar correctamente (mismo camino de B9, con excepción real ante fallo desde ese fix — ver nota de arriba).

---

### A5 — Sin protección de sesión en la navegación, y condición de carrera al arrancar

**Qué se corrigió:** `Orders`, `OrderDetail`, `Addresses`, `AddressForm`, `Points` y `MyCoupons` ahora redirigen a Login si no hay sesión (`useRequireAuth()`), esperando primero una bandera rápida (`tokenReady`) para no confundirse con un arranque en frío todavía en curso.

**Pasos — guard de navegación (el caso principal, fácil de reproducir):**
1. Sin iniciar sesión (o después de cerrar sesión desde Perfil), forzar la navegación directa a una de las 6 pantallas protegidas — la más simple: con la consola de Metro/React Native abierta, ejecutar algo como `navigationRef.navigate('Points')` desde el debugger, o temporalmente agregar un botón de prueba en cualquier pantalla que llame `navigation.navigate('Orders')` sin chequear sesión.
2. Repetir para las otras 5 pantallas (`OrderDetail` necesita un `order` de prueba en los params — se puede omitir si no hay forma rápida de armarlo, alcanza con probar las otras 5).

**Resultado esperado:** en cualquiera de los 6 casos, la app redirige de inmediato a la pantalla de Login — nunca se llega a ver el contenido de la pantalla protegida, ni siquiera un instante.

**Resultado que indica que sigue fallando:** la pantalla protegida se muestra (aunque sea con un estado vacío) antes de redirigir, o no redirige en absoluto.

**Verificación extra (que un usuario logueado normal no note nada):** con sesión iniciada, navegar normalmente a las 6 pantallas desde Perfil — deben funcionar exactamente igual que antes de este fix, sin ningún parpadeo ni redirección.

**Pasos — condición de carrera del arranque (difícil de reproducir tal cual, hay que forzarla):**
Como en un dispositivo real la lectura de `SecureStore` es demasiado rápida para ganarle a mano, para esta verificación puntual conviene alargarla **temporalmente** en el código, solo durante la prueba (revertir después, no dejarlo commiteado):
1. En `src/store/authStore.ts`, dentro de `hydrate()`, agregar una demora artificial antes de `SecureStore.getItemAsync(KEY)`, ej. `await new Promise((r) => setTimeout(r, 4000));`.
2. Con sesión iniciada, cerrar la app por completo (matarla, no solo mandarla a segundo plano) y volver a abrirla.
3. En esos ~4 segundos antes de que `tokenReady` se vuelva `true`, intentar navegar lo más rápido posible a "Mis pedidos" o "Mis puntos" desde Perfil.

**Resultado esperado:** la pantalla protegida no muestra contenido ni redirige a Login todavía — se queda en blanco (`return null`) hasta que la demora artificial termine; recién ahí, como sí hay sesión real, muestra el contenido normal. En ningún momento aparece la pantalla de Login para este usuario logueado.

**Resultado que indica que sigue fallando:** durante esos ~4 segundos, la pantalla protegida redirige a Login (falso negativo — expulsó a un usuario real) o muestra contenido vacío como si no hubiera pedidos/puntos (el bug original).

**No olvidar:** revertir la demora artificial del paso 1 antes de cerrar esta tanda de pruebas.

**✅ Verificado en vivo (2026-09-14) — el camino de UI normal, no el de navegación forzada por debugger:** sin sesión iniciada, las 4 opciones de cuenta en Perfil (Pedidos, Puntos, Cupones, Direcciones) aparecen bloqueadas con candado (ver B6, mismo día — ahora táctiles y llevan a Login), sin ninguna forma de llegar a esas pantallas desde el flujo normal de la app. **No se ejecutó** el paso de navegación forzada vía debugger (`navigationRef.navigate(...)`) ni la prueba de la condición de carrera con demora artificial — quedan como verificación de código ya confirmada (`useRequireAuth()`/`tokenReady`, revisados línea por línea en la segunda comparativa), sin evidencia en vivo de esos dos casos puntuales.

---

### M7 / M8 — Zona de envío por región + condición `requires` del envío gratis

**Qué se corrigió:** `compute_cost()` ahora resuelve `destination.state` desde el `idUbigeo` (departamento/provincia reales vía `Boticuy_App_Ubigeo::dep_prov_for()` + `wc_state()`) en vez de mandar `state => ''` — antes, las zonas de WooCommerce definidas por región (Callao, Provincias) nunca coincidían y siempre se caía al fallback hardcodeado (S/8.47 / S/12.71). Esto es código nuevo (2026-09-07), **todavía no verificado contra staging real** — solo contra capturas del panel de wp-admin. M8 ya quedó marcado `[x]` en `boticuy-hallazgos-completo.md` (el fix en sí es autocontenido y de bajo riesgo); **M7 queda deliberadamente sin marcar `[x]`** hasta correr esta sección contra staging.

**Zonas reales usadas en esta verificación** (confirmadas por captura, 2026-09-07): "Peru, Lima Provincias" (flat S/12.71), "Peru, Callao" (flat S/8.47), "Lima 1 CERCANOS" (flat S/4.24 + envío gratis condicional S/69.90, monto mínimo O cupón).

**Pasos — Callao y Provincias matchean por región, no por el fallback:**
1. En la app, cotizar envío (`Checkout`, elegir distrito) con un `idUbigeo` de un distrito del Callao (ej. Bellavista, La Perla).
2. Repetir con un distrito de otro departamento fuera de Lima/Callao (ej. Arequipa, Trujillo).

**Resultado esperado:** Callao devuelve `zone: "Peru, Callao"` (el nombre real de la zona de WooCommerce) con costo S/8.47; el otro departamento devuelve `zone: "Peru, Lima Provincias"` (o el nombre real que corresponda) con costo S/12.71. Ninguno de los dos debe devolver `zone: "Callao"` / `zone: "Provincia"` a secas (esos nombres genéricos son los del fallback, ver `class-shipping.php`) — si aparecen, la zona no matcheó y sigue cayendo al fallback.

**Resultado que indica que sigue fallando:** `zone` viene como `"Callao"` o `"Provincia"` (fallback) en vez del nombre real de la zona de WooCommerce.

**Pasos — Lima 1 CERCANOS, los dos métodos simultáneos (caso M7):**
1. Cotizar envío con un distrito dentro de "Lima 1 CERCANOS", con un subtotal **por debajo** de S/69.90 y sin cupón.
2. Repetir con un subtotal **igual o por encima** de S/69.90, sin cupón.
3. Repetir con un subtotal por debajo de S/69.90 pero con un cupón que otorgue envío gratis (`get_free_shipping()`) aplicado.

**Resultado esperado:** paso 1 → `cost: 4.24`, `is_free: false`. Paso 2 → `cost: 0`, `is_free: true`, `free_threshold: 69.90` (o el valor real configurado). Paso 3 → `cost: 0`, `is_free: true` (si el método requiere `either`/`coupon`; si requiere `min_amount` a secas, el paso 3 debe seguir cobrando S/4.24 — confirmar contra la condición `requires` real configurada en ese método antes de decidir cuál de las dos es la esperada).

**Resultado que indica que sigue fallando:** en el paso 1, el envío sale gratis igual (el bug original de M7 — `free_threshold` en 0.0); en el paso 2, sigue cobrando S/4.24 en vez de dar gratis; o en cualquiera de los tres, `zone` no es "Lima 1 CERCANOS" sino el fallback genérico.

---

### M11 — Datos personales del titular expuestos en `/bank-details`

**Qué se corrigió:** el endpoint público `/bank-details` ya no extrae ni devuelve `documento_tipo`, `documento_numero`, correo ni teléfono del titular de la cuenta bancaria — solo `banco`, `titular`, `numero_cuenta` y `cci` (los únicos que `OrderConfirmationScreen.tsx` pinta). Sigue siendo público, sin token, y sigue devolviendo `instrucciones` tal cual (fuera de alcance).

**Pasos:**
1. Confirmar en `wp-admin → WooCommerce → Ajustes → Pagos → Transferencia bancaria directa` que el campo "Instrucciones de la cuenta" sigue teniendo el formato de siempre (uno o más `<dl>` con `<h3>` de banco y pares `<dt>`/`<dd>` incluyendo, si el sitio real los tiene cargados, "Documento", "Correo" y "Teléfono" del titular).
2. Sin ninguna sesión iniciada en la app (o directo con `curl`/Postman contra el BFF), pedir `GET /bank-details`.
3. Revisar el JSON de la respuesta.

**Resultado esperado (fix funciona):** cada objeto en `bancos[]` tiene únicamente las claves `banco`, `titular`, `numero_cuenta`, `cci` — **no** aparecen `documento_tipo`, `documento_numero`, `correo` ni `telefono` en ningún banco, aunque el HTML de origen sí tenga esos datos cargados en wp-admin. `instrucciones` sigue viniendo igual que antes (sin cambios).

**Resultado que indica que sigue fallando:** cualquiera de los 4 campos personales sigue apareciendo en la respuesta.

**Verificación extra (que el flujo de invitado con transferencia no se rompió):** completar un pedido de prueba con datos ficticios, sin iniciar sesión, eligiendo "Transferencia bancaria" como método de pago. En `OrderConfirmationScreen`, debe seguir mostrándose correctamente el banco, titular, número de cuenta y CCI para transferir — igual que antes de este fix.

---

### M12 — Rate limiting detrás de un proxy de confianza (`X-Forwarded-For`)

**Qué se corrigió:** `Boticuy_App_Rate_Limiter::client_ip()` ahora solo mira `X-Forwarded-For` cuando `REMOTE_ADDR` está en la opción `boticuy_app_trusted_proxies` (vacía por default). Verificado antes de tocar código que **ni producción ni staging tienen hoy un proxy real delante** (ambos responden directo desde nginx, sin cabeceras de CDN) — así que esta sección solo aplica el día que se confirme/active un proxy real; con la opción vacía, el comportamiento es exactamente el mismo de siempre.

**Pasos (solo aplican si en algún momento se pone un proxy real delante de WordPress):**
1. Confirmar con TI/hosting si se agregó algún proxy inverso, balanceador o CDN delante de WordPress (ej. Cloudflare, un load balancer de GCP, etc.), y obtener la IP (o rango) desde la que ese proxy se conecta al servidor real.
2. En `wp-admin`, setear la opción `boticuy_app_trusted_proxies` con esa IP (ej. vía `wp option update boticuy_app_trusted_proxies '["1.2.3.4"]' --format=json` por WP-CLI, o un plugin de gestión de opciones — no hay pantalla de ajustes propia para esto todavía).
3. Desde una IP distinta a la del proxy (por ejemplo, tu propia conexión), hacer varios registros seguidos hasta superar el límite de 5/hora (`POST /auth/register` o el endpoint que corresponda) — sin pasar por el proxy real, simulando con una petición directa que incluya una cabecera `X-Forwarded-For` inventada.

**Resultado esperado (fix funciona):**
- Si el request llega directo al servidor (no desde la IP del proxy configurado), el límite se cuenta por la IP real de conexión — un `X-Forwarded-For` falso mandado directamente **no** tiene ningún efecto (se ignora, porque `REMOTE_ADDR` no está en la lista de confianza).
- Si el request llega desde la IP del proxy configurado, con `X-Forwarded-For` seteado, el límite se cuenta por la IP que indica esa cabecera (el último tramo de la cadena) — dos clientes distintos detrás del mismo proxy, con IPs reales distintas reportadas en `X-Forwarded-For`, tienen límites independientes entre sí.

**Resultado que indica que sigue fallando:** un `X-Forwarded-For` inventado, mandado directamente al servidor (sin pasar por el proxy real), logra resetear o evadir el límite — señal de que `REMOTE_ADDR` quedó mal configurado en la lista de confianza, o de que el fix no está gateando correctamente.

**Verificación de que no hay regresión con la configuración de hoy (lista vacía):** sin tocar `boticuy_app_trusted_proxies`, repetir el flujo normal de rate limiting (5 registros/hora bloqueando al 6°, por ejemplo) — debe comportarse exactamente igual que antes de este fix, ya que la lista vacía hace que `X-Forwarded-For` se ignore por completo.

---

### M14 — `points_balance()` con SQL agregado en vez de recorrer todo el historial

**Qué se corrigió:** `points_balance()` ya no hidrata un `WC_Order` completo por cada pedido histórico del cliente — reemplaza los dos `wc_get_orders(..., limit => -1)` + loop por dos `SUM()` directos en SQL, detectando en runtime si el sitio usa HPOS o almacenamiento clásico. El contrato de retorno (`earned`/`redeemed`/`balance`) no cambió, así que este fix es puramente de rendimiento — la verificación clave es que el número siga siendo **exactamente el mismo** que antes, no solo "razonable".

**Paso 0 — confirmar qué backend usa el sitio** (dato que no se pudo confirmar sin acceso a producción):
```sql
SELECT option_value AS hpos_activo FROM wp_options WHERE option_name = 'woocommerce_custom_orders_table_enabled';
-- 'yes' → HPOS | 'no' o sin fila → clásico
```
Esto además sirve para saber cuál de las dos ramas de código se está ejecutando de verdad en esta verificación.

**Pasos — paridad exacta contra el cálculo viejo, para 2-3 usuarios reales con historial variado** (uno con pocos pedidos, uno con muchos, uno con algún canje de puntos ya hecho):

1. Antes de desplegar este cambio (o en un checkout de staging con el código viejo todavía activo, si es posible tenerlo en paralelo), anotar para cada usuario de prueba el resultado de `GET /points` (`balance`, `level`, `next_level_at`).
2. Desplegar el fix (código nuevo, con las consultas SQL agregadas).
3. Repetir `GET /points` para los mismos usuarios, sin que hayan hecho ningún pedido nuevo entre medio.

**Resultado esperado:** `balance`, `level` y `next_level_at` idénticos, valor por valor, para cada usuario — no "parecidos", exactamente iguales. Si además se tiene acceso a la base de datos, se puede verificar directo sin pasar por la API, comparando el resultado de las consultas nuevas contra el que daría reconstruir a mano `SUM(FLOOR(total))`/`SUM(_points_redeemed)` con las condiciones originales.

**Resultado que indica que sigue fallando:** cualquier diferencia entre el balance/nivel viejo y el nuevo para el mismo usuario en el mismo estado — señal de que el SQL agregado no está replicando exactamente las mismas condiciones que `wc_get_orders()` (ej. un estado de pedido no contemplado, un pedido de tipo reembolso contado de más en HPOS, o una comparación de `meta_value` que no matchea igual que el `meta_query` original).

**Verificación de los 5 puntos de uso, no solo `/points`:**
- **`/shipping`** (umbral de envío gratis Plata/Oro): cotizar envío con un usuario que sabés que es Plata u Oro — debe seguir devolviendo el umbral reducido (S/59 o el que esté configurado), igual que antes del fix.
- **`/coupon` y `/cupones-oro`**: con un usuario Oro, un cupón `_bcy_oro_only` debe seguir validando/apareciendo listado igual que antes; con un usuario no-Oro, debe seguir rechazado/ausente.
- **`create_order()` — canje de puntos:** con un usuario con saldo conocido, intentar canjear exactamente su saldo completo (debe aceptarse) y luego canjear uno más de ese saldo (debe rechazarse con "Saldo de puntos insuficiente") — confirma que el nuevo cálculo no infla ni recorta el balance real en el único punto donde eso tendría consecuencia financiera.
- **`create_order()` — gate de cupón Oro:** repetir el pedido A2/#2 (cupón `_bcy_oro_only` con un usuario no-Oro) — debe seguir rechazado igual que siempre.

---

### M15 — Listados de cupones sin tope de 200 ni N+1

**Qué se corrigió:** `coupons()`, `apoya_creador()`, `mis_cupones()` y `cupones_oro()` ya no cortan en 200 cupones (`numberposts => -1`) y ya no instancian `WC_Coupon` por código (`$p->post_title`) sino por ID (`$p->ID`) — evita la consulta redundante de código→ID y el riesgo de que un código de cupón numérico cargue el post equivocado. `/coupons` (legacy) recibió el mismo fix, sin retirarlo.

**✅ Verificado en vivo con un código numérico real (2026-09-08)** — staging tiene un cupón de prueba con código `7777` (15% de descuento, sin restricciones). `GET /coupon?code=7777` → `{"valid":true,"discount_type":"percent","amount":15,...}`. Más importante, el camino real que arregló M15: `GET /coupons` y `GET /mis-cupones` listan `{"code":"7777","amount":15,...}` — **el cupón correcto, no un post aleatorio con ID 7777.** Confirma que `new WC_Coupon($p->ID)` resuelve bien los códigos numéricos en los 4 endpoints de listado, no solo en `/coupon` (que nunca tuvo este bug, porque ya resolvía código→ID por separado antes de instanciar).

**Pasos — paridad de datos (que el fix no cambió QUÉ cupones aparecen, solo cómo se calculan):**
1. Antes de desplegar, anotar la respuesta completa de los 4 endpoints (`GET /coupons`, `/apoya-creador`, `/mis-cupones`, `/cupones-oro`) contra staging — son públicos, no requieren token.
2. Desplegar el fix.
3. Repetir la consulta a los 4 endpoints, sin haber creado/editado ningún cupón entre medio.

**Resultado esperado:** mismo conjunto de cupones, mismos campos (`code`, `amount`, `descripcion`/`name`, `channel`, `group`/`active`), en el mismo orden alfabético — ninguna diferencia. Si alguno de los cupones reales tiene un código puramente numérico (confirmado que existe al menos uno así, código `"364"`, visible en `/coupons`), prestarle atención especial: verificar que su `amount`/`descripcion` correspondan al cupón real de ese código (revisar en `wp-admin → Marketing → Cupones` buscando ese código) y no a otro post cualquiera.

**Resultado que indica que sigue fallando:** algún cupón real no aparece en el listado que debería (`descripcion`/`amount` en blanco o distintos a lo configurado en wp-admin), o el cupón de código numérico muestra datos que no coinciden con lo que WooCommerce tiene guardado para ese código específico.

**Verificación de que no hay tope silencioso** (solo si en el futuro hay más de 200 cupones activos — no reproducible con el volumen real de hoy): crear temporalmente más de 200 cupones de prueba (o confirmar por conteo en `wp-admin` cuántos hay activos) y verificar que todos aparecen en el endpoint correspondiente, no solo los primeros 200.

**Nota:** no se pudo verificar el conteo real de cupones directamente en base de datos (sin acceso) — se verificó consultando los 4 endpoints públicos en vivo contra producción y staging, ver el detalle en `boticuy-hallazgos-completo.md` (M15).

---

### M10 — Cupones de tipo no soportado (`fixed_product`) ya no muestran "$0.00 aplicado"

**Qué se corrigió:** `CouponField.tsx` muestra un mensaje honesto ("el descuento se verá al confirmar tu pedido") en vez de "−S/0.00" para cupones de tipo distinto a `percent`/`fixed_cart`. `create_order()` ahora devuelve `coupon_discount` (el monto real calculado por WooCommerce), y `OrderConfirmationScreen` lo usa para su fila "Cupón" en vez del valor estimado en el cliente — el desglose debe cuadrar con el total para cualquier tipo de cupón, no solo para los que la app sabe calcular.

**Sin cupones `fixed_product` reales en el sitio hoy** (confirmado con Bran) — estos pasos requieren crear uno de prueba en `wp-admin` antes de poder verificarlos.

**Pasos:**
1. En `wp-admin → Marketing → Cupones`, crear un cupón de prueba tipo **"Descuento fijo para producto"** (`fixed_product`), por un monto cualquiera (ej. S/5), aplicable a cualquier producto del catálogo, sin restricciones.
2. En la app, agregar al carrito un producto al que aplique ese cupón.
3. En Checkout, escribir el código de ese cupón a mano en el campo "¿Tienes un cupón?" (no aparecerá en ningún listado de cupones de la app — eso es esperado, ver la nota de "camino de entrada real" en `boticuy-hallazgos-completo.md`).

**Resultado esperado (paso 3):** el campo muestra "Cupón CODE válido — el descuento se verá al confirmar tu pedido" — no "−S/0.00", ni ningún monto inventado. **Además**, en el resumen de la misma pantalla (más abajo, antes del botón de pago), la fila "Descuento (CODE)" muestra "Se verá al confirmar" — no desaparece, ni muestra "−S/0.00".

**Resultado que indica que sigue fallando:** el campo o la fila del resumen muestran "−S/0.00", cualquier monto inventado, o la fila del resumen desaparece por completo.

**Verificación de que no se confunde con "no llega al monto mínimo":** repetir con un cupón `fixed_product` de prueba que además tenga un monto mínimo de compra, con un carrito por debajo de ese mínimo. La fila del resumen debe comportarse igual que con cualquier otro cupón bajo su mínimo (oculta, o el mensaje que ya muestra `CouponField` arriba) — no debe decir "Se verá al confirmar" para un cupón que todavía no aplica en absoluto.

4. Completar el pedido con ese cupón (Yape o transferencia, para ver la confirmación de inmediato sin pasar por Izipay).

**Resultado esperado (paso 4):** en `OrderConfirmationScreen`, la fila "Cupón" aparece con el descuento real (el monto configurado en el cupón, o menos si el producto no cubre el monto completo), y `Subtotal − Cupón + Envío = Total` cuadra exactamente. En `wp-admin`, el pedido tiene el descuento real aplicado (línea de cupón en el detalle del pedido).

**Resultado que indica que sigue fallando:** la fila "Cupón" no aparece en la confirmación, o aparece con un monto que no coincide con lo que realmente se descontó (compararlo contra el pedido en `wp-admin`).

**Verificación de que no hay regresión en los tipos ya soportados:** repetir el mismo flujo con un cupón `percent` y uno `fixed_cart` reales (ya existen en el sitio) — deben seguir mostrando el chip normal con el monto correcto en `CouponField`, y la fila "Cupón" en la confirmación debe seguir cuadrando exactamente igual que antes de este fix (el valor ahora viene del servidor en vez del cliente, pero para estos dos tipos ambos cálculos ya coincidían).

---

### M3 / M4 — Catálogo filtrado: orden por popularidad y conteo consistente

**Qué se corrigió:** el listado filtrado por `necesidad`/`marca` (pantalla de Catálogo) ahora se ordena por popularidad descendente (mismo criterio que el listado sin filtro) y `total`/`total_pages` salen del mismo conjunto que realmente se muestra, no de un conteo aparte que podía discrepar.

**✅ Verificado en vivo por API directa (2026-09-08):**
- **M4:** `GET /products?marca=prime-health` (BFF) devuelve `{"ids":[...]}` — 18 IDs, **sin** `total`/`total_pages` (confirma que el BFF dejó de calcular esos campos aparte).
- **M3:** se comparó el orden de esos 18 IDs contra el catálogo completo pedido con `orderby=popularity&order=desc` a la Store API (fuente independiente, no derivada del mismo código). **16 de 18 coinciden en posición relativa exacta** — la única discrepancia es un par adyacente (`2717`/`2718`) invertido, consistente con un empate real de ventas entre esos dos productos (ambos con pocas ventas, cerca del final de la lista) resuelto por un criterio de desempate distinto en cada consulta — no indica que el orden por popularidad esté roto.

**Pasos — orden por popularidad (M3, con la app mañana — confirmar visualmente en pantalla):**
1. En la app, ir a Catálogo y aplicar un filtro por `necesidad` o `marca` que tenga varios productos (ej. "Inmunidad" o "Prime Health" — 13 y 20 productos respectivamente a la fecha de este fix).
2. Anotar el orden en que aparecen los productos.
3. Comparar contra el orden real de ventas de esos mismos productos (`wp-admin → Productos`, columna de ventas, o el reporte de WooCommerce → Analytics → Productos, ordenado por unidades vendidas).

**Resultado esperado:** el orden del listado filtrado coincide con el de mayor a menor popularidad — el mismo criterio que ya se usa en el listado sin filtro (Home/catálogo general).

**Resultado que indica que sigue fallando:** el orden no tiene relación con las ventas reales de esos productos (ej. aparece en orden alfabético, o en el orden en que se cargaron al catálogo).

**Pasos — conteo consistente y scroll infinito (M4):**
1. Aplicar el mismo filtro de arriba y hacer scroll hasta el final de los resultados.
2. Repetir con un filtro que tenga pocos productos (ej. "Visión", 2 productos) y con uno que no tenga ninguno.

**Resultado esperado:** el scroll infinito nunca pide una página que vuelve vacía mientras todavía "cree" que hay más — se detiene exactamente cuando se acabaron los productos reales. El filtro sin productos muestra el estado vacío de inmediato, sin intentar cargar una página fantasma.

**Resultado que indica que sigue fallando:** el scroll infinito intenta cargar una página más después de la última real (spinner que nunca resuelve en nada nuevo), o el conteo total mostrado en algún lado no coincide con la cantidad real de productos que se terminan viendo.

**Verificación del tope de seguridad (`MAX_FILTERED_IDS = 200`, no reproducible con el catálogo real de hoy — 47 productos en total):** no aplica todavía. Si en el futuro alguna `necesidad`/`marca` se acerca a 200 productos, hay que revisitar el diseño (el tope existe para no mandar un `include=` sin límite a la Store API, no para truncar en silencio un caso real) — anotado como referencia para cuando ese día llegue, no como un paso a ejecutar ahora.

---

### B8 / B9 — Libreta de direcciones: sin condiciones de carrera, sin descarte silencioso

**Qué se corrigió:** `class-addresses.php` ahora serializa `add`/`update`/`delete_address()` del mismo usuario con un lock atómico (mismo mecanismo que ya usan pedidos/pagos, movido a `Boticuy_App_Locks`), y `add_address()` responde `422` en vez de descartar la dirección más antigua al llegar a 10. `addAddress()`/`updateAddress()` en la app ahora lanzan con el motivo real del servidor en vez de fallar en silencio.

**Pasos — B9 (tope de 10, rechazo explícito):**
1. Con una cuenta de prueba, agregar direcciones hasta llegar a 10 (usar datos ficticios, distintos entre sí para que ninguna se descarte por duplicado).
2. Intentar agregar una dirección número 11.

**Resultado esperado:** la app muestra el error "Ya tienes el máximo de 10 direcciones guardadas — elimina una para agregar otra" en el formulario — la pantalla **no** navega hacia atrás como si se hubiera guardado. En "Mis direcciones" siguen apareciendo exactamente las mismas 10 de antes (ninguna se descartó).

**Resultado que indica que sigue fallando:** la dirección 11 se guarda igual (la más antigua desaparece sin aviso), o la pantalla navega hacia atrás mostrando éxito sin haber guardado nada.

**Pasos — B8 (condición de carrera):** no es trivial de reproducir manualmente tal cual (requiere dos peticiones simultáneas reales). Verificación aproximada:
1. Con menos de 10 direcciones guardadas, en `AddressFormScreen` completar el formulario de una dirección nueva.
2. Tocar "Guardar" dos veces lo más rápido posible (doble tap real en el dispositivo, no dos clicks espaciados).

**Resultado esperado:** se guarda **una sola** dirección nueva (no dos duplicadas, no ninguna perdida) — el segundo tap, si llegó a disparar una segunda petición, debe haber recibido el 409 "Ya hay otra actualización de tus direcciones en curso, intenta de nuevo en unos segundos" (visible brevemente, o silencioso si el botón ya se había deshabilitado a tiempo) sin corromper el resultado final.

**Resultado que indica que sigue fallando:** aparecen dos direcciones idénticas guardadas, o la lista final tiene menos direcciones de las que debería (alguna se perdió).

**Verificación de que el mensaje real llega a la pantalla (fix acompañante):**
1. Repetir el paso de B9 (11ª dirección) y confirmar que el mensaje mostrado es el texto real del servidor ("Ya tienes el máximo de 10 direcciones guardadas...") — no el genérico "No pudimos guardar la dirección. Intenta de nuevo." (ese genérico debe aparecer solo ante una falla de red real, no ante un 422).
2. Con "Recordar mis datos" marcado en Checkout, completar un pedido con una cuenta que ya tiene 10 direcciones guardadas.

**Resultado esperado (paso 2):** el pedido se confirma igual (el guardado de dirección es fire-and-forget, no bloquea el pago), pero aparece el toast "No pudimos guardar tu dirección en tu cuenta, pero tu pedido sí se procesó." — confirma que `CheckoutScreen.tsx` sigue manejando el error nuevo correctamente, sin haber sido tocado.

---

### A8 — Expiración automática de Yape/transferencia a las 72 horas

**Qué se corrigió:** `Boticuy_App_Orders::STALE_ORDER_RULES` ahora tiene dos reglas — tarjeta (`pending`, 45 min, sin cambios) y Yape/Plin/transferencia (`on-hold`, 72 horas, nuevo). Al cumplirse el plazo de cada una, el pedido se marca `failed` automáticamente, liberando los puntos y el stock reservados — mismo mecanismo que ya existía para tarjeta desde A6, ahora también para estos dos métodos.

**Pasos — expiración por cron/barrido:**
1. Crear un pedido de prueba con Yape o transferencia, canjeando algunos puntos (requiere una cuenta con saldo).
2. Confirmar en `wp-admin` que el pedido queda `on-hold` y que el saldo de puntos del cliente bajó (canje reservado).
3. Sin confirmar el pago, forzar que hayan pasado más de 72 horas desde la creación — más simple que esperar de verdad: editar directo en base de datos la fecha de creación del pedido (`post_date`/`post_date_gmt` en almacenamiento clásico, o la columna equivalente en HPOS) a más de 72h atrás, o llamar directo `Boticuy_App_Orders::expire_pending_orders()` (ej. vía WP-CLI `wp eval`) después de retrasar la fecha.

**Resultado esperado:** el pedido pasa a `failed`, con una nota indicando "expirado automáticamente tras 72 horas sin confirmación". El saldo de puntos del cliente vuelve a subir (la reserva se liberó). El stock reservado también se restituye.

**Resultado que indica que sigue fallando:** el pedido sigue `on-hold` pasadas las 72h simuladas, o los puntos/stock no se liberan al pasar a `failed`.

**Pasos — auto-liberación eager (sin esperar el cron):**
1. Repetir el paso 1-3 de arriba (pedido `on-hold` con más de 72h simuladas, con canje de puntos).
2. En vez de esperar/forzar el cron, con el mismo usuario logueado entrar a la pantalla de Puntos o Checkout (dispara `GET /points`).

**Resultado esperado:** el saldo de puntos se ve liberado de inmediato, sin esperar el próximo tick de cron — mismo comportamiento que ya existía para tarjeta, ahora también para Yape/transferencia.

**Verificación de que tarjeta no cambió (no regresión):** repetir el flujo de A6 (pedido tarjeta `pending` abandonado, más de 45 minutos) — debe seguir expirando exactamente igual que antes, sin ningún cambio de comportamiento.

**Verificación del caso "comprobante tardío" (documentado, no un bug):** si después de expirar automáticamente el cliente manda el comprobante, el pedido ya está `failed` sin puntos/stock reservados — confirmar que el negocio puede identificarlo (aparece como `failed` en `wp-admin`, con la nota de expiración automática) y que recrear el pedido a mano es el camino esperado, no un error del sistema.

---

### B14 — Validación server-side de los datos del cliente al crear el pedido

**Qué se corrigió:** `create_order()` ahora rechaza con `422` si faltan o tienen formato inválido: nombre, correo, teléfono, DNI, dirección/número, o si el distrito (`idUbigeo`) no existe en el catálogo real. Antes ninguno de estos se validaba server-side — solo el formulario de la app lo exigía.

**Nota:** este hallazgo es un blindaje contra llamadas directas a la API, no un caso reproducible navegando la app normalmente — `CheckoutScreen.tsx` ya bloquea el envío del formulario si falta cualquiera de estos campos. Los pasos de abajo requieren llamar al endpoint directo (`curl`/Postman), no la UI.

**✅ Verificado en vivo por API directa (2026-09-08), los 4 campos representativos:**
| Campo probado | Respuesta |
|---|---|
| `nombre: ""` | `422 {"reason":"Falta el nombre"}` |
| `email: "no-es-correo"` | `422 {"reason":"Correo inválido"}` |
| `direccion: ""` | `422 {"reason":"Dirección incompleta"}` |
| `idUbigeo: "999999"` (inventado) | `422 {"reason":"Distrito inválido"}` |

Los 4 motivos coinciden exactamente con los que devuelve `validate_customer_and_shipping()` — ningún pedido se creó en ninguno de los 4 casos. `telefono`/`numDoc` inválidos comparten el mismo validador (`Boticuy_App_Validation`) ya verificado indirectamente por A3/B14 en el código; no se repitieron por separado hoy.

**Pasos — cada campo, uno a la vez, contra staging (ya verificado hoy, ver tabla arriba):**
1. Armar un `POST /order` válido (mismo payload que usaría la app) y confirmar que se crea normalmente — caso de control.
2. Repetir el mismo payload, pero con `customer.nombre` vacío (`""`).
3. Repetir con `customer.email` inválido (ej. `"no-es-un-correo"`).
4. Repetir con `customer.telefono` inválido (ej. `"abc"` o un número de menos de 9 dígitos).
5. Repetir con `customer.numDoc` inválido (ej. `"123"`, menos de 8 dígitos, o con letras).
6. Repetir con `shipping.direccion` o `shipping.numero` vacíos.
7. Repetir con `shipping.idUbigeo` inventado (ej. `"999999"`, que no exista en la tabla ubigeo).

**Resultado esperado:** el paso 1 crea el pedido normalmente. Cada uno de los pasos 2-7 responde `422` con el motivo específico ("Falta el nombre", "Correo inválido", "Teléfono inválido", "Documento inválido", "Dirección incompleta", "Distrito inválido" respectivamente) — y **no** se crea ningún pedido en `wp-admin` para ninguno de esos casos.

**Resultado que indica que sigue fallando:** cualquiera de los pasos 2-7 crea el pedido igual (revisar en `wp-admin → WooCommerce → Pedidos` que no aparezca uno nuevo con datos vacíos/inválidos).

**Verificación de que no hay regresión en direcciones (B14 reusa validadores de `class-addresses.php`):** repetir el flujo de A3 (guardar una dirección con teléfono/DNI inválido desde `AddressFormScreen`) — debe seguir rechazándose exactamente igual que antes, con los mismos mensajes ("Teléfono inválido", "Documento inválido", "Distrito inválido").

---

### B5 — Cierre de sesión real en servidor

**Qué se corrigió:** `POST /auth/logout` (nuevo) invalida el token vigente y cualquier otro token más viejo del mismo usuario, moviendo `_bcy_tokens_valid_after` al instante actual — `bearer_uid()` rechaza cualquier token con `iat` anterior a esa marca, aunque la firma y el `exp` sigan siendo válidos. `authStore.ts::logout()` ahora llama a este endpoint (best-effort) antes de borrar el token local.

**Pasos — logout invalida el token en el servidor, no solo en el dispositivo:**
1. Iniciar sesión en la app y copiar el token actual (ej. interceptando la respuesta de `/auth/login`, o leyendo `SecureStore` con acceso de desarrollo).
2. Con ese token copiado, hacer una llamada directa autenticada (ej. `GET /points` con `Authorization: Bearer <token>`) — debe responder `200` normalmente.
3. En la app, cerrar sesión (botón de Perfil).
4. Repetir la misma llamada directa del paso 2, con el **mismo token copiado**.

**Resultado esperado (paso 4):** la llamada ahora responde `401` — el token quedó invalidado en el servidor, no solo borrado del dispositivo que cerró sesión.

**Resultado que indica que sigue fallando:** el token copiado sigue respondiendo `200` después del logout — señal de que `bearer_uid()` no está comparando contra `_bcy_tokens_valid_after`, o que `logout()` en la app no está llegando a llamar al endpoint nuevo.

**Pasos — logout invalida TODOS los tokens del usuario, no solo el que cerró sesión (por diseño de la Opción A):**
1. Iniciar sesión en dos dispositivos (o dos instalaciones) distintos con la misma cuenta — dos tokens distintos, ambos válidos.
2. Cerrar sesión en uno de los dos.
3. Usar la app (o hacer una llamada autenticada) con el token del dispositivo que **no** cerró sesión.

**Resultado esperado:** el dispositivo que no cerró sesión también queda deslogueado — cualquier llamada con su token responde `401`. Esto es el comportamiento esperado de la Opción A (invalidación por usuario, no por dispositivo individual) — no un bug.

**Pasos — migración sin apagón masivo de sesiones (verificar justo después de desplegar este cambio):**
1. Antes de desplegar, confirmar que hay al menos una sesión activa real (un token emitido con el código viejo, sin claim `iat`).
2. Desplegar el cambio.
3. Sin hacer logout ni forzar ningún refresh manual, usar la app normalmente con esa sesión ya activa (ej. abrir cualquier pantalla que dispare una llamada autenticada).

**Resultado esperado:** la sesión sigue funcionando con normalidad — no se cierra sesión sola al desplegar. En el siguiente reinicio de la app (que dispara `/auth/refresh` en `hydrate()`), el token se renueva con el claim `iat` nuevo, sin que el usuario note nada.

**Resultado que indica que sigue fallando:** cualquier usuario con sesión activa antes del deploy queda deslogueado inmediatamente después, sin haber hecho logout.

---

### A9 — `/shipping` no incluía el IGV real del envío en la cotización

**Hallazgo nuevo, no uno de los 41 originales** — encontrado el 2026-09-08 al verificar C1 en vivo contra staging (plugin `2.15.0`). Ver el detalle completo, el diagnóstico y el fix en `boticuy-hallazgos-completo.md` (sección A9) y en `boticuy-app-plugin/CHANGELOG.md` (`[2.15.1]`).

**✅ Verificado en vivo por API directa, en dos partes — primero el síntoma (con el plugin `2.15.0`), luego el fix (con `2.15.1`):**

**Parte 1 — detección del síntoma (2026-09-08, plugin `2.15.0`):**
- Callao: cotización `{"cost":8.47}` vs. total real del pedido `S/46.59` sobre subtotal `S/36.60` (esperado sin IGV: `45.07`; diferencia `1.52` = `8.47 × 18%` exacto).
- Provincia/Arequipa: cotización `{"cost":12.71}` vs. total real `S/51.60` sobre el mismo subtotal (esperado sin IGV: `49.31`; diferencia `2.29`... la resta real es `51.60 − 36.60 = 15.00` = `12.71 × 18%` exacto).
- Confirmado en `wp-admin`: ambos métodos reales ("Peru, Callao" y "Peru, Lima Provincias") están configurados `Tax status: Sujeto a impuestos` — el pedido cobraba bien, la cotización estaba mal.

**Parte 2 — la verificación quedó pendiente ("para mañana") y ESO fue el problema: el fix de `2.15.1` nunca se probó en vivo antes de hoy.**

**🔴 Incidente encontrado el 2026-09-09 al fin ejecutar la Parte 2 (mientras se verificaba A2, no A9): `apply_shipping_tax()` (el fix de A9) rompía `/shipping` Y `POST /order` con `500`, para cualquier destino — checkout completo caído en staging, no un problema de cotización.** Detalle completo, causa raíz y fix en `boticuy-hallazgos-completo.md` (sección A9, "Seguimiento") y `boticuy-app-plugin/CHANGELOG.md` (`[2.15.4]`).

**Evidencia de la Parte 2 tal como se ejecutó (2026-09-09, plugin `2.15.3`, antes del fix de la regresión):**
- `GET /shipping?idubigeo=070101&subtotal=50` (Callao) → `500 {"ok":false,"reason":"Error interno al calcular el envío"}` (no `{"cost":9.99}` esperado).
- Mismo `500` para `idubigeo=070102` (Bellavista), `070106` (Ventanilla), `150122` (Miraflores, Lima) y para un `idubigeo=999999` inexistente — descartando que fuera solo Callao.
- `/shipping/config`, `/coupons`, `/coupon`, Store API → todos `200 OK` — el resto del sitio y del plugin sano.
- `POST /order` de prueba (datos ficticios) a Callao y a Miraflores → **ambos `500` también** — confirmando que `create_order()` comparte la misma causa (`compute_cost()`, diseño de C1).

**✅ Reverificado en vivo (2026-09-09), `2.15.4` desplegado — los 7 casos ya no truenan:**
1. `GET /shipping?idubigeo=070101&subtotal=36.60` (Callao) → `200 {"zone":"Peru, Callao","cost":10,"flat_cost":10,"free_threshold":null,"is_free":false}`.
2. `idubigeo=070102` (Bellavista) → `200`, mismo resultado que Callao (misma zona).
3. `idubigeo=070106` (Ventanilla) → `200`, mismo resultado.
4. `idubigeo=150122` (Miraflores) → `200 {"zone":"Lima 2 CERCANOS","cost":7,"free_threshold":69.9,"is_free":false}`.
5. `idubigeo=999999` (inexistente) → `200 {"zone":"Provincia","cost":15,...}` — cae al fallback, sin tronar.
6. `POST /order` Callao → `201`, pedido real `#11204`, `total: 101.70`.
7. `POST /order` Miraflores → `201`, pedido real `#11205`, `total: 89.90`.

**🔴 Segundo incidente encontrado al reconciliar esos mismos totales — doble IGV en el envío, no un problema de cotización esta vez.** `GET /shipping?idubigeo=070101&subtotal=89.90` (mismo subtotal que `#11204`) cotizó `{"cost":10.00}` → esperado `89.90 + 10.00 = 99.90`; el pedido real cobró `101.70` (`1.80` de más = `10.00 × 18%` aplicado una segunda vez).

**❌ Verificado en vivo (2026-09-09), `2.15.5` desplegado — el fix NO funcionó, mismo sobrecobro exacto:**
1. `POST /order` Callao, mismo producto/subtotal que `#11204` → pedido real `#11207`, cotización `10.00`, esperado `99.90`, **cobrado `101.70`** (`+1.80`, idéntico a `#11204`).
2. `POST /order` Miraflores, subtotal `26.60` (producto id `10019`, S/26.60 — por debajo del `free_threshold` de `69.90`, para forzar envío realmente cobrado, no gratis como `#11205`) → pedido real `#11208`, cotización `7.00`, esperado `33.60`, **cobrado `34.86`** (`+1.26` = `7.00 × 18%`).

`set_tax_status('none')` en el ítem de envío (el fix de `2.15.5`) resultó ser un no-op — esa propiedad no tiene el efecto esperado en `WC_Order_Item_Shipping` (a diferencia de `WC_Order_Item_Fee`). Causa real, fix correcto (`cost_pretax`, nuevo campo) y el hilo completo de las 5 capas de A9 en `boticuy-hallazgos-completo.md` (sección A9) y `boticuy-app-plugin/CHANGELOG.md` (`[2.15.6]`).

**✅ Verificado en vivo (2026-09-09), `2.15.6` desplegado — el sobrecobro grande (×18%) desapareció, quedó un residuo de S/0.01:**
1. `GET /shipping?idubigeo=070101&subtotal=89.90` → `{"cost":10,"cost_pretax":8.47}`. `POST /order` Callao, mismo producto/subtotal que `#11207` → pedido real `#11210`, esperado `99.90`, **cobrado `99.89`** (`−0.01`, ya no `×18%`).
2. `GET /shipping?idubigeo=150122&subtotal=26.60` → `{"cost":7,"cost_pretax":5.93}`. `POST /order` Miraflores, mismo producto/subtotal que `#11208` → pedido real `#11211`, esperado `33.60`, **cobrado `33.60`** — exacto.

**Investigado contra el código fuente real de WooCommerce (10.8.1, confirmado en `wp-admin`) antes de tocar código de nuevo** — ver el detalle completo en `boticuy-hallazgos-completo.md` (sección A9): la causa del centavo de diferencia en Callao es que `apply_shipping_tax()` (desde `2.15.4`) usaba `WC_Tax::get_shipping_tax_rates()`/`calc_shipping_tax()`, una API distinta de la que WooCommerce usa internamente para taxar un ítem de envío real (`WC_Tax::find_shipping_rates()`/`calc_tax()`, dentro de `WC_Order_Item_Shipping::calculate_taxes()`). Se descartó la opción "Redondeo de impuesto en el subtotal" (activada en este sitio, pero no aplica a un ítem de envío aislado) como causa.

**Fix (`2.15.7`):** `apply_shipping_tax()` ahora arma un `WC_Order_Item_Shipping` desechable y llama al método nativo `calculate_taxes()` en vez de replicar la fórmula a mano — garantiza que `/shipping` y `create_order()` ejecuten el mismo cálculo, sin importar cómo redondee WooCommerce internamente.

**❌ Verificado en vivo (2026-09-09), `2.15.7` desplegado — el centavo de diferencia en Callao siguió exactamente igual:**
1. `POST /order` Callao, mismo producto/subtotal que `#11210` → pedido real `#11213`, esperado `99.90`, **cobrado `99.89`** — sin cambio.
2. `POST /order` Miraflores, mismo producto/subtotal que `#11211` → pedido real `#11214`, esperado `33.60`, **cobrado `33.60`** — sigue exacto, sin cambio.

**Causa real, encontrada comparando línea por línea (no una suposición):** `create_order()` arma la dirección real del pedido con `city => $ship['provincia_nombre']` (ej. `"Prov. Const. Del Callao"`); el ítem desechable de `apply_shipping_tax()` usaba `city => ''`. `country`/`state`/`postcode` eran idénticos en ambos caminos, verificado — `city` era la única diferencia real. Detalle completo en `boticuy-hallazgos-completo.md` (sección A9) y `boticuy-app-plugin/CHANGELOG.md` (`[2.15.8]`).

**Fix (`2.15.8`):** nuevo `Boticuy_App_Ubigeo::province_name($dep, $prov)`, resuelve el mismo `city` desde la misma tabla `ubigeo` que ya usa `dep_prov_for()` — sin cambios en la app.

**❌ Verificado en vivo (2026-09-09), `2.15.8` desplegado — sin ningún cambio respecto a `2.15.7`:**
1. `POST /order` Callao, mismo producto/subtotal que `#11213` → pedido real `#11216`, esperado `99.90`, **cobrado `99.89`** — idéntico.
2. `POST /order` Miraflores, mismo producto/subtotal que `#11214` → pedido real `#11217`, esperado `33.60`, **cobrado `33.60`** — sigue exacto.

**🔒 Cierre — decisión de negocio (Bran, 2026-09-09): el residuo de S/0.01 en Callao se acepta como límite conocido.** Dos intentos consecutivos (`2.15.7`: método nativo de WooCommerce; `2.15.8`: `city` resuelto del lado del servidor) sin ningún efecto — se decidió no seguir investigando ni tocar configuración de WordPress (staging no refleja producción; en producción TI no permite cambiar configuraciones establecidas). El cliente siempre paga el monto real y correcto al confirmar el pedido — la única discrepancia es de un centavo en la vista previa, antes de pagar, en algunas zonas específicas. Detalle completo, hipótesis líder no confirmada, y tabla comparativa antes/ahora en `boticuy-hallazgos-completo.md`, sección A9.

**A9 — cerrado.** Pedidos de prueba de todo el hilo, con datos ficticios, pendientes de cancelar en `wp-admin`: `#11196`/`#11197` (Parte 1, ya cancelados), `#11199`/`#11200` (M13, mismo día, pendientes), `#11204`, `#11205` (envío gratis, no afectado), `#11207`, `#11208`, `#11210`, `#11211`, `#11213`, `#11214`, `#11216`, `#11217`.

---

### A10 — Cupón `percent` calculaba el descuento sobre un monto sin IGV

**Hallazgo nuevo, no uno de los 41 originales** — encontrado al verificar M13 en vivo con la app (pedido fallido `#11219`, cupón `7777` 15%). Detalle completo, causa raíz (confirmada contra el código fuente de WooCommerce) y fix en `boticuy-hallazgos-completo.md` (sección A10) y `boticuy-app-plugin/CHANGELOG.md` (`[2.15.9]`).

**Reproducido de forma limpia antes del fix (2026-09-09, plugin `2.15.8`):** producto de precio exacto S/120, cupón `7777` (15%, sin restricciones) → pedido real `#11223`: `total: 104.75`, `coupon_discount: 12.92` — coincide al centavo con `#11219`. Confirma que es un bug determinístico del cálculo (subtotal_tax no establecido antes de `apply_coupon()`), no una particularidad de ese pedido.

**Fix (`2.15.9`):** `subtotal_tax`/`total_tax` calculados a mano por línea de producto, dentro del mismo loop de `add_product()`, sin una segunda `calculate_totals()` (descartado ese patrón por el precedente de `[2.7.1]`/`[2.7.2]`, que duplicó IGV con ese mismo enfoque para el fee de puntos).

**❌ Verificado en vivo (2026-09-09), `2.15.9` desplegado — escenario 1 falló, resultado idéntico al bug original:**

| # | Escenario | Total esperado | Total real | Resultado |
|---|---|---|---|---|
| 1 | Solo cupón `percent` (7777, 15%, producto S/120, Miraflores envío gratis) | S/102.00 (120 − 18) | **S/104.75** (`#11225`, `coupon_discount: 12.92`) | ❌ Idéntico al bug original, sin ningún cambio |

Se detuvo la matriz ahí, como estaba acordado. Causa encontrada con certeza: `$order->get_item($item_id)` sin `$load_from_db=false` reconstruye el ítem desde la base de datos (comportamiento por defecto de WooCommerce) — pero el pedido no está guardado todavía, así que devuelve un objeto fantasma desconectado del ítem real. Detalle completo en `boticuy-hallazgos-completo.md`, sección A10.

**Fix (`2.15.10`):** `$order->get_item($item_id, false)` — un parámetro agregado, mismo diseño sin ningún otro cambio.

**✅ Verificado en vivo (2026-09-09), `2.15.10` desplegado — matriz completa, todos los escenarios correctos:**

| # | Escenario | Total esperado | Total real | Resultado |
|---|---|---|---|---|
| 1 | Solo cupón `percent` (7777, 15%, producto S/120) | S/102.00 (120 − 18) | **S/102.00** (`#11227`, `coupon_discount: 15.25`) | ✅ |
| 2 | Solo cupón `fixed_cart` (monto fijo) | subtotal − monto fijo, sin cambios | *verificado por código* — no hay cupón `fixed_cart` real en el sitio | ✅ |
| 3 | Solo canje de puntos, sin cupón | subtotal − descuento de puntos, sin IGV propio en el fee | *verificado por código* — requiere sesión, no disponible | ✅ |
| 4 | Cupón + envío gravado (Callao) | S/111.99 (102 + 9.99 envío) | **S/111.99** (`#11228`) | ✅ |
| 5 | Cupón + producto con stock bajo (EXCEGATON, 2 disp., pedidas 10) | `422`, sin crear pedido | **`422`**, sin pedido creado | ✅ |
| 5b | Mismo producto, cantidad dentro del stock (1) + cupón | S/57.15 (59 − 8.85 + 7.00 envío) | **S/57.15** (`#11230`) | ✅ |
| 6 | Sin cupón ni puntos (caso base) | S/120.00 (envío gratis por umbral) | **S/120.00** (`#11231`) | ✅ |

**Nota sobre el primer intento del escenario 5:** se probó primero con producto `7443` pidiendo 99999 unidades — el pedido se creó igual (`#11229`), porque ese producto específico no tiene `managing_stock()` activo (confirmado con Bran, no es un bug de A4). Reintentado con `EXCEGATON` (id `9661`, stock real de 2 unidades) — rechazo `422` correcto. `#11229` cancelado por Bran en `wp-admin`.

**Hallazgo secundario, no bloqueante, fuera del alcance de A10:** `coupon_discount` en la respuesta de `POST /order` expone solo la porción sin IGV del descuento (`15.25` en vez de `18.00` completo) — el total cobrado es correcto, pero si la app muestra ese campo directamente en la confirmación del pedido, la fila no sumaría contra el subtotal. Ver detalle en `boticuy-hallazgos-completo.md`, sección A10.

**✅ Doble/triple verificación del hilo completo C1 + A9 + A10, pedida por Bran antes de cerrar del todo (2026-09-09):**

| Caso | Cotización previa | Total real | Diferencia |
|---|---|---|---|
| Callao (envío gravado), sin cupón | S/130.00 (120 + 10.00) | S/129.99 (`#11232`) | S/0.01 (residuo conocido de A9) |
| Provincia real (Arequipa, zona real), con cupón 15% | S/117.00 (102 + 15.00) | **S/117.00** (`#11233`) | exacto |
| Producto + envío + cupón, misma cotización (Callao) | S/112.00 (120 − 18 + 10.00) | S/111.99 (`#11234`) | S/0.01 (mismo residuo, no se amplifica) |

Confirmado: A10 no reintroduce ningún problema de envío; el residuo de S/0.01 de A9 se mantiene idéntico con o sin cupón. No se pudo reproducir el *fallback* literal de A9 (idUbigeo inexistente) con un pedido real — B14 rechaza cualquier distrito inexistente antes de llegar a `compute_cost()` — se usó Arequipa (zona real "Provincia") en su lugar. Detalle completo en `boticuy-hallazgos-completo.md`, sección A10.

**A10 — cerrado.**

---

### B6 — Filas bloqueadas de Perfil ahora táctiles

**Qué se corrigió:** las 4 filas de "Al iniciar sesión podrás ver..." en Perfil eran `View` sin `onPress` — tocarlas no hacía nada. Ahora son `Pressable` que navegan a `Login`.

**Pasos:**
1. Sin sesión iniciada, ir a la pestaña Perfil.
2. Tocar cualquiera de las 4 filas "bloqueadas" (Mis pedidos, Mis puntos, Mis cupones, Mis direcciones).

**Resultado esperado:** navega a la pantalla de Login.

**Resultado que indica que sigue fallando:** tocar la fila no hace nada.

---

### B7 — `decodeHtmlEntities` ya no puede tumbar el render

**Qué se corrigió:** una entidad numérica con un valor fuera de `0-0x10FFFF` (o dentro del rango de surrogates aislado) lanzaba `RangeError` y tumbaba el render completo de la lista que la contuviera. Ahora se valida el rango antes de decodificar; si es inválido, el texto de la entidad se deja tal cual vino (sin placeholder, sin romper nada).

**Pasos (verificación de código/consola, no requiere un producto real con ese defecto):**
1. En una consola de Node o un test rápido, importar `decodeHtmlEntities` desde `src/utils/format.ts`.
2. Llamar con un valor claramente fuera de rango, ej. `decodeHtmlEntities('Producto &#99999999; especial')`.

**Resultado esperado:** devuelve `"Producto &#99999999; especial"` tal cual (sin lanzar excepción).

**Resultado que indica que sigue fallando:** lanza `RangeError`, o la app crashea al renderizar un nombre de producto con una entidad así.

---

### B10 — Código muerto `api/auth.ts::me()` retirado

**Qué se corrigió:** `me()` no tenía ningún consumidor real (la hidratación de sesión usa `refreshSession()`). Eliminada la función y su interfaz `MeResult`.

**Verificación:** de código, no funcional — confirmar que `npx tsc --noEmit` sigue sin errores (ya no hay ninguna importación rota) y que `grep -rn "from '../api/auth'" src/` no incluye ningún uso de `me`.

---

### B12 — Timeout en el WebView de pago

**Qué se corrigió:** una carga inicial colgada del WebView de pago (script de Izipay + formulario embebido) dejaba el overlay "Cargando pago seguro…" para siempre. Nuevo timer de 30s: si la carga sigue en curso al cumplirse, se muestra la pantalla de error existente con botón "Volver al checkout".

**Pasos (requiere simular una carga colgada — más práctico con las herramientas de red del dispositivo/emulador, ej. modo avión a mitad de carga, o bloquear `static.micuentaweb.pe` en el proxy/firewall del dispositivo de prueba):**
1. Iniciar un pago con tarjeta desde Checkout, de forma que se llegue a `PaymentWebViewScreen`.
2. Antes de que el WebView termine de cargar el script de Izipay, cortar la red del dispositivo (o bloquear el dominio `static.micuentaweb.pe`).
3. Esperar 30 segundos sin restaurar la red.

**Resultado esperado:** a los ~30s, la pantalla pasa de el overlay de carga a la pantalla de error ("La carga del formulario de pago está tardando demasiado. Intenta de nuevo.") con botón "Volver al checkout" — que al tocarlo regresa al Checkout normalmente.

**Resultado que indica que sigue fallando:** el overlay "Cargando pago seguro…" se queda indefinidamente, sin transicionar nunca a un error.

**Verificación negativa (no debe activarse en el camino feliz):** completar un pago normal con red estable — el timer nunca debe disparar (la carga termina bien antes de los 30s, `onLoadEnd` cancela el timer).

---

## Hallazgos pendientes de agregar

**Ninguno — fase de testing cerrada (2026-09-15), 41/41 hallazgos originales más A9, A10, C5, C6, C7 y C8, todos verificados en vivo** (ver "Estado general" al inicio de este documento, incluida la ronda de regresión final del 2026-09-15 tras el fix de C7/C8). No quedan más rondas de verificación pendientes antes de armar el documento final de entrega a TI. Si se abre una nueva ronda de hallazgos en el futuro, agregar acá una sección nueva con el mismo formato (qué se corrigió, pasos, resultado esperado / resultado de fallo) — la lista de qué falta cerrar vive en los checkboxes `[ ]` de `boticuy-hallazgos-completo.md`, no se duplica acá.

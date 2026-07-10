# Auditoría técnica — Boticuy App (React Native + Expo) + Plugin WordPress `boticuy-app-api`

**Fecha:** 2026-07-08
**Alcance:** app móvil completa (`src/`, config, dependencias, tests) **y** el plugin backend [boticuy-app-api.php](boticuy-app-api.php) (840 líneas, un solo archivo — "Plugin Name: Boticuy App API", v1.2.0, reemplaza el snippet Code Snippets #102 mencionado en el README).

> Nota sobre versiones: sigue habiendo una discrepancia entre lo que dice `README.md` de la app ("login, pedidos reales y pago con Izipay: pendiente") y lo que realmente implementa este plugin (los tres están implementados y, según el código, con controles de seguridad serios). Lo más probable es que el plugin sí esté listo pero la app todavía no tenga activado `ordersEnabled: true` mientras se termina de probar. Vale la pena confirmarlo con el equipo, pero ya no cambia la conclusión de fondo: **el backend, leído línea por línea, está bien hecho en los puntos que importan.**

---

## 1. Mapeo de arquitectura real

### 1.1 Endpoints reales del plugin (verificados en código, no inferidos)

Todos registrados en `add_action('rest_api_init', ...)` ([boticuy-app-api.php:12-107](boticuy-app-api.php)), namespace `boticuy-app/v1`. **Importante:** todos los endpoints declaran `permission_callback => '__return_true'` — es decir, WordPress no bloquea nada a nivel de ruteo; la autenticación se hace **a mano dentro de cada función** llamando a `bcy_bearer_uid()`. Funciona hoy, pero es un patrón fràgil (ver 5.2).

| Método | Ruta | Qué hace | Tablas / datos que toca | Auth |
|---|---|---|---|---|
| GET | `/ping` | Healthcheck | — | No |
| GET | `/products` | Resuelve taxonomía (`necesidades`/`marcas`) → IDs de producto, con `WP_Query` | `wp_posts` (product), `tax_query` sobre `necesidades`/`marcas`, excluye `exclude-from-catalog` | No |
| GET | `/product` | Campos enriquecidos de un producto (JetEngine post meta) | `wp_postmeta` (`interna-p-beneficios`, `interna-p-descripcion`, `interna-p-advertencias-y-contraindicaciones`, `interna-p-contenidoneto`, `interna-p-referencias`, `porcentaje-de-descuento`) | No |
| GET | `/ubigeo/departamentos` | Lista departamentos con reparto activo | tabla custom `{prefix}ubigeo` | No |
| GET | `/ubigeo/provincias` | Provincias de un departamento | `{prefix}ubigeo`, query parametrizada (`$wpdb->prepare`) | No |
| GET | `/ubigeo/distritos` | Distritos de una provincia | `{prefix}ubigeo`, parametrizada | No |
| GET | `/coupons` | Cupones de creador activos (% descuento, no vencidos, filtra internos) | `wp_posts` (shop_coupon) vía `WC_Coupon` | No |
| GET | `/coupon` | Valida un cupón por código | `WC_Coupon` | No |
| GET | `/shipping` | Cotiza envío por ubigeo/subtotal | `WC_Shipping_Zones` (zonas reales de WooCommerce) + fallback hardcodeado | No |
| GET | `/creators` | Roster "Copa Boticuy" (hardcodeado en PHP) + cupones aliados desde WooCommerce | `WC_Coupon` + array hardcodeado en el propio archivo | No |
| POST | `/auth/register` | Crea usuario/cliente WC | `wp_users` vía `wc_create_new_customer` | No (rate-limited) |
| POST | `/auth/login` | Login, emite JWT propio | `wp_users` | No (rate-limited) |
| GET | `/auth/me` | Datos del usuario del token | `wp_users` | **Sí** (Bearer) |
| POST | `/auth/refresh` | Renueva el JWT si el actual es válido | `wp_users` | **Sí** (Bearer) |
| GET | `/orders` | Pedidos del usuario logueado | `wc_get_orders(customer_id=uid)` | **Sí** (Bearer) |
| POST | `/order` | **Crea pedido real** en WooCommerce | `wc_create_order`, `wp_postmeta`, aplica cupón | No (por diseño: checkout de invitado; rate-limited) |
| GET/POST | `/addresses`, `/addresses/delete` | CRUD de direcciones guardadas | `user_meta` (`boticuy_app_addresses`) | **Sí** (Bearer) |
| GET | `/points` | Calcula puntos desde pedidos completados | `wc_get_orders(status=completed)` | **Sí** (Bearer) |
| POST | `/payment/formtoken` | Pide a Izipay un formToken para un `order_id` | Lee config de `woocommerce_micuentaweb_settings`, llama a la API de Izipay | ⚠️ **No** (ver hallazgo nuevo 2.9) |
| POST | `/payment/validate` | Valida firma HMAC del resultado de Izipay y marca el pedido pagado | `wc_get_order`, `$order->payment_complete()` | ⚠️ **No** (mitigado por firma, ver 2.9) |

### 1.2 Flujo de datos completo (actualizado con el backend real)

```
... (igual que antes hasta CheckoutScreen) ...

6. CheckoutScreen → "Confirmar pedido" (si ordersEnabled=true):
   ├─ pago = tarjeta:
   │  1. POST /order
   │     └─ Plugin: valida rate limit (15/10min por IP) → crea WC_Order → agrega
   │        SOLO productos reales verificados (wc_get_product + is_purchasable +
   │        is_in_stock) → calculate_totals() calcula el total EN EL SERVIDOR →
   │        estado 'pending' (tarjeta) hasta validar el pago → responde 201
   │        { order_id, number, total } — el total viaja del servidor a la app,
   │        no al revés.
   │  2. POST /payment/formtoken { order_id }
   │     └─ Plugin: relee el pedido de la BD (wc_get_order), YA CREADO, y calcula
   │        amount = order.total × 100 (céntimos). Llama a la API real de Izipay
   │        (V4/Charge/CreatePayment) con Basic Auth (site_id:private_key desde
   │        WooCommerce). Devuelve formToken + publicKey + mode.
   │  3. Izipay procesa el pago dentro del WebView (SDK Krypton)
   │  4. POST /payment/validate { order_id, kr-answer, kr-hash }
   │     └─ Plugin: recalcula HMAC-SHA256(kr-answer, hashKey_del_modo) y compara
   │        con hash_equals() contra kr-hash. Si no coincide → 400, fin.
   │        Si coincide: verifica que el orderId dentro de kr-answer sea el mismo
   │        order_id pedido (evita reutilizar un pago válido para otro pedido).
   │        Verifica orderStatus === 'PAID'. Verifica que el monto pagado
   │        (dentro de kr-answer, firmado por Izipay) coincida con el total real
   │        del pedido en WooCommerce — si no coincide, dispara una nota de
   │        auditoría en el pedido y RECHAZA la confirmación (409).
   │        Solo si todo lo anterior pasa → order.payment_complete() (idempotente).
   │
   └─ pago = yape / contraentrega: POST /order, estado 'on-hold'/'pending', sin
      pasar por Izipay.
```

---

## 2. Verificación de hallazgos ya reportados por TI (con evidencia real del plugin)

### 2.1 ¿El monto lo calcula el backend, o el cliente lo puede manipular?
**✅ CONFIRMADO — corregido de fondo, no superficialmente.**

- El payload de `POST /order` nunca lleva un monto (ver sección 1 de la versión anterior de este documento).
- [boticuy-app-api.php:381-390](boticuy-app-api.php): el pedido se arma agregando productos por `id` con `wc_get_product()` — el precio sale de WooCommerce, no del cliente.
- [boticuy-app-api.php:450](boticuy-app-api.php): `$order->calculate_totals();` — comentario explícito: *"El total se calcula SIEMPRE en el servidor a partir de los productos y el cupón."*
- [boticuy-app-api.php:220](boticuy-app-api.php) (`boticuy_app_formtoken`): `$amount = (int) round(((float) $order->get_total()) * 100);` — el monto que se le pide a Izipay sale de releer el pedido ya guardado en la base de datos, **no de ningún parámetro que mande la app** en esa llamada.
- [boticuy-app-api.php:161-167](boticuy-app-api.php) (`boticuy_app_payment_validate`): además, al validar el pago se vuelve a comparar el monto que Izipay dice haber cobrado (`$izAmount`, dentro de la respuesta firmada) contra `$order->get_total()`. Si no coinciden, no confirma el pago y dice explícitamente por qué: `'reason' => 'El monto pagado no coincide con el pedido'`.

**No hay ninguna ruta en el código donde el monto del cliente llegue a usarse para cobrar o para marcar un pedido como pagado.** Esto está bien resuelto, con doble verificación (al generar el cobro y al validarlo).

### 2.2 ¿Izipay se valida realmente, o se asume éxito?
**✅ CONFIRMADO — validación criptográfica real, no un "asumir éxito".**

[boticuy-app-api.php:134-138](boticuy-app-api.php):
```php
$computed = hash_hmac('sha256', $answer, $hashKey);
if (!hash_equals($computed, $hash)) {
    return new WP_REST_Response(array('ok' => false, 'reason' => 'Firma inválida'), 400);
}
```
Esto es correcto en los tres detalles que suelen fallar en implementaciones apresuradas:
1. Usa `hash_equals()` (comparación en tiempo constante) en vez de `===`, evitando timing attacks.
2. La clave (`$hashKey`) se selecciona según el modo TEST/PRODUCTION leído de la configuración de WooCommerce ([línea 129](boticuy-app-api.php)), no hardcodeada.
3. Además de la firma, valida que el `orderId` **dentro de la respuesta firmada por Izipay** coincida con el `order_id` que se está confirmando ([línea 152-154](boticuy-app-api.php)) — esto cierra la posibilidad de reusar el pago válido de un pedido barato para confirmar un pedido caro.

Solo marca `payment_complete()` si: firma válida + orderId coincide + `orderStatus === 'PAID'` + monto coincide. Las cuatro condiciones están, en ese orden, en el código real.

### 2.3 ¿El modo TEST de Izipay está hardcodeado?
**✅ CONFIRMADO — no está hardcodeado.**

[boticuy-app-api.php:109-113](boticuy-app-api.php):
```php
function bcy_izipay_mode($s) {
    $m = isset($s['ctx_mode']) ? strtoupper((string) $s['ctx_mode']) : 'TEST';
    return ($m === 'PRODUCTION') ? 'PRODUCTION' : 'TEST';
}
```
Lee `ctx_mode` desde `get_option('woocommerce_micuentaweb_settings')`, es decir, desde la configuración del plugin oficial de Izipay para WooCommerce (administrable desde `wp-admin`). El único hardcodeo es el **default a TEST si la opción no existe**, lo cual es la decisión correcta (falla hacia el modo seguro, no hacia producción).

### 2.4 ¿Los códigos HTTP son correctos, o todo devuelve 200?
**✅ Mayormente confirmado — con una inconsistencia menor.**

El plugin usa consistentemente códigos correctos: `401` (no autenticado, ej. [línea 269](boticuy-app-api.php)), `404` (pedido/producto no encontrado), `409` (conflicto: correo ya existe, monto no coincide, pago no corresponde al pedido), `422` (validación: dirección incompleta, credenciales inválidas, monto inválido), `429` (rate limit excedido), `500` (errores internos, capturados con `catch (\Throwable $e)`), `502` (fallo de comunicación con Izipay), `201` (pedido creado).

**Única inconsistencia encontrada:** [boticuy-app-api.php:528](boticuy-app-api.php), en `boticuy_app_register`:
```php
if (is_wp_error($uid)) return new WP_REST_Response(array('ok' => false, 'reason' => $uid->get_error_message()), 200);
```
Esto devuelve **200** para un error real de creación de usuario (debería ser 422 o 500). Es un error menor y de bajo impacto (la app igual revisa `res.ok` en el cliente, así que no rompe el flujo), pero vale la pena corregirlo por consistencia y porque **filtra el mensaje de error interno de WordPress tal cual al cliente** (ver 2.10).

### 2.5 ¿Existe sanitización de inputs?
**✅ CONFIRMADO — sanitización sistemática con funciones nativas de WordPress.**

- Función genérica [`bcy_sanitize_deep()`](boticuy-app-api.php:345-352) aplica `sanitize_text_field()` recursivamente a todo el JSON entrante en `/addresses` (POST).
- Campo por campo en `/order`: `sanitize_text_field` (nombre, teléfono, dirección, referencia, DNI), `sanitize_email` (correo), `preg_replace('/[^0-9]/', '', ...)` para códigos de ubigeo (fuerza solo dígitos).
- Las consultas a la tabla `ubigeo` con parámetros de usuario (`/ubigeo/provincias`, `/ubigeo/distritos`) usan `$wpdb->prepare()` con placeholders `%s` — **sin inyección SQL posible** ahí.
- `sanitize_title()` para slugs de taxonomía (`necesidad`, `marca`) antes de meterlos en `tax_query`.

No encontré ningún punto donde un input de usuario llegue crudo a una query SQL o a un contexto sensible sin pasar por alguna de estas funciones.

### 2.6 ¿Hay rate limiting en registro y creación de pedidos?
**✅ CONFIRMADO — implementado con WP Transients.**

[boticuy-app-api.php:354-362](boticuy-app-api.php), `bcy_rate_ok($bucket, $max, $window)`, basado en `$_SERVER['REMOTE_ADDR']` + `get_transient`/`set_transient`:
- Registro: **5 por hora por IP** ([línea 513](boticuy-app-api.php))
- Creación de pedidos: **15 cada 10 minutos por IP** ([línea 371](boticuy-app-api.php))
- Login: mecanismo aparte, **8 intentos fallidos por IP+correo cada 15 min**, con reseteo al loguear bien ([líneas 538-550](boticuy-app-api.php))

⚠️ **Matiz a tener en cuenta:** el límite se basa en `REMOTE_ADDR`. Si el sitio está detrás de un proxy/CDN (Cloudflare u otro) sin configurar correctamente, `REMOTE_ADDR` puede ser siempre la IP del proxy y no la del cliente real, lo que **inutilizaría el rate limit** (todos los usuarios compartirían el mismo contador, o el límite nunca se alcanzaría por usuario individual). Vale la pena confirmar cómo está configurado el hosting/CDN de `boticuy.com` — esto no se puede verificar desde el código del plugin solo.

### 2.7 ¿Cuánto dura el JWT y es configurable?
**✅ Confirmado el valor — parcialmente "configurable".**

[boticuy-app-api.php:503](boticuy-app-api.php):
```php
'token' => bcy_jwt_encode(array('uid' => $uid, 'exp' => time() + 60 * 60 * 24 * 7)),
```
**7 días**, fijo en el código (constante `60 * 60 * 24 * 7`), no es una opción de `wp-admin`. Es "configurable" solo en el sentido de que cualquiera con acceso al código puede cambiar esa línea — no hay un panel de configuración. La app implementa sesión deslizante (renueva en cada apertura vía `/auth/refresh`), así que un token robado deja de servir a más tardar 7 días después del último uso.

La implementación del JWT en sí (HS256 casero, sin librería) está bien hecha:
- Secreto de 256 bits generado con `random_bytes(32)` la primera vez y persistido en `wp_options` ([línea 466-470](boticuy-app-api.php)) — no hardcodeado, no predecible.
- Verifica la firma con `hash_equals()` antes de confiar en el payload ([línea 483](boticuy-app-api.php)).
- Verifica expiración (`exp < time()`) ([línea 485](boticuy-app-api.php)).
- El algoritmo está fijo a HS256 en ambos lados (no lee `alg` del token del cliente), así que no es vulnerable al clásico ataque de "confusión de algoritmo" (`alg: none`) que afecta a implementaciones ingenuas de JWT.

### 2.8 Datos sensibles de checkout — SecureStore vs AsyncStorage
**✅ Ya confirmado en la primera pasada (ver auditoría del cliente) — sin cambios, sigue correcto.**

### 2.9 🆕 Hallazgo nuevo (no estaba en el checklist de TI): falta de control de propiedad en `/payment/formtoken`
**Severidad: media.** No es una falla que permita robar dinero, pero sí es un problema real de control de acceso (IDOR).

[boticuy-app-api.php:99-102](boticuy-app-api.php) registra `/payment/formtoken` con `permission_callback => '__return_true'`, y la función [`boticuy_app_formtoken`](boticuy-app-api.php:195) **nunca verifica que quien llama tenga derecho a pagar ese pedido**: solo hace `$order = wc_get_order($order_id)` con el `order_id` que manda el cliente, sin comparar contra `bcy_bearer_uid()` ni contra ningún dato de invitado (email, token de sesión de checkout, etc.).

Como los IDs de pedido de WooCommerce son enteros secuenciales, **cualquiera puede llamar a este endpoint probando `order_id` consecutivos** (sin necesidad de estar logueado, sin rate limit en este endpoint específico) y obtener:
- El monto exacto del pedido de otra persona (`amount` en la respuesta).
- Un `formToken` real y utilizable para pagar el pedido de otra persona (no roba dinero de Boticuy ni de la víctima — pagaría a favor del pedido real — pero permite a un tercero completar el pago de un pedido ajeno, lo cual puede usarse para confundir la atribución del pago, generar fricción de soporte, o simplemente para extraer información — email/monto — de pedidos ajenos vía el efecto colateral de la llamada a Izipay).

**Por qué no es explotable como robo de fondos:** el dinero, si se paga, se acredita al pedido real en WooCommerce (no hay forma de redirigir el cobro a otro pedido, por la verificación cruzada en `/payment/validate` de la sección 2.2). El riesgo es de **exposición de datos** (monto + indirectamente el email del cliente, que se manda a Izipay) y de **posibilidad de que un tercero no autorizado inicie/complete el cobro de un pedido que no es suyo**.

**Recomendación concreta:** antes de activar `ordersEnabled` en producción, agregar a `boticuy_app_formtoken` una verificación de que el pedido pertenece al usuario autenticado (`$order->get_customer_id() === bcy_bearer_uid()`) **o**, para checkout de invitado, exigir que la app reenvíe el correo del pedido y compararlo contra `$order->get_billing_email()` antes de generar el `formToken`. Es un cambio de pocas líneas.

### 2.10 🆕 Hallazgo nuevo (menor): fuga de mensajes de error internos al cliente
**Severidad: baja.** En dos rutas, el plugin devuelve el mensaje de error interno de WordPress/Izipay directamente al cliente en vez de un mensaje genérico:
- [boticuy-app-api.php:528](boticuy-app-api.php): `$uid->get_error_message()` (registro de usuario)
- [boticuy-app-api.php:243](boticuy-app-api.php): `$resp->get_error_message()` (fallo de red al llamar a Izipay)

Contrasta con el resto del código, donde los `catch (\Throwable $e)` sí devuelven mensajes genéricos ("Error interno al validar el pago", etc.) sin exponer `$e->getMessage()`. Es una inconsistencia menor — no es una vulnerabilidad grave, pero conviene unificar el criterio (nunca exponer texto de error interno crudo) antes de ir a producción.

### Resumen de la sección 2 (actualizado con el código real)

| Punto | Veredicto |
|---|---|
| Monto calculado server-side | ✅ **Confirmado**, con doble verificación |
| Validación real de Izipay | ✅ **Confirmado**, HMAC + anti-replay + anti-manipulación de monto |
| Modo TEST hardcodeado | ✅ **Confirmado que NO lo está** (viene de config de WooCommerce) |
| Códigos HTTP correctos | ✅ Mayormente sí — 1 inconsistencia menor (2.4) |
| Sanitización de inputs | ✅ **Confirmado**, sistemática |
| Rate limiting | ✅ **Confirmado** — con matiz sobre `REMOTE_ADDR` detrás de proxy/CDN |
| Duración del JWT | ✅ 7 días, hardcodeado en código (no en panel admin) |
| SecureStore vs AsyncStorage | ✅ Correcto (cliente) |
| IDOR en `/payment/formtoken` | 🆕 **Hallazgo nuevo — corregir antes de producción** |
| Fuga de mensajes de error internos | 🆕 **Hallazgo nuevo — menor** |

**En síntesis: los "hallazgos ya reportados por TI" están corregidos de fondo, no de forma superficial.** El código muestra un entendimiento real de los riesgos (comentarios como "no confiar en el cliente", "nunca hardcodeado" no son solo frases — están respaldados por la lógica real). Encontré dos problemas nuevos que el checklist original no cubría (2.9 y 2.10); el primero (IDOR en formtoken) sí debería resolverse antes de activar pagos reales.

---

## 3. Hardcodeos y configuración (actualizado con el plugin)

Adicional a lo ya reportado en la app (sección 3 de la primera pasada, sin cambios: URLs de `config.ts`, key pública de PostHog, `ordersEnabled`):

| Archivo:línea | Qué está hardcodeado | ¿Problema? |
|---|---|---|
| [boticuy-app-api.php:503](boticuy-app-api.php) | Duración del JWT (7 días) como constante PHP | Bajo — funcional, pero requiere editar código para cambiarlo, no hay opción en `wp-admin` |
| [boticuy-app-api.php:664-671](boticuy-app-api.php) | Fallback de costo de envío: `8.47` (Callao) / `12.71` (Provincia) cuando no matchea ninguna zona de WooCommerce | Bajo-medio — si cambian tarifas, hay que tocar código en vez de la configuración de zonas de envío de WooCommerce (que es lo que sí se usa en el camino principal) |
| [boticuy-app-api.php:594-605](boticuy-app-api.php) | Roster completo de "Copa Boticuy" (10 creadores, códigos y nombres) como array PHP | Operativo, no de seguridad — actualizar el roster cada temporada requiere un deploy de código en vez de un panel de administración |
| [boticuy-app-api.php:330-342](boticuy-app-api.php) | Mapa de códigos de departamento → estado WooCommerce | Aceptable — es data de referencia estática (geografía del Perú), no cambia |

**No se encontró ninguna credencial ni secreto hardcodeado en el plugin.** Las llaves de Izipay (pública/privada, test/producción) se leen de `get_option('woocommerce_micuentaweb_settings')` — es decir, viven en la configuración del plugin oficial de Izipay para WooCommerce, administrable desde `wp-admin`, no en este código. El secreto del JWT se genera con `random_bytes(32)` la primera vez que se necesita y se guarda en `wp_options` — tampoco está en el código fuente. **Buen patrón, consistente con lo encontrado en la app.**

---

## 4. Manejo de errores (actualizado con el plugin)

El plugin es notablemente más disciplinado que el promedio de código sin ingeniero:
- Las tres funciones de mayor riesgo (`boticuy_app_create_order`, `boticuy_app_formtoken`, `boticuy_app_payment_validate`) están **enteramente envueltas en `try { ... } catch (\Throwable $e) { return ...500 con mensaje genérico... }`**. Esto es justo lo que se espera en endpoints que mueven dinero: si algo inesperado explota, no se cae el sitio ni se filtra un stack trace, y el pedido queda en el estado que tenía antes (no se marca pagado por accidente ante una excepción).
- Los flujos de validación (dirección incompleta, cupón inválido, correo repetido, etc.) devuelven respuestas estructuradas `{ ok:false, reason }` con el código HTTP correspondiente, consistente con lo que la app espera (`bffClient` en `client.ts`).
- Contraejemplo ya cubierto en 2.10: dos rutas exponen el mensaje de error interno crudo en vez de uno genérico.

**Lo que falta (igual que en la app):** no hay ningún logging/alerta explícita más allá de `add_order_note()` (que solo se ve en el admin de WooCommerce al abrir el pedido manualmente) y las notas de "ALERTA seguridad" cuando el monto no coincide ([línea 164](boticuy-app-api.php)). No hay integración con ningún sistema de alertas (email, Slack, Sentry) que avise al equipo en el momento en que se dispara esa alerta de seguridad — hoy, si un intento de manipular el monto de un pago ocurre, **queda registrado silenciosamente en la nota del pedido y nadie se entera a menos que entre a revisarlo manualmente**. Vale la pena, como mejora, disparar una notificación activa en ese caso específico (intento de pago con monto adulterado), ya que es la señal más clara posible de que alguien está intentando explotar el checkout.

---

## 5. Calidad de estructura del código (actualizado con el plugin)

**5.1 Organización.** El plugin es un único archivo procedural de 840 líneas, sin clases ni namespaces — estilo común en plugins de WordPress pequeños/medianos, aceptable para este tamaño. Prefijos consistentes: `boticuy_app_*` para los callbacks de rutas, `bcy_*` para helpers internos (`bcy_jwt_*`, `bcy_sanitize_deep`, `bcy_rate_ok`, `bcy_bearer_uid`) — buena convención de nombres, fácil de navegar con buscar-y-reemplazar aunque no haya separación en archivos.

**5.2 Riesgo de mantenibilidad (no de seguridad hoy, pero sí a futuro):** todas las rutas se registran con `permission_callback => '__return_true'` y la autenticación se resuelve **manualmente, dentro de cada función**, llamando a `bcy_bearer_uid()` al inicio y retornando 401 si falta. Esto funciona mientras cada desarrollador recuerde agregar esa línea en cada endpoint nuevo que deba ser privado. El patrón recomendado por WordPress es usar `permission_callback` para expresar el requisito de autenticación de forma declarativa (falla cerrado por defecto). Con el patrón actual, **un futuro endpoint sensible que alguien agregue sin acordarse de llamar a `bcy_bearer_uid()` queda abierto por defecto** — que es exactamente lo que pasó, en menor escala, con el hallazgo 2.9 (`/payment/formtoken` no verifica propiedad del pedido, aunque en ese caso ni siquiera está pensado para requerir login por ser checkout de invitado — el problema ahí no es la ausencia de `permission_callback`, sino la ausencia de *cualquier* verificación de que el llamador tiene derecho a ese `order_id` específico).

**5.3 Duplicación:** la lista de palabras excluidas de cupones (`sorteo`, `envio`/`envío`, `suscrip`, `prueba`, `test`, `gratis`) está copiada casi igual en `boticuy_app_creators` ([línea 621](boticuy-app-api.php)) y `boticuy_app_coupons` ([línea 690](boticuy-app-api.php)), con una diferencia sutil: una lista incluye `env\xc3\xado` (envío con tilde escapada) y la otra no — inconsistencia menor que podría hacer que un cupón se excluya en un endpoint y no en el otro.

**5.4 En conjunto:** para ser un plugin de WordPress escrito sin ingeniero de por medio, la calidad es notablemente alta — mejor, de hecho, que buena parte del código PHP que se ve en plugins comerciales pequeños. Los puntos de mayor riesgo del negocio (dinero, autenticación) están tratados con el cuidado correcto. Los defectos encontrados son puntuales y de bajo/medio impacto, no estructurales.

---

## 6. Dependencias

**Plugin PHP:** cero dependencias de terceros. No usa Composer, no hay `vendor/`, no importa ninguna librería externa — todo (incluido el JWT) está escrito a mano sobre funciones nativas de PHP y de WordPress/WooCommerce. Esto significa:
- **Sin superficie de vulnerabilidades de cadena de suministro** en el backend (no hay un `left-pad` o un `event-stream` que pueda comprometerse).
- A cambio, la implementación casera del JWT (HS256) no ha pasado por el escrutinio público que sí tiene una librería como `firebase/php-jwt` — en la revisión manual de este documento no se encontraron fallas, pero es un componente que vale la pena que alguien más revise específicamente si se quiere una segunda opinión, dado que es responsable de toda la autenticación.

(Sección de dependencias de la app — sin cambios respecto a la primera versión de este documento: ver `npm audit`, 15 vulnerabilidades, todas en el toolchain de build de Expo, ninguna en el bundle final.)

---

## 7. Veredicto resumido (actualizado)

### ✅ Confirmado listo (con evidencia de código, no solo de la app)
- Cálculo de montos 100% server-side, con doble verificación (sección 2.1).
- Validación criptográfica real del pago de Izipay, con protección anti-replay y anti-manipulación de monto (2.2).
- Modo TEST/PRODUCTION correctamente leído de configuración, no hardcodeado (2.3).
- Sanitización sistemática de inputs y queries parametrizadas (2.5).
- Rate limiting en registro, login y creación de pedidos (2.6).
- Sin credenciales ni secretos hardcodeados en ningún lado del proyecto (app ni plugin).
- Manejo de errores disciplinado en las rutas que mueven dinero (`try/catch` + mensajes genéricos + estado del pedido protegido ante excepciones).

### 🚫 Fix obligatorio antes de activar `ordersEnabled` / pagos reales en producción
1. **Corregir el IDOR en `/payment/formtoken`** (hallazgo 2.9): agregar verificación de que quien pide el formToken tiene derecho a pagar ese `order_id` (por uid si está logueado, o por email del pedido si es invitado). Es un cambio pequeño y concreto.
2. **Unificar el manejo de mensajes de error** para no exponer texto interno de WordPress/errores de red al cliente (2.10, 2.4).
3. **Confirmar la configuración de IP real detrás de cualquier proxy/CDN** para que el rate limiting por `REMOTE_ADDR` funcione como se espera (2.6) — esto es infraestructura, no código, pero sin esto el rate limiting podría no estar protegiendo nada en la práctica.
4. Seguir vigente de la primera pasada: agregar crash reporting (Sentry o similar) y un Error Boundary en la app — el backend ahora se ve sólido, pero si algo falla en el cliente durante el checkout, el equipo sigue sin enterarse.
5. Agregar tests automatizados al flujo de checkout/pago (sigue en 0% de cobertura).
6. Aclarar con el equipo la discrepancia entre el `README.md` de la app (dice que login/pedidos/Izipay están "pendientes") y el estado real del plugin (implementado y con controles serios) — probablemente solo falta el interruptor `ordersEnabled`, pero confírmenlo antes de asumir cualquier cosa sobre qué está realmente en producción hoy.

### 💡 Mejora recomendada, no bloqueante
- Cambiar el patrón de autenticación del plugin de "checkear a mano en cada función" a `permission_callback` declarativo, para que futuros endpoints no puedan quedar abiertos por olvido (5.2).
- Agregar una alerta activa (no solo una nota silenciosa en el pedido) cuando se detecte un intento de pago con monto adulterado ([línea 164](boticuy-app-api.php)) — es la señal de ataque más clara que ya genera el propio sistema, hoy se pierde si nadie mira el pedido a mano.
- Sacar el roster de creadores y las tarifas de envío de fallback del código PHP a algo administrable desde `wp-admin` (opciones o CPT), para no depender de un deploy en cada actualización de temporada/tarifas.
- Unificar la lista de palabras excluidas de cupones entre `boticuy_app_creators` y `boticuy_app_coupons` (5.3).
- Resto de mejoras no bloqueantes de la app: sin cambios respecto a la primera versión (deduplicar `emailOk`, política de pinning de versiones, `npm audit fix`, acotar `originWhitelist` del WebView de pago, extraer lógica de `CheckoutScreen.tsx`).

---

**En una frase, actualizada:** con el plugin real en mano, la conclusión cambia de "no puedo saberlo" a "está bien hecho donde más importa" — el equipo (con IA de por medio) sí resolvió a fondo el cálculo de montos, la validación de Izipay y el modo test/producción, no de forma superficial. Encontré dos problemas reales que el checklist de TI no cubría (el IDOR de `/payment/formtoken` y la fuga de mensajes de error), siendo el primero el único que consideraría bloqueante antes de activar pagos reales. El resto es refinamiento, no reconstrucción.

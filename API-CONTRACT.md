# Boticuy App — API Contract v2

**Depende de:** `REQUERIMIENTOS.md` y `ARQUITECTURA.md` (mismo proyecto).
**Objetivo:** contrato exacto de cada endpoint del plugin `boticuy-app-api`, para que la app y el plugin se construyan en paralelo sin adivinar qué espera el otro lado. Se actualiza en el mismo commit/PR que agrega o cambia un endpoint.

**Convenciones generales de todo el contrato:**
- Base: `/wp-json/boticuy-app/v1`
- Auth: header `Authorization: Bearer <jwt>` cuando se indique "Requiere auth"
- Respuestas siempre en JSON, con `{ ok: boolean, ... }` como envoltura mínima
- Códigos HTTP correctos siempre (ver tabla al final), nunca 200 para un error
- Todo input de texto libre pasa por `sanitize_text_field`/`sanitize_email`/equivalente antes de guardarse, sin excepciones

---

## Catálogo y taxonomías (públicos, solo lectura)

### `GET /products`
**Auth:** no requiere
**Query params:** `necesidad` (slug, opcional), `marca` (slug, opcional), `search` (opcional), `page`, `per_page` (máx 100)
**Responde 200:**
```json
{ "ids": [123, 456], "total": 40, "total_pages": 2 }
```
**Errores:** ninguno esperado salvo 500 si WooCommerce no está disponible.

### `GET /product`
**Auth:** no requiere
**Query params:** `id` (requerido)
**Responde 200:** datos enriquecidos del producto (beneficios, descripción, advertencias, contenido neto, referencias, descuento)
**Responde 400:** si falta `id`
**Responde 404:** si el producto no existe o no está publicado

---

## Autenticación

### `POST /auth/register`
**Auth:** no requiere
**Body:** `{ email, password, nombre }`
**Validaciones:** email válido, password mínimo 6 caracteres, email no debe existir ya
**Rate limit:** sí — máx 5 registros por IP cada 15 min (nuevo, no existía en el legacy)
**Responde 200:** `{ ok: true, token, user: { id, email, nombre } }`
**Responde 400:** `{ ok: false, reason: "..." }` si el email/password son inválidos
**Responde 409:** `{ ok: false, reason: "Ese correo ya tiene una cuenta" }` si el email ya existe
**Responde 429:** si se excede el rate limit

### `POST /auth/login`
**Auth:** no requiere
**Body:** `{ email, password }`
**Rate limit:** sí — máx 8 intentos por IP+correo cada 15 min (ya existía, se mantiene igual)
**Responde 200:** `{ ok: true, token, refresh_token, user: {...} }`
**Responde 401:** `{ ok: false, reason: "Correo o contraseña incorrectos" }`
**Responde 429:** si se excede el rate limit

### `POST /auth/refresh`
**Auth:** requiere `refresh_token` en el body (no el token corto)
**Responde 200:** `{ ok: true, token }` (nuevo token corto)
**Responde 401:** si el refresh token es inválido o expiró → la app debe cerrar sesión localmente

### `GET /auth/me`
**Auth:** requiere
**Responde 200:** `{ ok: true, user: { id, email, nombre } }`
**Responde 401:** si no hay token válido

---

## Direcciones

### `GET /addresses`
**Auth:** requiere
**Responde 200:** `{ ok: true, addresses: [...] }`
**Responde 401:** sin token

### `POST /addresses`
**Auth:** requiere
**Body:** dirección completa (`direccion`, `distrito`, `numero`, `referencia`, etc.)
**Validación:** `direccion` y `distrito` obligatorios; **todos los campos de texto pasan por `sanitize_text_field`** (esto corrige el hueco puntual que tenía `create_order` en el legacy, donde `direccion` no se sanitizaba)
**Responde 200:** `{ ok: true, addresses: [...] }` (lista actualizada)
**Responde 400:** si falta dirección/distrito
**Responde 401:** sin token

### `POST /addresses/delete`
**Auth:** requiere
**Body:** `{ id }`
**Responde 200:** `{ ok: true, addresses: [...] }`

---

## Cupones y creadores

### `GET /coupons`
**Auth:** no requiere
**Responde 200:** lista de cupones activos (código, monto, descripción, grupo)

### `GET /coupon`
**Auth:** no requiere
**Query params:** `code` (requerido)
**Responde 200:** `{ valid: true, code, discount_type, amount, minimum_amount }`
**Responde 200 (caso inválido):** `{ valid: false, reason: "..." }` — nota: este caso se mantiene 200 porque "cupón inválido" es una respuesta de negocio válida, no un error del sistema
**Responde 400:** si falta `code`

### `GET /creators`
**Auth:** no requiere
**Responde 200:** `{ copa: [...], fijo: [...] }`

---

## Envío y ubicación

### `GET /shipping`
**Auth:** no requiere
**Query params:** `idubigeo` (requerido), `subtotal`
**Responde 200:** `{ zone, cost, flat_cost, free_threshold, is_free }`
**Responde 400:** si falta `idubigeo`

### `GET /ubigeo/departamentos`, `/ubigeo/provincias`, `/ubigeo/distritos`
**Auth:** no requiere
**Responde 200:** listas desde la tabla `ubigeo` (ya usa `$wpdb->prepare`, se mantiene igual)
**Responde 400:** si faltan los parámetros requeridos (`departamento`, `provincia` según el endpoint)

---

## Pedidos — el flujo corregido (lo más importante de este documento)

### `POST /order`
**Auth:** opcional (permite compra como invitado; si hay token válido, se asocia el pedido al usuario)
**Body:**
```json
{
  "idempotency_key": "uuid-generado-por-la-app-al-entrar-a-checkout",
  "items": [{ "id": 123, "qty": 2 }],
  "customer": { "nombre", "email", "telefono", "tipoDoc", "numDoc" },
  "shipping": { "direccion", "numero", "referencia", "interior", "departamento_cod", "provincia_cod", "distrito_cod", "distrito_nombre", "provincia_nombre", "idUbigeo" },
  "coupon": "CODIGO" 
}
```
**El cliente NUNCA manda monto/total. Esto ya estaba bien en el legacy y se mantiene.**
**`idempotency_key` (nuevo):** UUID generado por la app una sola vez al entrar a la pantalla de checkout (no se regenera en reintentos). El servidor guarda este valor asociado al pedido creado. Si llega otra request con el mismo `idempotency_key`, el servidor **no crea un pedido nuevo**, devuelve el pedido ya existente con el mismo `order_id`. Esto evita duplicados por doble tap, mala conexión, o reintento automático de la app.
**Rate limit:** sí — máx 10 pedidos por IP cada 15 min (nuevo)
**Validación server-side:**
- Recalcula todos los precios desde WooCommerce (`wc_get_product`), nunca confía en nada de precio que venga del cliente
- Sanitiza todos los campos de texto (incluye el fix de `direccion`)
- **El pedido se crea en estado `pending`, sin excepción, sin importar el método de pago elegido.** Este es el cambio central respecto al legacy, donde tarjeta se marcaba `processing` de entrada.
- Confía en el control de stock nativo de WooCommerce (reducción de stock al crear el pedido). Ver nota de concurrencia más abajo.
**Responde 200:** `{ ok: true, order_id, number, total }` (el `total` es el que calculó el servidor, la app lo usa para mostrar el monto real al usuario)
**Responde 400:** `{ ok: false, reason: "Carrito vacío" }` u otro error de validación
**Responde 429:** si se excede el rate limit

**Nota de concurrencia (stock):** cuando dos compras del mismo producto con stock limitado ocurren casi al mismo tiempo (una desde la web, otra desde la app, o dos usuarios distintos en la app), el control de sobreventa lo maneja WooCommerce internamente al reducir stock en la creación del pedido, no es algo que este plugin deba resolver aparte. **Pendiente de verificar con TI/hosting:** confirmar en `WooCommerce → Ajustes → Productos → Inventario` si "Reservar stock" (hold stock) está activado; si no lo está, conviene activarlo, da un margen de bloqueo temporal durante el checkout que reduce el riesgo de sobreventa en picos de tráfico simultáneo web+app.

**Identificación de origen del pedido (nuevo):** todo pedido creado por este endpoint debe guardar un meta dato `_order_source = 'app'` (vía `$order->update_meta_data()`, igual que se hace con `_shipping_provincia` y los demás metas del legacy) y agregar una nota interna al pedido (`$order->add_order_note('Pedido creado desde la App Boticuy')`, esto ya existía en el legacy y se mantiene). Además, se agrega al plugin un hook (`manage_shop_order_posts_columns` / equivalente para HPOS) que muestra una **columna o badge visual** en el listado de pedidos del admin de WooCommerce (ej. un ícono o etiqueta "App" junto al número de pedido) cuando `_order_source` sea `app`, así cualquier persona del equipo (no solo quien programó esto) distingue el origen sin entrar al detalle de cada pedido. Los pedidos de la web quedan sin ese meta dato (o con `_order_source = 'web'` si se quiere ser explícito en ambos casos), sin necesidad de tocar el checkout de la web.

### `GET /orders`
**Auth:** requiere
**Responde 200:** `{ ok: true, orders: [...] }` (sin cambios respecto al legacy, ya estaba bien)
**Responde 401:** sin token

### `GET /orders/{id}`
**Auth:** requiere, y el pedido debe pertenecer al usuario del token
**Responde 200:** detalle del pedido con estado actual, para permitir "reintentar pago" si sigue `pending` (esto no existía en el legacy y se agrega)
**Responde 403:** si el pedido no pertenece al usuario autenticado
**Responde 404:** si no existe

---

## Pagos — el flujo corregido

### `POST /payment/formtoken`
**Auth:** requiere si el pedido está asociado a un usuario; si es pedido de invitado, se valida con un token de sesión de checkout de corta duración (a definir en detalle técnico, pero **nunca abierto sin ninguna validación** como estaba en el legacy)
**Body:**
```json
{ "order_id": 456 }
```
**Cambio central respecto al legacy:** ya no recibe `amount`. El servidor busca el pedido por `order_id`, confirma que está en estado `pending`, y lee el monto directo de WooCommerce (`$order->get_total()`). El cliente no tiene forma de influir en el monto que se le pide a Izipay.
**Rate limit:** sí — máx 5 solicitudes por pedido cada 10 min (nuevo, evita abuso de generación de formTokens)
**Responde 200:** `{ ok: true, formToken, publicKey, mode }`
**Responde 400:** `{ ok: false, reason: "..." }` si Izipay no está configurado o el monto es inválido
**Responde 404:** si el `order_id` no existe
**Responde 409:** `{ ok: false, reason: "El pedido ya fue pagado o no está pendiente" }` si el pedido no está en `pending` (nuevo — evita pedir un cobro para un pedido que ya se procesó o se canceló)

### `POST /payment/validate`
**Auth:** igual que `formtoken`
**Body:**
```json
{ "order_id": 456, "kr-answer": "...", "kr-hash": "..." }
```
**Cambio central respecto al legacy:** ahora recibe `order_id` (antes no lo pedía). El servidor:
1. Valida la firma HMAC (`hash_equals`, esto ya estaba bien hecho, se mantiene igual)
2. Decodifica `kr-answer` y **compara el monto pagado contra `$order->get_total()` del pedido real**
3. Solo si la firma es válida **y** el monto coincide **y** el pedido sigue en `pending` → el pedido pasa a `processing` y se guarda el `transactionId`
4. Si cualquiera de esas tres condiciones falla, el pedido permanece `pending` y se devuelve el motivo
**Responde 200 (éxito):** `{ ok: true, paid: true, status: "PAID", transactionId }`
**Responde 200 (firma inválida):** `{ ok: true, paid: false, reason: "Firma inválida" }` — se mantiene 200 aquí porque es una respuesta de negocio válida (intento de pago rechazado), no un error del sistema; la app decide qué mostrar según `paid`
**Responde 409:** `{ ok: false, reason: "El monto pagado no coincide con el pedido" }` — este caso es nuevo, no existía en el legacy, y es el que cierra el hallazgo de seguridad principal de la auditoría
**Responde 404:** si el `order_id` no existe

**Nota sobre confirmación server-to-server (pendiente de investigar con documentación de Izipay/Krypton):** el flujo descrito arriba depende de que el celular del usuario complete el ciclo (pague → reciba respuesta → llame a `/payment/validate`). Si la app se cierra o pierde conexión justo después de pagar pero antes de confirmar, el pedido queda `pending` en WooCommerce aunque Izipay sí haya cobrado. Muchas pasarelas de pago (incluyendo Izipay/Lyra) ofrecen notificaciones IPN/webhook que avisan al servidor directamente cuando una transacción se completa, sin depender del cliente. Antes de dar por cerrado este endpoint, revisar si Izipay ofrece esto para el modo usado (Krypton/formToken) y, si existe, agregar un endpoint adicional (`POST /payment/webhook` o similar) que WooCommerce escuche directamente, como respaldo del flujo normal. Esto no bloquea el MVP (el usuario igual puede reintentar manualmente vía `GET /orders/{id}`), pero cierra el caso de "pedido pagado en Izipay que nunca se refleja" sin intervención manual.

### `POST /payment/voucher` (nuevo — Yape/Plin con comprobante)
**Auth:** igual que `formtoken`
**Body:** `{ order_id, imagen (base64 o multipart) }`
**Validación:** tamaño máximo de imagen (definir límite, ej. 5MB), formato permitido (jpg/png)
**Responde 200:** `{ ok: true, status: "on-hold" }` — el pedido queda pendiente de verificación manual por el negocio
**Responde 400:** si la imagen no es válida o excede el tamaño
**Responde 404:** si el `order_id` no existe

---

## Puntos de fidelidad

### `GET /points`
**Auth:** requiere
**Responde 200:** `{ ok: true, balance, level, level_name, next_level_at, soles_value }` (sin cambios respecto al legacy, ya estaba bien)
**Responde 401:** sin token

---

## Tabla de códigos HTTP — referencia rápida para todo el plugin

| Código | Cuándo usarlo |
|---|---|
| 200 | Éxito, o respuesta de negocio válida (ej. "cupón inválido", "firma de pago rechazada") |
| 400 | Datos de entrada inválidos o faltantes |
| 401 | No autenticado (falta token o token inválido) |
| 403 | Autenticado pero sin permiso sobre el recurso (ej. pedido de otro usuario) |
| 404 | Recurso no encontrado |
| 409 | Conflicto de estado (ej. pedido ya pagado, monto no coincide) |
| 429 | Rate limit excedido |
| 500 | Error del servidor (WooCommerce no disponible, error de Izipay no controlado) |

**Regla dura:** ningún `catch` genérico devuelve 200. Si algo no está explícitamente listado arriba como "caso de negocio válido", es un error y debe usar el código correspondiente.

---

## Checklist para dar por "cerrado" cada endpoint nuevo

Antes de marcar un endpoint como terminado (no solo "funciona en happy path"):

- [ ] ¿Requiere auth y la valida correctamente?
- [ ] ¿Tiene rate limit si es de escritura?
- [ ] ¿Sanitiza todos los inputs de texto?
- [ ] ¿Devuelve el código HTTP correcto en cada caso de error, no solo en el éxito?
- [ ] ¿Está documentado en este archivo con su contrato real (no el planeado, el que realmente quedó implementado)?
- [ ] Si toca dinero: ¿el monto se lee siempre del servidor, nunca del cliente?
- [ ] Si es un endpoint que crea algo (pedido, dirección, etc.): ¿es seguro llamarlo dos veces por error (doble tap, reintento de red) sin duplicar datos?

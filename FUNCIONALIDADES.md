# Inventario de funcionalidades reales — Boticuy App

**Fecha:** 2026-07-10
**Método:** búsqueda y lectura directa de código en ambos proyectos (`boticuy-app-legacy/` y `boticuy-app/`, frontend y el plugin backend `boticuy-app-api.php`). No se asume ni se supone nada que no esté verificado en el código.

---

## 1. Notificaciones push

**No se encontró ninguna implementación de notificaciones push en ninguno de los dos proyectos.**

Verificado específicamente:
- No existe `expo-notifications` ni ningún paquete de push en `package.json` de `boticuy-app-legacy` ni de `boticuy-app`.
- No hay ningún archivo, import ni referencia a `Notifications`, tokens de push, o configuración de push (APNs/FCM) en ningún `src/` de los dos proyectos.
- No existe ninguna lógica de "recordatorio de recompra", "carrito abandonado", ni ningún mecanismo (cron, cola, tarea programada) en el plugin backend (`boticuy-app-api.php`) que dispare avisos de ningún tipo. El plugin no tiene `wp_mail`, `wp_schedule_event` ni ningún otro mecanismo de notificación saliente — solo responde a peticiones HTTP entrantes de la app.
- Las únicas coincidencias de las palabras "push"/"notification" en el código son falsos positivos: `Array.push()`, `navigation.push()` — no tienen relación con notificaciones push reales.

Si Fernando mencionó recordatorios de recompra o notificaciones de ofertas/carrito abandonado, esa funcionalidad **no existe hoy en el código**, ni en la versión recibida ni en la refactorizada. No es algo que se haya migrado incompleto — nunca se construyó.

---

## 2. Otras funcionalidades "inteligentes" o de retención (más allá del flujo básico)

Búsqueda específica de: recomendaciones personalizadas, gamificación, referidos, y cualquier lógica de retención más allá de puntos.

| Funcionalidad buscada | ¿Existe? | Evidencia |
|---|---|---|
| Recomendaciones personalizadas (motor de recomendación, "porque compraste X") | **No existe.** Lo que hay es una lista genérica | `ProductDetailScreen.tsx` y `CartScreen.tsx` muestran una sección de "productos" que en realidad es `fetchProducts({ perPage: 10, orderby: 'popularity' })` — los productos más populares del catálogo completo, iguales para todos los usuarios. No hay ningún algoritmo de personalización, ni collaborative filtering, ni "basado en tu historial". Es cross-sell genérico, no recomendación inteligente. |
| Programa de fidelidad más allá de los puntos | **No existe nada adicional.** El programa de puntos ya migrado (`PointsScreen.tsx`) tiene 3 niveles fijos (Bronce/Plata/Oro por rango de puntos acumulados: 0+/500+/1500+) con una barra de progreso al siguiente nivel. No hay logros/insignias, no hay recompensas por nivel más allá de lo que ya da el puntaje, no hay vencimiento de puntos, no hay niveles con beneficios distintos documentados en código (el "desbloquea más beneficios" del copy es genérico, no hay lógica de beneficios diferenciados por nivel). |
| Gamificación (retos, rachas, insignias, logros) | **No existe.** Ningún archivo, store ni pantalla implementa rachas, logros o mecánicas de juego. |
| Programa de referidos ("invita a un amigo") | **No existe.** No hay ningún código de invitación, link de referido, ni recompensa por traer usuarios nuevos. |
| "Creadores" / cupones de afiliados | **Existe, pero no es un programa de referidos de usuarios.** `CreatorsScreen.tsx` + `GET /creators` muestran un roster fijo de creadores de contenido ("Copa Boticuy" + creadores aliados) con códigos de cupón de descuento. Es un sistema de códigos promocionales ligado a influencers/creadores, administrado por el negocio (roster hardcodeado en el plugin) — no un mecanismo donde un usuario cualquiera invita a otro y ambos ganan algo. |
| Búsquedas recientes, vistos recientemente, favoritos | **Existen, son personalización ligera, no "inteligencia".** `recentSearchesStore`, `recentlyViewedStore` y `favoritesStore` guardan estado local del dispositivo (AsyncStorage) para mostrarle al usuario su propio historial — no hay ningún procesamiento, algoritmo ni servidor involucrado; es persistencia simple de lo que el usuario ya hizo. |

**En síntesis:** más allá del catálogo, cuenta y compra, la única mecánica de retención real que existe es el programa de puntos por niveles (Bronce/Plata/Oro) ya migrado. No hay recomendaciones personalizadas, gamificación, ni referidos en ningún lado del código, ni en la versión recibida ni en la refactorizada.

---

## 3. Inventario completo de funcionalidades reales (por categoría)

Todo lo listado a continuación está verificado en el código de `boticuy-app/` (versión actual, con paridad funcional confirmada contra el legacy en `docs/historial/PARIDAD_CHECK.md`).

### Catálogo
- Listado de productos con paginación infinita, pull-to-refresh.
- Búsqueda con sugerencias en vivo (categorías y marcas que matchean el texto).
- Filtros por categoría ("necesidad") y por marca, combinables, con chips removibles.
- Búsquedas recientes guardadas localmente.
- Detalle de producto: galería de imágenes, precio (con precio regular tachado si hay descuento), stock (agotado / stock bajo con cantidad exacta), reseñas con badge de "compra verificada", secciones de contenido enriquecido (beneficios, composición, advertencias, referencias) cuando el producto las tiene cargadas en WordPress.
- Productos "relacionados" (populares, no personalizados — ver sección 2).
- Historial de "vistos recientemente".
- Favoritos (guardado local, lista propia).

### Cuenta / autenticación
- Registro y login (email + contraseña) contra el backend real de WordPress/WooCommerce.
- Sesión persistida de forma segura (`expo-secure-store`), validada contra `/auth/me` al abrir la app.
- Perfil con acceso a pedidos, direcciones, puntos y creadores solo si hay sesión iniciada; bloqueado (con candado visual) si no la hay.
- Estado de atención al cliente (en línea / fuera de horario) con horario configurable.

### Carrito y checkout
- Carrito con control de cantidad, eliminar ítem, barra de progreso a envío gratis.
- Cupones de descuento (código manual o vía creadores).
- Cálculo de envío real contra WooCommerce según distrito elegido (no un texto fijo).
- Checkout con **3 métodos de pago**: tarjeta (Izipay, vía WebView embebido), Yape/Plin (coordinación manual por WhatsApp, sin subida de comprobante) y contraentrega.
- Guardado opcional de datos de envío para la próxima compra ("Recordar mis datos"), y si hay sesión, guardado como dirección de la cuenta.
- Protección de idempotencia (evita pedidos duplicados por doble tap o reintento de red).
- Confirmación de pedido con resumen real (envío, método de pago, cupón aplicado).

### Direcciones
- CRUD de direcciones guardadas en la cuenta (agregar, listar, eliminar), reutilizables en el checkout.

### Pedidos
- Historial de pedidos propios, con estado (pendiente, procesando, entregado, cancelado/reembolsado/fallido detectado explícitamente).
- Detalle de pedido con línea de tiempo de estados y lista de productos.
- "Volver a pedir": reagrega al carrito los productos de un pedido anterior, con manejo de error producto por producto si alguno ya no está disponible.

### Puntos / fidelización
- Saldo de puntos, equivalencia en soles de descuento.
- 3 niveles por rango de puntos acumulados (Bronce/Plata/Oro) con barra de progreso al siguiente nivel.
- Puntos se acreditan cuando el pedido llega a "Entregado" (regla de negocio, resuelta en el backend).

### Creadores y cupones de afiliados
- Roster de creadores ("Copa Boticuy" + creadores aliados) con código de cupón de descuento propio, aplicable directo desde la pantalla al carrito.

### Analítica y soporte
- Tracking de eventos del embudo de conversión (ver, buscar, agregar al carrito, iniciar checkout, pedido confirmado) conectado a PostHog (ver `PROGRESO.md` — cuenta compartida temporalmente con el legacy).
- Contacto directo por WhatsApp (botón con mensaje prellenado) desde el perfil y desde la confirmación de pedido.
- Aviso visual de "sin conexión a internet" y avisos flotantes de confirmación (Toast) para acciones como agregar al carrito o aplicar un cupón.

### Onboarding
- Carrusel de bienvenida (3 pantallas estáticas) que se muestra una sola vez por dispositivo.

---

## Conclusión

La app hoy cubre un flujo de e-commerce completo (catálogo → cuenta → carrito → checkout con 3 métodos de pago → pedidos → puntos) más un conjunto de funcionalidades de soporte (direcciones guardadas, favoritos, historial, cupones de creadores, contacto por WhatsApp). **No tiene, en ningún lado del código de ninguno de los dos proyectos, notificaciones push, recomendaciones personalizadas, gamificación ni programa de referidos.** Lo único parecido a retención más allá de la compra es el programa de puntos por niveles ya migrado. Cualquier plan de recordatorios de recompra u ofertas por notificación sería una funcionalidad completamente nueva a construir, no una migración de algo existente.

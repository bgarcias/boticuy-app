# Boticuy App — Requerimientos v2 (rediseño)

**Estado:** Borrador para discusión con TI (Luis Almeyda) y Fernando/David.
**Base:** Documento HU original de Fernando (jun 2026) + hallazgos de la auditoría técnica del código legacy (jul 2026).
**Objetivo de este documento:** definir qué construye la v1 del rediseño, qué se corta para no sobre-alcanzar, y qué reglas de seguridad son no negociables desde el diseño (no parches después).

---

## 0. Principios para este rediseño

1. **MVP real, no "todo lo que ya se prometió".** Se prioriza que lo que existe funcione bien y seguro, sobre tener más pantallas a medias.
2. **Ningún endpoint de escritura sin autenticación ni validación server-side**, salvo que se justifique explícitamente (ver `API-CONTRACT.md`, documento aparte).
3. **El monto de cualquier cobro se calcula siempre en el servidor**, nunca se recibe del cliente como dato confiable.
4. **Todo se documenta a medida que se construye**, no al final. Cada endpoint nuevo implica una entrada en `API-CONTRACT.md` antes de darlo por terminado.
5. **Entornos separados desde el día uno**: local → staging → producción. Nada se prueba contra producción directamente.

---

## 1. Épicas — qué se queda, qué se corta, qué cambia

### Épica 1 — Catálogo y descubrimiento
**Se queda, sin cambios de alcance.** Es la parte de menor riesgo y la que ya funcionaba mejor en el código legacy (consume directo la Store API pública de WooCommerce).

| HU | Descripción | Cambios respecto al original |
|---|---|---|
| RQ-01 | Ver catálogo con foto, nombre, precio, paginado | Ninguno, se reconstruye igual |
| RQ-02 | Buscar productos por nombre | Ninguno |
| RQ-03 | Ver ficha completa de producto (descripción, precio, stock) | Ninguno |
| RQ-04 | Ver reseñas de compradores en la ficha | Ninguno |

### Épica 2 — Carrito y compra
**Se queda, pero con el flujo de pago rediseñado por completo** (ver sección 3, no negociable).

| HU | Descripción | Cambios respecto al original |
|---|---|---|
| RQ-05 | Agregar/modificar productos en el carrito, persistente localmente | Ninguno |
| RQ-06 | Aplicar cupón de descuento (incluye cupones de creadores) | Ninguno en UX; validación server-side reforzada |
| RQ-07 | Comprar como invitado | Ninguno |
| RQ-08 | Recordar datos de envío (opt-in, local) | Ninguno |
| RQ-09 | Pagar con tarjeta dentro de la app | **Rediseñado.** Ver sección 3. El pedido ya no se marca pagado al crearse; se marca pagado solo tras validar que el monto cobrado coincide con el total real. |
| RQ-09b | Pagar con Yape/Plin adjuntando comprobante | Mismo patrón que ya usa el checkout de la web: se muestra una imagen (QR estático de la cuenta del negocio) y el cliente adjunta una foto del comprobante de pago desde la app. El pedido queda `on-hold` hasta que alguien del negocio verifica manualmente el comprobante. No es un pago validado automáticamente, es coordinación con verificación humana. Baja complejidad técnica: solo requiere un endpoint de subida de imagen asociado al pedido. |
| RQ-10 | Ver confirmación de pedido con número y detalle | Ninguno, pero ahora sí refleja un pedido realmente pagado o realmente pendiente, sin estados falsos |

**Nota sobre el corte de alcance inicial:** Yape/Plin con comprobante es de baja complejidad (mismo patrón que la web, sin integración de pago real) y se mantiene en v1 junto con tarjeta (Izipay) y contraentrega. Lo que sí se deja fuera de v1 es cualquier variante que implique cobro automático desde la app de Yape (deep link de pago, confirmación automática vía API de Yape); eso sí sería complejidad adicional no justificada para el lanzamiento inicial.

### Épica 3 — Cuenta y recompra
**Se queda, con ajustes de seguridad en la sesión.**

| HU | Descripción | Cambios respecto al original |
|---|---|---|
| RQ-11 | Registro e inicio de sesión | Se mantiene JWT propio, pero con duración corta + refresh token (ver sección 4), no un token único de 30 días |
| RQ-12 | Historial de pedidos y detalle | Ninguno |
| RQ-13 | "Volver a pedir" | Ninguno |
| RQ-14 | Guardar dirección de envío | Ninguno |
| RQ-15 | Puntos de fidelidad | Ninguno, se mantiene igual (1 punto por S/1 en pedidos completados) |

**Pregunta abierta para Fernando/David:** ¿el programa de creadores (Copa Boticuy, cupones por código de creador) sigue vigente para esta versión, o es una campaña con fecha de cierre? Si tiene fecha de cierre, no vale la pena construirlo como funcionalidad permanente del BFF, sino como algo más simple y desactivable.

---

## 2. Requisitos no funcionales (nuevos, no estaban en el documento original)

Estos no son "historias de usuario" pero son igual de obligatorios. Salen directo de lo que faltó la primera vez.

### 2.1 Seguridad
- Todo endpoint que cree, modifique o elimine datos (`POST`, y los `GET` que devuelvan datos de un usuario específico) requiere JWT válido. Nada de `permission_callback => '__return_true'` salvo endpoints explícitamente públicos (catálogo, ubigeo, validación de cupón).
- Rate limiting en: login (ya existía y estaba bien hecho, se mantiene), registro, creación de pedido, y solicitud de cobro. No solo en login.
- Códigos HTTP correctos siempre: 200 éxito, 400 datos inválidos, 401 no autenticado, 403 no autorizado, 404 no encontrado, 409 conflicto, 500 error de servidor. Nunca 200 para un error.
- Sanitización de inputs consistente en el 100% de los campos que se guardan o se muestran en el admin de WordPress, sin excepciones puntuales.

### 2.2 Configuración por entorno
- La app nunca tiene URLs de backend ni modo de pago (TEST/LIVE) hardcodeados en el bundle. Se leen de configuración por entorno (`app.config.js` + variables EAS).
- El plugin nunca decide el modo TEST/LIVE por una constante en el código; lo lee de la configuración real de WooCommerce/Izipay.

### 2.3 Observabilidad
- Reporte de errores/crashes en producción (Sentry o equivalente) desde el primer release, no como mejora futura.
- Error Boundary de React en la raíz de la app, para que una excepción de render no deje pantalla en blanco sin registro.

### 2.4 Testing mínimo obligatorio antes de activar pagos reales
- Cobertura de tests automatizados del flujo completo de checkout/pago (crear pedido → generar cobro → validar pago → estado final), no solo de funciones utilitarias sueltas.
- Prueba de pago end-to-end en modo TEST de Izipay, documentada, antes de cualquier release con `ordersEnabled`/pagos activos.

### 2.5 Documentación viva
- `README.md` en app y en plugin: cómo levantar el proyecto localmente, variables de entorno requeridas.
- `API-CONTRACT.md`: contrato de cada endpoint (input, output, validaciones, códigos de error posibles). Se actualiza en el mismo PR/MR que agrega o cambia un endpoint, no después.
- `CHANGELOG.md` del plugin: qué cambió en cada versión.

---

## 3. El flujo de pago, rediseñado (no negociable)

Este es el punto que originó todo el proceso de auditoría, así que se deja explícito aquí para que no se pierda al pasar a diseño técnico.

**Problema del código legacy:** el pedido se marcaba como pagado (`processing`) en el momento de crearse, y el monto que se le pedía cobrar a Izipay venía suelto del cliente, sin relación con el pedido.

**Regla para el rediseño:**
1. Crear pedido → estado `pending` (nunca `processing` de entrada).
2. Solicitar cobro a Izipay → se manda el `order_id`, el monto se lee del pedido real en WooCommerce en ese momento, nunca del cliente.
3. Confirmar pago → se valida la firma de Izipay **y** se compara el monto pagado contra el total del pedido. Solo si ambos coinciden, el pedido pasa a `processing`.
4. Si el pago falla o el usuario cierra la app a medio proceso, el pedido queda en `pending` y debe poder reintentarse desde el detalle del pedido en la app (esto no existía en el código legacy y hay que agregarlo).

Este flujo va con más detalle técnico en `API-CONTRACT.md`, pero la regla de negocio (monto siempre server-side, pedido pagado solo tras validación cruzada) se define aquí porque es un requerimiento de producto, no un detalle de implementación.

---

## 4. Preguntas pendientes de negocio (no técnicas, para Fernando/David/TI)

Estas bloquean poder cerrar el documento de arquitectura, hay que resolverlas antes de avanzar:

1. ¿El programa de creadores/Copa Boticuy sigue activo indefinidamente o es una campaña con fecha de cierre?
2. ¿Quién es el dueño formal de las cuentas de Google Play Console y Apple Developer? (Bitacore/TI, o Droguería Perú directamente)
3. ¿Hay presupuesto para Sentry (u otra herramienta de crash reporting) y para las cuentas de desarrollador de las tiendas (Google Play USD 25 único, Apple Developer USD 99/año)?
4. ¿El repositorio se aloja en el GitLab de Bitacore (según indicó Luis) o hay alguna otra preferencia?
5. Para v1, ¿el único método de pago real es tarjeta vía Izipay, o se necesita también Yape/Plin como método verificable (no solo "coordinar por WhatsApp")?

---

## 5. Stack y versiones — validado hoy (2026-07-08), para que todo sea compatible entre sí

Estas versiones se fijan al momento de arrancar el proyecto y quedan documentadas aquí para que nadie instale "lo último" sin revisar compatibilidad primero, que fue parte del problema original (`jest-expo` en SDK 56 mientras `expo` estaba en SDK 54).

### App (React Native)

| Componente | Versión a usar | Motivo |
|---|---|---|
| Expo SDK | **56** (estable desde el 21 may 2026) | SDK 57 acaba de salir (primera semana de jul 2026), demasiado reciente para un proyecto que necesita estabilidad desde el día uno. Se reevalúa el upgrade a 57 más adelante, cuando tenga más rodaje. |
| React Native | 0.85 (la que trae SDK 56 emparejada) | No se elige suelta, viene fija con el SDK |
| React | 19.2 | Igual, viene emparejada con el SDK |
| TypeScript | La que trae el template de `create-expo-app` para SDK 56 | Igual |
| Node.js | LTS 22.x | Requisito de Expo CLI actual; usar vía `nvm`/`nvm-windows` para poder cambiar de versión si otro proyecto lo requiere |

**Regla para evitar el desorden anterior:** el proyecto se crea con `npx create-expo-app@latest`, nunca instalando `expo` y sus dependencias sueltas a mano. Cualquier librería adicional se instala con `npx expo install <paquete>` (no `npm install` directo), porque ese comando resuelve automáticamente la versión compatible con el SDK 56 instalado. Después de cualquier instalación, correr `npx expo-doctor` para detectar desalineamientos antes de que se conviertan en bug.

### Backend (WordPress / WooCommerce)

**Pendiente de confirmar contra el hosting real de boticuy.com** (no asumido): antes de escribir una sola línea del plugin nuevo, hay que revisar en el wp-admin → **WooCommerce → Estado → Entorno del sistema**, la versión exacta de:
- PHP
- WordPress
- WooCommerce
- MySQL/MariaDB

Como referencia de lo que se recomienda para un desarrollo nuevo en 2026 (a confirmar que el hosting de Boticuy lo cumpla):

| Componente | Mínimo aceptable | Recomendado |
|---|---|---|
| PHP | 8.1 | 8.2 u 8.3 |
| WordPress | 6.0+ | Última estable |
| WooCommerce | Compatible con el PHP anterior | Última estable |
| MySQL / MariaDB | MySQL 5.7 / MariaDB 10.3 | MySQL 8.0 / MariaDB 10.6 |

Si el hosting actual de Boticuy está en una versión de PHP menor a 8.1, es una conversación aparte con TI/hosting antes de construir el plugin nuevo, porque codificar contra una versión de PHP distinta a la real del servidor genera el mismo tipo de problema de desalineamiento que tuvo la app.

### Entornos de prueba de pago

- Izipay/Krypton: confirmar con TI si las credenciales TEST actuales (mencionadas en el código legacy vía `woocommerce_micuentaweb_settings`) siguen vigentes, o si hay que solicitar unas nuevas para el ambiente de staging.

**Acción concreta antes de escribir código de plugin:** pedir a Luis Almeyda (o a quien administre el hosting) un export del "System Status" de WooCommerce (`WooCommerce → Estado → Obtener el informe del sistema`), eso da PHP, WP, WooCommerce, MySQL y todos los plugins activos reales en un solo documento, sin adivinar nada.

---

**Siguiente documento:** `ARQUITECTURA.md` (entornos, diagrama de flujo de datos, stack confirmado) — se arma una vez resueltas las preguntas de la sección 4 y confirmado el System Status real de la sección 5, para no documentar sobre supuestos.

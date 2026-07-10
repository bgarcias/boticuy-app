# Refactorización de Boticuy App — informe para Fernando, David y TI

**Fecha:** 2026-07-10
**Fuentes:** `docs/historial/PARIDAD_CHECK.md`, `PROGRESO.md`, `docs/historial/DIAGNOSTICO_ACTUAL.md`, `API-CONTRACT.md`, `docs/historial/AUDITORIA.md` (todos en este repositorio de trabajo). Este documento no agrega hallazgos nuevos: organiza y presenta lo que ya está verificado en esas fuentes.

---

## 1. Contexto y objetivo

Boticuy App se recibió como una aplicación construida con asistencia de IA, sin un ingeniero de software involucrado en su desarrollo. Antes de decidir qué hacer con ella, se hizo una evaluación técnica completa del código real (`docs/historial/AUDITORIA.md`): app móvil, plugin backend de WordPress (`boticuy-app-api.php`), dependencias y manejo de errores.

Esa evaluación concluyó que la estructura de fondo era rescatable: la lógica de negocio más sensible (cálculo de montos de pago, validación de Izipay, autenticación) estaba resuelta con cuidado real, no de forma superficial. Con esa base, se decidió **refactorizar sobre el código existente, no descartarlo y reescribirlo desde cero**. El trabajo que sigue es una migración funcional pantalla por pantalla y endpoint por endpoint hacia una base de código reorganizada, no una reconstrucción del producto.

---

## 2. Resumen ejecutivo

Se mantuvo el 100% de la funcionalidad y la experiencia de usuario de la versión original, confirmado archivo por archivo en `docs/historial/PARIDAD_CHECK.md`. Se corrigieron los hallazgos de seguridad identificados en la auditoría técnica (`docs/historial/DIAGNOSTICO_ACTUAL.md`), reconociendo explícitamente cuáles ya los había cerrado el equipo original antes de esta refactorización. Se mejoró la organización del código (configuración por entorno, utilidades centralizadas, cobertura de tests) sin alterar el comportamiento que el negocio ya validó. El resultado es una base de código equivalente en funcionalidad, más ordenada y con su historial de cambios trazable en control de versiones.

---

## 3. Comparativa funcional (paridad)

`docs/historial/PARIDAD_CHECK.md` documenta un barrido archivo por archivo entre la versión recibida (`boticuy-app-legacy/`) y la refactorizada (`boticuy-app/`), sin apoyarse en documentos de seguimiento previos.

| Área | Archivos comparados | Resultado |
|---|---|---|
| Pantallas (`src/screens/`) | 16 | 100% con equivalente funcional, comparado función por función (no solo por nombre de archivo) |
| Funciones de API (`src/api/*.ts`) | 12 archivos, todas las funciones exportadas | 100% con equivalente funcional (algunas reorganizadas entre archivos, comportamiento verificado igual) |
| Componentes (`src/components/`) | 15 | 100% con equivalente funcional, tras cerrar los 2 hallazgos descritos abajo |

El barrido encontró tres puntos sin equivalente en el momento de hacerlo, todos ya cerrados:

- **Toast** (aviso flotante de confirmación, ej. "Agregado al carrito"): el componente visual no existía en la versión refactorizada, aunque el store y las 5 llamadas que lo activaban seguían en el código — es decir, la app intentaba mostrar el aviso y no pasaba nada. Se migró el componente y se montó en la raíz de la app.
- **OfflineBanner** (aviso de "sin conexión a internet"): no existía el componente ni la dependencia que detecta el estado de red. Se migró e instaló.
- **PostHog** (analítica de producto): la versión original sí tenía una conexión real y activa a PostHog (cuenta con key de producción, inicializada al abrir la app); la versión refactorizada tenía la capa de abstracción pero sin el proveedor conectado. Se conectó usando la misma cuenta, con la key/host leídos desde configuración en vez de hardcodeados (ver sección 5).

Con estos tres puntos cerrados, **`docs/historial/PARIDAD_CHECK.md` confirma 100% de paridad funcional** entre ambas versiones, verificado con `tsc`, `expo-doctor` y la suite de tests.

---

## 4. Hallazgos de seguridad: origen y estado

`docs/historial/DIAGNOSTICO_ACTUAL.md` cruza tres fuentes de hallazgos sobre el backend (`boticuy-app-api.php`): la auditoría técnica propia (`docs/historial/AUDITORIA.md`), las observaciones de TI (correos de Luis Almeyda) y un correo de Fernando con puntos puntuales a verificar. Es importante distinguir qué ya había corregido el equipo original **antes** de esta refactorización, de lo que se corrigió después.

| Hallazgo | Quién lo identificó | Estado en la versión recibida | Estado actual |
|---|---|---|---|
| Cálculo de montos de pago 100% en el servidor, con doble verificación | Auditoría propia | Ya corregido por el equipo original | Sin cambios — se mantiene igual, reutilizado tal cual |
| Validación criptográfica del pago de Izipay (HMAC + anti-replay + anti-manipulación de monto) | Auditoría propia | Ya corregido por el equipo original | Sin cambios — se mantiene igual |
| Modo TEST/PRODUCTION de Izipay leído de configuración, no hardcodeado | Auditoría propia | Ya corregido por el equipo original | Sin cambios — se mantiene igual |
| Sanitización de inputs en creación de pedidos y direcciones | Auditoría propia | Ya corregido por el equipo original | Sin cambios — se mantiene igual |
| Rate limiting en registro, login y creación de pedidos | Auditoría propia | Ya corregido por el equipo original | Sin cambios — se mantiene igual (con un matiz pendiente, ver sección 6) |
| Duración del JWT (antes 30 días) | Auditoría propia, confirmado en el correo de Fernando | Ya corregido a 7 días por el equipo original | Sin cambios |
| IDOR en `/payment/formtoken` y `/payment/validate` — un tercero podía pedir/pagar el formToken de un pedido ajeno usando IDs consecutivos | Auditoría propia (hallazgo nuevo, no estaba en el checklist de TI) | Abierto en la versión recibida | Corregido por el equipo original el 2026-07-09 (`bcy_order_access_ok()` + `checkout_token` para invitados), antes de que empezara esta refactorización. Migrado tal cual al frontend (`payment.ts`, `PaymentWebViewScreen`) |
| Falta de idempotencia en `/order` — un doble tap o reintento de red podía duplicar un pedido | Correo de Fernando | Abierto en la versión recibida | Corregido por el equipo original el 2026-07-09 (`idempotency_key`), antes de esta refactorización. Migrado al frontend (`idempotencyKey` generado en `CheckoutScreen`) |
| `originWhitelist={['*']}` en el WebView de pago — podía navegar a cualquier origen | Auditoría propia | Abierto en la versión recibida | Corregido en esta refactorización: acotado a `boticuy.com` y `*.micuentaweb.pe` |
| `/auth/refresh` no existe en el backend real de producción (confirmado con una petición directa: responde 404), pero la app llamaba a ese endpoint en cada apertura y, al no existir, interpretaba la respuesta como sesión inválida y cerraba la sesión del usuario | Encontrado durante esta refactorización, no estaba señalado como hallazgo en `docs/historial/AUDITORIA.md`/`docs/historial/DIAGNOSTICO_ACTUAL.md` (ver nota de contradicción al final) | Bug activo, no detectado antes | Corregido en esta refactorización: la validación de sesión ahora usa `/auth/me` (sí existe y funciona), sin depender de un endpoint inexistente |
| Códigos HTTP inconsistentes (200 en vez de error en un caso de registro) y fuga puntual de mensajes de error internos de WordPress al cliente | TI (Luis Almeyda) | Parcialmente corregido — persisten 2 casos puntuales según `docs/historial/DIAGNOSTICO_ACTUAL.md` | Sin cambios adicionales — es un ajuste del plugin backend, fuera del alcance de esta refactorización de frontend |
| Repositorio Git de la empresa para el código que corre en producción | TI (Luis Almeyda) | No existía ningún historial de cambios versionado | Sigue pendiente — requiere acceso/decisión de TI (ver sección 6) |

---

## 5. Mejoras estructurales, con justificación

- **Configuración por entorno (`app.config.js` vs. `config.ts` hardcodeado).** La versión original tenía las URLs de API, la key de analítica y otros valores de negocio hardcodeados en el bundle — cambiar de entorno (local/staging/producción) exigía editar código y recompilar. Ahora esos valores se leen de variables de entorno `EXPO_PUBLIC_*` con default a producción. *Impacto: se puede apuntar a un ambiente de pruebas sin tocar una línea de código ni volver a compilar el bundle.*
- **Utilidades centralizadas (`isValidEmail`, `decodeHtmlEntities`).** La validación de email estaba duplicada en dos pantallas independientes; la decodificación de texto de WordPress/WooCommerce tenía dos implementaciones incompletas que dejaban pasar entidades como `&#8211;` sin traducir (se veían literal en la app, incluyendo en nombres de producto). Ahora cada una vive en un solo lugar y se aplica de forma consistente en toda la capa de API. *Impacto: corrige un defecto visible real en nombres de producto/categoría/reseña en todo el catálogo, y evita que una futura regla de validación quede desactualizada en un solo archivo mientras el otro sigue con la regla vieja.*
- **Corrección de `/auth/refresh` roto en producción.** Como se detalla en la sección 4, este endpoint no existe en el backend real; la app original lo llamaba igual y, al fallar, cerraba la sesión del usuario en cada apertura. *Impacto: corrige un bug de producción real (logout silencioso), no una mejora cosmética.*
- **Cálculo de envío real en el checkout.** La versión original mostraba un texto fijo ("se coordina según tu zona") sin consultar ningún costo real antes de confirmar el pedido. Ahora se consulta el costo real de WooCommerce en cuanto el usuario elige su distrito. *Impacto: el usuario ve el costo de envío antes de comprar, no después por WhatsApp — menos fricción y menos sorpresas post-compra.*
- **`originWhitelist` acotado en el WebView de pago.** Ver detalle en la sección 4. *Impacto: cierra una superficie de ataque en la pantalla más sensible de la app (pago con tarjeta), identificada en la auditoría original y nunca cerrada hasta ahora.*
- **Cobertura de tests restaurada (y ampliada).** La versión original tenía 9 tests automatizados (`cartStore`, `utils/format`) que no se habían migrado; al ir a portarlos se encontró que el proyecto refactorizado no tenía ninguna infraestructura de testing configurada. Se migraron los tests y se instaló/configuró `jest`/`jest-expo` desde cero. *Impacto: vuelve a existir una red de seguridad automatizada sobre la lógica de carrito y formateo de precios, que antes dependía solo de pruebas manuales.*

---

## 6. Estado actual y pendientes

- **Verificación real de pago en modo TEST.** El flujo de checkout con `ordersEnabled=true` y credenciales TEST de Izipay (crear pedido real → pedir formToken → pagar en el WebView → validar) no se ha probado end-to-end todavía. Está pendiente de que TI defina un ambiente de pruebas apropiado (credenciales TEST de Izipay, y confirmar si se prueba contra `boticuy.com` o un ambiente aparte) — no se puede cerrar sin esa definición.
- **Reestructuración del plugin backend en clases.** `boticuy-app-api.php` sigue siendo un único archivo procedural de 840 líneas (aceptable para su tamaño actual, según la propia auditoría). Migrarlo a una estructura de clases/namespaces es una mejora de mantenibilidad identificada en `docs/historial/AUDITORIA.md`, no bloqueante para el funcionamiento actual, y queda pendiente para una iteración futura.
- **Repositorio Git de la empresa.** El código que corre hoy en producción (`boticuy-app-legacy/`, incluido el plugin) no está versionado en ningún repositorio real de la empresa — solo existe como carpeta local. Este proyecto refactorizado sí tiene un repositorio git local, pero sin remoto configurado. Subir ambos a un repositorio real de la empresa es una decisión operativa pendiente de acceso por parte de TI, señalada tanto por TI como por la auditoría propia.
- **No bloqueantes, heredados de la auditoría original y sin tocar en esta refactorización** (documentados en `docs/historial/AUDITORIA.md`, fuera del alcance de esta migración de frontend): unificar los 2 casos restantes de códigos HTTP/mensajes de error internos del plugin, y confirmar con TI/hosting cómo se resuelve la IP real detrás de cualquier proxy o CDN para que el rate limiting funcione como se espera.

---

## 7. Conclusión

Este trabajo es una refactorización justificada punto por punto sobre una base que, según la evaluación técnica, valía la pena conservar — no un descarte del esfuerzo original. Se preservó toda la funcionalidad y experiencia de usuario ya validada por el negocio, se cerraron los hallazgos de seguridad pendientes reconociendo explícitamente lo que el equipo original ya había corregido por su cuenta, y se dejó una base de código más ordenada y con su historial trazable. Lo que queda pendiente son decisiones operativas y de ambiente (acceso a repositorio, ambiente de pruebas de pago), no deuda técnica oculta en el código.

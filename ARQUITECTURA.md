# Boticuy App — Arquitectura v2 (rediseño)

**Depende de:** `REQUERIMIENTOS.md` (mismo proyecto).
**Objetivo:** dejar clara la estructura técnica antes de escribir código, para que el remake arranque con base ordenada desde el primer commit.

---

## 1. Piezas del sistema

```
┌─────────────────────┐         ┌──────────────────────────┐
│   Boticuy App        │         │   boticuy.com (WordPress) │
│   (React Native/Expo)│         │                            │
│                       │  HTTPS  │  ┌──────────────────────┐  │
│  - Catálogo           │────────▶│  │ WooCommerce Store API │  │  (pública, solo lectura,
│  - Carrito local      │         │  │ /wp-json/wc/store/v1  │  │   ya existe, no se toca)
│  - Checkout           │         │  └──────────────────────┘  │
│  - Cuenta             │         │                            │
│                       │  HTTPS  │  ┌──────────────────────┐  │
│                       │────────▶│  │ boticuy-app-api        │  │  (plugin nuevo,
│                       │         │  │ /wp-json/boticuy-app/v1│  │   construido desde cero)
│                       │         │  └──────────┬─────────────┘  │
│                       │         │             │                │
│                       │         │             ▼                │
│                       │         │      WooCommerce core         │
│                       │         │      (pedidos, usuarios,      │
│                       │         │       cupones, stock)         │
│                       │         └────────────────┬──────────────┘
│                       │                           │
│                       │                           ▼
│                       │                  ┌──────────────────┐
│                       │◀─────────────────│  Izipay/Krypton   │  (WebView dentro
│                       │   WebView pago    │  (pasarela)       │   de la app)
└───────────────────────┘                  └──────────────────┘
```

**Regla de dependencia:** la app nunca habla directo con Izipay salvo dentro del WebView de pago (que carga el widget oficial de Izipay). Todo lo demás pasa por el plugin.

---

## 2. Entornos

| Entorno | WordPress | App apunta a | Izipay | Propósito |
|---|---|---|---|---|
| **Local** | Local WP en tu máquina, con WooCommerce + datos de prueba | `http://localhost:xxxx` (o IP local si se prueba en celular físico) | Modo TEST | Desarrollo día a día |
| **Staging** | Subdominio o sitio aparte en el hosting real (a definir con TI/hosting) | URL de staging | Modo TEST | Validar contra datos/config reales antes de producción, probar builds antes de subir a tiendas |
| **Producción** | boticuy.com | URL de producción | Modo LIVE | Usuarios reales |

**Cómo la app sabe a qué entorno apuntar:** vía `app.config.js` + variables de entorno de EAS (`eas.json` con perfiles `development`, `preview`, `production`), nunca hardcodeado en `config.ts` como estaba en el proyecto legacy. Esto es lo primero que se configura al crear el proyecto.

**Pendiente de definir con TI/hosting (bloquea armar staging):** dónde vive el entorno de staging físicamente. Opciones típicas: subdominio de boticuy.com, o un sitio aparte en el mismo hosting. Se resuelve junto con el acceso al WordPress que ya tienes.

---

## 3. Flujo de datos (versión corregida del checkout)

```
1. App arranca
   └─ Lee token guardado (SecureStore) → si existe, valida sesión contra /auth/me

2. Catálogo (sin login)
   └─ GET Store API pública (WooCommerce) → productos, precios, stock

3. Carrito
   └─ 100% local (persistencia en dispositivo), no toca servidor hasta el checkout

4. Checkout → "Confirmar pedido"
   └─ POST /boticuy-app/v1/order
        ├─ Servidor recalcula todo desde WooCommerce (productos, cupón, envío)
        ├─ Crea el pedido en estado PENDING (nunca "pagado" de entrada)
        └─ Devuelve order_id + total real calculado por el servidor

5. Según método de pago elegido:

   a) Tarjeta (Izipay):
      └─ POST /payment/formtoken { order_id }        ← manda order_id, NO monto
           └─ Servidor lee el total DEL PEDIDO (no del cliente) y genera formToken
      └─ WebView carga widget de Izipay, usuario paga
      └─ POST /payment/validate { order_id, kr-answer, kr-hash }
           ├─ Valida firma HMAC (ya estaba bien hecho en el código legacy)
           ├─ Compara monto pagado vs. total del pedido (esto es lo que faltaba)
           └─ Solo si ambos son correctos → pedido pasa a PROCESSING

   b) Yape/Plin con comprobante:
      └─ POST /payment/voucher { order_id, imagen }
           └─ Pedido pasa a ON-HOLD, queda pendiente de verificación manual

   c) Contraentrega:
      └─ Pedido queda en ON-HOLD hasta la entrega

6. Confirmación
   └─ App muestra número de pedido + estado real (no asume éxito)
```

Este es el flujo que reemplaza al del código legacy, donde `formtoken` no sabía nada del pedido y el pedido se marcaba pagado al crearse.

---

## 4. Estructura de carpetas — proyecto completo

```
boticuy-project/
├── boticuy-app-legacy/          ← código actual auditado, solo consulta, no se ejecuta ni se edita
├── boticuy-app/                 ← app nueva (React Native + Expo)
└── boticuy-app-api/             ← plugin nuevo (WordPress)
```

### 4.1 `boticuy-app/` (creado con `npx create-expo-app@latest`)

```
boticuy-app/
├── app.config.js                 ← config por entorno (URLs, claves públicas), NO hardcodeado
├── eas.json                      ← perfiles development / preview / production
├── src/
│   ├── api/                      ← funciones que llaman al backend (axios), sin lógica de UI
│   │   ├── client.ts              (instancia axios + interceptor de auth)
│   │   ├── auth.ts
│   │   ├── products.ts
│   │   ├── orders.ts
│   │   ├── payment.ts
│   │   ├── addresses.ts
│   │   ├── coupons.ts
│   │   └── shipping.ts
│   ├── store/                    ← estado global (Zustand)
│   │   ├── authStore.ts
│   │   ├── cartStore.ts
│   │   └── ...
│   ├── screens/                  ← pantallas (orquestación + presentación)
│   ├── components/               ← presentación pura, reutilizable
│   ├── hooks/                    ← NUEVO respecto al legacy: useCheckoutForm, useFetch genérico,
│   │                                para no repetir lógica en cada pantalla
│   ├── theme/                    ← design tokens
│   ├── types/                    ← tipos de dominio compartidos
│   └── utils/                    ← funciones puras compartidas (ej. validación de email,
│                                     que en el legacy estaba duplicada en dos pantallas)
├── __tests__/                    ← incluye tests del flujo de checkout/pago desde el inicio,
│                                     no como pendiente
└── README.md                     ← cómo levantar el proyecto local, variables de entorno
```

**Diferencia clave respecto al legacy:** se agrega `hooks/` desde el día uno para evitar que `CheckoutScreen` vuelva a crecer a 470 líneas mezclando validación, payload y JSX.

### 4.2 `boticuy-app-api/` (plugin de WordPress, nuevo)

```
boticuy-app-api/
├── boticuy-app-api.php           ← archivo principal: solo registra hooks y carga includes
├── includes/
│   ├── class-auth.php             (login, registro, JWT, /auth/me)
│   ├── class-orders.php           (crear pedido, listar pedidos — SIN lógica de pago)
│   ├── class-payment.php          (formtoken, validate, voucher — el flujo corregido)
│   ├── class-products.php
│   ├── class-shipping.php
│   ├── class-ubigeo.php
│   ├── class-addresses.php
│   ├── class-coupons.php
│   └── class-rate-limiter.php     (NUEVO: reutilizable para login, registro, order, payment)
├── README.md                      ← qué hace, cómo se instala, qué configura
├── CHANGELOG.md
└── API-CONTRACT.md                ← contrato de cada endpoint (documento aparte, sección 5)
```

**Diferencia clave respecto al legacy:** el legacy era un único snippet con todas las funciones sueltas. Acá cada dominio (auth, orders, payment) vive en su propia clase, y el rate limiter se construye una vez y se reutiliza en los 4 endpoints que lo necesitan, no solo en login.

---

## 5. Próximo documento

`API-CONTRACT.md` — contrato endpoint por endpoint (qué recibe, qué devuelve, qué valida, qué código HTTP en cada caso). Este es el documento que usará CC directamente como referencia al construir cada endpoint del plugin y cada función de `api/*.ts` en la app, así ambos lados del contrato se construyen de acuerdo, no a suposición.

**Antes de ese documento**, con acceso al WordPress ya confirmado, conviene sacar el **System Status de WooCommerce** (`WooCommerce → Estado → Informe del sistema`) para completar la sección 5 de `REQUERIMIENTOS.md` con las versiones reales del hosting, así el contrato de API se escribe ya sabiendo contra qué versión de PHP/WooCommerce se va a construir.

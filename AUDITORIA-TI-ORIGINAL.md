# Auditoría TI — Documento original

Revisión técnica · App móvil y plugin WooCommerce

Auditoría Boticuy
41 hallazgos contrastados contra los dos documentos de requerimientos QA. Cuatro bloquean la publicación; dos de ellos cuestan dinero en cada pedido.

Fecha 21 ago 2026
Alcance boticuy-app 2.0.0 · plugin 2.14.0 · BoticuyApp-v4.apk
Método revisión de código completa + ejecución de pruebas + inspección del APK
4
Bloqueantes de release
8
Severidad alta
15
Severidad media
14
Bajos y mejoras
13.8%
Cobertura de pruebas de la app
0%
Cobertura del plugin
Resumen ejecutivo
Revisamos la totalidad del código entregado: 7 044 líneas de la app (React Native / Expo) y 2 266 del plugin (WordPress / WooCommerce), además del APK. El plugin entra en el alcance porque es el backend de la app —precios, pedidos, pagos, puntos y envío se resuelven ahí—, así que varios defectos que el usuario ve en pantalla solo se explican leyendo los dos lados. La arquitectura es sólida y está bien documentada; el pago con tarjeta tiene los controles de seguridad correctos —firma HMAC verificada en servidor, monto derivado del pedido, verificación de propiedad y locks atómicos contra duplicados—. Los problemas están concentrados en tres frentes.

El costo de envío se muestra al cliente pero nunca se cobra
La app suma el envío al total que ve el comprador; el backend crea el pedido sin ninguna línea de envío y cobra ese total menor. Cada pedido de la app pierde el flete: S/ 8.47 en Callao, S/ 12.71 en provincias, y el monto configurado en Lima. La pantalla de confirmación llega a mostrar una fila «Envío» que no está sumada en el «Total».

Dinero. Además del envío, un cupón rechazado por WooCommerce (agotado, de uso individual, restringido por producto) genera un pedido sin descuento pero con respuesta de éxito, y existe un camino repetible para conservar puntos ya canjeados.
Entrega. El APK que recibimos apunta a staging por HTTP sin cifrar, y el perfil de build de producción no habilita la creación de pedidos: publicado tal cual, la app diría «Pedido confirmado» sin registrar ningún pedido.
Verificabilidad. El plugin no tiene ninguna prueba automatizada. La app tiene 36 pruebas —todas en verde, y el proyecto compila sin errores de tipos— pero cubren 13.8 % de las sentencias: checkout, pago, pedidos y catálogo están en 0 %.
Sobre los documentos de requerimientos
Los dos PDF describen el sistema «tal como está implementado», no lo que el negocio pidió. Varias conductas que el documento presenta como reglas de negocio son en realidad defectos: el envío no cobrado (RN-10 del plugin), el vaciado del carrito ante fallo de consulta (RN-03 §2.1 de la app) y el orden del catálogo con filtro activo. Documentar un defecto no lo convierte en requisito, y por eso los reportamos igual.

Hallazgos
Crítico — bloquea publicación
Alto — corregir antes de escalar tráfico
Medio — corregir en el ciclo
Bajo — deuda técnica y mejoras
Críticos
C1
El costo de envío nunca se agrega al pedido
create_order() construye el pedido, aplica cupón y puntos, y llama a calculate_totals() sin ninguna línea de envío (class-orders.php:463). El endpoint /shipping solo cotiza. La app, en cambio, calcula finalTotal = subtotal − descuentos + envio (CheckoutScreen.tsx:97) y lo muestra como total a pagar.

En tarjeta, el monto que se cobra sale de $order->get_total() (class-payment.php:84), es decir sin envío. En Yape y transferencia, el monto que se le pide al cliente por WhatsApp no coincide con el pedido registrado en WooCommerce, lo que rompe la conciliación manual.

Evidencia visible en pantalla
OrderConfirmationScreen.tsx:72-73 pinta una fila «Envío: S/ 12.71» y debajo un «Total» que no la incluye. La aritmética que ve el cliente no cuadra.

Pérdida de ingresos por pedido
Plugin RN-10 §2.2 · App SHIPAPP-VER-01
C2
El APK entregado es un build de staging sobre HTTP sin cifrar
Extrajimos assets/app.config de BoticuyApp-v4.apk: apunta a http://35.209.93.250 en los tres clientes (Store API, WP API y BFF), con el plugin withCleartextHost activo y ordersEnabled: true.

Contraseñas, tokens JWT, DNI, teléfono y dirección viajan en texto claro, interceptables en cualquier WiFi. Además crea pedidos reales en el WordPress de staging. No es un candidato a publicación ni sirve para validar producción.

Exposición de credenciales y datos personales
eas.json · perfil preview
C3
Un build de producción no crearía ningún pedido
El perfil production de eas.json no define ninguna variable de entorno. ordersEnabled se resuelve como process.env.EXPO_PUBLIC_ORDERS_ENABLED === 'true', así que en producción queda en false, y createOrder() devuelve un resultado simulado sin llamar al backend (api/orders.ts:39).

Publicado tal cual, el cliente completaría todo el checkout, vería «¡Pedido confirmado!» con un número PREVIEW-xxxxxx, y no existiría pedido ni cobro. El modo vista previa es correcto como herramienta de desarrollo; el problema es que es el valor por defecto del perfil de release.

Pedidos silenciosamente perdidos
App RN-02 §3.5 · PAYCARD-02
C4
Los puntos canjeados se devuelven pero el descuento se conserva
/payment/formtoken solo rechaza pedidos en processing o completed (class-payment.php:73). Un pedido en failed sigue admitiendo un formulario de pago nuevo. Pero al pasar a failed se dispara reverse_points_redemption(), que restituye los puntos al saldo, mientras el fee negativo del descuento permanece en el pedido.

Camino reproducible
Crear un pedido con tarjeta canjeando puntos (total reducido).
Abandonar el formulario de pago, o dejar que la tarjeta sea rechazada, o esperar los 45 minutos de expiración. El pedido pasa a failed y los puntos vuelven al saldo.
Volver al checkout y reintentar: la misma clave de idempotencia devuelve ese mismo pedido, y formtoken lo acepta.
Pagar. Se cobra el total con descuento y el saldo de puntos queda intacto.
Es repetible y no requiere manipular nada del lado del cliente: solo abandonar y reintentar.

Descuento gratuito ilimitado
class-orders.php · reverse_points_redemption
Altos
A1
Abrir el carrito con red inestable lo vacía
Al recibir el foco, el carrito revalida cada ítem con fetchProduct. El catch elimina el producto y avisa «ya no está disponible» (CartScreen.tsx:68-72 dentro de checkStock() (línea 47)), sin distinguir un 404 real de un timeout, un 500 o una caída de DNS. Con conexión lenta, el cliente vuelve al carrito y lo encuentra vacío.

Agravante: son N peticiones secuenciales, una por ítem, en cada foco de la pestaña — justo el escenario donde el timeout es más probable.

Abandono de compra
App RN-03 §2.1
A2
El resultado de apply_coupon() no se verifica
class-orders.php:425 aplica el cupón e ignora el retorno. Cuando WooCommerce lo rechaza por sus reglas nativas —límite de usos agotado, uso individual, restricción de producto o categoría, exclusión de artículos en oferta— devuelve un WP_Error, el pedido se crea sin descuento y la API responde 201 ok.

El cliente vio el descuento en la app (la validación de /coupon no comprueba ninguna de esas reglas, según RN-01 §5.2) y paga el total sin descontar, sin ningún aviso. El caso de prueba ORD-CREATE-05 del documento espera «descuento aplicado» y no lo verifica.

Cobro distinto al mostrado
Plugin ORD-CREATE-05 · RN-01 §5.2
A3
«Recordar mis datos» nunca guarda la dirección en la cuenta
El checkout llama a addAddress() sin telefono ni numDoc (CheckoutScreen.tsx:254-262). El plugin exige ambos con formato válido antes de guardar (class-addresses.php, validate_format) y responde 422 «Teléfono inválido». La respuesta se descarta dos veces: addAddress devuelve [] ante un 422 y la llamada termina en .catch(() => {}).

Resultado: la casilla se marca, el perfil local sí se guarda, y la dirección en la cuenta nunca aparece. Incumple directamente el requerimiento §3.1 de la app.

Función anunciada que no funciona
App §3.1 · CHECK-03
A4
El servidor no valida la cantidad contra el stock real
La creación de pedido solo comprueba is_in_stock() como booleano y normaliza la cantidad con max(1, intval($it['qty'])) (class-orders.php:314). Nunca compara lo pedido contra el stock disponible.

Una llamada directa a la API puede pedir 500 unidades de un producto con 1 en stock: el pedido se crea y WooCommerce descuenta a negativo. El tope del lado de la app depende de low_stock_remaining, que solo existe cuando WooCommerce reporta stock bajo — sin ese dato, tampoco hay tope en el cliente.

Sobreventa
Plugin RN-04 §2.2
A5
Sin protección de sesión en la navegación, y con condición de carrera al arrancar
Confirmamos el hallazgo #1 del documento: las pantallas de Pedidos, Direcciones, Puntos, Mis cupones, Checkout y pago se registran incondicionalmente en navigation/index.tsx; la única protección es visual, dentro de Perfil.

Añadimos un agravante no documentado: hydrate() se dispara en un useEffect sin bloquear el render (App.tsx:14) y el navegador no observa la bandera hydrated. En arranque frío, una pantalla autenticada puede lanzar su petición antes de que el token esté en memoria y recibir un 401 espurio.

Acceso indebido y errores intermitentes
App NAV-SEC-01 · brecha #1
A6
El barrido de 45 minutos solo alcanza pedidos con canje de puntos
find_stale_card_orders() filtra por _points_redemption_status = 'active' (class-orders.php:536). Los pedidos de tarjeta abandonados sin canje de puntos quedan en pending indefinidamente, sin liberarse nunca.

El glosario §2.6 del documento del plugin describe la expiración automática sin esa condición, igual que el RN-07 §3.5 de la app. Código y documento no coinciden: el mecanismo cubre una fracción de los casos que dice cubrir.

Código ≠ documento
Plugin §2.6 · App RN-07 §3.5
A7
El carrito congela el precio y nunca lo refresca
cartStore.ts guarda unitPrice al agregar el producto, y la revalidación de stock del carrito no actualiza ese precio. El carrito sobrevive a cierres de la app, así que un precio puede quedar congelado durante días.

El servidor siempre recalcula con el precio vigente, así que el total mostrado y el cobrado difieren. Peor: el tope de canje de puntos se calcula sobre el subtotal del cliente, de modo que si un precio bajó, el canje excede el 30 % real y el pedido falla con un 422 «El canje no puede superar el 30% del subtotal» que el usuario no puede interpretar ni resolver.

Total inconsistente y checkout bloqueado
A8
Puntos bloqueados indefinidamente en Yape y transferencia
El canje se reserva al crear el pedido (_points_redemption_status = 'active') para evitar doble gasto, y esos dos métodos quedan en on-hold sin ninguna expiración automática, por decisión explícita del código.

Si el cliente nunca envía el comprobante, sus puntos quedan inutilizables hasta que alguien cancele el pedido a mano en wp-admin. No hay alerta, ni reporte, ni forma de que el cliente lo resuelva.

Saldo del cliente inmovilizado
Requiere decisión de negocio
Medios
M1
El descuento por puntos no aparece en la confirmación
OrderConfirmationScreen.tsx:69 solo pinta la fila de descuento si existe un cupón. Como cupón y puntos son mutuamente excluyentes, un pedido pagado con puntos no muestra ninguna línea de descuento: el cliente no ve reflejado lo que acaba de gastar.

M2
«Envío: Gratis» cuando la cotización falló
La confirmación usa envio > 0 ? monto : 'Gratis' (OrderConfirmationScreen.tsx:72). Si la cotización falló, shipping es null, envio es 0 y la pantalla afirma envío gratis. Promesa que el negocio no hizo.

M3
El catálogo se ordena distinto con y sin filtro
Sin filtro se consulta la Store API con orderby=popularity&order=desc. Con filtro de necesidad o marca, el BFF resuelve los IDs ordenando por menu_order title ASC (class-products.php:44) y después se piden esos IDs a la Store API con include=, parámetro que no preserva el orden recibido.

El orden del listado filtrado es, en la práctica, arbitrario. Incumple el RN-02 §1.2, que declara popularidad descendente por defecto.

App RN-02 §1.2 · CAT-01
M4
El total del listado filtrado viene de una fuente y los productos de otra
total y total_pages salen del found_posts del BFF, pero los productos los devuelve la Store API, que aplica sus propios criterios de visibilidad. Ambos pueden discrepar, y el scroll infinito pedirá páginas que vuelven vacías.

M5
Tarifas de envío y umbrales hardcodeados en dos repositorios
El plugin fija S/ 8.47, S/ 12.71 y el umbral reducido de S/ 59 como literales (class-shipping.php:39,59); la app repite 69 y 59 en app.config.js. No existe capa de configuración: cambiar una tarifa exige editar dos repos y publicar una versión nueva de la app en las tiendas.

M6
Un flat_rate con fórmula se lee mal
(float) $m->cost (class-shipping.php:31). WooCommerce admite costos como 10 + 2 * [qty]; el casteo se queda con 10 y descarta el resto en silencio.

M7
El método de envío gratis ignora su condición requires
Solo se lee min_amount. Si el método está configurado para exigir cupón y tiene el monto mínimo vacío, free_threshold queda en 0.0 y subtotal >= 0 es siempre verdadero: envío gratis para todos, en todos los pedidos.

M8
La zona de envío se resuelve solo por código postal
El paquete se arma con state => '' (class-shipping.php:22), así que las zonas de WooCommerce definidas por región nunca coinciden y siempre cae al fallback hardcodeado. La cotización que ve la app puede no ser la que cobra la web para el mismo destino.

M9
La barra de envío gratis promete «en Lima» a todo el mundo
FreeShippingBar usa el umbral local y el texto fijo «envío gratis en Lima», también para clientes de provincias, donde el servidor no ofrece envío gratis en absoluto. El cliente llega al checkout y descubre el flete.

M10
Los cupones de tipo fixed_product aplican S/ 0.00 sin avisar
discount() en cartStore.ts solo contempla percent y fixed_cart. Cualquier otro tipo devuelve cero: el chip verde aparece «aplicado» y el total no cambia. fixed_product es un tipo nativo y habitual de WooCommerce.

M11
Datos del titular de la cuenta bancaria expuestos sin autenticación
/bank-details es público y el parseo extrae explícitamente documento_numero, correo y telefono del titular, además de banco, nombre y CCI. Cualquiera puede consultarlo sin token. Confirma la brecha #2 del documento del plugin, con la precisión de qué campos se exponen.

Plugin BANK-VER-01 · brecha #2
M12
El control de intentos usa solo REMOTE_ADDR
class-rate-limiter.php:15 no considera X-Forwarded-For. Detrás de un CDN, proxy inverso o NAT corporativo, todas las peticiones comparten una IP: los 5 registros por hora y los 15 pedidos por 10 minutos se vuelven límites globales del sitio y bloquean clientes legítimos. En sentido inverso, un atacante distribuido los evade.

Plugin brecha #3
M13
La clave de idempotencia es por pantalla, no por intento
Se genera una sola vez al montar el checkout (CheckoutScreen.tsx:58). Si el usuario vuelve del pago, modifica el carrito y reintenta, el plugin devuelve el pedido original e ignora el payload nuevo sin advertirlo (class-orders.php:273-283). El cliente cree haber pedido una cosa y el pedido dice otra.

Plugin ORD-CREATE-SEC-03
M14
El cálculo de puntos recorre todo el histórico en cada llamada
points_balance() ejecuta dos consultas con limit => -1 sobre todos los pedidos del usuario, y se invoca desde /points, /shipping, /coupon, /cupones-oro y la creación de pedido. El costo crece linealmente con el historial de cada cliente, en el camino crítico del checkout.

M15
Los listados de cupones se truncan a 200 sin aviso
Los cuatro endpoints piden numberposts => 200 e instancian un WC_Coupon por cada uno. Superado ese número, los cupones sobrantes desaparecen de la app sin ningún indicio, y el patrón es N+1 en consultas.

Bajos y mejoras
ID	Hallazgo	Ubicación
B1	La exclusión de la palabra «envío» está escrita como 'env\xc3\xado' entre comillas simples: PHP la toma literal (12 caracteres) y nunca coincide. Verificado ejecutando PHP. Además /coupons filtra por substring mientras los otros tres endpoints usan límites de palabra, con listas distintas.	class-coupons.php:55
B2	mb_convert_encoding(..., 'HTML-ENTITIES', ...) está deprecado desde PHP 8.2 y se retira en PHP 9. El plugin declara Requires PHP 7.4, así que no hay barrera que evite el entorno afectado.	class-bank-details.php:39
B3	current_time('timestamp') está deprecado desde WordPress 5.3.	class-coupons.php
B4	Faltan feriados nacionales de fecha fija: 7 de junio (Batalla de Arica y Día de la Bandera) y 6 de agosto (Batalla de Junín, Ley 31989). Conviene revisar la lista completa contra el calendario oficial vigente.	utils/attention.ts
B5	No existe cierre de sesión en servidor ni lista de revocación. Cambiar la contraseña no invalida los tokens emitidos: uno filtrado sigue vivo 7 días.	class-auth.php
B6	Las filas bloqueadas de Perfil son View, no Pressable: tocarlas no hace absolutamente nada ni ofrece camino a iniciar sesión.	ProfileScreen.tsx:107
B7	decodeHtmlEntities pasa cualquier entidad numérica a String.fromCodePoint sin acotar: un valor fuera de rango lanza RangeError y tumba el render de la lista completa.	utils/format.ts
B8	Las direcciones se leen, modifican y reescriben sobre user_meta sin bloqueo: dos altas simultáneas pierden una.	class-addresses.php
B9	Al llegar a 10 direcciones se descarta la más antigua en silencio, en lugar de responder 422 y dejar que el usuario elija cuál borrar.	class-addresses.php
B10	api/auth.ts:me() es código muerto: la hidratación de sesión usa /auth/refresh.	api/auth.ts:27
B11	Clave de PostHog embebida como valor por defecto en el repositorio, compartida con la app anterior.	app.config.js
B12	El WebView de pago no tiene timeout: una carga colgada deja el overlay indefinidamente sin salida automática.	PaymentWebViewScreen.tsx
B13	La revalidación del carrito hace N peticiones secuenciales en cada foco de la pestaña, en lugar de agrupar.	CartScreen.tsx:47
B14	La creación de pedido no valida los datos del cliente: una llamada directa puede crear un pedido con nombre y correo vacíos, sin forma de contactar al comprador.	class-orders.php:366
Cómo corroborar el envío no cobrado
C1 es el hallazgo con más impacto económico, así que conviene que lo confirmen por su cuenta y no por nuestra palabra. Hay tres caminos, de más barato a más concluyente. El primero no toca la base de datos ni requiere accesos nuevos.

Vía 1 · Comparar dos respuestas de la API
La propia API expone la contradicción: /shipping devuelve un costo de envío y /order devuelve un total que no lo incluye. Basta con pedir las dos cosas para el mismo destino.

# 1) Cotizar el envío a un distrito de provincia, con subtotal S/100
curl "https://TU-HOST/wp-json/boticuy-app/v1/shipping?idubigeo=040101&subtotal=100"

# Respuesta esperada — hay un costo de envío:
# {"zone":"Provincia","cost":12.71,"flat_cost":12.71,
#  "free_threshold":null,"is_free":false}


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
El campo total de esa respuesta sale directamente de $order->get_total(), o sea del pedido real guardado en WooCommerce. Si vuelve 100.00 en lugar de 112.71, el envío no está en el pedido.

Vía 2 · Mirar el pedido en wp-admin
El plugin marca sus pedidos con una columna Canal que dice «Pedido App» en el listado de WooCommerce. Al abrir uno de esos pedidos, el bloque de totales no tiene ninguna fila de Envío: solo el subtotal de productos y, si aplica, el cupón o el descuento por puntos.

La comparación que lo deja claro: abrir al lado un pedido hecho desde la web con el mismo destino. Ese sí muestra su fila de envío. La diferencia entre ambos es exactamente el flete que la app no cobra.

Vía 3 · Consultar la base de datos
Es la verificación concluyente. WooCommerce guarda los pedidos de dos maneras según su configuración, así que el primer paso es saber cuál usa el sitio.

Paso 1 — ¿almacenamiento clásico o HPOS?

SELECT option_value AS hpos_activo
FROM wp_options
WHERE option_name = 'woocommerce_custom_orders_table_enabled';

-- 'yes'            → HPOS (tablas wp_wc_orders)
-- 'no' o sin fila  → clásico (wp_posts + wp_postmeta)
Paso 2 — la consulta que sirve en ambos casos

El envío en WooCommerce siempre es una línea del pedido, y esa tabla es la misma en los dos modos de almacenamiento. Un pedido con envío tiene una fila de tipo shipping; los de la app tienen cero.

SELECT oi.order_id                                  AS pedido,
       SUM(oi.order_item_type = 'line_item') AS productos,
       SUM(oi.order_item_type = 'shipping')  AS lineas_de_envio,
       SUM(oi.order_item_type = 'fee')       AS fees
FROM wp_woocommerce_order_items oi
GROUP BY oi.order_id
ORDER BY oi.order_id DESC
LIMIT 30;

-- En todo pedido creado por la app: lineas_de_envio = 0
-- En un pedido de la web al mismo distrito: lineas_de_envio = 1
Paso 3 — aislar solo los pedidos de la app

El plugin escribe el metadato _order_source = 'app' al crear el pedido. Ese es el filtro.

-- Si el sitio usa HPOS
SELECT o.id                       AS pedido,
       o.total_amount             AS total_cobrado,
       od.shipping_total_amount   AS envio_guardado,
       o.payment_method,
       o.date_created_gmt
FROM wp_wc_orders o
JOIN wp_wc_order_operational_data od ON od.order_id = o.id
JOIN wp_wc_orders_meta m             ON m.order_id  = o.id
     AND m.meta_key = '_order_source' AND m.meta_value = 'app'
ORDER BY o.date_created_gmt DESC
LIMIT 20;


-- Si el sitio usa almacenamiento clásico
SELECT p.ID AS pedido,
       MAX(CASE WHEN pm.meta_key = '_order_total'    THEN pm.meta_value END) AS total_cobrado,
       MAX(CASE WHEN pm.meta_key = '_order_shipping' THEN pm.meta_value END) AS envio_guardado,
       MAX(CASE WHEN pm.meta_key = '_shipping_postcode' THEN pm.meta_value END) AS ubigeo
FROM wp_posts p
JOIN wp_postmeta pm  ON pm.post_id  = p.ID
JOIN wp_postmeta src ON src.post_id = p.ID
     AND src.meta_key = '_order_source' AND src.meta_value = 'app'
WHERE p.post_type = 'shop_order'
GROUP BY p.ID
ORDER BY p.ID DESC
LIMIT 20;

-- En ambos casos: envio_guardado = 0.00 en todas las filas
Tres advertencias al leer los resultados
Si la consulta no devuelve ninguna fila en producción, eso no desmiente C1 — confirma C3. Significa que nunca se creó un pedido desde la app, que es exactamente lo que pasa cuando el build sale con el modo vista previa activo. La verificación de C1 hay que hacerla entonces en staging, donde ordersEnabled sí está en true.
El prefijo de las tablas puede no ser wp_ — es configurable por instalación. Y si un nombre de columna no coincide con su versión de WooCommerce, DESCRIBE wp_wc_order_operational_data; muestra los reales.
El monto perdido no está guardado en ninguna parte, precisamente porque el envío nunca se registró. Para cuantificarlo hay que reconstruirlo desde el distrito de cada pedido y aplicar la tarifa que le correspondía. Eso da un piso, no una cifra exacta: los pedidos a Lima usan la tarifa configurada en la zona de WooCommerce, que hay que leer de la configuración, mientras Callao y provincias usan los valores fijos del código.
Reconstrucción aproximada de lo no cobrado (almacenamiento clásico)

SELECT COUNT(*) AS pedidos_app,
       SUM(CASE WHEN LEFT(pc.meta_value, 2) = '07' THEN 8.47
                ELSE 12.71 END) AS flete_no_cobrado_minimo
FROM wp_postmeta src
JOIN wp_postmeta pc ON pc.post_id = src.post_id
     AND pc.meta_key = '_shipping_postcode'
WHERE src.meta_key = '_order_source' AND src.meta_value = 'app';
Sirve como orden de magnitud. Para la cifra real hace falta separar los pedidos de Lima y aplicarles el flat_rate configurado en su zona.

Estado de la calidad verificable
Instalamos las dependencias y ejecutamos las suites. Lo que existe funciona; el problema es dónde no existe.

Comprobación	Resultado	Lectura
Compilación de tipos (tsc --noEmit)	Sin errores	El proyecto está bien tipado.
Suite de la app (jest)	36 / 36 en verde	7 archivos: utilidades, carrito, cupones, creadores, direcciones.
Cobertura de sentencias	13.81 %	Medida sobre src/**.
Cobertura de ramas	10.57 %	La lógica condicional es justamente donde viven los hallazgos.
Checkout, pago, pedidos, catálogo	0 %	CheckoutScreen, PaymentWebViewScreen, api/orders, api/payment y api/products sin una sola línea cubierta.
Suite del plugin	No existe	Sin PHPUnit, sin carpeta de pruebas, sin dependencias de testing.
Los cuatro hallazgos críticos están todos en código con cobertura cero. No es coincidencia: una prueba que comparara el total mostrado con el total del pedido habría detectado C1 el primer día.

Lo que el plugin hace bien
Vale registrarlo, porque acota dónde hay que trabajar y dónde no.

Verificación de pago. Firma HMAC-SHA256 recalculada en servidor y comparada con hash_equals; correspondencia del identificador de pedido embebido en la respuesta firmada; y comparación del monto pagado contra el total real, con nota de auditoría y bloqueo si no coinciden. Correcto.
Concurrencia. Los locks se apoyan en add_option() y en el índice único de option_name, que da atomicidad real en base de datos, con robo de locks colgados vía UPDATE condicionado. Es la solución adecuada, y está bien razonada en los comentarios.
Verificación de propiedad. Los tres endpoints de pago exigen coincidencia de usuario, o checkout_token comparado en tiempo constante para invitados. Cierra el acceso indebido correctamente.
Aislamiento de direcciones. Al vivir dentro del user_meta del dueño, no hay identificador ajeno que adivinar. Buen diseño, no solo buena validación.
JWT. El algoritmo nunca se lee del token recibido, así que la confusión de algoritmo no es posible; el secreto se genera con random_bytes(32).
Ubigeo. Doble mitigación de inyección SQL: limpieza de caracteres y consulta parametrizada.
Panel de administración. El guardado de metadatos de cupón valida nonce, capacidad y lista blanca explícita de claves.
Plan de acción
Siete movimientos, en este orden porque hay dependencias reales entre ellos: corregir el total cambia el cálculo del pedido, así que todo lo que se valide antes hay que volver a validarlo después. Cada uno lleva su criterio de aceptación — la condición que decide si está cerrado, sin depender del juicio de quien lo revise.

Paso 1
Bloqueante
Un solo total, calculado en el servidor
La raíz de los hallazgos de dinero es que hay dos totales: el que la app calcula y el que el servidor cobra. Se elimina uno.

Agregar la línea de envío al pedido en el servidor y recalcular el total con ella (C1).
Verificar el retorno de apply_coupon() y responder con error explícito en lugar de un 201 sin descuento (A2).
Que la app muestre el total que devuelve el backend en checkout, en el formulario de pago y en la confirmación, en vez del que calcula por su cuenta (C1, A7).
Mostrar el descuento por puntos y no afirmar «Gratis» cuando la cotización falló (M1, M2).
Criterio de aceptación
El total que ve el cliente en las tres pantallas es idéntico, carácter por carácter, al total que devuelve POST /order. Existe una prueba automatizada que falla si difieren.
Paso 2
Bloqueante
Builds que se pueden publicar
Hoy no existe un artefacto instalable que sirva ni para validar ni para publicar. Se resuelve en configuración, no en código de producto.

Definir el entorno del perfil de producción en eas.json y hacer que un build de release falle si el modo vista previa quedó activo (C3).
Habilitar HTTPS en staging, o restringir la distribución de ese APK al equipo mientras no lo tenga (C2).
Sacar la clave de analítica del repositorio y pasarla a variable de entorno (B11).
Criterio de aceptación
Un build del perfil de producción, instalado en un teléfono, completa una compra que aparece como pedido real en WooCommerce, sobre HTTPS. Ningún build distribuido fuera del equipo apunta a HTTP.
Paso 3
Bloqueante
Cerrar el cobro indebido y la sobreventa
Tres caminos por los que hoy se puede pagar menos de lo que corresponde, o comprar lo que no hay.

Rechazar formtoken sobre pedidos fallidos y reconstruir la reserva de puntos al reintentar un pago (C4).
Validar la cantidad pedida contra el stock disponible en el servidor, no solo el booleano de disponibilidad (A4).
Extender la expiración automática a todos los pedidos de tarjeta pendientes, no solo a los que tienen canje de puntos (A6).
Generar la clave de idempotencia por intento de envío y no por apertura de pantalla, o rechazar el reenvío con un carrito distinto (M13).
Criterio de aceptación
La secuencia canjear → abandonar → reintentar → pagar deja el saldo de puntos descontado. Pedir más unidades que el stock devuelve error y no crea pedido. Un pedido de tarjeta abandonado sin puntos pasa a fallido por sí solo.
Paso 4
Robustez del carrito y de la sesión
Ventas que se pierden sin que nadie se entere, porque el error es silencioso.

Distinguir error de red de producto inexistente en la revalidación del carrito, y agrupar las peticiones en lugar de encadenarlas (A1, B13).
Enviar teléfono y documento al guardar la dirección, y propagar el error al usuario en vez de descartarlo (A3).
Guardas de sesión reales en la navegación, y esperar la hidratación del token antes de montar pantallas autenticadas (A5).
Criterio de aceptación
Con el backend apagado, abrir el carrito no borra ningún ítem. Marcar «Recordar mis datos» produce una dirección visible en Mis direcciones. Sin sesión, ninguna pantalla de cuenta es alcanzable por ninguna vía.
Paso 5
El envío como un solo dominio configurable
Hoy las reglas de envío viven repartidas entre literales del plugin, literales de la app y la configuración de WooCommerce, y las tres pueden discrepar.

Una sola fuente de configuración para tarifas y umbrales, consultable desde la app (M5).
Leer correctamente los métodos de la zona: costos con fórmula y la condición requires del envío gratis (M6, M7).
Resolver la zona con el departamento además del código postal, para que coincida con lo que cobra la web (M8).
Mensajería honesta por región: no prometer envío gratis donde la zona no lo ofrece (M9).
Criterio de aceptación
Cambiar una tarifa se hace en un solo lugar y no requiere publicar una versión de la app. Para un mismo destino y subtotal, la cotización de la app y la de la web coinciden.
Paso 6
Backend y catálogo: privacidad, límites y coherencia
Quitar los datos personales del titular de la respuesta pública de datos bancarios, o exigir sesión (M11).
Resolver la IP real detrás de proxy para que los límites de intentos no bloqueen clientes legítimos ni se evadan (M12).
Cachear el saldo de puntos, hoy recalculado sobre todo el histórico en el camino crítico del checkout (M14).
Paginar los listados de cupones en vez de truncarlos en silencio, y soportar los tipos de descuento que faltan (M15, M10).
Unificar el catálogo: mismo orden con y sin filtro, y una sola fuente para el conteo de páginas (M3, M4).
Validar los datos del cliente al crear el pedido, y resolver las direcciones sin condiciones de carrera ni descartes silenciosos (B14, B8, B9).
Definir e implementar la política de puntos retenidos en Yape y transferencia (A8).
Cierre de sesión en servidor, para que un token filtrado deje de valer (B5).
Criterio de aceptación
La respuesta pública de datos bancarios no contiene documento, correo ni teléfono del titular. El listado de catálogo devuelve el mismo orden con filtro y sin filtro. Ningún cupón activo desaparece de la app por volumen.
Paso 7
Red de seguridad
Sin esto, los pasos anteriores se vuelven a romper en la siguiente iteración. Los cuatro hallazgos críticos viven en código con cobertura cero, y eso no es casualidad.

Pruebas automatizadas sobre checkout, pago, pedidos y catálogo — hoy en 0 %.
PHPUnit en el plugin, con foco en cálculo de totales, cupones, puntos y pagos.
Una prueba de contrato que compare el total mostrado contra el total del pedido creado, para que C1 no pueda repetirse.
Resolver las llamadas deprecadas que romperán con PHP 9 y versiones futuras de WordPress (B2, B3), el filtro de cupones con el escape roto (B1), los feriados faltantes (B4) y el resto de la deuda menor.
Criterio de aceptación
Ningún flujo que mueva dinero queda sin al menos una prueba automatizada. La suite corre en integración continua y bloquea el merge si falla.
Puerta de publicación
Corregir solo los cuatro críticos no habilita la publicación. A2 sigue produciendo pedidos que cobran distinto a lo mostrado y A4 sigue permitiendo sobreventa: son dos formas más de cobrar mal, aunque no estén etiquetadas como críticas. Nuestra recomendación es publicar recién al cerrar los pasos 1 a 4.

Puntos abiertos
Cinco de los hallazgos no se pueden cerrar solo con código, porque no tienen una respuesta técnicamente correcta: dependen de una decisión de negocio. Y tres de ellos no se pueden verificar con lo que hay hoy en la carpeta. Quedan listados acá para que quien tome el trabajo sepa con qué se topa.

Decisiones que condicionan la corrección
Envío. ¿Debe cobrarse en los pedidos de la app? Lo damos por sí, y es la definición que ordena la corrección de C1 y de todas las reglas de envío. Si la respuesta fuera que no debe cobrarse, lo que hay que corregir es la app —que hoy lo muestra— y no el backend.
Puntos retenidos. ¿Se liberan automáticamente en Yape y transferencia tras algún plazo, o se mantiene la revisión manual con un reporte que la haga visible? (A8)
Cupones rechazados. Cuando WooCommerce rechaza un cupón al crear el pedido: ¿se bloquea el pedido, o se crea sin descuento avisando al cliente? (A2)
Pantallas con sesión. Sin sesión, ¿redirigen a iniciar sesión o quedan inaccesibles? (A5)
Orden del catálogo. ¿La popularidad descendente es el orden deseado, o el negocio quiere control editorial en las secciones curadas? (M3)
Lo que no se puede verificar con el material actual
La configuración real de envío. Tres hallazgos —M6, M7 y M8— dependen de cómo estén configuradas las zonas y los métodos de envío en WooCommerce. Desde el código solo se ve que la lectura es incorrecta; el impacto concreto depende de la configuración, que hay que mirar en el panel de administración.
El alcance de la exposición de datos bancarios. M11 expone lo que el administrador haya escrito en el texto de instrucciones de transferencia. Qué datos personales del titular hay ahí realmente solo se sabe leyendo esa configuración en producción.
La versión del plugin desplegada. El documento de la app afirma que el endpoint de renovación de sesión no existe en producción, pero el código recibido —2.14.0— sí lo incluye. Sin saber qué versión corre hoy, ese punto queda abierto: puede ser un desfase entre el repositorio y el servidor, o una nota desactualizada del documento.
Para las dos primeras alcanza con acceso de lectura al panel de WooCommerce. Para reproducir el flujo de pago y confirmar C4 harían falta además credenciales de prueba de Izipay y un staging con HTTPS, ya que el actual va por HTTP sin cifrar.

Revisión sobre el código y el APK compartidos por Brandon vía Drive. Alcance: 7 044 líneas de la app y 2 266 del plugin, revisadas en su totalidad; los dos documentos de requerimientos QA leídos completos y contrastados hallazgo por hallazgo. Las referencias archivo:línea corresponden a los commits recibidos — app en 5e3d607, plugin en la versión 2.14.0 sin control de versiones en el paquete entregado.
# Historial completo de correos con TI

Correo original de coordinación entre Herick Fernando Zuzunaga Nuñez (hzuzunaga@bitacore.xyz) y Luis Ricardo Almeyda Vasquez (lalmeyda@bitacore.xyz, TI), sobre la revisión de Boticuy App antes de que el proyecto fuera recibido para esta migración/rediseño. Pegado tal cual, sin editar, como fuente permanente para `CHANGELOG.md`.

---

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Wed, 3 Jun 2026 11:47:12 -0700
Boticuy App lista para implementacion y testing. Ver version HTML / adjuntos.

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Wed, 3 Jun 2026 12:02:00 -0700
(sin texto / solo adjuntos)

De: Luis Ricardo Almeyda Vasquez lalmeyda@bitacore.xyz · Thu, 4 Jun 2026 09:55:10 -0500
Estimado Fernando: No se puede acceder al link de drive, brindarnos acceso por favor. Saludos

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Thu, 4 Jun 2026 10:08:49 -0500
Buen día, les comparto otro acceso donde ya cuentan con permiso: [link de Drive]. Gracias.

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Thu, 11 Jun 2026 09:08:03 -0500
Buen día, transcurrida una semana de nuestra consulta seguimos sin obtener respuesta, por favor, atender la consulta, es solo el pedido del cronograma. Gracias.

De: Luis Ricardo Almeyda Vasquez lalmeyda@bitacore.xyz · Thu, 11 Jun 2026 10:58:17 -0500
Estimado Fernando: El lunes te estaré enviando el resultado de la evaluación del código del app de react y plugin de wordpress. Adicionalmente, tener en cuenta los siguientes puntos, ya que veo que están usando claude code para muchas cosas.

Para el desarrollo de software se maneja un proceso, donde se documenta toda la información del aplicativo (Hus, Criterios de aceptación, etc.), esto ayuda en todo el proceso de pruebas y automatización.
Aplicaciones que se generen con IA al lanzarse generará un trabajo adicional para el área de TI, por eso generalmente se utiliza un stack de herramientas que maneja el equipo, en caso de que se presenten problemas con el app o se requieran nuevas funcionalidades (que es muy probable que suceda una vez se ponga en producción).
Actualmente, veo que en la página de Boticuy están agregando código que no ha sido auditado o revisado (al menos no por nuestra área) y esto puede presentar una brecha en la seguridad.
En base al punto anterior, se debe realizar siempre un backup antes de hacer cambios fuertes en cualquier web, para poder hacer regresión si es que sucede algún problema.
Queremos que sigan innovando pero siempre teniendo en cuenta estos puntos en el caso de desarrollo de aplicaciones, si tienen mas dudas o consultas estaremos atentos. Saludos

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Thu, 11 Jun 2026 10:56:40 -0500
Gracias por tu respuesta, lo tendremos en cuenta. Quedamos atentos para el lunes.

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Thu, 11 Jun 2026 16:09:21 +0000
Respuesta a observaciones de TI. Ver version HTML y PDF adjunto.

De: Luis Ricardo Almeyda Vasquez lalmeyda@bitacore.xyz · Mon, 15 Jun 2026 17:58:09 -0500
Estimados: Después de revisar el código fuente enviado se tienen los siguientes puntos:

Casi todas las validaciones de algún error retornan el código 200 en lugar de un código http correcto.
En el método de "create order" al poner el método de pago tarjeta no valida con izipay si de verdad está procesando el pedido, no está incluido en el flujo.
Al crear el request para izipay el modo TEST esta harcodeado debería usar el parámetro de woocommerce.
Al crear el request para izipay la variable "amount" asume que ese valor viene correcto del cliente, en vez de sacarlo directamente del pedido.
No se ve ningún control de errores, cualquier excepción que se genere no es controlada.
En el app hay algunos para revisar, pero el que más impacta es el cálculo del monto de pedido, esta debe siempre generarse en el backend.
En conclusión, el app y backend tiene aún más para corregir y no debería ser lanzado a producción aún. Ojo que no se han realizado pruebas directas del app y no se ha revisado lo que han agregado de la copa boticuy.
Nuevamente se indica, que un app en react native no es nuestro stack que trabajamos (Flutter y android nativo), es decir que va a ser complicado manejar cualquier error que salga a futuro. Saludos

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Mon, 15 Jun 2026 18:55:10 -0500
Correcciones aplicadas (plugin v1.1.0). Ver version HTML y adjunto.

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Mon, 15 Jun 2026 19:01:29 -0500
Enlace al codigo fuente de la app: [link de Drive]

De: Luis Ricardo Almeyda Vasquez lalmeyda@bitacore.xyz · Thu, 25 Jun 2026 18:06:28 -0500
Estimados: Se revisó el código fuente actualizado. Las observaciones indicadas se han trabajado, ahora se detectaron algunos detalles que pueden afectar la salida a producción.
Backend:

En el tema de inputs revisar la sanitización (Ejm. las direcciones)
En los apis de registros (ejm. registro de pedidos y usuarios) revisar una manera de validar el uso del api (rate limiter) o proponer un método adicional.
Revisar el tiempo de vida de los Tokens (30 días es mucho tiempo en caso que haya leak del mismo)
App
Revisar si los datos de los usuarios deben guardarse en AsyncStorage vs SecureStorage (Ejm. datos de checkout)
Cualquier duda o consulta me comentan. Tener en cuenta también, que todo este código fuente debe estar en un repositorio de la empresa. Para poder controlar los cambios que se hagan y poder hacer regresión en caso se necesite. Saludos

De: "Herick Fernando Zuzunaga Nuñez" hzuzunaga@bitacore.xyz · Thu, 25 Jun 2026 20:59:53 -0400
Segunda ronda de correcciones (plugin v1.2.0). Ver version HTML y adjunto. Cualquier cosa que necesites de contexto, me dices. Gracias, Brandon.

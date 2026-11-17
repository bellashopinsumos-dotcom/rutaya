# RutaYa · Popayán

Plataforma piloto de solicitudes de compra, recogida y envío con **cuatro experiencias separadas**: cliente (`/`), negocio (`/negocios/`), repartidor (`/repartidores/`) y administración (`/admin/`). Los clientes consultan el progreso desde `/seguimiento/?token=...`.

## Estado del proyecto

**RutaYa ya tiene Supabase conectado** a su proyecto exclusivo `fzawdsuksyckvynrqzpf`. Las cuentas, pedidos y ubicaciones se guardan en su base de datos real. Se requiere registrar usuarios, asignar permisos y aprobar negocios/domiciliarios antes de probar flujos completos entre teléfonos. Si se elimina la configuración de Supabase, la web vuelve a demostración local y los pedidos solo se almacenan en ese navegador. Se pueden recorrer pantallas, crear pedidos, guardar ubicación de un negocio, abrir navegación con Google Maps y ver el avance del pedido en el mismo navegador. Las confirmaciones de recogida y entrega comprueban una ubicación GPS a menos de 200 m del punto, con precisión menor a 100 m. La prueba local no es un sistema antifraude.

Supabase está configurado con una **clave pública publishable**, no con credenciales administrativas. Para Google Maps dentro del selector todavía se necesita una clave restringida de Google Maps Platform. **Nunca se deben incluir claves privadas ni service_role**.

## Conectar Google Maps

1. Crear un proyecto en Google Cloud y revisar facturación/cuotas.
2. Habilitar **Maps JavaScript API** y **Places API (New)**.
3. Crear una clave de API **de navegador**, restringida a `https://bellashopinsumos-dotcom.github.io/*` y restringida a esas APIs.
4. Agregar esa clave pública, y únicamente esa, a `config.js` como `googleMapsApiKey`.
5. El selector presentará Google Maps y autocompletado de lugares; se podrá tocar el mapa y mover el marcador. Si Google Maps no está disponible se ofrece GPS o pegar coordenadas y abrir Google Maps externo.

Google puede cobrar por uso. No pegar claves de servicio privadas en el repositorio público.

## Conectar Supabase

1. Crear proyecto Supabase y ejecutar **una sola vez** `supabase/schema.sql` desde SQL Editor en un proyecto de pruebas nuevo.
2. Copiar **Project URL** y **anon/publishable key**, nunca `service_role`, a `config.js`.
3. Crear cuentas desde la web. El alta pública crea clientes; el rol `business` o `courier` se asigna manualmente por un administrador desde SQL. No exponer un botón público para convertirse en repartidor.
4. Para que Bella Shop pueda registrar su ubicación: crear una fila en `businesses` con su `owner_user_id` y `approved=true`, y cambiar su fila en `profiles` a `role='business'`. El negocio podrá entonces completar ubicación, dirección y nombre desde su panel.
5. Para domiciliarios: actualizar `profiles.role='courier'` y `profiles.approved=true` (solo administradores autorizados). Para administrar, actualizar el rol a `admin`.
6. Verificar en **Authentication > Providers** que Email está habilitado y configurar la confirmación de correo. En **URL Configuration** agregar la URL de GitHub Pages como redirect permitida.
7. Probar con **tres dispositivos distintos**, cada uno con su sesión.

## Alcance técnico actual

- Pedidos y RLS por rol en Supabase; recogida y entrega GPS verificadas por función SQL cuando está conectado.
- Reclamo atómico por domiciliario (`claim_rutaya_order`), máximo 5 pedidos activos y bloqueo de nuevas recogidas mientras existan pedidos recogidos pendientes de entrega.
- Enlace de seguimiento de solo lectura con token aleatorio: estado y última ubicación del domiciliario en su pedido. Se actualiza periódicamente en la vista pública.
- Cliente no decide tarifa. Tarifas tomadas de `tariff_zones` por zona de destino; si no hay coincidencia se marca **Por confirmar**. Para aprobación comercial de zonas, configurar el SQL de manera administrativa.
- El seguimiento GPS desde una PWA depende de que el navegador permanezca abierto; la ubicación en segundo plano en iOS/Android requiere desarrollar una aplicación específica.
- **NO está implementado**: asignación automática por ETA/30 segundos, ruta optimizada, minutos de llegada reales, pagos integrados, facturación, notificaciones push, verificación antifraude resistente a GPS simulado, tarifas comerciales aprobadas. Son funciones posteriores de backend y servicios de rutas.

## Seguridad

El repositorio es público. No agregar contraseñas, service role ni claves secretas. Limitar claves Google por dominio y API; verificar RLS y proteger el acceso a la cuenta del administrador. No almacenar ni mostrar datos de otros clientes en enlaces públicos de seguimiento.

## Prueba local

Abrir con servidor estático (los módulos JS no funcionan desde `file://`): `python -m http.server 8000`, luego `http://localhost:8000/`. Para GPS real se necesita HTTPS o localhost.


## Modalidades y seguimiento (piloto)
- **Enrutado:** tarifa base de la zona menos $1.000 COP, sin valores negativos. Solicitudes antes de las 12:00 m. (Colombia) quedan disponibles para despacho desde las 2:00 p. m. del mismo día; después del corte, desde las 2:00 p. m. del día siguiente.
- **Normal:** tarifa base de la zona, sujeto a disponibilidad de domiciliarios.
- **Urgente:** tarifa base más $1.500 COP. Se prioriza visualmente en el listado del repartidor, pero no garantiza una hora de llegada.
- **Negocio:** cada solicitud permite abrir el seguimiento del domicilio, copiar el enlace o preparar un mensaje para la clienta en WhatsApp. **La persona del negocio debe pulsar Enviar dentro de WhatsApp:** no hay mensajería automática integrada.
- **Cliente:** puede abrir el enlace de seguimiento sin cuenta; RutaYa muestra el estado y la última ubicación GPS recibida cuando el repartidor mantiene la app abierta. Se actualiza periódicamente, no es una transmisión en segundo plano garantizada.
- **Pendiente:** definición real de tarifas por barrio/distancia, programación operativa de rutas agrupadas, aprobación de domiciliarios, notificaciones y GPS fiable en segundo plano. Los montos base por zona son **ejemplos**, no precios comerciales aprobados.


## Alta y aprobación de domiciliarios
1. Desde **Bella Shop → Administrar** o desde `/admin/` (cuenta con permiso `is_admin`), entrar a **Domiciliarios** y pulsar **Copiar enlace de registro**.
2. El repartidor abre `/repartidores/`, se registra con **su propio correo** y confirma el correo si Supabase lo solicita; inicia sesión y envía su solicitud con celular y vehículo.
3. La solicitud queda con `role='courier'`, `approved=false`. La RLS y la función de aceptar pedidos bloquean el acceso a servicios mientras esté pendiente.
4. El administrador verifica identidad, documentos y requisitos operativos fuera de línea; aprueba en **Domiciliarios → Aprobar domiciliario**.
5. El repartidor toca **Comprobar si ya me aprobaron** y después puede activar su GPS y aceptar servicios. El administrador también puede suspenderlo cuando no tiene pedidos activos.

Este procedimiento evita compartir contraseñas o conceder permisos de administrador a los repartidores. La cuenta fundadora de Bella Shop fue habilitada como administradora de RutaYa sin cambiar su rol empresarial. La migración reproducible está en `supabase/courier-onboarding.sql`. Antes de un lanzamiento comercial hacen falta controles adicionales de identidad, documentación, privacidad, ubicación y operación.


## Selección de direcciones y navegación (v18)

- Las pantallas de **cliente**, **negocio** y **Mi tienda** abren un selector con **mapa interactivo dentro de RutaYa**, sin necesidad de copiar coordenadas. Mueve el mapa y toca la calle/casa, o arrastra el marcador, y escribe una dirección/referencia.
- El mapa del selector usa **Leaflet + OpenStreetMap**. La búsqueda manual por botón usa de forma limitada el servicio público **Nominatim** (sin autocompletado). Para uso comercial o alto tráfico se requiere contratar un geocodificador propio o de pago, con límites y privacidad apropiados. La política pública de Nominatim limita el total de solicitudes de la aplicación a 1 por segundo, por lo que **esta versión solo sirve para un piloto pequeño**, no una operación escalable.
- Si una ubicación no está indexada, el usuario puede **marcarla tocando el mapa** y escribir una referencia, sin depender de resultados del buscador. Para Bella Shop, registrar primero su ubicación desde Mi tienda.
- El repartidor encuentra dos botones: **Ruta al punto de recogida** y **Ruta a la dirección del cliente**. Ambos abren la navegación real por calles en Google Maps, con el destino exacto del pedido, y dispone de un botón para **Ver punto en el mapa** sin salir de RutaYa.
- La ventana de mapa interno del repartidor muestra el destino, **no una ruta vial calculada**. Google Maps sí calcula el trayecto al abrir su aplicación. Para navegar, el GPS del repartidor debe estar activo y Google Maps debe tener permiso de ubicación.
- La API de Google Maps integrada sigue **sin clave**; no presentarse como una búsqueda propia de Google Maps. No hay estimaciones de llegada ni navegación en segundo plano dentro de RutaYa.


## RutaYa v20 — mejoras operativas del piloto
- **Cancelación con motivo:** cliente cancela pedidos pendientes; Bella Shop puede cancelar hasta antes de la recogida; administración gestiona los casos pendientes/asignados, nunca cancela automáticamente paquetes ya recogidos.
- **Liberar domicilio:** un repartidor puede devolverlo a disponibles antes de recogerlo. **Reasignación:** administración puede liberarlo o asignarlo directamente a otro repartidor aprobado, con motivo registrado y con límite de 5 servicios activos.
- **Pedidos demorados:** administración, negocios y repartidores ven avisos por tiempo sin actualización. No hay cancelación automática ni confirmación sin GPS.
- **Direcciones recientes:** se obtienen de los pedidos propios para repetir la entrega sin volver a marcar el punto; no se crea un historial público adicional.
- **Tarifas:** administración puede activar/desactivar y editar zonas mediante funciones seguras. La columna \`is_example\` marca tarifas ilustrativas; las cuatro tarifas iniciales siguen siendo **de prueba** hasta que administración confirme importes reales.
- **Seguimiento:** ahora diferencia sin señal, pendiente, entregado y cancelado; incluye hora de la última actualización del estado. Las posiciones desaparecen si no existe un reporte reciente; no se infiere movimiento o ETA.
- **Autenticación:** recuperar contraseña por email y cambiarla desde la cuenta. Para que los enlaces de recuperación vuelvan a RutaYa, comprobar los Redirect URLs permitidos en Supabase Auth.
- **Avisos:** en la aplicación cada ~12 segundos cuando cambia un pedido y notificaciones web optativas si el navegador las admite y RutaYa sigue abierta. No hay notificaciones push fiables con la app cerrada.
- **Seguridad:** funciones de gestión requieren sesión y validan roles en PostgreSQL; \`rutaya_is_role\` ya no se puede invocar con clave anónima. La consulta anónima con token de seguimiento es intencional; no reenviar enlaces a terceros. Habilitar manualmente "Leaked Password Protection" en Supabase cuando esté disponible.
- **Teléfono:** nuevas solicitudes verifican formato de celular colombiano y no modifican los datos de pedidos previos.

### Migraciones para una instalación nueva
Aplicar en orden \`supabase/schema.sql\`, \`supabase/courier-onboarding.sql\` y \`supabase/operacion-v20.sql\`. El último archivo contiene funciones de gestión, asignación, tarifas, permisos y el seguimiento actualizado. El dueño se designa administrador solamente después de verificar su identidad y cuenta.

### Pendiente antes del lanzamiento comercial
Definir **tarifas reales y límites geográficos** de zonas en Popayán; para calcular la zona automáticamente se necesitan polígonos/boundaries confirmados. Sustituir la API pública de Nominatim por un proveedor autorizado para tráfico comercial y sugerencias de direcciones. Activar servicio de notificaciones push y GPS en segundo plano mediante app compatible. Verificar documentos de domiciliarios, atención de incidentes, políticas de datos personales, términos, cobros y soporte. Hacer pruebas completas en tres celulares con los papeles de cliente, negocio y repartidor. El piloto no equivale a un lanzamiento validado.


## RutaYa v21 — La tienda envía un enlace y la clienta completa la entrega

1. El negocio registrado entra a **/negocios/** y pulsa **Crear enlace para la clienta**. Solo escribe qué enviará, si el producto está pagado, el valor pendiente si aplica y la modalidad de domicilio.
2. RutaYa genera un enlace exclusivo \`/confirmar/?token=UUID\` que puede copiarse o enviarse por WhatsApp. Vence en **48 horas** y se puede desactivar desde el negocio mientras siga pendiente.
3. La clienta abre el enlace **sin registrarse**, verifica la tienda y la descripción de su producto, escribe su nombre, celular, dirección, zona de tarifa y referencias; selecciona el punto GPS usando búsqueda, ubicación actual o mapa.
4. El servidor comprueba el enlace, el formato de datos y la zona activa; **solo después de su confirmación** crea un pedido normal en Supabase asociado a la tienda, con la tarifa calculada y el horario de entrega de la modalidad elegida.
5. La clienta ve **su enlace de seguimiento** inmediatamente; el negocio puede consultar el pedido desde Entregas. Los repartidores lo ven cuando se habilita su despacho.

**Seguridad:** la clienta no puede cambiar producto, deuda o modalidad, porque esos valores están en la invitación protegida por Supabase; únicamente completa sus datos de entrega. El token es aleatorio, no aparece en catálogos públicos, requiere posesión del enlace y solo puede crear un pedido. La tabla tiene RLS; únicamente el dueño y administración pueden listar los enlaces. Compartir un enlace concede la capacidad de usarlo, por lo que debe enviarse únicamente a la destinataria. Si se envía al número incorrecto, desactivarlo desde negocios. El formulario debe tratar los datos del cliente conforme a las obligaciones colombianas de protección de datos personales.

**Importante:** las cuatro tarifas base actuales continúan marcadas como **ejemplos**. El precio es estimado según la zona que elige la clienta; no se dispone aún de geocodificación comercial ni verificación automática de polígonos por barrio. Los mensajes de WhatsApp se abren preparados, pero la tienda debe pulsar Enviar.

**Despliegue:** el archivo reproducible está en \`supabase/invitaciones-v21.sql\`. Para instalaciones nuevas, ejecutarlo después de \`supabase/operacion-v20.sql\`. La página compartida es \`confirmar/index.html\`.

**Verificación interna:** se comprobó crear invitación con cuenta del negocio, leerla anónimamente, completarla sin sesión, generar exactamente un pedido y rechazar el segundo envío; esta prueba se ejecutó dentro de una transacción con ROLLBACK para no guardar domicilios ficticios. Falta prueba visual desde un celular real antes del lanzamiento.

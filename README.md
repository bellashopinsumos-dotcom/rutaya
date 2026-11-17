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

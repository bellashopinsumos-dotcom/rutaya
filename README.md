# RutaYa · Popayán

Plataforma piloto de solicitudes de compra, recogida y envío con **cuatro experiencias separadas**: cliente (`/`), negocio (`/negocios/`), repartidor (`/repartidores/`) y administración (`/admin/`). Los clientes consultan el progreso desde `/seguimiento/?token=...`.

## Estado del proyecto

La web funciona **en demostración local** al instalarse sin credenciales. Los pedidos se almacenan en el `localStorage` de ese navegador, por lo que **no aparecen en otro teléfono**. Se pueden recorrer pantallas, crear pedidos, guardar ubicación de un negocio, abrir navegación con Google Maps y ver el avance del pedido en el mismo navegador. Las confirmaciones de recogida y entrega comprueban una ubicación GPS a menos de 200 m del punto, con precisión menor a 100 m. La prueba local no es un sistema antifraude.

Para operar entre teléfonos se necesita Supabase; para un mapa Google dentro del selector se necesita una clave restringida de Google Maps. **No se incluye ningún secreto ni API key**.

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

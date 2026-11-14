# Portal de paciente

Demostración Angular 20 standalone, formularios reactivos y Angular Material. Permite registrar un paciente y gestionar citas de pruebas con Recoletas.Booking. **Usa exclusivamente datos sintéticos**: este proyecto no está preparado para datos sanitarios reales.

## Requisitos y arranque

- Node 20.19 o posterior compatible con Angular 20, npm y Chrome para las pruebas.
- Backend Recoletas.Booking operativo en `http://localhost:5000`. Consulta su README para arrancar PostgreSQL, RabbitMQ y la API (.NET 10).

En PowerShell, desde esta carpeta:

```powershell
npm ci
npm start
```

`npm ci` se usa para la instalación inicial o para restaurar las dependencias. Si ya están instaladas, basta con `npm start`.

Antes de ejecutar `npm ci`, detén cualquier `npm start`, build o prueba en modo watch de este proyecto con `Ctrl+C` en su terminal. En Windows, esos procesos pueden mantener `esbuild.exe` abierto y provocar `EPERM ... unlink ... esbuild.exe`. Detén también cualquier vista previa del proyecto que siga abierta en segundo plano y vuelve a ejecutar `npm ci`; no hace falta empezar ejecutándolo como administrador.

Abre la dirección que indica Angular (normalmente `http://localhost:4200`). `proxy.conf.json` envía `/api/**` a `http://localhost:5000` eliminando `/api`, sin cambiar CORS del backend. Para producción es necesario configurar un reverse proxy **del mismo origen** que haga ese mismo enrutamiento; no se presupone ningún alojamiento. El contrato de referencia está en `doc/openapi.yaml`.

## Recorrido de prueba

1. En **Registro**, introduce un nombre sintético y, si quieres, un NHC sintético único. Copia el `patientId` devuelto. Si el navegador bloquea el portapapeles, selecciónalo y cópialo manualmente; la interfaz avisa del bloqueo. Un NHC ya existente produce un error legible; dejarlo vacío es válido.
2. Obtén externamente un JWT de paciente conforme a `doc/jwt-auth.md` **del repositorio backend**. Este frontend no genera ni firma tokens, no tiene contraseña ni renovación. El algoritmo debe ser HS256 y la API requiere la firma, issuer y audience configurados en el backend. Ejemplo de **payload solamente**, no es un token:

   ```json
   {
     "sub": "Paciente de ejemplo",
     "role": "patient",
     "patientId": "11111111-1111-1111-1111-111111111111",
     "iss": "<issuer configurado en la API>",
     "aud": "<audience configurada en la API>",
     "exp": 1893456000
   }
   ```

   Sustituye `patientId` por el del registro sintético y `exp` por una fecha futura en segundos Unix. `sub` se muestra como nombre; `patientId` identifica al paciente ante la API. No incluyas claves de firma en el frontend.
3. Abre **Auth**, pega el JWT y accede. La comprobación local de formato/claims no verifica la firma: el backend es la autoridad. El token vive solo en memoria; recargar o cerrar sesión lo olvida. Un token expirado o un 401 limpia la sesión y vuelve a Auth; un 403 indica permisos insuficientes.
4. En **Agenda disponible**, filtra por prueba y fechas. La selección inicial es desde ahora hasta siete días después, no un límite del backend. Los filtros y horarios se muestran en `Europe/Madrid`, y se envían como UTC; una hora inexistente del cambio de primavera se rechaza y, en la hora repetida de otoño, se elige la primera ocurrencia.
5. Pulsa **Reservar** y después **Confirmar reserva**. La reserva temporal **no** es una cita confirmada. También puedes confirmarla desde **Pendientes**: allí se muestra la expiración real del servidor. Una reserva/oferta puede cambiar o expirar antes de la acción; ante conflicto se refrescan los paneles.
6. Revisa **Citas confirmadas** y, si procede, cancela. La cancelación usa `reservationId`. La agenda usa `startsAtUtc`/`endsAtUtc`, no la fecha de confirmación.
7. Solicita entrar en **Lista de espera** por tipo de prueba. Acepta o rechaza ofertas desde **Pendientes**. El panel se actualiza al entrar, manualmente, tras acciones/conflictos y cada 15 segundos solo mientras el panel y la pestaña estén visibles; no prolonga los plazos. La entrega de notificaciones depende del backend y su infraestructura, no del sitio.

No hay perfil, resultados, historial, posición o baja de lista de espera, ni funciones administrativas. Si la API no responde, comprueba el proxy y el backend; para 401 vuelve a introducir un JWT válido, para 403 revisa permisos y para 409 actualiza el estado.

## Validación automatizada

```powershell
npm run build
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm test -- --watch=false --browsers=ChromeHeadless
```

Si Chrome está en otra ruta, ajusta `CHROME_BIN`. Las pruebas HTTP son simuladas: cubren claims y caducidad, aislamiento del token, registro, generación, cancelación, cambio de sesión, horarios con horario de verano y sondeo. No sustituyen el recorrido manual con un JWT y backend reales.

También se ha comprobado en el navegador el registro mediante el proxy, el acceso con JWT, la consulta de agenda/citas/pendientes y la reserva, confirmación y cancelación de una cita de prueba. El recorrido real de lista de espera y ofertas depende de que el backend produzca esas ofertas; sus acciones se cubren con las pruebas HTTP simuladas. Nunca guardes un JWT válido en este README, en el código ni en archivos de pruebas.

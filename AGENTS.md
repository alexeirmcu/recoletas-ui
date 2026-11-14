# Guía del proyecto

- Angular 20 standalone, TypeScript estricto, formularios reactivos, Material y SCSS. `src/app/entry.ts` contiene registro/Auth; `booking.ts` y `booking.html` gestionan agenda y citas; `auth.ts`, `api.ts` y `dates.ts` contienen sesión, contrato HTTP y zona horaria. `src/styles.scss` define el tema.
- Contrato: `doc/openapi.yaml`. Desarrollo: `proxy.conf.json` enruta `/api/**` al backend local. Mantén Bearer restringido al proxy y excluye el registro anónimo.
- JWT solo en memoria, nunca en storage, logs, pruebas con credenciales reales ni archivos. `sub` es texto visible; `patientId` identifica al paciente. Solo el backend valida la firma. Usa exclusivamente datos sintéticos.
- Mantén limpieza y cancelación de peticiones al cambiar/cerrar sesión. No confundas 403 con caducidad o 401. Conserva la `generation` devuelta, la expiración real de pendientes y `reservationId` para cancelar; no inventes capacidades del backend.
- API en UTC, presentación/filtros `Europe/Madrid` con cambios de horario. El sondeo de pendientes debe detenerse al ocultar el panel o pestaña y al salir; no debe solaparse.
- Instala con `npm ci`; comprueba con `npm run build` y `npm test -- --watch=false --browsers=ChromeHeadless` (configura `CHROME_BIN` si es necesario). Actualiza pruebas enfocadas de autenticación, aislamiento, registro, fechas, acciones y visibilidad al cambiar estos flujos.

import { inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, catchError, takeUntil, throwError } from 'rxjs';

export interface Session { token: string; name: string; patientId: string; exp: number }

function decodePart(part: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('Codificación inválida');
  const raw = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseToken(token: string): Session {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2] || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new Error('JWT malformado.');
  let header: unknown;
  let payload: unknown;
  try { header = decodePart(parts[0]); payload = decodePart(parts[1]); }
  catch { throw new Error('JWT malformado o con contenido inválido.'); }
  if (!record(header) || header['alg'] !== 'HS256') throw new Error('El algoritmo debe ser HS256.');
  if (!record(payload)) throw new Error('Claims inválidos.');
  const sub = payload['sub'], role = payload['role'], id = payload['patientId'], exp = payload['exp'];
  if (typeof sub !== 'string' || !sub.trim()) throw new Error('El claim sub es obligatorio.');
  if (role !== 'patient') throw new Error('El claim role debe ser patient.');
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('patientId debe ser un GUID.');
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp * 1000 <= Date.now()) throw new Error('El token ha caducado o no tiene exp válido.');
  return { token, name: sub.trim(), patientId: id, exp };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly state = signal<Session | null>(null);
  readonly session = this.state.asReadonly();
  readonly notice = signal('');
  readonly changes = new Subject<void>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  login(raw: string): string | null {
    let session: Session;
    try { session = parseToken(raw.trim()); }
    catch (error: unknown) { return error instanceof Error ? error.message : 'JWT inválido.'; }
    this.clear();
    this.state.set(session);
    this.notice.set('');
    this.scheduleExpiry(session);
    return null;
  }
  private scheduleExpiry(session: Session): void {
    const remaining = session.exp * 1000 - Date.now();
    if (remaining <= 0) { this.end('Tu token ha caducado. Introduce otro para continuar.'); return; }
    this.timer = setTimeout(() => this.scheduleExpiry(session), Math.min(remaining, 2147483647));
  }
  private clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.state.set(null);
    this.changes.next();
  }
  logout(): void { this.clear(); this.notice.set('Sesión cerrada.'); }
  end(message: string): void {
    this.clear();
    this.notice.set(message);
    void this.router.navigateByUrl('/auth');
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const session = auth.session();
  // Only relative URLs within this application's API proxy are eligible.
  const url = new URL(req.url, window.location.origin);
  if (!session || !req.url.startsWith('/api/') || url.origin !== window.location.origin ||
      !url.pathname.startsWith('/api/') ||
      (req.method === 'POST' && url.pathname === '/api/patients')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${session.token}` } })).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && auth.session() === session) {
        auth.end('El servidor ha rechazado el token. Introduce otro para continuar.');
      }
      return throwError(() => error);
    }),
    takeUntil(auth.changes)
  );
};

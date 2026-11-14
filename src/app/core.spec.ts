import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService, authInterceptor } from './auth';
import { ApiService, apiMessage } from './api';
import { madridToUtc, madridInput } from './dates';
import { Router } from '@angular/router';

function jwt(payload: object, header: object = { alg: 'HS256' }): string {
  const enc = (value: object) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc(header)}.${enc(payload)}.signature`;
}
const claims = { sub: 'Lucía Álvarez', role: 'patient', patientId: '11111111-1111-1111-1111-111111111111', exp: 4102444800 };

describe('Auth y API', () => {
  let auth: AuthService;
  let api: ApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: Router, useValue: { navigateByUrl: jasmine.createSpy().and.resolveTo(true) } }] });
    auth = TestBed.inject(AuthService);
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); auth.logout(); });

  it('decodifica Unicode y olvida la sesión al salir', () => {
    const local = spyOn(localStorage, 'setItem');
    const session = spyOn(sessionStorage, 'setItem');
    expect(auth.login(jwt(claims))).toBeNull();
    expect(auth.session()?.name).toBe('Lucía Álvarez');
    auth.logout();
    expect(auth.session()).toBeNull();
    expect(local).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
  });
  it('rechaza tokens y claims inválidos', () => {
    expect(auth.login('bad')).toBeTruthy();
    expect(auth.login(jwt({ ...claims, role: ['patient'] }))).toBeTruthy();
    expect(auth.login(jwt({ ...claims, sub: '  ' }))).toBeTruthy();
    expect(auth.login(jwt({ ...claims, patientId: 'bad' }))).toBeTruthy();
    expect(auth.login(jwt({ ...claims, exp: 1 }))).toBeTruthy();
    expect(auth.login(jwt(claims, { alg: 'none' }))).toBeTruthy();
    expect(auth.session()).toBeNull();
  });
  it('expira la sesión en memoria', fakeAsync(() => {
    auth.login(jwt({ ...claims, exp: Math.floor(Date.now() / 1000) + 2 }));
    tick(3000);
    expect(auth.session()).toBeNull();
    expect(auth.notice()).toContain('caducado');
  }));
  it('envía Bearer solo a API protegida, nunca a registro ni terceros', () => {
    const token = jwt(claims); auth.login(token);
    api.register({ name: 'Ejemplo' }).subscribe();
    const registration = http.expectOne('/api/patients');
    expect(registration.request.headers.has('Authorization')).toBeFalse();
    registration.flush({});
    TestBed.inject(HttpClient).get('https://example.com/data').subscribe();
    const thirdParty = http.expectOne('https://example.com/data');
    expect(thirdParty.request.headers.has('Authorization')).toBeFalse();
    thirdParty.flush({});
  });
  it('manda generation y usa reservationId para cancelar', () => {
    auth.login(jwt(claims));
    api.confirm('slot', 7).subscribe();
    const req = http.expectOne('/api/holds/slot/confirm');
    expect(req.request.body).toEqual({ generation: 7 });
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${jwt(claims)}`);
    req.flush({});
    api.cancel('reservation').subscribe();
    http.expectOne('/api/appointments/reservation/cancel').flush(null);
    api.accept('slot', 8).subscribe();
    const accept = http.expectOne('/api/offers/slot/accept');
    expect(accept.request.body).toEqual({ generation: 8 }); accept.flush({});
    api.decline('slot', 9).subscribe();
    const decline = http.expectOne('/api/offers/slot/decline');
    expect(decline.request.body).toEqual({ generation: 9 }); decline.flush(null);
  });
  it('no envía Bearer a rutas que salen del proxy mediante segmentos punto', () => {
    auth.login(jwt(claims));
    TestBed.inject(HttpClient).get('/api/../other').subscribe();
    const req = http.expectOne('/api/../other');
    expect(req.request.headers.has('Authorization')).toBeFalse(); req.flush({});
  });
  it('un 403 no borra la sesión', () => {
    auth.login(jwt(claims));
    api.appointments().subscribe({ error: () => undefined });
    http.expectOne('/api/appointments').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.session()?.name).toBe('Lucía Álvarez');
  });
  it('un 401 antiguo no cierra una nueva sesión y se cancela la petición antigua', () => {
    auth.login(jwt(claims));
    api.appointments().subscribe();
    const old = http.expectOne('/api/appointments');
    auth.login(jwt({ ...claims, sub: 'Otra persona' }));
    expect(old.cancelled).toBeTrue();
    expect(auth.session()?.name).toBe('Otra persona');
    api.appointments().subscribe({ error: () => undefined });
    http.expectOne('/api/appointments').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.session()).toBeNull();
    expect(auth.notice()).toContain('rechazado');
  });
  it('traduce conflictos y validaciones', () => {
    expect(apiMessage({ status: 409, error: { error: 'patient_nhc_already_exists' } })).toContain('NHC');
    expect(apiMessage({ status: 400, error: { errors: { name: ['Obligatorio'] } } })).toContain('Obligatorio');
    expect(apiMessage({ status: 403, error: {} })).toContain('permisos');
  });
});

describe('horarios de Madrid', () => {
  it('convierte invierno y verano y rechaza el salto horario', () => {
    expect(madridToUtc('2026-01-15T12:00')).toBe('2026-01-15T11:00:00.000Z');
    expect(madridToUtc('2026-07-15T12:00')).toBe('2026-07-15T10:00:00.000Z');
    expect(madridToUtc('2026-03-29T02:30')).toBeNull();
    expect(madridToUtc('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(madridInput(new Date('2026-07-15T10:00:00Z'))).toBe('2026-07-15T12:00');
  });
});

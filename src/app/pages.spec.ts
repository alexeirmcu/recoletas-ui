import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { BookingPage } from './booking';
import { RegistrationPage } from './entry';
import { AuthService, authInterceptor } from './auth';

function syntheticJwt(name = 'Paciente ejemplo'): string {
  const enc = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'HS256' })}.${enc({ sub: name, role: 'patient', patientId: '11111111-1111-1111-1111-111111111111', exp: 4102444800 })}.signature`;
}

describe('registro', () => {
  let fixture: ComponentFixture<RegistrationPage>;
  let http: HttpTestingController;
  let auth: AuthService;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RegistrationPage], providers: [
      provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()
    ] });
    auth = TestBed.inject(AuthService); http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RegistrationPage);
  });
  afterEach(() => { fixture.destroy(); auth.logout(); http.verify(); });
  it('rechaza nombre de espacios y envía registro anónimo recortado', () => {
    const page = fixture.componentInstance;
    page.form.setValue({ name: '   ', nhc: '  ' }); page.submit();
    expect(page.form.controls.name.invalid).toBeTrue();
    http.expectNone('/api/patients');
    auth.login(syntheticJwt());
    page.form.setValue({ name: '  Ejemplo  ', nhc: '   ' }); page.submit();
    const req = http.expectOne('/api/patients');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    expect(req.request.body).toEqual({ name: 'Ejemplo' });
    req.flush({ patientId: 'synthetic-id', name: 'Ejemplo', createdAtUtc: '2030-01-01T00:00:00Z' });
    expect(page.patient?.patientId).toBe('synthetic-id');
    auth.logout(); expect(page.patient).toBeNull();
  });
  it('muestra conflicto NHC y permite reintentar', () => {
    const page = fixture.componentInstance;
    page.form.setValue({ name: 'Ejemplo', nhc: ' NHC-1 ' }); page.submit();
    const req = http.expectOne('/api/patients');
    expect(req.request.body).toEqual({ name: 'Ejemplo', nhc: 'NHC-1' });
    req.flush({ error: 'patient_nhc_already_exists' }, { status: 409, statusText: 'Conflict' });
    expect(page.error).toContain('NHC'); expect(page.busy).toBeFalse();
  });
  it('muestra el formulario y el identificador de registro', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Crear registro');
    const page = fixture.componentInstance;
    page.form.setValue({ name: 'Ejemplo', nhc: '' }); page.submit();
    http.expectOne('/api/patients').flush({ patientId: 'identificador-sintetico', name: 'Ejemplo', createdAtUtc: '2030-01-01T00:00:00Z' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('identificador-sintetico');
  });
  it('cancela un registro pendiente al sustituir la sesión', () => {
    const page = fixture.componentInstance;
    page.form.setValue({ name: 'Ejemplo', nhc: '' }); page.submit();
    const req = http.expectOne('/api/patients');
    auth.login(syntheticJwt()); expect(req.cancelled).toBeTrue();
    expect(page.patient).toBeNull();
  });
});

describe('panel de citas', () => {
  let fixture: ComponentFixture<BookingPage>;
  let http: HttpTestingController;
  let auth: AuthService;
  let hidden = false;
  beforeEach(() => {
    hidden = false;
    spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
    TestBed.configureTestingModule({ imports: [BookingPage], providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: Router, useValue: { navigateByUrl: jasmine.createSpy().and.resolveTo(true) } }
    ] });
    auth = TestBed.inject(AuthService); auth.login(syntheticJwt()); http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookingPage);
    http.expectOne(r => r.url === '/api/slots').flush([]);
    http.expectOne('/api/appointments').flush([]);
  });
  afterEach(() => { fixture.destroy(); auth.logout(); http.verify(); });
  it('sondea sin solaparse y se detiene al ocultar pestaña o panel', fakeAsync(() => {
    http.expectOne('/api/appointments/pending').flush([]);
    tick(15000);
    const pending = http.expectOne('/api/appointments/pending');
    fixture.componentInstance.refreshPending();
    tick(30000);
    http.expectNone('/api/appointments/pending');
    pending.flush([]);
    http.expectOne('/api/appointments/pending').flush([]);
    hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    tick(30000); http.expectNone('/api/appointments/pending');
    hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne('/api/appointments/pending').flush([]);
    fixture.componentInstance.togglePending(); tick(30000);
    http.expectNone('/api/appointments/pending');
    expect(fixture.componentInstance.pendingOpen).toBeFalse();
  }));
  it('muestra el horario real de citas confirmadas', () => {
    http.expectOne('/api/appointments/pending').flush([]);
    fixture.componentInstance.appointments = [{ reservationId: 'r', slotId: 's', patientId: 'p', testType: 'MRI',
      startsAtUtc: '2026-07-15T10:00:00Z', endsAtUtc: '2026-07-15T10:30:00Z', confirmedAtUtc: '2026-01-01T00:00:00Z' }];
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('12:00'); expect(text).toContain('12:30');
  });
  it('limpia datos y cancela respuestas antiguas cuando cambia el token', () => {
    const pending = http.expectOne('/api/appointments/pending');
    fixture.componentInstance.slots = [{ slotId: 'old', testType: 'MRI', startsAtUtc: '', endsAtUtc: '', state: 'Available' }];
    auth.login(syntheticJwt('Otro paciente'));
    expect(pending.cancelled).toBeTrue();
    expect(fixture.componentInstance.slots).toEqual([]);
    expect(fixture.componentInstance.pending).toEqual([]);
  });
  it('reserva con generation devuelta y confirma con ella', () => {
    http.expectOne('/api/appointments/pending').flush([]);
    const page = fixture.componentInstance;
    page.hold({ slotId: 'slot', testType: 'MRI', startsAtUtc: '', endsAtUtc: '', state: 'Available' });
    page.hold({ slotId: 'slot', testType: 'MRI', startsAtUtc: '', endsAtUtc: '', state: 'Available' });
    http.expectOne('/api/slots/slot/hold').flush({ succeeded: true, generation: 12 });
    http.expectOne(r => r.url === '/api/slots').flush([]);
    http.expectOne('/api/appointments').flush([]);
    http.expectOne('/api/appointments/pending').flush([]);
    expect(page.directHold?.generation).toBe(12);
    page.confirm('slot', 12);
    const confirm = http.expectOne('/api/holds/slot/confirm'); expect(confirm.request.body).toEqual({ generation: 12 }); confirm.flush({});
    http.expectOne(r => r.url === '/api/slots').flush([]);
    http.expectOne('/api/appointments').flush([]);
    http.expectOne('/api/appointments/pending').flush([]);
    expect(page.directHold).toBeNull();
  });
  it('un conflicto refresca y evita actuar sobre ofertas caducadas', () => {
    http.expectOne('/api/appointments/pending').flush([]);
    const page = fixture.componentInstance;
    const expired = { slotId: 'slot', kind: 'offer' as const, testType: 'MRI' as const, generation: 5, startsAtUtc: '2020-01-01T00:00:00Z', endsAtUtc: '2020-01-01T01:00:00Z', expiresAtUtc: '2020-01-01T00:00:00Z' };
    page.accept(expired); http.expectNone('/api/offers/slot/accept');
    page.join();
    http.expectOne('/api/waitlist').flush({ error: 'already_joined' }, { status: 409, statusText: 'Conflict' });
    expect(page.actionError).toContain('lista de espera');
    http.expectOne(r => r.url === '/api/slots').flush([]);
    http.expectOne('/api/appointments').flush([]);
    http.expectOne('/api/appointments/pending').flush([]);
  });
});

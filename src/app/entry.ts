import { Component, DestroyRef, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService, Patient, apiMessage } from './api';
import { AuthService } from './auth';
import { takeUntil } from 'rxjs';

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
  <section class="page narrow">
    <p class="eyebrow">ACCESO SEGURO</p><h1>Tu espacio de salud</h1>
    <p class="lead">Introduce el token de paciente que has obtenido por un canal externo para acceder a tus citas.</p>
    <div class="card">
      <h2>Auth <span class="pill">JWT manual</span></h2>
      @if (auth.notice()) { <p class="notice" role="status">{{ auth.notice() }}</p> }
      @if (auth.session()) { <p>Sesión actual: <strong>{{ auth.session()?.name }}</strong></p><a mat-stroked-button routerLink="/citas">Ir a mis citas</a> }
      <form [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="full"><mat-label>Token JWT</mat-label>
          <textarea matInput formControlName="token" rows="4" autocomplete="off" spellcheck="false"></textarea>
        </mat-form-field>
        @if (error) { <p class="error" role="alert">{{ error }}</p> }
        <button mat-flat-button type="submit">Acceder</button>
      </form>
      <p class="muted">Solo permanece en memoria y se olvida al recargar o cerrar sesión. La API valida su firma.</p>
    </div>
    <p>¿Todavía no tienes identificador? <a routerLink="/registro">Regístrate</a>.</p>
  </section>`
})
export class AuthPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly form = new FormGroup({ token: new FormControl('', { nonNullable: true, validators: [Validators.required] }) });
  error = '';
  submit(): void {
    const result = this.auth.login(this.form.controls.token.value);
    if (result) { this.error = result; return; }
    this.form.reset();
    void this.router.navigateByUrl('/citas');
  }
}

@Component({
  selector: 'app-registration-page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
  <section class="hero page">
    <div class="hero-copy"><p class="eyebrow">CUIDARTE, MÁS CERCA</p>
      <h1>Tu salud merece<br><em>un espacio propio.</em></h1>
      <p class="lead">Regístrate y gestiona tus solicitudes de pruebas en un solo lugar, de forma sencilla.</p>
      <div class="hero-note"><span class="note-icon">✦</span><span><strong>Un paso cada vez</strong><br>Registro, acceso y gestión de citas.</span></div>
    </div>
    <div class="card registration">
      <p class="eyebrow">EMPIEZA AQUÍ</p><h2>Crear registro</h2>
      <p class="muted">Utiliza únicamente datos sintéticos en este entorno de demostración.</p>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="full"><mat-label>Nombre</mat-label><input matInput formControlName="name" maxlength="200" autocomplete="off">
          @if (form.controls.name.touched && !form.controls.name.value.trim()) { <mat-error>El nombre es obligatorio.</mat-error> }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full"><mat-label>NHC (opcional)</mat-label><input matInput formControlName="nhc" maxlength="100" autocomplete="off"></mat-form-field>
        @if (error) { <p class="error" role="alert">{{ error }}</p> }
        <button mat-flat-button type="submit" [disabled]="busy">Crear registro</button>
      </form>
      @if (patient) {
        <div class="success" role="status"><strong>Registro creado</strong><p>Guarda tu identificador de paciente para generar un JWT externamente.</p>
          <code>{{ patient.patientId }}</code> <button mat-stroked-button type="button" (click)="copy()">Copiar</button>
          @if (copyMessage) { <p>{{ copyMessage }}</p> }
          <p>El registro no genera un token ni inicia sesión.</p><a routerLink="/auth">Ir a Auth →</a>
        </div>
      }
      <p class="muted">¿Ya tienes token? <a routerLink="/auth">Ir a Auth</a></p>
    </div>
  </section>`
})
export class RegistrationPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200), nonBlank] }),
    nhc: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] })
  });
  busy = false; error = ''; patient: Patient | null = null; copyMessage = '';
  constructor() {
    this.auth.changes.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      this.patient = null; this.error = ''; this.copyMessage = ''; this.form.reset();
    });
  }
  submit(): void {
    if (this.busy) return;
    const name = this.form.controls.name.value.trim(), nhc = this.form.controls.nhc.value.trim();
    if (!name || this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy = true; this.error = ''; this.patient = null; this.copyMessage = '';
    this.api.register(nhc ? { name, nhc } : { name }).pipe(takeUntil(this.auth.changes), takeUntilDestroyed(this.destroy)).subscribe({
      next: patient => { this.patient = patient; this.busy = false; },
      error: (error: unknown) => { this.error = apiMessage(error); this.busy = false; },
      complete: () => { this.busy = false; }
    });
  }
  async copy(): Promise<void> {
    if (!this.patient) return;
    try { await navigator.clipboard.writeText(this.patient.patientId); this.copyMessage = 'Identificador copiado.'; }
    catch { this.copyMessage = 'No se pudo copiar. Selecciona y copia el identificador manualmente.'; }
  }
}

function nonBlank(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { blank: true };
}

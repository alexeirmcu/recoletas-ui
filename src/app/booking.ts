import { Component, DestroyRef, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, Subscription, finalize } from 'rxjs';
import { ApiService, Appointment, Pending, Slot, TestType, apiMessage, testLabels } from './api';
import { AuthService } from './auth';
import { madridDate, madridInput, madridToUtc } from './dates';

@Component({
  selector: 'app-booking-page',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './booking.html'
})
export class BookingPage {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  readonly labels = testLabels;
  readonly types: TestType[] = ['BloodTest', 'Ultrasound', 'MRI'];
  readonly date = madridDate;
  readonly filters = new FormGroup({
    from: new FormControl(madridInput(new Date()), { nonNullable: true }),
    to: new FormControl(madridInput(new Date(Date.now() + 7 * 86400000)), { nonNullable: true }),
    type: new FormControl<TestType | ''>('', { nonNullable: true })
  });
  readonly waitType = new FormControl<TestType>('BloodTest', { nonNullable: true });
  slots: Slot[] = []; appointments: Appointment[] = []; pending: Pending[] = [];
  slotLoading = false; appointmentLoading = false; pendingLoading = false;
  slotError = ''; appointmentError = ''; pendingError = ''; actionError = ''; message = '';
  busy = false; pendingOpen = true;
  directHold: { slotId: string; generation: number } | null = null;
  private pendingRequest?: Subscription;
  private slotRequest?: Subscription;
  private appointmentRequest?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;
  private refreshQueued = false;
  private stoppingPending = false;
  private readonly visibility = () => {
    if (document.hidden) this.stopPending();
    else if (this.pendingOpen && this.auth.session()) this.refreshPending();
  };
  constructor() {
    document.addEventListener('visibilitychange', this.visibility);
    this.destroy.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.visibility);
      this.stopPending();
      this.slotRequest?.unsubscribe();
      this.appointmentRequest?.unsubscribe();
    });
    this.auth.changes.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      this.stopPending(); this.slotRequest?.unsubscribe(); this.appointmentRequest?.unsubscribe();
      this.slots = []; this.appointments = []; this.pending = []; this.directHold = null;
      this.slotError = ''; this.appointmentError = ''; this.pendingError = ''; this.actionError = ''; this.message = '';
      this.busy = false;
    });
    this.loadSlots(); this.loadAppointments(); this.refreshPending();
  }
  loadSlots(): void {
    this.slotRequest?.unsubscribe();
    const from = madridToUtc(this.filters.controls.from.value), to = madridToUtc(this.filters.controls.to.value);
    if (!from || !to || from >= to) { this.slotError = 'Indica un intervalo válido en hora de Madrid. Las horas inexistentes por cambio horario no son válidas.'; this.slots = []; return; }
    this.slotLoading = true; this.slotError = '';
    this.slotRequest = this.api.slots(from, to, this.filters.controls.type.value).pipe(
      finalize(() => this.slotLoading = false), takeUntilDestroyed(this.destroy)
    ).subscribe({ next: data => this.slots = data, error: (error: unknown) => { this.slots = []; this.slotError = apiMessage(error); } });
  }
  loadAppointments(): void {
    this.appointmentRequest?.unsubscribe(); this.appointmentLoading = true; this.appointmentError = '';
    this.appointmentRequest = this.api.appointments().pipe(
      finalize(() => this.appointmentLoading = false), takeUntilDestroyed(this.destroy)
    ).subscribe({ next: data => this.appointments = data, error: (error: unknown) => { this.appointments = []; this.appointmentError = apiMessage(error); } });
  }
  private stopPending(): void {
    this.stoppingPending = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.refreshQueued = false;
    this.pendingRequest?.unsubscribe(); this.pendingRequest = undefined; this.pendingLoading = false;
    this.stoppingPending = false;
  }
  togglePending(): void {
    this.pendingOpen = !this.pendingOpen;
    if (this.pendingOpen) this.refreshPending(); else this.stopPending();
  }
  refreshPending(): void {
    if (!this.pendingOpen || document.hidden || !this.auth.session()) return;
    if (this.pendingLoading) { this.refreshQueued = true; return; }
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.pendingLoading = true; this.pendingError = '';
    this.pendingRequest = this.api.pending().pipe(
      takeUntilDestroyed(this.destroy),
      finalize(() => {
        this.pendingLoading = false;
        if (!this.stoppingPending && this.pendingOpen && !document.hidden && this.auth.session()) {
          if (this.refreshQueued) { this.refreshQueued = false; this.refreshPending(); }
          else this.timer = setTimeout(() => this.refreshPending(), 15000);
        }
      })
    ).subscribe({ next: data => this.pending = data, error: (error: unknown) => { this.pending = []; this.pendingError = apiMessage(error); } });
  }
  expired(item: Pending): boolean { return Date.parse(item.expiresAtUtc) <= Date.now(); }
  private run<T>(request: Observable<T>, onSuccess: (value: T) => void): void {
    if (this.busy) return;
    this.busy = true; this.actionError = ''; this.message = '';
    request.pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy = false)).subscribe({
      next: value => { onSuccess(value); this.refreshAll(); },
      error: (error: unknown) => { this.directHold = null; this.actionError = apiMessage(error); this.refreshAll(); }
    });
  }
  private refreshAll(): void { if (this.auth.session()) { this.loadSlots(); this.loadAppointments(); this.refreshPending(); } }
  hold(slot: Slot): void {
    this.run(this.api.hold(slot.slotId), result => {
      if (!result.succeeded || !Number.isInteger(result.generation) || !result.generation || result.generation < 1) {
        this.actionError = result.errorCode ? apiMessage({ status: 409, error: { error: result.errorCode } }) : 'La reserva temporal no devolvió una generación válida.';
        return;
      }
      this.directHold = { slotId: slot.slotId, generation: result.generation };
      this.message = 'Reserva temporal creada. Confírmala para obtener una cita.';
    });
  }
  confirm(id: string, generation: number): void {
    this.run(this.api.confirm(id, generation), () => { this.directHold = null; this.message = 'Cita confirmada.'; });
  }
  confirmPending(item: Pending): void {
    if (!this.expired(item)) this.confirm(item.slotId, item.generation);
  }
  accept(item: Pending): void {
    if (this.expired(item)) return;
    this.run(this.api.accept(item.slotId, item.generation), () => this.message = 'Oferta aceptada y cita confirmada.');
  }
  decline(item: Pending): void {
    if (this.expired(item)) return;
    this.run(this.api.decline(item.slotId, item.generation), () => this.message = 'Oferta rechazada.');
  }
  cancel(item: Appointment): void {
    this.run(this.api.cancel(item.reservationId), () => this.message = 'Cita cancelada.');
  }
  join(): void {
    this.run(this.api.join(this.waitType.value), result => {
      if (result.joined && !result.alreadyJoined) this.message = 'Solicitud de lista de espera registrada.';
      else this.actionError = 'No se pudo registrar la solicitud de lista de espera.';
    });
  }
}

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

export type TestType = 'BloodTest' | 'Ultrasound' | 'MRI';
export const testLabels: Record<TestType, string> = { BloodTest: 'Análisis de sangre', Ultrasound: 'Ecografía', MRI: 'Resonancia magnética' };
export interface Patient { patientId: string; name: string; nhc?: string | null; createdAtUtc: string }
export interface Slot { slotId: string; testType: TestType; startsAtUtc: string; endsAtUtc: string; state: 'Available' }
export interface Appointment { reservationId: string; slotId: string; patientId: string; testType: TestType; startsAtUtc: string; endsAtUtc: string; confirmedAtUtc: string }
export interface Pending { slotId: string; testType: TestType; startsAtUtc: string; endsAtUtc: string; kind: 'hold' | 'offer'; generation: number; expiresAtUtc: string }
export interface BookingResult { succeeded: boolean; errorCode?: string | null; generation?: number | null; appointment?: Appointment | null }
export interface WaitlistResult { joined: boolean; alreadyJoined: boolean; errorCode?: string | null }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  register(data: { name: string; nhc?: string }) { return this.http.post<Patient>('/api/patients', data); }
  slots(from: string, to: string, type: TestType | '') {
    let params = new HttpParams().set('from', from).set('to', to);
    if (type) params = params.set('testType', type);
    return this.http.get<Slot[]>('/api/slots', { params });
  }
  hold(id: string) { return this.http.post<BookingResult>(`/api/slots/${encodeURIComponent(id)}/hold`, {}); }
  confirm(id: string, generation: number) { return this.http.post<Appointment>(`/api/holds/${encodeURIComponent(id)}/confirm`, { generation }); }
  appointments() { return this.http.get<Appointment[]>('/api/appointments'); }
  pending() { return this.http.get<Pending[]>('/api/appointments/pending'); }
  // The live backend has been checked with reservationId; keep the mapping here.
  cancel(reservationId: string) { return this.http.post<void>(`/api/appointments/${encodeURIComponent(reservationId)}/cancel`, {}); }
  join(testType: TestType) { return this.http.post<WaitlistResult>('/api/waitlist', { testType }); }
  accept(id: string, generation: number) { return this.http.post<Appointment>(`/api/offers/${encodeURIComponent(id)}/accept`, { generation }); }
  decline(id: string, generation: number) { return this.http.post<void>(`/api/offers/${encodeURIComponent(id)}/decline`, { generation }); }
}

const errors: Record<string, string> = {
  patient_nhc_already_exists: 'Ya existe un paciente con ese NHC.',
  already_joined: 'Ya estás en la lista de espera para esta prueba.',
  slot_unavailable: 'El hueco ya no está disponible.',
  hold_invalid_or_expired: 'La reserva temporal ha caducado o ha cambiado.',
  offer_invalid_or_expired: 'La oferta ha caducado o ha cambiado.',
  patient_not_found: 'No se encuentra el paciente asociado al token.',
  slot_not_found: 'No se encuentra el hueco.',
  appointment_not_found: 'No se encuentra la cita.'
};
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function apiMessage(error: unknown): string {
  if (!isRecord(error) && !(error instanceof HttpErrorResponse)) return 'No se pudo completar la operación.';
  const status = error.status;
  const body: unknown = error.error;
  if (status === 0) return 'No se puede conectar con la API. Comprueba que el backend esté en marcha.';
  if (status === 401) return 'El servidor ha rechazado el token.';
  if (status === 403) return 'No tienes permisos para esta operación.';
  if (isRecord(body)) {
    if (typeof body['error'] === 'string' && errors[body['error']]) return errors[body['error']];
    if (isRecord(body['errors'])) {
      const messages = Object.values(body['errors']).flatMap(v => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      if (messages.length) return messages.join(' ');
    }
    if (Array.isArray(body['details'])) {
      const messages = body['details'].flatMap((v: unknown) => isRecord(v) && typeof v['message'] === 'string' ? [v['message']] : []);
      if (messages.length) return messages.join(' ');
    }
    if (typeof body['message'] === 'string') return body['message'];
    if (typeof body['title'] === 'string') return body['title'];
  }
  if (status === 409) return 'La situación ha cambiado. Actualiza e inténtalo de nuevo.';
  if (status === 404) return 'No se ha encontrado el recurso.';
  if (status === 400) return 'Comprueba los datos introducidos.';
  return 'No se pudo completar la operación. Inténtalo más tarde.';
}

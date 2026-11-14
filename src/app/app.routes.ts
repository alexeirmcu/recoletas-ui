import { inject } from '@angular/core';
import { CanActivateFn, Routes, Router } from '@angular/router';
import { AuthService } from './auth';
import { AuthPage, RegistrationPage } from './entry';
import { BookingPage } from './booking';

const authenticated: CanActivateFn = () => inject(AuthService).session() ? true : inject(Router).parseUrl('/auth');
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'registro' },
  { path: 'registro', component: RegistrationPage },
  { path: 'auth', component: AuthPage },
  { path: 'citas', component: BookingPage, canActivate: [authenticated] },
  { path: '**', redirectTo: 'registro' }
];

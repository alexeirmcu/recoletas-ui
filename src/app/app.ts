import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from './auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule],
  templateUrl: './app.html'
})
export class App {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  logout(): void { this.auth.logout(); void this.router.navigateByUrl('/auth'); }
}

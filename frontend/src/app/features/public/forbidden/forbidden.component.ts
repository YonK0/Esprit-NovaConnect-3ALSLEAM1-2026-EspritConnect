import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ec-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="card text-center py-20">
      <p class="text-xs font-mono text-primary mb-2">▸ 403</p>
      <h1 class="font-display text-3xl font-bold mb-3">Access denied.</h1>
      <p class="text-ink-600 mb-6">You don't have permission to view this resource.</p>
      <a routerLink="/feed" class="btn-primary inline-block">Back to feed</a>
    </div>
  `
})
export class ForbiddenComponent {}

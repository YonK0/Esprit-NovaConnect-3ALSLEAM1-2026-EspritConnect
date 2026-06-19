import { Component, ElementRef, inject, signal, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ChatbotApi, ChatResponse, QuickAction, ResultCard } from './chatbot.service';
import { TokenStorageService } from '../../core/services/token-storage.service';

interface ChatTurn {
  role: 'assistant' | 'user';
  text: string;
  results?: ResultCard[];
  followUps?: QuickAction[];
}

@Component({
  selector: 'ec-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- Collapsed bubble -->
    <button *ngIf="!open()"
            (click)="openPanel()"
            class="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary
                   text-white shadow-lg hover:bg-primary-dark transition
                   flex items-center justify-center"
            [attr.aria-label]="'Open ESPRIT assistant'">
      <span class="text-xl">▸</span>
      <span class="absolute -top-1 -right-1 w-3 h-3 bg-glow rounded-full
                   animate-pulse"></span>
    </button>

    <!-- Expanded panel -->
    <section *ngIf="open()"
             class="fixed bottom-6 right-6 z-40 w-[380px] max-h-[600px]
                    rounded-2xl bg-ink-900 text-ink-100 shadow-2xl
                    border border-primary/30 flex flex-col overflow-hidden">

      <!-- Header -->
      <header class="px-4 py-3 border-b border-primary/20 flex items-center gap-3">
        <span class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
          ▸
        </span>
        <div class="flex-1">
          <p class="font-display font-bold text-sm">
            esprit <span class="text-primary">ASSISTANT</span>
          </p>
          <p class="text-xs text-ink-300 font-mono">
            online · <button (click)="toggleLocale()"
                             class="hover:text-primary">{{ localeLabel() }}</button>
          </p>
        </div>
        <button (click)="closePanel()" class="text-ink-300 hover:text-white" aria-label="Close">
          ×
        </button>
      </header>

      <!-- Conversation -->
      <div #scrollArea class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <article *ngFor="let t of turns()"
                 class="flex gap-2"
                 [class.justify-end]="t.role === 'user'">
          <div *ngIf="t.role === 'assistant'"
               class="w-6 h-6 rounded-full bg-primary flex items-center justify-center
                      text-xs text-white shrink-0 mt-1">▸</div>

          <div [class.bg-ink-800]="t.role === 'assistant'"
               [class.bg-primary]="t.role === 'user'"
               [class.text-white]="t.role === 'user'"
               class="rounded-lg px-3 py-2 text-sm max-w-[280px] whitespace-pre-wrap">
            {{ t.text }}

            <!-- Result cards -->
            <ul *ngIf="t.results?.length" class="mt-3 space-y-2">
              <li *ngFor="let c of t.results"
                  class="bg-ink-900 rounded-lg p-2 border border-primary/20">
                <a [routerLink]="c.href" (click)="closePanel()"
                   class="block hover:text-primary">
                  <p class="font-bold text-xs">{{ c.title }}</p>
                  <p class="text-xs text-ink-300 truncate">{{ c.subtitle }}</p>
                  <p *ngIf="c.badge" class="text-xs font-mono text-primary mt-1">
                    {{ c.badge }}
                  </p>
                </a>
              </li>
            </ul>

            <!-- Quick follow-ups -->
            <div *ngIf="t.followUps?.length" class="mt-3 flex flex-wrap gap-1.5">
              <button *ngFor="let f of t.followUps"
                      (click)="sendPrompt(f.prompt)"
                      class="text-xs px-2 py-1 rounded-full bg-ink-900 border border-primary/30
                             hover:bg-primary/20 transition">
                {{ f.label }}
              </button>
            </div>
          </div>
        </article>

        <!-- Quick prompts shown only when conversation is empty -->
        <div *ngIf="turns().length <= 1" class="space-y-2">
          <button *ngFor="let q of quickPrompts()"
                  (click)="sendPrompt(q)"
                  class="w-full text-left text-sm px-3 py-2 rounded-lg bg-ink-800
                         hover:bg-ink-800/60 border border-primary/20">
            <span class="text-primary">☼</span> {{ q }}
          </button>
        </div>

        <div *ngIf="loading()" class="flex gap-2 items-center text-xs text-ink-300">
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse" style="animation-delay:.2s"></span>
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse" style="animation-delay:.4s"></span>
          <span>thinking…</span>
        </div>
      </div>

      <!-- Input -->
      <form (ngSubmit)="send()" class="border-t border-primary/20 p-3 flex gap-2">
        <input class="flex-1 bg-ink-800 text-ink-100 placeholder-ink-500 rounded-lg px-3 py-2
                      text-sm border border-primary/20 focus:border-primary outline-none"
               [placeholder]="placeholder()"
               [(ngModel)]="draft" name="msg"
               [disabled]="loading()"
               autocomplete="off" />
        <button type="submit" class="w-9 h-9 rounded-lg bg-primary text-white
                                      hover:bg-primary-dark disabled:opacity-50"
                [disabled]="!draft.trim() || loading()" aria-label="Send">
          ➤
        </button>
      </form>

      <p class="px-3 pb-2 text-[10px] text-ink-500 font-mono text-center">
        ESPRIT Assistant · powered by your alumni network
      </p>
    </section>
  `
})
export class ChatbotComponent implements AfterViewChecked {
  private api = inject(ChatbotApi);
  private router = inject(Router);
  private tokenStorage = inject(TokenStorageService);
  @ViewChild('scrollArea') private scrollArea?: ElementRef<HTMLDivElement>;
  private shouldScroll = false;

  protected open = signal(false);
  protected loading = signal(false);
  protected locale = signal<'fr' | 'en'>('en');
  protected draft = '';
  protected turns = signal<ChatTurn[]>([]);

  protected localeLabel = () => this.locale() === 'fr' ? 'FR/EN' : 'EN/FR';

  protected placeholder = () => this.locale() === 'fr'
    ? 'Posez une question — FR ou EN…'
    : 'Ask anything — EN or FR…';

  protected quickPrompts = () => this.locale() === 'fr'
    ? [
        'Trouve des alumni qui travaillent à Google Paris',
        'Quels stages en IA sont ouverts cette semaine ?',
        'Qui peut me mentorer en systèmes embarqués ?',
        'Résume mes notifications non lues',
        'Rédige un message pour reconnecter avec un ancien camarade'
      ]
    : [
        'Find me alumni working at Google in Paris',
        'What internships are open in AI this week?',
        'Who can mentor me in embedded systems?',
        'Summarize my unread notifications',
        'Draft a reconnect message to my old project partner'
      ];

  openPanel(): void {
    this.open.set(true);
    if (this.turns().length === 0) {
      this.turns.set([{
        role: 'assistant',
        text: this.locale() === 'fr'
          ? "Bonjour 👋 Je suis l'assistant ESPRIT. Voici ce que je peux faire :"
          : "Hi 👋 I'm the ESPRIT assistant. Here's what I can do:"
      }]);
    }
  }

  closePanel(): void { this.open.set(false); }

  toggleLocale(): void {
    this.locale.set(this.locale() === 'fr' ? 'en' : 'fr');
    this.turns.set([]);                    // reset greeting in the new locale
    this.openPanel();
  }

  sendPrompt(prompt: string): void {
    this.draft = prompt;
    this.send();
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.loading()) return;
    this.draft = '';

    this.turns.update(t => [...t, { role: 'user', text }]);
    this.loading.set(true);
    this.shouldScroll = true;

    // Always use the POST endpoint. It goes through Angular's HttpClient
    // (auth interceptor attaches the JWT), through nginx (5-min proxy
    // timeout for /api/v1/assistant/chat), and through Spring (3-min
    // Ollama timeout). The SSE variant was unreliable in this stack
    // because of double-buffering and silent network errors.
    this.api.chat(text, this.locale()).subscribe({
      next: (resp: ChatResponse) => {
        this.turns.update(t => [...t, {
          role: 'assistant',
          text: resp.reply,
          results: resp.results,
          followUps: resp.followUps,
        }]);
        this.loading.set(false);
        this.shouldScroll = true;
      },
      error: (err) => {
        // Surface the real cause when we have one, instead of the generic
        // "unavailable" line — the user can then tell whether it's the
        // model (Ollama down), the network (nginx timeout) or auth.
        const fallback = this.locale() === 'fr'
          ? "Désolé, l'assistant est indisponible."
          : "Sorry, the assistant is unavailable.";
        const detail = err?.error?.message
          ?? (err?.status === 0 ? 'Network timeout — try again.'
              : err?.status === 401 ? 'Please log in again.'
              : err?.statusText ?? '');
        this.turns.update(t => [...t, {
          role: 'assistant',
          text: detail ? `${fallback} (${detail})` : fallback,
        }]);
        this.loading.set(false);
        // Log the full error to the console so we can diagnose if it
        // comes up again — keeps the user message clean.
        console.warn('Assistant call failed:', err);
      },
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.scrollArea) {
      this.scrollArea.nativeElement.scrollTop = this.scrollArea.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }
}

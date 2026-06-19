import { Component, ElementRef, AfterViewChecked, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessagingApi, ConversationSummary, ChatMessage } from './messaging.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast.service';

@Component({
  selector: 'ec-messaging',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ MESSAGING</p>
    <h1 class="font-display text-3xl font-bold mb-6">Conversations</h1>

    <div class="grid lg:grid-cols-[280px_1fr] gap-4 h-[600px]">
      <!-- Sidebar: conversations -->
      <aside class="card !p-0 overflow-hidden flex flex-col">
        <div class="p-3 border-b border-ink-300/40">
          <p class="text-xs font-mono text-ink-500">{{ conversations().length }} thread(s)</p>
        </div>
        <ul class="overflow-y-auto flex-1 divide-y divide-ink-300/30">
          <li *ngFor="let c of conversations()">
            <a [routerLink]="['/messaging', c.id]"
               class="block p-3 hover:bg-ink-100 no-underline text-inherit"
               [class.bg-red-50]="c.id === selectedId()">
              <div class="flex items-center gap-3">
                <span class="w-9 h-9 rounded-full bg-primary text-white flex items-center
                             justify-center font-mono text-xs shrink-0">
                  {{ initialsOf(c.otherUserEmail) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold truncate">
                    {{ c.otherUserEmail || 'Unknown' }}
                  </p>
                  <p class="text-xs text-ink-500" *ngIf="c.lastMessageAt">
                    {{ c.lastMessageAt | date:'short' }}
                  </p>
                </div>
              </div>
            </a>
          </li>
          <li *ngIf="conversations().length === 0" class="p-3 text-xs text-ink-500">
            No conversations yet. Open a profile and click <strong>Message</strong>.
          </li>
        </ul>
      </aside>

      <!-- Thread -->
      <section class="card !p-0 overflow-hidden flex flex-col">
        <ng-container *ngIf="selectedId(); else noThread">
          <header class="p-3 border-b border-ink-300/40 flex items-center gap-3">
            <span class="w-9 h-9 rounded-full bg-primary text-white flex items-center
                         justify-center font-mono text-xs shrink-0">
              {{ initialsOf(otherEmail()) }}
            </span>
            <div>
              <p class="font-semibold text-sm">{{ otherEmail() || '—' }}</p>
              <p class="text-xs text-ink-500">{{ messages().length }} message(s)</p>
            </div>
          </header>

          <div #scrollArea class="flex-1 overflow-y-auto p-4 space-y-2">
            <article *ngFor="let m of messages()"
                     class="max-w-[70%]"
                     [class.ml-auto]="isMine(m)">
              <div class="rounded-lg px-3 py-2 text-sm"
                   [class.bg-primary]="isMine(m)"
                   [class.text-white]="isMine(m)"
                   [class.bg-ink-100]="!isMine(m)">
                {{ m.content }}
              </div>
              <p class="text-[10px] text-ink-500 mt-1 font-mono"
                 [class.text-right]="isMine(m)">
                {{ m.createdAt | date:'short' }}
              </p>
            </article>
            <p *ngIf="messages().length === 0" class="text-ink-500 text-sm text-center">
              No messages yet. Say hi.
            </p>
          </div>

          <form (ngSubmit)="send()" class="border-t border-ink-300/40 p-3 flex gap-2">
            <input class="field !py-2" [(ngModel)]="draft" name="msg"
                   placeholder="Type a message..."
                   [disabled]="sending()" autocomplete="off" />
            <button type="submit" class="btn-primary !py-2"
                    [disabled]="!draft.trim() || sending()">
              {{ sending() ? '…' : 'Send' }}
            </button>
          </form>
        </ng-container>

        <ng-template #noThread>
          <div class="flex-1 flex items-center justify-center text-ink-500 text-sm">
            Pick a conversation on the left.
          </div>
        </ng-template>
      </section>
    </div>
  `
})
export class MessagingComponent implements OnInit, AfterViewChecked {
  private api = inject(MessagingApi);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  @ViewChild('scrollArea') private scrollArea?: ElementRef<HTMLDivElement>;
  private shouldScroll = false;

  protected conversations = signal<ConversationSummary[]>([]);
  protected messages = signal<ChatMessage[]>([]);
  protected selectedId = signal<string | null>(null);
  protected otherEmail = signal<string | null>(null);
  protected otherUserId = signal<string | null>(null);
  protected draft = '';
  protected sending = signal(false);

  ngOnInit(): void {
    this.api.listConversations().subscribe(list => {
      this.conversations.set(list);
      const id = this.selectedId();
      if (id) {
        const conv = list.find(c => c.id === id);
        if (conv) {
          this.otherEmail.set(conv.otherUserEmail);
          this.otherUserId.set(conv.otherUserId);
        }
      }
    });
    this.route.paramMap.subscribe(p => {
      const id = p.get('id');
      this.selectedId.set(id);
      if (id) this.loadThread(id);
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.scrollArea) {
      this.scrollArea.nativeElement.scrollTop = this.scrollArea.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  private loadThread(id: string): void {
    this.api.messages(id).subscribe({
      next: (msgs) => {
        this.messages.set(msgs);
        const conv = this.conversations().find(c => c.id === id);
        this.otherEmail.set(conv?.otherUserEmail ?? null);
        this.otherUserId.set(conv?.otherUserId ?? null);
        this.shouldScroll = true;
        // Mark as read in background
        this.api.markRead(id).subscribe({ error: () => {} });
      },
      error: (err) => {
        if (err.status === 403) {
          this.toast.error('You do not have access to this conversation.');
        } else {
          this.toast.error('Could not load messages.');
        }
      }
    });
  }

  send(): void {
    const text = this.draft.trim();
    const recipientId = this.otherUserId();
    if (!text || !recipientId) return;
    this.sending.set(true);
    this.api.send(recipientId, text).subscribe({
      next: () => {
        this.sending.set(false);
        this.draft = '';
        const id = this.selectedId();
        if (id) this.loadThread(id);
      },
      error: (err) => {
        this.sending.set(false);
        this.toast.error(err?.error?.message ?? 'Could not send.');
      }
    });
  }

  isMine(m: ChatMessage): boolean {
    return m.senderId === this.auth.currentUser()?.userId;
  }

  initialsOf(email: string | null): string {
    if (!email) return '?';
    return email.slice(0, 2).toUpperCase();
  }
}

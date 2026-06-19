import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FeedService, Post, Comment } from './feed.service';
import { ToastService } from '../../shared/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { ConnectionApi } from '../connection/connection.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ec-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink],
  template: `
    <div class="grid lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <div class="card mb-6">
          <textarea class="field" rows="3" [(ngModel)]="draft"
                    placeholder="Share an update, post a job, or ask for help..."></textarea>

          <!-- Selected images thumbnail preview before posting -->
          <div *ngIf="draftMedia.length" class="flex flex-wrap gap-2 mt-3">
            <div *ngFor="let f of draftMedia; let i = index"
                 class="relative w-24 h-24 rounded-lg overflow-hidden border border-ink-300">
              <img [src]="previewUrl(f)" alt="" class="w-full h-full object-cover" />
              <button class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white
                             text-xs leading-none flex items-center justify-center"
                      (click)="removeDraftMedia(i)" title="Remove">×</button>
            </div>
          </div>

          <div class="flex items-center justify-between mt-3">
            <label class="text-xs text-ink-500 cursor-pointer hover:text-primary">
              📷 Add image / GIF
              <input type="file" accept="image/*" multiple hidden
                     (change)="onDraftMediaFiles($event)" />
            </label>
            <button class="btn-primary" (click)="post()"
                    [disabled]="(!draft && !draftMedia.length) || loading()">
              {{ loading() ? '…' : '+ Post' }}
            </button>
          </div>
        </div>

        <div *ngIf="loading()" class="text-ink-500 text-sm">Loading...</div>
        <div *ngIf="error()" class="text-primary text-sm mb-4">{{ error() }}</div>

        <article *ngFor="let p of posts()" class="card mb-4">
          <div class="flex items-center gap-3 mb-3">
            <img *ngIf="p.authorAvatarUrl" [src]="p.authorAvatarUrl" alt=""
                 class="w-10 h-10 rounded-full object-cover" />
            <div *ngIf="!p.authorAvatarUrl"
                 class="w-10 h-10 rounded-full bg-ink-300 flex items-center justify-center
                        font-mono text-xs text-ink-800">
              {{ initialOf(p.authorName) }}
            </div>
            <div>
              <p class="font-bold text-sm">{{ p.authorName }}</p>
              <p class="text-xs text-ink-500">
                {{ p.createdAt | date:'short' }}
                <span *ngIf="p.originalPostId" class="text-primary"> · 🔁 reposted</span>
              </p>
            </div>
          </div>
          <p class="whitespace-pre-wrap text-ink-800 mb-3">{{ p.content }}</p>

          <!-- Media gallery -->
          <div *ngIf="p.media?.length" class="grid grid-cols-2 gap-2 mb-3"
               [class.grid-cols-1]="p.media.length === 1">
            <a *ngFor="let m of p.media" [href]="m.url" target="_blank"
               class="block rounded-lg overflow-hidden border border-ink-300">
              <img [src]="m.url" alt="" class="w-full max-h-80 object-cover" />
            </a>
          </div>

          <!-- Embedded original (for reposts) -->
          <div *ngIf="p.originalPost as op"
               class="mt-2 mb-3 p-3 rounded-lg border border-ink-300/60 bg-ink-100/40">
            <div class="flex items-center gap-2 mb-1">
              <img *ngIf="op.authorAvatarUrl" [src]="op.authorAvatarUrl"
                   class="w-6 h-6 rounded-full object-cover" alt="" />
              <p class="text-xs font-semibold">{{ op.authorName }}</p>
              <p class="text-xs text-ink-500">{{ op.createdAt | date:'short' }}</p>
            </div>
            <p class="text-sm text-ink-700 whitespace-pre-wrap line-clamp-3">{{ op.content }}</p>
            <div *ngIf="op.media?.length" class="grid grid-cols-2 gap-1 mt-2"
                 [class.grid-cols-1]="op.media.length === 1">
              <img *ngFor="let m of op.media" [src]="m.url" alt=""
                   class="w-full max-h-40 object-cover rounded" />
            </div>
          </div>

          <!-- Action bar -->
          <div class="flex gap-6 text-sm text-ink-600 border-t border-ink-300/40 pt-3">
            <button (click)="react(p)"
                    class="hover:text-primary transition-colors"
                    [class.text-primary]="!!p.myReactionType"
                    [class.font-semibold]="!!p.myReactionType">
              {{ p.myReactionType ? '♥' : '♡' }} {{ p.reactionCount }}
            </button>
            <button (click)="toggleComment(p.id)" class="hover:text-primary">
              💬 {{ p.commentCount }}
            </button>
            <button (click)="repost(p)" class="hover:text-primary"
                    [disabled]="reposting() === p.id">
              🔁 {{ p.shareCount }} {{ reposting() === p.id ? '…' : '' }}
            </button>
            <button (click)="onShare(p)" class="hover:text-primary ml-auto">↗ Copy link</button>
          </div>

          <!-- Inline comment form -->
          <div *ngIf="commentingOn() === p.id" class="mt-3 border-t border-ink-300/30 pt-3">
            <div *ngIf="commentsList[p.id]?.length" class="space-y-2 mb-3">
              <div *ngFor="let c of commentsList[p.id]" class="flex gap-2 text-sm">
                <div class="w-7 h-7 rounded-full bg-ink-300 flex items-center justify-center
                            font-mono text-xs text-ink-800 shrink-0">
                  {{ initialOf(c.authorName) }}
                </div>
                <div class="flex-1 bg-ink-100 rounded-lg px-3 py-2 min-w-0">
                  <div *ngIf="editingCommentId() !== c.id">
                    <div class="flex justify-between gap-2">
                      <p class="font-semibold text-xs text-ink-600">{{ c.authorName }}</p>
                      <div *ngIf="c.authorId === auth.currentUser()?.userId" class="flex gap-1 shrink-0">
                        <button type="button" class="text-[10px] text-ink-500 hover:text-primary"
                                (click)="startEditComment(c)">Edit</button>
                        <button type="button" class="text-[10px] text-primary"
                                (click)="deleteComment(p, c)">Delete</button>
                      </div>
                    </div>
                    <p class="text-ink-800">{{ c.content }}</p>
                  </div>
                  <div *ngIf="editingCommentId() === c.id" class="space-y-2">
                    <textarea class="field text-xs" rows="2" [(ngModel)]="editCommentDraft"></textarea>
                    <div class="flex gap-2">
                      <button type="button" class="btn-primary text-xs"
                              (click)="saveEditComment(p, c)">Save</button>
                      <button type="button" class="btn-secondary text-xs"
                              (click)="cancelEditComment()">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex gap-2">
              <textarea class="field flex-1 text-sm !py-2" rows="2"
                        [(ngModel)]="commentDrafts[p.id]"
                        placeholder="Write a comment..."></textarea>
              <button class="btn-primary text-sm py-2 px-3 self-end"
                      (click)="submitComment(p)"
                      [disabled]="!(commentDrafts[p.id] || '').trim()">Send</button>
            </div>
          </div>
        </article>

        <div *ngIf="!loading() && posts().length === 0" class="card text-center text-ink-500">
          No posts yet. Be the first to share!
        </div>
      </div>

      <aside class="space-y-4">
        <div class="card">
          <p class="text-xs font-mono text-primary mb-3">▸ YOUR NETWORK</p>
          <p class="text-2xl font-display font-bold">
            {{ connectionCount() }}
            <span class="text-sm font-normal text-ink-600">
              connection{{ connectionCount() === 1 ? '' : 's' }}
            </span>
          </p>
          <p class="text-xs text-ink-500 mt-1">
            {{ alumniCount().toLocaleString() }} alumni on EspritConnect
          </p>
          <a routerLink="/network"
             class="text-xs text-primary font-semibold mt-3 inline-block hover:underline">
            Manage your network →
          </a>
        </div>
      </aside>
    </div>
  `
})
export class FeedComponent implements OnInit {
  private feed = inject(FeedService);
  private toast = inject(ToastService);
  protected auth = inject(AuthService);
  private connections = inject(ConnectionApi);
  private http = inject(HttpClient);

  protected posts = signal<Post[]>([]);
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  /** Live "Your network" sidebar counts. */
  protected connectionCount = signal(0);
  protected alumniCount = signal(0);
  protected draft = '';
  protected draftMedia: File[] = [];
  protected reposting = signal<string | null>(null);

  protected commentingOn = signal<string | null>(null);
  protected commentDrafts: Record<string, string> = {};
  protected commentsList: Record<string, Comment[]> = {};
  protected editingCommentId = signal<string | null>(null);
  protected editCommentDraft = '';

  // Local object-URL cache so repeated renders don't leak URL objects.
  private previewUrls = new Map<File, string>();
  previewUrl(f: File): string {
    let u = this.previewUrls.get(f);
    if (!u) { u = URL.createObjectURL(f); this.previewUrls.set(f, u); }
    return u;
  }
  onDraftMediaFiles(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    if (!input.files) return;
    for (const f of Array.from(input.files)) {
      if (f.type.startsWith('image/') && f.size <= 8 * 1024 * 1024) {
        this.draftMedia.push(f);
      } else {
        this.toast.error(`${f.name}: must be an image under 8 MB.`);
      }
    }
    input.value = '';   // allow re-selecting same files
  }
  removeDraftMedia(i: number): void {
    const f = this.draftMedia[i];
    const u = this.previewUrls.get(f);
    if (u) { URL.revokeObjectURL(u); this.previewUrls.delete(f); }
    this.draftMedia.splice(i, 1);
  }

  protected initialOf(name?: string | null): string {
    return (name ?? '').charAt(0).toUpperCase();
  }

  toggleComment(postId: string): void {
    if (this.commentingOn() === postId) {
      this.commentingOn.set(null);
      return;
    }
    this.commentingOn.set(postId);
    this.feed.comments(postId).subscribe({
      next: (cs) => { this.commentsList[postId] = cs; }
    });
  }

  startEditComment(c: Comment): void {
    this.editCommentDraft = c.content;
    this.editingCommentId.set(c.id);
  }

  cancelEditComment(): void {
    this.editingCommentId.set(null);
    this.editCommentDraft = '';
  }

  saveEditComment(p: Post, c: Comment): void {
    const content = this.editCommentDraft.trim();
    if (!content) return;
    this.feed.updateComment(c.id, content).subscribe({
      next: (updated) => {
        this.commentsList[p.id] = (this.commentsList[p.id] ?? []).map(x =>
          x.id === c.id ? updated : x);
        this.cancelEditComment();
        this.toast.success('Comment updated.');
      },
      error: () => this.toast.error('Could not update comment.')
    });
  }

  deleteComment(p: Post, c: Comment): void {
    if (!confirm('Delete this comment?')) return;
    this.feed.deleteComment(c.id).subscribe({
      next: () => {
        this.commentsList[p.id] = (this.commentsList[p.id] ?? []).filter(x => x.id !== c.id);
        this.posts.update(all => all.map(post =>
          post.id === p.id
            ? { ...post, commentCount: Math.max(0, post.commentCount - 1) }
            : post
        ));
        this.toast.info('Comment deleted.');
      },
      error: () => this.toast.error('Could not delete comment.')
    });
  }

  submitComment(p: Post): void {
    const body = (this.commentDrafts[p.id] ?? '').trim();
    if (!body) return;
    this.feed.comment(p.id, body).subscribe({
      next: (c) => {
        this.commentDrafts[p.id] = '';
        this.commentsList[p.id] = [...(this.commentsList[p.id] ?? []), c];
        this.posts.update(all => all.map(post =>
          post.id === p.id ? { ...post, commentCount: post.commentCount + 1 } : post
        ));
        this.toast.success('Comment posted.');
      },
      error: () => this.toast.error('Could not post comment.')
    });
  }

  onShare(p: Post): void {
    const url = `${window.location.origin}/feed#${p.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => this.toast.success('Post link copied.'))
        .catch(() => this.toast.info(url));
    } else {
      this.toast.info(url);
    }
  }

  ngOnInit(): void {
    this.refresh();
    this.loadNetworkStats();
  }

  /** Populates the "Your network" sidebar with real, dynamic numbers:
   *  the viewer's accepted connections and the total alumni on the
   *  platform (profiles total). Failures fall back to 0 silently. */
  private loadNetworkStats(): void {
    this.connections.counts().subscribe({
      next: (c) => this.connectionCount.set(c.accepted),
      error: () => {},
    });
    this.http.get<{ totalElements?: number }>(`${environment.apiUrl}/profiles?size=1`).subscribe({
      next: (r) => this.alumniCount.set(r.totalElements ?? 0),
      error: () => {},
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.feed.list().subscribe({
      next: (page) => { this.posts.set(page.content); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Failed to load feed');
      }
    });
  }

  post(): void {
    // Allow image-only posts (LinkedIn-style) — content may be empty if the
    // user only attached images.
    if (!this.draft.trim() && !this.draftMedia.length) return;
    this.loading.set(true);
    this.feed.create(this.draft.trim() || '').subscribe({
      next: async (created) => {
        // Upload each selected file sequentially. Sequential keeps server
        // load predictable and avoids racy attachment ordering.
        for (const f of this.draftMedia) {
          try {
            await new Promise<void>((resolve, reject) =>
              this.feed.attachMedia(created.id, f).subscribe({
                next: () => resolve(),
                error: (e) => reject(e),
              }));
          } catch {
            this.toast.error(`Failed to upload ${f.name}`);
          }
        }
        // Clear draft state + revoke object URLs.
        this.draft = '';
        for (const [, u] of this.previewUrls) URL.revokeObjectURL(u);
        this.previewUrls.clear();
        this.draftMedia = [];
        this.refresh();
        this.toast.success('Posted.');
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not post.');
      }
    });
  }

  repost(p: Post): void {
    const note = prompt(`Repost "${p.content.slice(0, 80)}"...
Add a comment (optional):`);
    if (note === null) return;     // user cancelled
    this.reposting.set(p.id);
    this.feed.repost(p.id, note).subscribe({
      next: () => {
        this.reposting.set(null);
        this.refresh();
        this.toast.success('Reposted to your feed.');
      },
      error: (err) => {
        this.reposting.set(null);
        this.toast.error(err?.error?.message ?? 'Could not repost.');
      }
    });
  }

  react(p: Post): void {
    this.feed.react(p.id).subscribe({
      next: () => {
        this.posts.update(all => all.map(post => {
          if (post.id !== p.id) return post;
          const wasLiked = !!post.myReactionType;
          return {
            ...post,
            myReactionType: wasLiked ? undefined : 'LIKE',
            reactionCount: wasLiked ? post.reactionCount - 1 : post.reactionCount + 1
          };
        }));
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Could not react.')
    });
  }
}

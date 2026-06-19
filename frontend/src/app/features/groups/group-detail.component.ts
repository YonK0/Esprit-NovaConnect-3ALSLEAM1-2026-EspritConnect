import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';
import { FeedService, Post, Comment } from '../feed/feed.service';
import { AuthService } from '../../core/services/auth.service';

interface Group {
  id: string; name: string; type: string; description?: string | null;
  isPrivate: boolean; coverUrl?: string | null; avatarUrl?: string | null;
  ownerId: string; ownerName: string; ownerAvatarUrl?: string | null;
  memberCount: number; postCount: number;
  isMember: boolean; isOwner: boolean; canViewContent: boolean;
  hasPendingRequest: boolean;
  hasPendingInvite: boolean;
  pendingInviteId?: string | null;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface ProfileSearchHit {
  userId: string; firstName: string; lastName: string;
  headline?: string | null; avatarUrl?: string | null;
}

interface SelectedInvitee {
  userId: string; name: string; avatarUrl?: string | null;
}

interface Member {
  userId: string; name: string; email: string; avatarUrl?: string | null;
  headline?: string; role: 'OWNER' | 'MEMBER'; joinedAt: string;
}

interface JoinRequest {
  id: string; userId: string; email: string; name: string;
  status: string; createdAt: string;
}

@Component({
  selector: 'ec-group-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DatePipe],
  template: `
    <a routerLink="/groups" class="text-sm text-ink-500 hover:text-primary mb-4 inline-block">
      ← All groups
    </a>

    <div *ngIf="loading()" class="card text-ink-500">Loading…</div>
    <div *ngIf="error()" class="card text-primary">{{ error() }}</div>

    <ng-container *ngIf="group() as g">
      <section class="rounded-xl overflow-hidden bg-white border border-ink-300/40 shadow-sm mb-6">
        <div class="relative h-40 sm:h-44 w-full overflow-hidden
                    bg-gradient-to-r from-ink-800 via-primary/70 to-ink-700">
          <img *ngIf="g.coverUrl && !coverBroken()"
               [src]="g.coverUrl" alt="Cover"
               class="absolute inset-0 w-full h-full object-cover"
               (error)="coverBroken.set(true)" />
          <label *ngIf="g.isOwner"
                 class="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-lg text-xs font-medium
                        cursor-pointer bg-white/95 text-ink-800 shadow hover:bg-white">
            Change cover
            <input type="file" accept="image/*" hidden (change)="uploadCover($event)" />
          </label>
        </div>

        <!-- Avatar overlaps cover only; title stays on white background below -->
        <div class="relative px-5 sm:px-6 pb-5 pt-4 bg-white">
          <div class="absolute left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0
                      -top-12 sm:-top-14 z-10">
            <div class="relative shrink-0">
              <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-md
                          overflow-hidden bg-ink-100 flex items-center justify-center">
                <img *ngIf="g.avatarUrl && !avatarBroken()"
                     [src]="g.avatarUrl" alt="Group photo"
                     class="w-full h-full object-cover"
                     (error)="avatarBroken.set(true)" />
                <span *ngIf="!g.avatarUrl || avatarBroken()"
                      class="font-display text-3xl font-bold text-primary">
                  {{ initialOf(g.name) }}
                </span>
              </div>
              <label *ngIf="g.isOwner"
                     class="absolute bottom-1 right-1 z-10 px-2 py-1 rounded-full text-[10px]
                            cursor-pointer bg-white border border-ink-300 shadow"
                     title="Change group photo">
                📷
                <input type="file" accept="image/*" hidden (change)="uploadAvatar($event)" />
              </label>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4
                      pt-14 sm:pt-2 sm:pl-36 min-h-[5.5rem]">
            <div class="flex-1 text-center sm:text-left min-w-0">
              <h1 class="font-display text-2xl sm:text-3xl font-bold break-words">{{ g.name }}</h1>
              <div class="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                <span class="px-3 py-0.5 rounded-full text-xs font-mono bg-ink-100 text-ink-600
                             border border-ink-300">
                  {{ typeTag(g.type) }}
                </span>
                <span *ngIf="g.isPrivate" class="text-xs chip-yellow">🔒 Private</span>
              </div>
            </div>

            <div class="flex flex-wrap justify-center sm:justify-end gap-2 shrink-0">
              <button *ngIf="g.isMember && g.moderationStatus === 'APPROVED'"
                      type="button" class="btn-secondary text-sm" (click)="openInviteModal()">
                ↗ Invite
              </button>
              <button *ngIf="g.hasPendingInvite" class="btn-primary text-sm"
                      [disabled]="acting()" (click)="acceptInvite()">
                Accept invitation
              </button>
              <button *ngIf="g.hasPendingInvite" class="btn-secondary text-sm"
                      [disabled]="acting()" (click)="declineInvite()">
                Decline
              </button>
              <button *ngIf="canJoin()" class="btn-primary text-sm"
                      [disabled]="acting()" (click)="join()">
                {{ joinButtonLabel() }}
              </button>
              <button *ngIf="g.isMember && !g.isOwner" class="btn-secondary text-sm"
                      [disabled]="acting()" (click)="leave()">
                Leave
              </button>
              <button *ngIf="g.hasPendingRequest" class="btn-secondary text-sm"
                      [disabled]="acting()" (click)="cancelJoinRequest()">
                Cancel request
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Stats strip -->
      <div class="flex flex-wrap gap-4 mb-6 text-sm">
        <span class="chip">{{ g.memberCount }} members</span>
        <span class="chip">{{ g.postCount }} posts</span>
        <span class="chip"
              [class.chip-yellow]="g.moderationStatus === 'PENDING'"
              [class.chip-red]="g.moderationStatus === 'REJECTED'">
          {{ g.moderationStatus }}
        </span>
      </div>

      <div class="grid lg:grid-cols-3 gap-6">
        <!-- Left: description + feed -->
        <div class="lg:col-span-2 space-y-6">
          <div class="card">
            <h2 class="font-display text-lg font-bold mb-3">Description</h2>
            <p *ngIf="g.description" class="text-ink-700 whitespace-pre-wrap">{{ g.description }}</p>
            <p *ngIf="!g.description && g.canViewContent" class="text-ink-500 italic text-sm">
              No description yet.
            </p>
            <p *ngIf="!g.canViewContent" class="text-ink-500 italic text-sm">
              Join this private group to see the description and posts.
            </p>
          </div>

          <!-- Post composer (members) -->
          <div *ngIf="g.isMember" class="card">
            <p class="text-xs font-mono text-primary mb-2">▸ POST IN GROUP</p>
            <textarea class="field" rows="3" [(ngModel)]="postDraft"
                      placeholder="Share an update, resource, or question…"></textarea>
            <div *ngIf="postMedia.length" class="mt-3 space-y-2">
              <p class="text-xs text-ink-500">Images to post:</p>
              <div class="flex flex-wrap gap-3">
                <div *ngFor="let f of postMedia; let i = index"
                     class="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-ink-300">
                  <img [src]="mediaPreview(f)" alt="" class="w-full h-full object-cover" />
                  <button type="button"
                          class="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[10px] py-1"
                          (click)="removePostMedia(i)">
                    Remove
                  </button>
                </div>
              </div>
            </div>
            <div class="flex justify-between mt-3">
              <label class="text-xs text-ink-500 cursor-pointer hover:text-primary">
                📷 Image
                <input type="file" accept="image/*" multiple hidden
                       (change)="onPostMedia($event)" />
              </label>
              <button class="btn-primary" [disabled]="posting() || (!postDraft.trim() && !postMedia.length)"
                      (click)="submitPost()">
                {{ posting() ? '…' : 'Post' }}
              </button>
            </div>
          </div>

          <!-- Group feed -->
          <section *ngIf="g.canViewContent">
            <h2 class="font-display text-lg font-bold mb-3">Group feed</h2>
            <div *ngIf="loadingPosts()" class="card text-ink-500 text-sm">Loading…</div>

            <article *ngFor="let p of posts()" class="card mb-4">
              <div class="flex items-start justify-between gap-2 mb-3">
                <div class="flex items-center gap-3 min-w-0">
                  <a [routerLink]="['/profiles', p.authorId]" class="shrink-0">
                    <img *ngIf="p.authorAvatarUrl" [src]="p.authorAvatarUrl" alt=""
                         class="w-10 h-10 rounded-full object-cover" />
                    <div *ngIf="!p.authorAvatarUrl"
                         class="w-10 h-10 rounded-full bg-ink-300 flex items-center justify-center font-mono text-xs">
                      {{ initialOf(p.authorName) }}
                    </div>
                  </a>
                  <div class="min-w-0">
                    <a [routerLink]="['/profiles', p.authorId]"
                       class="font-bold text-sm hover:text-primary">{{ p.authorName }}</a>
                    <p class="text-xs text-ink-500">{{ p.createdAt | date:'medium' }}</p>
                  </div>
                </div>
                <div *ngIf="isMyPost(p)" class="flex gap-1 shrink-0">
                  <button *ngIf="editingPostId() !== p.id" type="button"
                          class="text-xs text-ink-500 hover:text-primary px-2 py-1"
                          (click)="startEditPost(p)">Edit</button>
                  <button type="button"
                          class="text-xs text-primary hover:underline px-2 py-1"
                          (click)="deletePost(p)">Delete</button>
                </div>
              </div>

              <div *ngIf="editingPostId() === p.id" class="mb-3 space-y-2">
                <textarea class="field text-sm" rows="3" [(ngModel)]="editDraft"></textarea>
                <div *ngIf="p.media?.length" class="flex flex-wrap gap-2">
                  <div *ngFor="let m of p.media" class="relative w-24 h-24 rounded-lg overflow-hidden border">
                    <img [src]="m.url" alt="" class="w-full h-full object-cover" />
                    <button *ngIf="m.id" type="button"
                            class="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[10px] py-1"
                            (click)="removePostAttachment(p, m.id!)">
                      Remove image
                    </button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button class="btn-primary text-sm" (click)="saveEditPost(p)">Save</button>
                  <button class="btn-secondary text-sm" (click)="cancelEditPost()">Cancel</button>
                </div>
              </div>

              <ng-container *ngIf="editingPostId() !== p.id">
                <p *ngIf="displayContent(p)" class="whitespace-pre-wrap text-ink-800 mb-3">
                  {{ displayContent(p) }}
                </p>
                <div *ngIf="p.media?.length" class="grid gap-2 mb-3"
                     [class.grid-cols-2]="p.media.length > 1">
                  <img *ngFor="let m of p.media" [src]="m.url" alt=""
                       class="rounded-lg w-full max-h-64 object-contain bg-ink-50" />
                </div>
              </ng-container>

              <div class="flex gap-4 text-sm text-ink-600 border-t border-ink-300/40 pt-3">
                <button type="button" (click)="react(p)"
                        [class.text-primary]="!!p.myReactionType">
                  {{ p.myReactionType ? '♥' : '♡' }} {{ p.reactionCount }}
                </button>
                <button type="button" (click)="toggleComment(p.id)">
                  💬 {{ p.commentCount }}
                </button>
              </div>
              <div *ngIf="commentingOn() === p.id" class="mt-3 pt-3 border-t border-ink-300/30">
                <div *ngFor="let c of commentsFor(p.id)"
                     class="text-sm mb-3 pl-2 border-l-2 border-ink-200">
                  <div *ngIf="editingCommentId() !== c.id" class="flex justify-between gap-2">
                    <p class="min-w-0">
                      <span class="font-semibold">{{ c.authorName }}</span>
                      <span class="text-ink-700"> — {{ c.content }}</span>
                    </p>
                    <div *ngIf="isMyComment(c)" class="flex gap-1 shrink-0">
                      <button type="button" class="text-[10px] text-ink-500 hover:text-primary"
                              (click)="startEditComment(c)">Edit</button>
                      <button type="button" class="text-[10px] text-primary hover:underline"
                              (click)="deleteComment(p, c)">Delete</button>
                    </div>
                  </div>
                  <div *ngIf="editingCommentId() === c.id" class="space-y-2">
                    <textarea class="field text-sm" rows="2" [(ngModel)]="editCommentDraft"></textarea>
                    <div class="flex gap-2">
                      <button type="button" class="btn-primary text-xs"
                              (click)="saveEditComment(p, c)">Save</button>
                      <button type="button" class="btn-secondary text-xs"
                              (click)="cancelEditComment()">Cancel</button>
                    </div>
                  </div>
                </div>
                <div class="flex gap-2 mt-2">
                  <input class="field flex-1 text-sm" [(ngModel)]="commentDrafts[p.id]"
                         placeholder="Add a comment…" />
                  <button class="btn-primary text-sm" (click)="submitComment(p)">Send</button>
                </div>
              </div>
            </article>

            <p *ngIf="!loadingPosts() && !posts().length"
               class="card text-center text-ink-500 text-sm">
              No posts yet. Be the first to post!
            </p>
          </section>

          <p *ngIf="!g.canViewContent" class="card text-ink-500 text-sm text-center">
            The feed is only visible to members of this private group.
          </p>
        </div>

        <!-- Right sidebar -->
        <aside class="space-y-4">
          <!-- Administrators -->
          <div class="card">
            <h2 class="font-display text-lg font-bold mb-4">Administrators</h2>
            <div *ngFor="let m of administrators()" class="flex items-center gap-3 mb-4 last:mb-0">
              <a [routerLink]="['/profiles', m.userId]" class="shrink-0">
                <img *ngIf="m.avatarUrl" [src]="m.avatarUrl" alt=""
                     class="w-12 h-12 rounded-full object-cover" />
                <div *ngIf="!m.avatarUrl"
                     class="w-12 h-12 rounded-full bg-ink-300 flex items-center justify-center font-mono text-sm">
                  {{ initialOf(m.name) }}
                </div>
              </a>
              <div class="min-w-0">
                <a [routerLink]="['/profiles', m.userId]"
                   class="font-semibold text-sm hover:text-primary block truncate">{{ m.name }}</a>
                <p *ngIf="m.headline" class="text-xs text-ink-500 truncate">{{ m.headline }}</p>
                <p class="text-xs font-mono text-primary mt-0.5">
                  {{ m.role === 'OWNER' ? 'Group creator' : 'Administrator' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Members -->
          <div class="card" *ngIf="g.canViewContent && members().length">
            <h2 class="font-display text-lg font-bold mb-3">
              Members
              <span class="text-ink-500 font-normal text-sm">({{ members().length }})</span>
            </h2>
            <ul class="space-y-3 max-h-80 overflow-y-auto">
              <li *ngFor="let m of members()" class="flex items-center gap-2">
                <a [routerLink]="['/profiles', m.userId]" class="shrink-0">
                  <img *ngIf="m.avatarUrl" [src]="m.avatarUrl" alt=""
                       class="w-9 h-9 rounded-full object-cover" />
                  <div *ngIf="!m.avatarUrl"
                       class="w-9 h-9 rounded-full bg-ink-200 flex items-center justify-center text-xs font-mono">
                    {{ initialOf(m.name) }}
                  </div>
                </a>
                <div class="min-w-0 flex-1">
                  <a [routerLink]="['/profiles', m.userId]"
                     class="text-sm font-medium hover:text-primary truncate block">{{ m.name }}</a>
                  <p *ngIf="m.headline" class="text-[10px] text-ink-500 truncate">{{ m.headline }}</p>
                </div>
              </li>
            </ul>
          </div>

          <!-- Owner: pending requests -->
          <div *ngIf="g.isOwner && pendingRequests().length" class="card border-primary/30">
            <h2 class="font-display text-lg font-bold mb-3">Join requests</h2>
            <article *ngFor="let r of pendingRequests()"
                     class="flex items-center justify-between gap-2 py-2 border-b border-ink-200 last:border-0">
              <div class="min-w-0">
                <p class="text-sm font-semibold truncate">{{ r.name }}</p>
                <p class="text-[10px] text-ink-500 truncate">{{ r.email }}</p>
              </div>
              <div class="flex gap-1 shrink-0">
                <button class="btn-primary text-[10px] px-2 py-1"
                        [disabled]="actingRequest()[r.id]" (click)="approve(r)">✓</button>
                <button class="btn-secondary text-[10px] px-2 py-1"
                        [disabled]="actingRequest()[r.id]" (click)="reject(r)">✕</button>
              </div>
            </article>
          </div>

        </aside>
      </div>

      <!-- Invite modal -->
      <div *ngIf="inviteModalOpen()"
           class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
           (click)="closeInviteModal()">
        <div class="card w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl"
             (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-display text-lg font-bold">Invite members</h2>
            <button type="button" class="text-ink-500 hover:text-ink-800 text-xl leading-none"
                    (click)="closeInviteModal()">×</button>
          </div>
          <p class="text-sm text-ink-600 mb-3">
            Search Esprit Connect users and send them an invitation to join
            <strong>{{ g.name }}</strong>.
          </p>
          <input class="field mb-3" type="search"
                 placeholder="Search by name…"
                 [(ngModel)]="inviteQuery"
                 (ngModelChange)="onInviteSearchChange()" />

          <div *ngIf="selectedInvitees().length" class="flex flex-wrap gap-2 mb-3">
            <span *ngFor="let u of selectedInvitees()"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs
                         bg-primary/10 text-ink-800 border border-primary/20">
              {{ u.name }}
              <button type="button" class="text-ink-500 hover:text-primary"
                      (click)="removeInvitee(u.userId)">×</button>
            </span>
          </div>

          <div class="flex-1 overflow-y-auto min-h-[8rem] max-h-64 border border-ink-300/40 rounded-lg">
            <p *ngIf="inviteSearching()" class="p-4 text-sm text-ink-500">Searching…</p>
            <p *ngIf="!inviteSearching() && inviteQuery.trim().length < 2"
               class="p-4 text-sm text-ink-500">Type at least 2 characters to search.</p>
            <p *ngIf="!inviteSearching() && inviteQuery.trim().length >= 2 && !inviteResults().length"
               class="p-4 text-sm text-ink-500">No users found.</p>
            <button *ngFor="let p of inviteResults()" type="button"
                    class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-ink-50
                           border-b border-ink-300/30 last:border-0"
                    [class.bg-ink-50]="isInviteeSelected(p.userId)"
                    (click)="toggleInvitee(p)">
              <img *ngIf="p.avatarUrl" [src]="p.avatarUrl" alt=""
                   class="w-10 h-10 rounded-full object-cover shrink-0" />
              <div *ngIf="!p.avatarUrl"
                   class="w-10 h-10 rounded-full bg-ink-200 flex items-center justify-center
                          font-mono text-xs shrink-0">
                {{ profileInitials(p) }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-sm truncate">{{ profileName(p) }}</p>
                <p *ngIf="p.headline" class="text-xs text-ink-500 truncate">{{ p.headline }}</p>
              </div>
              <span *ngIf="isInviteeSelected(p.userId)"
                    class="text-primary text-sm shrink-0">✓</span>
            </button>
          </div>

          <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-ink-300/40">
            <button type="button" class="btn-secondary text-sm" (click)="closeInviteModal()">
              Cancel
            </button>
            <button type="button" class="btn-primary text-sm"
                    [disabled]="!selectedInvitees().length || sendingInvites()"
                    (click)="sendInvites()">
              {{ sendingInvites() ? 'Sending…' : 'Send invitations (' + selectedInvitees().length + ')' }}
            </button>
          </div>
        </div>
      </div>
    </ng-container>
  `
})
export class GroupDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private feed = inject(FeedService);
  private auth = inject(AuthService);

  protected coverBroken = signal(false);
  protected avatarBroken = signal(false);
  protected editingPostId = signal<string | null>(null);
  protected editDraft = '';
  protected editingCommentId = signal<string | null>(null);
  protected editCommentDraft = '';

  protected loading = signal(true);
  protected error = signal<string | null>(null);
  protected group = signal<Group | null>(null);
  protected members = signal<Member[]>([]);
  protected posts = signal<Post[]>([]);
  protected loadingPosts = signal(false);
  protected acting = signal(false);
  protected posting = signal(false);
  protected pendingRequests = signal<JoinRequest[]>([]);
  protected actingRequest = signal<Record<string, boolean>>({});

  protected inviteModalOpen = signal(false);
  protected inviteQuery = '';
  protected inviteSearching = signal(false);
  protected inviteResults = signal<ProfileSearchHit[]>([]);
  protected selectedInvitees = signal<SelectedInvitee[]>([]);
  protected sendingInvites = signal(false);
  private inviteSearchTimer?: ReturnType<typeof setTimeout>;

  protected postDraft = '';
  protected postMedia: File[] = [];
  private mediaUrls = new Map<File, string>();

  protected commentingOn = signal<string | null>(null);
  protected commentDrafts: Record<string, string> = {};
  private commentsCache: Record<string, Comment[]> = {};

  private groupId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  protected administrators = computed(() =>
    this.members().filter(m => m.role === 'OWNER')
  );

  ngOnInit(): void { this.load(); }

  load(): void {
    const id = this.groupId();
    if (!id) {
      this.error.set('Group not found.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.http.get<Group>(`${environment.apiUrl}/groups/${id}`).subscribe({
      next: (g) => {
        this.coverBroken.set(false);
        this.avatarBroken.set(false);
        this.group.set(g);
        this.loading.set(false);
        this.loadMembers(id);
        if (g.canViewContent) this.loadPosts(id);
        if (g.isOwner) this.loadJoinRequests(id);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Could not load group.');
      }
    });
  }

  loadMembers(groupId: string): void {
    this.http.get<Member[]>(`${environment.apiUrl}/groups/${groupId}/members`).subscribe({
      next: (list) => this.members.set(list ?? []),
      error: () => {}
    });
  }

  loadPosts(groupId: string): void {
    this.loadingPosts.set(true);
    this.feed.listForGroup(groupId).subscribe({
      next: (page) => {
        this.posts.set(page.content ?? []);
        this.loadingPosts.set(false);
      },
      error: () => this.loadingPosts.set(false)
    });
  }

  loadJoinRequests(groupId: string): void {
    this.http.get<JoinRequest[]>(
      `${environment.apiUrl}/groups/${groupId}/join-requests`
    ).subscribe({
      next: (list) => this.pendingRequests.set(list ?? []),
      error: () => {}
    });
  }

  uploadCover(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file || !this.group()) return;
    const form = new FormData();
    form.append('file', file);
    this.http.post<Group>(
      `${environment.apiUrl}/groups/${this.group()!.id}/cover`, form
    ).subscribe({
      next: (g) => {
        this.coverBroken.set(false);
        this.group.set(g);
        this.toast.success('Cover updated.');
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Upload failed.')
    });
  }

  uploadAvatar(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file || !this.group()) return;
    const form = new FormData();
    form.append('file', file);
    this.http.post<Group>(
      `${environment.apiUrl}/groups/${this.group()!.id}/avatar`, form
    ).subscribe({
      next: (g) => {
        this.avatarBroken.set(false);
        this.group.set(g);
        this.toast.success('Group photo updated.');
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Upload failed.')
    });
  }

  copyInviteLink(): void {
    const url = `${window.location.origin}/groups/${this.group()?.id}`;
    navigator.clipboard?.writeText(url)
      .then(() => this.toast.success('Group link copied!'))
      .catch(() => this.toast.info(url));
  }

  openInviteModal(): void {
    this.inviteQuery = '';
    this.inviteResults.set([]);
    this.selectedInvitees.set([]);
    this.inviteModalOpen.set(true);
  }

  closeInviteModal(): void {
    this.inviteModalOpen.set(false);
    if (this.inviteSearchTimer) clearTimeout(this.inviteSearchTimer);
  }

  onInviteSearchChange(): void {
    if (this.inviteSearchTimer) clearTimeout(this.inviteSearchTimer);
    const q = this.inviteQuery.trim();
    if (q.length < 2) {
      this.inviteResults.set([]);
      this.inviteSearching.set(false);
      return;
    }
    this.inviteSearching.set(true);
    this.inviteSearchTimer = setTimeout(() => this.searchInviteUsers(q), 300);
  }

  searchInviteUsers(q: string): void {
    const params = new URLSearchParams({ q, size: '15' });
    this.http.get<{ content: ProfileSearchHit[] }>(
      `${environment.apiUrl}/profiles?${params}`
    ).subscribe({
      next: (r) => {
        const memberIds = new Set(this.members().map(m => m.userId));
        const selectedIds = new Set(this.selectedInvitees().map(u => u.userId));
        const myId = this.auth.currentUser()?.userId;
        this.inviteResults.set((r.content ?? []).filter(p =>
          p.userId !== myId && !memberIds.has(p.userId) && !selectedIds.has(p.userId)
        ));
        this.inviteSearching.set(false);
      },
      error: () => {
        this.inviteSearching.set(false);
        this.toast.error('Search failed.');
      }
    });
  }

  profileName(p: ProfileSearchHit): string {
    return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'User';
  }

  profileInitials(p: ProfileSearchHit): string {
    return `${(p.firstName?.[0] ?? '').toUpperCase()}${(p.lastName?.[0] ?? '').toUpperCase()}` || '?';
  }

  isInviteeSelected(userId: string): boolean {
    return this.selectedInvitees().some(u => u.userId === userId);
  }

  toggleInvitee(p: ProfileSearchHit): void {
    if (this.isInviteeSelected(p.userId)) {
      this.removeInvitee(p.userId);
      return;
    }
    this.selectedInvitees.update(list => [
      ...list,
      { userId: p.userId, name: this.profileName(p), avatarUrl: p.avatarUrl }
    ]);
    this.inviteResults.update(list => list.filter(x => x.userId !== p.userId));
  }

  removeInvitee(userId: string): void {
    this.selectedInvitees.update(list => list.filter(u => u.userId !== userId));
  }

  sendInvites(): void {
    const g = this.group();
    const userIds = this.selectedInvitees().map(u => u.userId);
    if (!g || !userIds.length) return;
    this.sendingInvites.set(true);
    this.http.post<{ sent: number; skipped: number }>(
      `${environment.apiUrl}/groups/${g.id}/invites`,
      { userIds }
    ).subscribe({
      next: (res) => {
        this.sendingInvites.set(false);
        this.closeInviteModal();
        if (res.sent > 0) {
          this.toast.success(
            res.sent === 1 ? '1 invitation sent.' : `${res.sent} invitations sent.`
          );
        } else {
          this.toast.info('No new invitations sent (users may already be members or invited).');
        }
      },
      error: (err) => {
        this.sendingInvites.set(false);
        this.toast.error(err?.error?.message ?? 'Could not send invitations.');
      }
    });
  }

  acceptInvite(): void {
    const g = this.group();
    if (!g?.pendingInviteId) return;
    this.acting.set(true);
    this.http.post(`${environment.apiUrl}/groups/invites/${g.pendingInviteId}/accept`, {})
      .subscribe({
        next: () => {
          this.acting.set(false);
          this.toast.success('You joined the group!');
          this.load();
        },
        error: (err) => {
          this.acting.set(false);
          this.toast.error(err?.error?.message ?? 'Could not accept invitation.');
        }
      });
  }

  declineInvite(): void {
    const g = this.group();
    if (!g?.pendingInviteId) return;
    this.acting.set(true);
    this.http.post(`${environment.apiUrl}/groups/invites/${g.pendingInviteId}/decline`, {})
      .subscribe({
        next: () => {
          this.acting.set(false);
          this.toast.success('Invitation declined.');
          this.load();
        },
        error: (err) => {
          this.acting.set(false);
          this.toast.error(err?.error?.message ?? 'Could not decline invitation.');
        }
      });
  }

  canJoin(): boolean {
    const g = this.group();
    return !!g && !g.isMember && !g.isOwner && g.moderationStatus === 'APPROVED'
           && !g.hasPendingRequest && !g.hasPendingInvite;
  }

  joinButtonLabel(): string {
    return this.group()?.isPrivate ? 'Request to join' : 'Join';
  }

  join(): void {
    const g = this.group();
    if (!g) return;
    this.acting.set(true);
    this.http.post(`${environment.apiUrl}/groups/${g.id}/members`, {}).subscribe({
      next: () => {
        this.acting.set(false);
        this.toast.success(g.isPrivate ? 'Request sent to the owner.' : 'You joined the group.');
        this.load();
      },
      error: (err) => {
        this.acting.set(false);
        this.toast.error(err?.error?.message ?? 'Could not join.');
      }
    });
  }

  cancelJoinRequest(): void {
    const g = this.group();
    if (!g) return;
    this.acting.set(true);
    this.http.delete(`${environment.apiUrl}/groups/${g.id}/join-request`).subscribe({
      next: () => {
        this.acting.set(false);
        this.toast.success('Join request cancelled.');
        this.load();
      },
      error: (err) => {
        this.acting.set(false);
        this.toast.error(err?.error?.message ?? 'Could not cancel request.');
      }
    });
  }

  leave(): void {
    const g = this.group();
    if (!g || !confirm(`Leave ${g.name}?`)) return;
    this.acting.set(true);
    this.http.delete(`${environment.apiUrl}/groups/${g.id}/members`).subscribe({
      next: () => {
        this.acting.set(false);
        this.toast.info(`You left ${g.name}.`);
        this.load();
      },
      error: (err) => {
        this.acting.set(false);
        this.toast.error(err?.error?.message ?? 'Could not leave.');
      }
    });
  }

  approve(r: JoinRequest): void {
    this.actingRequest.update(s => ({ ...s, [r.id]: true }));
    this.http.post(`${environment.apiUrl}/groups/join-requests/${r.id}/approve`, {})
      .subscribe({
        next: () => {
          this.actingRequest.update(s => ({ ...s, [r.id]: false }));
          this.pendingRequests.update(l => l.filter(x => x.id !== r.id));
          this.toast.success(`${r.name} joined the group.`);
          this.load();
        },
        error: (err) => {
          this.actingRequest.update(s => ({ ...s, [r.id]: false }));
          this.toast.error(err?.error?.message ?? 'Something went wrong.');
        }
      });
  }

  reject(r: JoinRequest): void {
    this.actingRequest.update(s => ({ ...s, [r.id]: true }));
    this.http.post(`${environment.apiUrl}/groups/join-requests/${r.id}/reject`, {})
      .subscribe({
        next: () => {
          this.actingRequest.update(s => ({ ...s, [r.id]: false }));
          this.pendingRequests.update(l => l.filter(x => x.id !== r.id));
          this.toast.info('Request declined.');
        },
        error: (err) => {
          this.actingRequest.update(s => ({ ...s, [r.id]: false }));
          this.toast.error(err?.error?.message ?? 'Something went wrong.');
        }
      });
  }

  onPostMedia(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    if (!input.files) return;
    for (const f of Array.from(input.files)) {
      if (f.type.startsWith('image/') && f.size <= 8 * 1024 * 1024) {
        this.postMedia.push(f);
      }
    }
    input.value = '';
  }

  mediaPreview(f: File): string {
    let u = this.mediaUrls.get(f);
    if (!u) { u = URL.createObjectURL(f); this.mediaUrls.set(f, u); }
    return u;
  }

  removePostMedia(i: number): void {
    const f = this.postMedia[i];
    const u = this.mediaUrls.get(f);
    if (u) URL.revokeObjectURL(u);
    this.mediaUrls.delete(f);
    this.postMedia.splice(i, 1);
  }

  submitPost(): void {
    const g = this.group();
    if (!g || (!this.postDraft.trim() && !this.postMedia.length)) return;
    this.posting.set(true);
    this.feed.create(this.postDraft.trim() || '📷', 'NETWORK', g.id).subscribe({
      next: async (created) => {
        for (const f of this.postMedia) {
          await new Promise<void>((resolve, reject) =>
            this.feed.attachMedia(created.id, f).subscribe({
              next: () => resolve(),
              error: (e) => reject(e)
            }));
        }
        this.postDraft = '';
        this.postMedia = [];
        for (const [, u] of this.mediaUrls) URL.revokeObjectURL(u);
        this.mediaUrls.clear();
        this.posting.set(false);
        this.loadPosts(g.id);
        this.toast.success('Post added.');
      },
      error: (err) => {
        this.posting.set(false);
        this.toast.error(err?.error?.message ?? 'Could not post.');
      }
    });
  }

  react(p: Post): void {
    this.feed.react(p.id).subscribe({
      next: () => {
        this.posts.update(all => all.map(post => {
          if (post.id !== p.id) return post;
          const liked = !!post.myReactionType;
          return {
            ...post,
            myReactionType: liked ? undefined : 'LIKE',
            reactionCount: liked ? post.reactionCount - 1 : post.reactionCount + 1
          };
        }));
      }
    });
  }

  toggleComment(postId: string): void {
    if (this.commentingOn() === postId) {
      this.commentingOn.set(null);
      return;
    }
    this.commentingOn.set(postId);
    this.feed.comments(postId).subscribe({
      next: (cs) => { this.commentsCache[postId] = cs; }
    });
  }

  commentsFor(postId: string): Comment[] {
    return this.commentsCache[postId] ?? [];
  }

  isMyComment(c: Comment): boolean {
    return c.authorId === this.auth.currentUser()?.userId;
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
        this.commentsCache[p.id] = (this.commentsCache[p.id] ?? []).map(x =>
          x.id === c.id ? updated : x);
        this.cancelEditComment();
        this.toast.success('Comment updated.');
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Could not update.')
    });
  }

  deleteComment(p: Post, c: Comment): void {
    if (!confirm('Delete this comment?')) return;
    this.feed.deleteComment(c.id).subscribe({
      next: () => {
        this.commentsCache[p.id] = (this.commentsCache[p.id] ?? []).filter(x => x.id !== c.id);
        this.posts.update(all => all.map(post =>
          post.id === p.id
            ? { ...post, commentCount: Math.max(0, post.commentCount - 1) }
            : post
        ));
        this.toast.info('Comment deleted.');
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Could not delete.')
    });
  }

  submitComment(p: Post): void {
    const body = (this.commentDrafts[p.id] ?? '').trim();
    if (!body) return;
    this.feed.comment(p.id, body).subscribe({
      next: (c) => {
        this.commentDrafts[p.id] = '';
        this.commentsCache[p.id] = [...(this.commentsCache[p.id] ?? []), c];
        this.posts.update(all => all.map(post =>
          post.id === p.id ? { ...post, commentCount: post.commentCount + 1 } : post
        ));
      }
    });
  }

  initialOf(name?: string | null): string {
    return (name ?? '?').charAt(0).toUpperCase();
  }

  isMyPost(p: Post): boolean {
    return p.authorId === this.auth.currentUser()?.userId;
  }

  displayContent(p: Post): string | null {
    const c = (p.content ?? '').trim();
    if (!c || c === '📷') return null;
    return p.content;
  }

  startEditPost(p: Post): void {
    const c = (p.content ?? '').trim();
    this.editDraft = c === '📷' ? '' : p.content;
    this.editingPostId.set(p.id);
  }

  cancelEditPost(): void {
    this.editingPostId.set(null);
    this.editDraft = '';
  }

  saveEditPost(p: Post): void {
    const content = this.editDraft.trim() || (p.media?.length ? '📷' : '');
    if (!content && !p.media?.length) {
      this.toast.error('Add text or at least one image.');
      return;
    }
    this.feed.update(p.id, content).subscribe({
      next: (updated) => {
        this.posts.update(all => all.map(x => x.id === p.id ? updated : x));
        this.cancelEditPost();
        this.toast.success('Post updated.');
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Could not update.')
    });
  }

  deletePost(p: Post): void {
    if (!confirm('Delete this post?')) return;
    this.feed.delete(p.id).subscribe({
      next: () => {
        this.posts.update(all => all.filter(x => x.id !== p.id));
        const g = this.group();
        if (g) {
          this.group.set({ ...g, postCount: Math.max(0, g.postCount - 1) });
        }
        this.toast.info('Post deleted.');
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Could not delete.')
    });
  }

  removePostAttachment(p: Post, attachmentId: string): void {
    this.feed.deleteMedia(p.id, attachmentId).subscribe({
      next: (updated) => {
        this.posts.update(all => all.map(x => x.id === p.id ? updated : x));
        this.toast.success('Image removed.');
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Could not remove image.')
    });
  }

  typeTag(t: string): string {
    const tags: Record<string, string> = {
      PROMO: 'PROMO · BUILD YOUR CAREER',
      SPECIALTY: 'SPECIALTY',
      REGION: 'REGION',
      INTEREST: 'INTEREST · COMMUNITY',
    };
    return tags[t] ?? t;
  }
}

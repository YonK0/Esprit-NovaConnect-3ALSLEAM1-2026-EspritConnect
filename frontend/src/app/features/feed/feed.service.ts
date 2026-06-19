import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MediaAttachment { id?: string; url: string; mimeType: string; }

export interface Post {
  id: string; authorId: string; authorName: string; authorAvatarUrl?: string;
  groupId?: string;
  content: string; visibility: string;
  media: MediaAttachment[];
  originalPostId?: string;
  originalPost?: Post;
  reactionCount: number; commentCount: number; shareCount: number;
  myReactionType?: string;
  createdAt: string;
}

export interface Comment {
  id: string; postId: string; authorId: string; authorName: string;
  content: string; createdAt: string;
}

export interface PageResp<T> {
  content: T[]; totalElements: number; totalPages: number; number: number;
}

@Injectable({ providedIn: 'root' })
export class FeedService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/posts`;

  list(page = 0, size = 20): Observable<PageResp<Post>> {
    return this.http.get<PageResp<Post>>(`${this.base}?page=${page}&size=${size}`);
  }

  listByAuthor(authorId: string, page = 0, size = 10): Observable<PageResp<Post>> {
    return this.http.get<PageResp<Post>>(`${this.base}?authorId=${authorId}&page=${page}&size=${size}`);
  }

  listForGroup(groupId: string, page = 0, size = 20): Observable<PageResp<Post>> {
    return this.http.get<PageResp<Post>>(
      `${environment.apiUrl}/groups/${groupId}/posts?page=${page}&size=${size}`);
  }

  create(content: string, visibility = 'NETWORK', groupId?: string): Observable<Post> {
    return this.http.post<Post>(this.base, { content, visibility, groupId });
  }

  update(id: string, content: string): Observable<Post> {
    return this.http.patch<Post>(`${this.base}/${id}`, { content });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  deleteMedia(postId: string, attachmentId: string): Observable<Post> {
    return this.http.delete<Post>(`${this.base}/${postId}/media/${attachmentId}`);
  }

  comments(postId: string): Observable<Comment[]> {
    return this.http.get<Comment[]>(`${this.base}/${postId}/comments`);
  }

  comment(postId: string, content: string): Observable<Comment> {
    return this.http.post<Comment>(`${this.base}/${postId}/comments`, { content });
  }

  updateComment(commentId: string, content: string): Observable<Comment> {
    return this.http.patch<Comment>(`${this.base}/comments/${commentId}`, { content });
  }

  deleteComment(commentId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/comments/${commentId}`);
  }

  react(postId: string, type = 'LIKE'): Observable<void> {
    return this.http.post<void>(`${this.base}/${postId}/reactions`, { type });
  }

  /** Attach one image / GIF to a post the user just created. */
  attachMedia(postId: string, file: File): Observable<Post> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Post>(`${this.base}/${postId}/media`, form);
  }

  /** Repost (share) another user's post, optionally with a personal caption. */
  repost(postId: string, commentary?: string): Observable<Post> {
    return this.http.post<Post>(`${this.base}/${postId}/repost`,
      { commentary: commentary ?? '' });
  }
}

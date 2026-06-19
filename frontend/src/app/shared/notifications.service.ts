import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/notifications`;

  list(page = 0, size = 10): Observable<{ content: NotificationItem[]; totalElements: number }> {
    return this.http.get<any>(`${this.base}?page=${page}&size=${size}`);
  }

  unreadCount(): Observable<number> {
    return this.http.get<number>(`${this.base}/unread-count`);
  }

  markRead(id: string): Observable<void> {
    return this.http.patch<void>(`${this.base}/${id}/read`, {});
  }

  markAllRead(): Observable<number> {
    return this.http.post<number>(`${this.base}/read-all`, {});
  }
}

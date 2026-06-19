import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ConnectionStateString =
  | 'NONE' | 'SELF' | 'OUTGOING_PENDING' | 'INCOMING_PENDING' | 'ACCEPTED' | 'DECLINED';

export interface ConnectionState {
  state: ConnectionStateString;
  connectionId: string | null;
}

export interface ConnectionRow {
  id: string;
  requesterUserId: string;
  requesterEmail: string;
  requesterName?: string;
  requesterAvatarUrl?: string;
  addresseeUserId: string;
  addresseeEmail: string;
  addresseeName?: string;
  addresseeAvatarUrl?: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
}

export interface ConnectionCounts {
  accepted: number;
  pendingIncoming: number;
  pendingOutgoing: number;
}

export interface SuggestedConnection {
  userId: string;
  firstName: string;
  lastName: string;
  headline?: string;
  specialtyCode?: string;
  promotionYear?: number;
  sharedConnections: number;
  sharedGroups: number;
  reason: string;
  avatarUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ConnectionApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/connections`;

  /** Send a connection request. `message` is an optional personal note
   *  shown to the addressee in their notification body (LinkedIn-style). */
  request(addresseeUserId: string, message?: string): Observable<ConnectionRow> {
    return this.http.post<ConnectionRow>(this.base,
      { addresseeUserId, message: message ?? null });
  }

  suggestions(limit = 10): Observable<SuggestedConnection[]> {
    return this.http.get<SuggestedConnection[]>(`${this.base}/suggestions?limit=${limit}`);
  }

  accept(connectionId: string): Observable<ConnectionRow> {
    return this.http.post<ConnectionRow>(`${this.base}/${connectionId}/accept`, {});
  }

  decline(connectionId: string): Observable<ConnectionRow> {
    return this.http.post<ConnectionRow>(`${this.base}/${connectionId}/decline`, {});
  }

  cancel(connectionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${connectionId}`);
  }

  state(otherUserId: string): Observable<ConnectionState> {
    return this.http.get<ConnectionState>(`${this.base}/state/${otherUserId}`);
  }

  incoming(): Observable<ConnectionRow[]> {
    return this.http.get<ConnectionRow[]>(`${this.base}/incoming`);
  }

  outgoing(): Observable<ConnectionRow[]> {
    return this.http.get<ConnectionRow[]>(`${this.base}/outgoing`);
  }

  accepted(): Observable<ConnectionRow[]> {
    return this.http.get<ConnectionRow[]>(`${this.base}/accepted`);
  }

  counts(): Observable<ConnectionCounts> {
    return this.http.get<ConnectionCounts>(`${this.base}/counts`);
  }
}

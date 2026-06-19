import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ConversationSummary {
  id: string;
  otherUserId: string | null;
  otherUserEmail: string | null;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class MessagingApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/messaging`;

  listConversations(): Observable<ConversationSummary[]> {
    return this.http.get<ConversationSummary[]>(`${this.base}/conversations`);
  }

  messages(conversationId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(
      `${this.base}/conversations/${conversationId}/messages`);
  }

  send(recipientId: string, content: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.base}/messages`,
      { recipientId, content });
  }

  markRead(conversationId: string): Observable<void> {
    return this.http.post<void>(
      `${this.base}/conversations/${conversationId}/read`, {});
  }

  /** Find or create the 1:1 conversation with another user. */
  findOrCreate(userId: string): Observable<{ conversationId: string }> {
    return this.http.post<{ conversationId: string }>(
      `${this.base}/conversations/with/${userId}`, {});
  }
}

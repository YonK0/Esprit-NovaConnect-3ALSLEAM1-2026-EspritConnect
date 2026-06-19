import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ResultCard {
  type: 'ALUMNUS' | 'JOB' | 'MENTOR' | 'EVENT';
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
}

export interface QuickAction {
  label: string;
  prompt: string;
}

export interface ChatResponse {
  reply: string;
  results: ResultCard[];
  followUps: QuickAction[];
  aiEnabled: boolean;
  intent: string;
}

@Injectable({ providedIn: 'root' })
export class ChatbotApi {
  private http = inject(HttpClient);

  chat(message: string, locale: 'fr' | 'en' = 'en'): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(
      `${environment.apiUrl}/assistant/chat`, { message, locale });
  }

  async chatStream(
    message: string,
    locale: 'fr' | 'en',
    token: string
  ): Promise<ChatResponse> {
    const url = `${environment.apiUrl}/assistant/stream` +
      `?message=${encodeURIComponent(message)}&locale=${locale}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE: look for "data: {...}" lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const json = line.slice(5).trim();
          if (json) return JSON.parse(json) as ChatResponse;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.startsWith('data:')) {
      const json = buffer.slice(5).trim();
      if (json) return JSON.parse(json) as ChatResponse;
    }

    throw new Error('SSE stream ended without a message event');
  }
}

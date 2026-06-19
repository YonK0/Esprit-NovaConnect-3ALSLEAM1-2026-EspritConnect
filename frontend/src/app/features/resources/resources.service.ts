import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ItemStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SortKey = 'updated' | 'name' | 'created' | 'items';

export interface ResourceFolder {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  ownerAvatarUrl?: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceItem {
  id: string;
  folderId: string;
  type: 'file' | 'link';
  title: string;
  url?: string;
  fileType?: string;
  size?: number;
  status: ItemStatus;
  submittedBy: string;
  submittedByName: string;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
  ownPending: boolean;
}

export interface PendingItem {
  id: string;
  folderId: string;
  folderTitle: string;
  title: string;
  type: string;
  url?: string;
  submitterName: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ResourcesService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/resources`;

  listFolders(sort?: SortKey, search?: string): Observable<ResourceFolder[]> {
    const params: Record<string, string> = {};
    if (sort) params['sort'] = sort;
    if (search) params['search'] = search;
    return this.http.get<ResourceFolder[]>(`${this.base}/folders`, { params });
  }

  getFolder(id: string): Observable<ResourceFolder> {
    return this.http.get<ResourceFolder>(`${this.base}/folders/${id}`);
  }

  listItems(folderId: string): Observable<ResourceItem[]> {
    return this.http.get<ResourceItem[]>(`${this.base}/folders/${folderId}/items`);
  }

  /** Create an upload. Pass FormData with type, title and either url or file. */
  createItem(folderId: string, form: FormData): Observable<ResourceItem> {
    return this.http.post<ResourceItem>(`${this.base}/folders/${folderId}/items`, form);
  }

  deleteItem(itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/items/${itemId}`);
  }

  // ── admin: category (folder) management ──
  createFolder(payload: { title: string; description?: string }): Observable<ResourceFolder> {
    return this.http.post<ResourceFolder>(`${this.base}/folders`, payload);
  }

  uploadFolderCover(folderId: string, file: File): Observable<ResourceFolder> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ResourceFolder>(`${this.base}/folders/${folderId}/cover`, fd);
  }

  // ── admin ──
  pending(): Observable<PendingItem[]> {
    return this.http.get<PendingItem[]>(`${this.base}/pending`);
  }

  pendingCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/pending/count`);
  }

  approve(itemId: string): Observable<ResourceItem> {
    return this.http.patch<ResourceItem>(`${this.base}/items/${itemId}/approve`, {});
  }

  reject(itemId: string, rejectionReason: string): Observable<ResourceItem> {
    return this.http.patch<ResourceItem>(`${this.base}/items/${itemId}/reject`, { rejectionReason });
  }
}

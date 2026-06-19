import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface JobDetails {
  id: string;
  title: string;
  description: string;
  type: string;
  location?: string;
  remote: boolean;
  companyName: string;
  createdAt: string;
  expiresAt?: string;
  companyId?: string;
  postedById?: string;
  moderationStatus?: string;
  hasApplied?: boolean;
  applicationsCount?: number;
}

@Injectable({ providedIn: 'root' })
export class JobDetailsService {
  private http = inject(HttpClient);

  getJob(jobId: string): Observable<JobDetails> {
    return this.http.get<JobDetails>(`${environment.apiUrl}/jobs/${jobId}`);
  }
}

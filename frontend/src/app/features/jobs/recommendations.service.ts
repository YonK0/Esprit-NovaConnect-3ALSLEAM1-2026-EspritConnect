import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface CandidateRecommendation {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  headline?: string;
  promotionYear?: number;
  specialtyCode?: string;
  matchingSkills: string[];
  matchScore: number;
  reason?: string;
  avatarUrl?: string;
  openToWork?: boolean;
}

export interface JobRecommendations {
  jobOfferId: string;
  jobTitle: string;
  candidates: CandidateRecommendation[];
  aiEnabled: boolean;
  fallbackReason?: string;
}

/** One job scored against the current viewer's profile (jobs/me endpoint). */
export interface JobMatch {
  jobId: string;
  title: string;
  companyName: string;
  location?: string;
  remote: boolean;
  matchingSkills: string[];
  matchScore: number;
  reason?: string;
}

/** One job ranked against the user's profile / imported-CV skills (for-me endpoint). */
export interface JobMatchRecommendation {
  jobOfferId: string;
  title: string;
  companyName: string;
  type: string;
  location?: string;
  remote: boolean;
  matchingSkills: string[];
  matchScore: number;
  reason?: string;
}

export interface ViewerJobRecommendations {
  matches: JobMatch[];
  aiEnabled: boolean;
  fallbackReason?: string;
}

export interface UserJobRecommendations {
  jobs: JobMatchRecommendation[];
  aiEnabled: boolean;
  fallbackReason?: string;
}

@Injectable({ providedIn: 'root' })
export class RecommendationsApi {
  private http = inject(HttpClient);

  // Per-viewer job matches are stable for a session — cache for 5 min so
  // reloading the jobs page doesn't re-hit Ollama and scores stay consistent.
  private meCache?: { at: number; obs: Observable<ViewerJobRecommendations> };
  private readonly CACHE_MS = 5 * 60 * 1000;

  forJob(jobId: string): Observable<JobRecommendations> {
    return this.http.get<JobRecommendations>(
      `${environment.apiUrl}/recommendations/job/${jobId}`);
  }

  /** Best jobs for the current viewer, scored against their profile (cached). */
  forMe(limit = 30): Observable<ViewerJobRecommendations> {
    const now = Date.now();
    if (this.meCache && now - this.meCache.at < this.CACHE_MS) {
      return this.meCache.obs;
    }
    const obs = this.http.get<ViewerJobRecommendations>(
      `${environment.apiUrl}/recommendations/jobs/me?limit=${limit}`
    ).pipe(shareReplay(1));
    this.meCache = { at: now, obs };
    return obs;
  }

  /** Jobs ranked from the user's profile / imported CV skills. */
  forMeFromCv(): Observable<UserJobRecommendations> {
    return this.http.get<UserJobRecommendations>(
      `${environment.apiUrl}/recommendations/for-me`);
  }
}

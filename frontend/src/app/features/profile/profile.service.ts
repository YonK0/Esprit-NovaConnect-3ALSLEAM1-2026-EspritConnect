import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Achievement, Experience, MutualConnection, Profile, SharedGroup, Skill
} from './profile.types';
import { JobMatchRecommendation } from '../jobs/recommendations.service';

// --- CV parser DTOs (match backend CvImportDtos) ---

export interface ParsedExperience {
  title: string;
  company: string;
  location: string;
  startDate: string | null;          // ISO YYYY-MM-DD or null
  endDate: string | null;
  description: string;
}

export interface ParsedSkill {
  name: string;
  level: number | null;
}

export interface ParsedEducation {
  title: string;
  subtitle: string;
  period: string;
}

export interface CvPreview {
  headline: string;
  summary: string;
  experiences: ParsedExperience[];
  skills: ParsedSkill[];
  education: ParsedEducation[];
  confidence: number;
  aiProvider: 'ollama' | 'regex';
}

export interface CvImportRequest {
  importHeadline: boolean;
  headline?: string;
  importSummary: boolean;
  summary?: string;
  experiences: ParsedExperience[];
  skills: ParsedSkill[];
  education: ParsedEducation[];
}

export interface CvImportResult {
  experiencesAdded: number;
  skillsAdded: number;
  educationAdded: number;
  headlineUpdated: boolean;
  summaryUpdated: boolean;
  suggestedJobs?: JobMatchRecommendation[];
}

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/profiles`;

  me(): Observable<Profile> {
    return this.http.get<Profile>(`${this.base}/me`);
  }

  byUserId(userId: string): Observable<Profile> {
    return this.http.get<Profile>(`${this.base}/by-user/${userId}`);
  }

  patchMe(body: Partial<Profile>): Observable<Profile> {
    return this.http.patch<Profile>(`${this.base}/me`, body);
  }

  setCvUrl(cvUrl: string): Observable<void> {
    return this.http.put<void>(`${this.base}/me/cv`, { cvUrl });
  }

  uploadCv(file: File): Observable<Profile> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Profile>(`${this.base}/me/cv`, form);
  }

  /** Upload a profile picture. Returns the updated profile with a fresh
   *  presigned avatarUrl. */
  uploadAvatar(file: File): Observable<Profile> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Profile>(`${this.base}/me/avatar`, form);
  }

  /** Stage 1 of "import CV": upload the PDF, get a structured preview.
   * Backend uses Ollama (with a regex fallback) — does NOT touch the profile. */
  parseCv(file: File): Observable<CvPreview> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CvPreview>(`${this.base}/me/cv/parse`, form);
  }

  /** Stage 2: commit the (possibly edited) preview to the profile. */
  importCv(req: CvImportRequest): Observable<CvImportResult> {
    return this.http.post<CvImportResult>(`${this.base}/me/cv/import`, req);
  }

  // Experience
  experiences(profileId: string): Observable<Experience[]> {
    return this.http.get<Experience[]>(`${this.base}/${profileId}/experiences`);
  }
  addExperience(body: Omit<Experience, 'id'>): Observable<Experience> {
    return this.http.post<Experience>(`${this.base}/me/experiences`, body);
  }
  deleteExperience(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/me/experiences/${id}`);
  }

  // Achievements
  achievements(profileId: string): Observable<Achievement[]> {
    return this.http.get<Achievement[]>(`${this.base}/${profileId}/achievements`);
  }
  addAchievement(body: { title: string; subtitle?: string; period?: string }): Observable<Achievement> {
    return this.http.post<Achievement>(`${this.base}/me/achievements`, body);
  }
  deleteAchievement(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/me/achievements/${id}`);
  }

  // Skills + endorsements
  skills(profileId: string): Observable<Skill[]> {
    return this.http.get<Skill[]>(`${this.base}/${profileId}/skills`);
  }
  addSkill(body: { name: string; level: number }): Observable<Skill> {
    return this.http.post<Skill>(`${this.base}/me/skills`, body);
  }
  deleteSkill(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/me/skills/${id}`);
  }
  endorse(skillId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/skills/${skillId}/endorse`, {});
  }
  removeEndorse(skillId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/skills/${skillId}/endorse`);
  }

  // Relationships
  mutualConnections(targetUserId: string): Observable<MutualConnection[]> {
    return this.http.get<MutualConnection[]>(
      `${this.base}/${targetUserId}/mutual-connections`);
  }
  sharedGroups(targetUserId: string): Observable<SharedGroup[]> {
    return this.http.get<SharedGroup[]>(`${this.base}/${targetUserId}/shared-groups`);
  }
}

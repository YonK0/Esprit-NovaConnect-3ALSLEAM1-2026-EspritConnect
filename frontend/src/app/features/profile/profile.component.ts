import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProfileApi } from './profile.service';
import { Achievement, Education, Experience, Profile, Skill } from './profile.types';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast.service';
import { FeedService, Post } from '../feed/feed.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CvImportModalComponent } from './cv-import-modal.component';
import { ProfileJobApplicationsComponent } from './profile-job-applications.component';
import { VerifiedBadgeComponent } from '../../shared/verified-badge.component';
import { AvatarComponent } from '../../shared/avatar.component';
import { RecommendationsApi } from '../jobs/recommendations.service';

interface Badge { code: string; awardedAt: string; }

type TabId = 'about' | 'experience' | 'skills' | 'posts' | 'mentorship' | 'applications';

@Component({
  selector: 'ec-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink, CvImportModalComponent, ProfileJobApplicationsComponent, VerifiedBadgeComponent, AvatarComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  private api = inject(ProfileApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private feedSvc = inject(FeedService);
  private http = inject(HttpClient);
  private recsApi = inject(RecommendationsApi);

  // Dynamically compute tabs based on current user's role
  protected tabs = computed(() => {
    const currentUser = this.auth.currentUser();
    const allTabs: { id: TabId; label: string }[] = [
      { id: 'about',       label: 'About' },
      { id: 'experience',  label: 'Experience' },
      { id: 'skills',      label: 'Skills' },
      { id: 'posts',       label: 'Posts' },
      { id: 'mentorship',  label: 'Mentorship' },
      { id: 'applications', label: 'Job Applications' }
    ];

    // Filter tabs based on role
    if (!currentUser) return [allTabs[0]]; // Default to 'About' only

    switch (currentUser.role) {
      case 'RECRUITER':
        // RECRUITER: About, Posts
        return [allTabs[0], allTabs[3]];
      case 'MENTOR':
        // MENTOR: About, Experience, Skills, Posts, Mentorship
        return [allTabs[0], allTabs[1], allTabs[2], allTabs[3], allTabs[4]];
      case 'ALUMNI':
      case 'STUDENT':
      default:
        // ALUMNI/STUDENT: About, Experience, Skills, Posts, Job Applications
        return [allTabs[0], allTabs[1], allTabs[2], allTabs[3], allTabs[5]];
    }
  });

  protected activeTab = signal<TabId>('about');

  protected profile = signal<Profile | null>(null);
  protected experiences = signal<Experience[]>([]);
  protected achievements = signal<Achievement[]>([]);
  protected education = signal<Education[]>([]);
  protected skills = signal<Skill[]>([]);
  protected badges = signal<Badge[]>([]);
  /** Identity-verification flag for the logged-in user. Sourced from
   *  /users/me; only the green "verified" pill on the header depends on
   *  it, so a missing fetch (e.g. backend offline) just hides the pill. */
  protected identityVerified = signal(false);
  /** Set when an admin has requested identity verification. Drives the
   *  in-app banner below the page header. */
  protected verificationRequestedAt = signal<string | null>(null);
  protected myPosts = signal<Post[]>([]);
  protected postsLoading = signal(false);

  protected editing = signal(false);
  protected editBio = '';
  protected editHeadline = '';
  protected editWebsite = '';
  protected editSpecialtyCode = '';
  protected editPromotionYear: number | null = null;
  protected editOpenToWork = false;
  protected cvUploading = signal(false);
  protected avatarUploading = signal(false);

  protected addingExperience = signal(false);
  protected newExp = { title: '', company: '', location: '', startDate: '', endDate: '', description: '' };

  protected addingSkill = signal(false);
  protected newSkillName = '';
  protected newSkillLevel = 3;

  protected addingAchievement = signal(false);
  protected newAch = { title: '', subtitle: '', period: '' };

  protected addingEducation = signal(false);
  protected newEdu = { degree: '', institution: '', graduationDate: '' };

  protected cvImportOpen = signal(false);
  onCvImported(): void {
    this.cvImportOpen.set(false);
    this.refresh();
    this.suggestJobsAfterCv();
  }

  private suggestJobsAfterCv(): void {
    this.recsApi.forMeFromCv().subscribe({
      next: recs => {
        const top = recs.jobs?.[0];
        if (!top || top.matchScore < 40) return;
        this.toast.success(
          `${recs.jobs.length} job(s) match your CV — top: ${top.title} (${top.matchScore}%)`
        );
      },
      error: () => {}
    });
  }

  protected initials = computed(() => {
    const p = this.profile();
    return p ? (p.firstName?.[0] ?? '') + (p.lastName?.[0] ?? '') : '';
  });

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    this.api.me().subscribe(p => {
      this.profile.set(p);
      this.editBio = p.bio ?? '';
      this.editHeadline = p.headline ?? '';
      this.editWebsite = p.websiteUrl ?? '';
      this.editSpecialtyCode = p.specialtyCode ?? '';
      this.editPromotionYear = p.promotionYear ?? null;
      this.editOpenToWork = p.openToWork ?? false;
      this.api.experiences(p.id).subscribe(x => this.experiences.set(x));
      this.api.achievements(p.id).subscribe(x => {
        this.achievements.set(x);
        // Transform achievements to education format
        const educations = x.map(a => ({
          id: a.id,
          degree: a.title,
          institution: a.subtitle ?? '',
          graduationDate: a.period ?? '',
          createdAt: a.createdAt
        }));
        this.education.set(educations);
      });
      this.api.skills(p.id).subscribe(x => this.skills.set(x));
    });
    this.http.get<Badge[]>(`${environment.apiUrl}/badges/me`).subscribe({
      next: bs => this.badges.set(bs),
      error: () => {}
    });
    // Pull verification status from /users/me so we can show a green
    // "identity-verified" pill and the admin-requested verification
    // banner without storing those bits across the whole app.
    this.http.get<{ identityVerified?: boolean; identityVerificationRequestedAt?: string | null }>(
      `${environment.apiUrl}/users/me`
    ).subscribe({
      next: u => {
        this.identityVerified.set(Boolean(u?.identityVerified));
        this.verificationRequestedAt.set(u?.identityVerificationRequestedAt ?? null);
      },
      error: () => {},
    });
  }

  switchTab(tab: TabId): void {
    this.activeTab.set(tab);
    if (tab === 'posts' && this.myPosts().length === 0) {
      this.loadMyPosts();
    }
  }

  private loadMyPosts(): void {
    const userId = this.auth.currentUser()?.userId;
    if (!userId) return;
    this.postsLoading.set(true);
    this.feedSvc.listByAuthor(userId).subscribe({
      next: (page) => { this.myPosts.set(page.content); this.postsLoading.set(false); },
      error: () => this.postsLoading.set(false)
    });
  }

  onCvFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.cvUploading.set(true);
    this.api.uploadCv(file).subscribe({
      next: (res) => {
        this.profile.update(p => p ? { ...p, cvUrl: res.cvUrl } : p);
        this.cvUploading.set(false);
        this.toast.success('CV uploaded. Use “Import from CV” to extract skills and get job matches.');
        this.suggestJobsAfterCv();
      },
      error: (err) => {
        this.cvUploading.set(false);
        this.toast.error(err?.error?.message ?? 'CV upload failed.');
      }
    });
  }

  onAvatarFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.avatarUploading.set(true);
    this.api.uploadAvatar(file).subscribe({
      next: (res) => {
        this.profile.update(p => p ? { ...p, avatarUrl: res.avatarUrl } : p);
        this.avatarUploading.set(false);
        this.toast.success('Profile picture updated.');
      },
      error: (err) => {
        this.avatarUploading.set(false);
        this.toast.error(err?.error?.message ?? 'Avatar upload failed.');
      }
    });
    input.value = '';
  }

  saveAbout(): void {
    const body: Partial<Profile> = {
      bio: this.editBio,
      headline: this.editHeadline,
      websiteUrl: this.editWebsite,
      openToWork: this.editOpenToWork
    };
    this.api.patchMe(body).subscribe({
      next: () => {
        this.editing.set(false);
        this.refresh();
        this.toast.success('Profile saved.');
      },
      error: () => this.toast.error('Could not save profile.')
    });
  }

  saveExperience(): void {
    const body = { ...this.newExp, endDate: this.newExp.endDate || null };
    this.api.addExperience(body as any).subscribe(() => {
      this.addingExperience.set(false);
      this.newExp = { title: '', company: '', location: '', startDate: '', endDate: '', description: '' };
      this.refresh();
    });
  }

  deleteExp(e: Experience): void {
    if (!confirm(`Delete experience "${e.title} · ${e.company}"?`)) return;
    this.api.deleteExperience(e.id).subscribe(() => this.refresh());
  }

  saveSkill(): void {
    this.api.addSkill({ name: this.newSkillName, level: this.newSkillLevel }).subscribe(() => {
      this.addingSkill.set(false);
      this.newSkillName = '';
      this.newSkillLevel = 3;
      this.refresh();
    });
  }

  deleteSkill(s: Skill): void {
    if (!confirm(`Remove skill "${s.name}"?`)) return;
    this.api.deleteSkill(s.id).subscribe(() => this.refresh());
  }

  saveAchievement(): void {
    if (!this.newAch.title.trim()) return;
    this.api.addAchievement(this.newAch).subscribe(() => {
      this.addingAchievement.set(false);
      this.newAch = { title: '', subtitle: '', period: '' };
      this.refresh();
    });
  }

  deleteAchievement(a: Achievement): void {
    if (!confirm(`Delete achievement "${a.title}"?`)) return;
    this.api.deleteAchievement(a.id).subscribe(() => this.refresh());
  }

  saveEducation(): void {
    if (!this.newEdu.degree.trim() || !this.newEdu.institution.trim()) return;
    // Map Education fields to Achievement format for the API
    const achievement = {
      title: this.newEdu.degree,
      subtitle: this.newEdu.institution,
      period: this.newEdu.graduationDate
    };
    this.api.addAchievement(achievement).subscribe(() => {
      this.addingEducation.set(false);
      this.newEdu = { degree: '', institution: '', graduationDate: '' };
      this.refresh();
    });
  }

  deleteEducation(e: Education): void {
    if (!confirm(`Delete education "${e.degree}"?`)) return;
    this.api.deleteAchievement(e.id).subscribe(() => this.refresh());
  }

  badgeLabel(code: string): string {
    const labels: Record<string, string> = {
      VERIFIED: '✓ Verified',
      ALUMNI: '🎓 Alumni',
      MENTOR: '🧑‍🏫 Mentor',
      RECRUITER: '💼 Recruiter',
      EARLY_BIRD: '🐦 Early Bird',
      CONNECTOR: '🔗 Connector',
      SUPER_CONNECT: '🌐 Super Connector',
      TOP_POSTER: '📣 Top Poster',
      INFLUENCER: '🎯 Influencer',
      COMMUNITY: '👥 Community Member',
      EVENT_GOER: '🎟️ Event Goer',
      COMPLETE_PROFILE: '⭐ Complete Profile',
      HELPER: '🤝 Helper',
      HIRING_MAGNET: '🧲 Hiring Magnet',
      APPLICANT: '📨 Active Applicant',
    };
    return labels[code] ?? code;
  }
}

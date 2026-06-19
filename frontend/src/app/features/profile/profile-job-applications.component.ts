import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast.service';
import { environment } from '../../../environments/environment';
import { JobDetailsService, JobDetails } from '../jobs/job-details.service';

export interface ApplicationResponse {
  id: string;
  jobOfferId: string;
  applicantId: string;
  applicantEmail: string;
  applicantName: string;
  cvUrl: string;
  coverLetter: string;
  status: ApplicationStatus;
  createdAt: string;
  jobTitle: string;
  companyName: string;
}

export enum ApplicationStatus {
  NEW = 'NEW',
  REVIEWING = 'REVIEWING',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  HIRED = 'HIRED',
  REJECTED = 'REJECTED'
}

@Component({
  selector: 'app-profile-job-applications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-job-applications.component.html',
  styleUrls: ['./profile-job-applications.component.scss']
})
export class ProfileJobApplicationsComponent implements OnInit, OnDestroy {
  applications: ApplicationResponse[] = [];
  filteredApplications: ApplicationResponse[] = [];
  selectedStatus: ApplicationStatus | 'ALL' = 'ALL';
  loading = false;
  isExpanded = false;
  selectedJob: JobDetails | null = null;
  showJobModal = false;
  loadingJob = false;
  private destroy$ = new Subject<void>();
  private apiUrl = `${environment.apiUrl}/jobs/applications`;
  private jobDetailsService = inject(JobDetailsService);
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  statusLabels: Record<ApplicationStatus, string> = {
    [ApplicationStatus.NEW]: 'New',
    [ApplicationStatus.REVIEWING]: 'Under Review',
    [ApplicationStatus.INTERVIEW]: 'Interview',
    [ApplicationStatus.OFFER]: 'Offer',
    [ApplicationStatus.HIRED]: 'Hired',
    [ApplicationStatus.REJECTED]: 'Not Selected'
  };

  statusStyles: Record<ApplicationStatus, string> = {
    [ApplicationStatus.NEW]: 'bg-gray-100 text-gray-800',
    [ApplicationStatus.REVIEWING]: 'bg-amber-100 text-amber-800',
    [ApplicationStatus.INTERVIEW]: 'bg-blue-100 text-blue-800',
    [ApplicationStatus.OFFER]: 'bg-violet-100 text-violet-800',
    [ApplicationStatus.HIRED]: 'bg-green-100 text-green-800',
    [ApplicationStatus.REJECTED]: 'bg-red-100 text-red-800'
  };

  ngOnInit(): void {
    this.loadApplications();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadApplications(): void {
    this.loading = true;
    this.http.get<ApplicationResponse[]>(`${this.apiUrl}/mine`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (apps) => {
          this.applications = apps;
          this.filterApplications();
          this.loading = false;
        },
        error: (err) => {
          console.error('Failed to load applications:', err);
          this.toastService.error('Failed to load applications');
          this.loading = false;
        }
      });
  }

  filterApplications(): void {
    if (this.selectedStatus === 'ALL') {
      this.filteredApplications = this.applications;
    } else {
      this.filteredApplications = this.applications.filter(
        app => app.status === this.selectedStatus
      );
    }
  }

  onStatusChange(): void {
    this.filterApplications();
  }

  getStatusLabel(status: ApplicationStatus): string {
    return this.statusLabels[status];
  }

  getStatusStyle(status: ApplicationStatus): string {
    return this.statusStyles[status];
  }

  withdrawApplication(application: ApplicationResponse): void {
    if (!confirm(`Are you sure you want to withdraw your application for "${application.jobTitle}"?`)) {
      return;
    }

    this.http.delete(`${this.apiUrl}/${application.id}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.applications = this.applications.filter(app => app.id !== application.id);
          this.filterApplications();
          this.toastService.success('Application withdrawn successfully');
        },
        error: (err) => {
          console.error('Failed to withdraw application:', err);
          this.toastService.error('Failed to withdraw application');
        }
      });
  }

  isWithdrawable(status: ApplicationStatus): boolean {
    return status !== ApplicationStatus.HIRED && status !== ApplicationStatus.REJECTED;
  }

  get activeCount(): number {
    return this.applications.filter(
      app => app.status !== ApplicationStatus.HIRED && app.status !== ApplicationStatus.REJECTED
    ).length;
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }

  openApplication(jobId: string): void {
    this.selectedJob = null;
    this.loadingJob = true;
    this.showJobModal = true;
    console.log('Opening job modal for jobId:', jobId);
    this.jobDetailsService.getJob(jobId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (job) => {
          console.log('Job details loaded:', job);
          this.selectedJob = job;
          this.loadingJob = false;
        },
        error: (err) => {
          console.error('Failed to load job details:', err);
          this.toastService.error('Failed to load job details');
          this.loadingJob = false;
        }
      });
  }

  closeJobModal(): void {
    this.showJobModal = false;
    this.selectedJob = null;
  }
}

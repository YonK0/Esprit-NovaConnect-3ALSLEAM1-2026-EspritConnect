import { Routes } from '@angular/router';
import { authGuard, roleGuard, unauthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layouts/front-office-layout/front-office-layout.component')
      .then(m => m.FrontOfficeLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/public/landing/landing.component')
          .then(m => m.LandingComponent)
      },
      {
        path: 'login',
        canActivate: [unauthGuard],
        loadComponent: () => import('./features/public/login/login.component')
          .then(m => m.LoginComponent)
      },
      {
        path: 'signup',
        canActivate: [unauthGuard],
        loadComponent: () => import('./features/public/signup/signup.component')
          .then(m => m.SignupComponent)
      },
      {
        path: 'signup/wizard',
        canActivate: [unauthGuard],
        loadComponent: () => import('./features/signup-verification/signup-wizard.component')
          .then(m => m.SignupWizardComponent)
      },
      {
        path: 'verify-email',
        loadComponent: () => import('./features/public/verify-email/verify-email.component')
          .then(m => m.VerifyEmailComponent)
      },
      {
        path: 'forgot-password',
        canActivate: [unauthGuard],
        loadComponent: () => import('./features/public/forgot-password/forgot-password.component')
          .then(m => m.ForgotPasswordComponent)
      },
      {
        path: 'reset-password',
        canActivate: [unauthGuard],
        loadComponent: () => import('./features/public/reset-password-confirm/reset-password-confirm.component')
          .then(m => m.ResetPasswordConfirmComponent)
      },
      {
        path: 'forbidden',
        loadComponent: () => import('./features/public/forbidden/forbidden.component')
          .then(m => m.ForbiddenComponent)
      },
      {
        path: '',
        canActivate: [authGuard],
        children: [
          { path: 'feed', loadComponent: () => import('./features/feed/feed.component')
              .then(m => m.FeedComponent) },
          { path: 'directory', loadComponent: () => import('./features/directory/directory.component')
              .then(m => m.DirectoryComponent) },
          { path: 'resources', loadComponent: () => import('./features/resources/resources-list.component')
              .then(m => m.ResourcesListComponent) },
          { path: 'resources/pending',
            canActivate: [roleGuard(['ADMIN'])],
            loadComponent: () => import('./features/resources/pending-review.component')
              .then(m => m.PendingReviewComponent) },
          { path: 'resources/:id',
            loadComponent: () => import('./features/resources/folder-detail.component')
              .then(m => m.FolderDetailComponent) },
          { path: 'profile/me', loadComponent: () => import('./features/profile/profile.component')
              .then(m => m.ProfileComponent) },
          { path: 'settings', loadComponent: () => import('./features/settings/settings.component')
              .then(m => m.SettingsComponent) },
          { path: 'profiles/:userId',
            loadComponent: () => import('./features/profile/public-profile.component')
              .then(m => m.PublicProfileComponent) },
          { path: 'mentorship', loadComponent: () => import('./features/mentorship/mentorship.component')
              .then(m => m.MentorshipComponent) },
          { path: 'mentorship/become',
            loadComponent: () => import('./features/mentorship/mentor-profile.component')
              .then(m => m.MentorProfileComponent) },
          { path: 'jobs', loadComponent: () => import('./features/jobs/jobs.component')
              .then(m => m.JobsComponent) },
          { path: 'jobs/new',
            loadComponent: () => import('./features/jobs/job-create.component')
              .then(m => m.JobCreateComponent) },
          { path: 'jobs/mine/applications',
            loadComponent: () => import('./features/jobs/my-applications.component')
              .then(m => m.MyApplicationsComponent) },
          { path: 'jobs/:id/applications',
            loadComponent: () => import('./features/jobs/job-applications.component')
              .then(m => m.JobApplicationsComponent) },
          { path: 'events', loadComponent: () => import('./features/events/events.component')
              .then(m => m.EventsComponent) },
          { path: 'events/new',
            loadComponent: () => import('./features/events/event-create.component')
              .then(m => m.EventCreateComponent) },
          { path: 'events/manage',
            loadComponent: () => import('./features/events/event-manage.component')
              .then(m => m.EventManageComponent) },
          { path: 'events/manage/:id',
            loadComponent: () => import('./features/events/event-manage.component')
              .then(m => m.EventManageComponent) },
          { path: 'groups', loadComponent: () => import('./features/groups/groups.component')
              .then(m => m.GroupsComponent) },
          { path: 'groups/new',
            loadComponent: () => import('./features/groups/group-create.component')
              .then(m => m.GroupCreateComponent) },
          { path: 'groups/:id',
            loadComponent: () => import('./features/groups/group-detail.component')
              .then(m => m.GroupDetailComponent) },
          { path: 'messaging',
            loadComponent: () => import('./features/messaging/messaging.component')
              .then(m => m.MessagingComponent) },
          { path: 'messaging/:id',
            loadComponent: () => import('./features/messaging/messaging.component')
              .then(m => m.MessagingComponent) },
          { path: 'network',
            loadComponent: () => import('./features/connection/network.component')
              .then(m => m.NetworkComponent) }
        ]
      }
    ]
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard(['ADMIN'])],
    loadComponent: () => import('./layouts/back-office-layout/back-office-layout.component')
      .then(m => m.BackOfficeLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./features/admin/admin-overview.component')
          .then(m => m.AdminOverviewComponent) },
      { path: 'stats', loadComponent: () => import('./features/admin/admin-dashboard.component')
          .then(m => m.AdminDashboardComponent) },
      { path: 'communications',
        loadComponent: () => import('./features/admin/admin-communications.component')
          .then(m => m.AdminCommunicationsComponent) },
      { path: 'users', loadComponent: () => import('./features/admin/admin-users.component')
          .then(m => m.AdminUsersComponent) },
      { path: 'roles', loadComponent: () => import('./features/admin/admin-role-permissions.component')
          .then(m => m.AdminRolePermissionsComponent) },
      { path: 'moderation',
        loadComponent: () => import('./features/admin/admin-moderation.component')
          .then(m => m.AdminModerationComponent) },
      { path: 'jobs',
        loadComponent: () => import('./features/admin/admin-jobs.component')
          .then(m => m.AdminJobsComponent) },
      { path: 'audit', loadComponent: () => import('./features/admin/admin-audit.component')
          .then(m => m.AdminAuditComponent) },
      { path: 'verifications',
        loadComponent: () => import('./features/admin/verifications/admin-verifications.component')
          .then(m => m.AdminVerificationsComponent) }
    ]
  },
  { path: '**', redirectTo: '' }
];

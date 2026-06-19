package tn.esprit.connect.modules.job.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.ai.RecommendationService;
import tn.esprit.connect.modules.job.dto.JobDtos.*;
import tn.esprit.connect.modules.job.entity.*;
import tn.esprit.connect.modules.job.repository.CompanyRepository;
import tn.esprit.connect.modules.job.repository.JobApplicationRepository;
import tn.esprit.connect.modules.job.repository.JobOfferRepository;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.permissions.Permission;
import tn.esprit.connect.modules.permissions.PermissionService;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobService {

    private final JobOfferRepository jobOfferRepository;
    private final JobApplicationRepository applicationRepository;
    private final CompanyRepository companyRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final RecommendationService recommendationService;
    private final PermissionService permissionService;
    private final tn.esprit.connect.modules.badge.service.BadgeService badgeService;

    @Transactional
    public JobResponse create(UUID userId, CreateJobRequest req) {
        permissionService.require(userId, Permission.JOB_CREATE);
        User poster = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        Company company = companyRepository.findByNameIgnoreCase(req.companyName())
                .orElseGet(() -> companyRepository.save(
                        Company.builder().name(req.companyName()).build()));
        // Admin-posted jobs skip moderation — they're useful immediately and
        // the AI auto-notify fires from this path instead of from the moderation flow.
        ModerationStatus initialStatus = poster.getRole() == Role.ADMIN
                ? ModerationStatus.APPROVED
                : ModerationStatus.PENDING;
        JobOffer offer = JobOffer.builder()
                .company(company).postedBy(poster).title(req.title())
                .description(req.description()).type(req.type())
                .location(req.location()).remote(req.remote()).expiresAt(req.expiresAt())
                .moderationStatus(initialStatus)
                .build();
        offer = jobOfferRepository.save(offer);

        if (initialStatus == ModerationStatus.APPROVED) {
            final UUID jobId = offer.getId();
            // Defer until AFTER this transaction commits — otherwise the async
            // thread opens a new transaction that can't see the just-saved job
            // row, and matching silently finds nothing.
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCommit() {
                        CompletableFuture.runAsync(() -> {
                            try {
                                recommendationService.notifyMatchedCandidates(jobId);
                            } catch (Exception e) {
                                log.warn("Async auto-notify for admin-posted job {} failed: {}", jobId, e.getMessage());
                            }
                        });
                    }
                });
        }
        return toDto(offer, userId);
    }

    @Transactional(readOnly = true)
    public Page<JobResponse> search(String q, UUID viewerId,
                                     JobType type, String location, boolean remoteOnly,
                                     String specialty, Pageable pageable) {
        return jobOfferRepository
                .searchVisibleTo(q, viewerId, type, location, remoteOnly, specialty, pageable)
                .map(o -> toDto(o, viewerId));
    }

    @Transactional(readOnly = true)
    public JobResponse get(UUID id, UUID viewerId) {
        return toDto(jobOfferRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("JobOffer", id)), viewerId);
    }

    @Transactional
    public JobResponse update(UUID id, UUID userId, UpdateJobRequest req) {
        JobOffer offer = jobOfferRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("JobOffer", id));
        if (!offer.getPostedBy().getId().equals(userId)) {
            throw new AccessDeniedException("Only the poster can update");
        }
        if (req.title() != null) offer.setTitle(req.title());
        if (req.description() != null) offer.setDescription(req.description());
        if (req.type() != null) offer.setType(req.type());
        if (req.location() != null) offer.setLocation(req.location());
        if (req.remote() != null) offer.setRemote(req.remote());
        if (req.expiresAt() != null) offer.setExpiresAt(req.expiresAt());
        return toDto(offer, userId);
    }

    @Transactional
    public void delete(UUID id, UUID userId, boolean isAdmin) {
        JobOffer offer = jobOfferRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("JobOffer", id));
        if (!isAdmin && !offer.getPostedBy().getId().equals(userId)) {
            throw new AccessDeniedException("Only the poster or admin can delete");
        }
        jobOfferRepository.delete(offer);
    }

    @Transactional
    public ApplicationResponse apply(UUID jobId, UUID applicantId, ApplyRequest req) {
        permissionService.require(applicantId, Permission.JOB_APPLY);
        if (applicationRepository.existsByJobOfferIdAndApplicantId(jobId, applicantId)) {
            throw new BusinessException("Already applied");
        }
        // BadgeService.onJobApplied hook fires after the save() below.
        JobOffer offer = jobOfferRepository.findById(jobId)
                .orElseThrow(() -> new ResourceNotFoundException("JobOffer", jobId));
        User applicant = userRepository.findById(applicantId)
                .orElseThrow(() -> new ResourceNotFoundException("User", applicantId));
        JobApplication app = JobApplication.builder()
                .jobOffer(offer).applicant(applicant)
                .cvUrl(req.cvUrl()).coverLetter(req.coverLetter())
                .status(ApplicationStatus.NEW).build();
        app = applicationRepository.save(app);

        notificationService.create(offer.getPostedBy().getId(), "JOB_APPLICATION",
                "New application", applicant.getEmail() + " applied to " + offer.getTitle(),
                "/jobs/" + offer.getId());

        // Badge: APPLICANT at 3+ submitted applications.
        badgeService.onJobApplied(applicantId,
                applicationRepository.findByApplicantIdOrderByCreatedAtDesc(applicantId).size());

        return toAppDto(app);
    }

    @Transactional(readOnly = true)
    public List<ApplicationResponse> applicationsFor(UUID jobId, UUID userId) {
        JobOffer offer = jobOfferRepository.findById(jobId)
                .orElseThrow(() -> new ResourceNotFoundException("JobOffer", jobId));
        if (!offer.getPostedBy().getId().equals(userId)) {
            throw new AccessDeniedException("Only poster can view applications");
        }
        return applicationRepository.findByJobOfferId(jobId).stream()
                .map(this::toAppDto).toList();
    }

    /** Job title + recruiter contact + every application, fully materialised
     *  into plain DTOs. Used by the admin "email recruiter with all
     *  applications" console (Task-3) — bypasses the poster-only check since
     *  the endpoint is already ADMIN-gated, and returns no lazy proxies so the
     *  caller can do slow IO (CV downloads, SMTP) outside this transaction. */
    public record RecruiterApplicationsBundle(
            UUID jobId, String jobTitle,
            String recruiterEmail, String recruiterFirstName,
            List<ApplicationResponse> applications) {}

    @Transactional(readOnly = true)
    public RecruiterApplicationsBundle applicationsForAdmin(UUID jobId) {
        JobOffer offer = jobOfferRepository.findById(jobId)
                .orElseThrow(() -> new ResourceNotFoundException("JobOffer", jobId));
        User recruiter = offer.getPostedBy();
        String recruiterFirst = recruiter.getProfile() != null
                ? recruiter.getProfile().getFirstName() : null;
        List<ApplicationResponse> apps = applicationRepository.findByJobOfferId(jobId).stream()
                .map(this::toAppDto).toList();
        return new RecruiterApplicationsBundle(offer.getId(), offer.getTitle(),
                recruiter.getEmail(), recruiterFirst, apps);
    }

    /** Applications submitted by the current user — for "My applications" view. */
    @Transactional(readOnly = true)
    public List<ApplicationResponse> myApplications(UUID userId) {
        return applicationRepository.findByApplicantIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toAppDto).toList();
    }

    @Transactional
    public ApplicationResponse updateStatus(UUID applicationId, UUID userId,
                                            UpdateApplicationStatusRequest req) {
        JobApplication app = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResourceNotFoundException("JobApplication", applicationId));
        if (!app.getJobOffer().getPostedBy().getId().equals(userId)) {
            throw new AccessDeniedException("Only the recruiter can update status");
        }
        app.setStatus(req.status());
        return toAppDto(app);
    }

    @Transactional
    public void withdrawApplication(UUID applicationId, UUID userId) {
        JobApplication app = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResourceNotFoundException("JobApplication", applicationId));
        if (!app.getApplicant().getId().equals(userId)) {
            throw new AccessDeniedException("Only the applicant can withdraw their application");
        }
        if (app.getStatus() == ApplicationStatus.HIRED || app.getStatus() == ApplicationStatus.REJECTED) {
            throw new IllegalStateException("Cannot withdraw a finalized application");
        }
        applicationRepository.delete(app);
    }

    private JobResponse toDto(JobOffer o, UUID viewerId) {
        long apps = applicationRepository.countByJobOfferId(o.getId());
        boolean applied = viewerId != null
                && applicationRepository.existsByJobOfferIdAndApplicantId(o.getId(), viewerId);
        return new JobResponse(o.getId(), o.getTitle(), o.getDescription(), o.getType(),
                o.getLocation(), o.isRemote(), o.getExpiresAt(),
                o.getCompany().getId(), o.getCompany().getName(),
                o.getPostedBy().getId(), o.getModerationStatus(),
                applied, apps,
                o.getCreatedAt());
    }

    private ApplicationResponse toAppDto(JobApplication a) {
        User applicant = a.getApplicant();
        var profile = applicant.getProfile();
        String name = profile != null
                ? (profile.getFirstName() + " " + profile.getLastName()).trim()
                : applicant.getEmail();
        JobOffer job = a.getJobOffer();
        
        String jobTitle = "Deleted Job";
        String companyName = "Unknown Company";
        UUID jobId = a.getId(); // fallback to app ID if job is missing
        
        if (job != null) {
            jobId = job.getId();
            jobTitle = job.getTitle();
            companyName = job.getCompany() != null ? job.getCompany().getName() : "Unknown Company";
        }
        
        return new ApplicationResponse(a.getId(), jobId,
                applicant.getId(), applicant.getEmail(), name,
                a.getCvUrl(), a.getCoverLetter(),
                a.getStatus(), a.getCreatedAt(),
                jobTitle,
                companyName);
    }
}

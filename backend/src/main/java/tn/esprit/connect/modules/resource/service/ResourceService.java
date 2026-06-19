package tn.esprit.connect.modules.resource.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.resource.dto.ResourceDtos.*;
import tn.esprit.connect.modules.resource.entity.ResourceFolder;
import tn.esprit.connect.modules.resource.entity.ResourceItem;
import tn.esprit.connect.modules.resource.entity.ResourceItemType;
import tn.esprit.connect.modules.resource.repository.ResourceFolderRepository;
import tn.esprit.connect.modules.resource.repository.ResourceItemRepository;
import tn.esprit.connect.modules.storage.StorageService;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ResourceService {

    private final ResourceFolderRepository folderRepo;
    private final ResourceItemRepository itemRepo;
    private final StorageService storageService;
    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;

    // ── Folders ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FolderResponse> listFolders(String search, String sort) {
        Map<UUID, Long> counts = approvedCountByFolder();
        String q = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);

        List<FolderResponse> folders = new ArrayList<>();
        for (ResourceFolder f : folderRepo.findByDeletedAtIsNull()) {
            if (!q.isEmpty() && (f.getTitle() == null
                    || !f.getTitle().toLowerCase(Locale.ROOT).contains(q))) {
                continue;
            }
            folders.add(toFolderDto(f, counts.getOrDefault(f.getId(), 0L)));
        }
        folders.sort(folderComparator(sort));
        return folders;
    }

    @Transactional(readOnly = true)
    public FolderResponse getFolder(UUID id) {
        ResourceFolder f = activeFolder(id);
        long count = itemRepo.findByFolderIdAndStatusOrderByCreatedAtDesc(id, ModerationStatus.APPROVED).size();
        return toFolderDto(f, count);
    }

    @Transactional
    public FolderResponse createFolder(CreateFolderRequest req) {
        ResourceFolder f = ResourceFolder.builder()
                .title(req.title())
                .description(req.description())
                .coverImageUrl(req.coverImageUrl())
                .build();
        return toFolderDto(folderRepo.save(f), 0L);
    }

    @Transactional
    public FolderResponse updateFolder(UUID id, CreateFolderRequest req) {
        ResourceFolder f = activeFolder(id);
        if (req.title() != null) f.setTitle(req.title());
        f.setDescription(req.description());
        if (req.coverImageUrl() != null) f.setCoverImageUrl(req.coverImageUrl());
        return toFolderDto(folderRepo.save(f),
                approvedCountByFolder().getOrDefault(id, 0L));
    }

    @Transactional
    public void deleteFolder(UUID id) {
        ResourceFolder f = activeFolder(id);
        f.setDeletedAt(Instant.now());
        folderRepo.save(f);
    }

    /** Admin uploads/replaces a category's cover image. */
    @Transactional
    public FolderResponse uploadCover(UUID folderId, UUID adminId, MultipartFile file) {
        ResourceFolder f = activeFolder(folderId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException("A cover image is required.");
        }
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new BusinessException("Cover must be an image (JPEG / PNG / WEBP / GIF).");
        }
        if (file.getSize() > 8 * 1024 * 1024) {
            throw new BusinessException("Cover image must not exceed 8 MB.");
        }
        String url = storageService.uploadProfileFile(adminId, "resource-cover", file);
        f.setCoverImageUrl(url);
        return toFolderDto(folderRepo.save(f),
                approvedCountByFolder().getOrDefault(folderId, 0L));
    }

    // ── Items ────────────────────────────────────────────────────────────────

    /** APPROVED items for everyone, plus the viewer's own PENDING uploads. */
    @Transactional(readOnly = true)
    public List<ItemResponse> listItems(UUID folderId, UUID viewerId) {
        activeFolder(folderId);
        List<ItemResponse> out = new ArrayList<>();
        for (ResourceItem i : itemRepo.findByFolderIdAndStatusOrderByCreatedAtDesc(folderId, ModerationStatus.APPROVED)) {
            out.add(toItemDto(i, false));
        }
        if (viewerId != null) {
            for (ResourceItem i : itemRepo.findByFolderIdAndStatusAndSubmittedByOrderByCreatedAtDesc(
                    folderId, ModerationStatus.PENDING, viewerId)) {
                out.add(toItemDto(i, true));
            }
        }
        return out;
    }

    /**
     * Create an upload. The moderation status is derived from the submitter's
     * role server-side: students must be reviewed, everyone else is auto-approved.
     */
    @Transactional
    public ItemResponse createItem(UUID folderId, UUID userId, Role role,
                                   String type, String title, String url, MultipartFile file) {
        ResourceFolder folder = activeFolder(folderId);
        if (title == null || title.isBlank()) {
            throw new BusinessException("A title is required.");
        }
        ResourceItemType itemType;
        try {
            itemType = ResourceItemType.valueOf(type == null ? "" : type.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException("type must be 'file' or 'link'.");
        }

        String finalUrl;
        String fileType = null;
        Long size = null;
        if (itemType == ResourceItemType.LINK) {
            if (url == null || url.isBlank()) {
                throw new BusinessException("A URL is required for a link.");
            }
            finalUrl = url.trim();
        } else {
            if (file == null || file.isEmpty()) {
                throw new BusinessException("A file is required for a file upload.");
            }
            if (file.getSize() > 25 * 1024 * 1024) {
                throw new BusinessException("File must not exceed 25 MB.");
            }
            finalUrl = storageService.uploadProfileFile(userId, "resource", file);
            fileType = file.getContentType();
            size = file.getSize();
        }

        // Core moderation rule — never trust the client. Students AND alumni
        // are reviewed by an admin; staff roles (mentor, recruiter, admin) are
        // auto-approved.
        ModerationStatus status = (role == Role.STUDENT || role == Role.ALUMNI)
                ? ModerationStatus.PENDING : ModerationStatus.APPROVED;

        ResourceItem item = ResourceItem.builder()
                .folder(folder)
                .type(itemType)
                .title(title.trim())
                .url(finalUrl)
                .fileType(fileType)
                .size(size)
                .status(status)
                .submittedBy(userId)
                .build();
        if (status == ModerationStatus.APPROVED) {
            item.setReviewedAt(Instant.now());
            item.setReviewedBy(userId);
        }
        item = itemRepo.save(item);

        // Touch the folder so "Last updated" reflects new approved content.
        folder.setUpdatedAt(Instant.now());
        folderRepo.save(folder);

        return toItemDto(item, status == ModerationStatus.PENDING);
    }

    @Transactional
    public void deleteItem(UUID itemId, UUID requesterId, boolean isAdmin) {
        ResourceItem i = itemRepo.findById(itemId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource item", itemId));
        if (!isAdmin && !Objects.equals(i.getSubmittedBy(), requesterId)) {
            throw new BusinessException("You can only delete your own uploads.");
        }
        itemRepo.delete(i);
    }

    // ── Admin moderation ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PendingItemResponse> pending() {
        List<PendingItemResponse> out = new ArrayList<>();
        for (ResourceItem i : itemRepo.findByStatusOrderByCreatedAtDesc(ModerationStatus.PENDING)) {
            out.add(new PendingItemResponse(
                    i.getId(),
                    i.getFolder().getId(),
                    i.getFolder().getTitle(),
                    i.getTitle(),
                    i.getType().name().toLowerCase(Locale.ROOT),
                    i.getUrl(),
                    displayName(i.getSubmittedBy()),
                    i.getCreatedAt()));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public long pendingCount() {
        return itemRepo.countByStatus(ModerationStatus.PENDING);
    }

    @Transactional
    public ItemResponse approve(UUID itemId, UUID adminId) {
        ResourceItem i = itemRepo.findById(itemId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource item", itemId));
        i.setStatus(ModerationStatus.APPROVED);
        i.setReviewedBy(adminId);
        i.setReviewedAt(Instant.now());
        i.setRejectionReason(null);
        ResourceItem saved = itemRepo.save(i);
        ResourceFolder folder = saved.getFolder();
        folder.setUpdatedAt(Instant.now());
        folderRepo.save(folder);
        return toItemDto(saved, false);
    }

    @Transactional
    public ItemResponse reject(UUID itemId, UUID adminId, String reason) {
        ResourceItem i = itemRepo.findById(itemId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource item", itemId));
        i.setStatus(ModerationStatus.REJECTED);
        i.setReviewedBy(adminId);
        i.setReviewedAt(Instant.now());
        i.setRejectionReason(reason == null ? null : reason.trim());
        return toItemDto(itemRepo.save(i), false);
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private ResourceFolder activeFolder(UUID id) {
        ResourceFolder f = folderRepo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Resource folder", id));
        if (f.isDeleted()) throw new ResourceNotFoundException("Resource folder", id);
        return f;
    }

    private Map<UUID, Long> approvedCountByFolder() {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : itemRepo.countApprovedByFolder()) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }

    private Comparator<FolderResponse> folderComparator(String sort) {
        String s = sort == null ? "" : sort.trim().toLowerCase(Locale.ROOT);
        return switch (s) {
            case "name", "name_asc", "name-az", "title" ->
                    Comparator.comparing(f -> f.title() == null ? "" : f.title().toLowerCase(Locale.ROOT));
            case "created", "date_created", "date-created", "created_at" ->
                    Comparator.comparing(FolderResponse::createdAt,
                            Comparator.nullsLast(Comparator.naturalOrder())).reversed();
            case "items", "item_count", "item-count" ->
                    Comparator.comparingLong(FolderResponse::itemCount).reversed();
            default -> // "last updated" (default)
                    Comparator.comparing(FolderResponse::updatedAt,
                            Comparator.nullsLast(Comparator.naturalOrder())).reversed();
        };
    }

    private FolderResponse toFolderDto(ResourceFolder f, long itemCount) {
        return new FolderResponse(f.getId(), f.getTitle(), f.getDescription(),
                f.getCoverImageUrl(), f.getOwnerAvatarUrl(), itemCount,
                f.getCreatedAt(), f.getUpdatedAt());
    }

    private ItemResponse toItemDto(ResourceItem i, boolean ownPending) {
        return new ItemResponse(
                i.getId(),
                i.getFolder().getId(),
                i.getType().name().toLowerCase(Locale.ROOT),
                i.getTitle(),
                i.getUrl(),
                i.getFileType(),
                i.getSize(),
                i.getStatus().name(),
                i.getSubmittedBy(),
                displayName(i.getSubmittedBy()),
                i.getRejectionReason(),
                i.getCreatedAt(),
                i.getReviewedAt(),
                ownPending);
    }

    private String displayName(UUID userId) {
        if (userId == null) return "Unknown";
        return profileRepository.findByUserId(userId)
                .map(p -> {
                    String fn = p.getFirstName() == null ? "" : p.getFirstName();
                    String ln = p.getLastName() == null ? "" : p.getLastName();
                    String full = (fn + " " + ln).trim();
                    return full.isEmpty() ? null : full;
                })
                .filter(Objects::nonNull)
                .orElseGet(() -> userRepository.findById(userId)
                        .map(u -> u.getEmail()).orElse("Unknown"));
    }
}

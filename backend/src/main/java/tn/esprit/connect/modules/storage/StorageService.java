package tn.esprit.connect.modules.storage;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.SetBucketEncryptionArgs;
import io.minio.SetBucketPolicyArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.http.Method;
import io.minio.messages.SseConfiguration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;

import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Thin facade over MinIO for verification document storage.
 *
 * Files are stored under {@code verification/{userId}/{step}/{uuid}.{ext}}.
 * Keys are returned and persisted on {@link tn.esprit.connect.modules.verification.entity.VerificationAttempt};
 * the admin tab fetches short-lived presigned URLs on demand rather than
 * publishing object keys directly.
 */
@Slf4j
@Service
public class StorageService {

    private final MinioClient client;
    /** Separate client bound to the public endpoint — used only to generate
     *  presigned URLs whose signature matches the host the browser hits. */
    private final MinioClient minioPresignClient;
    private final StorageProperties props;

    public StorageService(MinioClient client,
                          @Qualifier("minioPresignClient") MinioClient minioPresignClient,
                          StorageProperties props) {
        this.client = client;
        this.minioPresignClient = minioPresignClient;
        this.props = props;
    }

    /** Bucket name for verification documents. */
    public String verificationBucket() {
        return props.getBuckets().getVerification();
    }

    /**
     * Upload a CV / profile document into the profiles bucket.
     * Returns a presigned GET URL valid for the configured expiry so the
     * frontend can link straight to it.
     */
    public String uploadProfileFile(UUID userId, String category, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Cannot upload an empty file");
        }
        String bucket = "profiles";
        ensureBucket(bucket);
        // Profile assets (avatars, post images, CVs) are intentionally public —
        // they're shown to every other user on the network. Storing a
        // **static** public URL (no signature) means the URL doesn't expire
        // after 10 minutes like a presigned one would, so refreshing the
        // profile a day later still loads the image.
        ensureProfilesBucketIsPublic(bucket);
        String key = buildKey(userId, category, file.getOriginalFilename());
        try (InputStream in = file.getInputStream()) {
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(in, file.getSize(), -1)
                    .contentType(file.getContentType() != null
                            ? file.getContentType() : "application/octet-stream")
                    .build());
        } catch (IOException e) {
            throw new BusinessException("Could not read uploaded file: " + e.getMessage());
        } catch (Exception e) {
            log.error("MinIO upload failed for key {}", key, e);
            throw new BusinessException("Upload failed. Try again shortly.");
        }
        // Build a plain `http://localhost:9000/profiles/<key>` URL — no signature.
        String pubBase = props.getPublicEndpoint();
        if (pubBase == null || pubBase.isBlank()) pubBase = props.getEndpoint();
        if (pubBase.endsWith("/")) pubBase = pubBase.substring(0, pubBase.length() - 1);
        return pubBase + "/" + bucket + "/" + key;
    }

    /** Mark the profile assets bucket as world-readable so we can serve
     *  avatars / post images / CVs without expiring signed URLs.
     *  Idempotent — calling on a bucket that already has the policy is fine. */
    private void ensureProfilesBucketIsPublic(String bucket) {
        // S3-compatible bucket policy: allow GetObject for anonymous principals.
        String policy = """
                {
                  "Version": "2012-10-17",
                  "Statement": [
                    {
                      "Effect": "Allow",
                      "Principal": {"AWS": ["*"]},
                      "Action": ["s3:GetObject"],
                      "Resource": ["arn:aws:s3:::%s/*"]
                    }
                  ]
                }
                """.formatted(bucket);
        try {
            client.setBucketPolicy(SetBucketPolicyArgs.builder()
                    .bucket(bucket).config(policy).build());
        } catch (Exception e) {
            // Non-fatal — uploads still succeed, just users will see broken
            // images. Log loudly so an operator notices on startup.
            log.warn("Could not make bucket '{}' public-read: {}", bucket, e.getMessage());
        }
    }

    /**
     * Upload a multipart file into the verification bucket. Returns the
     * object key — never the public URL — so the caller persists a stable
     * reference that doesn't expire.
     */
    public String uploadVerificationFile(UUID userId, String step, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Cannot upload an empty file");
        }
        ensureBucket(verificationBucket());
        String key = buildKey(userId, step, file.getOriginalFilename());
        try (InputStream in = file.getInputStream()) {
            client.putObject(PutObjectArgs.builder()
                    .bucket(verificationBucket())
                    .object(key)
                    .stream(in, file.getSize(), -1)
                    .contentType(file.getContentType() != null
                            ? file.getContentType() : "application/octet-stream")
                    .build());
        } catch (IOException e) {
            throw new BusinessException("Could not read uploaded file: " + e.getMessage());
        } catch (Exception e) {
            log.error("MinIO upload failed for key {}", key, e);
            throw new BusinessException("Upload failed. Try again shortly.");
        }
        return key;
    }

    /**
     * Lazy bucket-create. Cheap (~1 HEAD request) and protects us against
     * the case where MinIO's volume was wiped or the startup bootstrap
     * raced with MinIO becoming healthy.
     */
    private void ensureBucket(String bucket) {
        try {
            boolean exists = client.bucketExists(
                    BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("Lazily created MinIO bucket '{}' on first upload", bucket);
            }
            // Encrypt verification artifacts (ID docs, face frames) at rest.
            if (bucket.equals(verificationBucket())) {
                enableServerSideEncryption(bucket);
            }
        } catch (Exception e) {
            // Don't fail upload here — let MinIO's own error surface from putObject
            log.warn("Could not verify/create bucket '{}': {}", bucket, e.getMessage());
        }
    }

    /**
     * Turns on default SSE-S3 server-side encryption for a bucket, so every
     * stored object (ID documents, face frames) is encrypted at rest with a
     * key managed by MinIO's KMS. Transparent on read — presigned downloads and
     * the admin chain view keep working. Best-effort: requires MinIO to have a
     * KMS configured (MINIO_KMS_SECRET_KEY); logs and continues otherwise so
     * uploads never fail just because encryption couldn't be enabled.
     */
    private void enableServerSideEncryption(String bucket) {
        try {
            client.setBucketEncryption(SetBucketEncryptionArgs.builder()
                    .bucket(bucket)
                    .config(SseConfiguration.newConfigWithSseS3Rule())
                    .build());
            log.info("SSE-S3 default encryption enabled on bucket '{}'", bucket);
        } catch (Exception e) {
            log.warn("Could not enable SSE-S3 on '{}' — set MINIO_KMS_SECRET_KEY to encrypt at rest. ({})",
                    bucket, e.getMessage());
        }
    }

    /**
     * Build a presigned GET URL valid for the configured expiry. Returns null
     * if the key is null or empty so callers can map straight through DTOs
     * without a guard for legacy rows.
     */
    public String presignedDownloadUrl(String key) {
        if (key == null || key.isBlank()) return null;
        try {
            return minioPresignClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .bucket(verificationBucket())
                    .object(key)
                    .method(Method.GET)
                    .expiry(props.getPresignedUrlExpirySeconds(), TimeUnit.SECONDS)
                    .build());
        } catch (Exception e) {
            log.warn("Could not presign {}: {}", key, e.getMessage());
            return null;
        }
    }

    /**
     * Reads a private verification object through the internal MinIO client
     * and returns it as a {@code data:<contentType>;base64,...} URL.
     *
     * Used by the admin verifications tab so the browser can render the ID
     * documents and captured face frames inline — without hitting MinIO
     * directly (presigned URLs against the private bucket are unreliable from
     * the browser, which is why the images showed as broken). Returns null on
     * a missing/empty key or any read error so DTO mapping stays null-safe.
     */
    public String downloadAsDataUrl(String key) {
        if (key == null || key.isBlank()) return null;
        try {
            StatObjectResponse stat = client.statObject(StatObjectArgs.builder()
                    .bucket(verificationBucket())
                    .object(key)
                    .build());
            String contentType = stat.contentType() != null && !stat.contentType().isBlank()
                    ? stat.contentType() : "application/octet-stream";
            try (GetObjectResponse obj = client.getObject(GetObjectArgs.builder()
                    .bucket(verificationBucket())
                    .object(key)
                    .build())) {
                byte[] bytes = obj.readAllBytes();
                return "data:" + contentType + ";base64," + Base64.getEncoder().encodeToString(bytes);
            }
        } catch (Exception e) {
            log.warn("Could not load object {} as data URL: {}", key, e.getMessage());
            return null;
        }
    }

    /** Best-effort delete; missing keys are not an error. */
    public void delete(String key) {
        if (key == null || key.isBlank()) return;
        try {
            client.removeObject(RemoveObjectArgs.builder()
                    .bucket(verificationBucket())
                    .object(key)
                    .build());
        } catch (Exception e) {
            log.warn("Delete failed for {}: {}", key, e.getMessage());
        }
    }

    private String buildKey(UUID userId, String step, String filename) {
        String ext = extOf(filename);
        return "%s/%s/%s%s".formatted(
                userId,
                step.toLowerCase(Locale.ROOT),
                UUID.randomUUID(),
                ext.isEmpty() ? "" : "." + ext
        );
    }

    private String extOf(String filename) {
        if (filename == null) return "";
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) return "";
        // Clip extreme extensions and lowercase
        return filename.substring(dot + 1)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "")
                .substring(0, Math.min(8, filename.length() - dot - 1));
    }
}

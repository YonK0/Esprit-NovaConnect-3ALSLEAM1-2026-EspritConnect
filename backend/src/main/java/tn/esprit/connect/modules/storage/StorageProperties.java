package tn.esprit.connect.modules.storage;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * MinIO / S3 settings.
 *
 * Kept separate from VerificationProperties because object storage is a
 * cross-cutting concern — future modules (CV uploads, post attachments,
 * event banners) will all use the same client.
 */
@Component
@ConfigurationProperties(prefix = "app.storage")
@Getter
@Setter
public class StorageProperties {
    /** Internal endpoint — used by the backend to PUT/GET objects.
     *  In docker-compose this is "http://minio:9000" (Docker DNS). */
    private String endpoint = "http://minio:9000";
    /** Public endpoint — used to REWRITE presigned URLs so the browser
     *  can reach the same bucket. In dev this is the localhost mapping
     *  the docker-compose file publishes. Leave blank to skip rewriting.
     *
     *  Why we need both: MinIO presigns the URL with whichever host the
     *  Java client connects on (i.e. `minio:9000`). The browser can't
     *  resolve that hostname. We rewrite the host part before returning
     *  the URL to the frontend. */
    private String publicEndpoint = "http://localhost:9000";
    private String accessKey = "minioadmin";
    private String secretKey = "minioadmin";
    private boolean secure = false;
    /** Region is required by AWS S3; MinIO accepts any value. */
    private String region = "us-east-1";

    private Buckets buckets = new Buckets();

    @Getter @Setter
    public static class Buckets {
        private String verification = "verification";
    }

    /**
     * How long presigned download URLs stay valid. Short by design — the
     * admin tab refetches each time it loads, so 10 minutes is plenty.
     */
    private int presignedUrlExpirySeconds = 600;
}

package tn.esprit.connect.modules.storage;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.SetBucketEncryptionArgs;
import io.minio.messages.SseConfiguration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Builds the MinIO client.
 *
 * The bucket-bootstrap listener runs at {@link ApplicationReadyEvent}
 * instead of {@link jakarta.annotation.PostConstruct} so we don't trigger
 * Spring's "bean is currently in creation" guard by self-referencing the
 * @Bean method during the same lifecycle phase. If MinIO is offline at
 * startup, {@link StorageService} also lazily creates the bucket on each
 * upload — so the system recovers without a restart.
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class StorageConfig {

    private final StorageProperties props;

    @Bean
    @Primary
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(props.getEndpoint())
                .credentials(props.getAccessKey(), props.getSecretKey())
                .build();
    }

    /**
     * Presign-only client bound to the public endpoint.
     *
     * Why: MinIO SigV4 includes the Host header in the canonical request.
     * Presigning with the internal hostname (minio:9000) and accessing via
     * the public one (localhost:9000) returns 403 SignatureDoesNotMatch.
     * The fix is to sign with the host the browser will actually use.
     * Presigning is pure client-side math — no network call — so this
     * client doesn't need the public endpoint to be reachable from inside
     * the container.
     */
    @Bean
    public MinioClient minioPresignClient() {
        String pub = props.getPublicEndpoint();
        if (pub == null || pub.isBlank()) pub = props.getEndpoint();
        return MinioClient.builder()
                .endpoint(pub)
                .credentials(props.getAccessKey(), props.getSecretKey())
                .build();
    }

    /** Best-effort bucket bootstrap once the app is fully started. */
    @Component
    @RequiredArgsConstructor
    static class BucketBootstrap implements ApplicationListener<ApplicationReadyEvent> {
        private final MinioClient client;
        private final StorageProperties props;

        @Override
        public void onApplicationEvent(ApplicationReadyEvent event) {
            try {
                String bucket = props.getBuckets().getVerification();
                boolean exists = client.bucketExists(
                        BucketExistsArgs.builder().bucket(bucket).build());
                if (!exists) {
                    client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                    log.info("Created MinIO bucket '{}'", bucket);
                } else {
                    log.info("MinIO bucket '{}' already exists", bucket);
                }
                // Turn on default SSE-S3 so ID documents + face frames are
                // encrypted at rest. Best-effort: needs a valid
                // MINIO_KMS_SECRET_KEY (format "<name>:<base64-32-bytes>").
                try {
                    client.setBucketEncryption(SetBucketEncryptionArgs.builder()
                            .bucket(bucket)
                            .config(SseConfiguration.newConfigWithSseS3Rule())
                            .build());
                    log.info("SSE-S3 default encryption enabled on bucket '{}'", bucket);
                } catch (Exception enc) {
                    log.warn("Could not enable SSE-S3 on '{}' — set a valid MINIO_KMS_SECRET_KEY "
                            + "(\"name:base64(32 bytes)\") to encrypt at rest. Cause: {}",
                            bucket, enc.getMessage());
                }
            } catch (Exception e) {
                log.warn("MinIO bucket bootstrap failed (will retry lazily on first upload): {}",
                        e.getMessage());
            }
        }
    }
}

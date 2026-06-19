package tn.esprit.connect.modules.verification.client;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import tn.esprit.connect.common.exception.BusinessException;

import java.io.IOException;

/**
 * Thin facade over the Python /verify/* endpoints.
 *
 * Returns JsonNode rather than POJOs so the orchestrator can pluck only
 * the fields it cares about without us maintaining a parallel response
 * type for every Python-side schema change. The shape is stable enough
 * that this is a fair trade for v1.
 */
@Slf4j
@Component
public class VerificationClient {

    private final WebClient client;

    public VerificationClient(@Qualifier("verificationWebClient") WebClient client) {
        this.client = client;
    }

    public JsonNode verifyDocument(MultipartFile idFile,
                                    MultipartFile secondaryFile,
                                    String declaredName) {
        MultipartBodyBuilder body = new MultipartBodyBuilder();
        body.part("id_file", toResource(idFile), MediaType.parseMediaType(safeMime(idFile)));
        body.part("id_mime", safeMime(idFile));
        if (secondaryFile != null && !secondaryFile.isEmpty()) {
            body.part("secondary_file", toResource(secondaryFile),
                      MediaType.parseMediaType(safeMime(secondaryFile)));
            body.part("secondary_mime", safeMime(secondaryFile));
        }
        if (declaredName != null && !declaredName.isBlank()) {
            body.part("declared_name", declaredName);
        }
        return post("/verify/document", body);
    }

    public JsonNode verifyFace(String idFaceB64,
                                MultipartFile frame1,
                                MultipartFile frame2,
                                MultipartFile frame3) {
        MultipartBodyBuilder body = new MultipartBodyBuilder();
        body.part("id_face_b64", idFaceB64);
        body.part("frame1", toResource(frame1), MediaType.parseMediaType(safeMime(frame1)));
        body.part("frame2", toResource(frame2), MediaType.parseMediaType(safeMime(frame2)));
        body.part("frame3", toResource(frame3), MediaType.parseMediaType(safeMime(frame3)));
        return post("/verify/face", body);
    }

    // ----- helpers -----

    private JsonNode post(String path, MultipartBodyBuilder body) {
        try {
            JsonNode resp = client.post()
                    .uri(path)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(body.build()))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();
            if (resp == null) {
                throw new BusinessException("Empty response from verification service");
            }
            return resp;
        } catch (WebClientResponseException ex) {
            log.warn("Verification service returned {} for {}: {}",
                    ex.getStatusCode(), path, ex.getResponseBodyAsString());
            String detail = extractDetail(ex.getResponseBodyAsString());
            throw new BusinessException(
                    detail != null ? detail : "Verification rejected: " + ex.getStatusCode());
        } catch (BusinessException be) {
            throw be;
        } catch (Exception ex) {
            log.error("Verification service unreachable on {}", path, ex);
            throw new BusinessException("Verification service is unavailable. Please try again shortly.");
        }
    }

    private static ByteArrayResource toResource(MultipartFile mf) {
        try {
            byte[] data = mf.getBytes();
            String filename = mf.getOriginalFilename() != null ? mf.getOriginalFilename() : "upload";
            return new ByteArrayResource(data) {
                @Override public String getFilename() { return filename; }
            };
        } catch (IOException e) {
            throw new BusinessException("Could not read uploaded file: " + mf.getOriginalFilename());
        }
    }

    private static String safeMime(MultipartFile mf) {
        String ct = mf.getContentType();
        return (ct == null || ct.isBlank()) ? MediaType.APPLICATION_OCTET_STREAM_VALUE : ct;
    }

    /** Pull FastAPI's {"detail": "..."} message if present. */
    private static String extractDetail(String body) {
        if (body == null || !body.contains("\"detail\"")) return null;
        int i = body.indexOf("\"detail\"");
        int colon = body.indexOf(':', i);
        if (colon < 0) return null;
        int start = body.indexOf('"', colon + 1);
        int end = start < 0 ? -1 : body.indexOf('"', start + 1);
        return (start < 0 || end < 0) ? null : body.substring(start + 1, end);
    }
}

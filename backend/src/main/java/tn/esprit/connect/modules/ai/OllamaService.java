package tn.esprit.connect.modules.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Thin client for a local Ollama instance.
 * Production note: the cost of a /api/chat call is dominated by model latency
 * (a few seconds to ~30s for llama3.2:3b), not network. Caller MUST treat this
 * as an expensive operation — do not call from request hot-paths.
 */
@Slf4j
@Service
public class OllamaService {

    private final WebClient client;
    private final ObjectMapper mapper = new ObjectMapper();
    private final String model;
    private final boolean enabled;
    private final int timeoutSeconds;
    /** Lazily-resolved actual model name (the configured one if installed,
     *  otherwise whatever is). Cached once resolution succeeds. */
    private volatile String resolvedModel;

    public OllamaService(WebClient ollamaWebClient,
                         @Value("${app.ollama.model}") String model,
                         @Value("${app.ollama.enabled:true}") boolean enabled,
                         @Value("${app.ollama.timeout-seconds:60}") int timeoutSeconds) {
        this.client = ollamaWebClient;
        this.model = model;
        this.enabled = enabled;
        this.timeoutSeconds = timeoutSeconds;
    }

    public boolean isEnabled() { return enabled; }

    /**
     * The model name to actually call. Returns the configured model when it's
     * installed; otherwise asks Ollama what IS installed (GET /api/tags) and
     * uses a name-matching one (or the first available). This makes the app
     * resilient to a host that has a different model pulled (e.g. the
     * configured {@code llama3.2:3b} vs an installed {@code qwen2.5-coder:7b}).
     * Result is cached after the first successful resolution.
     */
    private String resolveModel() {
        String cached = resolvedModel;
        if (cached != null) return cached;
        try {
            String raw = client.get()
                    .uri("/api/tags")
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(5))
                    .block();
            if (raw != null) {
                List<String> installed = new ArrayList<>();
                for (JsonNode m : mapper.readTree(raw).path("models")) {
                    String name = m.path("name").asText("");
                    if (!name.isBlank()) installed.add(name);
                }
                if (installed.contains(model)) {            // exact configured match
                    resolvedModel = model;
                } else {
                    // Match by family (text before ':'), else take the first installed.
                    String base = model.contains(":") ? model.substring(0, model.indexOf(':')) : model;
                    String pick = installed.stream().filter(n -> n.startsWith(base)).findFirst()
                            .orElse(installed.isEmpty() ? null : installed.get(0));
                    if (pick != null) {
                        if (!pick.equals(model)) {
                            log.warn("Configured Ollama model '{}' not installed; using '{}' instead.", model, pick);
                        }
                        resolvedModel = pick;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Could not list Ollama models ({}); using configured '{}'.", e.getMessage(), model);
        }
        return resolvedModel != null ? resolvedModel : model;
    }

    /**
     * Send a chat-style prompt and parse the model's JSON response.
     * Returns null if Ollama is unreachable or the response is not valid JSON —
     * callers should treat that as "AI unavailable, fall back to non-AI path".
     */
    public JsonNode chatJson(String systemPrompt, String userPrompt) {
        if (!enabled) {
            log.debug("Ollama disabled by config; returning null");
            return null;
        }

        Map<String, Object> body = Map.of(
                "model", resolveModel(),
                "stream", false,
                "format", "json",
                "options", Map.of("temperature", 0.2),
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user",   "content", userPrompt)
                )
        );

        try {
            Mono<String> resp = client.post()
                    .uri("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(timeoutSeconds));

            String raw = resp.block();
            if (raw == null) return null;

            // /api/chat returns: { "message": { "role": "assistant", "content": "<json-string>" }, ... }
            JsonNode envelope = mapper.readTree(raw);
            String content = envelope.path("message").path("content").asText("");
            if (content.isBlank()) return null;

            return mapper.readTree(content);
        } catch (JsonProcessingException e) {
            log.warn("Ollama returned non-JSON content (model may not have followed format): {}", e.getMessage());
            return null;
        } catch (Exception e) {
            log.warn("Ollama call failed: {}", e.getMessage());
            return null;
        }
    }

    /** Simple plain-text generate, used by the chat assistant (Pass 3c). */
    public String generate(String prompt) {
        if (!enabled) return null;
        Map<String, Object> body = Map.of(
                "model", resolveModel(),
                "prompt", prompt,
                "stream", false,
                "options", Map.of("temperature", 0.6)
        );
        try {
            String raw = client.post()
                    .uri("/api/generate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .block();
            if (raw == null) return null;
            return mapper.readTree(raw).path("response").asText("");
        } catch (Exception e) {
            log.warn("Ollama generate failed: {}", e.getMessage());
            return null;
        }
    }
}

package tn.esprit.connect.modules.ai;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tn.esprit.connect.modules.ai.dto.AssistantDtos.ChatRequest;
import tn.esprit.connect.modules.ai.dto.AssistantDtos.ChatResponse;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@RestController
@RequestMapping("/api/v1/assistant")
@RequiredArgsConstructor
@Tag(name = "AI · Assistant")
public class AssistantController {

    private final ChatAssistantService service;
    private final ExecutorService ssePool = Executors.newCachedThreadPool();

    // Cold-start inference on a CPU-only Ollama host can take ~30-60s for
    // llama3.2:3b; subsequent calls are <5s once weights are cached. The
    // SSE emitter must outlive the slowest call, otherwise the browser
    // sees a closed connection while the model is still working.
    private static final long SSE_TIMEOUT_MS = 5 * 60_000L;   // 5 minutes

    @PostMapping("/chat")
    @Operation(summary = "Talk to the ESPRIT ASSISTANT (FR/EN) — full response")
    public ResponseEntity<ChatResponse> chat(@AuthenticationPrincipal CustomUserDetails u,
                                             @Valid @RequestBody ChatRequest req) {
        return ResponseEntity.ok(service.chat(u.getId(), req));
    }

    /**
     * SSE streaming wrapper. The full {@link ChatResponse} JSON is sent as a
     * single "message" event once {@link ChatAssistantService} finishes —
     * the contract matches the POST endpoint, but the SSE channel keeps
     * the browser connection open while the model is thinking instead of
     * blocking on an HTTP response for ~30-60s.
     *
     * The {@code AtomicBoolean done} flag guards every {@code emitter.send}
     * call so a slow Ollama response that finishes AFTER the SSE timeout
     * doesn't throw {@code IllegalStateException: ResponseBodyEmitter has
     * already completed} when it tries to write to a closed channel.
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE wrapper around /chat — sends one event when reply is ready")
    public SseEmitter stream(@AuthenticationPrincipal CustomUserDetails u,
                             @RequestParam String message,
                             @RequestParam(defaultValue = "en") String locale) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        AtomicBoolean done = new AtomicBoolean(false);

        // If the SSE itself times out / errors / the client disconnects, we
        // flip `done` so the worker task below doesn't try to write to a
        // dead channel.
        emitter.onTimeout(() -> { done.set(true); emitter.complete(); });
        emitter.onError(t  -> done.set(true));
        emitter.onCompletion(() -> done.set(true));

        ChatRequest req = new ChatRequest(message, locale);

        ssePool.execute(() -> {
            try {
                ChatResponse resp = service.chat(u.getId(), req);
                if (done.compareAndSet(false, true)) {
                    emitter.send(SseEmitter.event()
                            .name("message")
                            .data(resp, MediaType.APPLICATION_JSON));
                    emitter.complete();
                } else {
                    log.warn("Chat response ready but SSE channel already closed (timeout/disconnect).");
                }
            } catch (Exception e) {
                if (done.compareAndSet(false, true)) {
                    try {
                        emitter.send(SseEmitter.event().name("error").data(e.getMessage()));
                    } catch (Exception ignored) {}
                    emitter.completeWithError(e);
                } else {
                    log.warn("Chat call failed and SSE channel was already closed: {}", e.getMessage());
                }
            }
        });
        return emitter;
    }
}

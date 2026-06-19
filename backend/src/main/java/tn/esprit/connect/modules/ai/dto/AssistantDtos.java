package tn.esprit.connect.modules.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public final class AssistantDtos {
    private AssistantDtos() {}

    public record ChatRequest(
            @NotBlank @Size(max = 2000) String message,
            @Size(max = 8) String locale            // "fr" or "en", optional
    ) {}

    /** Cards rendered in the chat panel — alumni / jobs / mentors. */
    public record ResultCard(
            String type,          // "ALUMNUS" | "JOB" | "MENTOR" | "EVENT"
            UUID id,
            String title,
            String subtitle,
            String badge,         // e.g. "94% MATCH" or "PROMO 2018"
            String href           // frontend route to open
    ) {}

    public record QuickAction(String label, String prompt) {}

    public record ChatResponse(
            String reply,              // free-form text
            List<ResultCard> results,  // structured matches (may be empty)
            List<QuickAction> followUps,
            boolean aiEnabled,
            String intent              // routed intent for debugging
    ) {}
}

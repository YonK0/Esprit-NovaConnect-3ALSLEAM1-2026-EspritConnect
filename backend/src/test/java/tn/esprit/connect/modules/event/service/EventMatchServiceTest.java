package tn.esprit.connect.modules.event.service;

import org.junit.jupiter.api.Test;
import tn.esprit.connect.modules.event.service.EventMatchService.Candidate;
import tn.esprit.connect.modules.event.service.EventMatchService.EventMatch;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the deterministic event-match fallback — the path used when
 * Ollama is unavailable. Pure function, so no Spring context, DB or model.
 */
class EventMatchServiceTest {

    private static final String EVENT_TEXT =
            "Machine learning systems design workshop covering pytorch, data pipelines and mlops.";

    private static Candidate candidate(String first, List<String> skills,
                                       String headline, String interests) {
        return new Candidate(UUID.randomUUID(), first.toLowerCase() + "@esprit.tn",
                first, "Test", headline, null, "IA", skills, interests);
    }

    @Test
    void ranksStrongMatchesAboveWeakOnes_andDropsBelowThreshold() {
        Candidate strong = candidate("Strong",
                List.of("PyTorch", "Data", "Systems"),
                "ML engineer",
                "machine learning systems design pytorch data pipelines");
        Candidate medium = candidate("Medium",
                List.of("Design", "PyTorch"),
                "Product designer",
                "machine learning data enthusiast");
        Candidate unrelated = candidate("Unrelated",
                List.of("Welding"),
                "Civil engineer",
                "concrete steel bridges and structural loads");

        List<EventMatch> matches = EventMatchService.rankByHeuristic(
                EVENT_TEXT, List.of(medium, unrelated, strong), 60, 15);

        // Unrelated profile never crosses the threshold → not emailed.
        assertThat(matches).extracting(EventMatch::firstName)
                .containsExactly("Strong", "Medium");
        // Every returned match is above the configured minimum.
        assertThat(matches).allSatisfy(m -> assertThat(m.score()).isGreaterThanOrEqualTo(60));
        // The strongest fit is ranked first and carries a skills-based reason.
        assertThat(matches.get(0).score()).isGreaterThanOrEqualTo(matches.get(1).score());
        assertThat(matches.get(0).reason()).contains("skills");
    }

    @Test
    void respectsMaxMatchesCap() {
        List<Candidate> pool = List.of(
                candidate("A", List.of("PyTorch", "Data", "Systems"), "ML", "machine learning pytorch data"),
                candidate("B", List.of("PyTorch", "Data", "Systems"), "ML", "machine learning pytorch data"),
                candidate("C", List.of("PyTorch", "Data", "Systems"), "ML", "machine learning pytorch data"));

        List<EventMatch> matches = EventMatchService.rankByHeuristic(EVENT_TEXT, pool, 60, 2);

        assertThat(matches).hasSize(2);
    }

    @Test
    void emptyPoolYieldsNoMatches() {
        assertThat(EventMatchService.rankByHeuristic(EVENT_TEXT, List.of(), 60, 15)).isEmpty();
    }
}

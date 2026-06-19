"""Name-matching tolerant to OCR errors, ordering, and middle names.

Two complementary entry-points:

1. `compare(name_a, name_b)` — symmetric two-name comparison. Used when both
   sides are already extracted strings (the existing legacy path).

2. `verify_in_text(declared, text)` — asymmetric: "is the declared name
   present somewhere in this OCR'd document?". Returns a score in 0..1.
   Used by the orchestrator when we have a declared name from the signup
   form and want to ANCHOR the verification on it instead of fishing for a
   candidate line and then comparing two fragile extractions.

   This is dramatically more reliable on documents with multiple name-like
   lines (diplomas with signatories, IDs with Arabic+Latin labels) because
   we no longer need to pick "the right line" first — we just check whether
   each token of the declared name appears anywhere in the document text,
   with fuzzy tolerance.
"""
from __future__ import annotations

from dataclasses import dataclass

import Levenshtein

from ..utils.arabic_transliterator import (
    candidate_transliterations,
    extract_arabic_name_tokens,
)
from ..utils.language_utils import split_name_tokens, to_ascii_lower


@dataclass(frozen=True)
class NameMatchResult:
    score: float          # 0.0..1.0
    match: bool           # threshold-based, set by caller using config
    tokens_left: list[str]
    tokens_right: list[str]


def _token_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    # Substring inclusion is a free 1.0 — covers the "abdallahneifar" run-on
    # case where OCR collapsed spaces.
    if len(a) >= 3 and a in b:
        return 1.0
    if len(b) >= 3 and b in a:
        return 1.0
    # Levenshtein.ratio is in [0, 1], 1 == identical
    return Levenshtein.ratio(a, b)


def compare(name_a: str, name_b: str, *, strong_threshold: float) -> NameMatchResult:
    tokens_a = split_name_tokens(name_a or "")
    tokens_b = split_name_tokens(name_b or "")

    if not tokens_a or not tokens_b:
        return NameMatchResult(0.0, False, tokens_a, tokens_b)

    # Always iterate over the shorter list and search in the larger one,
    # so an extra middle name on one side doesn't drag the average down.
    shorter, longer = (tokens_a, tokens_b) if len(tokens_a) <= len(tokens_b) else (tokens_b, tokens_a)

    sims: list[float] = []
    for t in shorter:
        sims.append(max(_token_similarity(t, u) for u in longer))

    base = sum(sims) / len(sims)

    # Require at least 2 tokens to overlap reasonably well before we'll
    # call this a strong match — protects against "Ali" matching "Ali Baba".
    overlapping_strong = sum(1 for s in sims if s >= 0.85)
    if len(shorter) >= 2 and overlapping_strong < 2:
        base *= 0.85

    return NameMatchResult(
        score=round(base, 4),
        match=base >= strong_threshold,
        tokens_left=tokens_a,
        tokens_right=tokens_b,
    )


# Latin vowels — stripped to produce the "consonant skeleton" of a token.
# We keep 'y' as a consonant because in transliterated Arabic names it
# typically marks ي (a consonant glide) rather than a vowel sound.
_LATIN_VOWELS = set("aeiou")


def _consonant_skeleton(token: str) -> str:
    """Return the token with its vowels removed.

    Used to compare Latin names against transliterated Arabic when the
    Arabic source dropped short vowels (which is most of the time — short
    vowels aren't written in unvocalized Arabic). 'Mohamed' and 'mhmd'
    look very different to Levenshtein but their skeletons ('mhmd' and
    'mhmd') are identical.
    """
    return "".join(ch for ch in token.lower() if ch not in _LATIN_VOWELS)


def _best_against_arabic(ref: str, text: str) -> float:
    """Best similarity between `ref` and any Latin transliteration of an
    Arabic token in `text`.

    Two-pronged comparison:
      1. Direct: compare `ref` to every generated Latin candidate using
         Levenshtein. Catches names whose vowels happen to be ي / و
         (long vowels which the transliterator can render).
      2. Skeleton: also compare the consonant skeletons. This is the
         critical rescue for names like "Mohamed" → "mhmd" where every
         vowel is an implicit short vowel that doesn't appear in the
         Arabic spelling. Without this, 'mohamed' vs Arabic-derived
         'mhmd' scores ~0.5 and gets rejected even though the underlying
         match is perfect.

    Whichever route scores higher wins. The skeleton match is "soft-
    capped" at 0.95 so a perfect skeleton match is always slightly less
    than a perfect direct match — avoids the edge case where two names
    with the same skeleton ('Salem' vs 'Salam') would otherwise tie at
    1.0 against the same Arabic root.
    """
    ref_skeleton = _consonant_skeleton(ref)
    best = 0.0
    for arabic_tok in extract_arabic_name_tokens(text):
        for cand in candidate_transliterations(arabic_tok):
            sim = _token_similarity(ref, cand)
            if sim > best:
                best = sim
                if best >= 0.99:
                    return best
            # Skeleton route: only worthwhile when the candidate has at
            # least 2 consonants (single-letter Arabic words can't anchor
            # a name match reliably).
            cand_skeleton = _consonant_skeleton(cand)
            if len(cand_skeleton) >= 2 and ref_skeleton:
                skel_sim = Levenshtein.ratio(ref_skeleton, cand_skeleton) * 0.95
                if skel_sim > best:
                    best = skel_sim
                    if best >= 0.99:
                        return best
    return best


def verify_in_text(declared: str, text: str, *, strong_threshold: float) -> NameMatchResult:
    """Return how confidently the declared name appears in the document text.

    Strategy:

      1. For each token of the declared name, find the best fuzzy match
         against every token in the document's `to_ascii_lower`-ed form.
         This is `unidecode`-based and works perfectly for Latin-only or
         bilingual documents (Arabic gets transliterated coarsely but the
         Latin pass picks up the registrant's name from the Latin side).

      2. If a token's Latin score is weak (< 0.85), additionally try our
         name-friendly Arabic transliterator against each Arabic-script
         token in the document and take the BEST of the two scores.
         This rescues Arabic-only IDs and diplomas where the user's name
         only appears as Arabic glyphs (e.g. عبدالله = "Abdallah").

      3. Apply the same "≥2 strong hits required for a 2+-token name"
         protection as before, so a single common given name on the doc
         can't paper over a surname mismatch.

    Robust to:
      * label tokens around the name ("Nom:", "الأسم", "Le diplôme est remis à")
      * multiple competing name-like lines (signatories on a diploma)
      * OCR noise that mangles individual characters
      * order swaps (first/last vs last/first)
      * Arabic-script identity documents
    """
    declared_tokens = split_name_tokens(declared or "")
    text_lower = to_ascii_lower(text or "")
    text_tokens = text_lower.split()

    if not declared_tokens or (not text_tokens and not any(
        "؀" <= ch <= "ۿ" for ch in (text or "")
    )):
        return NameMatchResult(0.0, False, declared_tokens, text_tokens)

    per_token: list[float] = []
    for ref in declared_tokens:
        best = 0.0
        for cand in text_tokens:
            sim = _token_similarity(ref, cand)
            if sim > best:
                best = sim
                if best >= 0.99:
                    break
        # Fallback path: weak Latin score → try Arabic transliteration.
        if best < 0.85 and any("؀" <= ch <= "ۿ" for ch in (text or "")):
            arabic_sim = _best_against_arabic(ref, text or "")
            if arabic_sim > best:
                best = arabic_sim
        per_token.append(best)

    score = sum(per_token) / len(per_token)

    # Penalty if we only matched one of two declared tokens — protects
    # against partial false positives like a diploma that happens to
    # contain "Abdallah" (a common given name) but not the surname.
    strong_hits = sum(1 for s in per_token if s >= 0.85)
    if len(declared_tokens) >= 2 and strong_hits < 2:
        score *= 0.7

    return NameMatchResult(
        score=round(score, 4),
        match=score >= strong_threshold,
        tokens_left=declared_tokens,
        tokens_right=text_tokens[:16],   # cap echo size for response payloads
    )

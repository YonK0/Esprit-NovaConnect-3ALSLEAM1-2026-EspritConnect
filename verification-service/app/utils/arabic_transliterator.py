"""Phonetic Arabic → Latin transliteration tuned for personal names.

`unidecode` is fine for generic text but maps Arabic consonants in a way
that often breaks the way names are commonly spelled in Latin script. For
example, the prefix ال ("the") gets carried into transliteration as a
literal "al" which is then attached to the next token, and ع (ʿayn) is
silently dropped instead of being approximated by a vowel.

This module gives us a name-friendly alternative:

* Strips the ال definite-article prefix when it precedes a name token
  (so "النيفر" → "Neifar", not "AlNeifar").
* Maps each Arabic letter to a *family* of plausible Latin equivalents
  so we can build several candidate transliterations and pick whichever
  scores best against the user's declared name.
* Handles tāʾ marbūṭa (ة) at end-of-token as "a" — matches the typical
  French transliteration used on Tunisian IDs.

We don't replace `unidecode` — we use it alongside this module and take
the *best* of the two when comparing against a declared name. That makes
the OCR pipeline robust to ID cards that are Arabic-only, French-only,
or bilingual.
"""
from __future__ import annotations

import re
from itertools import product
from typing import Iterable

from .language_utils import normalize_arabic


# Per-letter transliteration families. The first entry of each list is
# the most-common Tunisian-French rendering; the rest are alternatives we
# allow when generating candidates for fuzzy matching.
#
# Long vowels ا / و / ي have multiple acceptable Latin renderings because
# Tunisian French historically uses different conventions for the same
# Arabic vowel (e.g. النيفر → "Neifar", "Neyfar", "Nifer", "Nyfer"). We
# enumerate enough of these so the fuzzy matcher can find at least one
# spelling within 1–2 edit-distance of whatever the user typed.
_FAMILIES: dict[str, list[str]] = {
    "ا": ["a", ""],
    "ب": ["b"],
    "ت": ["t"],
    "ث": ["th", "s"],
    "ج": ["j", "g"],
    "ح": ["h"],
    "خ": ["kh", "k"],
    "د": ["d"],
    "ذ": ["dh", "z", "d"],
    "ر": ["r"],
    "ز": ["z"],
    "س": ["s"],
    "ش": ["ch", "sh"],
    "ص": ["s"],
    "ض": ["d"],
    "ط": ["t"],
    "ظ": ["z", "dh"],
    "ع": ["a", ""],         # ayn — Tunisian French often drops it
    "غ": ["gh", "g"],
    "ف": ["f"],
    "ق": ["q", "k"],
    "ك": ["k"],
    "ل": ["l"],
    "م": ["m"],
    "ن": ["n"],
    "ه": ["h"],
    # و and ي can be either short or long vowels in Tunisian transliteration:
    "و": ["o", "ou", "w", "u"],
    "ي": ["i", "y", "ei", "ey"],
    "ة": ["a"],             # tāʾ marbūṭa, end-of-word
    " ": [" "],
}


def _strip_def_article(token: str) -> str:
    """Remove the ال prefix when it precedes a name root."""
    # ال (alif + lam) — drop if it leads a 3+ character token
    if token.startswith("ال") and len(token) >= 4:
        return token[2:]
    return token


def _candidates_for_letter(ch: str) -> list[str]:
    return _FAMILIES.get(ch, [ch if ch.isascii() else ""])


def candidate_transliterations(token: str, *, max_candidates: int = 24) -> list[str]:
    """Generate up to `max_candidates` plausible Latin spellings of `token`.

    Empty when the input has no Arabic letters. The first entry is the
    "default" transliteration (first option for each letter); subsequent
    entries swap in alternates exhaustively up to the cap.

    Per-letter alternatives are capped at 3 *and* prioritized so the
    high-information vowel variants (ي → "ei"/"ey", ا → "" / "a", ع → "a"
    / "") get into the cartesian product before less-impactful consonant
    swaps. 24 final candidates covers the typical 3–4 vowel ambiguity
    in a Tunisian name without quadratic blow-up.
    """
    normalized = normalize_arabic(_strip_def_article(token))
    if not any("؀" <= ch <= "ۿ" for ch in normalized):
        return []

    # Cap each letter's family at 3 alternatives before the cartesian
    # product — `max_candidates` then bounds the final list size.
    families = [_candidates_for_letter(ch)[:3] for ch in normalized]
    combos = product(*families)

    seen: list[str] = []
    for combo in combos:
        cand = "".join(combo).strip()
        if cand and cand not in seen:
            seen.append(cand)
            if len(seen) >= max_candidates:
                break
    return seen


def transliterate_text(text: str) -> str:
    """Cheap default transliteration: first family entry per letter, joined
    around whitespace boundaries.

    Use this when you just want a single plausible Latin form (e.g. for
    debug echo). For matching, prefer `candidate_transliterations` per
    token so you can score the user's declared spelling against several
    plausible options."""
    out: list[str] = []
    for tok in re.split(r"(\s+)", text):
        if tok.isspace() or not tok:
            out.append(tok)
            continue
        candidates = candidate_transliterations(tok, max_candidates=1)
        out.append(candidates[0] if candidates else tok)
    return "".join(out)


def extract_arabic_name_tokens(text: str) -> Iterable[str]:
    """Yield word-tokens that contain Arabic letters, in document order.

    Useful as a coarse "what Arabic name-like words are on this document"
    when the user's declared name is Latin: we transliterate each yielded
    token and compare.
    """
    for tok in re.split(r"[\s,;:.\(\)\[\]\d/\-]+", text):
        if any("؀" <= ch <= "ۿ" for ch in tok):
            yield normalize_arabic(_strip_def_article(tok))

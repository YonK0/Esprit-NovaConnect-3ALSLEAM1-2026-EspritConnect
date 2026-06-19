"""Text normalization for cross-script name matching.

Arabic identity cards routinely use forms that differ from Latin
transliterations: ال prefix, ة vs ه, tatweel ـ, presentation forms.
Normalizing both sides before Levenshtein gives a fair comparison.
"""
from __future__ import annotations

import re
import unicodedata

from unidecode import unidecode


# Arabic letter variants that should be folded to a canonical form
_ARABIC_FOLDS = {
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ة": "ه",
    "ى": "ي", "ئ": "ي",
    "ؤ": "و",
    "ـ": "",       # tatweel — visual stretch, no semantics
}
# Arabic diacritics (Tashkeel)
_ARABIC_DIACRITICS = re.compile(r"[ً-ْٰ]")


def normalize_arabic(text: str) -> str:
    """Fold variants, strip diacritics, drop tatweel.

    Idempotent — running it twice is the same as once.
    """
    text = unicodedata.normalize("NFKC", text)
    text = _ARABIC_DIACRITICS.sub("", text)
    return "".join(_ARABIC_FOLDS.get(ch, ch) for ch in text)


def to_ascii_lower(text: str) -> str:
    """Strip accents, lower-case, collapse spaces.

    Used as the final pre-Levenshtein form regardless of the original
    script — Arabic gets transliterated to ASCII via unidecode after
    we've normalized its internal variants.
    """
    text = normalize_arabic(text)
    text = unidecode(text)
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return " ".join(text.split())


def split_name_tokens(name: str) -> list[str]:
    """Split a normalized name into comparable tokens (given/middle/family)."""
    return to_ascii_lower(name).split()

from app.utils.language_utils import normalize_arabic, split_name_tokens, to_ascii_lower


def test_arabic_letter_folding():
    # Different alif forms should fold to a single canonical letter
    assert normalize_arabic("أحمد") == normalize_arabic("احمد")
    assert normalize_arabic("إيمان") == normalize_arabic("ايمان")


def test_taa_marbouta_folds_to_haa():
    assert normalize_arabic("فاطمة") == normalize_arabic("فاطمه")


def test_diacritics_stripped():
    raw = "مَحْمُود"
    normalized = normalize_arabic(raw)
    assert "َ" not in normalized
    assert "ُ" not in normalized
    assert "ْ" not in normalized


def test_to_ascii_lower_strips_accents():
    assert to_ascii_lower("Amàl Drìdi") == "amal dridi"


def test_to_ascii_lower_collapses_spaces_and_punct():
    assert to_ascii_lower("  Mohamed   Ali-Ben Salem!  ") == "mohamed ali ben salem"


def test_arabic_transliterated_to_ascii():
    # Unidecode converts Arabic to a Latin transliteration; the exact
    # form is library-defined, so we just assert it's ASCII and non-empty.
    result = to_ascii_lower("محمد")
    assert result
    assert all(ord(c) < 128 for c in result)


def test_split_name_tokens():
    assert split_name_tokens("Mohamed Ali Ben Salem") == ["mohamed", "ali", "ben", "salem"]

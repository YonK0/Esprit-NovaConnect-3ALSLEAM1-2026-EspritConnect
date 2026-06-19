"""Tests for the name-matching algorithm.

These run without dlib or Tesseract — they're pure-Python.
"""
from __future__ import annotations

import pytest

from app.services.name_service import compare, verify_in_text


@pytest.mark.parametrize(
    "left, right",
    [
        ("Mohamed Ali Ben Salem", "Mohamed Ali Ben Salem"),         # identical
        ("Mohamed Ali Ben Salem", "MOHAMED ALI BEN SALEM"),         # case only
        ("Mohamed Ali Ben Salem", "Mohamed-Ali Ben Salem"),         # punctuation
        ("Ali Ben Salem", "Ali Ben Salem Khaled"),                  # extra middle name on one side
        ("Mohamed Ali", "Ali Mohamed"),                             # order swap
        ("Mohamed", "Mohammed"),                                    # transliteration spelling
        ("Amal Dridi", "amal dridi"),                               # lowercase
        ("Amal Dridi", "Amàl Drìdi"),                               # accents
    ],
)
def test_matching_pairs_score_high(left, right):
    res = compare(left, right, strong_threshold=0.85)
    assert res.score >= 0.75, (left, right, res.score)


@pytest.mark.parametrize(
    "left, right",
    [
        ("Mohamed Ali", "Karim Bouazizi"),     # different people
        ("Amal Dridi", "Wejden Ghabarou"),     # different alumni
        ("", "Amal Dridi"),                    # empty
        ("Amal", ""),                          # empty
    ],
)
def test_mismatching_pairs_score_low(left, right):
    res = compare(left, right, strong_threshold=0.85)
    assert res.score < 0.7, (left, right, res.score)
    assert res.match is False


def test_strong_threshold_is_respected():
    # Same name, but threshold raised — should still be a "match"
    res = compare("Amal Dridi", "Amal Dridi", strong_threshold=0.99)
    assert res.match is True
    assert res.score >= 0.99


# ----------------------------------------------------------------------
# verify_in_text — the asymmetric "is the declared name in this text?" path
# used by the orchestrator. These scenarios reproduce the real OCR outputs
# the user reported as broken: a French diploma with signatory names and a
# Tunisian ID with Arabic labels.
# ----------------------------------------------------------------------

# Approximate Tesseract output for the bilingual Tunisian ID. The Arabic
# label "الأسم" precedes the Latin name; date/place/nationality are Arabic.
TUNISIAN_ID_OCR = """
الجمهورية التونسية
بطاقة الهوية الوطنية
123455678
الأسم: Abdallah neifar
تاريخ الميلاد: ٣٠ يناير ١٩٩٠
مكان الإصدار: صفاقس
الجنسية: تونسي
"""

# Approximate Tesseract output for the French diploma. The signatories
# "François Dubois" and "Jacques Leclair" used to out-score the
# registrant's name on the legacy line-picker.
FRENCH_DIPLOMA_OCR = """
DIPLÔME D'ÉTUDES SUPÉRIEURES
Logo du collège
Le diplôme est remis à
Abdallah neifar
Pour avoir terminé avec succès le
programme de l'École supérieure d'art.
François Dubois
Directeur
Certifié le : 17/01/2025
Identifiant : XXXXXXXX
Jacques Leclair
Directeur adjoint
"""


def test_verify_declared_name_in_tunisian_id():
    """Declared name present on a bilingual Arabic+Latin ID card."""
    res = verify_in_text("Abdallah neifar", TUNISIAN_ID_OCR, strong_threshold=0.65)
    assert res.match is True, res.score
    assert res.score >= 0.9


def test_verify_declared_name_in_french_diploma_with_signatories():
    """Declared name present on a diploma that also has signatory names.

    The legacy line-picker often picked 'François Dubois' or 'Jacques
    Leclair' as the candidate, causing the wrongful 'Name mismatch' the
    user reported. verify_in_text doesn't pick a line — it searches.
    """
    res = verify_in_text("Abdallah neifar", FRENCH_DIPLOMA_OCR, strong_threshold=0.65)
    assert res.match is True, res.score
    assert res.score >= 0.9


def test_verify_rejects_wrong_name_on_diploma():
    """Someone else's name in the declared field should NOT match
    a diploma issued to another person, even though it has signatures
    and label noise."""
    res = verify_in_text("Karim Bouazizi", FRENCH_DIPLOMA_OCR, strong_threshold=0.65)
    assert res.match is False, res.score


def test_verify_accepts_with_minor_ocr_typos():
    """Single character OCR errors on one or two tokens still match."""
    # Pretend Tesseract read 'Abdaliah' instead of 'Abdallah'
    text = "Le diplôme est remis à\nAbdaliah neifar\nFrançois Dubois"
    res = verify_in_text("Abdallah neifar", text, strong_threshold=0.65)
    assert res.match is True, res.score
    assert res.score >= 0.85


def test_verify_handles_order_swap():
    """Document shows 'Neifar Abdallah' (last-first) but declared is
    'Abdallah Neifar' (first-last)."""
    text = "Nom Prenom\nNeifar Abdallah\nDate de naissance 1990"
    res = verify_in_text("Abdallah Neifar", text, strong_threshold=0.65)
    assert res.match is True, res.score


def test_verify_partial_match_does_not_pass():
    """Only the given name is on the document — surname missing — must
    NOT pass with the 2-token strict requirement."""
    text = "Abdallah Smith was issued this diploma"
    res = verify_in_text("Abdallah Neifar", text, strong_threshold=0.65)
    assert res.match is False, res.score


def test_verify_empty_inputs():
    assert verify_in_text("", "anything", strong_threshold=0.65).match is False
    assert verify_in_text("Abdallah Neifar", "", strong_threshold=0.65).match is False


# ----------------------------------------------------------------------
# Arabic-only documents — the user reported these failing because
# unidecode's transliteration of ع / ا / ل drops or scrambles letters
# in ways that miss common Tunisian names. The Arabic-aware fallback
# transliterator should rescue these.
# ----------------------------------------------------------------------

ARABIC_ONLY_ID_OCR = """
الجمهورية التونسية
بطاقة الهوية الوطنية
١٢٣٤٥٦٧٨
الاسم: عبدالله النيفر
تاريخ الميلاد: ٣٠ يناير ١٩٩٠
"""

ARABIC_DEGREE_OCR = """
شهادة هندسة
الجمهورية التونسية
يشهد بأن الطالب
عبدالله النيفر
قد حصل على شهادة المهندس في علوم الحاسب
"""


def test_verify_latin_declared_name_against_arabic_only_id():
    """User typed 'Abdallah Neifar' at signup; ID card only has the
    Arabic spelling 'عبدالله النيفر'. Should still match thanks to the
    Arabic-aware fallback transliterator."""
    res = verify_in_text("Abdallah Neifar", ARABIC_ONLY_ID_OCR, strong_threshold=0.65)
    assert res.match is True, res.score


def test_verify_latin_declared_name_against_arabic_degree():
    """Same as above but on a degree certificate written entirely in
    Arabic — common for old ESPRIT diplomas issued before bilingual
    templates were standard."""
    res = verify_in_text("Abdallah Neifar", ARABIC_DEGREE_OCR, strong_threshold=0.65)
    assert res.match is True, res.score


def test_arabic_only_still_rejects_wrong_name():
    """The Arabic fallback must not soften the wrong-name rejection."""
    res = verify_in_text("Karim Bouazizi", ARABIC_ONLY_ID_OCR, strong_threshold=0.65)
    assert res.match is False, res.score


@pytest.mark.parametrize(
    "declared, arabic",
    [
        # Names whose vowels are *implicit* in Arabic (i.e. unwritten short
        # vowels). The plain transliterator drops these so 'Mohamed' →
        # 'mhmd' which scores poorly against 'mohamed' on a raw
        # Levenshtein. The consonant-skeleton fallback rescues them.
        ("Mohamed Salem",   "الاسم: محمد السالم"),
        ("Wejden Ghabarou", "الاسم: وجدان الغبارو"),
        ("Khaled Bouazizi", "خالد البوعزيزي"),
        ("Sami Mahfoudh",   "سامي المحفوظ"),
        # Multi-vowel names with long vowels written as ي / و — direct
        # transliteration handles these and should ALSO still pass.
        ("Karim Ben Ali",   "كريم بن علي"),
        ("Amal Dridi",      "آمال الدريدي"),
    ],
)
def test_verify_implicit_vowel_arabic_names(declared, arabic):
    res = verify_in_text(declared, f"الاسم: {arabic}", strong_threshold=0.65)
    assert res.match is True, (declared, arabic, res.score)
    assert res.score >= 0.8, (declared, arabic, res.score)


@pytest.mark.parametrize(
    "declared, arabic",
    [
        # The Arabic doc says someone else, even though the Latin OCR
        # might pick up label tokens like "الاسم". The skeleton fallback
        # must NOT match these because the consonants are completely
        # different.
        ("Karim Bouazizi",  "وجدان الغبارو"),
        ("Mohamed Salem",   "وجدان الغبارو"),
        ("Sami Mahfoudh",   "كريم بن علي"),
    ],
)
def test_skeleton_fallback_rejects_unrelated_names(declared, arabic):
    res = verify_in_text(declared, f"الاسم: {arabic}", strong_threshold=0.65)
    assert res.match is False, (declared, arabic, res.score)

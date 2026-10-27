import pytest

from app.fingilish import fingilish_to_persian, looks_like_fingilish


@pytest.mark.parametrize("src,dst", [
    ("kir", "کیر"),
    ("k.i.r", "کیر"),
    ("k i r", "کیر"),
    ("k1r", "کیر"),
    ("k!r", "کیر"),
    ("kiiiir", "کیر"),
    ("kos", "کس"),
    ("kiram", "کیرم"),
    ("khafe sho", "خفه شو"),
    ("to kharr", "تو خر"),
    ("to khar hasti", "تو خر هستی"),
    ("madar jende", "مادر جنده"),
    ("pedar sag", "پدر سگ"),
    ("salam khoobi", "سلام خوبی"),
    ("man to ro dost daram", "من تو رو دوست دارم"),
    ("hello kos nanat", "کس ننت"),
    ("you are such a kir", "کیر"),
])
def test_transliteration(src, dst):
    assert fingilish_to_persian(src) == dst


@pytest.mark.parametrize("text", [
    "Have a wonderful and productive day ahead!",
    "hi",
    "You are completely stupid and useless",
    "You are crazy",
    "John is stupid",
    "fuck you",
    "Thank you very much",
    "I am at the mall with my friends today",
])
def test_english_is_not_fingilish(text):
    assert not looks_like_fingilish(text)


@pytest.mark.parametrize("text", [
    "kir", "kos", "k1r", "khafe sho", "salam khoobi", "hello kos nanat",
    "man to ro dost daram", "to khar hasti", "madar jende", "you are such a kir",
    "pedar sag", "bi sharaf", "kiram tooye in donya",
])
def test_fingilish_detected(text):
    assert looks_like_fingilish(text)


def test_long_text_is_never_fingilish():
    assert not looks_like_fingilish("kir " * 400)

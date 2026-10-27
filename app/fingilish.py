"""
Fingilish -> Persian, plus a detector that decides whether Latin text is really
Fingilish or just English.

Pipeline for a word:
  1. de-obfuscate  (k1r -> kir, kiiiir -> kir, k.i.r -> kir, k i r -> kir)
  2. look it up in a small lexicon of common insults / everyday words, also with
     clitic endings (kir+am = kiram) and doubled letters (kharr = khar)
  3. otherwise fall back to letter-level transliteration
     (digraphs first, short middle vowels dropped, i/u written as ی/و)
English words are dropped from the Persian reading so "you are such a kir"
becomes just "کیر".  Plain English is never transliterated at all.
"""
import re

Z = '‌'  # zero-width non-joiner

# ------------------------------------------------------------------
# Lexicons
# ------------------------------------------------------------------
PROFANE = {}   # insults / vulgar words: their presence alone proves "Fingilish"
FUNCTION = {}  # ordinary words, only used to spell sentences correctly


def _p(persian, *variants):
    for v in variants:
        PROFANE[v] = persian


def _f(persian, *variants):
    for v in variants:
        FUNCTION[v] = persian


# --- insults -------------------------------------------------------
_p('کیر', 'kir', 'kiir', 'keer', 'kyr')
_p('کیری', 'kiri')
_p('کس', 'kos', 'kus', 'kose')
_p('کون', 'koon', 'kun', 'kuun')
_p('کونی', 'kooni', 'kuni')
_p('کسکش', 'koskesh', 'koskash')
_p('کسشر', 'kosshar', 'kossher')
_p('کسخل', 'koskhol')
_p('کسمغز', 'kosmaghz')
_p('خرمغز', 'kharmaghz')
_p('خرکسده', 'kharkosde', 'kharkosdeh')
_p('ننه', 'nane', 'naneh')
_p('ننت', 'nanat', 'nanet')
_p('ننش', 'nanash')
_p('مادر', 'madar')
_p('مادرجنده', 'madarjende', 'madarjendeh')
_p('مادرقحبه', 'madarghahbe', 'madarghahbeh')
_p('قحبه', 'ghahbe', 'ghahbeh')
_p('جنده', 'jende', 'jendeh', 'jande', 'jandeh', 'jenda')
_p('جاکش', 'jakesh', 'jakash')
_p('پدر', 'pedar')
_p('پدرسگ', 'pedarsag')
_p('سگ', 'sag')
_p('سگ' + Z + 'بچه', 'sagbache', 'sagbacheh')
_p('خر', 'khar')
_p('گاو', 'gav')
_p('احمق', 'ahmagh', 'ahmag', 'ahmaq')
_p('ابله', 'ablah', 'ableh')
_p('حرامزاده', 'haramzade', 'haramzadeh', 'haromzade', 'haroomzade', 'haramzadeh')
_p('حرامی', 'harami')
_p('زنازاده', 'zanazade', 'zanazadeh')
_p('گاییدم', 'gaidam', 'gayidam', 'gaiidam')
_p('گاییدن', 'gaidan', 'gayidan')
_p('گه', 'goh', 'gooh')
_p('بی' + Z + 'شرف', 'bisharaf')
_p('بی' + Z + 'غیرت', 'bigheirat', 'bighairat', 'bigheyrat')
_p('بی' + Z + 'شعور', 'bishoor', 'bishour')
_p('بی' + Z + 'ناموس', 'binamoos', 'binamus')
_p('لاشی', 'lashi')
_p('لاشخور', 'lashkhor')
_p('پفیوز', 'pofyuz', 'pofiuz', 'pofuz')
_p('دیوث', 'dayus', 'dayoos', 'deyus')
_p('تخمی', 'tokhmi')
_p('تخم', 'tokhm')
_p('کثافت', 'kasafat', 'kesafat')
_p('کثیف', 'kasif')
_p('آشغال', 'ashghal', 'ashghaal', 'ashqal')
_p('زهرمار', 'zahrmar', 'zahrmaar')
_p('لعنتی', 'lanati', 'lanti')
_p('لعنت', 'lanat')
_p('عوضی', 'avazi', 'ovazi')
_p('نکبت', 'nokbat')
_p('مرتیکه', 'mortike', 'mardike')
_p('چاقال', 'chaghal')
_p('خایه', 'khaye', 'khayeh')
_p('خایمال', 'khayemal')
_p('دزد', 'dozd')
_p('فاحشه', 'faheshe', 'fahesheh')
_p('گمشو', 'gomsho', 'gomshow', 'gomshoo')
_p('بمیر', 'bemir')
_p('بمیری', 'bemiri')
_p('خفه', 'khafe', 'khafeh')

# --- ordinary words (spelling only) --------------------------------
_f('تو', 'to')
_f('من', 'man')
_f('ما', 'ma')
_f('شما', 'shoma')
_f('اون', 'oon', 'un')
_f('این', 'in')
_f('رو', 'ro')
_f('را', 'ra')
_f('که', 'ke')
_f('یه', 'ye')
_f('یک', 'yek')
_f('به', 'be', 'beh')
_f('با', 'ba')
_f('از', 'az')
_f('در', 'dar')
_f('هم', 'ham')
_f('همه', 'hame')
_f('هستی', 'hasti')
_f('هستم', 'hastam')
_f('هست', 'hast')
_f('هستید', 'hastid')
_f('نیست', 'nist')
_f('نیستی', 'nisti')
_f('می' + Z + 'خوام', 'mikham', 'mikhaam')
_f('می' + Z + 'دونم', 'midonam')
_f('دارم', 'daram')
_f('داری', 'dari')
_f('بیا', 'bia')
_f('برو', 'boro')
_f('خودت', 'khodet')
_f('خیلی', 'kheyli', 'kheili', 'kheyly')
_f('چرا', 'chera')
_f('چی', 'chi')
_f('چه', 'che')
_f('سلام', 'salam')
_f('خوب', 'khob', 'khoob')
_f('خوبی', 'khoobi', 'khobi')
_f('ممنون', 'mamnoon', 'mamnun')
_f('مرسی', 'mersi', 'merci')
_f('لطفا', 'lotfan')
_f('دوست', 'dost', 'doost')
_f('عزیز', 'aziz')
_f('خوشگل', 'khoshgel')
_f('زشت', 'zesht')
_f('بد', 'bad')
_f('نکن', 'nakon')
_f('کن', 'kon')
_f('شو', 'sho', 'shoo')
_f('بابا', 'baba')
_f('توی', 'tooye', 'tuye', 'tooy', 'tuy')
_f('دیگه', 'dige', 'diga')
_f('امروز', 'emrooz', 'emruz')
_f('فردا', 'farda')

# endings glued to a stem: kir+am -> کیرم
CLITICS = [
    ('eshun', 'شان'), ('ashun', 'شان'), ('etun', 'تان'), ('atun', 'تان'),
    ('emun', 'مان'), ('amun', 'مان'),
    ('esh', 'ش'), ('ash', 'ش'), ('et', 'ت'), ('at', 'ت'), ('am', 'م'), ('em', 'م'),
    ('i', 'ی'),
]

# ------------------------------------------------------------------
# Letter-level transliteration (fallback)
# ------------------------------------------------------------------
FINGILISH_DIGRAPHS = [
    ('kh', 'خ'), ('gh', 'ق'), ('ch', 'چ'), ('sh', 'ش'), ('zh', 'ژ'),
    ('ph', 'ف'), ('th', 'ت'), ('ck', 'ک'),
    ('aa', 'آ'), ('ee', 'ی'), ('oo', 'و'), ('ou', 'و'),
    ('ei', 'ی'), ('ey', 'ی'), ('ay', 'ی'), ('ai', 'ی'), ('oy', 'ی'),
]

FINGILISH_CONSONANTS = {
    'b': 'ب', 'p': 'پ', 't': 'ت', 's': 'س', 'j': 'ج', 'h': 'ه',
    'd': 'د', 'z': 'ز', 'r': 'ر', 'f': 'ف', 'q': 'ق', 'k': 'ک',
    'g': 'گ', 'l': 'ل', 'm': 'م', 'n': 'ن', 'v': 'و', 'w': 'و',
    'y': 'ی', 'x': 'کس', 'c': 'ک',
}

_INITIAL_VOWELS = {'a': 'ا', 'e': 'ا', 'o': 'ا', 'i': 'ای', 'u': 'او'}
_FINAL_VOWELS   = {'a': 'ا', 'e': 'ه', 'i': 'ی', 'o': 'و', 'u': 'و'}
_MIDDLE_VOWELS  = {'a': '',  'e': '',  'i': 'ی', 'o': '',  'u': 'و'}

_DOUBLE_CONSONANT = re.compile(r'([bcdfghjklmnpqrstvwxyz])\1+')
_LONG_RUN = re.compile(r'([a-z])\1{2,}')


def _transliterate_word(w: str) -> str:
    if not w:
        return ''
    w = _DOUBLE_CONSONANT.sub(r'\1', w)
    out = []
    i, n = 0, len(w)
    while i < n:
        matched = False
        for src, dst in FINGILISH_DIGRAPHS:
            if w.startswith(src, i):
                out.append(dst)
                i += len(src)
                matched = True
                break
        if matched:
            continue
        ch = w[i]
        if ch in FINGILISH_CONSONANTS:
            out.append(FINGILISH_CONSONANTS[ch])
        elif ch in 'aeiou':
            if i == 0:
                out.append(_INITIAL_VOWELS[ch])
            elif i == n - 1:
                out.append(_FINAL_VOWELS[ch])
            else:
                out.append(_MIDDLE_VOWELS[ch])
        else:
            out.append(ch)
        i += 1
    return ''.join(out)


# ------------------------------------------------------------------
# English word list (used to keep English out of the Persian reading and
# to decide whether a sentence is English)
# ------------------------------------------------------------------
ENGLISH_WORDS = set("""
the a an and or but if then than so because as of in on at to for from by with without about into over under
after before between through during up down out off again further once here there when where why how all any both
each few more most other some such only own same too very can will just should now every another
i you he she it we they me him her us them my your his its our their mine yours this that these those
am is are was were be been being have has had having do does did doing would could shall may might must
not no yes ok okay please thanks thank sorry hello hi hey bye goodbye welcome
what who whom which whose
good bad great nice wonderful awesome amazing terrible horrible awful beautiful ugly happy sad angry
day days night morning evening today tomorrow yesterday week year time ahead
people person man woman men women boy girl guy guys friend friends family life world thing things
work works working productive useful useless stupid idiot idiots dumb crazy insane mad fool foolish
like love hate want need know think say said see look make made get got go going come came take give
tell ask use find help try call feel leave put keep let begin seem show hear play run move live believe
bring happen write provide sit stand lose pay meet include continue set learn change lead understand watch
follow stop create speak read allow add spend grow open walk win offer remember consider appear buy wait serve
die send expect build stay fall cut reach kill remain
completely totally really actually always never ever maybe perhaps still even also already
fuck fucking fucker shit shitty bitch damn dumbass asshole ass bastard crap dick suck sucks loser trash
moron jerk scum garbage pathetic worthless disgusting
one two three four five six seven eight nine ten first second last next new old big small long short high low
many much little less own right left well back way
free best better worse worst hard easy fast slow
text message words word name email number page site website
""".split())

# Valid English words that are also common Fingilish words: they tell the
# detector nothing either way.
NEUTRAL_WORDS = {
    'to', 'man', 'in', 'an', 'be', 'do', 'me', 'am', 'so', 'no', 'are', 'at',
    'as', 'on', 'or', 'bad', 'ham', 'dad', 'mad', 'male', 'mi', 'ta', 'na',
    'por', 'dare', 'kon', 'din', 'beh', 'ye', 'ya', 'shot', 'pas', 'mal',
}

_ENGLISH_SUFFIX = re.compile(r'(ing|tion|sion|ness|ment|able|ible|ful|less|ous|ally|ight|ould|ough|ly|ed)$')


def _is_english_token(tok: str) -> bool:
    if tok in ENGLISH_WORDS:
        return True
    return len(tok) >= 5 and bool(_ENGLISH_SUFFIX.search(tok))


# ------------------------------------------------------------------
# De-obfuscation and lookup
# ------------------------------------------------------------------
_LEET = {'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i'}
_LEET_RE = re.compile(r'(?<=[a-z])[013457@$!](?=[a-z])')


def _normalize(text: str) -> str:
    t = text.lower().strip()
    t = re.sub(r"[.\-_*^•'’\"]+", '', t)           # k.i.r  bi-sharaf  bisho'ur
    tokens = t.split()
    if len(tokens) > 1 and all(len(tok) == 1 and tok.isalpha() for tok in tokens):
        t = ''.join(tokens)                           # "k i r" -> "kir"
    t = _LEET_RE.sub(lambda m: _LEET[m.group(0)], t)  # k1r k!r k0s
    return t


def _squeeze(w: str) -> str:
    """kiiiir -> kir ; khooooob -> khoob (3+ repeats collapse)."""
    return _LONG_RUN.sub(lambda m: 'oo' if m.group(1) == 'o' else m.group(1), w)


def _candidates(w: str):
    seen = []
    for c in (w, _squeeze(w), _DOUBLE_CONSONANT.sub(r'\1', _squeeze(w))):
        if c and c not in seen:
            seen.append(c)
    return seen


def _lookup(w: str, profane_only: bool = False):
    tables = (PROFANE,) if profane_only else (PROFANE, FUNCTION)
    for cand in _candidates(w):
        for table in tables:
            if cand in table:
                return table[cand]
        for suffix, fa in CLITICS:
            if cand.endswith(suffix) and len(cand) - len(suffix) >= 3:
                stem = cand[:-len(suffix)]
                for table in tables:
                    if stem in table:
                        return table[stem] + fa
    return None


def _is_profane(w: str) -> bool:
    return w not in ENGLISH_WORDS and _lookup(w, profane_only=True) is not None


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------
def _convert_run(m) -> str:
    w = _squeeze(m.group(0))
    hit = _lookup(w)
    if hit:
        return hit
    if w in ENGLISH_WORDS:
        return ''                                     # keep English out of the Persian reading
    return _transliterate_word(w)


def fingilish_to_persian(text: str) -> str:
    out = []
    for token in _normalize(text).split():
        conv = re.sub(r'[a-z]+', _convert_run, token)
        if conv.strip():
            out.append(conv)
    return ' '.join(out)


def looks_like_fingilish(text: str) -> bool:
    """True when Latin text contains a known Fingilish insult, or is
    dominated by non-English tokens."""
    if len(text) > 600:
        return False
    tokens = re.findall(r'[a-z]+', _normalize(text))
    if not tokens:
        return False
    english = unknown = 0
    for tok in tokens:
        tok = _squeeze(tok)
        if _is_profane(tok):
            return True
        if tok in NEUTRAL_WORDS:
            continue
        if _is_english_token(tok):
            english += 1
        else:
            unknown += 1
    if english + unknown == 0:
        return True                                   # only neutral tokens, e.g. "to man"
    return english / (english + unknown) < 0.6


# ------------------------------------------------------------------
# Helpers used by the public API (/api/v1/fingilish/*, /api/v1/censor)
# ------------------------------------------------------------------
# Words that are insults only in context ("pedar" = father, "khar" = donkey).
# They still count for detection, but are never masked on their own.
CONTEXTUAL = {'پدر', 'مادر', 'سگ', 'خر', 'ننه', 'کون'}

# Persian spellings of every listed insult, for matching Persian-script text.
PERSIAN_PROFANE = set(PROFANE.values())
_FA_TOKEN = re.compile(r'[\u0600-\u06FF\u200c]+')
_LATIN_TOKEN = re.compile(r'[A-Za-z0-9@$!.]+')


def normalize_text(text: str) -> str:
    """De-obfuscated, lower-cased Latin form (k1r -> kir, k.i.r -> kir)."""
    return ' '.join(_squeeze(w) for w in _normalize(text).split())


def _persian_hit(tok: str):
    """Return the base insult if a Persian token is (insult + clitic)."""
    t = tok.replace(Z, '')
    if t in PERSIAN_PROFANE:
        return t
    for _suffix, fa in CLITICS:
        if t.endswith(fa) and len(t) - len(fa) >= 2 and t[:-len(fa)] in PERSIAN_PROFANE:
            return t[:-len(fa)]
    return None


def find_profane(text: str):
    """List the known insults in `text` (Latin Fingilish and Persian script).

    Each hit: {"token", "start", "end", "persian", "script", "contextual"}.
    """
    hits = []
    for m in _LATIN_TOKEN.finditer(text):
        raw = m.group(0)
        start, end = m.start(), m.end()
        lead = len(raw) - len(raw.lstrip('.!'))
        raw = raw.strip('.!')
        if not raw:
            continue
        start += lead
        end = start + len(raw)
        norm = _squeeze(_normalize(raw).replace(' ', ''))
        norm = re.sub(r'[^a-z]', '', norm)
        if not norm or norm in ENGLISH_WORDS:
            continue
        fa = _lookup(norm, profane_only=True)
        if fa:
            base = fa
            hits.append({"token": raw, "start": start, "end": end,
                         "persian": fa, "script": "latin",
                         "contextual": base in CONTEXTUAL})
    for m in _FA_TOKEN.finditer(text):
        base = _persian_hit(m.group(0))
        if base:
            hits.append({"token": m.group(0), "start": m.start(), "end": m.end(),
                         "persian": base, "script": "persian",
                         "contextual": base in CONTEXTUAL})
    hits.sort(key=lambda h: h["start"])
    return hits


def mask_profane(text: str, char: str = '*', include_contextual: bool = False,
                 keep_first: bool = False):
    """Replace known insults with `char`. Returns (masked_text, hits_masked)."""
    hits = [h for h in find_profane(text)
            if include_contextual or not h["contextual"]]
    out, last = [], 0
    for h in hits:
        if h["start"] < last:
            continue
        tok = h["token"]
        masked = (tok[0] + char * (len(tok) - 1)) if keep_first and len(tok) > 1 else char * len(tok)
        out.append(text[last:h["start"]])
        out.append(masked)
        last = h["end"]
    out.append(text[last:])
    return ''.join(out), hits

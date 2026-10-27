"""
Pure (torch-free) decision logic of the ensemble, so it can be unit-tested
without downloading any model.
"""
import re
from typing import Dict, Tuple

PER_MODEL_VOTE_THRESHOLD = 0.50
MIN_VOTES_FOR_TOXIC = 2
STRONG_SINGLE_MODEL = 0.90
WEAK_SUSPECT_THRESHOLD = 0.60
# A transliterated (Fingilish) reading is a guess, so a single model needs
# more certainty before it may declare TOXIC on its own.
FINGILISH_STRONG_SINGLE = 0.95

# A lone model - however confident - is not allowed to convict on its own
# unless at least one other applicable model is *also* at least mildly
# suspicious of the text.
SOLO_VOTE_CORROBORATION_FLOOR = 0.30

# If a solo strong vote has essentially *zero* corroboration - every other
# applicable model sits below this floor - the outlier is treated as SAFE
# rather than SUSPECT. A single checkpoint firing at 100% on ordinary text
# while every other model confidently says "safe" is not a weak signal worth
# reviewing; it is a miscalibration pattern.
SOLO_VOTE_SUSPECT_FLOOR = 0.10

SEVERITY = {"SAFE": 0, "SUSPECT": 1, "TOXIC": 2}


def detect_script(text: str) -> str:
    fa = len(re.findall(r'[؀-ۿ]', text))
    en = len(re.findall(r'[A-Za-z]', text))
    total = fa + en
    if total == 0:
        return "mixed"
    if fa / total >= 0.6:
        return "fa"
    if en / total >= 0.6:
        return "en"
    return "mixed"



# A language-specialist model (persian for Farsi, twitter_off for English)
# that is *confident* the text is clean can veto a vote that comes only from
# correlated models — e.g. two TextDetox variants trained on the same data.
# Their agreement is not independent evidence.
SPECIALIST_SAFE_FLOOR = 0.15

# Models that share a training family. If every voting model belongs to the
# same family, the vote count is downgraded (needs one more independent vote).
CORRELATED_FAMILIES = {
    "textdetox_lg": "textdetox",
    "textdetox_sm": "textdetox",
}

# Which model is the "language specialist" for each script.
SPECIALIST_BY_SCRIPT = {
    "fa": "persian",
    "en": "twitter_off",
}


def _specialist_vetoes(raw, script):
    """True if the language specialist strongly disagrees with the vote."""
    name = SPECIALIST_BY_SCRIPT.get(script or "")
    if not name or name not in raw:
        return False
    return raw[name] < SPECIALIST_SAFE_FLOOR


def _votes_are_correlated(votes):
    """True if all *voting* models belong to the same training family."""
    voters = [name for name, v in votes.items() if v]
    if len(voters) < 2:
        return False
    families = {CORRELATED_FAMILIES.get(n, n) for n in voters}
    return len(families) == 1


def decide(raw: Dict[str, float], strict: bool = False,
           script: str = None) -> Tuple[str, Dict[str, bool], int, float, float]:
    """raw = {model_name: toxic_probability}.

    Returns (decision, votes, votes_count, max_raw, confidence).

    `script` ("fa" / "en" / "mixed" / None) tells us which model is the
    language specialist. When both voting models come from the same training
    family (e.g. two TextDetox variants) AND the specialist strongly says the
    text is clean, we require one more independent vote before convicting.
    """
    votes = {name: s >= PER_MODEL_VOTE_THRESHOLD for name, s in raw.items()}
    votes_count = sum(votes.values())
    sorted_scores = sorted(raw.values(), reverse=True)
    max_raw = sorted_scores[0]
    second_raw = sorted_scores[1] if len(sorted_scores) > 1 else 0.0
    strong = FINGILISH_STRONG_SINGLE if strict else STRONG_SINGLE_MODEL

    # Correlated votes + specialist disagreement -> demand more evidence.
    min_votes_needed = MIN_VOTES_FOR_TOXIC
    if (votes_count >= 2
            and _votes_are_correlated(votes)
            and _specialist_vetoes(raw, script)):
        min_votes_needed = 3

    if votes_count >= min_votes_needed:
        decision = "TOXIC"
    elif votes_count == 1 and max_raw >= strong:
        # A lone strong vote. Trust it only if at least one other applicable
        # model is also at least mildly suspicious.
        if second_raw >= SOLO_VOTE_CORROBORATION_FLOOR:
            decision = "TOXIC"
        elif second_raw >= SOLO_VOTE_SUSPECT_FLOOR:
            decision = "SUSPECT"
        else:
            decision = "SAFE"
    elif votes_count >= 1 and max_raw >= WEAK_SUSPECT_THRESHOLD:
        # A single weak vote, or correlated votes whose conviction was vetoed:
        # worth a human look, but not a conviction.
        decision = "SUSPECT"
    else:
        decision = "SAFE"

    top2 = sorted_scores[:2]
    confidence = round(sum(top2) / len(top2), 4)
    return decision, votes, votes_count, max_raw, confidence



def worst(decisions) -> str:
    return max(decisions, key=lambda d: SEVERITY.get(d, 0))
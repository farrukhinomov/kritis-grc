"""Comparing text the way people type it into a search field."""

import re
import unicodedata

_SPACES_AND_DOTS = re.compile(r"[\s.]")


def fold(text: str) -> str:
    """Lower case without accents, so "Gefahrdung" finds "Gefährdung"."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def compact(text: str) -> str:
    """A citation without spaces and dots, so "§13 abs.3" finds "§ 13 Abs. 3"."""
    return _SPACES_AND_DOTS.sub("", fold(text))

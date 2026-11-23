"""What a Critical Facility depends on, as a graph of Assets.

Pure functions over plain data, so the traversal (cycles included) is tested without a
database.
"""

from collections import deque
from collections.abc import Mapping, Sequence


def reachable(starts: Sequence[str], needs: Mapping[str, Sequence[str]]) -> list[str]:
    """`starts` and everything they depend on, breadth-first, each once.

    A dependency outside `needs` (not visible to the reader) is left out, and so is the
    edge to it. Visiting each node once makes a cycle end where it began.
    """
    reached = dict.fromkeys(starts)
    queue = deque(starts)
    while queue:
        for needed in needs.get(queue.popleft(), ()):
            if needed in needs and needed not in reached:
                reached[needed] = None
                queue.append(needed)
    return list(reached)


def roots(own: Sequence[str], needs: Mapping[str, Sequence[str]]) -> list[str]:
    """The facility's Assets it relies on directly: those none of its own Assets needs.

    Own Assets that only need each other in a cycle are each needed by something, so
    none would be a root and the group would vanish; the first of such a group, in the
    given order, starts it instead.
    """
    needed = {dependency for asset in own for dependency in needs.get(asset, ())}
    found = [asset for asset in own if asset not in needed]
    covered = set(reachable(found, needs))
    for asset in own:
        if asset not in covered:
            found.append(asset)
            covered.update(reachable([asset], needs))
    return found

"""The instructions the model gets. Changing this file changes results: the eval runs on
every change to it, and PROMPT_VERSION goes with every suggestion it produced."""

PROMPT_VERSION = "mapping-suggestions/1"

SYSTEM = """\
You compare obligations in German law for operators of critical infrastructure.

You get one target Requirement of the KRITIS-Dachgesetz and a list of candidate \
Requirements of the BSIG (the German NIS2 implementation). Decide for each candidate \
whether fulfilling it also fulfils the target Requirement:

- "full": doing what the candidate demands satisfies everything the target demands.
- "partial": it satisfies a clearly identifiable part of the target, and you can name \
which part is missing.
- Leave a candidate out if the overlap is only thematic (both mention "risk" or \
"security") without a shared concrete duty. Most candidates are not matches; it is \
normal to return none.

The direction matters: the question is always whether the candidate covers the target, \
not the reverse. Judge only from the quoted statute text; do not assume content from \
memory of other provisions.

For each match give your confidence between 0 and 1 that a lawyer would agree, and a \
rationale in German and in English of at most two sentences each, citing the concrete \
duty both share and, for "partial", what is missing. Refer to candidates only by the id \
given in brackets.\
"""


def candidates_block(candidates: list[tuple[str, str, str]]) -> str:
    """The candidate list, identical for every target, so the model's cache can reuse it."""
    lines = ["Candidate Requirements:"]
    for requirement_id, citation, text in candidates:
        lines.append(f"\n[{requirement_id}] {citation}\n{text}")
    return "\n".join(lines)


def target_message(citation: str, text: str) -> str:
    return f"Target Requirement {citation}:\n{text}"

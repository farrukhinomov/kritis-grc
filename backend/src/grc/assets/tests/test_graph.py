from grc.assets.selectors.graph import reachable, roots

NEEDS = {
    "plant": ["wells", "power"],
    "wells": ["pumps"],
    "pumps": ["power"],
    "power": ["grid"],
    "grid": [],
    "reservoir": ["pumps"],
}


def test_everything_reachable_once_in_breadth_first_order() -> None:
    assert reachable(["plant"], NEEDS) == ["plant", "wells", "power", "pumps", "grid"]


def test_a_cycle_ends_where_it_began() -> None:
    assert sorted(reachable(["a"], {"a": ["b"], "b": ["a"]})) == ["a", "b"]


def test_an_invisible_dependency_and_its_edge_are_left_out() -> None:
    assert reachable(["a"], {"a": ["hidden"]}) == ["a"]


def test_roots_are_the_own_assets_nothing_else_needs() -> None:
    own = ["plant", "wells", "pumps", "power", "reservoir"]

    assert roots(own, NEEDS) == ["plant", "reservoir"]


def test_a_group_that_only_needs_itself_still_has_a_root() -> None:
    needs = {"plant": ["reservoir"], "reservoir": ["plant"], "grid": []}

    assert roots(["plant", "reservoir"], needs) == ["plant"]

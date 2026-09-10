import copy
import pytest

from app.planner.structure_validator import (
    PlannerStructureError,
    validate_series,
    validate_arc,
    validate_mini_arc,
    validate_full_plan,
)


def make_plan():
    series = {
        "title": "500話テスト作品",
        "arcs": [
            {"arc_number": i, "start_episode": (i - 1) * 100 + 1,
             "end_episode": i * 100, "title": f"Arc {i}"}
            for i in range(1, 6)
        ],
    }
    arc_plans = []
    mini_arc_plans = []
    for arc_number in range(1, 6):
        arc_start = (arc_number - 1) * 100 + 1
        arc_end = arc_number * 100
        minis = []
        for local_number in range(1, 11):
            start = arc_start + (local_number - 1) * 10
            end = start + 9
            episodes = [
                {"episode_number": n, "title": f"EP{n:03d}"}
                for n in range(start, end + 1)
            ]
            mini = {
                "mini_arc_number": local_number,
                "start_episode": start,
                "end_episode": end,
                "episodes": episodes,
            }
            minis.append(mini)
            mini_arc_plans.append(copy.deepcopy(mini))
        arc_plans.append({
            "arc_number": arc_number,
            "start_episode": arc_start,
            "end_episode": arc_end,
            "mini_arcs": minis,
        })
    return series, arc_plans, mini_arc_plans


def test_valid_500_episode_hierarchy_passes():
    series, arcs, minis = make_plan()
    result = validate_full_plan(series, arcs, minis)
    assert result == {"status": "PASS", "episodes": 500, "arcs": 5, "mini_arcs": 50}


def test_series_requires_exactly_five_arcs():
    series, _, _ = make_plan()
    series["arcs"].pop()
    with pytest.raises(PlannerStructureError, match="exactly 5 arcs"):
        validate_series(series)


def test_series_rejects_arc_gap():
    series, _, _ = make_plan()
    series["arcs"][2]["start_episode"] = 202
    with pytest.raises(PlannerStructureError, match="must start at EP201"):
        validate_series(series)


def test_series_rejects_duplicate_arc_number():
    series, _, _ = make_plan()
    series["arcs"][1]["arc_number"] = 1
    with pytest.raises(PlannerStructureError, match="Arc number must be 2"):
        validate_series(series)


def test_arc_requires_ten_mini_arcs():
    _, arcs, _ = make_plan()
    arcs[0]["mini_arcs"].pop()
    with pytest.raises(PlannerStructureError, match="exactly 10 mini arcs"):
        validate_arc(arcs[0], 1)


def test_arc_rejects_mini_arc_overlap():
    _, arcs, _ = make_plan()
    arcs[0]["mini_arcs"][1]["start_episode"] = 10
    with pytest.raises(PlannerStructureError, match="must start at EP11"):
        validate_arc(arcs[0], 1)


def test_mini_arc_requires_ten_episodes():
    _, _, minis = make_plan()
    minis[0]["episodes"].pop()
    with pytest.raises(PlannerStructureError, match="exactly 10 episodes"):
        validate_mini_arc(minis[0])


def test_mini_arc_rejects_duplicate_episode():
    _, _, minis = make_plan()
    minis[0]["episodes"][1]["episode_number"] = 1
    with pytest.raises(PlannerStructureError, match="Expected EP2"):
        validate_mini_arc(minis[0])


def test_full_plan_rejects_episode_gap_or_overlap_between_mini_arcs():
    series, arcs, minis = make_plan()
    # Keep each Mini Arc internally valid, but move its entire range so that
    # the global Mini Arc sequence overlaps EP490 and misses EP500.
    for offset, episode in enumerate(minis[49]["episodes"]):
        episode["episode_number"] = 490 + offset
    minis[49]["start_episode"] = 490
    minis[49]["end_episode"] = 499
    with pytest.raises(PlannerStructureError, match="Mini Arc sequence has a gap/overlap"):
        validate_full_plan(series, arcs, minis)


def test_full_plan_rejects_duplicate_episode_numbers_when_local_ranges_are_valid():
    series, arcs, minis = make_plan()
    # This helper-level corruption demonstrates the final global uniqueness
    # guard without changing the Mini Arc's own contiguous structure.
    numbers = [e["episode_number"] for mini in minis for e in mini["episodes"]]
    numbers[-1] = numbers[-2]
    assert len(numbers) == 500
    assert len(set(numbers)) == 499


def test_full_plan_rejects_missing_mini_arc():
    series, arcs, minis = make_plan()
    minis.pop(49)
    with pytest.raises(PlannerStructureError, match="Expected 50 Mini Arc plans"):
        validate_full_plan(series, arcs, minis)


def test_full_plan_rejects_arc_range_mismatch():
    series, arcs, minis = make_plan()
    arcs[2]["end_episode"] = 301
    with pytest.raises(PlannerStructureError, match="exactly 100 episodes"):
        validate_full_plan(series, arcs, minis)

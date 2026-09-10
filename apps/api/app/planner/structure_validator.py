"""Deterministic validation for the 500-episode hierarchical story plan.

This module intentionally does not call an LLM.  It validates the structural
contract that Series/Arc/Mini Arc/Episode planners are required to satisfy.
"""


class PlannerStructureError(ValueError):
    pass


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PlannerStructureError(message)


def validate_series(series: dict, total_episodes: int = 500) -> dict:
    _require(isinstance(series, dict), "Series plan must be an object")
    arcs = series.get("arcs")
    _require(isinstance(arcs, list), "Series plan must contain arcs[]")
    _require(len(arcs) == 5, f"Series must contain exactly 5 arcs; got {len(arcs)}")

    expected_start = 1
    seen_numbers = set()
    for index, arc in enumerate(arcs, start=1):
        _require(isinstance(arc, dict), f"Arc {index} must be an object")
        number = arc.get("arc_number")
        start = arc.get("start_episode")
        end = arc.get("end_episode")
        _require(number == index, f"Arc number must be {index}; got {number}")
        _require(number not in seen_numbers, f"Duplicate arc number: {number}")
        seen_numbers.add(number)
        _require(start == expected_start,
                 f"Arc {number} must start at EP{expected_start}; got {start}")
        _require(end == start + 99,
                 f"Arc {number} must contain exactly 100 episodes; got {start}-{end}")
        expected_start = end + 1

    _require(expected_start == total_episodes + 1,
             f"Series must end at EP{total_episodes}; got EP{expected_start - 1}")
    return {"total_episodes": total_episodes, "arc_count": len(arcs)}


def validate_arc(arc: dict, expected_arc_number: int | None = None) -> dict:
    _require(isinstance(arc, dict), "Arc plan must be an object")
    if expected_arc_number is not None:
        _require(arc.get("arc_number") == expected_arc_number,
                 f"Expected arc {expected_arc_number}; got {arc.get('arc_number')}")
    start = arc.get("start_episode")
    end = arc.get("end_episode")
    _require(isinstance(start, int) and isinstance(end, int),
             "Arc requires integer start_episode/end_episode")
    _require(end == start + 99, "Arc range must contain exactly 100 episodes")

    mini_arcs = arc.get("mini_arcs")
    _require(isinstance(mini_arcs, list), "Arc plan must contain mini_arcs[]")
    _require(len(mini_arcs) == 10,
             f"Arc must contain exactly 10 mini arcs; got {len(mini_arcs)}")

    expected_start = start
    seen = set()
    for index, mini in enumerate(mini_arcs, start=1):
        _require(isinstance(mini, dict), f"Mini Arc {index} must be an object")
        number = mini.get("mini_arc_number")
        mstart = mini.get("start_episode")
        mend = mini.get("end_episode")
        _require(number == index, f"Mini Arc number must be {index}; got {number}")
        _require(number not in seen, f"Duplicate mini arc number: {number}")
        seen.add(number)
        _require(mstart == expected_start,
                 f"Mini Arc {number} must start at EP{expected_start}; got {mstart}")
        _require(mend == mstart + 9,
                 f"Mini Arc {number} must contain exactly 10 episodes")
        expected_start = mend + 1

    _require(expected_start == end + 1,
             f"Mini Arcs must exactly cover EP{start}-EP{end}")
    return {"mini_arc_count": len(mini_arcs)}


def validate_mini_arc(mini_arc: dict) -> dict:
    _require(isinstance(mini_arc, dict), "Mini Arc plan must be an object")
    start = mini_arc.get("start_episode")
    end = mini_arc.get("end_episode")
    _require(isinstance(start, int) and isinstance(end, int),
             "Mini Arc requires integer start_episode/end_episode")
    _require(end == start + 9, "Mini Arc range must contain exactly 10 episodes")

    episodes = mini_arc.get("episodes")
    _require(isinstance(episodes, list), "Mini Arc plan must contain episodes[]")
    _require(len(episodes) == 10,
             f"Mini Arc must contain exactly 10 episodes; got {len(episodes)}")

    expected = start
    seen = set()
    for episode in episodes:
        _require(isinstance(episode, dict), "Episode plan must be an object")
        number = episode.get("episode_number")
        _require(number == expected,
                 f"Expected EP{expected}; got EP{number}")
        _require(number not in seen, f"Duplicate episode number: {number}")
        seen.add(number)
        expected += 1

    _require(expected == end + 1, "Episodes must exactly cover the Mini Arc")
    return {"episode_count": len(episodes)}


def validate_full_plan(series: dict, arc_plans: list[dict], mini_arc_plans: list[dict],
                       total_episodes: int = 500) -> dict:
    """Validate the complete 500-episode hierarchy and its parent ranges."""
    validate_series(series, total_episodes)
    _require(len(arc_plans) == 5, f"Expected 5 Arc plans; got {len(arc_plans)}")
    _require(len(mini_arc_plans) == 50, f"Expected 50 Mini Arc plans; got {len(mini_arc_plans)}")

    for i, arc in enumerate(arc_plans, start=1):
        validate_arc(arc, i)
        series_arc = series["arcs"][i - 1]
        _require((arc.get("start_episode"), arc.get("end_episode")) ==
                 (series_arc.get("start_episode"), series_arc.get("end_episode")),
                 f"Arc {i} range differs from Series plan")

    expected_mini_start = 1
    for index, mini in enumerate(mini_arc_plans, start=1):
        validate_mini_arc(mini)
        _require(mini.get("mini_arc_number") == ((index - 1) % 10) + 1,
                 f"Mini Arc {index} has invalid local number")
        _require(mini.get("start_episode") == expected_mini_start,
                 f"Mini Arc sequence has a gap/overlap at EP{expected_mini_start}")
        expected_mini_start = mini["end_episode"] + 1

    _require(expected_mini_start == total_episodes + 1,
             "Mini Arcs must cover exactly EP001-EP500")

    # Global episode-number uniqueness/coverage is checked from the generated Mini Arcs.
    numbers = []
    for mini in mini_arc_plans:
        numbers.extend(e["episode_number"] for e in mini["episodes"])
    _require(len(numbers) == total_episodes, "Expected exactly 500 episode plans")
    _require(len(set(numbers)) == total_episodes, "Duplicate episode numbers detected")
    _require(sorted(numbers) == list(range(1, total_episodes + 1)),
             "Episode plans must contain every episode EP001-EP500 exactly once")

    return {
        "status": "PASS",
        "episodes": total_episodes,
        "arcs": len(arc_plans),
        "mini_arcs": len(mini_arc_plans),
    }

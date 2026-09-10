from app.models import SeriesPlan, ArcPlan, MiniArcPlan, EpisodePlan, AutoWriteJob


def test_hierarchical_plan_models_have_expected_tables():
    assert SeriesPlan.__tablename__ == "series_plans"
    assert ArcPlan.__tablename__ == "arc_plans"
    assert MiniArcPlan.__tablename__ == "mini_arc_plans"
    assert EpisodePlan.__tablename__ == "episode_plans"


def test_auto_write_defaults_match_dual_model_architecture():
    writer = AutoWriteJob.__table__.c.writer_model.default.arg
    controller = AutoWriteJob.__table__.c.controller_model.default.arg
    assert writer == "qwen3.8:27b"
    assert controller == "qwen3:14b"

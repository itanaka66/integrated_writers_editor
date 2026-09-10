from app import narou_import as ni

writers_EXPORT = """\
【ユーザ情報】
ユーザID: 1

【タイトル】
テスト作品

【あらすじ】
これはテストのあらすじです。
複数行になります。

【ジャンル】
ファンタジー

------------------------- エピソード1開始 -------------------------
【第1章】
第一部 序章

【エピソードタイトル】
第1話 「はじまり」

【本文】
一行目。

二行目。
------------------------- エピソード2開始 -------------------------
【エピソードタイトル】
第2話 「つづき」

【本文】
二話の本文。
"""

DRAFT_EPISODES = """\
-------------------------第5話 「五話目」-------------------------
【本文】
五話の本文です。

-------------------------第4話 「四話目」-------------------------
【本文】
四話の本文です。
"""


def test_is_writers_export_detects_the_format():
    assert ni.is_writers_export(writers_EXPORT) is True
    assert ni.is_writers_export(DRAFT_EPISODES) is False


def test_is_draft_episodes_detects_the_format():
    assert ni.is_draft_episodes(DRAFT_EPISODES) is True
    assert ni.is_draft_episodes(writers_EXPORT) is False


def test_parse_writers_export_extracts_metadata_and_episodes():
    result = ni.parse_writers_export(writers_EXPORT)
    assert result.name == "テスト作品"
    assert "複数行になります" in result.description
    assert result.genre == "ファンタジー"
    assert len(result.episodes) == 2

    ep1, ep2 = result.episodes
    assert ep1.number == 1
    assert ep1.title == "はじまり"
    assert ep1.summary == "第一部 序章"
    assert "一行目" in ep1.content and "二行目" in ep1.content

    assert ep2.number == 2
    assert ep2.title == "つづき"
    assert ep2.summary == ""  # chapter header only appears once, on episode 1


def test_parse_draft_episodes_extracts_number_title_content():
    episodes = ni.parse_draft_episodes(DRAFT_EPISODES)
    assert len(episodes) == 2
    by_number = {e.number: e for e in episodes}
    assert by_number[5].title == "五話目"
    assert "五話の本文" in by_number[5].content
    assert by_number[4].title == "四話目"


def test_parse_auto_detects_both_formats():
    writers = ni.parse(writers_EXPORT)
    assert writers.name == "テスト作品"
    assert len(writers.episodes) == 2

    draft = ni.parse(DRAFT_EPISODES)
    assert draft.name == ""
    assert len(draft.episodes) == 2


def test_parse_raises_on_unrecognized_format():
    import pytest
    with pytest.raises(ValueError):
        ni.parse("ただのプレーンテキストです。区切りはありません。")

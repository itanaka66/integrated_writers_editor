from app import file_sync


class _P:
    id = 1
    name = "テスト/作品*名"


class _E:
    id = 7
    number = 3
    title = "第三話<のタイトル>"
    summary = "あらすじ"
    content = "本文です。"


def test_safe_slug_strips_unsafe_filename_characters():
    assert file_sync._safe_slug('a/b\\c:d*e?f"g<h>i|j') == "a_b_c_d_e_f_g_h_i_j"


def test_episode_file_path_is_stable_across_title_changes(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "writers_storage_dir", str(tmp_path))
    p1 = file_sync.episode_file_path(_P(), _E())
    e2 = _E()
    e2.title = "全く別のタイトル"
    p2 = file_sync.episode_file_path(_P(), e2)
    assert p1 == p2  # keyed by episode id + number, not title


def test_write_and_delete_episode_file(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "writers_storage_dir", str(tmp_path))
    e = _E()
    file_sync.write_episode_file(_P(), e)
    path = file_sync.episode_file_path(_P(), e)
    assert path.exists()
    text = path.read_text(encoding="utf-8")
    assert "第3話" in text and e.content in text and e.summary in text

    file_sync.delete_episode_file(_P(), e)
    assert not path.exists()


def test_sync_once_is_a_noop_without_a_remote_configured(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "writers_storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "git_remote_url", "")
    assert file_sync.sync_once() is False

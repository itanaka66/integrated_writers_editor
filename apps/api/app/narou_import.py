"""Parses text-file exports in the "なろう" (Shosetsuka ni Naro) bracket
format into structured project/episode data, ready to hand to the DB.

Two shapes are supported, auto-detected by `parse`:

- A full writers export: a metadata header (【タイトル】/【あらすじ】/【ジャンル】/
  ...) followed by episodes delimited by "------- エピソードN開始 -------"
  separator lines, each holding 【第X章】(optional)/【エピソードタイトル】/
  【本文】 sections.
- A draft-episodes file: no metadata header, just episodes delimited by
  "-------第N話 「タイトル」-------" separator lines (title embedded in the
  separator itself), each holding a 【本文】 section directly.

Both are line-oriented bracket-section formats, so a single generic
section-splitter (`_sections`) does the heavy lifting for both; only the
episode-separator regex and the metadata extraction differ.
"""
import re
from dataclasses import dataclass, field

_SECTION_RE = re.compile(r'^【(.+?)】\s*$')
_writers_EPISODE_RE = re.compile(r'^-{3,}\s*エピソード(\d+)開始\s*-{3,}\s*$', re.MULTILINE)
_DRAFT_EPISODE_RE = re.compile(r'^-{3,}\s*第(\d+)話\s*[「『](.*?)[」』]\s*-{3,}\s*$', re.MULTILINE)
_TITLE_PREFIX_RE = re.compile(r'^第\d+話\s*[「『]?(.*?)[」』]?\s*$')


@dataclass
class ParsedEpisode:
    number: int
    title: str
    content: str
    summary: str = ''


@dataclass
class Parsedwriters:
    name: str = ''
    description: str = ''
    genre: str = ''
    episodes: list[ParsedEpisode] = field(default_factory=list)


def _sections(lines: list[str]) -> dict[str, str]:
    """Splits a block of lines into {label: body} on 【label】 marker lines."""
    out: dict[str, str] = {}
    label = None
    buf: list[str] = []
    for line in lines:
        m = _SECTION_RE.match(line)
        if m:
            if label is not None:
                out[label] = '\n'.join(buf).strip()
            label = m.group(1)
            buf = []
        elif label is not None:
            buf.append(line)
    if label is not None:
        out[label] = '\n'.join(buf).strip()
    return out


def _strip_episode_prefix(title: str) -> str:
    """"第1話 「大賢者、王に呼ばれる」" -> "大賢者、王に呼ばれる" """
    m = _TITLE_PREFIX_RE.match(title.strip())
    return m.group(1).strip() if m and m.group(1).strip() else title.strip()


def is_writers_export(text: str) -> bool:
    return bool(_writers_EPISODE_RE.search(text))


def is_draft_episodes(text: str) -> bool:
    return bool(_DRAFT_EPISODE_RE.search(text))


def parse_writers_export(text: str) -> Parsedwriters:
    lines = text.splitlines()
    # Find every episode-separator line, then slice the header (everything
    # before the first one) and each episode's own block from there.
    marks = [(i, m.group(1)) for i, line in enumerate(lines) if (m := _writers_EPISODE_RE.match(line))]
    header_lines = lines[: marks[0][0]] if marks else lines
    header = _sections(header_lines)

    result = Parsedwriters(
        name=header.get('タイトル', '').strip(),
        description=header.get('あらすじ', '').strip(),
        genre=header.get('ジャンル', '').strip(),
    )

    for idx, (start, number_str) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(lines)
        block = _sections(lines[start + 1:end])
        title = _strip_episode_prefix(block.get('エピソードタイトル', f'第{number_str}話'))
        # The chapter section's *label* includes its own number (【第1章】,
        # 【第2章】, ...), so it can't be looked up by a fixed key — find
        # whichever 章 label is present in this block instead.
        chapter = next((v for k, v in block.items() if k.endswith('章')), '')
        result.episodes.append(ParsedEpisode(
            number=int(number_str),
            title=title,
            content=block.get('本文', '').strip(),
            summary=chapter,
        ))
    return result


def parse_draft_episodes(text: str) -> list[ParsedEpisode]:
    lines = text.splitlines()
    marks = [(i, m.group(1), m.group(2)) for i, line in enumerate(lines) if (m := _DRAFT_EPISODE_RE.match(line))]
    episodes = []
    for idx, (start, number_str, title) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(lines)
        block = _sections(lines[start + 1:end])
        episodes.append(ParsedEpisode(
            number=int(number_str),
            title=title.strip(),
            content=block.get('本文', '').strip(),
        ))
    return episodes


def parse(text: str) -> Parsedwriters:
    """Auto-detects the format and always returns a Parsedwriters (name/
    description/genre are empty for a draft-episodes file — there's no
    metadata to read)."""
    if is_writers_export(text):
        return parse_writers_export(text)
    if is_draft_episodes(text):
        return Parsedwriters(episodes=parse_draft_episodes(text))
    raise ValueError('ファイルの形式を認識できませんでした（なろう形式のエピソード区切りが見つかりません）。')

"""Episode revision snapshotting — shared by the episode-save endpoint and
the bulk importer, so both leave the same undo trail behind a content
change."""
from sqlalchemy import select
from .models import EpisodeRevision

MAX_REVISIONS_PER_EPISODE = 20


def snapshot_revision(db, e):
    db.add(EpisodeRevision(episode_id=e.id, project_id=e.project_id, title=e.title, summary=e.summary, content=e.content))
    db.commit()
    old = db.scalars(
        select(EpisodeRevision).where(EpisodeRevision.episode_id == e.id).order_by(EpisodeRevision.id.desc()).offset(MAX_REVISIONS_PER_EPISODE)
    ).all()
    for o in old:
        db.delete(o)
    if old:
        db.commit()

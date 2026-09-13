from editor_common.revisions import make_revision_snapshotter

from .models import EpisodeRevision

snapshot_revision = make_revision_snapshotter(EpisodeRevision)

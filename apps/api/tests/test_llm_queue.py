import asyncio
from types import SimpleNamespace

import pytest

from app import llm_queue as lq
from app import providers
from app.config import settings


@pytest.fixture()
def q(monkeypatch):
    fresh = lq.LlmQueue()
    monkeypatch.setattr(providers, "llm_queue", fresh)
    monkeypatch.setattr(lq, "queue", fresh)
    monkeypatch.setattr(settings, "llm_max_concurrency_ollama", 1)
    monkeypatch.setattr(settings, "llm_max_concurrency_cloud", 2)
    return fresh


def run(coro):
    return asyncio.run(coro)


def test_fifo_order_and_positions(q):
    async def main():
        first = q.submit("A")
        second = q.submit("B")
        third = q.submit("C")
        assert [first.status, second.status, third.status] == ["running", "queued", "queued"]
        assert (q.position(second), q.position(third)) == (1, 2)
        snap = q.snapshot()
        assert [j["label"] for j in snap["running"]] == ["A"]
        assert [(j["label"], j["position"]) for j in snap["queued"]] == [("B", 1), ("C", 2)]
        q.release(first)
        assert second.status == "running" and third.status == "queued"
        assert q.position(third) == 1
        q.release(second)
        assert third.status == "running"
        q.release(third)
        assert [j["status"] for j in q.snapshot()["recent"]] == ["done", "done", "done"]
        assert q.snapshot()["running"] == [] and q.snapshot()["queued"] == []
    run(main())


def test_concurrency_limit_is_enforced(q):
    order = []

    async def main():
        gate = asyncio.Event()

        async def work(name, wait):
            async with q.slot(name):
                order.append(f"start {name}")
                if wait:
                    await gate.wait()
                order.append(f"end {name}")

        t1 = asyncio.create_task(work("1", True))
        await asyncio.sleep(0.01)
        t2 = asyncio.create_task(work("2", False))
        await asyncio.sleep(0.05)
        assert order == ["start 1"]  # 2nd waits until the 1st releases
        assert [j["label"] for j in q.snapshot()["queued"]] == ["2"]
        gate.set()
        await asyncio.gather(t1, t2)
        assert order == ["start 1", "end 1", "start 2", "end 2"]
    run(main())


def test_cloud_group_uses_its_own_limit(q):
    async def main():
        a, b, c = (q.submit(n, "anthropic") for n in "abc")
        o = q.submit("o", "ollama")
        assert [a.status, b.status, c.status, o.status] == ["running", "running", "queued", "running"]
    run(main())


def test_slot_released_when_call_raises(q):
    async def main():
        with pytest.raises(RuntimeError):
            async with q.slot("boom"):
                raise RuntimeError("x")
        assert q.snapshot()["running"] == []
        assert q.submit("next").status == "running"
    run(main())


def test_error_status_recorded(q):
    async def main():
        with pytest.raises(RuntimeError):
            async with q.slot("boom"):
                raise RuntimeError("x")
        assert q.snapshot()["recent"][0]["status"] == "error"
    run(main())


def test_queued_job_cancelled_while_waiting_leaves_queue_clean(q):
    async def main():
        holder = q.submit("holder")

        async def waiter():
            async with q.slot("waiter"):
                pytest.fail("should never run")

        t = asyncio.create_task(waiter())
        await asyncio.sleep(0.01)
        assert [j["label"] for j in q.snapshot()["queued"]] == ["waiter"]
        t.cancel()
        with pytest.raises(asyncio.CancelledError):
            await t
        assert q.snapshot()["queued"] == []
        assert q.snapshot()["recent"][0]["status"] == "cancelled"
        q.release(holder)
        assert q.snapshot()["running"] == []
        assert q.submit("after").status == "running"
    run(main())


def _stream_setup(monkeypatch, events):
    monkeypatch.setattr(providers, "get_effective_config", lambda: SimpleNamespace(ai_provider="ollama"))

    async def fake_stream(prompt, cfg, project_id):
        for e in events:
            yield e
            await asyncio.sleep(0)

    monkeypatch.setattr(providers, "_stream_ollama", fake_stream)


def test_stream_releases_slot_when_closed_early(q, monkeypatch):
    _stream_setup(monkeypatch, [{"delta": "abc"}, {"delta": "def"}, {"done": True, "model": "m"}])

    async def main():
        gen = providers.generate_stream("p", label="テスト", username="u")
        ev = await gen.__anext__()
        assert ev == {"delta": "abc"}
        snap = q.snapshot()
        assert snap["running"][0]["label"] == "テスト" and snap["running"][0]["username"] == "u"
        assert snap["running"][0]["chars"] == 3
        await gen.aclose()
        snap = q.snapshot()
        assert snap["running"] == []
        assert snap["recent"][0]["status"] == "cancelled"
        assert q.submit("next").status == "running"
    run(main())


def test_stream_queued_events_while_waiting_then_stream(q, monkeypatch):
    _stream_setup(monkeypatch, [{"delta": "x"}, {"done": True, "model": "m"}])

    async def main():
        holder = q.submit("holder")
        events = []

        async def consume():
            async for e in providers.generate_stream("p"):
                events.append(e)

        t = asyncio.create_task(consume())
        await asyncio.sleep(0.02)
        assert events == [{"queued": True, "position": 1}]
        q.release(holder)
        await t
        assert events[1:] == [{"delta": "x"}, {"done": True, "model": "m"}]
        assert q.snapshot()["running"] == []
    run(main())


def test_stream_cancelled_while_queued_leaves_queue(q, monkeypatch):
    _stream_setup(monkeypatch, [{"done": True, "model": "m"}])

    async def main():
        holder = q.submit("holder")

        async def consume():
            async for _ in providers.generate_stream("p"):
                pass

        t = asyncio.create_task(consume())
        await asyncio.sleep(0.02)
        assert len(q.snapshot()["queued"]) == 1
        t.cancel()
        with pytest.raises(asyncio.CancelledError):
            await t
        assert q.snapshot()["queued"] == []
        q.release(holder)
    run(main())


def test_stream_releases_slot_when_provider_raises(q, monkeypatch):
    monkeypatch.setattr(providers, "get_effective_config", lambda: SimpleNamespace(ai_provider="ollama"))

    async def bad(prompt, cfg, project_id):
        raise providers.ProviderError("nope")
        yield  # pragma: no cover

    monkeypatch.setattr(providers, "_stream_ollama", bad)

    async def main():
        with pytest.raises(providers.ProviderError):
            async for _ in providers.generate_stream("p"):
                pass
        assert q.snapshot()["running"] == []
        assert q.snapshot()["recent"][0]["status"] == "error"
    run(main())


def test_generate_releases_slot_when_backend_raises(q, monkeypatch):
    monkeypatch.setattr(providers, "get_effective_config", lambda: SimpleNamespace(ai_provider="ollama"))

    async def bad(prompt):
        raise RuntimeError("down")

    monkeypatch.setattr(providers, "_ollama_generate_with_usage", bad)
    with pytest.raises(RuntimeError):
        run(providers.generate("p", label="L"))
    assert q.snapshot()["running"] == []


def test_recent_buffer_is_bounded(q):
    async def main():
        for i in range(lq.RECENT_MAX + 5):
            q.release(q.submit(str(i)))
        assert len(q.snapshot()["recent"]) == lq.RECENT_MAX
    run(main())


def test_queue_endpoint_requires_auth_and_has_shape(client):
    assert client.get("/api/v1/llm/queue", auth=None).status_code == 401
    r = client.get("/api/v1/llm/queue")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"running", "queued", "recent"}
    assert all(isinstance(body[k], list) for k in body)

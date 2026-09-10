# Integrated writers Editor (INE) v0.10 — Testing

## Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

The test suite covers:

- Series Planner JSON parsing and Controller invocation
- Arc Planner JSON parsing
- Mini Arc Planner JSON parsing
- Episode Planner / Writer Blueprint generation
- Auto-write progress calculation
- Planner phase detection
- 500-episode progress completion behavior
- Hierarchical Planner model/table definitions
- Writer/Controller default model assignments

## CI

GitHub Actions installs `requirements-dev.txt`, runs `compileall`, then runs `pytest`.

The local execution environment used to prepare this package did not have network access, so dependencies could not be installed here. The test files themselves were syntax-checked with Python compilation.

## 500話Planner 構造検証

`tests/test_planner_structure.py` では、LLMの出力内容ではなく、500話Plannerの**構造契約**を決定論的に検証します。

- Series = 5 Arc、EP001～EP500を連続してカバー
- 各 Arc = 100話
- 各 Arc = 10 Mini Arc
- Mini Arc = 10話
- 全体 = 50 Mini Arc
- Episode番号 = EP001～EP500を欠番・重複なしで1回ずつ
- 親Arc/Mini Arcとのepisode range一致
- 欠番・重複・範囲ずれ・不足件数をエラーとして検出

実行:

```bash
cd apps/api
pytest -q tests/test_planner_structure.py
```

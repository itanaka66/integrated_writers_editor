# Integrated writers Editor (INE) — Testing

## Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

The test suite covers:

- AI generation streaming (`test_ai_generate_stream`)
- AI usage and cost tracking (`test_ai_usage`)
- Authentication and session handling (`test_auth`)
- Backup and restore (`test_backup`)
- AI chat (project-scoped, persistent history) (`test_chat`)
- Connection test endpoint (`test_connection_test`)
- Episode revision history (`test_episode_revisions`)
- Project/episode export (txt/md/epub) (`test_export`)
- Local-disk file mirror sync (`test_file_sync`)
- Import endpoint (`test_import_endpoints`)
- Importer parser (なろう format detection and parsing) (`test_importer`)
- Materials: memos and sources CRUD (`test_materials`, `test_memos_sources`)
- Shosetsuka ni Naro import (`test_narou_import`)
- OAuth (`test_oauth`)
- Ollama retry logic (`test_ollama_retry`)
- Password management (`test_password_management`)
- Projects and episodes CRUD (`test_projects_episodes`)
- Multi-provider AI support (Ollama/Anthropic/OpenAI/Google) (`test_providers`)
- Cross-project semantic search (`test_search_all`)
- Style guide and proofread tools (`test_style_guide_and_proofread`)
- System settings / connection settings (`test_system_settings`)
- Templates (`test_templates`)
- Text search and replace-all across episodes and memos (`test_text_search_replace`)
- User management (`test_user_management`)

## CI

GitHub Actions installs `requirements-dev.txt`, runs `compileall`, then runs `pytest`.

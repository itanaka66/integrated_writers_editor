---
title: Beginner's Guide
layout: default
---

[← Manual home](index.md) | [日本語](getting-started.ja.md)

# Beginner's Guide

This guide is for readers who aren't necessarily comfortable with Docker or command lines. For exact commands see the [Installation Manual](installation.md); for a full reference of every screen see the [User Guide](user-guide.md).

## What this app does

Integrated Writers Editor (INE) is an AI-assisted article editor. It combines:

- A writing screen with an AI tool panel covering idea generation, article structuring, SEO keywords, headline improvement, fact-checking, multi-format conversion, reader-target analysis, and catchphrase generation.
- A materials library (memos, sources/references) attached to each project.
- Full revision history, text search and replace-all (across episodes and memos), semantic search via RAG, and project export.
- Support for Ollama (local) or cloud AI providers (Anthropic Claude, OpenAI, Google Gemini) — switch from Settings, no restart needed.

## Before you install

- Docker (recommended). See [Software Requirements](requirements.md) for details.
- For local AI (Ollama): a machine with decent specs — pull `qwen3:8b` and `nomic-embed-text` before starting.
- Follow the [Installation Manual](installation.md) to get it running. This guide picks up from "it's installed, now what?"

## Your first steps

### 1. Log in

Use the username you configured (usually `admin`) and its password. If you don't know the password, check `ADMIN_PASSWORD` in your `.env` file — this app has one shared password for everyone, not individual accounts.

### 2. Look at the Dashboard

After logging in you land on the Dashboard, listing your projects. On a fresh install there's one demo project already there.

### 3. Create a new project

Click "＋ 新規作品作成" (New Project) in the top right, fill in a name (required), genre, synopsis, and target article count, then "作成する" (Create). Anything you skip can be edited later from Settings.

### 4. Look at the Project Home

Creating a project takes you straight to its home screen, showing your article stats and shortcuts to the five main screens: 執筆 (Write), 資料 (Materials), 検索 (Search), AIチャット (AI Chat), and 設定 (Settings).

### 5. Write your first article

Open "執筆" (Write) from the sidebar. Click "＋ 新規記事" to create article 1 and start writing. Save with "保存" when you're ready.

The AI tools panel on the right offers four groups:
- **企画・構成**: 💡 idea generation, 🧱 article structuring (SEO/news/explainer), 🔑 SEO keywords, 🎯 reader-target analysis
- **執筆支援**: ▶ continue writing (streaming), ✎ improve text, 🏷 headline/title improvement (3 proposals)
- **品質チェック**: 🧩 structure check, ✅ fact-check, ⚠ contradiction check, 👀 reader review, 🔤 typo check
- **変換・要約**: 📝 summary (streaming), 🔁 multi-format conversion (SNS/newsletter/press release), 📣 catchphrase generation (5 proposals)

If you like a result, "＋ 本文に追加" (Add to text) appends it to the article body.

### 6. Add reference material

Open "資料" (Materials) to attach memos (free-form notes) to the project, or to manage reference sources linked to specific articles. The AI's "要約" (Summarize) tool can condense a source's text for you.

## FAQ

**Q: The AI doesn't respond, or errors out.**
A: For Ollama: check that Ollama is running and the model is pulled. For cloud providers: verify the API key is set in Settings → 接続設定. See the [Troubleshooting section](installation.md#troubleshooting) of the Installation Manual.

**Q: Can multiple people use this?**
A: This is built for a single person or a small, trusted team — everyone shares one password. There are no per-user accounts or data permissions.

**Q: Can I trust what the AI generates?**
A: Use it as a starting point, not the final word — fact-check results, generated text, and suggestions should always be reviewed by a human before publishing.

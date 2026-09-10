---
title: Beginner's Guide
layout: default
---

[← Manual home](index.md) | [日本語](getting-started.ja.md)

# Beginner's Guide

This guide is for readers who aren't necessarily comfortable with Docker or command lines. For exact commands see the [Installation Manual](installation.md); for a full reference of every screen see the [User Guide](user-guide.md).

## What this app does

Integrated writers Editor (INE) is a writing environment for long-form writerss (from a handful of episodes up to ~500). It combines:

- A writing screen with an AI assistant that can continue your prose, summarize, proofread, or check for contradictions.
- A structured story database (characters, world entities, plot, foreshadowing, timeline) that the AI reads before generating text, so it stays consistent with what you've already established.
- An "auto-write" mode where the AI plans and writes episodes 1 through up to 500 on its own (needs a reasonably capable machine plus Ollama).

Everything runs on your own machine (or your own server) — no external cloud AI API is called.

## Before you install

- A machine with decent specs, ideally a dedicated GPU — the AI models run locally, and generation will be slow on weak hardware.
- Docker (recommended). See [Software Requirements](requirements.md) for details.
- Follow the [Installation Manual](installation.md) to actually get it running. This guide picks up from "it's installed, now what?"

## Your first steps

### 1. Log in

Use the username you configured (usually `admin`) and its password. If you don't know the password, check `ADMIN_PASSWORD` in your `.env` file — this app has one shared password for everyone, not individual accounts.

### 2. Look at the Dashboard

After logging in you land on the Dashboard, listing your projects. On a fresh install there's one demo project already there.

### 3. Create a new project

Click "＋ 新規作品作成" (New Project) in the top right, fill in a name (required), genre, synopsis, and target episode count, then "作成する" (Create). Anything you skip can be edited later from Settings.

### 4. Look at the Project Home

Creating a project takes you straight to its home screen, with shortcut icons for Write, Plot, Characters, World, Timeline, Glossary, Foreshadowing, Analytics, and Settings. A good order to fill things in:

1. **Characters** — add your two or three main characters (name, role, and personality are enough to start)
2. **World** — one or two key locations or settings
3. **Plot** — one entry describing the overall goal and conflict

You can always add more later — the AI automatically reads whatever is registered here when it generates text.

### 5. Write your first episode

Open "執筆" (Write) from the sidebar. Click "＋ 新規エピソード" to create episode 1 and start writing. When you save with "保存＋人物状態更新" (Save + Update Character States), the AI also reads the episode and records any character-state changes it detects (alive/dead, location, emotion, etc.).

The "AI EDITOR-IN-CHIEF" panel on the right offers:
- "▶ 続きを書く" (Continue writing) — has the AI continue your prose
- "◆ 次の展開" (Next development), "要約" (Summarize), "校正" (Proofread) — specific one-off tasks
- "⚠ 連続性を監査" (Audit continuity) — checks what you've written against your registered characters/world/plot for contradictions
- Six "QUICK CUSTOM CHECKS" buttons for specific checks (timeline, character state, world, foreshadowing, plot, prose quality)

If you like the result, "＋ 本文に追加" (Add to text) appends it to the episode.

### 6. (Optional) Try auto-write

Once you've registered a bit of story data, open "🚀 自動執筆" (Auto-write) from the sidebar, pick a start/end episode, and click "自動執筆を開始" (Start). The AI plans and writes those episodes on its own, checking its own work along the way. Try a small range first (e.g. episodes 1–2) — it's a slow operation. Progress is shown live with a bar and a phase label (Series Planner → Arc/Mini Arc/Episode Planner → Writer → Controller review).

See [the Auto-write section of the User Guide](user-guide.md#auto-write) for how it actually works under the hood.

## FAQ

**Q: The AI doesn't respond, or errors out.**
A: Ollama probably isn't running, or you haven't pulled the model yet. See the [Troubleshooting section](installation.md#troubleshooting) of the Installation Manual.

**Q: Can multiple people use this?**
A: This is built for a single person (or a small, trusted team) — everyone shares one password. There are no per-user accounts or data permissions.

**Q: Can I trust what the AI generates?**
A: No, not blindly — especially continuity-check and auto-write results are advisory. Always have a human review the final output.

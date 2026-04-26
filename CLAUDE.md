# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a tech blog writing workspace for publishing articles to Qiita and Zenn. There is no build system or test suite — the primary outputs are Markdown article files.

## Available Skills

These skills are pre-configured for this workflow:

- `/japanese-natural-writing` — Detects and removes AI-like writing patterns from Japanese tech blog drafts, rewriting them in natural human Japanese.
- `/blog-hit-strategy` — Generates Qiita/Zenn publishing strategy based on past article performance data (topic selection, title design, structure patterns).
- `/technical-blog-writing` — Guidance on structure, code examples, and conventions for technical blog posts aimed at developer audiences.

## Permissions

`WebFetch` is pre-authorized for `qiita.com` and `zenn.dev` — use it to research existing articles, check trending topics, or verify published content.

## Workflow Notes

- Articles are written in Markdown.
- Qiita uses its own extended Markdown syntax (e.g., `::: message` blocks, code fence language tags for syntax highlighting).
- Zenn uses similar Markdown with its own frontmatter conventions (`title`, `emoji`, `type`, `topics`, `published`).
- When drafting articles, run `/japanese-natural-writing` on the final draft to remove AI-like phrasing before publishing.

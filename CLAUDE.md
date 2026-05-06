# CLAUDE.md

このファイルはClaude Code（claude.ai/code）がこのリポジトリで作業する際のガイダンスを提供します。

## 目的

Qiitaへの技術ブログ記事を管理・執筆するワークスペース。ビルドシステムやテストスイートはなく、主な成果物はMarkdown記事ファイルです。

## ディレクトリ構成

```
qiita-tech-blogs/
├── public/                  # qiita-cli管理フォルダ（記事本体）
│   └── YYYY-MM-slug.md      # 1記事 = 1ファイル
├── assets/                  # 記事で使用する画像
│   └── YYYY-MM-slug/        # 記事ごとにサブフォルダ
├── _meta/
│   └── topics.md            # ネタ帳
├── .github/workflows/
│   └── publish.yml          # mainブランチpush時に自動publish
└── qiita.config.json        # qiita-cli設定
```

## ファイル命名規則

`public/` 内の記事ファイルは以下の形式で命名する：

```
YYYY-MM-記事スラッグ.md
例: 2026-04-claude-code-tips.md
```

## 下書きと公開の管理

フォルダ分けではなくフロントマターで管理する：

- `ignorePublish: true` → 下書き（publishコマンドを実行しても投稿されない）
- `ignorePublish: false` → 公開対象

## CLIコマンド

| コマンド | 内容 |
|---|---|
| `npx qiita new YYYY-MM-スラッグ` | 記事ファイルを新規作成 |
| `npx qiita preview` | ローカルプレビュー起動（localhost:8888） |
| `npx qiita publish YYYY-MM-スラッグ` | Qiitaに投稿・更新 |
| `npx qiita pull` | Qiita上の編集をローカルに同期 |

## 利用可能なスキル

- `/japanese-natural-writing` — 日本語テックブログのAI文体を検出・除去し、自然な人間らしい日本語に書き直す
- `/blog-hit-strategy` — 過去記事の実績データをもとにQiita向け戦略を提示（タイトル設計・トピック選定・構成パターン）
- `/technical-blog-writing` — 開発者向け技術記事の構成・コード例・慣習のガイダンス
- `/blog-originality` — 要約・翻訳で終わらないオリジナリティを加える（手を動かした記録・自分の疑問・トレンドとの接続）
- `/qiita-tweet` — 記事を読んでX（Twitter）投稿文を1〜2文で生成し、Web Intentリンクで即投稿できる状態にする

## パーミッション

`WebFetch` は `qiita.com` に事前認可済み。既存記事のリサーチやトレンド確認に使用可能。

## 執筆フロー

1. `npx qiita new YYYY-MM-スラッグ` で記事ファイルを作成
2. `/blog-hit-strategy` でタイトル・構成方針を決める
3. `/technical-blog-writing` のガイドラインに従って本文を執筆
4. `/blog-originality` で手を動かした記録・疑問・トレンド接続を追加
5. `npx qiita preview` でプレビュー確認
6. `/japanese-natural-writing` でAI文体を除去
7. `ignorePublish: false` に変更して `npx qiita publish` で投稿
8. `/qiita-tweet` でX投稿文を生成して投稿
9. `git add` → `git commit` → `git push` でGit管理

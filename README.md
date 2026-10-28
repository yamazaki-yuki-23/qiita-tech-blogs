# qiita-tech-blogs

Qiita技術ブログ記事の管理リポジトリ。

## ディレクトリ構成

```
qiita-tech-blogs/
├── public/          # 記事本体（qiita-cli管理）
├── assets/          # 記事で使用する画像
├── _meta/
│   └── article-review.md  # 記事の独立レビュー規則
└── .github/
    └── workflows/
        └── publish.yml  # mainへのpushで自動公開
```

## セットアップ

```bash
npm install
npx qiita login
```

## 使い方

```bash
# 記事を新規作成
npx qiita new 2026-04-記事スラッグ

# ローカルプレビュー
npx qiita preview

# Qiitaに投稿・更新
npx qiita publish 2026-04-記事スラッグ

# Qiita上の編集をローカルに同期
npx qiita pull
```

## 下書き管理

記事のフロントマターで管理する。

```yaml
ignorePublish: true   # 下書き
ignorePublish: false  # 公開対象
```

## GitHub Actions

`main` ブランチへのpushで `ignorePublish: false` の記事が自動的にQiitaへ投稿・更新される。
事前にリポジトリのSecretsに `QIITA_TOKEN` を設定する必要がある。

## AI エージェントの共通設定

執筆ルール、ファイル命名規則、CLI コマンド、レビュー基準は [AGENTS.md](AGENTS.md) で管理する。共通ルールの変更は、このファイルだけに反映する。

| ツール | プロジェクト指示の読み込み方 |
|---|---|
| Codex | `AGENTS.md` を直接読み込む |
| Claude Code | `CLAUDE.md` の `@AGENTS.md` から読み込む |

設定変更後は、リポジトリのルートで新しいセッションを開始する。「このプロジェクトの記事命名規則とレビュー手順を教えて」と入力して、共通ルールが参照されることを確認できる。

スキル本体はこのリポジトリに同梱していない。利用する環境へのインストールが必要で、Claude Code の `/スキル名` に対し、Codex では `$スキル名` または自然文で指定する。

権限設定はツールごとに管理する。`.claude/settings.local.json` の許可ルールは Codex に引き継がれない。

読み込み仕様は [Codex の公式ドキュメント](https://developers.openai.com/codex/guides/agents-md) と [Claude Code のファイルインポート仕様](https://code.claude.com/docs/en/memory#import-additional-files) を参照。

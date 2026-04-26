# qiita-tech-blogs

Qiita技術ブログ記事の管理リポジトリ。

## ディレクトリ構成

```
qiita-tech-blogs/
├── public/          # 記事本体（qiita-cli管理）
├── assets/          # 記事で使用する画像
├── _meta/
│   └── topics.md    # ネタ帳
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

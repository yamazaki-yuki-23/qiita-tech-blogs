---
title: Next.js 16.3でAIコーディング向け機能が強化されたので内容をまとめてみた
tags:
  - TypeScript
  - React
  - Next.js
  - ClaudeCode
  - AI
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---
## はじめに

Next.js 16.3 で、AIコーディング向けの機能がまとめて入りました。Claude Code や Cursor に Next.js を書かせている人向けの内容です。

追加されたのは6つです。

1. AGENTS.md への自動書き込み
2. ドキュメントのMarkdown配信
3. 公式スキル3種
4. 選択肢つきのエラー表示
5. MCPサーバーのツール整理
6. agent-browser の React 調査

どれも同じ問題に向いています。**エージェントが過去のバージョンの情報をもとに判断してしまうのを防ぐ**ことです。学習データに入っているのは過去の Next.js なので、放っておくと App Router 以前の書き方や、すでに廃止されたAPIが混ざります。

6以外は手元で動かして、出力をそのまま載せました。

- Next.js 16.3.0-preview.10（執筆時点で16.3は正式リリース前）
- Node.js v25.9.0
- 2026年8月時点

## 1. AGENTS.md への自動書き込み

`next dev` を起動すると、プロジェクトの `AGENTS.md` に一段落が勝手に追記されます。

実際に書き込まれたのがこれです。

```md:AGENTS.md
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
```

見出しが「This is NOT the Next.js you know」。あなたの知っている Next.js ではない、という宣言です。学習データを信じるな、`node_modules/next/dist/docs/` を読め、と続きます。

読ませる先のドキュメントは実際に同梱されています。

```bash
$ find node_modules/next/dist/docs -name '*.md' | wc -l
441
$ ls node_modules/next/dist/docs/
01-app  02-pages  03-architecture  04-community  index.md
```

441ファイル。頭の番号は読む順番です。

Claude Code の場合、`CLAUDE.md` の中身は1行だけでした。

```md:CLAUDE.md
@AGENTS.md
```

エージェントごとにファイルを分けず、1箇所に集約する作りです。

不要なら `next.config.ts` で止められます。型定義にも `agentRules?: boolean` が入っていました。

```ts:next.config.ts
const nextConfig: NextConfig = {
  agentRules: false,
};
```

16.1以前から上げてきたプロジェクトには自動で入りません。codemod を手で走らせます。

```bash
npx @next/codemod@canary agents-md
```

**注意点がひとつ。** このブロックは `next dev` のたびに書き戻されます。差分から消しても、次の起動でまた出てくる。公式ブログにもコミットが推奨されているので、従ってコミットするのが良いと思われます。

## 2. ドキュメントのMarkdown配信

同梱ドキュメントはプロジェクトの中だけの話です。Web 側からも取れるようになりました。

URLに `.md` を付けるだけです。

```bash
curl -s https://nextjs.org/docs/app/api-reference/directives/use-cache.md
```

```md
---
title: use cache
description: "Learn how to use the \"use cache\" directive to cache data in your Next.js application."
url: "https://nextjs.org/docs/app/api-reference/directives/use-cache"
docs_index: /docs/llms.txt
version: 16.2.12
lastUpdated: 2026-05-13
---
```

frontmatter の `version` と `lastUpdated` が効いています。エージェントがどのバージョンのドキュメントを読んだのか、あとから確認できます。

`Accept: text/markdown` ヘッダーでも同じものが返りました。

```bash
curl -sL -H "Accept: text/markdown" \
  https://nextjs.org/docs/app/api-reference/directives/use-cache
```

一覧は2種類あります。

| URL | 中身 |
|---|---|
| `/docs/llms.txt` | 全ページの索引（295行） |
| `/docs/llms-full.txt` | 全ページの本文を1ファイルに結合（3.4MB） |

[llms.txt の規約](https://llmstxt.org/)に沿っているので、この形式を読めるエージェントならそのまま使えます。

ただし `llms-full.txt` は3.4MB あります。丸ごと読ませるのは現実的ではありません。索引の `llms.txt` から必要なページだけ `.md` で取る使い方になると思います。

**試して面白かった点。** URLを間違えると、404もMarkdownで返ってきます。

```md
# Page Not Found

The URL `/docs/app/guides/caching` does not exist.

## How to find the correct page

1. **Browse the sitemap**: [/docs/sitemap.md](/docs/sitemap.md) - A structured index of all pages
2. **Browse the full index**: [/docs/llms.txt](/docs/llms.txt) - Complete documentation index
3. **View the full content**: [/docs/llms-full.txt](/docs/llms-full.txt) - Full content export
```

「存在しません」で終わらせず、次に見るべき場所を3つ案内してくる。エージェントがURLを推測して外したときに、自力で復帰できるようになっています。読者がエージェントであることを前提に作り込んでいるのが分かります。

## 3. 公式スキル3種

スキルは、エージェントに手順を渡す仕組みです。「このツールをこの順番で使え」という指示書だと思ってください。

16.3 で3つ追加されました。

| スキル | 何をするか |
|---|---|
| `next-dev-loop` | ブラウザを操作して、編集した結果を実際に確認させる |
| `next-cache-components-adoption` | Cache Components を有効にして、ビルドが止まる箇所を1つずつ直す |
| `next-cache-components-optimizer` | 事前生成できる範囲を広げて、表示を速くする |

インストールはこの形です。

```bash
npx skills add vercel/next.js --skill next-dev-loop
```

3つとも `next-dev-loop` に依存しているのが特徴でした。移行も最適化も、コードを直したあと必ずブラウザで結果を見る。「ビルドが通った」で終わらせない作りになっています。

## 4. 選択肢つきのエラー表示

すぐ効くのはこれだと思いました。

Cache Components を有効にすると、サーバー側の `await` はすべて「判断が必要な箇所」になります。そのデータを待つのか、キャッシュするのか、諦めて毎回サーバーで作るのか。

16.3 のエラーは、この選択肢をラベル付きで並べてきます。実際に手元で出したものです。

```
Error: Route "/": Next.js encountered uncached or runtime data during prerendering.

Ways to fix this:
  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access
  - [cache] For uncached data (`fetch`, database calls): cache the access with `"use cache"` (does not apply to `connection()`)
  - [block] Set `export const instant = false` to allow a blocking route

Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
```

`[stream]` `[cache]` `[block]` の3択。

ラベルはエラーの種類で変わります。`new Date()` を事前生成できないと言われたときは4択でした。

```
Error: Route "/_not-found": Next.js encountered the unstable value `new Date()` while prerendering.

Ways to fix this:
  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call
  - [cache] Prerender and cache the value with `"use cache"`
  - [client] Render the value on the client with `"use client"`
  - [measure] If the value is for telemetry, use a timing API such as `performance.now()`
```

`[measure]` が面白いところです。「計測用の時刻なら `performance.now()` を使え」と言ってきます。エラーを消す方法ではなく、そもそも `Date.now()` を使う必要があったのかを問い直させている。

ブラウザのエラー画面には **Copy prompt** ボタンが付きます。押すとエージェント向けのプロンプトが取れる。中身は「該当箇所を特定しろ」「対応するドキュメントを読め」「勝手に応用するな」「ブラウザで結果を確認しろ」という手順書でした。エラー文をコピペして貼るのではなく、直し方の手順ごと渡す形です。

エラーごとの解説ページも整備されました。`nextjs.org/docs/messages/` 以下に10ページ以上あり、どれも **Patterns**（正しい書き方）、**Trade-offs**（他の選択肢との比較）、**Gotchas**（見落としやすい点）という同じ構成です。

**手元で確認して分かった差分。** 公式ブログの例では選択肢1つずつに解説ページのリンクが付いていますが、preview.10 のターミナル出力では最後の `Learn more` 1本だけでした。正式リリースまでに揃うのかもしれません。

## 5. MCPサーバーのツール整理

ツールの削除と追加が同時に行われました。

**削除**: Next.js の知識ベース、アップグレード補助、Cache Components 補助。同梱ドキュメントに役割が移ったためです。

**追加**: コンパイル診断の2つ。

| ツール | 用途 |
|---|---|
| `get_compilation_issues` | プロジェクト全体のコンパイルエラーを取る |
| `compile_route` | 特定のルートだけコンパイルする |

エージェントは「コードが通るか」を確かめるためだけに `next build` を叩きがちです。編集の途中でそれをやると重い。起動中の開発サーバーに聞けば速い、という発想でした。

実際に `next dev` を起動して、ツール一覧を取ってみました。

```bash
curl -s -X POST http://localhost:3000/_next/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

返ってきたのは9つです。

```
get_project_metadata
get_errors
get_page_metadata
get_logs
get_server_action_by_id
get_routes
get_request_insights
get_compilation_issues   ← 16.3で追加
compile_route            ← 16.3で追加
```

スキルは `/_next/mcp` を直接叩くので、設定は要りません。自分のエージェントから使いたい場合だけ `.mcp.json` に `next-devtools-mcp` を足します。起動中の `next dev` は自動で見つけてくれます。

## 6. agent-browser の React 調査

16.2 で実験的に入っていた `next-browser` が、汎用の [agent-browser](https://www.npmjs.com/package/agent-browser) に統合されました。Next.js 以外でも使えます。

0.27 で React DevTools の機能が追加されました。

| コマンド | 用途 |
|---|---|
| `react tree` | コンポーネントツリーを一覧する |
| `react inspect <fiberId>` | 特定のコンポーネントの中身を見る |
| `react renders start` / `stop` | 再レンダリングを計測する |
| `react suspense --only-dynamic --json` | 何がレンダリングを待たせているか調べる |

DOM とコンソールとネットワークは 16.2 の時点で見られました。そこに React の内部状態が加わった形です。

`next-dev-loop` はこれを React DevTools 有効の状態で起動します。スキル経由なら意識せず使えます。単体で使う場合は起動時に `--enable react-devtools` が必要です。

```bash
npm install -g agent-browser@^0.27
```

この項目だけは手元で試していません。紹介にとどめます。

## 消えたものにも意味がある

追加ばかり見てきましたが、今回は削除も2つあります。

| 消えたもの | 何だったか |
|---|---|
| 知識系スキル（[next-skills](https://github.com/vercel-labs/next-skills)） | App Router の書き方やキャッシュAPIの説明が入っていた |
| MCPサーバーの知識ベース | Next.js の知識、アップグレード補助、Cache Components 補助 |

どちらも「Next.js の知識」を持っていたものです。同梱ドキュメントと `.md` 配信がその役割を引き継いだので、スキルとMCPの両方から知識が抜かれました。`npx skills update` を実行すると、手元の知識系スキルも消えます。

結果、聞く先が用途ごとに分かれます。

- Next.js の書き方を知りたい → ドキュメント（同梱ファイル、`.md` 配信）
- 決まった作業を進めたい → スキル
- いまのコードの状態を知りたい → MCP、agent-browser

同じ情報を3箇所に置くのをやめた、というのが今回の中身でした。追加された6つだけを見ていると気づきにくいところです。

## まとめ

- 6つの機能はどれも、エージェントが過去のバージョンの情報で判断しないようにするための仕組みでした
- 一番すぐ効くのは選択肢つきのエラー表示です。`[stream]` `[cache]` `[block]` とラベルで示されるので、人間が読んでも次の一手が決まります
- `AGENTS.md` のブロックは `next dev` のたびに書き戻されます。差分から消さず、コミットしておくのが良さそうです
- 知識系スキルとMCPの知識ベースは廃止されました。`npx skills update` を実行して手元を整理しておくとよさそうです

いま16.3はまだプレビューです。試す場合はこれで入ります。

```bash
npm install next@preview
```

## 参考

- [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements)
- [Next.js 16.3: Instant Navigations](https://nextjs.org/blog/next-16-3-instant-navigations)
- [Turbopack: What's New in Next.js 16.3](https://nextjs.org/blog/next-16-3-turbopack)
- [vercel/next.js の skills ディレクトリ](https://github.com/vercel/next.js/tree/canary/skills)
- [agent-browser](https://www.npmjs.com/package/agent-browser)

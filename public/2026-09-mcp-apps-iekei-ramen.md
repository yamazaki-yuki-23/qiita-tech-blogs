---
title: MCP Appsで「家系ラーメン検索アプリ」を作ってみた
tags:
  - MCP
  - MCPApps
  - AI
  - TypeScript
  - CloudflareWorkers
private: false
updated_at: '2026-09-14T09:45:42+09:00'
id: 5cc4fd0b49a644a24e23
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---

## はじめに

AI との会話の中に、自分で作った地図やフォームを出せたら便利だと思いませんか。

MCP（Model Context Protocol）を使うと、AI から外部の機能を呼び出せます。ただし返せるのは、テキストや画像など表示されるだけのコンテンツです。その場で操作できる画面は返せません。

**MCP Apps は、その操作できる画面を返せるようにする拡張仕様です。** インタラクティブな UI を表示できます。

最近になって家系ラーメンをよく食べるようになり、出先で店を探すことが増えました。MCP Apps を触ってみたかったので、家系ラーメン × MCP Apps で検索アプリを作りました。

実際に動かした様子がこちらです。

![Claude との会話から検索フォームが開き、都道府県で絞り込み、地図に切り替えるまでの一連の操作](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-09-mcp-apps-iekei-ramen/demo.gif)

会話の中に検索画面が表示され、そのまま手元で操作できています。

:::note warn
**店舗データについて、先にお断りしておきます**

調べた限りでは、「家系ラーメン」に公式な定義や認定制度は見つかりませんでした。そのため、このアプリの店舗データは OpenStreetMap から取得し、店名やブランド名をもとに機械的に判定しています。

判定は機械的なので、**家系ラーメン店なのに含まれていない店舗**や、**家系ラーメンではないのに含まれてしまっている店舗**があります。

正確な店舗一覧ではなく、MCP Apps を試すために作ったものとして見てください。
:::

## 1. 何を作ったのか

### 1-1. 3 つの機能を 1 つの画面に入れた

全国の家系ラーメン店を探すアプリです。tool を 3 つ用意しました。どれも同じ UI を開き、表示するモードだけが変わります。

| tool | 役割 |
| --- | --- |
| `search-iekei-ramen` | 都道府県・味の傾向・キーワードで絞り込む |
| `find-nearby-iekei-ramen` | 現在地や指定した地名から近い 5 店舗を出す |
| `show-iekei-ramen-map` | 全国の店舗を日本地図に表示する |

検索は、AI に話しかけても、画面のプルダウンを直接操作しても同じ結果になります。

![検索フォーム。都道府県と味の傾向のプルダウンがあり、下に店舗カードが並んでいる](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-09-mcp-apps-iekei-ramen/search.png)

「現在地から探す」では、ブラウザの Geolocation API を使います。

![現在地から近い順に 5 店舗が距離つきで並んでいる画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-09-mcp-apps-iekei-ramen/nearby.png)

地図モードでは、全店舗を日本地図の上に表示します。地図タイルには OpenStreetMap を使い、Leaflet で描画しています。

![日本地図上に店舗のマーカーが点在している画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-09-mcp-apps-iekei-ramen/map.png)

### 1-2. 構成は「静的データ + Cloudflare Workers」

| 項目 | 選んだ技術・サービス |
| --- | --- |
| サーバー | Cloudflare Workers |
| UI | React（1 つの HTML にバンドル） |
| 地図 | Leaflet + OpenStreetMap |
| 店舗データ | ビルド時に埋め込む静的 JSON |

お試しで作ったものなので、最小構成になっています。データベースも外部ストレージも使っていません。

ソースコードは [yamazaki-yuki-23/iekei-ramen-mcp-apps](https://github.com/yamazaki-yuki-23/iekei-ramen-mcp-apps) で公開しています。

### 1-3. 公開しているので、そのまま試せます

MCP サーバーは公開しているので、次の URL をコネクタとして登録すればそのまま使えます。

```
https://iekei-ramen-mcp.yamazaki-dev.workers.dev/mcp
```

設定方法は、Claude なら **設定 → コネクタ → カスタムコネクタを追加**、ChatGPT なら **設定 → コネクタ** から登録できると思います。

あとは「横浜駅の近くの家系ラーメンを教えて」のように話しかければ、記事冒頭の検索画面が開きます。

## 2. MCP Apps とは何か

### 2-1. おさらい：MCP は AI と外部をつなぐ共通規格

MCP は、AI アプリと外部システムをつなぐための共通の通信ルールです。

MCP が登場する前は、AI アプリごとに接続方法がばらばらでした。MCP に対応していれば、1 つのサーバーを複数の AI アプリから同じ方法で使えます。

:::note info
MCP そのものの仕組みは、以前まとめた記事で詳しく説明しています。
[MCPをゼロから理解する：基本の仕組みから最新の2026-07-28仕様まで](https://qiita.com/tamakiiii/items/fef33203697846f8b5ff)
:::

```mermaid
flowchart LR
    subgraph apps["AI アプリ"]
        direction TB
        claude["Claude"]
        other["その他の対応アプリ"]
    end

    mcp["MCP<br/>共通の通信規約"]

    subgraph servers["MCP サーバー"]
        direction TB
        github["GitHub 連携"]
        mine["自作サーバー"]
    end

    claude <--> mcp
    other <--> mcp
    mcp <--> github
    mcp <--> mine
```

MCP サーバーが提供するものは、主に次の 2 種類です。

| 種類 | 意味 | 例 |
| --- | --- | --- |
| tool | AI が呼び出せる関数 | 「店舗を検索する」 |
| resource | AI が読み取れるデータ | 設定ファイル、ドキュメント |

### 2-2. MCP だけでは、インタラクティブな UI は返せない

tool が返せるのは、テキスト・画像・音声といった、表示されるだけのコンテンツです。ユーザーがその場で操作できる UI は返せません。

そのため、「検索結果を地図で見たい」「条件をフォームで絞り込みたい」といった要求には応えられません。

地図を画像として返すことはできても、拡大したりピンをクリックしたりはできません。

### 2-3. MCP Apps は、そこにインタラクティブな UI を加えたもの

MCP Apps では、tool の結果と一緒に **HTML ページ** を返せます。AI アプリがその HTML を画面に描くので、ユーザーはそのまま操作できます。

大事なのは、画面が会話から切り離されていないことです。ユーザーが画面で検索条件を変えると、その結果は AI 側にも渡ります。

そのまま画面で操作を続けてもよいですし、会話に戻って「この中で一番近い店は？」と聞くこともできます。

### 2-4. 登場人物は 3 つ

MCP Apps には登場人物が 3 つあります。役割を混ぜて読むと仕組みを追えなくなるので、先に分けておきます。

| 呼び方 | 役割 | 具体例 |
| --- | --- | --- |
| ホスト | AI アプリ本体。AI モデルを動かし、画面も描画する側 | Claude |
| MCP サーバー | tool と UI を提供する側。自分が作るもの | 自作の検索サーバー |
| App | ホストの中で表示される UI そのもの | サーバーが返した HTML |

「App」は、サーバーが返した HTML がホストの中で動いている状態を指します。サーバーそのものとは別のものだと考えてください。

## 3. 全体の流れを図で見る

実装の詳細に入る前に、1 回のやり取りでどんな処理が起きるのかを図で見ておきます。

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant H as ホスト（Claude）
    participant S as MCP サーバー
    participant A as App（UI）

    U->>H: 「神奈川のラーメン屋を探して」
    H->>S: tools/call（AI の判断で search を実行）
    S-->>H: 結果 +「UI はこの resource」という指定
    H->>S: resources/read（UI の HTML を取得）
    S-->>H: HTML
    H->>A: iframe に表示する
    A->>H: ui/initialize（接続のハンドシェイク）
    H-->>A: ホストの情報を返す
    H->>A: tool の結果を渡す
    U->>A: 画面で条件を変えて再検索
    A->>H: tools/call（App からの呼び出し）
    H->>S: tools/call（App の呼び出しをそのまま中継）
    S-->>H: 新しい結果
    H-->>A: 新しい結果を渡す
```

大事なのは次の 2 点です。

1. **App はサーバーと直接通信しない。** 通信は必ずホストを経由します。
2. **tool 呼び出しの起点は 2 つある。** ホストの中の AI が判断して呼ぶ場合と、ユーザーが画面を操作して App が呼ぶ場合です。図のとおり、どちらもサーバーへ `tools/call` を送るのはホストです。

## 4. サーバー側：tool と resource の 2 つを登録する

MCP Apps のサーバー側でやることは、次の 2 つだけです。

1. UI の HTML を返す **resource** を登録する
2. その resource の場所を書いた **tool** を登録する

### 4-1. UI リソースは `ui://` と専用の MIME タイプ

UI リソースには決まりが 2 つあります。どちらも仕様上の必須項目です。

| 項目 | 値 | 理由 |
| --- | --- | --- |
| URI のスキーム | `ui://` で始める | ホストが「これは UI だ」と判別するため |
| MIME タイプ | `text/html;profile=mcp-app` | ホストが UI 向けの HTML だと認識するため |

MIME タイプは SDK が `RESOURCE_MIME_TYPE` という定数で持っているので、文字列を直接書く必要はありません。

`ui://` の後ろのパスは自由に決められます。

```typescript
const resourceUri = "ui://get-time/mcp-app.html";
```

### 4-2. tool 側に `_meta.ui.resourceUri` を書く

tool と UI は、`_meta.ui.resourceUri` というフィールドで結び付けます。

```typescript
_meta: { ui: { resourceUri } }
```

この指定がある tool をホストが呼ぶと、ホストは結果を受け取ったあとに `resourceUri` のリソースを読みに行き、画面に表示します。

**逆に、この 1 行がなければ UI は表示されません。**

### 4-3. 最小のサーバー実装

現在時刻を返すだけの最小構成のサーバーです。公式ドキュメントの例をもとにしています。

```typescript
// server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";

const server = new McpServer({ name: "My MCP App Server", version: "1.0.0" });

const resourceUri = "ui://get-time/mcp-app.html";

// 1. tool を登録する
registerAppTool(
  server,
  "get-time",
  {
    title: "Get Time",
    description: "Returns the current server time.",
    inputSchema: {},
    _meta: { ui: { resourceUri } }, // ← どの UI を表示するかを指定する
  },
  async () => ({
    content: [{ type: "text", text: new Date().toISOString() }],
  }),
);

// 2. UI の HTML を返す resource を登録する
registerAppResource(
  server,
  resourceUri,
  resourceUri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await fs.readFile(
      path.join(import.meta.dirname, "dist", "mcp-app.html"),
      "utf-8",
    );
    return {
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
    };
  },
);
```

`registerAppTool` と `registerAppResource` は、`@modelcontextprotocol/ext-apps` が提供するヘルパー関数です。通常の登録処理に、MCP Apps 用のメタデータの扱いを足したものです。

HTML は 1 つのファイルにまとめておくのが簡単です。CSS や JavaScript を別ファイルに分けると、後で説明する CSP（コンテンツセキュリティポリシー）の設定が必要になります。

公式ドキュメントでも `vite-plugin-singlefile` で 1 ファイルに固める方法を紹介しています。

### 4-4. tool が増えても resource は 1 つでよい

今回のアプリは tool が 3 つありますが、`resourceUri` はすべて同じものを指しています。

```typescript
const resourceUri = "ui://iekei-ramen/mcp-app.html";

registerAppResource(server, resourceUri, resourceUri, { mimeType: RESOURCE_MIME_TYPE }, ...);

registerAppTool(server, "search-iekei-ramen",      { ..., _meta: { ui: { resourceUri } } }, ...);
registerAppTool(server, "find-nearby-iekei-ramen", { ..., _meta: { ui: { resourceUri } } }, ...);
registerAppTool(server, "show-iekei-ramen-map",    { ..., _meta: { ui: { resourceUri } } }, ...);
```

UI は 1 つにまとめ、どのモードを開くかは後で説明する `structuredContent` の `mode` で切り替えています。

tool ごとに HTML を用意する必要はありません。

### 4-5. UI を表示できないホストのために、テキストも返す

上の例では `content` にテキストも入れています。仕様でもそうすることが推奨されています。

MCP Apps に対応していないホストから呼ばれると、UI は表示されず `content` だけが使われます。

UI が出る前提で `content` を空にすると、そのホストでは何も返らない tool になります。

たとえば検索結果の上位 10 件をテキストで入れておけば、UI が出ないホストでも AI が結果を言葉で説明できます。

## 5. UI 側：`App` クラスでホストとやり取りする

UI 側は普通の HTML と JavaScript です。違うのは、ホストと通信するために SDK の `App` クラスを使うところだけです。

### 5-1. 最小の UI 実装

```typescript
// src/mcp-app.ts
import { App } from "@modelcontextprotocol/ext-apps";

const serverTimeEl = document.getElementById("server-time")!;
const getTimeBtn = document.getElementById("get-time-btn")!;

const app = new App({ name: "Get Time App", version: "1.0.0" });

// ホストとの通信を開始する
app.connect();

// ホストから結果が渡されたとき
app.ontoolresult = (result) => {
  const time = result.content?.find((c) => c.type === "text")?.text;
  serverTimeEl.textContent = time ?? "[ERROR]";
};

// 画面の操作から tool を呼ぶとき
getTimeBtn.addEventListener("click", async () => {
  const result = await app.callServerTool({ name: "get-time", arguments: {} });
  const time = result.content?.find((c) => c.type === "text")?.text;
  serverTimeEl.textContent = time ?? "[ERROR]";
});
```

覚えるポイントは 3 つです。

| API | 役割 |
| --- | --- |
| `app.connect()` | ホストとの接続を開始する。起動時に 1 回だけ呼ぶ |
| `app.ontoolresult` | ホストから tool の結果が渡されたときに呼ばれる |
| `app.callServerTool()` | App からサーバーの tool を呼ぶ |

### 5-2. `ontoolresult` は「ホストが結果を渡してきたとき」に呼ばれる

`ontoolresult` は、ホストから tool の結果が渡されたときに呼ばれる関数です。AI が tool を呼んで UI が出た直後などに、その結果が届きます。

画面は最初、何のデータも持っていません。`ontoolresult` で受け取って初めて中身を描けます。

### 5-3. ハマりどころ：`callServerTool` の結果は自分で反映する

ここが一番つまずきやすいところです。

画面のボタンなどから `app.callServerTool()` を呼んだとき、**その結果は `ontoolresult` には届きません。**

戻り値としてそのまま返ってくるので、自分で画面に反映する必要があります。

先ほどのコードでも、ボタンのクリック処理は `ontoolresult` に任せず、`await` した戻り値から時刻を取り出しています。

「同じ tool を呼んでいるのだから届き方も同じだろう」と思っていると、画面が更新されない理由が分からず時間を取られます。

整理すると次のとおりです。

| 呼び出しの起点 | 結果の受け取り方 |
| --- | --- |
| AI からの呼び出し | `ontoolresult` が呼ばれる |
| 画面の操作による呼び出し | `callServerTool()` の戻り値 |

どちらの経路でも同じ描画処理を通るように書いておくと、後で混乱しません。

## 6. 構造化データを UI に渡す：`structuredContent`

`content` の文字列を UI 側で解析するのは手間がかかります。UI には JavaScript のオブジェクトのまま渡す仕組みがあり、それが `structuredContent` です。

```typescript
return {
  // AI 向け：UI が出ないホストでも意味が通る要約
  content: [{ type: "text", text: "神奈川県で 52 件見つかりました" }],
  // UI 向け：そのまま使える構造化データ
  structuredContent: {
    shops: [{ name: "○○家", lat: 35.46, lon: 139.62 }],
    total: 52,
  },
};
```

UI 側では戻り値から取り出すだけです。

```typescript
const result = await app.callServerTool({ name: "search", arguments: { pref: "神奈川県" } });
const shops = result.structuredContent?.shops;
```

あわせて、返すデータの形を `outputSchema` で宣言しておきます。tool を登録するときに、4-3 で出てきた `inputSchema` の隣に書くフィールドです。

```typescript
registerAppTool(server, "search", {
  inputSchema: z.object({ pref: z.string() }),
  outputSchema: z.object({ shops: z.array(shopSchema), total: z.number() }),
  _meta: { ui: { resourceUri } },
}, handler);
```

仕様上は任意の項目ですが、宣言しておくとクライアントが `structuredContent` の中身を検証できます。

なお、宣言した場合は、そのスキーマに沿った `structuredContent` を返さなければなりません（仕様上の必須要件です）。

`content` と `structuredContent` の使い分けは次のとおりです。

| フィールド | 誰が読むか | 何を入れるか |
| --- | --- | --- |
| `content` | AI（モデル） | そのまま会話で伝えられる文章。例：「神奈川県で 52 件見つかりました」 |
| `structuredContent` | UI | 画面を描くためのデータ。例：店舗の配列と件数 |

## 7. UI は制限付きの iframe で動く

MCP Apps の UI は、ホストが用意したサンドボックス（隔離された実行環境）の中で動きます。ここを知らないと、「手元では動いたのにホストでは動かない」という状態になります。

### 7-1. 既定では外部通信が全部止まる

CSP（Content Security Policy）は、ページがどこから何を読み込んでよいかをブラウザに指示する仕組みです。

CSP を何も宣言しないと、ホストは次の設定を適用します。

```
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
media-src 'self' data:;
object-src 'none';
connect-src 'none';
```

目を引くのは最後の `connect-src 'none'` です。**外部への通信がすべて禁止されます。**

ブラウザで直接開けば動くページでも、ホストの中では地図タイルも外部 API も取得できません。

### 7-2. 外部ドメインを使うなら `csp` を宣言する

使いたいドメインは、resource を返すときの `_meta.ui.csp` に書いておきます。

```typescript
const uiResourceMeta = {
  ui: {
    csp: {
      // fetch などの通信先
      connectDomains: ["https://*.openstreetmap.org"],
      // 画像・スクリプト・フォントなどの読み込み先
      resourceDomains: ["https://*.tile.openstreetmap.org"],
    },
  },
};

return {
  contents: [
    {
      uri: resourceUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: html,
      _meta: uiResourceMeta, // ← resource の contents 側に付ける
    },
  ],
};
```

`csp` で指定できる項目は次のとおりです。

| 項目 | 許可する対象 |
| --- | --- |
| `connectDomains` | `fetch`、XHR、WebSocket の接続先 |
| `resourceDomains` | スクリプト、画像、スタイル、フォントの取得元 |
| `frameDomains` | 入れ子にする iframe の読み込み元 |
| `baseUriDomains` | `<base>` に指定できる URL |

書いていないドメインへの通信は、ホストが止めます。エラーが出ないまま通信だけ失敗することもあるので、外部リソースを足したときは CSP も一緒に直してください。

### 7-3. 位置情報やカメラは `permissions` で申請する

ブラウザの機能も、同じく先に申告しておく必要があります。

```typescript
permissions: { geolocation: {} }
```

申告できるのは次の 4 つです。

| キー | 用途 |
| --- | --- |
| `camera` | カメラ |
| `microphone` | マイク |
| `geolocation` | 位置情報 |
| `clipboardWrite` | クリップボードへの書き込み |

たとえば「現在地から探す」を作って `navigator.geolocation` を呼んでも、この宣言が抜けていると何も返りません。

なお `_meta.ui` は、**tool 側と resource 側で書ける項目が違います。** 書く場所を間違えると設定が効きません。

| 場所 | 書ける項目 |
| --- | --- |
| tool の `_meta.ui` | `resourceUri`、`visibility` |
| resource の `contents[]` の `_meta.ui` | `csp`、`permissions`、`domain`、`prefersBorder` |

### 7-4. なぜ二重の iframe なのか

ホスト自身が Web ページの場合、UI は iframe の中の iframe（二重の iframe）で動きます。

```mermaid
flowchart TB
    host["ホストのページ<br/>（claude.ai など）"]
    proxy["外側の iframe<br/>ホストとは別のドメイン"]
    view["内側の iframe<br/>サーバーが返した UI"]

    host --> proxy
    proxy --> view
```

二重構造にするのは、外側に 2 つの役目があるからです。

**1 つ目は、オリジンを分けることです。** オリジンとは、ブラウザがページを区切る単位で、おおよそドメインのことです。オリジンが違うページ同士は、互いの中身を読めません。

UI はサーバーが返した HTML です。ホストと同じオリジンで動かすと、ホスト側の画面や保存データに手が届いてしまいます。そこで、別ドメインの iframe を 1 枚挟みます。

**2 つ目は、CSP を適用することです。** 7-2 で宣言したドメインは、書いただけでは有効になりません。ブラウザに設定する処理が必要です。

それを担うのが外側の iframe です。サーバーから届いた UI の HTML を内側の iframe に渡すときに、宣言されたドメインを CSP として設定します。

役割をまとめると次のとおりです。

| | 役割 |
| --- | --- |
| 外側 | ホストとは別ドメイン。内側に CSP を適用し、ホストと UI のメッセージを中継する |
| 内側 | サーバーが返した HTML が実際に動く場所 |

この構造は実装にも響きます。E2E テストでこの UI を操作するときは、iframe を 2 段たどることになります。

```typescript
const ui = page.frameLocator("iframe").first().frameLocator("iframe").first();
```

## 8. AI に見せない tool を作る：`visibility`

tool の中には、UI からだけ呼びたいものもあります。今回のアプリでいえば、地名を緯度経度に変換する tool がそれにあたります。

位置情報を許可しなかった人が地名を入力したときに、UI が内部で使います。AI の tool 一覧に出しても使い道がなく、選択肢を増やすだけです。

その場合は `visibility` で制御します。UI を持たない補助 tool なら、`resourceUri` は書かずに `visibility` だけを指定します。

```typescript
_meta: { ui: { visibility: ["app"] } }
```

| 値 | 意味 |
| --- | --- |
| `"model"` | AI（モデル）が見つけて呼べる |
| `"app"` | App からのみ呼べる |

省略した場合は `["model", "app"]` として扱われます。つまり既定では両方から呼べます。

`"model"` を書かなかった tool は、ホストが AI の tool 一覧に載せません。

## 9. 作り方：公式が Skill を配っている

ここまで仕組みを説明してきましたが、セットアップは公式が `create-mcp-app` という Skill を配っているので、そちらを使うのが良いと思います。

Skill をインストールするだけで、エージェントが MCP Apps の作り方を理解した状態で始められます。

Claude Code の場合は次の 2 行を実行します。

```
/plugin marketplace add modelcontextprotocol/ext-apps
/plugin install mcp-apps@modelcontextprotocol-ext-apps
```

他のエージェント向けに、Skills CLI からのインストールも用意されています。

```bash
npx skills add modelcontextprotocol/ext-apps
```

あとは作りたいものを伝えるだけです。

```
カラーピッカーを表示する MCP App を作って
```

## 10. 動かして確認する

### 10-1. 手元で試す：basic-host

公式リポジトリに、開発用の簡易ホスト（basic-host）が入っています。Claude につながなくても、UI の表示と tool の呼び出しを手元で試せます。

```bash
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm start
```

`http://localhost:8080` を開くと、tool を選んで実行できる画面が出ます。

### 10-2. Claude や ChatGPT で試す

実際の UI は、Claude（Web 版とデスクトップ版）と ChatGPT のどちらでも確認できます。

ただし、どちらも手元の `localhost` には接続できません。外部からアクセスできる URL が必要になるので、トンネルを 1 本張ります。

```bash
npx cloudflared tunnel --url http://localhost:3001
```

`https://xxxx.trycloudflare.com` のような URL が表示されます。**末尾に `/mcp` を付けたもの**を、1-3 と同じ手順でコネクタとして登録します。

```
https://xxxx.trycloudflare.com/mcp
```

## 11. まとめ

実際に作ってみて、表現の幅が広がるのが面白いと感じました。

公式 Skill を入れた状態で作りたいものを伝えるだけで、おおかた形になります。気軽に試せるのは良いところだと思います。

インタラクティブな UI が欲しくなったときは、MCP Apps を試してみるのはアリだと思います。

## 参考

- [今回作ったもののソースコード（GitHub）](https://github.com/yamazaki-yuki-23/iekei-ramen-mcp-apps)
- [Build an MCP App（公式ガイド）](https://modelcontextprotocol.io/extensions/apps/build)
- [MCP Apps の仕様（公式）](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
- [ext-apps リポジトリ](https://github.com/modelcontextprotocol/ext-apps)
- [MCP Apps SDK API リファレンス](https://apps.extensions.modelcontextprotocol.io/api/)
- [Model Context Protocol 公式サイト](https://modelcontextprotocol.io/)

---
title: 【MCP Apps】一部の tool だけサインイン必須にする（401 と OAuth）
tags:
  - MCP
  - OAuth
  - CloudflareWorkers
  - ChatGPT
  - MCPApps
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
posting_campaign_uuid: null
---

## はじめに

家系ラーメンの店を探す MCP Apps を作っています。アプリを作ったときのことは別の記事に書いたので、詳細は[こちら](https://qiita.com/tamakiiii/items/5cc4fd0b49a644a24e23)をご覧ください。

店を探すほかに、行った店を登録しておくこともできます。店を探すのは誰でも匿名でできますが、登録した店は利用者ごとに保存するので、誰が登録したかを見分ける必要があります。そこで、登録するときだけ Google でサインインしてもらう作りにしました。

この記事では、**匿名で使える tool とサインインが要る tool を 1 つの MCP サーバーに置く**方法を書きました。前半で仕組みを、後半で実装中に問題になった 3 点を説明しています。

サーバーは Cloudflare Workers で動かしています。MCP の部分は公式の SDK（`@modelcontextprotocol/server`）、サインインの部分は Cloudflare のライブラリ（`@cloudflare/workers-oauth-provider` 1.1.0）を使いました。

## 用語説明

| 用語 | 意味 |
| --- | --- |
| MCP（Model Context Protocol） | ChatGPT や Claude のような AI のアプリと、外部のサービスをつなぐためのオープンな標準。サービス側は MCP サーバーを用意する |
| tool | MCP サーバーが AI に公開する機能の単位。「店を検索する」「行った店を登録する」のような機能を、AI が会話の流れに応じて呼び出す |
| MCP Apps | tool の結果を、チャットに地図や一覧などの画面として表示できるようにする MCP の拡張 |
| ホスト | MCP サーバーの tool を呼び出し、アプリの画面を表示する ChatGPT や Claude |
| Worker | Cloudflare Workers の上で動くこのアプリのサーバー。ホストからの呼び出しは、すべて Worker が最初に受け取る |
| OAuth | パスワードを渡さずに、アプリに必要な範囲だけの権限を与えるための標準の仕組み。この記事では、利用者が Google でサインインすると、ホストが MCP サーバーを呼ぶためのトークンを受け取る |
| 認可サーバー | OAuth で、サインインを受け付けてトークンを発行するサーバー。このアプリでは Worker が認可サーバーも兼ねる |

## サインインが要る tool と要らない tool

tool は 8 つあります。サインインが要るのは、行った店の登録に関わる 3 つだけです。

| tool | 内容 | サインイン | `securitySchemes` |
| --- | --- | --- | --- |
| `search-iekei-ramen` | 家系ラーメンを検索 | 不要 | `noauth`<br>`oauth2` |
| `find-nearby-iekei-ramen` | 近くの家系ラーメンを探す | 不要 | `noauth`<br>`oauth2` |
| `show-iekei-ramen-map` | 家系ラーメンを地図で見る | 不要 | `noauth`<br>`oauth2` |
| `decide-iekei-ramen` | 家系ラーメンを 3 軒まで絞る | 不要 | `noauth`<br>`oauth2` |
| `geocode-place` | 地名から緯度経度を調べる | 不要 | `noauth` |
| `stamp-iekei-ramen` | 行った店を登録する | 必要 | `oauth2` |
| `show-visited-iekei-ramen` | 行った店の一覧を見る | 必要 | `oauth2` |
| `forget-my-iekei-ramen-visits` | 登録した店を全部消す | 必要 | `oauth2` |

残りの 5 つは、トークンが無くても動きます。店を探すだけの利用者には Google のアカウントを求めません。右端の `securitySchemes` の列はこのあとの「[tool ごとの認証方式の宣言](#tool-ごとの認証方式の宣言)」で説明します。

コードでは、サインインが要る 3 つの tool の名前を 1 つの一覧にまとめています。Worker はこの一覧を見て、401 を返すかどうかを決めます。

```ts:server/utils/tool-metadata.ts
export const MEMBER_TOOLS = [
  "stamp-iekei-ramen",
  "show-visited-iekei-ramen",
  "forget-my-iekei-ramen-visits",
] as const;
```

## サインインが要る tool だけ 401 を返す仕組み

### 全体の流れ

![Worker はサインインが要る 3 つの tool がトークン無しで呼ばれたときだけ 401 を返し、ホストがサインインを求める。サインイン後はトークン付きで呼び直す](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/a1076d098a5ed1a97cba481a8e12b7cc9eaff890/assets/2026-10-mcp-apps-anonymous-and-signin/overall-flow.png)

検索などの tool は図の右へ進み、匿名のまま結果を返します。サインインが要る tool をトークン無しで呼ぶと下へ進み、サインインのあとにトークン付きで呼び直します。

### 401 を返す場所

ホストからの呼び出しは、まず Worker が受け取ります。Worker は呼び出しを MCP の SDK に渡し、SDK が tool の処理を動かして、その結果を応答に入れてホストへ返します。

```text
ホスト
  ↓ tool を呼ぶ
Worker
  ├─ サインインが要る tool をトークン無しで呼んだ → ここで 401 を返す
  └─ それ以外 → MCP の SDK に渡す
                  ↓
                MCP の SDK（Worker の中で動くライブラリ）
                  ↓ tool の処理を動かし、結果を応答に入れて返す（200）
```

SDK に渡したあとの応答は SDK が作るので、tool の処理の中から応答を 401 に変えることはできません。tool の処理がエラーを返したときも、応答は 200 のままです。そのため 401 は、SDK に渡す前に Worker が返します。

Worker はホストからの呼び出しを次の順で処理しています。

1. トークンが付いていれば検証し、誰の呼び出しかを確かめる。付いていなければ匿名として扱う。ここではまだ 401 を返さない
2. 呼び出しの中身を読み、呼ばれた tool がサインインの要る 3 つのどれかで、しかも匿名なら 401 を返す
3. それ以外はそのまま SDK に渡す

コードでは、手順 1 と 2 が次の 3 行に当たります。1 行目が手順 1、2〜3 行目が手順 2 です。

```ts:server/worker.ts
const visitor = await visitorOf(request, env, origin);
const raw = request.method === "POST" ? await request.clone().text() : null;
if (!visitor && raw !== null && needsSignIn(raw)) return signInChallenge(origin, CORS_HEADERS);
```

### 401 に添える情報

401 だけでは、ホストはどこでサインインすればよいか分かりません。そこで 401 には `WWW-Authenticate` ヘッダで、保護リソースのメタデータ（RFC 9728）の URL を添えます。

```ts:server/lib/oauth.ts
"WWW-Authenticate":
  `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", ` +
  `scope="${STAMP_SCOPE}"`,
```

ChatGPT はこの 401 を受け取ると、利用者にサインインを求めます。

### 呼び出しを受けるときに気をつけた点

- リクエストの本文は複製（`request.clone()`）から読み、元のリクエストはそのまま SDK に渡します。本文を読んだあとにリクエストを作り直して渡すと、Cloudflare が付ける接続元の位置情報（`request.cf`）が消え、位置を使う tool が現在地を取得できなくなります
- JSON-RPC のバッチ（複数の呼び出しを配列でまとめて送る形式）も、中の呼び出しを 1 件ずつ確かめます。1 件だけの形しか確かめない実装だと、サインインが要る tool の呼び出しをバッチに入れるだけで、トークン無しでも 200 が返ります
- 401 の応答にも CORS ヘッダを付け、`Access-Control-Expose-Headers` に `WWW-Authenticate` を入れます。付けないと、別オリジンで動くブラウザのクライアントは `WWW-Authenticate` を読めず、サインインを始められません

### tool ごとの認証方式の宣言

401 を返す実装とは別に、どの tool にサインインが要るかを tool の定義でも宣言します。宣言の項目名は `securitySchemes` です。

宣言できる値はサインイン無しで使える `noauth` と、OAuth でのサインインを使う `oauth2` です。最初の表の右端の列が各 tool の宣言です。宣言は 401 を返すかどうかを決める一覧（`MEMBER_TOOLS`）から作り、401 と宣言が食い違わないようにしました。

```ts:server/utils/tool-metadata.ts
const oauth = { type: "oauth2", scopes: ["stamp"] };
const securitySchemes = member
  ? [oauth]                         // 記録の 3 tool
  : name === "geocode-place"
    ? [{ type: "noauth" }]           // 地名検索
    : [{ type: "noauth" }, oauth];   // 検索系：匿名でも、サインイン後でも
```

検索系の tool に `noauth` と `oauth2` の両方を書いているのは、サインイン済みなら、検索結果の店が行った店かどうかも返すためです。

注意点として、使っている MCP の SDK は tool を登録するときに、SDK が扱わない項目を捨ててしまいます。`securitySchemes` もその 1 つです。そこで、捨てられない付加情報の欄（`_meta`）に宣言を入れておき、tool の一覧を返すときに、同じ値を tool の定義の `securitySchemes` にも入れています。

## 実装で問題になった点

### 1. `OAuthProvider` は使えなかった

Cloudflare のライブラリでは、`OAuthProvider` クラスを使って MCP サーバーへのすべての呼び出しにサインインを求めるのが定番の使い方です。ところが、この使い方では **トークンが付いていない呼び出しは、tool の処理に届く前にすべて 401** になります。ライブラリの中は次のとおりで、トークンが見つからなければその場で 401 を返します。

```js
const bearerMatch = authHeader ? /^Bearer[\t ]+([^\s,]+)$/i.exec(authHeader) : null;
if (!bearerMatch) return new Response(null, { status: 401, ... });
```

これでは、匿名で使える検索の tool まで 401 になります。

そこで、同じライブラリにある `OAuthAuthorizationServer` クラスに切り替えました。2 つのクラスの違いは次のとおりです。

| クラス | ライブラリが処理するもの | トークンが無い tool の呼び出し |
| --- | --- | --- |
| `OAuthProvider` | サインインの処理と、`/mcp` へのすべての呼び出し | ライブラリが 401 を返す |
| `OAuthAuthorizationServer` | サインインの処理（トークンの発行）だけ | ライブラリは関わらず、Worker が扱いを決める |

`OAuthAuthorizationServer` を使うと、サインインとトークンの発行はライブラリに任せたまま、tool の呼び出しを 401 にするかどうかは Worker が決められます。Worker はトークンが付いているときだけ、このクラスの `validateToken` を呼んでトークンを検証します。

```ts:server/lib/oauth.ts
if (!token || !env.OAUTH_KV) return null; // 匿名。例外にしない
const server = await loadAuthServer(origin);
const validated = await server.validateToken<{ visitorId?: string }>(
  resourceUrl(origin), token, env,
);
```

1 行目は、トークンが無いときに「匿名」として扱う部分です。サインインの状態を置く保存先（Cloudflare の KV）が無い環境も、同じ扱いにしています。匿名で使う人のほうが多いと考えて、エラーにはせず、通常の処理として先へ進めます。

### 2. 保護リソースのメタデータは自分で返す

`OAuthAuthorizationServer` が返すのは、認可サーバーのメタデータだけです。401 で URL を示す「保護リソースのメタデータ」は、別のクラス（`OAuthResourceServer`）の設定で返すものなので、`OAuthAuthorizationServer` だけを使う構成では返されません。

そのままだと、401 で示した URL が 404 になり、ホストは認可サーバーの場所を知ることができません。そこで、保護リソースのメタデータは Worker が自分で返しています。中身はサインインが必要な URL（`/mcp`）、認可サーバーの場所、必要な権限の名前などです。

```ts:server/lib/oauth.ts
return Response.json({
  resource: resourceUrl(origin),          // `${origin}/mcp`
  authorization_servers: [origin],
  scopes_supported: [STAMP_SCOPE],
  bearer_methods_supported: ["header"],
  resource_name: "家系ラーメンを探す",
});
```

ホストによっては、メタデータの URL の末尾に `/mcp` を付けた URL（`/.well-known/oauth-protected-resource/mcp`）を先に見に来ます。そのため、両方の URL で同じメタデータを返します。

### 3. 画面から呼んだときはサインインが始まらない

MCP Apps ではチャットに表示した画面からも tool を呼べます。ただし、**匿名のまま画面からサインインが要る tool を呼ぶと、画面が 401 を受け取るだけで、ホストはサインインを求めません**。

| サインインが要る tool を匿名で呼んだのは | 401 を受けたあと |
| --- | --- |
| AI（チャットで応答するモデル） | ホストがサインインを求める |
| 画面 | 画面が 401 を受け取るだけで、サインインは始まらない |

そこで、匿名のときに画面から行った店を登録しようとした場合は、tool は呼ばずに、チャットへ依頼の文を送るようにしました。依頼を受けた AI が tool を呼ぶと 401 になり、ホストがサインインを求めます。

画面側ではサインイン済みかどうかを tool の結果で見分けています。tool の結果に行った店の一覧を含めるのはサインイン済みのときだけです。匿名のときはこの項目自体を返さないので、まだ 1 軒も登録していない人（項目はあるが中身が空）と区別できます。

## 確かめた範囲

ChatGPT の実機で、次の流れが最後まで動くことを確かめました。

1. サインインせずに店を検索する
2. 行った店を登録しようとすると 401 になり、サインインを求める表示が出る
3. アプリの許可画面で許可し、Google でサインインする
4. 行った店が登録される

ChatGPT 以外のツール（Claude など）での動作は確認できておりません。

## まとめ

匿名で使える tool とサインインが要る tool を 1 つの MCP サーバーに置くときの要点は、401 を tool の中ではなく、tool の処理に渡す前に返すことです。そのうえで、401 で URL を示す保護リソースのメタデータは自分で返す必要がありました。

アプリはこちらです：https://iekeiramen.com

## 参考資料

### 仕様・標準

- [What is the Model Context Protocol (MCP)?](https://modelcontextprotocol.io/docs/getting-started/intro)：MCP の概要（用語説明の MCP）
- [MCP 仕様 2025-06-18：Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)：tool の定義（用語説明の tool）
- [MCP 仕様 2025-06-18：Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)：MCP の認可。401 と `WWW-Authenticate` で保護リソースのメタデータの場所を示す決まり
- [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps)：チャットに画面を表示する MCP の拡張
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728)：保護リソースのメタデータの書き方
- [OpenAI：Reference（tool の `_meta` の項目）](https://developers.openai.com/plugins/reference#_meta-fields-on-tool-descriptor)：tool ごとの `securitySchemes` の宣言の形

### ライブラリ

- [cloudflare/workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)：認可サーバーに使ったライブラリ（1.1.0）

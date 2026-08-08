---
title: AIエージェント開発環境「Orca」のプラグインを自作してみた
tags:
  - ORCA
  - プラグイン
  - AI
  - 開発環境
  - JavaScript
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

前回、AI エージェント向け開発環境「[Orca](https://www.onorca.dev/)」に追加されたプラグイン機能とマーケットプレイスについて調べた記事を書きました。

https://qiita.com/tamakiiii/items/fb17df6eaa99cb12b781

そのときに残った疑問が「これ、自分でも作れるのか」でした。結論から言うと作れます。ビルドツールやパッケージ管理は不要で、フォルダにファイルを 2 つ置けば動きます。

ただ、作り方をまとめた資料が見当たりませんでした。公式ドキュメントにプラグイン開発の項目はまだなく、マーケットプレイスに並んでいるプラグインを眺めても、マニフェストに何を書けるのかまでは分かりません。

そこでこの記事に、**Orca プラグインをゼロから作ってインストールするまでの手順**を残しておきます。仕様は Orca v1.4.176 のアプリケーションバンドルを読んで確認したものです。プラグイン機能そのものの説明は前回の記事に譲るので、必要なら先にそちらを読んでください。

記事の後半で、実際に自作したプラグインの話も少しだけ書いています。

:::note warn
Orca のプラグイン機能は「実験的」と表示されている段階の機能です。この記事の内容は将来のバージョンで変わる可能性があります。
:::

## この記事で作るもの

サイドバーに表示される**パネル**を作ります。パネルは Orca の右サイドバーに出る小さな画面で、HTML、CSS、JavaScript で書きます。

パネルを題材にする理由は 2 つあります。ひとつは、作った結果が目に見えること。もうひとつは、パネルだけのプラグインはバックグラウンドで動くプロセスを持たないため、権限の範囲が分かりやすいことです。

先にゴールを見せます。この記事の手順で作ったパネルがこれです。

![Orcaのサイドバーで動くブロック崩し。上部にSCORE 100とLIFE 2が表示され、下部にパドルとボールがある](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-orca-plugin-development/breakout-playing.png)

中身はブロック崩しです。題材は何でもよく、この記事で説明する骨組みはどのパネルでも変わりません。本文の手順は最小構成のサンプルで進めて、ブロック崩しの話は最後にまとめます。

## 1. プラグインの最小構成

必要なのはフォルダひとつと、その中のファイル 2 つです。

```
my-plugin/
├── orca-plugin.json    # マニフェスト
└── panel/
    └── index.html      # パネルの中身
```

`package.json` や `node_modules`、ビルド成果物はいりません。`orca-plugin.json` があるフォルダを Orca に指定すれば、それがプラグインとして扱われます。

置き場所はどこでも構いません。この記事では `~/orca-plugins/my-plugin` を使います。

## 2. orca-plugin.json を書く

マニフェストの全体像はこうなります。

```json:orca-plugin.json
{
  "manifestVersion": 1,
  "id": "my-plugin",
  "publisher": "your-name",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "サイドバーに表示されるパネルです。",
  "engines": { "orca": ">=1.4.0" },
  "pluginApi": 1,
  "contributes": {
    "panels": [
      {
        "id": "main",
        "title": "My Panel",
        "entry": "panel/index.html"
      }
    ]
  },
  "capabilities": [
    { "kind": "workspace:read" }
  ]
}
```

各項目の内容は次のとおりです。

| 項目 | 内容 |
|---|---|
| `manifestVersion` | 現在は `1` 固定 |
| `id` | プラグインの識別子 ※命名に制約あり（後述） |
| `publisher` | 発行者の識別子。`id` と組み合わせて `publisher.id` がプラグインのキーになる |
| `name` | 設定画面に表示される名前 |
| `version` | セマンティックバージョン |
| `description` | 設定画面と権限ダイアログに表示される説明 |
| `engines.orca` | 対応する Orca のバージョン |
| `pluginApi` | プラグイン API のバージョン。現在は `1` |
| `contributes` | プラグインが提供するもの |
| `capabilities` | 要求する権限 |

そのうち、書き方を間違えやすい 4 つを補足します。

### id を `orca-` で始めない

`id` が `orca-` で始まる場合、あるいは `publisher` が `stablyai` の場合、そのプラグインは Orca の予約識別子として扱われます。予約識別子はローカルフォルダからのインストールが拒否されるため、識別子を変えない限りインストールできません。

厄介なのは、このインストールに失敗したときのエラーメッセージが「プラグインのインストールに失敗しました。ソースを確認して再試行してください。」という汎用の文言になることです。原因が識別子にあるとは表示されません。

### engines.orca は `>=x.y.z` の形式のみ

`engines.orca` は正規表現 `^>=\d+\.\d+\.\d+$` で検証されます。

```json
"engines": { "orca": ">=1.4.0" }   // OK
"engines": { "orca": "^1.4.0" }    // NG
"engines": { "orca": ">=1.4" }     // NG
"engines": { "orca": "*" }         // NG
```

npm の感覚で `^1.4.0` と書くと弾かれます。

### contributes に書けるのは 7 種類だけ

`contributes` のスキーマは strict で定義されているため、定義外のキーを書くとマニフェスト全体が無効になります。書けるのは以下の 7 つです。

| キー | 内容 |
|---|---|
| `panels` | サイドバーのパネル |
| `commands` | コマンドパレットに追加するコマンド |
| `events` | 購読するイベント |
| `keybindings` | キーボードショートカット |
| `languagePacks` | 言語パック |
| `vmRecipes` | VM のレシピ |
| `agents` | エージェント定義 |

テーマやアイコン、スキル、MCP サーバーの登録はできません。前回の記事で、マーケットプレイスのインデックスに 8 件登録されているのに 3 件しか表示されないのはなぜか、という疑問を残していました。表示されない 5 件は、いずれも `themes` や `icons` といった現行スキーマにないキーを使っています。スキーマの検証を通らないため、一覧に出てこないのだと思われます。

### capabilities はオブジェクトの配列

権限の指定は文字列の配列ではなく、`kind` を持つオブジェクトの配列です。

```json
"capabilities": ["workspace:read"]              // NG
"capabilities": [{ "kind": "workspace:read" }]  // OK
```

指定できる `kind` は 7 種類です。表の右列は、権限ダイアログに実際に表示される文言をそのまま載せています。

| kind | 権限ダイアログの表示 |
|---|---|
| `workspace:read` | フォーカスされたワークツリーの名前、ブランチ、ターミナルリストを読み取る |
| `terminal:send` | 見えるターミナルにテキストを入力（常に特定のターミナル） |
| `notifications:show` | プラグイン名がラベル付けされたデスクトップ通知を表示 |
| `storage` | プラグインの独自ストレージフォルダーにデータを保存 |
| `secrets` | プラグインの独自暗号化保管庫にシークレットを保存および読み取り |
| `events:subscribe` | ワークツリーが作成または削除され、エージェントステータスが変更されたときに通知を受ける |
| `settings:own` | プラグインの独自設定を読み取りおよび変更 |

要求した権限は、有効化時の権限ダイアログにそのまま一覧表示されます。冒頭のブロック崩し（`workspace:read` と `notifications:show` を要求）の場合はこうなります。

![権限確認ダイアログ。「このプラグインは」に続けて workspace:read と notifications:show の説明が並び、「このプラグインにはバックグラウンドワーカーがありません。」という注記がある](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-orca-plugin-development/consent-dialog.png)

使わない権限を書くと、この一覧が長くなってユーザーに余計な不安を与えるだけなので、必要なものだけ書きます。

## 3. パネルの中身を書く

### entry は `<body>` から書く

ここが最初に戸惑うところです。`entry` に指定するファイルには、完結した HTML ドキュメントではなく、**`<body>` 以降だけ**を書きます。

Orca 側が次のようなシェルを組み立て、その末尾に指定したファイルの中身をそのまま連結します。

```html
<!doctype html>
<html class="...">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="...">
<style>:root{ /* デザイントークン */ }</style>
<script> /* ホストとの通信を仲介するスクリプト */ </script>
</head>
<!-- ここに entry の中身が入る -->
```

そのため、`entry` に `<!doctype html>` や `<head>` を書くと二重になります。

```html:panel/index.html
<body>
  <div class="wrap">
    <p id="branch">読み込み中…</p>
  </div>

  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    .wrap { padding: 12px; }
  </style>

  <script>
    document.getElementById('branch').textContent = 'こんにちは';
  </script>
</body>
```

CSS と JavaScript は同じファイルの中に書きます。外部ファイルの読み込みはできません。

### パネルが動く環境の制約

パネルは `sandbox="allow-scripts"` を付けた iframe の中で、`srcDoc` として描画されます。ここから来る制約が 4 つあります。

**1. 外部との通信ができない**

適用される CSP は次のとおりです。

```
default-src 'none'; connect-src 'none'; script-src 'unsafe-inline';
style-src 'unsafe-inline'; img-src data:; font-src data:;
base-uri 'none'; form-action 'none'
```

`connect-src 'none'` なので、`fetch`、`XMLHttpRequest`、WebSocket のいずれも通りません。画像とフォントは `data:` URI のみ。CDN からライブラリを読むこともできません。React を使いたい場合は、バンドルしたコードを丸ごと `<script>` の中へ書く必要があります。

**2. 状態を保存できない**

スコアや設定を保存して、次に開いたときに引き継ぐことはできません。`allow-same-origin` が付いていないため、パネルのオリジンは opaque になります。`localStorage` にアクセスしようとすると例外が投げられます。加えて `srcDoc` はマウントのたびにドキュメントを作り直すので、サイドバーを閉じて開くと変数の中身は消えます。

プラグイン API には `storage.get` / `storage.set` がありますが、これらはパネルからは呼べません（後述）。パネルだけで完結するプラグインは、現在は状態を持てません。

**3. 音声ファイルは読み込めない**

CSP に `media-src` の指定がないので `default-src 'none'` に落ち、`<audio>` からの読み込みはブロックされます。ただし Web Audio API の `AudioContext` は外部リソースを取得しないため、波形を生成する形なら音を鳴らせます。

```js
const audio = new AudioContext();   // ユーザー操作のあとで生成する
const osc = audio.createOscillator();
osc.frequency.value = 880;
osc.connect(audio.destination);
osc.start();
osc.stop(audio.currentTime + 0.08);
```

**4. メッセージには上限がある**

後述のホスト通信には、1 メッセージあたり 64KB、10 秒あたり 30 件という上限があります。加えて、ホストからの ping に応答しないパネルは停止されます。毎フレーム値を問い合わせるような書き方はできません。

### 見た目を Orca に合わせる

シェルの `:root` には、Orca 本体の配色が CSS カスタムプロパティとして 20 個注入されます。

```
--background          --foreground
--card                --card-foreground
--popover             --popover-foreground
--primary             --primary-foreground
--secondary           --secondary-foreground
--muted               --muted-foreground
--accent              --accent-foreground
--destructive         --destructive-foreground
--border              --input
--ring                --radius
```

値は Orca 本体の計算済みスタイルからそのままコピーされるので、これらを使って書けばテーマの切り替えに自動で追従します。

```css
.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
```

逆に、色を直接書くと、テーマを切り替えたときにパネルだけ配色が変わらず、周囲と合わなくなります。

### ホストの機能を呼ぶ

パネルから Orca の機能を使うには、親ウィンドウに `postMessage` を送ります。

パネルから送るメッセージは次の形です。

```js
{
  type: 'orca-panel-action',
  requestId: 'req-1',        // 任意の文字列（128文字以内）
  action: 'workspace.readContext',
  params: {}
}
```

結果は次の形で返ってきます。

```js
{
  type: 'orca-panel-action-result',
  requestId: 'req-1',
  ok: true,
  value: { /* 結果 */ }
}
```

失敗した場合は `ok: false` と `errorCode` / `error` が返ります。

毎回書くのは面倒なので、Promise で包むヘルパーを用意しておくと楽です。

```js
let seq = 0;
const pending = {};

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'orca-panel-action-result') return;
  const resolve = pending[data.requestId];
  if (!resolve) return;
  delete pending[data.requestId];
  resolve(data);
});

function callHost(action, params = {}) {
  return new Promise((resolve) => {
    const requestId = 'req-' + ++seq;
    pending[requestId] = resolve;
    window.parent.postMessage({
      type: 'orca-panel-action',
      requestId,
      action,
      params
    }, '*');
  });
}
```

使い方はこうなります。

```js
callHost('workspace.readContext').then((res) => {
  if (!res.ok) return;
  const branch = res.value.branch;   // "refs/heads/main"
  document.getElementById('branch').textContent =
    branch.replace(/^refs\/heads\//, '');
});
```

`branch` は `refs/heads/` が付いた完全な ref 名で返るので、表示するなら削っておきます。

#### パネルから呼べるのは 3 つだけ

Orca のアプリケーションバンドル内にある API 定義を読むと、プラグイン API のメソッドは 13 個定義されています。各メソッドは、パネルから呼び出せるかどうかを示す `panel` フラグを持っていて、これが `true` なのは次の 3 つだけです。

| メソッド | 必要な capability | パネルから |
|---|---|---|
| `workspace.readContext` | `workspace:read` | ○ |
| `terminal.sendText` | `terminal:send` | ○ |
| `notifications.show` | `notifications:show` | ○ |
| `storage.get` / `set` / `delete` / `keys` | `storage` | × |
| `secrets.get` / `set` / `delete` | `secrets` | × |
| `settings.get` / `set` | `settings:own` | × |
| `events.subscribe` | `events:subscribe` | × |

保存系がすべて `panel: false` なのは意図的な設計だと思われます。サンドボックス内のコードにディスクへの書き込み経路を渡さない、ということでしょう。

なお `notifications.show` で通知を出すと、タイトルの先頭に自動で `publisher.id: ` が付きます。`title` に `Done` を渡すと、実際の通知は `your-name.my-plugin: Done` になります。

## 4. Orca に読み込ませる

ファイルが 2 つ揃ったら、Orca にインストールします。

1. **設定 → プラグイン** を開く
2. 「プラグインシステム」をオンにする
3. 「プラグインをインストール」を押し、「ローカルフォルダー」にプラグインフォルダのフルパスを入力して「インストール」
4. 一覧に追加されたプラグインの「レビューして有効にする」を押す
5. 権限ダイアログの内容を確認して「プラグインを有効にする」

手順 5 で出るのが、2 章の最後に載せた権限ダイアログです。マニフェストに書いた `capabilities` がそのまま日本語で並びます。

有効にすると、サイドバーに `contributes.panels[].title` の名前でパネルが現れます。

インストール時に、プラグインのファイルは Orca の管理下にコピーされます。そのため、元のフォルダを修正しても自動では反映されません。修正のたびにインストールし直す必要があります。

うまく動かないときは、プラグイン一覧の「…」から「ログを表示」を選ぶと直近 200 行が読めます。マニフェストの検証エラーもここに出ます。

## 5. 他の人に配る

「プラグインをインストール」には「ローカルフォルダー」のほかに「Git URL」のタブがあります。リポジトリを公開しておけば、URL だけで他の人の Orca にもインストールしてもらえます。

今回作ったブロック崩しもこの形で公開してあります。「Git URL」タブに次の URL を貼って「インストール」を押すだけです。

```
https://github.com/yamazaki-yuki-23/orca-breakout-panel#v0.1.1
```

URL 末尾の `#ref` は必須です。インストールを固定するための指定なので、タグかコミットハッシュを使います。バージョンごとにタグを切っておくのが素直です。

インストールにはいくつか制限があります。

- ファイル数 2000 まで
- 合計 50MB まで
- シンボリックリンクを含むと拒否される
- ルート直下の `.git` は除外される（サブディレクトリの `.git` は除外されない）

`node_modules` を含んだまま入れようとすると、たいていファイル数で引っかかります。

## 6. バックグラウンドで動かす場合

パネルではなく、イベントに反応して動く処理を書きたい場合は**ワーカー**を使います。この記事の主題からは外れるので要点だけまとめます。

マニフェストに `main` を追加します。

```json
{
  "main": "worker.mjs",
  "contributes": {
    "events": [{ "event": "worktree.created" }]
  },
  "capabilities": [
    { "kind": "events:subscribe" },
    { "kind": "terminal:send" }
  ]
}
```

エントリは ESM で、`activate` をデフォルトエクスポートします。

```js:worker.mjs
export default async function activate(ctx) {
  ctx.log(`activated: ${ctx.grantedCapabilities.join(', ')}`);

  ctx.events.on('worktree.created', async (payload) => {
    ctx.log(`created: ${payload.branch}`);
  });
}

export function deactivate() {}
```

`ctx` から使えるのは `commands.register` / `events.on` / `host.call` / `grantedCapabilities` / `log` の 5 つです。購読できるイベントは `worktree.created` / `worktree.removed` / `agent.status.changed` の 3 種類のみで、渡ってくるペイロードも必要最小限のフィールドに絞られています。

ワーカーを使う場合、権限ダイアログには次の一文が表示されます。

> これらの権限は、プラグインがOrca APIを使用する方法を制限します。ワーカーは引き続きコンピューターで通常のプロセスとして実行され、ファイル、ネットワーク、その他のプロセスへの完全なアクセス権を持ちます。

`capabilities` が制限するのは Orca API の呼び出しだけです。ワーカー自体は普通の Node プロセスなので、`fs` や `fetch`、`child_process` を権限の宣言なしで使えます。パネルの徹底したサンドボックスとは前提がまったく違います。

`main` を持つプラグインは権限ダイアログのバッジも「ワーカー」になり、上記の警告文が表示されます。配る側としては、そこに何を書いたかを説明できる状態にしておきたいところです。

## 実際に作ってみたときの流れ

ここまでが作り方です。ここからは、自分がこの手順で何を作ったかという話を少しだけ。

題材は冒頭に載せたブロック崩しです。サイドバーの幅にちょうど収まるサイズで、クリックで開始、マウスでパドルを動かして、ブロックを崩すたびに音が鳴ります。実用性はありません。パネルを使ったプラグイン開発を手軽に体験できるという理由で選びました。作りながら確認したかったのは次の 3 つです。

- Canvas の描画と `requestAnimationFrame` が iframe の中で普通に動くか
- 効果音を鳴らす方法があるか
- ホストの機能をパネルから呼べるか

最後の点については、ゲーム終了時に `workspace.readContext` でブランチ名を取り、`notifications.show` でデスクトップ通知を出すようにしています。

![ゲームオーバー後のパネル。SCORE 700、LIFE 0 と表示され、下部に「test3 / ゲームオーバー 700点 — クリックでもう一度」と出ている](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-orca-plugin-development/breakout-result.png)

先頭の `test3` が、そのとき開いていたワークツリーのブランチ名です。ゲームに必要な機能ではありませんが、パネルから Orca の API を呼ぶ部分を実際に動かして確かめたかったので入れました。

作った順序はだいたいこうです。

1. マニフェストとほぼ空の `index.html` だけの最小構成でインストールし、エラーなくパネルが表示されることを確認する
2. パネルの機能を実装する（今回はブロック崩し）
3. インストールし直して、期待どおり動くことを確認する

最初に 1 を通しておくと、以降はブラウザで動く HTML を書くのと変わりません。動かないときにマニフェストの問題なのかコードの問題なのか切り分けやすくなるので、慣れないうちは 1 を通しておくことをお勧めします。

コードは以下に置いてあります。パネルの実装例として、気になる方は参考にしてみてください。

https://github.com/yamazaki-yuki-23/orca-breakout-panel

## おわりに

Orca のプラグインは、フォルダとファイル 2 つで作れます。ビルド環境や型定義は不要で、HTML が書ければパネルは作れます。

一方で、パネルの実行環境はかなり厳しく制限されています。通信できない、保存できない、外部ファイルを読めない。この 3 つを最初に把握しておくと、何が作れて何が作れないかの見当が付きます。

まだ実験的な機能なので、この記事の内容も次のバージョンで変わるかもしれません。それでも、作れると分かっていること自体には意味があると思っています。

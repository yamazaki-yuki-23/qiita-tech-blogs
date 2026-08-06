---
title: Orcaに追加されたプラグイン機能とマーケットプレイスを調べてみた
tags:
  - Orca
  - ClaudeCode
  - AI
  - 開発環境
  - プラグイン
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

AI エージェント向け開発環境「[Orca](https://www.onorca.dev/)」に、v1.4.162 でプラグイン機能とマーケットプレイスが追加されました。

調べてみると、Orca のマーケットプレイスは VS Code の拡張機能ストアとは仕組みが異なりました。プラグイン本体を保管する場所ではなく、**各プラグインの Git リポジトリを案内する一覧**です。

> **注意:** プラグイン機能は experimental です。以下の内容は、2026年8月時点の macOS 版で確認した結果です。バージョンによってファイル形式や画面表示が変わる可能性があります。

公式の changelog にはこう書かれています。

> Plugins (experimental) — enable per plugin with consent, browse marketplaces, and install content packs, panels, and workers

日本語にすると、「プラグインごとに利用者の同意を得て有効化し、マーケットプレイスからコンテンツパック、パネル、ワーカーをインストールできる」という説明です。

先に結論をまとめます。

- マーケットプレイスの実体は Git リポジトリで、中身は各プラグインへのリンク集でした
- プラグインのマニフェストは VS Code の拡張とよく似た形でした
- 公式マーケットプレイスの一覧には8件あるのに、Orca の画面に表示されるのは3件だけでした

プラグイン開発の知識は必要ありません。設定項目の役割から順に見ていきます。

## 先に全体像：マーケットプレイスはプラグインの案内役

Orca がプラグインを見つけてインストールするまでの流れは、次のようになっています。

```text
Orca
  │ ① マーケットプレイスの一覧を取得する
  ▼
stablyai/orca-plugins
  │ ② 一覧に書かれた URL とバージョンを読む
  ▼
各プラグインの Git リポジトリ
  │ ③ プラグイン本体を取得する
  ▼
自分の PC にインストール
```

マーケットプレイスが持つのは、プラグインの名前、説明、取得先 URL、バージョンです。プラグイン本体は、それぞれ別の Git リポジトリに置かれています。

この全体像を踏まえて、まず公式マーケットプレイスの中身を確認します。

## 公式マーケットプレイスには何が置かれているか

Orca は起動時に公式マーケットプレイスの一覧を取得し、PC 内にコピーを保存します。macOS での保存先は次のとおりです。

```
~/Library/Application Support/Orca/plugins-data/marketplaces/
├── sources.json                    ← 登録済みマーケットプレイスの一覧
└── snapshots/
    └── <sourceId>.json             ← 取得したマーケットプレイスの中身
```

`sources.json` には、Orca が参照するマーケットプレイスの取得先が書かれています。`snapshots` の JSON は、取得した一覧のコピーです。

一覧の名前は「Orca Official Plugins」で、8件のプラグインが登録されていました。

| プラグイン | カテゴリ | 入れると何が変わるか |
|---|---|---|
| `stablyai.orca-midnight-theme` | themes | 画面が暗いテーマになる。長時間の作業向け |
| `stablyai.orca-nord-theme` | themes | 画面が寒色でコントラストを抑えたテーマになる |
| `stablyai.orca-minimal-icons` | icons | ファイルのアイコンが単色の小さめのものに変わる |
| `stablyai.orca-solarized-terminal` | terminal-themes | ターミナルの配色が Solarized Dark になる |
| `stablyai.orca-navigation-shortcuts` | keybindings | タスクや検索の画面をキー操作で開けるようになる |
| `stablyai.orca-workflow-skills` | skills | 計画やレビューをエージェントに任せるときの手順書が増える |
| `stablyai.orca-multipass-recipes` | vm-recipes | 仮想マシンに関する設定一式 |
| `stablyai.orca-portuguese` | languages | 画面表示がブラジルポルトガル語になる |

8件のうち4件は、テーマ、アイコン、ターミナルの配色といった見た目を変えるプラグインです。

一覧では、1つのプラグインに複数のカテゴリを付けられます。たとえばテーマには、種類を表す `themes` と、公式を表す `official` が付いています。

```json
"categories": ["themes", "official"]
```

`official` は8件すべてに付いていました。

一方、changelog が挙げていた「パネル」と「ワーカー」に該当するプラグインは、この8件に含まれていません。現時点の公式マーケットプレイスには、設定や素材を追加するプラグインが中心に並んでいます。

## マーケットプレイスには8件あるのに、画面には3件しか表示されない

設定からプラグイン画面を開くと、上部には `All 3` と表示されました。JSON の一覧には8件ありますが、画面に並ぶのは次の3件だけです。

![Orcaのプラグイン画面。All 3 と表示され、Multipass Recipes・Navigation Shortcuts・Portuguese の3件だけが並んでいる](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-orca-plugins/plugin-list.png)

| 画面に出るもの | カテゴリ |
|---|---|
| Orca Multipass Recipes | vm-recipes |
| Orca Navigation Shortcuts | keybindings |
| Orca Portuguese | languages |

表示されない5件は、テーマ2件、アイコン1件、ターミナルの配色1件、エージェント向けの手順書1件です。見た目を変える4件がすべて含まれます。

検索や絞り込みは使っていません。リポジトリにも8件登録されています。Orca v1.4.173 が未対応の種類を除外している可能性はありますが、公式の説明は見つかっていません。確認できた事実は、**「一覧は8件、画面は3件」**という点までです。

### 1件は Orca に最初から入っている

画面に出た3件のうち、`Orca Navigation Shortcuts` は Orca に最初から入っています。残る2件は、マーケットプレイスから追加できます。

インストール済みプラグインを記録する `plugins.lock.json` を見ると、`Orca Navigation Shortcuts` の取得元は次のようになっています。

```bash
$ cat ~/Library/Application\ Support/Orca/plugins/plugins.lock.json
{
  "plugins": {
    "stablyai.orca-navigation-shortcuts": {
      "source": { "kind": "bundled", "bundleId": "stablyai.orca-navigation-shortcuts" }
    }
  }
}
```

`source.kind` の値は `bundled` です。これは「アプリに同梱されている」という意味です。

つまり `Orca Navigation Shortcuts` は、利用者が追加したものではありません。Orca は最初から入っている機能も、プラグインとして管理しています。

## マーケットプレイスの正体は Git リポジトリだった

ここからは、マーケットプレイスがどこから届くのかを確認します。手がかりになるのは、登録済みマーケットプレイスの取得先を保存した `sources.json` です。

```json
{
  "sources": [{
    "source": {
      "kind": "git",
      "url": "https://github.com/stablyai/orca-plugins.git",
      "ref": "main"
    }
  }]
}
```

注目するのは `kind`、`url`、`ref` の3項目です。

- `kind: git`：Git リポジトリから取得する
- `url`：取得先は GitHub の `stablyai/orca-plugins`
- `ref: main`：`main` ブランチを参照する

つまり、公式マーケットプレイスの実体は1つの Git リポジトリです。Orca はその内容を取得し、PC 内に保存します。

保存した一覧には、取得元を示す `marketplaceCommit` も記録されます。コミットハッシュとは、Git リポジトリの特定時点を識別する文字列です。

マーケットプレイスの一覧には、各プラグインの取得先が書かれています。次は `Orca Midnight Theme` の例です。

```json
{
  "id": "stablyai.orca-midnight-theme",
  "source": {
    "kind": "git",
    "url": "https://github.com/stablyai/orca-midnight-theme.git",
    "ref": "v1.0.0"
  },
  "description": "A quiet dark theme tuned for long coding sessions.",
  "categories": ["themes", "official"]
}
```

`url` はプラグイン専用の Git リポジトリを指しています。`ref: v1.0.0` は、取得するバージョンを `v1.0.0` タグに指定する設定です。

**マーケットプレイスはプラグイン本体を持ちません。** 「どのリポジトリから、どのバージョンを取得するか」だけを管理します。プラグイン本体は、それぞれの Git リポジトリに置かれています。

npm や VS Code の拡張機能ストアが「商品を保管する倉庫」だとすれば、Orca のマーケットプレイスは「商品の保管場所をまとめたカタログ」に近い仕組みです。

この構造には、次の特徴があります。

- **独自のマーケットプレイスを作れる**：決められた形式の JSON を置いた Git リポジトリを `sources.json` に追加できます。公式と独自のマーケットプレイスも併用できます
- **審査済みかどうかは JSON から分からない**：一覧には審査状態を表す項目がありません。`official` もカテゴリに書かれた文字列です。公式マーケットプレイスが運用上どのように審査するかは確認できませんでした
- **取得するバージョンを固定できる**：一覧が `v1.0.0` を指している間は、作者が新しいバージョンを公開しても取得対象は変わりません

バージョンを固定すると、新版が公開されても利用者の環境は変わりません。ただし、Git のタグ自体は付け替えられます。コミットハッシュは、その変更を追跡する手がかりになります。

> **注意:** 独自のマーケットプレイスでは、`official` という文字列も自由に付けられます。表示だけで安全性を判断せず、運営者とプラグインの取得先を確認する必要があります。

### マーケットプレイスのリポジトリを clone してみる

構造が本当にこれだけなのか、公式マーケットプレイスを clone して確かめました。`clone` は、Git リポジトリを手元にコピーするコマンドです。

```bash
$ git clone --depth 1 https://github.com/stablyai/orca-plugins.git
$ ls orca-plugins
orca-marketplace.json
```

ファイルは `orca-marketplace.json` の1つだけです。プラグイン本体は含まれていません。

### インストール時には2つのコミットが記録される

マーケットプレイスからプラグインを入れると、`plugins.lock.json` に2つのコミットハッシュが残ります。

```json
{
  "marketplace": {
    "resolvedCommit": "43287da85a4ff1c6a902f455b3eb2c01f7fd46be"
  },
  "resolvedCommit": "8606f0eee47f30e60cde69cb2d70e58413b61e23"
}
```

2つの値は、それぞれ次の時点を示します。

| 記録される場所 | 示すもの |
|---|---|
| `marketplace.resolvedCommit` | どの時点のマーケットプレイス一覧を参照したか |
| `resolvedCommit` | プラグイン本体のどのコミットをインストールしたか |

この2つがあれば、「どの一覧を見て、どのプラグインを入れたか」を後からたどれます。タグが付け替えられても、記録済みのコミットハッシュは変わりません。

ただし、コミットハッシュが残ることと、プラグインが安全であることは別です。コミットハッシュで分かるのは「何をインストールしたか」であり、その内容が安全かどうかではありません。

## プラグインの中身は VS Code の拡張によく似ている

各プラグインのルートには `orca-plugin.json` があります。これは、プラグインの名前、対応バージョン、追加する機能などを Orca に伝える**マニフェスト**です。

インストール済みの `Orca Navigation Shortcuts` を例に見てみます。

```json:orca-plugin.json
{
  "id": "orca-navigation-shortcuts",
  "publisher": "stablyai",
  "version": "1.0.0",
  "engines": { "orca": ">=1.4.0" },
  "pluginApi": 1,
  "contributes": {
    "commands": [ ... ],
    "keybindings": [ ... ]
  },
  "capabilities": []
}
```

JSON 全体を理解する必要はありません。主な項目と、VS Code の拡張マニフェストとの対応は次のとおりです。

| Orca の項目 | 意味 | VS Code の対応項目 |
|---|---|---|
| `publisher` + `id` | 公開者とプラグイン名 | `publisher` + `name` |
| `version` | プラグインのバージョン | `version` |
| `engines.orca` | 対応する Orca のバージョン | `engines.vscode` |
| `contributes` | 追加する機能やデータ | `contributes` |
| `pluginApi` | Orca のプラグイン API バージョン | 相当するものなし |
| `capabilities` | 要求する権限 | 相当するものなし |

とくに重要なのが `contributes` です。「このプラグインは Orca に何を追加するのか」を宣言します。

2つのプラグインを比べてみます。テーマを追加するプラグインは `themes` を持ちます。

```json
"contributes": {
  "themes": [{ "id": "midnight", "label": "Orca Midnight", "path": "themes/midnight.json" }]
}
```

エージェント向けの手順書であるスキルを追加するプラグインは、`skills` を持ちます。

```json
"contributes": {
  "skills": [{ "path": "skills", "providers": ["codex", "claude", "agent-skills"] }]
}
```

`providers` は、そのスキルを利用できるエージェントを示します。この例では Codex、Claude、Agent Skills 対応エージェントが対象です。1つのプラグインから、複数のエージェントへ同じスキルを追加できます。

VS Code の拡張マニフェストとの大きな違いが `capabilities` です。Orca はこの項目で、プラグインが必要とする権限を宣言できるようにしています。

今回確認した3件を比べます。`[]` は、要求する権限がないことを表します。

| プラグイン | contributes | capabilities |
|---|---|---|
| `orca-navigation-shortcuts` | commands, keybindings | `[]` |
| `orca-midnight-theme` | themes | `[]` |
| `orca-workflow-skills` | skills | `[]` |

3件とも空でした。残りの5件は確認していないため、公式の8件すべてが空とは断定できません。

## VM レシピのプラグインを実際に入れてみる

画面に表示された `Orca Multipass Recipes` をインストールします。このプラグインが追加するのは、仮想マシンを作るための設定ファイルです。Orca では、この設定ファイルを「VM レシピ」と呼んでいます。

プラグイン画面の上部には、機能全体のスイッチと次の説明があります。

> インストールされたプラグインを検出し、個別に有効にできます。**レビューして有効にするまで何も実行されません。** ワーカーは常にこのコンピューターで実行され、SSHワークスペースアクションはOrcaを通過します。

カードの「インストール」を押すと、確認のダイアログが出ました。

![インストール確認ダイアログ。「含む」の欄に「1つのVMレシピ」と表示され、キャンセルとプラグインをインストールのボタンが並んでいる](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-orca-plugins/install-dialog.png)

ダイアログには、バージョン、配布元、公開者に加えて「1つのVMレシピ」と表示されました。これは、マニフェストの `contributes.vmRecipes` に定義された1件のレシピを指します。

```json:orca-plugin.json
"contributes": {
  "vmRecipes": [{ "path": "recipes/ubuntu-lts.json" }]
},
"capabilities": []
```

この画面で利用者が確認するのは、VM レシピが1件追加されることです。`capabilities` は空なので、権限に関する確認項目は表示されません。

「プラグインをインストール」を押すと、次のファイルが追加されました。

```
stablyai.orca-multipass-recipes/
├── 577329...4d7b09/
│   ├── orca-plugin.json
│   └── recipes/ubuntu-lts.json      ← これが増えたファイル
├── .install-provenance/
└── current
```

追加された本体は `recipes/ubuntu-lts.json` です。プログラムを追加するのではなく、Orca の既存機能が読み込む設定ファイルを追加するプラグインだと分かります。

## 同意の記録にはハッシュが残る

最後に、Orca がプラグインの内容と利用者の同意をどう記録するのかを見ます。

インストール済みプラグインの情報は `plugins.lock.json` に保存されます。中には `contentHash` と `capabilityHash` という2つのハッシュがありました。まず、同梱の `Orca Navigation Shortcuts` の記録を例に見ます。

ハッシュは、データから計算する「指紋」のような文字列です。元のデータが変わるとハッシュも変わるため、内容の違いを見分けるために使えます。

### `contentHash` はインストールした内容を識別する

`contentHash` は、インストール先のディレクトリ名に使われていました。

```
~/Library/Application Support/Orca/plugins/stablyai.orca-navigation-shortcuts/
├── ce3a146b...cc3a777/          ← contentHash と同じ名前
│   └── orca-plugin.json
├── .install-provenance/
│   └── ce3a146b...cc3a777.json
└── current                      ← 中身は "ce3a146b...cc3a777" の1行
```

プラグイン本体は、`contentHash` ごとのディレクトリに保存されます。`current` には、現在使うディレクトリのハッシュが1行で書かれていました。

この構造なら、更新前後のファイルを別のディレクトリに保存できます。どのディレクトリを使うかは、`current` の値で切り替えられます。

### `capabilityHash` は同意の記録と対応する

`capabilityHash` と同じ値は、インストール元の情報を保存する `.install-provenance/` にもありました。こちらでは `consentFingerprint`、つまり「同意内容の指紋」という名前です。

この名前からは、`capabilities` の内容だけで計算した値に見えます。しかし、2件のプラグインを比べると、それだけではないことが分かります。

| プラグイン | capabilities | capabilityHash |
|---|---|---|
| `orca-navigation-shortcuts` | `[]` | `sha256-d53vynaH...` |
| `orca-multipass-recipes` | `[]` | `sha256-3+lt7Q88...` |

どちらも `capabilities` は空ですが、`capabilityHash` は異なります。権限の一覧だけから計算するなら、同じ値になるはずです。

インストール時のダイアログでは、`contributes` に書かれた追加内容も確認しました。そのため、`capabilityHash` は権限だけでなく、プラグインが追加する内容も反映している可能性があります。

ただし、計算式は公開されていません。ここから先は、確認できた値をもとにした推測です。

同じ値は、Orca の設定ファイル `profiles/local-default/orca-data.json` にも保存されていました。

```json
"pluginSystemEnabled": true,
"disabledPlugins": [],
"pluginConsents": {
  "stablyai.orca-multipass-recipes": "sha256-3+lt7Q88..."
},
"devPluginPaths": []
```

`pluginConsents` には、自分で追加した `orca-multipass-recipes` だけがあり、同梱の `orca-navigation-shortcuts` はありません。利用者がインストールに同意したプラグインを記録する項目のようです。

Orca がこの値をいつ、どのように照合するかは確認できませんでした。ただし、現在の値と記録済みの値を比べれば、同意した後に確認対象が変わったかどうかを検出できます。

今回確認したプラグインは権限を要求していません。それでも、将来の権限追加や内容変更を区別できる形で同意の記録が残っていました。

## まとめ

Orca のプラグイン機能を調べて分かったことは、次の5点です。

- マーケットプレイスは、プラグイン本体ではなく取得先をまとめたカタログです
- 公式の一覧には8件ありますが、Orca v1.4.173 の画面には3件しか表示されませんでした
- プラグインは、それぞれ独立した Git リポジトリから取得されます
- マニフェストの `contributes` が追加内容を、`capabilities` が必要な権限を表します
- インストール時には、取得元のコミットと利用者の同意に関するハッシュが記録されます

今回確認できたのは、テーマや設定ファイルなど、Orca の既存機能が読み込むデータを追加するプラグインが中心でした。changelog にあるパネルやワーカーの実例は、公式マーケットプレイスにはまだありません。

一方で、マニフェストには権限を宣言する欄があり、同意した内容を識別するハッシュも残ります。現在の小さなプラグインだけでなく、より多くの権限を使うプラグインも扱えるように設計されていることがうかがえます。

## 参考

記事の執筆時に確認した公式情報とリポジトリです。

- [Orca 公式サイト](https://www.onorca.dev/)
- [Orca changelog](https://www.onorca.dev/changelog)
- [GitHub: stablyai/orca](https://github.com/stablyai/orca)
- [GitHub: stablyai/orca-plugins（公式マーケットプレイス）](https://github.com/stablyai/orca-plugins)
- [【Claude Code】AIエージェントを並列実行できるADE「Orca」を触ってみた](https://qiita.com/tamakiiii/items/9b22ca0b287309ebba32)

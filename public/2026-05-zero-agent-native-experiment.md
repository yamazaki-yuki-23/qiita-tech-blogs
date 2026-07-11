---
title: Vercel Labsの新言語「Zero」のAIエージェント向け機能を試してみた
tags:
  - zero
  - Vercel
  - AIエージェント
  - ClaudeCode
  - SystemsProgramming
private: false
updated_at: '2026-05-17T17:50:53+09:00'
id: 242ab7921f2bc8331e5b
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---

**TL;DR**

- Vercel Labsが2026-05-16にリリースしたシステムプログラミング言語「Zero」を、リリース翌日に手元の macOS で触った
- Zeroは「Humans read the message. Agents read the JSON」を掲げ、AIエージェントが書く・直す・検査することを前提に設計された言語
- 構造化されたエラー・警告のJSON、`zero explain`、`zero fix --plan --json` あたりは確かに実装されており、思想は本物
- 一方で v0.1.1 の macOS arm64 direct backend は極端に限定的で、`std` を使う実用CLIは事実上書けない。コンセプトの実証は強いが、製品としては実験段階

検証時点の情報です。

- 検証日: 2026年5月17日
- OS: macOS（Darwin 24.6.0, arm64）
- Zero: `0.1.1`
- 検証で使ったエージェント: Claude Code（Opus 4.7）

## Zeroとは

Vercel Labsが2026年5月16日に v0.1.1 として公開した、新しいシステムプログラミング言語です。

https://zerolang.ai/

https://github.com/vercel-labs/zero

公式サイトのトップにはこう書かれています。

> Zero is the programming language for agents: a systems language for small native tools.

要するに、「**小さなネイティブツールを、人間とAIエージェントが協働で書くための言語**」。設計の柱は次の4つです。

- 静的ディスパッチ
- 必須GCなし
- 明示的なI/Oケイパビリティ
- 構造化されたエラー・警告の出力

公式サイトには、もうひとつ目を引くキャッチフレーズが並んでいました。

> Humans read the message. Agents read the JSON.

普通のコンパイラのエラーメッセージは人間に読ませる前提で書かれます。Zeroは最初からエージェントに読ませる前提でJSONを出すと言っている。本当にそうなのか、リリース翌日のうちに触って確かめました。

## 本記事の問い

この記事は、Zeroについて公式が言っていることをそのまま紹介するレビューではありません。次の問いを立てて実機で検証した記録です。

> 「AIエージェント向けに作られた」というコンセプトは、本当に体感できるのか？

検証の対象は、Zero v0.1.1 のCLIに含まれる次のサブコマンドです。

- `zero check --json` — コードチェックの結果をJSONで返す
- `zero explain <code> --json` — エラーコードの構造化された説明
- `zero fix --plan --json` — 修復プランの提案
- `zero graph --json` / `zero size --json` / `zero doctor --json` — グラフ・サイズ・環境チェックのJSON出力
- `zero skills` — エージェント向けスキルドキュメントの取得（らしい）

これらを順番に試して、「人間向けの言語ではこうはならない」と思える設計が本当にあるかを確認します。

## インストールから最初のプログラムまで

### インストール

公式インストーラ一発。

```sh
curl -fsSL https://zerolang.ai/install.sh | bash
export PATH="$HOME/.zero/bin:$PATH"
zero --version
```

`zero --version` の出力には、ターゲット一覧と「target compiler: missing」という気になる警告が混じっていました。

```console
zero 0.1.1
commit: unknown
host: darwin-arm64
backend: zero-c
targets: ["darwin-arm64", "darwin-x64", "linux-musl-x64", "linux-musl-arm64", "linux-x64", "linux-arm64", "win32-x64.exe", "win32-arm64.exe", "wasm32-wasi", "wasm32-web"]
target compiler: missing
```

警告にぶつかったので、まずは `zero doctor --json` に投げ込みました。これがいきなり、思想を体現した出力を返してきます。

### `zero doctor --json` の出力

```json
{
  "schemaVersion": 1,
  "status": "warning",
  "host": "darwin-arm64",
  "checks": [
    {"name": "host", "status": "ok", "message": "darwin-arm64"},
    {"name": "native-c-compiler", "status": "ok", "message": "Apple clang version 17.0.0 (clang-1700.6.3.2)"},
    {"name": "target-c-compiler", "status": "warning", "message": "target-capable C compiler not found; cross-target executable builds may be unavailable"},
    {"name": "wasi-runner", "status": "warning", "message": "install wasmtime, wasmer, or wasmedge to execute wasm32-wasi artifacts locally"},
    ...
  ],
  "targetToolchains": [
    {"target": "darwin-arm64", "status": "ok", "sysrootStatus": "not-required"},
    {"target": "linux-musl-x64", "status": "warning", "sysrootEnv": "", "sysrootStatus": "not-required"},
    ...
  ],
  "wasiRunners": [
    {"name": "wasmtime", "available": false, "status": "missing", "purpose": "execute wasm32-wasi artifacts in local and CI harnesses"},
    ...
  ]
}
```

注目したいのは、各チェック項目に `status` と `message` だけでなく、ターゲットごとのツールチェイン状態、必要な環境変数（`sysrootEnv`）、WASIランナーの有無まで構造化されている点。エージェントが「いま何が足りないか」をプログラム的に把握できる形式です。

普通のCLIなら「target compiler is missing」程度で終わるところを、Zero はターゲットごとに `sysrootEnv` と `sysrootStatus` を別フィールドで返してきます。たとえば `linux-x64` の項目では `"sysrootEnv": "ZERO_SYSROOT_X86_64_LINUX_GNU", "sysrootStatus": "missing"` というように、「どの環境変数を設定すれば直るか」と「いま欠けているのか」を分離して持たせています。

WASI ランナーの欠落も `"install wasmtime, wasmer, or wasmedge to execute wasm32-wasi artifacts locally"` という具体的な指示が message に乗ってきます。`wasi-runner` というチェック名と合わせて、エージェントが「どのチェックで何が不足しているか」をプログラム的に分岐できる形式です。

### Hello, Zero

最初のプログラムは公式に倣います。

```zero:hello.0
pub fun main(world: World) -> Void raises {
    check world.out.write("hello from zero\n")
}
```

```sh
zero check hello.0
zero run hello.0
```

```console
ok
hello from zero
```

ここで気になる構文が3つ出てきます。

- `world: World` — I/Oケイパビリティは引数として明示的に渡される。隠れたグローバルなI/Oは無い
- `raises` — 関数がエラーを返しうることをシグネチャに書く
- `check` — 失敗しうる呼び出しの前に置く。エラーは `raises` 経路で呼び出し元に伝播する

「明示的な副作用」を売りにする Zig / Roc / Unison の設計に近い思想です。Rust や Go のように「とりあえず stdout に書ける」のではなく、`world.out` を引数として受け取らないと一切出力できない。

ここまでは順調でした。問題は、ここから `std` を使った実用CLIを書こうとした次の瞬間に出てきます。

## 「CRC-32ツールを作ってみる」で挫折した話

「作ってみた」系の定番として、引数で渡されたファイルの CRC-32 を出力するCLIを書こうとしました。Zeroの [`examples/zero-hash`](https://github.com/vercel-labs/zero/tree/main/examples/zero-hash) を参考に、こんなコードまで持っていきました。

```zero:zero-crc/src/main.0
pub fun main(world: World) -> Void raises { NotFound, TooLarge, Io } {
    let fs = std.fs.host()
    let mut storage: [256]u8 = [0, 0, 0, /* ...残り253個もゼロを列挙（省略）... */]
    let mut alloc = std.mem.fixedBufAlloc(storage)

    let arg_path = std.args.get(1)
    if arg_path.has {
        let path = arg_path.value
        let body = std.fs.readAll(alloc, fs, path, 256)
        if body.has {
            let mut buf: owned<ByteBuf> = body.value
            let bytes = std.mem.bufBytes(&buf)
            let checksum = std.codec.crc32Bytes(bytes)
            check world.out.write("crc32: ")
            check world.out.writeHex32(checksum)
            check world.out.write("\n")
        }
    } else {
        check world.out.write("usage: zero-crc <file>\n")
    }
}
```

`zero check .` は通ります。

```console
ok
```

なお、コード中の `world.out.writeHex32` のような別モジュールのAPI呼び出しは、`zero run` まで到達できなかったため**実機での動作は確認できていません**。試しに `world.out.totallyMadeUpFunction(42)` のように完全なデタラメ関数名を書いたファイルでも `zero check` が `ok` を返したので、v0.1.1 の `check` は別ファイルAPIのシンボル解決を厳密には行っていないようです。

ところが `zero run .` を実行すると、次のエラーが返ってきました。

```console
./src/main.0:1:1 CGEN004: direct backend does not support target 'darwin-arm64' for --emit exe
  expected: direct target with matching object format and architecture
  actual: target=darwin-arm64 objectFormat=macho arch=aarch64 abi=darwin status=native-exe
  help: direct executable backend is not implemented for this target/backend pair; use --emit obj for direct target objects or choose a supported direct executable target
  explain: zero explain CGEN004
```

気になるのは、`status: native-exe` と書いてあるのに `direct backend does not support target` と返してくる点。同じことが、ファイルを使わない単純な計算プログラムでも起きました。

```zero:crc-simple.0
pub fun main(world: World) -> Void raises {
    let bytes = std.mem.span("hello zero\n")
    let checksum = std.codec.crc32Bytes(bytes)
    check world.out.write("crc32(hello zero) = ")
    check world.out.writeHex32(checksum)
    check world.out.write("\n")
}
```

```console
crc-simple.0:6:31 CGEN004: direct backend calls currently support only same-file function identifiers
  expected: direct AArch64 Mach-O object MVP subset
  actual: non-identifier callee
  help: choose a supported direct target or restrict this program to exported no-parameter functions returning small integer literals
```

別モジュールの関数呼び出し（ここでは `std.codec.crc32Bytes`）が、現状の darwin-arm64 direct backend では出せないようです。`zero check` は型検査までを通しますが、direct backend 固有の制約（同一ファイル関数呼び出ししか出せない）は後段の codegen フェーズで初めて引っかかります。

`zero check --json` の `compilerPhases` フィールドを見ると、`check` と `codegen` が別フェーズとして並んでいるのが確認できます。

```json
"compilerPhases": [
  {"name":"resolve","elapsedMs":0,"cacheable":true},
  {"name":"parse","elapsedMs":0,"cacheable":true},
  {"name":"interface","elapsedMs":0,"cacheable":true},
  {"name":"check","elapsedMs":0,"cacheable":true},
  {"name":"lower","elapsedMs":0,"cacheable":true},
  {"name":"codegen","elapsedMs":0,"cacheable":true},
  {"name":"object","elapsedMs":0,"cacheable":true},
  {"name":"link","elapsedMs":0,"cacheable":false}
]
```

`check` で通っても、その後の `lower` / `codegen` / `object` / `link` のどこかで詰まる可能性があるという構造です。

**Zero v0.1.1 の macOS arm64 ネイティブバックエンドで実機実行できるのは、現状は単一ファイル内に閉じた単純なプログラムまでに見えます**。標準ライブラリの別モジュールにある関数を呼ぶと codegen フェーズで止まります。クロスコンパイル用のCバックエンドを使えば動く可能性はありますが、`doctor` は「target-capable C compiler not found」と教えてくれていました。

ここから、最初に立てた問いの検証に進みます。

## 検証①: `check --json` の出力は本物か

人間向けには「unknown identifier」の1行で済むエラーが、`--json` を付けるとどう変わるか。3種類のバグを仕込んだファイルを用意しました。

### バグ1: 未定義シンボル

```zero:bug-undefined.0
pub fun main(world: World) -> Void raises {
    check world.out.write(greeting)
}
```

```sh
zero check --json bug-undefined.0
```

返ってきた `diagnostics` フィールドだけ抜粋します。

```json
{
  "severity": "error",
  "code": "NAM003",
  "message": "unknown identifier 'greeting'",
  "path": "bug-undefined.0",
  "line": 3,
  "column": 27,
  "length": 1,
  "expected": "visible local, parameter, function, or builtin",
  "actual": "no matching visible symbol",
  "help": "declare the name before using it",
  "fixSafety": "requires-human-review",
  "repair": {
    "id": "declare-missing-symbol",
    "summary": "Declare the referenced symbol, import the module that provides it, or correct the identifier spelling."
  },
  "related": []
}
```

注目すべきフィールドは `expected` / `actual` / `fixSafety` / `repair.id` の4つ。

- `expected` と `actual` は、人間向けメッセージで「unknown identifier」に潰されていた情報を機械可読なまま保持している
- `fixSafety: "requires-human-review"` は、自動修復しても安全かどうかをエージェント側に伝える
- `repair.id: "declare-missing-symbol"` は、修復の種類を分類した識別子。エージェントは `id` ごとにロジックを切り替えられる

これは LSP の `Diagnostic` より一歩踏み込んだ構造です。LSP は「修正候補のテキスト変更」を返しますが、Zero は「修復の分類」を返してくる。エージェントが受け取って判断する余地を残した設計です。

### バグ2: 戻り値の型不一致

```zero:bug-type.0
fun answer() -> i32 {
    return "forty two"
}

pub fun main(world: World) -> Void raises {
    let value = answer()
    if value == 42 {
        check world.out.write("ok\n")
    }
}
```

```json
{
  "severity": "error",
  "code": "TYP003",
  "message": "return type does not match function return type",
  "expected": "i32",
  "actual": "String",
  "help": "return a value compatible with the function signature",
  "fixSafety": "requires-human-review",
  "repair": {
    "id": "match-return-type",
    "summary": "Change the returned expression or the function return annotation so both types agree."
  }
}
```

ここでも `expected: "i32"`, `actual: "String"` のように、TypeScriptコンパイラの diagnostics に近い精度で型情報が乗っています。`repair.id: "match-return-type"` が示すのは、「戻り値を変えるか、シグネチャを変えるか」の二択。

### バグ3: `check` を付け忘れた raises 関数の呼び出し

```zero:bug-raises.0
pub fun main(world: World) -> Void raises {
    world.out.write("missing check keyword\n")
}
```

これが意外な結果でした。`zero check --json` の `diagnostics` は空。

```json
"diagnostics": []
```

ところが `zero run` を実行すると、別のエラーが出ます。

```console
bug-raises.0:3:20 CGEN004: direct backend calls currently support only same-file function identifiers
```

仕様なのかバグなのか判断に迷うところですが、少なくとも check フェーズと codegen フェーズが分かれていることは確かです。エージェント運用の観点では「`check --json` だけ見て満足してはいけない」という学びになりました。

### Claude Code に diagnostics を渡してみる

`bug-undefined.0` の JSON 出力をそのまま Claude Code に渡しました。

> 次のJSONは Zero言語のコンパイラが出したエラー・警告の出力です。`repair.id` を見て、安全な修復を提案してください。

Claude は `repair.id: "declare-missing-symbol"` を読み取って、「`greeting` という名前の変数を main の冒頭で宣言する」「import で持ち込む」の2案を返してきました。ソースコード本体を見せずに JSON だけで判断できたのが、地味に効いた瞬間でした。

人間向けの「unknown identifier 'greeting'」だけだと、変数宣言なのか import 漏れなのかタイポなのかの分岐情報が落ちます。`repair.id` でクラス分けされているので、エージェント側が事前に「`declare-missing-symbol` ならまずスコープ探索」のようなハンドラを書ける。設計意図が一気に見えました。

## 検証②: `zero explain` と `zero fix --plan --json`

`zero explain` はエラーコードの恒久的な説明を取得するコマンド。`--json` を付けると次のような構造で返ります。

```sh
zero explain CGEN004 --json
```

```json
{
  "schemaVersion": 1,
  "code": "CGEN004",
  "category": "codegen",
  "title": "Direct backend unsupported",
  "summary": "The selected direct backend cannot emit this target, object format, architecture, executable kind, or source feature yet.",
  "why": "Direct backends are target-specific and must report unsupported targets instead of routing through a removed compatibility backend.",
  "repair": {
    "id": "choose-supported-direct-backend",
    "summary": "Choose a target whose `zero targets --json` directBackend facts advertise the requested artifact, or use `--emit obj` where executable emission is not implemented."
  },
  "examples": {
    "bad": "zero build --emit obj --target linux-arm64 examples/direct-call-add.0",
    "good": "zero build --emit obj --target linux-x64 examples/direct-call-add.0"
  }
}
```

`category`, `title`, `summary`, `why`, `repair`, `examples.bad`, `examples.good` がそれぞれ独立したフィールドとして返ってきます。Rust の `--explain` も近いことをやっていますが、JSON で `bad` / `good` のコマンド例まで構造化して返すのは Zero が一歩踏み込んでいる部分。

これとペアで使うと面白いのが `zero fix --plan --json` でした。

```sh
zero fix --plan --json bug-undefined.0
```

```json
{
  "schemaVersion": 1,
  "ok": false,
  "mode": "plan",
  "appliesEdits": false,
  "safetyLevels": ["format-only", "behavior-preserving", "api-changing", "target-changing", "requires-human-review"],
  "input": "bug-undefined.0",
  "diagnostics": [{
    "code": "NAM003",
    "repair": {"id": "declare-missing-symbol", "summary": "..."}
  }],
  "fixes": [{
    "id": "declare-missing-symbol",
    "diagnosticCode": "NAM003",
    "safety": "requires-human-review",
    "summary": "Declare the referenced symbol, import the module that provides it, or correct the identifier spelling.",
    "appliesEdits": false
  }]
}
```

肝は `safetyLevels` というメタな配列です。Zero は修復を5段階に分類する仕様を最初から持っていて、各 `fix` にどのレベルなのかをタグ付けします。

- `format-only` — 整形のみ
- `behavior-preserving` — 挙動は変えない
- `api-changing` — 公開APIに影響する
- `target-changing` — ターゲット指定が変わる
- `requires-human-review` — 人間の判断が必要

エージェントが自動修復を回す時、「`behavior-preserving` までは自動適用、`api-changing` 以上は人間に確認」といったポリシー設計が、言語側のメタデータだけで決められる構造です。

ただし `appliesEdits: false` が示すとおり、現状の `zero fix` は **まだ提案を返すだけで、ソースを書き換える機能は未実装**。「将来エージェントが書き換えるための足場」を先に整えた、という印象を受けました。

## 検証③: `graph --json` / `size --json` の情報密度

最後に、コード解析系の出力を見ます。`zero graph --json hello.0` の戻り値のトップレベルキー一覧がこちらです。

```json
[
  "schemaVersion", "sourceFile", "targets", "package", "packageCache",
  "targetSupport", "requiresCapabilities", "selfHostSubset", "selfHostRouting",
  "compileTime", "releaseMatrixTargetSupport", "stdlibHelpers",
  "cImports", "cLibraries", "symbolCounts", "sourceFiles", "sourceMaps",
  "imports", "modules", "interfaceFingerprints", "importEdges",
  "symbols", "functions", "shapes", "interfaces", "aliases",
  "consts", "enums", "choices", "compilerPhases", "compilerCaches",
  "incrementalInvalidation"
]
```

`hello.0` ひとつに対してこれだけのフィールドが返ってきます。`symbols` / `functions` / `shapes` / `enums` / `choices` の型情報、`importEdges` の依存グラフ、`compilerCaches` のキャッシュキー、`incrementalInvalidation` の再ビルド戦略まで、コンパイラの内部状態がそのまま外向きAPIになっている。

`zero size --json hello.0` の方は、バイナリサイズに関する情報が中心です。

```json
{
  "requiresCapabilities": ["world"],
  "sections": [
    {"name": "lowered-ir", "kind": "ir", "bytes": 2192},
    {"name": "direct-size-metadata", "kind": "metadata", "bytes": 0}
  ],
  "topLargestEmittedHelpers": [...],
  "sizeBreakdown": {...},
  "retentionReasons": [...],
  "optimizationHints": [...],
  "profileBudget": {...}
}
```

`retentionReasons`（なぜそのシンボルが残ったのか）と `optimizationHints`（最適化の余地）が機械可読で出てくるのは、リファクタや軽量化をエージェントに任せる相手として頼もしいポイントです。

実際にこれらの JSON を Claude Code に渡して、「不要そうなものを削れ」「次に最適化すべき場所は？」と問うと、`retentionReasons` を引きながら具体的な提案を返してきます。コンパイラの内部状態が外向きAPIとして整っているので、エージェントが「想像で答える」必要が減ります。

## 検証 (失敗): `zero skills` は動かなかった

公式 README には `zero skills get zero --full` というコマンドが載っています。「Zero言語そのもののスキルドキュメント」をエージェント用に取得するコマンドらしい。一番楽しみにしていた機能でしたが、配布バイナリではまだ動きません。

```sh
zero skills get zero --full
```

```console
zero skills is served by the bin/zero wrapper; run `bin/zero skills` from the checkout.
```

`zero skills list`, `zero skills path` も同じメッセージ。GitHubからソースをクローンして、リポジトリ内の `bin/zero` ラッパー経由で呼ぶ必要があるようです。

これは v0.1.1 時点の制約です。「言語自身がエージェント向けスキルを配布する」という発想は他言語にあまり例がなく、整備が進んだ時にどんな形になるか楽しみです。

## コンセプトは体感できたのか

ここまでの検証を踏まえて、最初の問いに答えます。

> 「AIエージェント向けに作られた」というコンセプトは、本当に体感できるのか？

結論は **「思想は本物だが、実装はまだ実験段階」**。

「本物」と感じた部分。

- `check --json`, `explain --json`, `fix --plan --json`, `doctor --json`, `graph --json`, `size --json` のすべてが、人間向けメッセージとは別物の構造化情報を返してくる
- 特に `repair.id` と `safetyLevels` の組み合わせは、エージェント自動修復のための足場として明確に設計されている
- `targets --json` の `capabilityFacts` で「このターゲットで `fs` は使えるか」を事前にチェックできる構造も、明示的なI/Oケイパビリティの思想と整合している

「未熟」と感じた部分。

- darwin-arm64 の direct backend が極端に限定的で、`std` の別モジュール関数を呼んだだけで詰む
- `zero fix` の `appliesEdits` が `false`。提案は返すが自動編集はまだできない
- `zero skills` 系は配布バイナリでは動かない
- `bug-raises` のように check では通って codegen で落ちる挙動があり、check と run の保証の差を理解する必要がある

このギャップは v0.1.1 という番号通りです。Vercel Labs はコンセプトの実証として Zero を出し、エージェント向けのJSON出力を最初から仕込んでおく。あとからエージェント側の機能（自動編集、スキル配布、修復オートメーション）を上に積めるアーキテクチャを先に敷いた、というのが個人的な見立てです。

## 触ってみて湧いた疑問

検証中にメモした「これは何のために？」をそのまま残しておきます。

**`World` を引数で渡す設計の射程はどこまでか。** 明示的なI/Oケイパビリティは Zig や Roc も採用していますが、Zero は `requiresCapabilities` を JSON で返すところまで踏み込んでいます。Capability-based security の発想に近く、将来の sandbox 実行や WASI 実行と組み合わせると面白そうです。

**なぜ Vercel Labs が言語を作るのか。** v0 系のフロントエンド生成、Cursor との距離感、Next.js エコシステムからの転回など、いくつかの文脈が考えられます。「エージェントが書いた小さなネイティブツールを Vercel が動かす未来」を想定しているなら、エージェントが扱えるランタイム/言語を自社で持つことに合理性があります。Zero に最初からJSON出力が仕込まれているのも、その文脈で読み解けます。

**「エージェント向けのJSON出力」は標準化されるべきでは。** LSP は人間と IDE のために標準化されました。Zero の `check --json` のような構造は、各言語コミュニティがバラバラに定義するより、Anthropic / OpenAI / Vercel が合意して標準仕様を作った方がエージェント実装側の負担が下がる気がします。

希望的観測ですが、Zero が投じた `repair.id` と `safetyLevels` のような分類は、他言語のコンパイラ・リンタ・LSPサーバにも応用が効くはずです。

## まとめ

- Zero は「Humans read the message. Agents read the JSON」というキャッチフレーズを実装で裏付けている。`check --json` の `repair.id`、`explain` の構造化フィールド、`fix --plan --json` の `safetyLevels`、`doctor` / `graph` / `size` のメタデータはどれも本気のエージェント志向
- v0.1.1 時点の macOS arm64 native backend は、実用ツールが書けないほど制限が強い。Hello World と算術以外を試したいなら、Linux ターゲットや WASI を経由するのが現実的
- 「`zero skills`」は配布バイナリで動かない。ただしコンセプト自体は他言語に無い試みで、今後の整備に注目
- 「コンセプトは体感できたか」に対する答えは、**「思想は本物。製品はまだ実験段階」**

公式リンク。

https://zerolang.ai/getting-started

https://github.com/vercel-labs/zero/tree/main/examples

本記事の検証で使ったコード一式は、別リポジトリに置いています。

https://github.com/yamazaki-yuki-23/zero-agent-experiment

再現する場合は `zero --version` が `0.1.1` であることを確認してから試してみてください。

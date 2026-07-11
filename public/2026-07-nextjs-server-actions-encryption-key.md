---
title: Server Actionsを使うなら知っておきたい NEXT_SERVER_ACTIONS_ENCRYPTION_KEY の役割と必要性
tags:
  - Next.js
  - ServerActions
  - TypeScript
  - セキュリティ
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---

## 公式ドキュメントと実装から読み解く

self-hostingガイドを読んでいると、次のような記述に出会う。

> Set a consistent encryption key using the `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` environment variable.

しかし、次の点までは詳しく説明されていない。

- この環境変数は何を暗号化しているのか
- Server Actionsを識別する「Action ID」とは何が違うのか
- なぜ複数サーバーインスタンスで固定する必要があるのか

この記事では、公式ドキュメントの記述とNext.js本体の実装（RustコンパイラとTypeScriptランタイム）を突き合わせて、この環境変数の役割を整理する。

**この記事の方針**

- **事実**：公式ドキュメント、またはNext.jsのソースコードから直接確認できる内容
- **考察**：事実を実運用に当てはめた、筆者の推測を含む内容

を明確に区別して書く。

ソースコードの引用は、2026-07-11時点のvercel/next.js canaryブランチ（コミット`1bd2fd5`、`next`パッケージ`16.3.0-canary.83`）を参照した。
将来のバージョンでは実装が変わる可能性がある。

対象読者は、Server Actionsを一度は使ったことがある人を想定する。
`'use server'`や`<form action={fn}>`の基本的な使い方の説明は省略する。

## Server Actionsの実行フロー

まず全体の流れを整理する。

```text
Client
  │  <form action={updateUser}>
  ▼
POST (Action IDをヘッダーに含む)
  │
  ▼
Server: Action IDから対応するServer Actionを解決
  │
  ▼
Server Actionを実行
```

クライアントは関数そのものではなく、ビルド時に発行された「Action ID」を使ってサーバーにPOSTする。
サーバーはそのIDから実行すべき関数を特定する。

## Action IDの生成方法（事実）

Action IDは、Next.jsのコンパイラ（Rust実装）が生成する。
`generate_server_reference_id`関数（`crates/next-custom-transforms/src/transforms/server_actions.rs`）が該当する。

```rust
// crates/next-custom-transforms/src/transforms/server_actions.rs より抜粋・簡略化
let mut hasher = Sha1::new();
hasher.update(self.config.hash_salt.as_bytes());
hasher.update(self.file_name.as_bytes());
hasher.update(b":");
// export_name（識別子 or 文字列）を追加
hasher.update(export_name_bytes);
```

`hash_salt + file_name + ":" + export_name`をSHA-1でハッシュ化し、先頭に「cache関数かどうか」「引数の使用状況」などを詰めた1バイトを付加してhex文字列化したものがAction IDだ。

参考：[crates/next-custom-transforms/src/transforms/server_actions.rs](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/crates/next-custom-transforms/src/transforms/server_actions.rs)

Action IDはServer Actionを識別するためのIDであり、後述するクロージャ変数の暗号化とは**別の仕組み**だ。
公式ドキュメントの`data-security`ガイドでも、この2つは次のように独立した機能として説明されている。

> - **Secure action IDs:** Next.js creates encrypted, non-deterministic IDs to allow the client to reference and call the Server Action.
> - **Dead code elimination:** Unused Server Actions are removed from client bundle to avoid public access.

## Action IDだけではクロージャ変数を扱えない

Server Actionが外側のスコープの変数を参照している場合を考える。

```tsx
export default async function Page() {
  const userId = "123" // クロージャで捕捉される値

  async function updateUser() {
    "use server"
    await update(userId)
  }

  return <form action={updateUser}>...</form>
}
```

Action IDは「どの関数を呼ぶか」しか表現できない。
`userId`のような、レンダリング時にスナップショットとして捕捉された値は、クライアントに送られ、Server Action実行時にサーバーへ送り返す必要がある。
この値をそのまま送ると、クライアントに機密情報が漏れる。
ここで登場するのがクロージャ変数の暗号化だ。

## クロージャ変数は暗号化される（事実）

公式ドキュメントの`data-security`ガイドには次の記述がある。

> To prevent sensitive data from being exposed to the client, Next.js automatically encrypts the closed-over variables. A new private key is generated for each action every time a Next.js application is built.

実装は`packages/next/src/server/app-render/encryption.ts`の`encryptActionBoundArgs`/`decryptActionBoundArgs`だ。
両関数は捕捉した引数をReact Flightでシリアライズしたうえで、`encryption-utils.ts`の`encrypt`/`decrypt`を呼び出す。
暗号方式はAES-GCMで、`crypto.subtle.encrypt`/`decrypt`に`{ name: 'AES-GCM', iv }`を渡す形で実装されている。
IV（初期化ベクトル）は呼び出しごとにランダム生成される16バイトの値だ。

参考：
- [packages/next/src/server/app-render/encryption.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption.ts)
- [packages/next/src/server/app-render/encryption-utils.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils.ts)

## NEXT_SERVER_ACTIONS_ENCRYPTION_KEYの役割（事実）

暗号化に使う鍵の生成部分は`encryption-utils-server.ts`の`generateEncryptionKeyBase64`にある。

```typescript
// packages/next/src/server/app-render/encryption-utils-server.ts より抜粋・簡略化
export async function generateEncryptionKeyBase64({ isBuild, distDir }) {
  // NEXT_SERVER_ACTIONS_ENCRYPTION_KEY が設定されていればそれを使う
  // 未設定なら crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, ...) で新規生成
  // 生成した鍵は .rscinfo ファイルに書き込み、14日間キャッシュする
}
```

- 環境変数`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`が設定されていれば、それを鍵として使う
- 未設定の場合、AES-GCM 256bitの鍵を新規生成し、`.rscinfo`というキャッシュファイルに書き込む（有効期限14日）
- ビルドのたびにこのキャッシュが無効化されれば、新しい鍵が生成される

公式ドキュメントの「A new private key is generated for each action every time a Next.js application is built」という説明は、この`generateEncryptionKeyBase64`の挙動に対応している。

参考：[packages/next/src/server/app-render/encryption-utils-server.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils-server.ts)

## 【発見】hash_saltの正体はこの暗号化キーそのもの（事実）

ここまで、Action IDの生成とクロージャ変数の暗号化は別の仕組みだと説明した。
公式ドキュメントもこの2つを独立した機能として書いている。
しかし実装を追うと、この2つは同じ秘密値を共有していることがわかる。

Turbopack経路のコンパイラ設定を見ると、Action IDのハッシュに使う`hash_salt`に、暗号化キーそのものが渡されている。

```rust
// crates/next-core/src/next_shared/transforms/server_actions.rs より
Config {
    is_react_server_layer: self.is_react_server_layer,
    is_development: self.mode.is_development(),
    use_cache_enabled: self.use_cache_enabled,
    hash_salt: self.encryption_key.await?.to_string(),
    cache_kinds: self.cache_kinds.owned().await?,
},
```

webpack経路でも、`packages/next/src/build/swc/options.ts`が`hashSalt: serverReferenceHashSalt`をコンパイラに渡しており、この値は`packages/next/src/build/webpack-config.ts`で暗号化キー（`encryptionKey`変数）から渡されている。

参考：[crates/next-core/src/next_shared/transforms/server_actions.rs](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/crates/next-core/src/next_shared/transforms/server_actions.rs)

つまり、**Action IDのハッシュソルトと、クロージャ変数の暗号化キーは同一の値**だ。
公式ドキュメントが「Secure action IDs」を「non-deterministic（非決定的）」「periodically recalculated between builds（ビルドごとに再計算される）」と説明しているのは、ビルドごとに変わる暗号化キーをソルトに使っているからだと、ソースコードを読んで初めて説明がつく。

この事実は、公式ドキュメントには明記されていない。
日本語の解説記事としては、カミナシ社の技術ブログ「[Next.jsのコンパイラから知るServer Actionsの完全解析](https://kaminashi-developer.hatenablog.jp/entry/nextjs-server-actions)」がAction ID生成のSHA-1ハッシュや`server-reference-manifest.json`の構造まで踏み込んで解説しているが、hash_saltが暗号化キーそのものであるという点には触れていない。

## なぜ複数インスタンスで固定が推奨されるのか（事実＋考察）

ここまでの事実を踏まえると、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`を固定しないことの影響は、クロージャ変数の復号だけでなく、Action IDの一致にも及ぶことがわかる。

自己ホストガイドは次のように説明している。

> When running multiple server instances, all instances must use the same encryption key. Otherwise, a Server Function encrypted by one instance cannot be decrypted by another, causing "Failed to find Server Action" errors.

ここで書かれている「"Failed to find Server Action"エラー」は、文面上はクロージャの復号失敗のように読めるが、実装を踏まえると次の2つの経路のどちらか（あるいは両方）で起こりうると考えられる。

1. 暗号化キーが異なるため、クロージャ変数を復号できない
2. 暗号化キー（＝hash_salt）が異なるため、**そもそもインスタンス間でAction ID自体が一致しない**

公式ドキュメントは1のみを明言しており、2は本記事の考察だ。
ただしソースコード上、`hash_salt`と暗号化キーが同一の値であることは事実として確認できるため、鍵を固定しない限りAction IDもインスタンス間で一致しない、という帰結は妥当だと考える。

## 実運用ではどんな場面で重要になるのか（考察）

以下は公式ドキュメントの「複数インスタンス」「ビルド間でキーを永続化する」という説明を、実運用のシナリオに当てはめた考察だ。
公式ドキュメントは、これらのシナリオを名指ししているわけではない。

- **ローリングデプロイ**：新旧のビルド成果物が一時的に共存する
- **Blue/Greenデプロイ**：環境切り替えの前後で異なるビルドが動く瞬間がある
- **Canaryリリース**：新旧バージョンが意図的に共存する
- **複数ビルドジョブ（タスクごとビルドを含む）**：同一コミットに対して複数回ビルドが走るCI/CD構成

いずれも「同じソースコードから、複数回ビルドされた成果物が同時に動く」状況だ。
鍵を固定しなければ、ビルドのたびに異なる鍵（＝Action IDも復号鍵も別の値になる状態）が生成されるため、これらの状況で不整合が起きうる。

## 設定方法

鍵は公式ドキュメントの案内どおり、OpenSSLで生成できる。

```bash
$ openssl rand -base64 32
F4IonZhUuuDR/Qh3vW4jSzskh2h1KKOWt1I2yyfzgUE=
```

生成した値は、AESの鍵長として有効な16バイト、24バイト、32バイトのいずれか（base64デコード後の長さ）である必要がある。
Next.jsのデフォルト生成も32バイトだ。
実際に上記の出力をデコードしてバイト数を数えると、確かに32バイトになっている。

```bash
$ echo "F4IonZhUuuDR/Qh3vW4jSzskh2h1KKOWt1I2yyfzgUE=" | base64 -d | wc -c
32
```

Dockerでビルドする場合は、ビルド時の引数として渡す。

```dockerfile
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN npm run build
```

CI（GitHub Actions）からSecretsとして渡す例だ。

```yaml
- run: docker build --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${{ secrets.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY }} .
```

公式ドキュメントが示しているのは`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=your-generated-key next build`というシンプルなCLI例のみで、Dockerfile/CIへの組み込みは一般的なDockerビルドの知識を組み合わせた応用例だ。

## この記事で扱わないこと

自己ホストの複数インスタンス運用には、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`以外にも`deploymentId`（アセットのバージョン不整合対策）など関連する設定がある。
ただし目的が異なる別機能であり、混ぜて説明すると論点がぼやけるため、本記事では扱わない。
同様に、鍵のローテーション運用（鍵を差し替える際の再ビルド・再デプロイ手順）も本題から外れるため割愛する。

## まとめ

| 項目 | 内容 |
|---|---|
| Action ID | Server Actionを識別するためのID。`hash_salt + file_name + export_name`のSHA-1ハッシュ |
| クロージャ暗号化 | AES-GCMで暗号化。鍵は`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`または自動生成 |
| 発見（事実） | Action IDのhash_saltと、クロージャ暗号化の鍵は同一の値 |
| 公式が説明していること | 複数インスタンス・ビルド間で鍵を共有する必要がある |
| 実運用での想定（考察） | ローリングデプロイ、Blue/Green、Canary、複数ビルドジョブなど |

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`は、単にクロージャ変数を復号するためだけの設定ではなく、Action IDの一致にも関わる設定だという点が、ソースコードを読んで得られた一番の収穫だった。

## 参考資料

- [How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security#overwriting-encryption-keys-advanced)
- [How to self-host your Next.js application](https://nextjs.org/docs/app/guides/self-hosting#server-functions-encryption-key)
- [crates/next-custom-transforms/src/transforms/server_actions.rs](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/crates/next-custom-transforms/src/transforms/server_actions.rs)
- [crates/next-core/src/next_shared/transforms/server_actions.rs](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/crates/next-core/src/next_shared/transforms/server_actions.rs)
- [packages/next/src/server/app-render/encryption.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption.ts)
- [packages/next/src/server/app-render/encryption-utils.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils.ts)
- [packages/next/src/server/app-render/encryption-utils-server.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils-server.ts)
- [カミナシ Developers Blog「Next.jsのコンパイラから知るServer Actionsの完全解析」](https://kaminashi-developer.hatenablog.jp/entry/nextjs-server-actions)

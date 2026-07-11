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

**TL;DR**

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`は、Server Actionsのクロージャ変数を暗号化する鍵を固定するための環境変数
- 未設定だと鍵はビルド時に自動生成される（永続キャッシュが残る環境では最大14日間再利用）
- 実装を読むと、この鍵は**Action IDを生成するハッシュのソルトとしても使われていた**（公式ドキュメント未記載）
- 実際に鍵だけを変えてビルドし、Action IDが変わることをビルド成果物で確認した
- 複数インスタンスや複数回ビルドが走る構成では、`openssl rand -base64 32`で生成した鍵をビルド時に渡して固定する

## 「Failed to find Server Action」と暗号化キー

セルフホストしたNext.jsを複数インスタンスで運用していると、「Failed to find Server Action」というエラーに遭遇することがある。
公式のself-hostingガイドは、対策として次の一文を置いている。

> Set a consistent encryption key using the `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` environment variable.

しかし、この環境変数が何を暗号化しているのか、なぜ固定しないとServer Actionが「見つからなく」なるのかまでは説明されていない。

この話が特に関係するのは、ひとつのビルド成果物を複数コンテナで起動する構成ではなく、同一コミットから複数回ビルドした成果物がロードバランサ配下などで同時に動きうる構成だ。
たとえば、環境ごとにDockerイメージを作り直す、同じコミットに対して複数のビルドジョブが走る、タスク定義やコンテナごとにビルドが分かれる、といったCI/CDではこの問題を踏みやすい。

この記事では、公式ドキュメント、Next.js本体の実装（RustコンパイラとTypeScriptランタイム）、そして実際のビルド結果の3つを突き合わせて、この環境変数の役割を確かめる。
先に一つだけ言ってしまうと、この鍵はクロージャ変数の暗号化だけに使われているのではなかった。

ソースコードの引用は、2026-07-11時点のvercel/next.js canaryブランチ（コミット`1bd2fd5`、`next`パッケージ`16.3.0-canary.83`）を参照した。
ビルドでの検証も同じバージョン（Node.js v25.9.0）で行っている。
将来のバージョンでは実装が変わる可能性がある。
対象読者はServer Actionsを一度は使ったことがある人を想定し、`'use server'`や`<form action={fn}>`の基本的な使い方は省略する。

## 対処法：ビルド時に鍵を固定する

先に対処法から書く。
鍵は公式ドキュメントの案内どおり、OpenSSLで生成する。

```bash
$ openssl rand -base64 32
F4IonZhUuuDR/Qh3vW4jSzskh2h1KKOWt1I2yyfzgUE=
```

生成した値は、base64デコード後の長さがAESの鍵長として有効な16バイト、24バイト、32バイトのいずれかである必要がある。
Next.jsのデフォルト生成も32バイトで、実際に上の出力をデコードして数えると32バイトある。

```bash
$ echo "F4IonZhUuuDR/Qh3vW4jSzskh2h1KKOWt1I2yyfzgUE=" | base64 -d | wc -c
32
```

これをビルド時の環境変数として渡す。
公式ドキュメントが示しているのは次のCLI例だけだ。

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=your-generated-key next build
```

Dockerでビルドするなら、BuildKit secretとして渡す。
この鍵はビルド成果物に埋め込まれるため、少なくともビルド時には参照できる必要がある。
一方で、`ENV`として最終イメージに残す必要はない。

```dockerfile
# syntax=docker/dockerfile:1.7

RUN --mount=type=secret,id=next_server_actions_encryption_key \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_encryption_key)" \
  npm run build
```

手元でビルドするなら、ローカルの環境変数をsecretとして渡せる。

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=your-generated-key \
  docker build \
  --secret id=next_server_actions_encryption_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  .
```

CI（GitHub Actions）からSecretsとして渡すならこうなる。

```yaml
- run: |
    docker build \
      --secret id=next_server_actions_encryption_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
      .
  env:
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: ${{ secrets.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY }}
```

固定が必要になるのは、「同じソースコード、または同じServer Actions定義から複数回ビルドされた成果物が同時に動く」構成だ。

- **ローリングデプロイ**：ビルド成果物が一時的に共存する
- **Blue/Greenデプロイ**：環境切り替えの前後で別ビルドが動く瞬間がある
- **Canaryリリース**：別ビルドが意図的に共存する
- **複数ビルドジョブ**：同一コミットに対して複数回ビルドが走るCI/CD構成

鍵を固定しないと、ビルドキャッシュが共有されない環境ではビルドごとに異なる鍵が生成され、インスタンス間で暗号化まわりの整合性が取れなくなる。
そしてこの「暗号化まわり」は、実は1つではない。
ここから先は、それが何なのかを実装とビルド成果物で確認する。

## Action IDの生成

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
実際のリクエストでは、このIDは`Next-Action`ヘッダーに入る。
サーバーはそのIDから実行すべき関数を特定する。

このAction IDは、Next.jsのRustコンパイラにある`generate_server_reference_id`関数が生成する。
該当部分を抜粋・簡略化する。

```rust:crates/next-custom-transforms/src/transforms/server_actions.rs
let mut hasher = Sha1::new();
hasher.update(self.config.hash_salt.as_bytes());
hasher.update(self.file_name.as_bytes());
hasher.update(b":");
// export_name（識別子 or 文字列）を追加
hasher.update(export_name_bytes);
```

`hash_salt + file_name + ":" + export_name`をSHA-1でハッシュ化し、先頭に「cache関数かどうか」「引数の使用状況」などを表す1バイトを付加してhex文字列化したものがAction IDだ。

公式の`data-security`ガイドは、Action IDを次のように説明している。

> **Secure action IDs:** Next.js creates encrypted, non-deterministic IDs to allow the client to reference and call the Server Action. These IDs are periodically recalculated between builds for enhanced security.

「non-deterministic（非決定的）」「ビルド間で定期的に再計算される」とあるが、なぜそうなるのかは書かれていない。
この疑問は後の節で回収する。

なお公式ドキュメント上、Action IDと後述するクロージャ変数の暗号化は、独立した機能として並べて説明されている。

## クロージャ変数の暗号化

Action IDは「どの関数を呼ぶか」しか表現できない。
Server Actionが外側のスコープの変数を参照している場合、それだけでは足りない。

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

`userId`のようにレンダリング時にスナップショットとして捕捉された値は、一度クライアントに送られ、Server Action実行時にサーバーへ送り返される。
そのまま送るとクライアントに機密情報が漏れるため、Next.jsはこれを自動で暗号化する。
`data-security`ガイドの記述はこうだ。

> To prevent sensitive data from being exposed to the client, Next.js automatically encrypts the closed-over variables. A new private key is generated for each action every time a Next.js application is built.

実装は[encryption.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption.ts)の`encryptActionBoundArgs`/`decryptActionBoundArgs`にある。
捕捉した引数をReact Flight（React Server Componentsのシリアライズ用ワイヤーフォーマット）で直列化し、[encryption-utils.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils.ts)の`encrypt`/`decrypt`がAES-GCM（`crypto.subtle.encrypt`/`decrypt`）で暗号化する。
IV（初期化ベクトル）は呼び出しごとにランダム生成される16バイトの値だ。

## 鍵の生成と14日間のキャッシュ

暗号化に使う鍵を用意するのは、[encryption-utils-server.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils-server.ts)の`generateEncryptionKeyBase64`だ。
処理の骨子はこうなっている。

```typescript:packages/next/src/server/app-render/encryption-utils-server.ts
export async function generateEncryptionKeyBase64({ isBuild, distDir }) {
  // NEXT_SERVER_ACTIONS_ENCRYPTION_KEY が設定されていればそれを使う
  // 未設定なら crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, ...) で新規生成
  // 生成した鍵は .rscinfo ファイルに書き込み、14日間キャッシュする
}
```

挙動は次のとおりだ。

- 環境変数`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`が設定されていれば、それを最優先で使う（キャッシュ済みの鍵と食い違っても環境変数が勝つ）
- 未設定なら、AES-GCM 256bitの鍵を新規生成し、`.rscinfo`というキャッシュファイルに書き込む（有効期限14日）
- `distDir`配下の永続キャッシュが残る環境では、14日以内の再ビルドで同じ鍵が再利用される。CIのようにキャッシュが残らないクリーンビルドでは、ビルドごとに新しい鍵になる

先ほど引用した「A new private key is generated ... every time a Next.js application is built」という公式の説明は、キャッシュが効かない場合や期限切れの場合の挙動を指している。
`data-security`ガイドの補足にも「created during compilation and are cached for a maximum of 14 days（コンパイル時に生成され、最大14日間キャッシュされる）」とある。

## Action IDのソルトには何が渡されているのか

ここまでの整理では、Action IDの生成とクロージャ変数の暗号化は別の仕組みだった。
公式ドキュメントも2つを独立した機能として書いている。
ところが、コンパイラに設定を渡す部分を見ると話が変わる。

Next.jsのビルドにはTurbopackとwebpackの2系統があり、Action IDを生成するコンパイラへの設定も、それぞれの経路で組み立てられる。
まずTurbopack経路の設定生成はこうなっている。
注目してほしいのは、`hash_salt`に何が代入されているかだ。

```rust:crates/next-core/src/next_shared/transforms/server_actions.rs
Config {
    is_react_server_layer: self.is_react_server_layer,
    is_development: self.mode.is_development(),
    use_cache_enabled: self.use_cache_enabled,
    hash_salt: self.encryption_key.await?.to_string(),
    cache_kinds: self.cache_kinds.owned().await?,
},
```

Action IDのハッシュに使う`hash_salt`に、暗号化キーそのものが渡されている。
webpack経路も同様だ。
`packages/next/src/build/webpack-config.ts`が暗号化キー（`encryptionKey`変数）を`serverReferenceHashSalt`として渡し、`packages/next/src/build/swc/options.ts`がそれを`hashSalt`としてコンパイラに設定している。

つまり、どちらのビルド経路でも、**Action IDのハッシュソルトと、クロージャ変数の暗号化キーは同一の値**だ。

これで前の節に残していた疑問が解ける。
公式がAction IDを「non-deterministic」「ビルド間で再計算される」と説明していたのは、ビルドごとに変わりうる暗号化キーがソルトに入るからだと読める。
Action IDの補足にある「最大14日間キャッシュ」という日数が`.rscinfo`の期限とぴったり一致するのも、両者が同じ値を共有しているためと考えると説明がつく。

この対応関係は、公式ドキュメントには明記されていない。
Action ID生成を深く解説した日本語記事としては、カミナシ社の「[Next.jsのコンパイラから知るServer Actionsの完全解析](https://kaminashi-developer.hatenablog.jp/entry/nextjs-server-actions)」がSHA-1ハッシュや`server-reference-manifest.json`の構造まで踏み込んでいるが、hash_saltが暗号化キーそのものである点には触れていない。

## 鍵を変えてビルドすると本当にAction IDは変わるのか

ソースコード上はそう読める、で終わらせず、実際にビルドして確かめた。
クロージャを持つServer Actionを1つだけ含む最小構成のアプリを用意し、ソースコードには一切手を触れずに、鍵を変えながら`next build`を3回実行する。
Action IDはビルド成果物の`.next/server/server-reference-manifest.json`に記録されるので、そこを比較すればよい。

```bash
# 1回目：鍵Aでビルド
$ NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$KEY_A npx next build

# 2回目：.next を消して、同じ鍵Aでもう一度ビルド（対照実験）
# 3回目：.next を消して、別の鍵Bでビルド
```

3回のビルドでmanifestに記録されたAction IDは次のようになった。

```text
鍵A            : 40e594ca6f76e56927cce395e55d2e17aea6b79712
鍵A（再ビルド）: 40e594ca6f76e56927cce395e55d2e17aea6b79712
鍵B            : 402d95864fe82a1df1a9833dc1fee813ab1c79fc26
```

同じ鍵なら、クリーンビルドを挟んでもAction IDは完全に一致する。
鍵を変えると、ソースコードが同一でもIDが変わった。
どちらのIDも先頭バイトが`40`で一致しているのは、前述の「先頭に付加される1バイト」が関数の属性（cache関数かどうか、引数の使用状況）を表すためで、同じ関数なら鍵が変わってもこの部分は変わらない。
ハッシュ部分だけがソルトに応じて変わるという実装の説明と、きれいに辻褄が合う。

もう一つ、このmanifestには`encryptionKey`というフィールドに鍵そのものが埋め込まれていた。
ランタイムは実行時の環境変数`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`を先に見て、未設定ならmanifestに埋め込まれたこの値を使ってクロージャ変数を復号する。
鍵が「ビルド時に決まり、成果物に焼き込まれる」ことが、ここからも確認できる。

## 鍵を固定しないと何が起きるのか

self-hostingガイドは、複数インスタンスでの挙動をこう説明している。

> When running multiple server instances, all instances must use the same encryption key. Otherwise, a Server Function encrypted by one instance cannot be decrypted by another, causing "Failed to find Server Action" errors.

文面どおりに読めばクロージャの復号失敗の話だが、ここまでの内容を踏まえると、エラーに至る経路は2つある。

1. 暗号化キーが異なるため、クロージャ変数を復号できない
2. 暗号化キー（＝hash_salt）が異なるため、そもそもインスタンス間でAction ID自体が一致しない

この一文で直接説明しているのは1だけだ。
しかし2の前提となる「鍵が違えばAction IDが変わる」ことは、前節の実ビルドで確認できた。
インスタンスAのページが配ったAction IDを別ビルドのインスタンスBが受け取っても、BのmanifestにそのIDは存在しないため、対応するServer Actionを解決できない。
実際のエラーとしては、ビルドAのページをブラウザで開いたまま、Server ActionのPOST先がビルドBに向く状況を作ると再現できる可能性が高い。
本記事ではそこまでの再現検証は行っていないが、経路2が成立することはビルド成果物のレベルで裏付けられた。

冒頭の対処法に戻ると、ビルド時に鍵を固定する設定は、この2つの経路を同時に塞いでいることになる。

## まとめ

| 項目 | 内容 |
|---|---|
| Action ID | `hash_salt + file_name + ":" + export_name`のSHA-1ハッシュに、関数の属性を表す1バイトを前置したもの |
| クロージャ変数 | AES-GCMで暗号化。鍵は`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`または自動生成 |
| 両者の関係 | hash_saltと暗号化キーは同一の値（公式ドキュメント未記載） |
| 実ビルドでの確認 | 鍵だけを変えてビルドするとAction IDが変わる。同じ鍵ならクリーンビルドでも一致 |
| 固定が必要な場面 | 同じAction定義を含む別ビルドが共存する構成、複数ビルドジョブなど |

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`は、クロージャ変数を復号するためだけの設定ではなく、Action IDの一致にも関わる設定だった。
セルフホストで複数インスタンスを動かしている、あるいはCIで同一コミットを複数回ビルドしているなら、`next build`に鍵を渡しているかを一度確認してほしい。

## 参考資料

- [How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security#overwriting-encryption-keys-advanced)
- [How to self-host your Next.js application](https://nextjs.org/docs/app/guides/self-hosting#server-functions-encryption-key)
- [crates/next-custom-transforms/src/transforms/server_actions.rs](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/crates/next-custom-transforms/src/transforms/server_actions.rs)
- [crates/next-core/src/next_shared/transforms/server_actions.rs](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/crates/next-core/src/next_shared/transforms/server_actions.rs)
- [packages/next/src/server/app-render/encryption.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption.ts)
- [packages/next/src/server/app-render/encryption-utils.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils.ts)
- [packages/next/src/server/app-render/encryption-utils-server.ts](https://github.com/vercel/next.js/blob/1bd2fd585aac793ca2589e6f18f17a412fd11005/packages/next/src/server/app-render/encryption-utils-server.ts)
- [カミナシ Developers Blog「Next.jsのコンパイラから知るServer Actionsの完全解析」](https://kaminashi-developer.hatenablog.jp/entry/nextjs-server-actions)

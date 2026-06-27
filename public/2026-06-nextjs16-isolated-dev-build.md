---
title: 【Next.js 16】なぜnext devとnext buildでnext-env.d.tsの内容が変わるのか、ソースコードから調査してみた
tags:
  - TypeScript
  - フロントエンド
  - Next.js
  - nextjs16
private: false
updated_at: '2026-06-27T22:33:40+09:00'
id: 18367216c7cecd8e4624
organization_url_name: null
slide: false
ignorePublish: false
---

**TL;DR**

- Next.js 16から `next dev` と `next build` で `distDir` が分かれ、`next-env.d.ts` の import パスが実行コマンドに応じて切り替わるようになった
- パスが変わる根本原因は `config.ts` が `next dev` 実行時に `distDir` を `.next/dev` へ書き換えることにある
- Git で追跡していると毎回差分が生じる。公式の推奨は **`next-env.d.ts` を `.gitignore` に追加し、`next typegen` で事前生成する**こと
- `next typegen` はビルドを実行せずルートをスキャンするだけなので数秒で終わる

## 事象：next-env.d.tsが頻繁に書き換わる

Next.js 16にアップデートして以降、`next-env.d.ts` が繰り返し変更されることに気づいた。

`git diff` で確認すると、こんな差分が出続けていた。

```diff
- import "./.next/types/routes.d.ts";
+ import "./.next/dev/types/routes.d.ts";
```

内容を確認すると、以下の2つの状態を行き来していた。

```typescript
// next dev を実行した後
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";
```

```typescript
// next build を実行した後
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";
```

違いは `import` パスの `dev/` が入るかどうかだけ。`next dev` と `next build` のどちらを最後に実行したかで切り替わっていた。

Next.js 15のときはこんな動きをしていなかったので、16にあげてから変わったことは明らかだった。

## ソースコードをたどる

どこでこのパスが書かれているかを起点に、`next dev` と `next build` でなぜ結果が変わるのかをコードで追った。

### next-env.d.ts はどこで生成されているのか

まず `next-env.d.ts` を生成している箇所を探した。見つかったのが `writeAppTypeDeclarations` だ。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/lib/typescript/writeAppTypeDeclarations.ts#L5-L70

コード抜粋（L64〜70）：

```typescript
const routeTypesPath = path.posix.join(
  distDir.replaceAll(path.win32.sep, path.posix.sep),
  'types/routes.d.ts'
)
lines.push(`import "./${routeTypesPath}";`)
```

引数で受け取った `distDir` をそのまま import パスに使っている。`distDir` が `.next` なら `import "./.next/types/routes.d.ts"`、`.next/dev` なら `import "./.next/dev/types/routes.d.ts"` になる。import パスの差はここから来ていた。

では、この `distDir` はどこから渡されているのか。

### distDir はどこから渡されているのか

呼び出し元を2ファイル遡る。

**verify-typescript-setup.ts**

`writeAppTypeDeclarations` を呼び出しているのは `verify-typescript-setup.ts` の `verifyAndRunTypeScript` 関数だ。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/lib/verify-typescript-setup.ts#L56-L218

コード抜粋（L207〜218）：

```typescript
await writeAppTypeDeclarations({
  baseDir: dir,
  distDir,   // ← 受け取った distDir をそのまま渡す
  // ...
})
```

**setup-dev-bundler.ts**

`verifyAndRunTypeScript` の呼び出し元は `setup-dev-bundler.ts` だ。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/server/lib/router-utils/setup-dev-bundler.ts#L154-L168

コード抜粋（L154〜168）：

```typescript
await verifyAndRunTypeScript({
  dir: opts.dir,
  distDir: opts.nextConfig.distDir,   // ← opts.nextConfig の distDir をそのまま渡す
  // ...
})
```

`opts.nextConfig.distDir` をそのまま渡している。では、この `opts.nextConfig` はどこで組み立てられるのか。

### opts.nextConfig の出所と next dev / next build の分岐

`setup-dev-bundler` の呼び出し元は `router-server.ts` だ。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/server/lib/router-server.ts#L103-L197

コード抜粋（L103〜197）：

```typescript
const config = await loadConfig(
  opts.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
  opts.dir,
)
// ...
let developmentConfig = config as NextConfigComplete
// ...
await setupDevBundler({
  // ...
  nextConfig: developmentConfig,
  // ...
})
```

`loadConfig` の結果（`developmentConfig`）をそのまま `nextConfig` として `setupDevBundler` に渡している。ここで `opts.dev` の値によって `loadConfig` に渡る phase が変わる。

**next dev の場合**

`opts.dev` がどこでセットされるかを辿ると、`next dev` のエントリポイント `next-dev.ts` に行き着く。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/cli/next-dev.ts#L266-L273

コード抜粋（L266〜273）：

```typescript
const devServerOptions: StartServerOptions = {
  dir,
  port,
  isDev: true,   // ← next dev なので true 固定
  // ...
}
```

この `isDev: true` を受け取った `start-server.ts` が `initialize`（`router-server.ts` のエントリ関数）を呼ぶ際に `dev: isDev` として渡す。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/server/lib/start-server.ts#L160-L173

コード抜粋（L160〜173）：

```typescript
return initialize({
  // ...
  dev: isDev,   // ← isDev: true がここで opts.dev になる
  // ...
})
```

`router-server.ts` はこの値を `opts.dev` として受け取るため `opts.dev === true` となり、`loadConfig` に `PHASE_DEVELOPMENT_SERVER` が渡る。

**next build の場合**

`next build` はそもそも `router-server.ts` を経由しない。`build/index.ts` が直接 `loadConfig(PHASE_PRODUCTION_BUILD, ...)` を呼ぶ別ルートだ。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/build/index.ts#L975-L990

コード抜粋（L975〜990）：

```typescript
const config = await loadConfig(PHASE_PRODUCTION_BUILD, dir, { /* ... */ })
```

TypeScript チェックも `setup-dev-bundler.ts` ではなく `build/type-check.ts` が担う。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/build/type-check.ts#L87-L104

コード抜粋（L87〜104）：

```typescript
verifyAndRunTypeScript(
  dir,
  config.distDir,   // ← config.distDir をそのまま渡す
  // ...
)
```

### loadConfig が distDir を書き換えるのは next dev 実行時のみ

`config.ts`（`loadConfig` の実体）に次のコードがある。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/server/config.ts#L1446-L1451

コード抜粋（L1446〜1451）：

```typescript
;(result as NextConfigComplete).distDirRoot = result.distDir
if (phase === PHASE_DEVELOPMENT_SERVER) {
  result.distDir = join(result.distDir, 'dev')
}
```

`PHASE_DEVELOPMENT_SERVER` のときだけ `distDir` を `.next/dev` に書き換えて返す。

- `next dev` は `PHASE_DEVELOPMENT_SERVER` を渡すため `distDir = ".next/dev"` になる
- `next build` は `PHASE_PRODUCTION_BUILD` を渡すため if ブロックに入らず `distDir = ".next"` のまま返る

この差が `writeAppTypeDeclarations` に届く `distDir` の差になり、`next-env.d.ts` の import パスが変わる。

### チェーンをまとめると

2つのコマンドは出発点から別ルートをたどり、`distDir` の値が異なったまま `writeAppTypeDeclarations` に届く。

```
next dev 実行
 └─ next-dev.ts: isDev: true
     └─ router-server.ts: loadConfig(PHASE_DEVELOPMENT_SERVER)
         └─ config.ts: distDir = ".next/dev"（next dev 実行時に書き換え）
             └─ setup-dev-bundler.ts: verifyAndRunTypeScript(distDir: ".next/dev")
                 └─ verify-typescript-setup.ts: writeAppTypeDeclarations(distDir: ".next/dev")
                     └─ next-env.d.ts: import "./.next/dev/types/routes.d.ts"

next build 実行
 └─ build/index.ts: loadConfig(PHASE_PRODUCTION_BUILD)
     └─ config.ts: distDir = ".next"（書き換えなし）
         └─ build/type-check.ts: verifyAndRunTypeScript(distDir: ".next")
             └─ verify-typescript-setup.ts: writeAppTypeDeclarations(distDir: ".next")
                 └─ next-env.d.ts: import "./.next/types/routes.d.ts"
```

| コマンド | distDir | 型ファイルの出力先 |
|---|---|---|
| `next dev` | `.next/dev` | `.next/dev/types/routes.d.ts` |
| `next build` | `.next` | `.next/types/routes.d.ts` |

この分離は意図的な設計だ。開発サーバーとプロダクションビルドが同じ出力先を共有しないため、AIエージェントが開発サーバーを起動したまま `next build` を実行しても出力が競合しない。

### v16.0.0 からの変更

この変更は v16.0.0（2025-10-22 リリース）で導入された。PR #83961 "feat: Isolate dev build from prod" がその変更だ。

https://github.com/vercel/next.js/pull/83961

筆者がアップデート前に使用していた v15.3.4 のソースコードには `join(result.distDir, 'dev')` の記述がなく、v16.0.0 で追加されたことをソースコード比較でも確認できる。

## next typegen の内部挙動

対応方法として `next-env.d.ts` を `.gitignore` に追加する場合、CIで事前生成が必要になる。`next typegen` が何をしているかをソースコードで確認した。

読む前に疑問が2つあった。`next typegen` は何かビルドを走らせているのか、それとも静的解析だけなのか。出力先は `next dev` 実行時の `distDir`（`.next/dev`）を使うのか、固定パスなのか。

https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/cli/next-typegen.ts

コード抜粋：

```typescript
const nextTypegen = async (
  _options: NextTypegenOptions,
  directory?: string
) => {
  const baseDir = getProjectDir(directory)
  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)  // 本番フェーズで読み込む
  await installBindings(nextConfig.experimental?.useWasmBinary)
  const distDir = join(baseDir, nextConfig.distDir)
  const { pagesDir, appDir } = findPagesDir(baseDir)

  await verifyAndRunTypeScript({
    dir: baseDir,
    distDir: nextConfig.distDir,
    shouldRunTypeCheck: false,  // 型チェックは実行しない（環境セットアップのみ）
    // ...
  })

  const routeTypesFilePath = join(distDir, 'types', 'routes.d.ts')
  await mkdir(join(distDir, 'types'), { recursive: true })

  const { pageRoutes, appRoutes, /* ... */ } = await discoverRoutes({
    // ...
    isDev: false,
  })

  await writeRouteTypesManifest(routeTypesManifest, routeTypesFilePath, nextConfig)
  await writeValidatorFile(routeTypesManifest, validatorFilePath, strictRouteTypes)
  writeCacheLifeTypes(nextConfig.cacheLife, cacheLifeFilePath)
}
```

ソースを読んで、**ビルドは走っていない**ことがわかった。

`shouldRunTypeCheck: false` を渡しているので型チェックは実行しない。
`discoverRoutes({ isDev: false, ... })` でルートをスキャンするだけで、webpackやSWCによるコンパイルは走らない。
そのため実行は数秒で終わる。実際に実行すると次のメッセージが出る。

```
$ npx next typegen
Generating route types...
✓ Types generated successfully
```

**出力先は `next dev` 実行時の distDir を使わない。**

`loadConfig(PHASE_PRODUCTION_BUILD, ...)` で設定を読み込んでいる。`config.ts` の `distDir` 書き換えは `PHASE_DEVELOPMENT_SERVER` のときだけなので、`next typegen` では書き換えが起きない。出力先は常に `.next/types/routes.d.ts` に固定される。

`next typegen` 実行後の `next-env.d.ts` は `.next/types/routes.d.ts` を参照する状態になる。これは本番ビルドと同じパスだ。CIで型チェックする場合、`next typegen` → `tsc --noEmit` の順で実行すれば一貫した状態で型チェックできる。

## 対応方法

### next-env.d.ts を .gitignore に追加する（公式推奨）

公式ドキュメントが推奨する方法。`next-env.d.ts` は自動生成ファイルであり、Gitで管理するものではない。

```gitignore
# .gitignore
next-env.d.ts
```

ただし `.gitignore` に追加すると、ローカルや CI で型チェックを実行する前にファイルが存在しない状態になる。型チェックの前に `next typegen` を実行する。

**CIでの対応例（GitHub Actions）**:

```yaml
- name: Generate types
  run: npx next typegen

- name: Type check
  run: npx tsc --noEmit
```

あるいは `package.json` のスクリプトとしてまとめておく方法もある。

```json
{
  "scripts": {
    "type-check": "next typegen && tsc --noEmit"
  }
}
```

### Git追跡したまま放置する

差分は増えるが動作には影響しない。チームで `git add` 時に差分が混入しやすくなるため、積極的に選ぶ理由はない。

## まとめ

Next.js 16から `next dev` と `next build` で `distDir` が分かれ、`next-env.d.ts` の import パスが実行コマンドに応じて切り替わるようになった。Gitで追跡していると、コマンドを実行するたびに差分が生じる。

ソースコードを追うと、`config.ts` が `next dev` 実行時に `distDir` を `.next/dev` に書き換え、それが `writeAppTypeDeclarations` に伝わって import パスが変わるという仕組みだとわかった。

対応は **`next-env.d.ts` を `.gitignore` に追加して、型チェック前に `next typegen` で再生成する** のが公式推奨。`next typegen` は `PHASE_PRODUCTION_BUILD` で設定を読むため `distDir` の書き換えが起きず、出力先は `.next/types/routes.d.ts` に固定される。CIに組み込んでも数秒程度で完了する。

AIエージェントによる開発を前提にした構成変更がNext.js本体に入るようになった。アップデート時には型ファイルまわりの変化も確認しておきたい。

## 参考

- [feat: Isolate dev build from prod（GitHub PR #83961）](https://github.com/vercel/next.js/pull/83961)
- [next typegen オプション（Next.js 公式ドキュメント）](https://nextjs.org/docs/app/api-reference/cli/next#next-typegen-options)

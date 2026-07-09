---
title: URLは変わるのに画面が更新されない ── Next.js 16.2のルーターキャッシュバグを調査した
tags:
  - Next.js
  - React
  - TypeScript
  - フロントエンド
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
---
**TL;DR**

- Next.js を 15 から 16.2 に上げたら、チェックボックスの複数選択フィルタでルート遷移がおかしくなった
- `?tag=a&tag=b` のように**同じキーを複数回並べる**クエリで、末尾でない値を外すと、URLは変わるのに一覧が更新されない
- 原因はクライアントのルーターキャッシュのキー計算。`Object.fromEntries(new URLSearchParams(...))` は同じキーが複数あると末尾の値しか残さない（`?tag=react&tag=nextjs` → `{ tag: "nextjs" }`）ため、別々のURLが同じキャッシュキーになって衝突する（[vercel/next.js#92152](https://github.com/vercel/next.js/issues/92152)）
- 修正PR（[#93368](https://github.com/vercel/next.js/pull/93368)）は執筆時点（2026年7月）で未マージ。**16.1系へのダウングレードで解消**した
- 最小再現リポジトリ: https://github.com/yamazaki-yuki-23/nextjs-16-router-cache-repro

## 何が起きたか

Next.js を 15 系から 16 系（16.2）へアップデートしたところ、複数選択のフィルタUIで挙動がおかしくなった。

チェックボックスで絞り込み条件を複数選び、URLに `?tag=react&tag=nextjs` のように同じキーが並んでいる状態から、**先に選んだ方（末尾でない値）のチェックを外す**と、こうなる。

- アドレスバーのURLは `?tag=nextjs` に変わる
- なのに一覧の表示は古いまま。外したはずの `react` のチェックも外れない
- ローディング表示も出ない

実際の画面がこちら（後述の最小再現アプリでの録画。上部の黒いバーはページ内に `location` の値を表示した可視化用のオーバーレイ）。react のチェックを外してもURLしか変わらない。

![Next.js 16.2.10：チェックを外すとURLだけが変わり、一覧もチェックボックスも古いまま](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-07-nextjs16-router-cache-bug/repro-16-2-bug.gif)

15 系のときは問題なく動いていた。コードは何も変えておらず、変えたのは Next.js のバージョンだけだ。

## まず切り分ける

「URLは変わるのに画面が変わらない」という症状から、サーバー側の絞り込みロジックではなく、クライアント側のルーティングまわりを疑った。試しにバグが起きた状態でページをリロードしてみると、一覧は正しく更新された。

つまりサーバーは `?tag=nextjs` を受け取れば正しく描画できる。クライアントのルート遷移だけがおかしい。この時点で「クライアントのルーターキャッシュあたりが怪しい」と当たりをつけた。

## Issueを見つける

`next.js router cache search params` のようなキーワードで探すと、同じ症状のIssueが見つかった。

> [Next 16.2 router cache issue, if search param name is used multiple times #92152](https://github.com/vercel/next.js/issues/92152)

タイトルの *"if search param name is used multiple times"* は「同じ検索パラメータ名を複数回使ったとき」。まさに自分が踏んだ状況だ。Issueには色のチェックボックスで再現するリポジトリが添付されていて、報告者も「16.2 に上げてから起きるようになった」と書いている。

コメントを追うと、`router.refresh()` で無理やり回避しようとした人が「今度はアナリティクスのイベントが二重に飛ぶようになった」と報告していたり、複数のバージョン（16.2.1 / 16.2.4 / 16.2.5 / 16.2.6）で再現が確認されていたりする。その中に、こんなコメントがあった。

> My only fix is to roll back to 16.1, which I confirmed fixes this bug.

16.1 に戻せば直るらしい。いざとなればダウングレードで逃げられそうだ。

## 自分でも最小構成で再現する

Issueの再現リポジトリは「色の選択」だったが、自分でも手を動かして確かめたかったので、タグで記事を絞り込む一覧ページを最小構成で組んで再現させた。

ページ側（Server Component）は `searchParams` から選択タグを配列で受け取る。App Router では同じキーが複数あると配列で渡ってくる。

```tsx
// app/articles/page.tsx
function toTagArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>
}) {
  const { tag } = await searchParams
  const selectedTags = toTagArray(tag)

  return (
    <main>
      <h1>記事一覧</h1>
      <TagFilter selectedTags={selectedTags} />
      <Suspense fallback={<p>読み込み中...</p>}>
        <ArticleList selectedTags={selectedTags} />
      </Suspense>
    </main>
  )
}
```

チェックボックス側（Client Component）は、選択状態から `?tag=react&tag=nextjs` を組み立てて `router.push` するだけ。

```tsx
// app/articles/TagFilter.tsx
'use client'
import { useRouter } from 'next/navigation'

export function TagFilter({ selectedTags }: { selectedTags: string[] }) {
  const router = useRouter()

  function toggle(tag: string) {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag]

    const params = new URLSearchParams()
    for (const t of next) params.append('tag', t) // 同じキーを複数回 append

    const query = params.toString()
    router.push(query ? `/articles?${query}` : '/articles')
  }
  // ...チェックボックスのレンダリングは省略
}
```

一覧側はデータ取得を模して1.2秒待たせている。この遅延のおかげで、正常なら遷移のたびに `Suspense` の `読み込み中...` が表示される。

```tsx
// app/articles/ArticleList.tsx
export async function ArticleList({ selectedTags }: { selectedTags: string[] }) {
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const articles = filterArticles(selectedTags)
  // ...一覧のレンダリング
}
```

検証した結果が次のとおり。`next dev` でも本番ビルド（`next build && next start`）でも結果は同じだった。

| 操作 | Next.js 16.1.7 | Next.js 16.2.10 |
| --- | --- | --- |
| 末尾でない値（react）を外す | 正しく更新される | **URLは変わるが一覧は古いまま（バグ）** |
| 末尾の値（nextjs）を外す | 正しく更新される | 正しく更新される |
| バグ状態でリロード | （該当なし） | サーバーは正しく描画する |

比較用に、16.1.7 で同じ操作をした様子がこちら。チェックが外れ、一覧もURLどおりの3件に更新される。

![Next.js 16.1.7：同じ操作でチェックが外れ、一覧もURLどおりに更新される](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-07-nextjs16-router-cache-bug/repro-16-1-ok.gif)

気になるのは、末尾の値を外す場合はバグらないことと、リロードすれば直ること。この2つは、原因を知ると腑に落ちた。

## 原因はキャッシュキーの衝突

Issueには、根本原因を突き止めて修正PRを出した人のコメントが付いていた。要点はこうだ。

クライアント側でページキャッシュのキーを組み立てるとき、検索文字列を次のように変換している箇所がある。

```ts
Object.fromEntries(new URLSearchParams(renderedSearch))
```

`URLSearchParams` は同じキーの値を全部持っている。しかしオブジェクトは同じキーを2つ持てないため、`Object.fromEntries` で変換すると前の値が後の値で順に上書きされ、**末尾の値だけが残る**。

```ts
Object.fromEntries(new URLSearchParams('tag=react&tag=nextjs'))
// → { tag: 'nextjs' }  ← react が消える
```

一方、サーバー側は `Record<string, string | string[]>` の形で配列ごと保持していて、値は潰れない。潰れるのはクライアントのキー計算だけだ。

ここで実際に踏んだケースを当てはめてみる。

- 遷移前 `?tag=react&tag=nextjs` → クライアントのキー `{ tag: "nextjs" }`
- 遷移後 `?tag=nextjs` → クライアントのキー `{ tag: "nextjs" }`

**別々のURLなのに、クライアント上では同じキャッシュキーになる。** その結果、遷移先（`?tag=nextjs`）のレンダリングを取りに行くべきところで、遷移前（`?tag=react&tag=nextjs`）のキャッシュエントリを「もう持っている」と誤認し、古い描画をそのまま再利用してしまう。`Suspense` も再サスペンドしないのでローディングすら出ない。

これで再現時の2つの特徴が説明できる。

- **末尾の値（nextjs）を外してもバグらない**理由：遷移後は `?tag=react`、キーは `{ tag: "react" }`。遷移前の `{ tag: "nextjs" }` と別物なので衝突しない
- **リロードで直る**理由：フルリロードはサーバーで描画し直すため、壊れているクライアントキャッシュを経由しない

Issueのコメントによると、同じキーを潰してしまうこの書き方はクライアント側に3箇所あり、そのうち1つは 16.2.0 で新しく入ったコードだったという。単一の変更ミスというより、同じ落とし穴を踏んだコードが増えたタイミングで表面化したかたちだ。

## どう対応したか

修正PR（[vercel/next.js#93368](https://github.com/vercel/next.js/pull/93368)）は、検索文字列を配列も保持する `Record` に変換するヘルパーを追加し、該当する3箇所すべてを差し替える内容だった。回帰テストも付いている。

ただしこのPRは、執筆時点（2026年7月）でまだマージされていない。マージされたらこの記事にも追記する。修正版のリリースを待つあいだ、手元で取れる現実的な策は限られる。

- **`router.refresh()` で無理やり再取得する**：Issueで報告されているとおり、イベントの二重発火などの副作用が出ることがある
- **クエリをカンマ区切りなど別の形式に変える**：フィルタUI全体の作りに手が入る
- **16.1 系にダウングレードする**

今回は変更の少なさと確実性を優先して、`next` を 16.1.7 にダウングレードした。Issueで複数人が「16.1で直る」と報告しており、自分の環境でも解消した。上流の修正が入ったら戻せばいい、という判断だ。

## まとめ

- Next.js 16.2 には、同じキーを複数回並べる検索パラメータを使ったフィルタで、クライアントのルーターキャッシュキーが衝突するバグがある
- 原因は `Object.fromEntries(new URLSearchParams(...))` が末尾の値しか残さず、別々のURLが同じキャッシュキーに潰れること
- 末尾の値を外すぶんには問題なく、末尾でない値（1つめでも途中でも）を外したときにバグを踏む
- 修正PRは執筆時点で未マージ。当面は 16.1 系へのダウングレードが確実

複数選択のフィルタ条件をURLに載せる（`?tag=a&tag=b`）のは、共有やブックマークができて再現性も高いので、一覧画面やダッシュボードではよく使う作りだ。それだけに、このバグは実アプリで踏みやすい。「URLは変わるのに画面が変わらない」というのは、フレームワーク側のキャッシュに疑いが向きにくい症状でもある。同じところで詰まった人の助けになれば。

最小再現リポジトリはこちら。`main`（16.1で正常）と `repro/16.2-bug`（16.2で再現）のブランチで挙動を比べられる。

https://github.com/yamazaki-yuki-23/nextjs-16-router-cache-repro

### 参考

- [Next 16.2 router cache issue, if search param name is used multiple times #92152](https://github.com/vercel/next.js/issues/92152)
- [Fix client router cache collision for repeated search param keys #93368](https://github.com/vercel/next.js/pull/93368)

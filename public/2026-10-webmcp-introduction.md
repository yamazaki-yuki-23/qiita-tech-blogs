---
title: WebMCPは何が新しいのか
tags:
  - WebMCP
  - MCP
  - JavaScript
  - AIエージェント
  - 初心者向け
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

この記事では商品検索を例に、AIにWebサイトで商品を探してもらう方法を3つ比べます。AIが画面を見て入力欄やボタンを操作する方法、AIがサーバーの検索APIを呼ぶ方法、そしてWebMCPです。あわせて、名前の似たMCPとの違いも整理します。そのうえで、自分のサイトなら何をAIに公開するのかを考えていきます。

:::note info
2026年10月27日時点の情報です。WebMCPの仕様は[Web Machine Learning Community Group](https://www.w3.org/community/webmachinelearning/)で検討されている段階です。Webの標準を作るW3Cが、このグループに議論の場を提供しています。[10月27日付の草案](https://webmachinelearning.github.io/webmcp/#sotd)はまだ正式なW3C標準ではなく、APIや利用条件は今後変わる可能性があります。
:::

## 1. WebMCPとは

WebMCPはいま開いているWebページの機能をAIから直接呼び出せるようにする、ブラウザのAPIです。たとえば商品検索のページなら、開発者はWebMCPのAPIを使って、検索を実行するJavaScript関数をブラウザに登録します。AIは画面の入力欄やボタンを探して操作する代わりに、登録された検索関数を直接呼び出せます。

人はこれまでどおり検索フォームを使えます。検索関数が結果を画面に表示し、同じ商品一覧をAIにも返せば、人とAIが同じ結果を確認できます。

## 2. WebMCPが提案された理由

「5,000円以下の商品を探して」とAIに頼む場面を考えてみます。ここでいうAIはブラウザに組み込まれたAIアシスタントや、ブラウザの拡張機能として動くAIエージェントのように、利用者が開いているページを扱えるAIです。3章の図にある「AIエージェント」も同じものを指します。なお、この記事の検証ではAIをつながず、AIの代わりに開発者ツールやスクリプトから、ページに登録した検索関数を呼びます。

### 3つの方法の比較

これまで、AIがWebサイトで商品を検索する方法は主に2つありました。AIが画面の入力欄に予算を入れて検索ボタンを押す方法と、サイトがサーバーに用意した検索APIをAIが呼ぶ方法です。どちらにも弱点があり、それを補う方法としてWebMCPが提案されました。WebMCPでは、利用者が開いているページに登録された検索関数を、AIがブラウザを通して呼びます。

3つの方法で、AIの呼び出しがどこを通るかを図にすると次のようになります。

![3つの方法の比較図。画面を操作する方法ではAIが入力欄とボタンを探して操作し、結果はページに表示される。サーバーのAPIを呼ぶ方法ではAIアプリがサーバーの検索APIを呼び、ページは通らない。WebMCPではAIがブラウザを通してページの検索関数を呼び、結果は画面とAIの両方に出る](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/search-methods.png)

| 方法 | AIがすること | 結果がページに表示されるか | 主な課題 |
|---|---|---|---|
| 画面を操作する | 入力欄に予算を入れ、検索ボタンを押す | 表示される | 画面の構成が変わると失敗しやすい。手順が多く時間がかかる |
| サーバーのAPIを呼ぶ | サーバーの検索APIを呼ぶ | 表示されるとは限らない | サーバーに検索APIが必要。ログイン状態も別に扱う必要がある |
| WebMCP | ページに登録された検索関数を呼ぶ | 検索関数で画面に表示できる | 仕様が検討中で、使えるブラウザやAIが限られる |

### 画面を操作する方法

AIは予算の入力欄と検索ボタンがどこにあるかを、画面の見た目やHTMLの構造から探して判断します。そのため画面の構成が変わると操作に失敗しやすく、単純な検索でも手順が増えて時間がかかることがあります。

### サーバーのAPIを呼ぶ方法

この方法では、AIアプリがサイトのサーバーに直接リクエストを送り、商品一覧を受け取ります。利用者がブラウザで開いているページは通りません。AIがMCPサーバーを通して検索APIを呼ぶ場合も、この方法に含まれます。MCPサーバーについては4章で説明します。

ページを通らないため、この方法には次の3つの弱点があります。

- AIが受け取った商品一覧が、利用者の見ているページに表示されるとは限りません。
- 商品の絞り込みをページのJavaScriptだけで行っているサイトには、AIが呼べる検索APIがサーバーにありません。同じ絞り込みの処理を、サーバー側にも作る必要があります。
- 利用者がブラウザでログインしている状態を、AIはそのまま使えません。AIがAPIを呼ぶための認証を、サーバー側で別に用意する必要があります。

### WebMCPを使う方法

WebMCPではページにすでにある検索用のJavaScript関数をAIから呼べるようにします。AIは入力欄やボタンを画面から探さずに済みます。検索関数が結果を画面にも表示すれば、人とAIが同じ結果を確認できます。

ページのJavaScriptで商品を絞り込んでいるサイトなら、その関数をそのまま使えます。サーバーで検索しているサイトでも、ページからサーバーの検索APIを呼んで結果を表示する処理があれば、その処理をAIから呼べるようにできます。

## 3. 開発者がページにツールを登録する

WebMCPではAIから呼べるようにした機能を「ツール」と呼びます。商品検索のツールなら、開発者はページのJavaScriptで次の4つを登録します。

- ツールの名前: ツールを見分けるための名前です。この例では `search_products` にします。
- ツールの説明: このツールの用途を、AIに伝えるための文章です。この例では「予算の上限以下の商品を検索し、画面に表示します。購入はしません。」と書きます。
- 受け取る値の条件: 「予算は0以上の整数」のように、ツールに渡してほしい値の型や範囲を書きます。
- 実行する関数: ツールが呼ばれたときに動く検索関数です。

<!-- 下書きの画像は assets/2026-10-webmcp-introduction/ に保存。公開前にGitHubへの反映と公開URLでの表示を確認する。 -->

![ページが商品検索ツールを公開し、AIが予算5,000円で呼び出すと、ページに商品が表示され、AIにも同じ商品一覧が返る](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/search-flow.png)

図の番号に沿って流れを追います。

1. ページが商品検索のツール `search_products` を、ツールの説明と予算の条件と一緒にブラウザへ登録します。AIはブラウザに問い合わせて、登録されたツールの一覧を受け取ります。
2. AIが依頼に合うツールとして `search_products` を選び、予算5,000円を指定して呼び出します。ブラウザがその呼び出しをページに渡し、ページ内の検索関数が5,000円以下の商品を探して画面を更新します。
3. 検索関数が画面に表示したのと同じ商品一覧をAIにも返します。

検索と画面の更新は、開発者が通常のJavaScriptで実装します。今回は、人が検索ボタンを押したときも同じ検索関数を使います。

### WebMCPの新しい点

関数やAPIを呼ぶという考え方自体は、新しいものではありません。WebMCPの新しさはいま開いているWebページの関数を、ブラウザを通してAI向けのツールとして登録できる点にあります。つまり、画面ですでに提供している機能を、AIにも使ってもらえます。

この例では、検索フォームが使っている検索関数を、AIからも呼べるようにしました。検索フォームは、これまでどおり利用者が使えます。AIのために別の仕組みを用意する手間が減るので、Webサイトの作り方も変わる可能性があると考えています。

ただし、今回の例で確かめるのはツールの呼び出しと画面の更新までです。AIが「5,000円以下の商品を探して」のような依頼文から正しいツールを選べるかや、操作が正確になるか、速くなるかは検証していません。

## 4. MCPとの違い

WebMCPとMCPの違いは、AIが呼ぶ機能がどこにあるかです。MCP（Model Context Protocol）はAIアプリと外部の機能をつなぐための通信の決まりです。

MCPでは、Claude DesktopのようなAIアプリが、ファイルの操作や外部サービスのAPI呼び出しなどの機能を持つプログラムとやり取りします。このプログラムを「MCPサーバー」と呼びます。MCPサーバーは手元のPCで動かすことも、外部のサービスとして動かすこともできます。

| 比較する点 | WebMCP | MCP |
|---|---|---|
| 機能の提供元 | 開いているWebページ | MCPサーバー |
| 呼び出す対象 | ページに登録されたツール | MCPサーバーが提供するツールなど |
| 画面との関係 | 結果をページの画面に表示できる | ページとは別のプログラムが処理する。開いているページの関数を呼ぶ仕組みは、MCPの仕様にはない |
| 利用例 | 表示中のサイトで商品を検索する | ファイルを取得する、外部サービスのAPIを呼ぶ |

名前は似ていますが、WebMCPはブラウザのAPIで、MCPの通信の決まりそのものではありません。公式の提案はWebMCPを使うページを「ページ内で動くMCPサーバーのようなもの」と例えています。サーバー側のAPIの代わりに、ページのJavaScriptでツールを公開するという意味です。ただし、ページがMCPの通信を行うわけではありません。

提案はWebMCPをMCPの置き換えではなく、MCPを補うものと位置づけています。サーバーで動く機能はMCPサーバーから、開いているページの機能はWebMCPから、とAIに提供する方法を使い分けることはできます。

今回の例でWebMCPを選んだのは、AIに返す検索結果を、利用者が見ているページにも表示したかったからです。画面を使わずに外部サービスのデータを扱うなら、MCPサーバーから提供する方法も検討できます。

## 5. 商品検索のサンプルでWebMCPを試す

人が検索ボタンを押したときと、AIがツールを呼んだときの両方で、同じ検索関数が動くサンプルです。結果を確かめやすいように、商品は `index.html` 内のJavaScriptに書いた3件（マウス2,000円、キーボード4,500円、モニター18,000円）に絞りました。

![実際のブラウザで、予算を5,000円、1,000円、2,000円に変えたときの検索結果](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/search-demo.gif)

最初の2回はWebMCPを使ってツールを呼びました。AIの代わりに、ブラウザを自動で操作するライブラリのPlaywrightで、ページ内からWebMCPのAPIを実行しています。`document.modelContext.getTools()` で登録済みのツールの一覧を取得し、`document.modelContext.executeTool()` に予算5,000円と1,000円を渡して `search_products` を実行しました。

最後の1回はWebMCPを使わず、画面の入力欄に予算2,000円を入れて検索ボタンを押しました。

なお、`getTools()` と `executeTool()` は、ページ内のスクリプトや拡張機能から、ツールの一覧を取得して実行するためのAPIです。ブラウザに組み込まれたAIは、3章で説明したとおりブラウザに問い合わせてツールの一覧を受け取ります。その受け渡しの形式は、仕様では定められていません。

手元では後で説明するWebMCPパネルから同じようにツールを呼べます。

### 実行環境を準備する

ローカルで試すには、`chrome://flags` でWebMCPを有効にできるChromeが必要です。筆者はmacOSのChrome 156で確認しました。アドレスバーに `chrome://flags/#enable-webmcp-testing` を入力し、表示された項目を［Enabled］にしてから、Chromeを再起動します。サンプルはHTMLファイル1つで完結しています。

1. 下の「完全版のHTMLコード」を開き、`index.html` として保存します。
2. 保存した `index.html` をChromeで開きます。
3. 「WebMCPツールを登録しました。」と表示されることを確認します。

この記事ではAIをつながず、Chromeの開発者ツールからツールを呼びます。ここまでの手順と、あとで使うWebMCPパネルの操作は、上のフラグだけで動きます。

### 検索処理をツールとして登録する

検索関数をAIから呼べるようにするには、ページのJavaScriptから `document.modelContext.registerTool()` を呼んで登録します。次のコードは抜粋です。実際に動かすときは、下の完全版を `index.html` に保存してください。

```javascript
await document.modelContext.registerTool({
  name: "search_products",
  description: "予算の上限以下の商品を検索し、画面に表示します。購入はしません。",
  inputSchema: {
    type: "object",
    properties: {
      maxPrice: { type: "integer", minimum: 0, description: "予算の上限。日本円。" },
    },
    required: ["maxPrice"],
  },
  execute: async input => searchProducts(input),
});
```

登録する項目は3章で説明した4つに対応しています。

| 項目 | この例での役割 |
|---|---|
| `name` | ツールを見分けるための名前 |
| `description` | ツールの説明。この例では、購入はしないことも書いた |
| `inputSchema` | 受け取る値の条件。予算の上限は0以上の整数だと伝える |
| `execute` | ツールが呼ばれたときに実行する関数 |

`inputSchema` は JSON Schema 形式で書きます。この例では `maxPrice` を必須にし、0以上の整数と指定しています。仕様では、呼び出し側がこの条件に合う値を渡すことを想定しています。ただし、条件に合わない値（たとえば `-1`）が渡されたときに、ブラウザが検索関数を呼ぶ前に止めるとは書かれていません。そのため検索関数の中でも値を確かめ、条件に合わない値ならエラーにしています。

<details>
<summary>完全版のHTMLコード</summary>

`search_products` というツール名と `maxPrice` という引数名は、この例のために決めたものです。

```html:index.html
<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebMCP 商品検索</title>
<style>
  body { margin: 48px auto; max-width: 620px; padding: 0 28px; color: #23323a; background: #f7f5f0; font: 18px/1.7 -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; }
  h1 { margin-bottom: 28px; font-size: 32px; }
  form { padding: 24px; background: white; border: 1px solid #d9dedb; border-radius: 12px; }
  label { display: block; margin-bottom: 16px; }
  input { display: block; box-sizing: border-box; width: 100%; margin-top: 8px; padding: 10px 14px; border: 1px solid #a9b9b2; border-radius: 6px; font: inherit; }
  button { padding: 10px 30px; border: 0; border-radius: 6px; background: #176b59; color: white; font: inherit; cursor: pointer; }
  #status { font-size: 14px; color: #4e665d; }
  #results { min-height: 96px; padding: 24px; background: white; border-left: 4px solid #db8c36; white-space: pre-wrap; font: inherit; }
</style>
<h1>商品検索</h1>
<form id="search-form">
  <label>予算の上限（円）
    <input id="budget" type="number" min="0" step="1" value="5000" required>
  </label>
  <button>検索</button>
</form>
<p id="status" role="status">WebMCPを確認しています。</p>
<pre id="results" aria-live="polite">まだ検索していません。</pre>

<script type="module">
  const products = [
    { name: "マウス", price: 2000 },
    { name: "キーボード", price: 4500 },
    { name: "モニター", price: 18000 },
  ];
  const budgetInput = document.querySelector("#budget");
  const results = document.querySelector("#results");
  const status = document.querySelector("#status");

  function searchProducts({ maxPrice }) {
    if (!Number.isInteger(maxPrice) || maxPrice < 0) {
      throw new Error("maxPriceには0以上の整数を指定してください。");
    }
    const matches = products.filter(product => product.price <= maxPrice);
    budgetInput.value = String(maxPrice);
    results.textContent = matches.length
      ? matches.map(product => `${product.name}: ${product.price}円`).join("\n")
      : "該当する商品はありません。";
    return { products: matches };
  }

  document.querySelector("#search-form").addEventListener("submit", event => {
    event.preventDefault();
    try {
      searchProducts({ maxPrice: Number(budgetInput.value) });
    } catch (error) {
      results.textContent = error.message;
    }
  });

  if (!document.modelContext) {
    status.textContent = "WebMCPは利用できません。フォームから検索できます。";
  } else {
    try {
      await document.modelContext.registerTool({
        name: "search_products",
        description: "予算の上限以下の商品を検索し、画面に表示します。購入はしません。",
        inputSchema: {
          type: "object",
          properties: {
            maxPrice: { type: "integer", minimum: 0, description: "予算の上限。日本円。" },
          },
          required: ["maxPrice"],
        },
        execute: async input => searchProducts(input),
      });
      status.textContent = "WebMCPツールを登録しました。";
    } catch (error) {
      status.textContent = `WebMCPの登録に失敗しました: ${error.message}`;
    }
  }
</script>
</html>
```

</details>

`searchProducts()` は、検索ボタンを押したときにも、ツールの `execute` からも呼ばれます。WebMCPに対応していないブラウザでも、通常のフォーム操作で検索できるようにしてあります。

### WebMCPパネルから呼び出す

登録したツールはChromeの開発者ツールにあるWebMCPパネルから実行できます。パネル内の表示名はChromeのバージョンや言語設定によって異なる場合があります。

1. `index.html` を開いたChromeで開発者ツールを開き、［Application］を選びます。
2. 左側の一覧から［WebMCP］を選びます。
3. ［Available Tools］で `search_products` を選びます。
4. ［Run Tool］の入力欄で、`maxPrice` に `5000` を入れます。
5. ［Run Tool］ボタンを押します。

WebMCPパネルは［Application］の左側の一覧にあります。次の画像はツールを実行した後のWebMCPパネルです。下の［Available Tools］に、登録した `search_products` が表示されています。

![Chromeの開発者ツールで［Application］を開き、左側の一覧の［WebMCP］を選んだ画面。下の［Available Tools］にsearch_productsが表示されている](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/devtools-webmcp.png)

![WebMCPパネルで、実行前、予算5000の入力、商品2件の表示とCompletedになるまでを比較するGIF](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/devtools-demo.gif)

ページとWebMCPパネルの実画面を並べたGIFです。[実行直前（`maxPrice` に5000を入力した状態）](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/devtools-before.png)と[実行後](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/devtools-after.png)は静止画でも確認できます。画像内の見出しと「呼び出し履歴」は説明のために加えた注釈です。DevToolsでは、NameとStatusの列がある上の一覧が呼び出し履歴にあたります。公式ドキュメントでは、この一覧を Invoked tools と呼んでいます。

実行したら、呼び出し履歴の一覧に `search_products` の行が追加され、［Status］がCompletedになっていることを確かめます。行を選ぶと、右側に［Details］［Input］［Output］のタブが表示されます。［Output］タブには、ツールが呼び出し元に返した商品一覧が表示されます。呼び出し元は、この手順ではDevTools、実際の利用ではAIです。

![呼び出し履歴でsearch_productsの行を選び、［Output］タブを開いた画面。マウス2000円とキーボード4500円の商品一覧が表示されている](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-10-webmcp-introduction/devtools-output.png)

［Output］の商品一覧と、ページに表示された商品を見比べます。

予算5,000円で実行すると、画面には次の2件が表示されました。

```text
マウス: 2000円
キーボード: 4500円
```

この章の最初のGIFではスクリプトから予算1,000円でツールを呼ぶと、戻り値の商品一覧は空になり、画面には「該当する商品はありません。」と出ました。予算2,000円を入力して検索ボタンを押したときは、マウスだけが表示されました。

ツールの戻り値と、画面に表示された商品は一致しました。検索ボタンとツールのどちらからも同じ検索関数を使っているので、絞り込み条件を別々に管理せずに済みます。

### この例から学べる設計

この例では入力とボタンのクリックを別々のツールにはしていません。「予算以下の商品を探す」という利用者の目的を、1つのツールにしました。AIから予算を受け取ったら、ページの中で検索して画面を更新し、結果をAIに返します。このツールは商品を表示するだけで、購入はしていません。購入や送信のように取り消せない操作をツールにするなら、実行する前に利用者が画面で内容を確認できる流れも考える必要があります。

自分のサイトに当てはめるときも、まず利用者が達成したい目的を1つ選びます。次に、その目的に必要な入力と、結果を確認できる画面を決めます。この記事の例なら、目的は「予算以下の商品を探す」、入力は予算、結果を確認する画面は商品一覧です。ここまで決めると、どこまでを1つのツールにするかを考えやすくなります。

AIに依頼文を送って試したいなら、[Chromeのドキュメントで紹介されている検証用の拡張機能](https://developer.chrome.com/docs/ai/webmcp#imitate_an_agent_to_test_your_tools)を使う方法があります。

## 6. 今後の展開

ここまではフラグを有効にした手元のChromeで試しました。ほかの利用者の環境で試す方法として、Chromeはバージョン149から、Edgeは150から「[Origin Trial](https://developer.chrome.com/docs/web-platform/origin-trials)」を提供しています。Origin Trialは開発中の機能を、登録したサイトで期間限定で試せる仕組みです。Chromeの当初の対象は156まででしたが、2026年10月27日時点では162までの延長がChrome Platform Statusに登録されています。期間や対象バージョンは変わることがあるので、登録前に各ブラウザの案内を確認してください。

WebMCPの構想案を読むだけではなく、実装して試せる段階まで来ていることが、いま注目したい理由です。とはいえ、どのブラウザとAIの組み合わせで使えるかや、APIの変更は、これからも確認していく必要があります。対応が広がってAPIが安定すれば、同じ登録コードを複数のブラウザやAIで使いやすくなると考えています。ただし、正式な標準化や普及の時期は、現時点では断定できません。

まず自分のサイトで試すなら、検索や絞り込みを1つ選んで、既存の関数を、画面の操作とツールの両方から呼べるか確かめてみてください。AIに公開する操作を考えることは、既存のWebサイトの処理を整理し直すきっかけにもなります。

## 参考文献

### 仕様と提案

- [WebMCP公式提案：背景・課題・目標](https://github.com/webmachinelearning/webmcp#background-and-motivation)
- [WebMCP仕様書：APIとエージェント連携](https://webmachinelearning.github.io/webmcp/)
- [MCP公式ドキュメント：構成と役割](https://modelcontextprotocol.io/docs/learn/architecture)
- [WebMCPの実装状況](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md)

### Chromeでの実装と検証

- [WebMCPの利用手順](https://developer.chrome.com/docs/ai/webmcp#get_started)
- [ツール登録API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [DevToolsのWebMCPパネル](https://developer.chrome.com/docs/devtools/application/webmcp?hl=ja)
- [ツールの設計指針](https://developer.chrome.com/docs/ai/webmcp/build-tools)

### 試験提供

- [ChromeのOrigin Trial案内](https://developer.chrome.com/blog/ai-webmcp-origin-trial)
- [Chrome Platform StatusのWebMCP登録情報（Origin Trialの対象バージョン）](https://chromestatus.com/feature/5117755740913664)
- [EdgeのOrigin Trial登録ページ](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a)

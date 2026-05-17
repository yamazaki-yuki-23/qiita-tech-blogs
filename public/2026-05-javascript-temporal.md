---
title: Node.js v26で標準化されたJavaScript Temporalを触ってみた — Dateの何が問題で、Temporalが何を解決するのか
tags:
  - JavaScript
  - Node.js
  - date
  - temporal
  - web標準
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
---

**TL;DR**

- 2026-05-14 にリリースされた Node.js v26 で `Temporal` がフラグなしのデフォルト有効になった。Firefox 139（2025-05）・Chrome 144 / Edge 144（2026-04）に続いてサーバサイドJSランタイムでも揃った
- 既存の `Date` には「ミュータブル」「月が0始まり」「存在しない日付が黙って繰り上がる」「タイムゾーンがUTCとローカルしかない」「日付だけ・時刻だけを表現できない」「ミリ秒精度どまり」といった構造的な問題が、1995年の登場から30年近く引きずられてきた
- `Temporal` は `Instant` / `ZonedDateTime` / `PlainDate` / `PlainTime` / `PlainDateTime` / `Duration` / `Now` などをクラスとして分離し、イミュータブル・任意タイムゾーン対応・ナノ秒精度・複数暦法対応を最初から持っている
- 実際に Node 26 で触ってみると、DST 切替日や月末加算で `Date` だと地雷になる挙動が、Temporal では仕様として明示されていて気持ちが良い
- ただし Safari は未対応で、フロントエンドで全面採用するにはまだポリフィル戦略が必要

検証時点の情報です。

- 検証日: 2026年5月17日
- OS: macOS（Darwin 24.6.0, arm64）
- Node.js: `v26.1.0`（Volta 経由）
- 一次情報: MDN 公式ドキュメント

サンプルコードは GitHub に置きました。記事中の出力はすべてこのリポジトリの `.mjs` を Node 26 で実行した結果です。

https://github.com/yamazaki-yuki-23/temporal-node26-playground

## なぜ今 JavaScript に新しい日付APIなのか

`Date` が抱える問題はずっと議論されてきました。冒頭で挙げた箇条書きの粒度なら、誰かのスライド資料にも書いてあります。それでも自分の手で書き直したかった理由は、「Temporal を使うべき」と頭で分かっていても、`Date` のどこがどう壊れていて、Temporal のどのクラスがそれを直しているのかを、自分の言葉で説明できる気がしなかったからです。

この記事の問いは1つです。

> `Date` の何が問題で、`Temporal` は何を解決しているのか。コードと実出力で確かめる。

教科書的なクラス一覧の前に、まず `Date` の地雷を6つ踏み抜くところから始めます。

## Temporal以前の世界 — Date が引きずってきた6つの問題

[`01-date-pitfalls.mjs`](https://github.com/yamazaki-yuki-23/temporal-node26-playground/blob/main/01-date-pitfalls.mjs) を Node 26 で実行した出力を貼ります。Temporal が登場する前のJSで日付処理を書いていた人なら、どれかには刺された経験があるはずです。

### 問題1: `setMonth` は元のインスタンスを書き換える

```js
const d1 = new Date("2026-01-31T00:00:00Z");
d1.setUTCMonth(d1.getUTCMonth() + 1); // 2月を期待
console.log(d1.toISOString());
```

```console
before: 2026-01-31T00:00:00.000Z
after : 2026-03-03T00:00:00.000Z
```

問題は二重です。一つは元のインスタンスが書き換わる（ミュータブル）こと。もう一つは、1/31 の1か月後が **3/3 にワープする** こと。`Date` は「2月に31日はないので、2/31 を 3/3 に解釈する」という挙動をします。月末を1ヶ月後に進めたいだけのつもりが、月末月初の境目で静かに2月をスキップします。

### 問題2: 月だけ0始まり

```js
const d2 = new Date(2026, 11, 25); // 12月を表したい
console.log(d2.toString());
```

```console
Date(2026, 11, 25): Fri Dec 25 2026 00:00:00 GMT+0900 (日本標準時)
```

12月を表すのに第2引数は `11` です。0始まりだから。`12` を渡すと1月になります。年・日・時・分・秒は普通の数値で、月だけ 0 始まり。混在しています。「JavaScript で日付を書くときは月を `-1` する」というローカルルールが、ライブラリ越しに何度もバグを生んできました。

### 問題3: 存在しない日付が黙って繰り上がる

```js
const d3 = new Date("2026-02-30T00:00:00Z");
console.log(d3.toISOString());
```

```console
2026-02-30 → 2026-03-02T00:00:00.000Z
```

`2026-02-30` は存在しないのに、`Date` は例外を投げず、勝手に `3/2` として受け入れます。ユーザー入力をそのまま `new Date()` に通している箇所では、不正な入力がサイレントに別の日付として通り抜けます。

### 問題4: タイムゾーンが UTC とローカルしかない

```js
const d4 = new Date("2026-05-17T10:00:00Z");
console.log(d4.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
console.log(d4.toLocaleString("en-US", { timeZone: "America/New_York" }));
```

```console
Asia/Tokyo で表示: 2026/5/17 19:00:00
America/NY で表示: 5/17/2026, 6:00:00 AM
```

「表示」だけなら `toLocaleString` の `timeZone` オプションで他のタイムゾーンに変換できます。問題は `Date` インスタンス自身は「東京の19時」として保持していない点。`getHours()` を呼ぶと実行環境のローカルタイムゾーンの時刻が返ります。「東京の19時に毎週開催する会議」というドメインモデルを `Date` だけで表現する手段がありません。

### 問題5: 「日付だけ」「時刻だけ」が表現できない

```js
const birthday = new Date("2000-04-12"); // 誕生日（時刻は不要）
console.log(birthday.toString());
```

```console
誕生日Date: Wed Apr 12 2000 09:00:00 GMT+0900 (日本標準時)
```

誕生日は日付だけで十分です。それでも `Date` は内部的に時刻とタイムゾーンを持ち、ISO 形式の文字列を UTC 0時として解釈するルールが暗黙に効きます。`birthday.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })` を呼ぶと `4/11/2000` が返ってきます。同じ「2000-04-12 生まれ」のはずなのに、表示するタイムゾーンによって日付が前日にずれる、というバグの定番ルートです。

### 問題6: 精度はミリ秒どまり

```js
console.log(Date.now());
```

```console
Date.now() = 1779014734631 (ms)
```

ハイレゾタイマーが必要なら `performance.now()` を使えばいいんですが、`Date` の世界観としてミリ秒以下が表現できないこと自体が、現代の高精度計測（HTTP リクエスト分布、トレーシング、分散システムのイベント順序など）と噛み合いません。

ここまで6つ。「Temporal がほしい」と言われ続けてきた現場感覚は、だいたいこのあたりに集約されます。

## Node.js v26 でついに標準化された

Temporal は2017年に TC39 にプロポーザルが上がり、長い議論を経て Stage 4（標準入り）に到達しました。サーバサイドJSの本丸である Node.js が v26 で乗せてきたのは、現場にとっては重要な節目です。

Publickey の報道によると、各環境の対応状況はこうです。

- **Firefox 139**（2025-05）で先行
- **Chrome 144 / Edge 144**（2026-04）でサポート
- **Node.js v26**（2026-05-14）で**フラグなし**のデフォルト有効
- **Safari**: 2026-05時点でまだ未対応

Node 26 は今年（2026年）11月に LTS 化される予定なので、サーバサイドでは半年後から本格的にプロダクション採用しても良いタイミングになります。

ブラウザは Safari がまだなので、フロントエンドで全面採用するなら[`@js-temporal/polyfill`](https://www.npmjs.com/package/@js-temporal/polyfill) や [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill) を当てる選択肢が現実的です。

Node 26 で実際に `Temporal` が見えていることを最小コードで確認しておきます。

```js
console.log(typeof Temporal);
// "object"
```

`Temporal` は `Math` と同じで名前空間オブジェクトです。`new Temporal()` はできません。すべての操作は `Temporal.Now` や `Temporal.Instant.from()` のように静的メソッド・サブクラス経由で呼び出します。

## Temporalの中核 — 5つのクラスで設計を理解する

MDN のリファレンスを見ると Temporal には10近いクラスが並んでいて、最初に開くと圧倒されます。ただ、実用上「まずこれだけ覚えておけば困らない」のは5つです。

- `Temporal.Now` — 現在時刻を取得
- `Temporal.Instant` — UTC基準の「瞬間」
- `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` — タイムゾーンも暦も持たない構成要素
- `Temporal.ZonedDateTime` — タイムゾーン込みの日時
- `Temporal.Duration` — 期間・差分

順番に、`Date` 版と比べながら触っていきます。

### Temporal.Now — 現在時刻を「粒度ごと」に取る

`Date.now()` がミリ秒タイムスタンプを、`new Date()` がローカル日時を返すという二択だった世界に対し、Temporal は「どの粒度・どのタイムゾーンの現在時刻が欲しいか」を呼び分ける設計を取る。

```js
console.log(Temporal.Now.instant().toString());
console.log(Temporal.Now.zonedDateTimeISO().toString());
console.log(Temporal.Now.zonedDateTimeISO("Asia/Tokyo").toString());
console.log(Temporal.Now.zonedDateTimeISO("America/New_York").toString());
console.log(Temporal.Now.plainDateISO().toString());
console.log(Temporal.Now.plainTimeISO().toString());
```

```console
instant         : 2026-05-17T10:45:34.678364014Z
epochNanoseconds: 1779014734678364014n
zonedDateTimeISO: 2026-05-17T19:45:34.681697998+09:00[Asia/Tokyo]
Asia/Tokyo      : 2026-05-17T19:45:34.682493896+09:00[Asia/Tokyo]
America/New_York: 2026-05-17T06:45:34.68249707-04:00[America/New_York]
plainDateISO    : 2026-05-17
plainTimeISO    : 19:45:34.682677002
```

`instant()` はナノ秒精度の UTC タイムスタンプ。`epochNanoseconds` は **BigInt** で返ります（ナノ秒は `Number` の安全整数を超えるので必然）。

「いま東京は何日？」は `plainDateISO("Asia/Tokyo")` のように粒度とタイムゾーンを引数で明示します。`Date` で同じことをやろうとすると `toLocaleString` の出力を文字列パースする羽目になりがちで、ここでだいぶ気が楽になります。

### Temporal.Instant — UTC基準の「瞬間」

`Instant` は「いつ」を絶対的に指す値です。タイムゾーンも暦も持たず、エポックからのナノ秒数だけで定義されます。サーバ間のタイムスタンプ同期、ログのイベント順序、外部APIの `created_at` のような「機械間の時刻」はこのクラスが第一候補です。

```js
const fromString = Temporal.Instant.from("2026-05-17T10:00:00Z");
const fromMs = Temporal.Instant.fromEpochMilliseconds(1_779_012_000_000);
const fromNs = Temporal.Instant.fromEpochNanoseconds(1_779_012_000_000_000_000n);
```

```console
from string : 2026-05-17T10:00:00Z
from ms     : 2026-05-17T10:00:00Z
from ns     : 2026-05-17T10:00:00Z
```

イミュータビリティの確認。

```js
const t0 = Temporal.Instant.from("2026-05-17T10:00:00Z");
const t1 = t0.add({ hours: 3, minutes: 15 });
```

```console
t0: 2026-05-17T10:00:00Z ← 元は変わらない
t1: 2026-05-17T13:15:00Z ← 3時間15分後
```

`Date.prototype.setUTCMonth` のような「自身を書き換えるメソッド」は Temporal には一切ありません。すべての変更操作が新しいインスタンスを返します。`const` で受けて気軽に渡し回せるという、関数型言語に近い書き味です。

差分は `until` / `since` で取れます。

```js
const a = Temporal.Instant.from("2026-05-17T10:00:00Z");
const b = Temporal.Instant.from("2026-05-18T11:30:00Z");
console.log(a.until(b).toString());
console.log(a.until(b, { largestUnit: "hour" }).toString());
```

```console
a.until(b)               : PT91800S
largestUnit:'hour' で整形: PT25H30M
```

デフォルトでは秒単位の Duration（`PT91800S`）として返ります。「25時間30分」のように上位の単位まで繰り上げたい時は `largestUnit` を指定する。秒からの繰り上がりは暦法やタイムゾーンに依存しないので、ライブラリ側で勝手に「日」「月」まで繰り上げないのは設計として一貫しています（日や月の長さはタイムゾーンと暦法で変わる）。

### PlainDate / PlainTime / PlainDateTime — タイムゾーンも暦も持たない「壁時計」

ここが Temporal の設計でいちばん新しい部分です。`Date` は「タイムスタンプ＋ローカルの壁時計」という二つの役割を一つのオブジェクトに詰め込んでいました。Temporal はそれを分離します。

```js
const birthday = Temporal.PlainDate.from("2000-04-12");
console.log(birthday.dayOfWeek);
console.log(birthday.daysInMonth);
console.log(birthday.inLeapYear);
```

```console
birthday    : 2000-04-12
dayOfWeek   : 3
daysInMonth : 30
inLeapYear  : true
```

`PlainDate` は **時刻もタイムゾーンも持たない日付**です。誕生日、契約日、休日表のような「壁掛けカレンダーに丸を付ける」種類の値はこれで表現します。

存在しない日付を入れたらどうなるか。

```js
Temporal.PlainDate.from("2026-02-30");
```

```console
error: Temporal error: Parsed day value not in a valid range.
```

`Date` が黙って `3/2` にしていたところを、`Temporal` は例外で弾きます。同じ思想が時刻にも貫かれています。`PlainTime.from("25:00")` は例外を投げます。

時刻だけ・日時だけのバリアントも揃っています。

```js
const alarm = Temporal.PlainTime.from("08:00");
console.log(alarm.add({ minutes: 90 }).toString());

const meeting = Temporal.PlainDateTime.from("2026-05-17T15:30");
console.log(meeting.with({ year: 2030 }).toString());
```

```console
alarm        : 08:00:00
+ 90 minutes: 09:30:00
meeting        : 2026-05-17T15:30:00
with year=2030 : 2030-05-17T15:30:00
```

`with` メソッドは「一部のフィールドだけ差し替えた新しいインスタンスを返す」操作。React の状態更新で馴染みのあるパターンです。

さらに細かい単位として `PlainYearMonth`（クレジットカード有効期限）と `PlainMonthDay`（毎年同じ月日、たとえば祝日）も別クラスとして存在します。

```js
const cardExpiry = Temporal.PlainYearMonth.from("2030-12");
const christmas = Temporal.PlainMonthDay.from("--12-25");
console.log(cardExpiry.toString(), christmas.toString());
```

```console
PlainYearMonth : 2030-12
PlainMonthDay  : 12-25
```

「型を細かく分けすぎでは？」と最初は思いましたが、`PlainMonthDay` で誕生日を扱うのは理にかなっています。誕生日には年は要らないし、毎年の誕生日通知バッチを作るなら「2/29 を扱えるかどうか」を型で区別したい場面が出てきます。Temporal は最初からこの区別を仕込んできた、という見方ができます。

### ZonedDateTime — タイムゾーン込みの日時、DSTも扱える

ここが `Date` が一番弱かった領域です。`ZonedDateTime` は「タイムゾーン情報込みの日時」を一級市民として扱います。

```js
const inst = Temporal.Instant.from("2026-05-17T10:00:00Z");
console.log(inst.toZonedDateTimeISO("Asia/Tokyo").toPlainDateTime().toString());
console.log(inst.toZonedDateTimeISO("Europe/London").toPlainDateTime().toString());
console.log(inst.toZonedDateTimeISO("America/New_York").toPlainDateTime().toString());
```

```console
Asia/Tokyo      : 2026-05-17T19:00:00
Europe/London   : 2026-05-17T11:00:00
America/New_York: 2026-05-17T06:00:00
```

同じ `Instant`（絶対的な瞬間）を、タイムゾーンを通して「壁時計の時刻」に変換しています。逆向きの変換も対称に用意されています。

ここから先が、`Date` だと自前で実装する羽目になっていたDST（夏時間）の話。米ニューヨークは毎年3月の第2日曜に午前2時から3時へジャンプします。「2026-03-08 02:30 アメリカ東部時間」という時刻は **存在しません**。

```js
const dst = Temporal.ZonedDateTime.from("2026-03-08T02:30[America/New_York]");
console.log(dst.toString());
console.log(dst.offset);
```

```console
入力 2026-03-08T02:30 [America/New_York]
→ 実際の時刻       : 2026-03-08T03:30:00-04:00[America/New_York]
→ オフセット        : -04:00
```

存在しない時刻の入力に対して、Temporal は黙って「DST後のオフセットを採用する」というデフォルト動作で 03:30 に補正します。`disambiguation: 'reject'` を渡せば例外にもできるので、ユーザー入力のバリデーションに使えます。`Date` には選びようがないので、DST 境目を意識した実装は普通スキップされます。

もう一つ、DSTの境目をまたぐと「1日 = 24時間」が成立しない、という当たり前のことを Temporal は素直に扱います。

```js
const before = Temporal.ZonedDateTime.from("2026-03-07T12:00[America/New_York]");
const after = before.add({ days: 1 });
console.log(after.toString());
console.log(before.until(after, { largestUnit: "hour" }).toString());
```

```console
3/7 12:00 + 1 day : 2026-03-08T12:00:00-04:00[America/New_York]
実経過時間         : PT23H
```

`add({ days: 1 })` は壁時計の上では 12:00 → 12:00 で1日後ですが、実経過時間は **23時間**です。`days` と `hours` を Temporal は意図的に区別していて、`days: 1` は「カレンダー上の1日先」、`hours: 24` は「物理時間で24時間後」と別物として扱われます。

最後に、`withTimeZone` と `toPlainDateTime().toZonedDateTime(zone)` の使い分け。前者は「同じ瞬間を別タイムゾーンで表示する」、後者は「壁時計の時刻を維持したまま別タイムゾーンに置き換える」。

```js
const tokyo9 = Temporal.ZonedDateTime.from("2026-05-17T09:00[Asia/Tokyo]");
console.log(tokyo9.withTimeZone("America/New_York").toString());
const ny9 = tokyo9.toPlainDateTime().toZonedDateTime("America/New_York");
console.log(ny9.toString());
```

```console
Tokyo 09:00 = NY: 2026-05-16T20:00:00-04:00[America/New_York]
NY も 09:00     : 2026-05-17T09:00:00-04:00[America/New_York]
```

「東京の朝9時と同じ瞬間、ニューヨークは何時？」と「東京の朝9時に開催する会議をニューヨーク現地時間で朝9時開催に置き換えたい」は別の操作です。Temporal は2つの操作を別メソッドに分けて、書き手にどちらの意味かを選ばせます。`Date` でこの区別を厳密に書こうとすると、毎回チームメンバー全員に意図を確認する羽目になります。

### Duration — 期間と差分、丸めまで仕様に含まれる

Temporal の最後のピース。`Duration` は「期間」を表す独立した値です。

```js
const dur = Temporal.Duration.from({ minutes: 130, seconds: 45 });
console.log(dur.toString());
console.log(dur.round({ largestUnit: "hour" }).toString());
console.log(dur.round({ smallestUnit: "minute" }).toString());
```

```console
dur                          : PT130M45S
round({ largestUnit: 'hour'}): PT2H10M45S
round({ smallestUnit:'min'}): PT131M
```

`round` で粒度を上げる・下げるが API として揃っています。Day.js や date-fns のラッパー越しに自前実装していた「日付計算のための小さなユーティリティ」がほぼ全部、標準に降ってきた感覚です。

ZonedDateTime と組み合わせるとカレンダー対応の加算ができます。`Date` の `setMonth` が 1/31 + 1ヶ月で 3/3 に飛んでいた問題は、Temporal だと月末は月末に丸められます。

```js
const start = Temporal.ZonedDateTime.from("2026-01-31T10:00[Asia/Tokyo]");
console.log(start.add({ months: 1 }).toString());
```

```console
1/31 + 1 month: 2026-02-28T10:00:00+09:00[Asia/Tokyo]
```

「1月31日の1ヶ月後」を「2月の存在する最終日」として解釈する。月末という人間の直感に近い挙動が、特別な分岐なしに型の仕様として出ます。

## ユースケース別: 何にどのクラスを使うか

ここまで触ったクラスを使い分けの観点で整理します。

| やりたいこと | 適切なクラス | 理由 |
|---|---|---|
| サーバ間タイムスタンプ、ログのイベント順序 | `Temporal.Instant` | UTCナノ秒、タイムゾーン不要 |
| 「東京で毎週月曜9:00開催」のスケジュール | `Temporal.ZonedDateTime` | DSTやオフセットを正しく扱う |
| 「毎朝8時のアラーム」 | `Temporal.PlainTime` | 日付・タイムゾーン情報を持たない |
| 誕生日（月日のみ、年なし） | `Temporal.PlainMonthDay` | 2/29 などを型で区別できる |
| 契約日、休日表、請求書日付 | `Temporal.PlainDate` | 時刻情報が混入しない |
| クレジットカード有効期限 | `Temporal.PlainYearMonth` | 月単位で十分 |
| 「2時間30分」「3営業日」のような期間 | `Temporal.Duration` | カレンダー対応の加算と丸めができる |
| ローカルでの会議予約フォーム | `Temporal.PlainDateTime` | ユーザー入力の時点ではゾーン未確定 |

`Date` で1つの型に押し込めていた表現を、用途ごとに型で区別する。これが Temporal が `Date` の上に積んだ最大の変更点だ。

## 触ってみて湧いた疑問

検証中にメモした「これ、どうするのが正解？」をそのまま残しておきます。

**Safari 未対応のいま、フロントエンドではどう導入するか。** 公式ポリフィルが2系統あって、`@js-temporal/polyfill` は仕様提案者ら、`temporal-polyfill` は FullCalendar 系のメンテナが作っています。React や Vue のアプリで全面採用するなら、Day.js や date-fns との併存期間をどう設計するかが先に決まらないと、依存が二重化するだけで終わりそうです。サーバサイド先行で導入して、JSON のシリアライズフォーマットを ISO 8601 + RFC 9557 拡張に統一する、というのが現実的な移行戦略の入口になりそうです。

**`Date` は非推奨にならないのか。** 歴史的に Web標準は「壊さない」前提なので、`Date` が deprecated 表示されることは当面ないはずです。ESLint のカスタムルールで `new Date()` を警告にして、社内で段階的に置き換えていくしかない。`@typescript-eslint/no-restricted-syntax` あたりが現実的な手段になりそうです。

**「JSON での日時表現」は今後どう揃うか。** REST API の `created_at` を ISO 8601 文字列で受けて、サーバ側で `Temporal.Instant.from()`、フロントで `Temporal.ZonedDateTime` に変換する流れが標準パターンになると見ています。OpenAPI スキーマの `format: date-time` の解釈もこのあたりで揃ってきてほしい。

**`Temporal.Duration` を業務時間（営業日）でどう拡張するか。** 「3営業日後」のような業務固有の期間表現は Duration ではカバーされません。`Temporal.Calendar` をカスタム実装する余地は仕様上ありますが、ここはまだエコシステム側の整備待ち。`date-fns-business-days` のような周辺ライブラリが Temporal 前提で書き直されると、`Date` 系のユーティリティ層が一気に置き換わりそうです。

## まとめ

- Node.js v26 で `Temporal` がフラグなしのデフォルト有効になり、サーバサイドJSでは標準APIとして使える段階になった
- `Date` の構造的な問題（ミュータブル、月0始まり、サイレント繰り上げ、タイムゾーン不足、日付/時刻の混在、ミリ秒精度）は、Temporal の「役割ごとに型を分ける」「全インスタンスをイミュータブルにする」「任意タイムゾーンを一級市民にする」「ナノ秒精度を持つ」設計でほぼ解消されている
- 実用上は `Now` / `Instant` / `PlainDate`系 / `ZonedDateTime` / `Duration` の5系統を押さえれば、現場の日付処理の8割は書ける
- DST境目や月末加算など、`Date` だと地雷だった挙動が Temporal では仕様として明示されているのが気持ち良い
- 残りの課題は Safari 未対応とフロントエンドのポリフィル戦略、それと `Date` からの段階的移行のガバナンス

実機検証の `.mjs` 一式はリポジトリに置いています。Node 26 を入れてあれば、`node 01-date-pitfalls.mjs` から `node 06-temporal-duration.mjs` まで順に叩くと、本記事の出力がそのまま再現できます。

https://github.com/yamazaki-yuki-23/temporal-node26-playground

## 参考

- MDN: [Temporal](https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
- Publickey: [Node.js 26、Temporal がデフォルトで有効に。日付や時刻を扱う「Temporal」がChrome、Edge、Firefox、Node.jsで利用可能に](https://www.publickey1.jp/blog/26/nodejsdatetemporaltemporalchromeedgefirefoxnodejs.html)
- TC39: [Temporal proposal](https://tc39.es/proposal-temporal/docs/)
- ポリフィル: [@js-temporal/polyfill](https://www.npmjs.com/package/@js-temporal/polyfill) / [temporal-polyfill](https://www.npmjs.com/package/temporal-polyfill)

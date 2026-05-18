---
title: Node.js v26 で標準化された JavaScript Temporal — Date の何が問題で、Temporal が何を解決するのか
tags:
  - JavaScript
  - Node.js
  - Temporal
  - Date
  - Web標準
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
---

**TL;DR**

- 2026-05-14 リリースの Node.js v26 で `Temporal` が標準で使えるようになった。Firefox 139（2025-05）・Chrome 144 / Edge 144（2026-04）に続いて、Node.js も対応した
- `Temporal` は役割ごとに型を分けたクラス群で、`Date` の設計上の問題を解消する
- Safari は2026-05時点で未対応。フロントエンドでの全面採用にはポリフィルが必要

## Date が抱える5つの設計上の問題

### 1. すべてのセッターがミュータブル

```js
const d = new Date("2026-01-31T00:00:00Z");
console.log("before:", d.toISOString());
d.setUTCMonth(d.getUTCMonth() + 1); // 2月を期待
console.log("after :", d.toISOString());
```

```console
before: 2026-01-31T00:00:00.000Z
after : 2026-03-03T00:00:00.000Z
```

`setUTCMonth` は元のインスタンス `d` を書き換えます。さらに `1/31` の1ヶ月後は2月に該当日がないので `3/3` として扱われ、月末を1ヶ月進めたいだけの操作で2月をまたぎます。`const` で受けても安心できず、関数間で渡し回す際に意図しない書き換えが起きやすい設計。

### 2. 同じ Date インスタンスから、UTC とローカルで違う時刻が返る

```js
const d = new Date("2026-05-17T10:00:00Z");
console.log("getUTCHours():", d.getUTCHours());
console.log("getHours()   :", d.getHours());
```

```console
getUTCHours(): 10
getHours()   : 19
```

`Date` インスタンス1つに対して、UTC として読むメソッド（`getUTCHours()` 系）と、実行環境のローカル時刻として読むメソッド（`getHours()` 系）の両方が定義されていて、同じ値から違う数字が返ります。どちらが「真の値」なのかは型からは分からず、書き手が状況ごとに選び分ける必要があります。

### 3. タイムゾーンは UTC とローカルのみ

```js
const d = new Date("2026-05-17T10:00:00Z");
console.log("Asia/Tokyo で表示:", d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
console.log("America/NY で表示:", d.toLocaleString("en-US", { timeZone: "America/New_York" }));
```

```console
Asia/Tokyo で表示: 2026/5/17 19:00:00
America/NY で表示: 5/17/2026, 6:00:00 AM
```

`toLocaleString` の `timeZone` オプションで任意のタイムゾーンの「表示」は得られます。ただし `Date` インスタンス自身は「Tokyo の19時」として保持しているわけではありません。`getHours()` は常に実行環境のローカルタイムゾーンを参照するため、`Date` 単体で「Tokyo 時間で毎週月曜9:00」のような業務上の概念を表現する手段がありません。

### 4. グレゴリオ暦以外を扱えない

```js
const d = new Date(2026, 0, 1);
console.log("getFullYear():", d.getFullYear());
console.log(
  "和暦表示     :",
  d.toLocaleDateString("ja-JP-u-ca-japanese", {
    era: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
);
```

```console
getFullYear(): 2026
和暦表示     : 令和8年1月1日
```

`toLocaleDateString` を使えば和暦などの「表示」はできます。しかし `getFullYear()` などの数値を返すメソッドは常にグレゴリオ暦を返します。和暦・ヘブライ暦・イスラム暦・中国暦などを数値として取り出す標準APIは `Date` にありません。

### 5. 日時文字列の解釈が一貫しない

```js
console.log(new Date("2026-01-01").toISOString());
console.log(new Date("2026/01/01").toISOString());
```

```console
2026-01-01T00:00:00.000Z
2025-12-31T15:00:00.000Z
```

ISO 8601 形式（ハイフン区切りの `YYYY-MM-DD`）は **UTC の0時** として解釈されます。スラッシュ区切りの `YYYY/MM/DD` は **実行環境のローカル0時** として解釈されます。Tokyo (UTC+9) で実行すると、後者は UTC では前日15時となり、文字列が1字違うだけで日付が前後にずれます。形式間でルールが揃っていない上、ローカル時刻として解釈される側は実行環境にも依存。

## Node.js v26 でついに標準化された

Temporal は TC39 proposal として長く議論され、Stage 4 に到達しました。各環境の対応状況は次の通りです。

- **Firefox 139**（2025-05）で先行
- **Chrome 144 / Edge 144**（2026-04）でサポート
- **Node.js v26**（2026-05-14）でフラグなしのデフォルト有効
- **Safari**: 2026-05時点で未対応

Safari 未対応のため、フロントエンドで利用するならポリフィルを併用するのが現実的です。`@js-temporal/polyfill` は Temporal 仕様の策定メンバーが管理する参照実装ベースのポリフィル（gzip 後 45kB 程度）、`temporal-polyfill` は FullCalendar の作者による軽量実装（gzip 後 20kB 程度）です。仕様追従の正確さを取るか、バンドルサイズの軽さを取るかで使い分けることになります。

## Temporal の中核 — 5つのクラス

Node.js v26 で `Temporal` が使えることを最小コードで確認します。

```js
console.log(typeof Temporal);
// "object"
```

`Temporal` は `Math` と同じく、関連する機能をまとめた名前空間オブジェクトです。`new Temporal()` で直接インスタンスを作るオブジェクトではなく、`Temporal.Now` や `Temporal.Instant.from()` のように静的メソッド・サブクラス経由で使います。

MDN のリファレンスを見ると Temporal には10近いクラスが並んでいますが、実用上はまず次の5系統を押さえれば足ります。

- `Temporal.Now` — 現在時刻を取得
- `Temporal.Instant` — UTC 基準の「瞬間」
- `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` / `PlainYearMonth` / `PlainMonthDay` — タイムゾーンを持たない構成要素
- `Temporal.ZonedDateTime` — タイムゾーン込みの日時
- `Temporal.Duration` — 期間・差分

### Temporal.Now — 現在時刻を粒度ごとに取る

`Date.now()` がミリ秒タイムスタンプを、`new Date()` がローカル日時を返すという二択だった世界に対し、Temporal は「どの粒度・どのタイムゾーンの現在時刻が欲しいか」を呼び分ける設計を取ります。

```js
const instant = Temporal.Now.instant();
console.log("instant         :", instant.toString());
console.log("epochNanoseconds:", instant.epochNanoseconds);
console.log("epochMilliseconds:", instant.epochMilliseconds);

const zdt = Temporal.Now.zonedDateTimeISO();
console.log("zonedDateTimeISO:", zdt.toString());
console.log("timeZoneId      :", zdt.timeZoneId);

const tokyo = Temporal.Now.zonedDateTimeISO("Asia/Tokyo");
const ny = Temporal.Now.zonedDateTimeISO("America/New_York");
console.log("Asia/Tokyo      :", tokyo.toString());
console.log("America/New_York:", ny.toString());

console.log("plainDateISO    :", Temporal.Now.plainDateISO().toString());
console.log("plainTimeISO    :", Temporal.Now.plainTimeISO().toString());
console.log("timeZoneId()    :", Temporal.Now.timeZoneId());
```

```console
instant         : 2026-05-17T10:45:34.678364014Z
epochNanoseconds: 1779014734678364014n
epochMilliseconds: 1779014734678
zonedDateTimeISO: 2026-05-17T19:45:34.681697998+09:00[Asia/Tokyo]
timeZoneId      : Asia/Tokyo
Asia/Tokyo      : 2026-05-17T19:45:34.682493896+09:00[Asia/Tokyo]
America/New_York: 2026-05-17T06:45:34.68249707-04:00[America/New_York]
plainDateISO    : 2026-05-17
plainTimeISO    : 19:45:34.682677002
timeZoneId()    : Asia/Tokyo
```

`instant()` はナノ秒精度の UTC タイムスタンプです。`epochNanoseconds` は **BigInt** で返ります。ナノ秒の値は `Number` の安全整数の範囲を超えるので、整数値で精度を保つために `BigInt` になります。

「いま Tokyo は何日？」は `plainDateISO("Asia/Tokyo")` のように粒度とタイムゾーンを引数で明示します。`Date` で同じことをするには `toLocaleString` の出力を文字列パースする必要があり、明示的なAPIが用意されている分 Temporal の方が安全です。

### Temporal.Instant — UTC 基準の「瞬間」

`Instant` は「いつ」を絶対的に指す値です。タイムゾーンも暦も持たず、エポックからのナノ秒数だけで定義されます。サーバ間のタイムスタンプ同期、ログのイベント順序、外部APIの `created_at` のような「機械間の時刻」はこのクラスが第一候補です。

```js
const fromString = Temporal.Instant.from("2026-05-17T10:00:00Z");
const fromMs = Temporal.Instant.fromEpochMilliseconds(1_779_012_000_000);
const fromNs = Temporal.Instant.fromEpochNanoseconds(1_779_012_000_000_000_000n);
console.log("from string :", fromString.toString());
console.log("from ms     :", fromMs.toString());
console.log("from ns     :", fromNs.toString());
```

```console
from string : 2026-05-17T10:00:00Z
from ms     : 2026-05-17T10:00:00Z
from ns     : 2026-05-17T10:00:00Z
```

値が書き換わらないことを確認します。

```js
const t0 = Temporal.Instant.from("2026-05-17T10:00:00Z");
const t1 = t0.add({ hours: 3, minutes: 15 });
console.log("t0:", t0.toString(), "← 元は変わらない");
console.log("t1:", t1.toString(), "← 3時間15分後");
```

```console
t0: 2026-05-17T10:00:00Z ← 元は変わらない
t1: 2026-05-17T13:15:00Z ← 3時間15分後
```

`Date.prototype.setUTCMonth` のような「自身を書き換えるメソッド」は Temporal には一切ありません。すべての変更操作が新しいインスタンスを返します。

差分は `until` / `since` で取れます。

```js
const a = Temporal.Instant.from("2026-05-17T10:00:00Z");
const b = Temporal.Instant.from("2026-05-18T11:30:00Z");
console.log("a.until(b)               :", a.until(b).toString());
console.log("largestUnit:'hour' で整形:", a.until(b, { largestUnit: "hour" }).toString());
```

```console
a.until(b)               : PT91800S
largestUnit:'hour' で整形: PT25H30M
```

デフォルトでは秒単位の Duration（`PT91800S`）として返ります。「25時間30分」のように上位の単位まで繰り上げたい場合は `largestUnit` を指定します。秒からの繰り上がりは暦法やタイムゾーンに依存しないため、デフォルトで日や月までは繰り上げません（日や月の長さはタイムゾーンと暦法で変わるため）。

### PlainDate / PlainTime / PlainDateTime — タイムゾーンも暦も持たない、日付・時刻だけの型

`Date` は UTC タイムスタンプと、年月日時分秒の成分の両方を1つのオブジェクトに詰めていました。Temporal はそれを分離します。

```js
const birthday = Temporal.PlainDate.from("2000-04-12");
console.log("birthday    :", birthday.toString());
console.log("dayOfWeek   :", birthday.dayOfWeek);
console.log("daysInMonth :", birthday.daysInMonth);
console.log("inLeapYear  :", birthday.inLeapYear);
```

```console
birthday    : 2000-04-12
dayOfWeek   : 3
daysInMonth : 30
inLeapYear  : true
```

`PlainDate` は **時刻もタイムゾーンも持たない日付** です。誕生日、契約日、休日表のような「壁掛けカレンダーに丸を付ける」種類の値はこれで表現します。

存在しない日付を入れた場合の挙動も `Date` とは異なります。

```js
try {
  Temporal.PlainDate.from("2026-02-30");
} catch (e) {
  console.log("error:", e.message);
}
```

```console
error: Temporal error: Parsed day value not in a valid range.
```

`Date` が黙って `3/2` にしていたところを、`Temporal` は例外で弾きます。同じ考え方が時刻にも適用されていて、`PlainTime.from("25:00")` も例外を投げます。

時刻だけ・日時だけ用の型も揃っています。

```js
const alarm = Temporal.PlainTime.from("08:00");
console.log("alarm        :", alarm.toString());
console.log("hour         :", alarm.hour);
console.log("+ 90 minutes:", alarm.add({ minutes: 90 }).toString());

const meeting = Temporal.PlainDateTime.from("2026-05-17T15:30");
console.log("meeting        :", meeting.toString());
console.log("+ 2 hours      :", meeting.add({ hours: 2 }).toString());
console.log("with year=2030 :", meeting.with({ year: 2030 }).toString());
```

```console
alarm        : 08:00:00
hour         : 8
+ 90 minutes: 09:30:00
meeting        : 2026-05-17T15:30:00
+ 2 hours      : 2026-05-17T17:30:00
with year=2030 : 2030-05-17T15:30:00
```

`with` メソッドは「一部のフィールドだけ差し替えた新しいインスタンスを返す」操作です。

さらに細かい単位として `PlainYearMonth`（クレジットカード有効期限）と `PlainMonthDay`（毎年同じ月日、たとえば祝日）も別クラスとして用意されています。

```js
const cardExpiry = Temporal.PlainYearMonth.from("2030-12");
const christmas = Temporal.PlainMonthDay.from("--12-25");
console.log("PlainYearMonth :", cardExpiry.toString());
console.log("PlainMonthDay  :", christmas.toString());
```

```console
PlainYearMonth : 2030-12
PlainMonthDay  : 12-25
```

「年」を持たない月日のための型が独立しているので、誕生日の月日のように 2/29 を扱えるかどうかを別の型として区別したい場面でそのまま使えます。

### ZonedDateTime — タイムゾーン込みの日時、DST も扱える

`ZonedDateTime` はタイムゾーン情報を値の一部として持つ型です。

```js
const inst = Temporal.Instant.from("2026-05-17T10:00:00Z");
console.log("UTC             :", inst.toString());
console.log("Asia/Tokyo      :", inst.toZonedDateTimeISO("Asia/Tokyo").toPlainDateTime().toString());
console.log("Europe/London   :", inst.toZonedDateTimeISO("Europe/London").toPlainDateTime().toString());
console.log("America/New_York:", inst.toZonedDateTimeISO("America/New_York").toPlainDateTime().toString());
```

```console
UTC             : 2026-05-17T10:00:00Z
Asia/Tokyo      : 2026-05-17T19:00:00
Europe/London   : 2026-05-17T11:00:00
America/New_York: 2026-05-17T06:00:00
```

同じ `Instant`（絶対的な瞬間）を、タイムゾーンを通して「各タイムゾーンでの日時」に変換しています。逆に、各タイムゾーンの日時から `Instant` への変換も同じように用意されています。

`Date` だと自前で実装する必要があった DST（夏時間）の扱いも、Temporal は仕様として明示的に扱います。米ニューヨークは毎年3月の第2日曜に時計が午前2時から午前3時へ切り替わるため、「2026-03-08 02:30 アメリカ東部時間」という時刻は **存在しません**。

```js
const dst = Temporal.ZonedDateTime.from("2026-03-08T02:30[America/New_York]");
console.log("入力 2026-03-08T02:30 [America/New_York]");
console.log("→ 実際の時刻       :", dst.toString());
console.log("→ オフセット        :", dst.offset);
```

```console
入力 2026-03-08T02:30 [America/New_York]
→ 実際の時刻       : 2026-03-08T03:30:00-04:00[America/New_York]
→ オフセット        : -04:00
```

存在しない時刻の入力に対し、Temporal はデフォルトで「DST 後のオフセットを採用する」動作で 03:30 に補正します。`disambiguation: 'reject'` を渡せば例外にすることもでき、ユーザー入力のバリデーションに使えます。

DST の境目をまたぐ場合、「1日 = 24時間」が成立しません。Temporal はこれをそのまま計算結果に反映します。

```js
const before = Temporal.ZonedDateTime.from("2026-03-07T12:00[America/New_York]");
const after = before.add({ days: 1 });
console.log("3/7 12:00 + 1 day :", after.toString());
console.log("実経過時間         :", before.until(after, { largestUnit: "hour" }).toString());
```

```console
3/7 12:00 + 1 day : 2026-03-08T12:00:00-04:00[America/New_York]
実経過時間         : PT23H
```

`add({ days: 1 })` の結果はカレンダー上で 12:00 → 12:00 で1日後ですが、実経過時間は **23時間**です。Temporal は `days` と `hours` を意図的に区別していて、`days: 1` は「カレンダー上の1日先」、`hours: 24` は「実際に経過する時間で24時間後」と別物として扱います。

`withTimeZone` と `toPlainDateTime().toZonedDateTime(zone)` の使い分けもあります。前者は「同じ瞬間を別タイムゾーンで表示する」、後者は「日時の数字を維持したまま別タイムゾーンに置き換える」操作です。

```js
const tokyo9 = Temporal.ZonedDateTime.from("2026-05-17T09:00[Asia/Tokyo]");
const sameInstantInNY = tokyo9.withTimeZone("America/New_York");
console.log("Tokyo 09:00 = NY:", sameInstantInNY.toString());

const ny9 = tokyo9.toPlainDateTime().toZonedDateTime("America/New_York");
console.log("NY も 09:00:", ny9.toString());
```

```console
Tokyo 09:00 = NY: 2026-05-16T20:00:00-04:00[America/New_York]
NY も 09:00: 2026-05-17T09:00:00-04:00[America/New_York]
```

「東京の朝9時と同じ瞬間、ニューヨークは何時？」と「東京の朝9時に開催する会議をニューヨーク現地時間で朝9時開催に置き換えたい」は別の操作です。Temporal はこの2つを別メソッドに分けて、書き手にどちらの意味かを選ばせます。

### Duration — 期間と差分、丸めまで仕様に含まれる

`Duration` は「期間」を表す独立した値です。

```js
const dur = Temporal.Duration.from({ minutes: 130, seconds: 45 });
console.log("dur                          :", dur.toString());
console.log("round({ largestUnit: 'hour'}):", dur.round({ largestUnit: "hour" }).toString());
console.log("round({ smallestUnit:'min'}):", dur.round({ smallestUnit: "minute" }).toString());
```

```console
dur                          : PT130M45S
round({ largestUnit: 'hour'}): PT2H10M45S
round({ smallestUnit:'min'}): PT131M
```

`round` で粒度を上げ下げするAPIが揃っています。`ZonedDateTime` と組み合わせるとカレンダー対応の加算ができ、`Date` の `setMonth` が `1/31 + 1ヶ月` で `3/3` になっていた問題は、Temporal だと月末は月末に丸められます。

```js
const start = Temporal.ZonedDateTime.from("2026-01-31T10:00[Asia/Tokyo]");
console.log("1/31 + 1 month:", start.add({ months: 1 }).toString());
```

```console
1/31 + 1 month: 2026-02-28T10:00:00+09:00[Asia/Tokyo]
```

「1月31日の1ヶ月後」を「2月の最終日（28日または29日）」として解釈します。

## Date の問題と Temporal の対応関係

| Date の問題 | Temporal の対応 |
|---|---|
| すべてのセッターがミュータブル | すべての変更操作が新しいインスタンスを返す（イミュータブル） |
| 同じ Date で UTC とローカルで違う時刻が返る | `Instant`（UTC の瞬間）と `ZonedDateTime` / `PlainDateTime`（タイムゾーン付き／暦上の日時）で型から分離 |
| タイムゾーンは UTC とローカルのみ | `ZonedDateTime` がタイムゾーンを値の一部として持つ |
| グレゴリオ暦以外を扱えない | `withCalendar("japanese")` などで和暦・ヘブライ暦・中国暦に切り替え可能 |
| 日時文字列の解釈が一貫しない | 各クラスの `from()` が厳格にパース。不正な値は例外で弾く |

## ユースケース別: 何にどのクラスを使うか

| やりたいこと | 適切なクラス | 理由 |
|---|---|---|
| サーバ間タイムスタンプ、ログのイベント順序 | `Temporal.Instant` | UTC ナノ秒、タイムゾーン不要 |
| 「Tokyo で毎週月曜9:00 開催」のスケジュール | `Temporal.ZonedDateTime` | DST やオフセットを正しく扱う |
| 「毎朝8時のアラーム」 | `Temporal.PlainTime` | 日付・タイムゾーン情報を持たない |
| 誕生日（月日のみ、年なし） | `Temporal.PlainMonthDay` | 2/29 などを型で区別できる |
| 契約日、休日表、請求書日付 | `Temporal.PlainDate` | 時刻情報が混入しない |
| クレジットカード有効期限 | `Temporal.PlainYearMonth` | 月単位で十分 |
| 「2時間30分」「3営業日」のような期間 | `Temporal.Duration` | カレンダー対応の加算と丸めができる |
| ローカルでの会議予約フォーム | `Temporal.PlainDateTime` | ユーザー入力の時点ではゾーン未確定 |

## まとめ

- Node.js v26 で `Temporal` がフラグなしで利用可能になり、サーバサイドJSでは標準APIとして使える段階になった
- MDN が挙げる `Date` の設計上の問題（ミュータブル・役割の混在・タイムゾーンの制限・暦法の制限・パース不一貫）は、Temporal の役割分離・イミュータブル設計でそれぞれ対応している
- 実用範囲は `Now` / `Instant` / `PlainDate` 系 / `ZonedDateTime` / `Duration` の5系統でカバーできる
- ブラウザ側は Safari が未対応のため、フロントエンドで全面採用するなら `@js-temporal/polyfill` か `temporal-polyfill` の併用が現実的
- 新規プロジェクトは Temporal で書き始められる段階。既存コードの移行は `Date` を `Instant`（UTC）か `ZonedDateTime`（タイムゾーン込み）のどちらに置き換えるかの判断を起点に進められる

## 参考

- MDN: [Temporal](https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
- Publickey: [Node.js 26、Temporal がデフォルトで有効に。日付や時刻を扱う「Temporal」がChrome、Edge、Firefox、Node.jsで利用可能に](https://www.publickey1.jp/blog/26/nodejsdatetemporaltemporalchromeedgefirefoxnodejs.html)
- TC39: [Temporal proposal](https://tc39.es/proposal-temporal/docs/)
- ポリフィル: [@js-temporal/polyfill](https://www.npmjs.com/package/@js-temporal/polyfill) / [temporal-polyfill](https://www.npmjs.com/package/temporal-polyfill)
- サンプルコード: [temporal-node26-playground](https://github.com/yamazaki-yuki-23/temporal-node26-playground)

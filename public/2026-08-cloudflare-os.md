---
title: Cloudflare OS入門｜実際に触りながらGadgetとセキュリティの仕組みを理解する
tags:
  - cloudflare
  - CloudflareWorkers
  - AI
  - Security
private: false
updated_at: '2026-08-14T15:09:06+09:00'
id: 037dddc0c4ca79e26156
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---

2026年8月10日、Cloudflareから「Cloudflare OS」がオープンソースとして公開されました。

「CloudflareがOSを作った」と聞くと、WindowsやmacOSのようなものを想像するかもしれませんが、Cloudflare OSはPCを動かすためのOSではありません。

Cloudflareの公式ブログでは、会社の知識やシステムを利用できるAIエージェントと、その作業環境を提供するプラットフォームとして紹介されています。

AIとの会話に加え、資料作成やデータ調査、アプリの作成まで行えます。Cloudflareでは、エンジニア以外を含む数千人の社員が日常的に利用していると説明されています。

筆者はこれまでCloudflareをほとんど触ったことがありません。Cloudflare OSをきっかけに周辺技術も学ぶため、本記事をまとめました。

公式ブログやGitHubリポジトリを調べ、実際にCloudflare OSをローカルで触りながら、自分なりに理解した内容を整理しています。

主に次の内容を見ていきます。

- Cloudflare OSはなぜ作られたのか
- AIが作るアプリ「Gadget」とは何か
- なぜ「OS」と呼ばれているのか
- Durable ObjectsやDynamic Workersがどこで使われているのか
- AIやGadgetから業務で使う外部リソースへのアクセスをどう制御しているのか

Cloudflare Workersに詳しくなくても読めるように、細かな仕様よりも「何のために使われている技術なのか」を中心に整理します。

## なぜCloudflare OSは作られたのか

Cloudflare OSは、AIを一部の開発者だけでなく、会社全体の仕事で活用するために作られました。

会社にはそれぞれ、独自の用語や業務手順、社内に蓄積された知識があります。また、GitHubやGoogle Driveなど、日々の仕事で利用するシステムもあります。

Cloudflareの公式ブログでは、AIエージェントを会社全体の業務で活用するには、こうした会社固有の事情や知識を理解し、社員が利用しているシステムへアクセスできる必要があると説明されています。

Cloudflareは、そのための会社専用のAIエージェントと作業環境としてCloudflare OSを開発しました。2026年5月には最初のバージョンを全社員が利用できるようにし、その後、数千人の社員が日常的に利用するようになったとされています。

一方、実際の社内利用を通じて課題も見えてきました。

最初のバージョンには、いくつか課題があったと説明されています。作成したアプリを社内システムとリアルタイムで連携できないことや、定型作業のたびにAIエージェントを動かす必要があることです。

さらに、成果物の共有では、AIが「どのツールを使えるか」だけでなく、**そのツールを通じて「どの情報まで見てよいのか」も管理する必要がありました**。

例えば、ある社員が閲覧できる社内データを使ってAIにダッシュボードを作らせたとします。そのダッシュボードを別の社員へ共有したとき、元のデータを見る権限がない社員まで情報を見られてしまっては問題です。

Cloudflareは、こうした課題を踏まえてCloudflare OSを新しい基盤の上に作り直しました。公式ブログでは、セキュリティを利用者任せにせず、プラットフォーム自体に組み込む必要があったと説明されています。

この背景を知ると、後ほど紹介するGatekeeperなどの仕組みが、なぜ必要なのか理解しやすくなります。

## Cloudflare OSとは

Cloudflare OSは、Cloudflareが社内向けに開発してきたAI作業環境をオープンソース化したものです。

通常のAIチャットでは、次のようなやり取りが中心です。

```text
質問する
↓
AIが回答する
```

Cloudflare OSでは、会話だけでなく、作業そのものを進められるように設計されています。

```text
ユーザー
   ↓
Cloudflare OS
   ↓
AIエージェント
   ├─ 情報を調べる
   ├─ 資料を作る
   ├─ データを分析する
   ├─ アプリを作る
   └─ 許可された外部リソースを利用する
```

公式ブログでは、Cloudflare OSを大きく次の3つの要素で説明しています。

- 会社の知識やスキルを利用できるAIエージェントの作業環境
- 社内データやサービスへ安全にアクセスするための仕組み
- 社員が作成・共有・変更できる個人向けアプリの仕組み

単にAIへ質問する場所ではなく、**AIと一緒に仕事を進めるための作業環境**として捉えると分かりやすいです。

## Cloudflare OSを実際に動かしてみる

Cloudflare OSはGitHubで公開されており、ローカル環境でも試せます。

まずリポジトリを取得します。

```bash
git clone https://github.com/cloudflare/cloudflare-os.git
cd cloudflare-os
```

`pnpm`を利用できる状態にしたうえで、次のコマンドを実行します。

```bash
pnpm run-local
```

起動したら、ブラウザから次のURLへアクセスします。

```text
http://localhost:8787
```

記事執筆時点のGitHub READMEでは、Cloudflare OS v2はEarly Accessと案内されています。今後、画面やセットアップ手順は変更される可能性があります。

### AIモデルを設定する

初回セットアップでは、Cloudflare OSから利用するAIモデルを設定します。

記事執筆時点の実装を確認したところ、Anthropic、OpenAI、Google、Cloudflare Workers AI、Ollamaを選択できるようになっていました。

![Cloudflare OSの初回セットアップでAIモデルを追加する画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-cloudflare-os/ai-model-setup.png)

モデルを設定したあと、ホーム画面の入力欄から次のように依頼してみました。

```text
三目並べを作って
```

これはCloudflare OSのREADMEでも紹介されているサンプルです。

![Cloudflare OSの入力欄に「三目並べを作って」と入力した画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-cloudflare-os/tic-tac-toe-prompt.png)

しばらくすると、AIがコードを作成し、実際に操作できるアプリが表示されました。

![Cloudflare OSが生成した三目並べGadgetを操作できる画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-cloudflare-os/tic-tac-toe-gadget.png)

「Code」タブへ切り替えると、作成されたアプリのREADMEやコードも確認できます。

![三目並べGadgetの「Code」タブでREADMEとコードファイルを確認している画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-08-cloudflare-os/tic-tac-toe-code.png)

一般的なAIチャットでは、コードを生成してもらったあと、自分で開発環境へ移して動かすケースもあります。

Cloudflare OSでは、今回試した範囲では次の流れを一つの環境で行えました。

```text
AIにアプリの作成を依頼する
↓
AIがコードを作る
↓
アプリとして動かす
↓
そのまま操作する
```

さらに、作成したアプリに対して、例えば次のように修正を依頼できます。

```text
盤面をもう少し大きくして
```

## AIが作るアプリ「Gadget」

先ほど作成した三目並べのようなアプリは、Cloudflare OSでは**Gadget**と呼ばれています。

公式ブログによると、Gadgetには主に次の2種類のコードがあります。

- ブラウザ上で画面を表示するクライアントコード
- データの保存やアプリの処理を担当するサーバーコード

つまり、画面だけでなく、サーバー側の処理やデータ保存まで含むアプリです。

### Gadgetは利用者ごとに作れる

Cloudflare OSでは、必要なアプリをAIに依頼して、その場で作れます。作成したGadgetは、そのまま利用するだけでなく、あとからAIに修正を依頼できます。

```text
「盤面をもっと大きくして」
「タスクに期限を設定できるようにして」
```

GitHubのREADMEでは、各ユーザーが自分用のGadgetを持ち、必要に応じてAIで変更していく考え方が説明されています。

既存のアプリを全員で同じ形のまま使うだけでなく、**必要なアプリを自分用に作り、使いながら変更していける**のが特徴の一つだと理解しました。

## Workspaceとは

**Workspaceは、AIエージェントと作業を進める単位です。**

公式ブログでは、Workspaceには次のようなものがまとめられていると説明されています。

- AIエージェントとの会話
- 作業中の状態
- 出力されたファイル
- 利用を許可したリソースへのアクセス
- AIがコードを書いたり実行したりするための隔離された環境

ここでいう「外部リソース」は、GitHubそのものがWorkspaceの中に置かれるという意味ではありません。

例えばGitHubと連携しても、AIエージェントやGadgetがGitHub全体を利用できるわけではありません。必要なリポジトリなどを明示的に許可して利用します。

## Blueprintとは

Gadgetは、アプリそのものを共有する方法と、**Blueprint（設計図）**として共有する方法があります。

アプリそのものを共有した場合は、他のユーザーと同じ状態を共有しながら共同で利用できます。

```text
Gadgetを共有
↓
同じアプリと状態を共同で利用する
```

Blueprintを共有した場合は、受け取った人がアプリの複製を作れます。

```text
Blueprintを共有
↓
アプリのコードをもとに複製する
↓
利用者ごとのGadgetとして使う
```

公式ブログでは、Blueprintから引き継がれるのは元のGadgetのコードだけと説明されています。SQLiteデータベースの内容、会話履歴、資格情報、接続済みのリソースは引き継がれません。

同じBlueprintから作ったGadgetでも、それぞれ独立したデータや設定を持ち、AIで自分向けに変更できます。

## なぜ「Cloudflare OS」なのか

Cloudflare OSのREADMEでは、一般的なOSとCloudflare OSの構成を対応させています。本記事に関係する部分を抜粋すると、次のとおりです。

| 一般的なOS | Cloudflare OS |
| --- | --- |
| Kernel | `packages/workshop-backend` |
| Device Driver | `packages/gatekeeper-*` |
| Shell | `packages/workshop-frontend` |
| Process | Gadget |
| Executable | Blueprint |
| User | User |

通常のOSは、アプリケーションとCPU・メモリ・デバイスなどの間に入り、それらを利用するための基盤になります。

Cloudflare OSでは、`workshop-backend`がGadgetやGatekeeperとユーザーをつなぎ、アプリを隔離して実行したり、アクセス権を管理したりします。

そのためREADMEでは、Cloudflare OSを単なる製品名としての「OS」ではなく、技術的にも通常のOSと似た役割を持つものとして説明しています。

## Gadgetの裏側では何が動いている？

ここからは、Gadgetを動かすために使われているCloudflare Workersの技術を見ていきます。

今回の記事では、Cloudflare OSの仕組みを理解するために特に重要な次の3つに絞ります。

- Durable Objects
- Dynamic Workers
- Durable Object Facets

### Durable Objects：Workspaceの状態を持つ

**Durable Objectsは、処理と永続的なストレージを組み合わせて、状態を持つアプリを作るためのCloudflareの仕組みです。**

通常のCloudflare Workersでは、前回の処理で使ったデータをメモリ上に残しておくことを前提としていません。

一方、Workspaceでは、会話や作業の状態などを保持する必要があります。

Cloudflare OSのREADMEでは、各Workspaceは1つのDurable Objectとして実装されていると説明されています。

### Dynamic Workers：実行時に作られたコードを動かす

**Dynamic Workersは、実行時に渡されたコードを、独立したWorkerとして読み込んで実行する仕組みです。**

通常のCloudflare Workersでは、開発者がコードを用意してデプロイします。

Cloudflare OSでは、Gadgetの作成を依頼したあとにAIがコードを作るため、事前にデプロイされていなかったコードを実行する必要があります。GadgetのサーバーコードはDynamic Workerとして読み込まれます。

Dynamic Workersでは、読み込んだコードが利用できる外部リソースやネットワークアクセスも制御できます。そのため、AIが作ったコードを他の処理から分離して動かす用途にも使われています。

### Durable Object Facets：Gadgetごとのデータを分離する

**Durable Object Facetsは、Dynamic Workerで読み込んだコードをDurable Objectの子として動かし、Facetごとに独立したSQLiteデータベースを持たせる仕組みです。**

Cloudflare OSでは、GadgetのサーバーコードをDynamic Workerとして読み込み、Durable Object Facetとして実行すると説明されています。

そのため、各GadgetはCloudflare OS本体とは分離されたSQLiteデータベースを持てます。

```text
Workspace（Durable Object）
 ├─ Gadget A（Durable Object Facet）
 │    └─ Gadget A専用のSQLite
 │
 └─ Gadget B（Durable Object Facet）
      └─ Gadget B専用のSQLite
```

ここまでを整理すると、本記事では次のように理解しました。

- Durable Objects：Workspaceごとの状態を管理する基盤
- Dynamic Workers：AIが作ったGadgetのサーバーコードを実行時に読み込む
- Durable Object Facets：GadgetをWorkspaceの中で動かし、GadgetごとのSQLiteを分離する

## AIやGadgetは外部リソースへどう安全にアクセスするのか

AIエージェントから社内システムを利用できると便利です。ただ、社内利用では、接続の可否だけでなく、アクセス範囲の制御も重要です。

例えばGitHubなら、「GitHubを使える」という大きな権限ではなく、次のように利用できる範囲を細かく管理する必要があります。

```text
GitHub
└─ 特定のリポジトリだけ許可
    ├─ Issueの読み取りは許可
    ├─ ソースコードの読み取りは禁止
    └─ Pull Requestのマージには承認が必要
```

これはCloudflareの公式ブログでもGatekeeperの例として紹介されています。

### AIエージェントやGadgetはアクセス権を持たない状態から始まる

利用したいリソースへのアクセスを明示的に許可し、その権限だけをAIエージェントやGadgetへ渡します。また、Gadgetのサーバーコードは外部ネットワークへの通信を無効化したDynamic Worker上で実行され、許可された経路を通じて外部リソースを利用します。

つまり、Cloudflare OSへGitHubアカウントを接続しただけで、すべてのAIエージェントやGadgetがGitHub全体を利用できるわけではありません。

### 外部サービスとの間に入る「Gatekeeper」

**Gatekeeperは、Cloudflare OSとGitHubやGoogleなどの外部サービスの間に入る、サービスごとのWorkerです。**

```text
AIエージェント / Gadget
        │
        │ 許可された操作
        ▼
    Gatekeeper
        │
        ▼
 GitHub / Googleなど
```

公式ブログでは、Gatekeeperが主に次の役割を担うと説明されています。

- OAuthなどの認証処理
- 認証情報の管理
- 利用できるリソースや操作の制限
- 読み取ったデータの記録
- データ更新など、外部サービスの状態を変える操作での承認

さらにCloudflare OSでは、AIエージェントが参照したリソースも記録します。

例えば、AIエージェントが機密データを使って成果物を作った場合、別のユーザーがその成果物を見るときにも、元のデータへのアクセス権をGatekeeperが確認すると説明されています。

単に「AIへAPIキーを渡さない」というだけではなく、**AIがどのデータを参照したのかまで追跡し、その後の共有や操作にもアクセスルールを適用する**ところまで考えられているのが印象的でした。

## 全体像を整理する

ここまでの関係を、この記事で扱った範囲に絞って整理すると次のようになります。

```text
                         ユーザー
                            │
                            ▼
                       Workspace
                    （Durable Object）
                     ┌──────┴──────┐
                     │             │
                     ▼             ▼
                 AIエージェント        Gadget
                                   │
                            Dynamic Worker
                                   │
                        Durable Object Facet
                                   │
                             専用SQLite

                 AIエージェント / Gadget
                         │
                         │ 許可されたリソースへアクセス
                         ▼
                     Gatekeeper
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
            GitHub     Google      Slack
```

実行環境、保存するデータ、外部サービスへのアクセスを分け、AIエージェントやGadgetへ必要な権限だけを渡す設計になっています。

## Cloudflare OSを触って印象に残ったところ

今回Cloudflare OSを触って最初に驚いたのは、AIにアプリを作ってもらい、その場で動かして修正までできることでした。

一方、仕組みを調べて特に印象に残ったのは、**社内利用を前提としたセキュリティ設計**です。

会社の業務基盤として利用するなら、「どのAIが、どのデータへ、どこまでアクセスできるのか」を管理する必要があります。Cloudflare OSは、AIで何ができるかだけでなく、**AIを会社の中で安全に使うための権限やデータの扱い**まで考えられている点が、個人的には特に興味深く感じました。

## まとめ

Cloudflare OSを実際に触り、公式情報を調べながら仕組みを追いました。

アプリをその場で作って使えるだけでなく、社内利用を前提にアクセス制御やデータの扱いまで設計されていることが分かりました。

主な概念をまとめると次のとおりです。

| 名前 | 本記事での理解 |
| --- | --- |
| Workspace | AIエージェントと作業する単位。各WorkspaceはDurable Objectとして実装される |
| Gadget | AIが作成し、利用しながら変更できるアプリ |
| Blueprint | Gadgetのコードをもとに、独立したGadgetを作るための設計図 |
| Durable Objects | Workspaceごとの状態を管理する基盤 |
| Dynamic Workers | Gadgetのサーバーコードを実行時に読み込む仕組み |
| Durable Object Facets | Gadgetを実行し、GadgetごとのSQLiteを分離する仕組み |
| Gatekeeper | 外部サービスへのアクセス権や操作を管理するWorker |

Cloudflare OSを入り口に、Durable ObjectsやDynamic Workersがどのような場面で使われるのかも理解を深められました。

## 参考資料

- [Cloudflare OS：エージェント、アプリ、作業のためのオープンプラットフォーム](https://blog.cloudflare.com/ja-jp/cloudflare-os/)
- [cloudflare/cloudflare-os](https://github.com/cloudflare/cloudflare-os)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)
- [Durable Object Facets](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/)

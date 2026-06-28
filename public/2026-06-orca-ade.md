---
title: 【Claude Code】AIエージェントを並列実行できるADE「Orca」を試した
tags:
  - ClaudeCode
  - AIエージェント
  - AI
  - 開発環境
  - git
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
---

**TL;DR**

- Orcaは「ADE（Agent Development Environment）」というカテゴリを名乗るOSSのデスクトップアプリで、複数のAIコーディングエージェントを独立したgit worktreeで並列実行できる
- IDEとの最大の違いは、複数エージェントの並列実行と比較、統合を前提に設計されている点にある。Claude Code、Codex、Geminiなど25以上のCLIエージェントをサポートする
- Design Modeでは内蔵ChromiumのUI要素をクリックするとHTML、CSS、スクリーンショットが自動でエージェントに渡される。UIのバグ修正指示に言葉が要らなくなる
- MITライセンスのフルOSSで無料。macOS / Windows / Linux 対応、iOS/Androidのモバイルアプリもある

---

## はじめに

Claude Codeを日常的に使い始めると、気づくとターミナルのタブが増えていく。

「ユーザー認証の修正」「テストの追加」「ドキュメント更新」など複数のタスクをClaude Codeで並列に回そうとすると、どうしても同一ブランチで競合が起きる。慌ててスタッシュを挟んだり、ブランチを切り直したりと、エージェントの並走を支えるために人間が調整作業をする逆転現象が起きていた。

こういう使い方をしているなら git worktree を使えばいい、というのは頭ではわかっている。ただ worktree の作成、切り替え、削除を手動で管理しながら複数エージェントを走らせ続けるのは、CLIだけでは思ったより煩雑だ。

そこで見つけたのが Orca だ。

## 本記事の問い

> 「複数のAIエージェントを並列で走らせる」という使い方は、実際に開発効率を上げるのか

Orcaは "Ship 100x" を掲げるが、本当にそういった体験があるのかをインストールして確かめた。並列実行の仕組み、Design Mode、気になった点について実際に動かした記録をまとめる。

## Orcaとは

Orcaは、YCombinator出資のStably.aiが開発しているデスクトップアプリだ。

https://www.onorca.dev/

カテゴリとして「ADE（Agent Development Environment）」を名乗っており、IDEとは異なる設計思想を持つ。GitHubリポジトリは8,000スター超（2026年6月時点）、リリース数は660を超えており開発が活発に続いている。

https://github.com/stablyai/orca

## IDEとADEは何が違うのか

IDEは人間が手を動かすことを中心に設計された環境だ。エディタ、デバッガ、ターミナルはすべて「人間がコードを書くための道具」として配置されている。

Orcaが「ADE」と呼ぶのは、エージェントが実行することを中心に設計された環境のことだ。開発者はタスクを指示して複数のエージェントを走らせ、結果を比較して良いものを選ぶ。

公式サイトにはこう書かれている。

> Fan one prompt across 5 agents, compare, merge the winner.

この発想はClaude Codeでも手動でできなくはない。しかしworktreeの分離、ブランチ管理、差分の確認まで含めると、人間側の運用コストが膨らんでエージェントを並列化する意味が薄れる。Orcaはその運用部分をUIとして提供する。

## インストールと起動

macOSの場合、公式サイトからdmgをダウンロードしてインストールするだけだ。Apple SiliconとIntelそれぞれのビルドが用意されており、追加の設定なしで起動できた。

起動直後、対応エージェント（Claude Code、Codex、OpenCodeなど）が自動検出される。gitリポジトリを開くとワークツリー管理の画面が現れる。見た目はデスクトップIDEに近く、左ペインにワークツリーの一覧、右にターミナルとエディタが並ぶ構成だ。

## 並列ワークツリーの仕組み

Orcaの根幹がここだ。

`git worktree` コマンドを使ったことがある人はわかるが、同一リポジトリを複数の独立したディレクトリに展開できる。それぞれ別ブランチを持つため、別ディレクトリで作業しているエージェント同士がファイルを競合させることはない。

Orcaはワークツリーの作成、削除、エージェント起動をUIから操作できる。

![Orcaのメイン画面。左ペインに複数のワークツリーが一覧表示され、それぞれのエージェントの実行状態が確認できる](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-06-orca-ade/main-ui.jpg)

ワークフローはこうなる。

1. 新しいworktreeを作成する（ブランチ名を決める）
2. そのworktreeでエージェントを起動してタスクを投げる
3. 別のworktreeを作成して別タスクを並行して走らせる
4. 完了したworktreeのdiffをOrcaのUI上で確認する
5. 問題なければメインブランチにマージする

手動でworktreeを使っていたときと比べて、「今どのworktreeが何の状態にあるか」が一覧で見えることが実際に便利だった。タスクが増えると、人間が状態管理のために使う認知リソースが地味に大きくなる。それをUIが引き受けてくれる。

## Design Mode

各worktreeには独立したChromiumウィンドウが紐付けられている。開発中のUIをブラウザで見ながらエージェントに指示を出せる。

Design Modeでは、Chromium上の任意のUI要素をクリックすると、そのHTML、CSS、クロップされたスクリーンショットが自動でエージェントのプロンプトに送信される。

![Design Modeの画面。内蔵ChromiumでUIを表示しながら、要素をクリックするとエージェントへの入力が自動で生成される](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-06-orca-ade/design-mode.jpg)

```
通常の依頼:
「ヘッダーのロゴが数ピクセル右にズレている。修正してほしい」

Design Modeを使った依頼:
（該当要素をクリックするだけ）
```

言葉で伝えにくい位置ズレやマージン崩れは、スクリーンショットと要素のHTMLを両方渡すことでエージェントが構造を把握しやすくなる。UIのバグ修正指示でこの機能が一番効いた。

## GitHubとLinearの統合

GitHubとLinearにネイティブ対応しており、PRやIssue、プロジェクトボードをOrcaの中で確認できる。

Claude Codeを使っていると「issueを確認してブランチを切る → エージェントに実装を依頼する」という繰り返しが生まれるが、ブラウザとターミナルを往復する手間がなくなる。

## 差分レビューとマージ

worktreeの実装が終わったあと、Orca上でdiffに対してMarkdownコメントを付与できる。コメントをバッチでエージェントに返送することで、追加修正のやり取りが一箇所で完結する。

複数のエージェントに同じタスクを投げて結果を比べる場合も、このdiffビューで横並び確認ができる。

![差分レビュー画面。diffに対してMarkdownコメントを付与し、バッチでエージェントに返送できる](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-06-orca-ade/diff-review.jpg)

## 対応エージェント

Claude Code、Codex、Gemini、Cursor CLI、GitHub Copilot、OpenCode、Grokなど25以上のCLIエージェントが公式サポートされている。「ターミナルで動作するCLIエージェントであれば動く」という設計のため、新しいエージェントが出てもある程度対応できる。

## 取り上げなかった機能

この記事ではSSHリモートworktreeとモバイルアプリ（iOS/Android）については触れていない。

SSHリモートworktreeはクラウド上の強力なマシンでエージェントを実行するユースケースで、ローカルとは別の話になる。モバイルアプリはリモートのエージェント実行状況をスマホで監視、操作するもので、これらはチームでOrcaを使い込む段階で意味を持ってくる機能だと判断して割愛した。

## 注意点

**まだ開発途上の機能がある**：一部の機能は「coming soon」の状態で、全機能が揃っているわけではない。

**git管理が前提**：並列worktreeのメリットを得るにはgitリポジトリが必要だ。非git環境では通常のターミナルに近い動作になる。

**node_modulesの重複**：`node_modules`はgit管理対象外のため、worktreeごとに`npm install`が必要になる。依存パッケージが多いプロジェクトでは作業開始までの準備時間が増える。

## まとめ

冒頭の問い「複数のAIエージェントを並列で走らせると実際に開発効率は上がるのか」に対して、正直に答えると「管理コストは下がる」だ。worktreeの状態把握をOrcaに任せることで、エージェントを走らせながら別のタスクに手を伸ばしやすくなる。ただし "Ship 100x" が意味する "1人で100倍の作業をこなせる" かどうかは、継続使用を経ないとわからない。

**こういう人には向く：**
- Claude Codeを複数タブで手動管理していてworktreeの切り替えが煩雑になっている
- UIの実装や修正をエージェントと一緒に回している（Design Modeが効く）
- 複数の実装案を並列で生成して比較したい

**まだ早い人：**
- AIエージェントをまだ1つのタスクに1インスタンスで使っている段階
- gitを使っていないプロジェクトが多い
- ローカルのディスクや計算資源が限られている

MITライセンスで無料のOSSなので、Claude Codeを日常使いしていて複数タスクの並列化が課題になっている人は、まず入れてみると使いどころが見えてくる。

## 参考

- [Orca 公式サイト](https://www.onorca.dev/)
- [GitHub: stablyai/orca](https://github.com/stablyai/orca)

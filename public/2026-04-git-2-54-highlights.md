---
title: 【Git 2.54】知っておきたい変更点4選：git historyで履歴編集が変わる
tags:
  - Git
  - GitHub
  - 初心者向け
private: false
updated_at: '2026-04-26T23:17:44+09:00'
id: 71c3da720bb7b717adb4
organization_url_name: null
slide: false
ignorePublish: false
---

**TL;DR**: Git 2.54では`git history`という新コマンドが追加され、コミットメッセージの修正や分割が以前より手軽になった。gitconfigにhookを書ける機能、`git add -p`の操作改善、`git status`の比較拡張も加わっている。

この記事はGit 2.54（とその直前の2.53）の変更点から、日常的なGit操作に影響する4つを取り上げる。

---

## 1. `git history`コマンドが追加された

Git 2.54では、履歴を書き換えるための新しいコマンドとして`git history`が追加された。現時点では実験的な機能で、次の2つのサブコマンドが使える。

```sh
git history reword <commit>   # コミットメッセージを変更する
git history split <commit>    # コミットを2つに分割する
```

### これまでとの違い

コミットメッセージを後から直したいとき、これまでは`git rebase -i`を使うのが一般的だった。`git rebase -i`は強力だが、エディタで操作する手順が複雑で、コンフリクトが発生すると対処が難しくなる。

`git history reword`は作業ツリーとインデックスに触れずに実行できる。コミットメッセージだけを直したいなら、stashも不要で`git rebase -i`のエディタ操作も省ける。

### 試してみた

テスト用リポジトリで実際に試した。

```sh
$ git log --oneline
7572ffa add world
8367eba first commit     ← このメッセージを直したい

$ git history reword HEAD~1
# エディタが開くのでメッセージを書き換えて保存

$ git log --oneline
10ce728 add world
436728a first commit: add README   ← 書き換わった
```

操作後に`git status`を確認すると、作業ツリーはきれいなままだった。stashを使わずに済んだことが体感できた。

```sh
$ git status
On branch master
nothing to commit, working tree clean
```

### 制限

- まだ実験的な機能
- マージコミットを含む履歴には対応していない
- コンフリクトが起きる操作は拒否される

複雑な履歴編集では引き続き`git rebase -i`を使う必要がある。

### AIコーディングツールとの相性

Claude CodeやCopilotで作業していると、コミットが `wip` や `fix` のまま積み上がりやすい。後からまとめてメッセージを整えるとき、`git rebase -i`だとエディタを開いて操作する手間がある。`git history reword`はその手順を省けるので、AIで量産したコミットの後処理に向いている。

---

## 2. hookをgitconfigに書けるようになった

Gitのhookはコミット前やpush前など、特定のタイミングで自動実行されるスクリプトだ。これまでは`.git/hooks/`配下にスクリプトを置く方法しかなく、複数のリポジトリで同じhookを使うには各リポジトリにコピーする必要があった。

Git 2.53からgitconfigにhookを書けるようになった。

```ini
[hook "linter"]
  event = pre-commit
  command = ~/bin/linter --cpp20
```

### 使いどころ

gitconfigに書けるため、次のような管理ができる。

| スコープ | ファイル | 適用範囲 |
|---|---|---|
| グローバル | `~/.gitconfig` | 自分のすべてのリポジトリ |
| システム | `/etc/gitconfig` | マシン全体 |
| ローカル | `.git/config` | 特定のリポジトリのみ |

`~/.gitconfig`に書けば、リポジトリをまたいで同じhookを使い回せる。現在のhook一覧は`git hook list`で確認できる。

### 試してみた

ローカルの`.git/config`に設定して動作を確認した。

```sh
$ git config --local hook.lint.event pre-commit
$ git config --local hook.lint.command "echo '[hook] pre-commit 発火: lintを実行中...'"

$ git hook list pre-commit
lint

$ echo "test" >> README.md && git add . && git commit -m "test"
[hook] pre-commit 発火: lintを実行中...
[master ba850f5] test
```

hookが発火していることを確認できた。既存の`.git/hooks/`方式も引き続き動作するため、すでにhookを使っているプロジェクトをすぐ変更する必要はない。

### AIコーディングツールとの相性

AIコーディングツールが普及し、`git commit`の頻度が上がっている。`~/.gitconfig`にAIレビュースクリプトをhookとして仕込めば、全リポジトリで自動的にAIのチェックを挟める。

```ini
[hook "ai-review"]
  event = pre-commit
  command = ~/bin/ai-review-staged.sh
```

ステージした差分をAIに渡してレビューさせるスクリプトを一つ用意しておけば、リポジトリごとにコピーしなくていい。ツールが増えるほど効いてくる仕組みだ。

---

## 3. `git add -p`の操作が改善された

`git add -p`は、1つのファイルの変更を部分的にステージするコマンドだ。1ファイルの中に関係のない変更が混在しているとき、「この変更だけコミットに含める」という細かい操作ができる。

### 変更点

**J/Kキーで移動したときに状態が表示されるようになった**

`J`（次の変更へ）や`K`（前の変更へ）で移動すると、その変更をすでにステージしたかスキップしたかが表示される。以前はどの変更を処理済みかを自分で把握しておく必要があった。

**`--no-auto-advance`が追加された**

ファイルの最後の変更を処理すると、自動的に次のファイルへ進む挙動がデフォルトだった。`--no-auto-advance`をつけると、最後の変更を処理したあとも自動で進まず、確認し直せる。

```sh
git add -p --no-auto-advance
```

### AIコーディングツールとの相性

AIに作業を頼むと、1回の指示で複数の変更が入ることが多い。「この機能を追加して」と頼んだら、関係ない既存コードも直されていた、という経験は珍しくない。`git add -p`でhunkを一つずつ確認することで、AIが加えた変更を把握しながらコミットを組み立てられる。J/Kキーで移動しながら「この変更は含める、あれはまだ保留」という操作が、状態表示のおかげで迷いにくくなった。

---

## 4. `git status`で比較対象を増やせるようになった

`git status`は通常、現在のブランチがupstream（取得元）に対して何コミット先行しているか、遅れているかを表示する。

Git 2.54では`status.compareBranches`を設定すると、push先のブランチとの差分も合わせて表示できる。

```ini
[status]
  compareBranches = @{upstream} @{push}
```

取得元とpush先が異なる構成、たとえばforkを使った開発で役に立つ。originからfetchしてupstreamにpushするような運用では、両方のズレを`git status`で一度に確認できる。設定1行で済む小さな変更だ。

---

## まとめ

| 変更点 | 内容 |
|---|---|
| `git history` | コミットメッセージ変更・分割が手軽に（実験的） |
| configベースhook | gitconfigにhookを書き、複数リポジトリで共有できる |
| `git add -p`改善 | J/Kキーの状態表示、`--no-auto-advance`追加 |
| `git status`拡張 | `status.compareBranches`でpush先との比較も可能 |

今回の変更を試してみて感じたのは、どれもAIを使った開発スタイルとの相性がいい点だ。AIが量産したコミットを整える`git history`、全リポジトリにAIレビューを仕込める設定ベースhook、AIの変更を仕分けする`git add -p`。Gitがアップデートされるたびに、AIとの組み合わせを考えながら使い方を見直すのが習慣になってきた。

`git history`はまだ実験的なため本番ブランチへの適用は慎重に。設定ベースのhookはすぐ試せる。

## 参考

- [Highlights from Git 2.54 - GitHub Blog](https://github.blog/open-source/git/highlights-from-git-2-54/)

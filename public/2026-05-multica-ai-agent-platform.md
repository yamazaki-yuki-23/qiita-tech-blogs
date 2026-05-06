---
title: AIエージェントをチームメンバーのように扱える「Multica」を試してみた
tags:
  - AI
  - 生成AI
  - ClaudeCode
  - Codex
  - エージェント
private: false
updated_at: ''
id: null
organization_url_name: null
slide: false
ignorePublish: true
---

**TL;DR**

- Multicaは、AI coding agentをIssueの担当者として扱えるOSS
- ローカルdaemon経由で、手元のClaude CodeやCodexなどをruntimeとして使える
- 今回はCodex runtimeのagentを作り、Issue assignからコメント投稿まで確認した

Claude CodeやCodexを使っていると、「この作業をあとでやっておいて」と頼みたい場面があります。ただ、CLIを直接起動するだけだと、タスクの担当、状態、実行履歴、コメントの置き場所は別で管理する必要があります。

Multicaは、その管理レイヤーをIssueベースで用意するツールです。この記事では、Multicaをローカル環境で試した記録をまとめます。

検証時点の情報です。

- 検証日: 2026年5月6日
- OS: macOS
- Multica CLI: `0.2.25`
- agent実行に使ったruntime: Codex

## Multicaとは

Multicaは、人間とAIエージェントが同じworkspaceでタスクを扱うためのプラットフォームです。公式サイトでは「coding agentsをreal teammatesにするopen-source platform」と紹介されています。

https://multica.ai/

GitHubリポジトリでも、次のように説明されています。

https://github.com/multica-ai/multica

> The open-source managed agents platform.

特徴は、AIエージェントを単発のチャットやCLI実行で終わらせず、Issueの担当者として扱うところです。

たとえば、通常のタスク管理ツールならIssueのassigneeには人間を設定します。Multicaでは、そこにClaude CodeやCodexなどをもとにしたagentを設定できます。

公式ドキュメントでも、Issueをagentにassignすると、そのagentが作業し、進捗を報告し、コメントに返信すると説明されています。

https://multica.ai/docs

Issue一覧では、人間向けのタスクと同じようにagent向けのタスクも並びます。

![MulticaのIssue board](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-05-multica-ai-agent-platform/issues-board.png)

## 何がうれしいのか

Claude CodeやCodexを直接使う場合、「今この場で依頼して、結果を見る」という使い方になりがちです。

実際の開発タスクは、もう少し長いライフサイクルを持っています。

- タスクを作る
- 担当者を決める
- 着手状態にする
- 作業ログを見る
- レビュー待ちにする
- コメントで追加指示する

Multicaは、このライフサイクル全体をAIエージェント込みで回せるようにしたツールです。

個人的に一番重要だと感じたのは、agentの実行場所です。ドキュメントによると、agentのタスクはMulticaのサーバー上ではなく、ローカルdaemon、つまり自分のマシン上で動きます。

https://multica.ai/docs

手元のCLI、APIキー、コードディレクトリを使いながら、タスク管理をMultica側に寄せる設計です。

## インストール

今回はHomebrewでCLIを入れました。

```sh
brew install multica-ai/tap/multica
```

インストールされたバージョンは次の通りです。

```sh
$ multica --version
multica 0.2.25 (commit: daf0e935, built: 2026-05-04T13:47:37Z)
go: go1.26.1, os/arch: darwin/arm64
```

CLIのhelpを見ると、`agent`、`issue`、`project`、`runtime`、`daemon`などのコマンドが用意されています。

```sh
$ multica --help

CORE COMMANDS
  agent:      Work with agents
  autopilot:  Manage autopilots (scheduled/triggered agent automations)
  issue:      Work with issues
  label:      Work with issue labels
  project:    Work with projects
  repo:       Work with repositories
  skill:      Work with skills
  workspace:  Work with workspaces

RUNTIME COMMANDS
  daemon:   Control the local agent runtime daemon
  runtime:  Work with agent runtimes
```

この時点ではdaemonはまだ止まっていました。

```sh
$ multica daemon status
Daemon: stopped
```

## `multica setup`でログインとdaemon起動を行う

次に`multica setup`を実行します。

```sh
multica setup
```

実行すると、Multica Cloud用の設定が作られ、ブラウザでログインする流れになります。

```sh
Configured for Multica Cloud (https://multica.ai).
  server_url: https://api.multica.ai
  app_url:    https://multica.ai
  config:     /Users/xxx/.multica/config.json

Opening browser to authenticate...
Waiting for authentication...
```

ブラウザで認証を完了すると、workspaceが検出され、daemonが起動しました。

```sh
Authenticated as ...
Token saved to config.

Found 1 workspace(s):
  • demo_xxx (...)

→ Run 'multica daemon start' to start your local agent runtime.

Starting daemon...
Daemon started (pid ..., version 0.2.25)
Logs: /Users/xxx/.multica/daemon.log

✓ Setup complete! Your machine is now connected to Multica.
```

daemonの状態は、`multica daemon status`で確認できます。

```sh
$ multica daemon status
Daemon:      running (pid ..., uptime 37s)
Agents:      claude, codex, gemini, copilot
Workspaces:  1
```

setup後は、Web UIのRuntimes画面にもローカルruntimeがonlineで表示されました。

![MulticaのRuntimes画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-05-multica-ai-agent-platform/runtimes.png)

## runtimeが自動検出される

`multica runtime list`を実行すると、ローカルで使えるAI coding toolがruntimeとして登録されていました。

```sh
multica runtime list --output json
```

Multica自体は、Claude Code、Codex、GitHub Copilot CLI、OpenClaw、OpenCode、Hermes、Gemini、Pi、Cursor Agent、Kimi、Kiro CLIなどに対応しています。

今回のローカル環境では、そのうち次の4つがdaemonに検出され、onlineのruntimeとして登録されました。

| provider | name | runtime_mode | status |
|---|---|---|---|
| claude | Claude | local | online |
| codex | Codex | local | online |
| gemini | Gemini | local | online |
| copilot | Copilot | local | online |

daemonのログにも、各runtimeが登録されたことが残っていました。

```text
registered runtime ... provider=claude
registered runtime ... provider=codex
registered runtime ... provider=gemini
registered runtime ... provider=copilot
watching workspace ... runtimes=4
task wakeup websocket connected ... runtimes=4
```

ここで重要なのは、Multicaがエージェント実行用のクラウド環境を勝手に使うわけではないことです。

ローカルdaemonが手元のCLIを検出し、それをruntimeとしてMultica workspaceに接続します。公式ドキュメントにも、APIキー、toolchain、コードディレクトリは自分のマシンに残ると説明されています。

https://multica.ai/docs/daemon-runtimes

## agentを作成する

Codex runtimeを使うagentを作りました。

まず、agent作成に必要なオプションを確認します。

```sh
$ multica agent create --help

Create a new agent

FLAGS
      --description string
      --instructions string
      --max-concurrent-tasks int32
      --model string
      --name string
      --runtime-id string
      --visibility string
```

今回は記事用の検証なので、ファイル変更をしないようにinstructionsを明示しました。

```sh
multica agent create \
  --name "Qiita Test Codex" \
  --description "Qiita記事用にMulticaの動作確認をするCodex agent" \
  --instructions "You are a test coding agent for a Qiita article. Keep responses concise, do not modify repositories unless explicitly asked, and report what you are doing in Japanese." \
  --runtime-id <codex-runtime-id> \
  --visibility private \
  --output json
```

作成結果です。

```json
{
  "description": "Qiita記事用にMulticaの動作確認をするCodex agent",
  "name": "Qiita Test Codex",
  "runtime_mode": "local",
  "status": "idle",
  "visibility": "private"
}
```

ここで作ったagentは、Multica上のassigneeとして使えるようになります。

作成したagentの詳細画面です。runtimeにCodexが紐づき、Instructionsを画面上で確認・編集できます。

![Multicaのagent詳細画面](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-05-multica-ai-agent-platform/agent-detail.png)

## Issueをagentにassignしてみる

検証用のIssueを作成して、先ほどのagentにassignします。

```sh
multica issue create \
  --title "Qiita記事用: Multicaの動作確認" \
  --description "この記事用の検証タスクです。リポジトリやファイルは変更せず、Multica上でこのIssueを受け取ったことと、実行環境として認識していることを日本語で短くコメントしてください。" \
  --assignee "Qiita Test Codex" \
  --status todo \
  --priority low \
  --output json
```

作成されたIssueでは、assigneeが`agent`になっていました。

```json
{
  "assignee_type": "agent",
  "identifier": "DEM-10",
  "priority": "low",
  "status": "todo",
  "title": "Qiita記事用: Multicaの動作確認"
}
```

Issueを作成した直後、daemonログにはtask wakeupが記録されました。

```text
task wakeup received ... runtime_id=... task_id=...
```

その後、Issueの状態を確認します。

```sh
multica issue get DEM-10
```

結果を見ると、statusが`in_review`に変わっていました。

```json
{
  "identifier": "DEM-10",
  "assignee_type": "agent",
  "status": "in_review",
  "title": "Qiita記事用: Multicaの動作確認"
}
```

実行履歴も確認できます。

```sh
$ multica issue runs DEM-10

ID        AGENT     STATUS     STARTED           COMPLETED         ERROR
52f9f90d  d20752ff  completed  2026-05-06T02:33  2026-05-06T02:34
```

コメント一覧を見ると、agentからコメントが投稿されていました。

```sh
$ multica issue comment list DEM-10
```

```text
AUTHOR          TYPE     CONTENT
agent:d20752ff  comment  このIssueを受け取りました。Qiita Test Codexとして、Multicaのローカル実行環境上で動作していることを確認しています。
```

CLIでIssueを作って1分ほどで返ってきました。Issueのコメント欄にagentの返信が普通に並んでいるのを見ると、確かに「チームメンバー」という感覚に近いです。

Web UIでも、Issue上にagentのコメント、status変更、完了ログが残っていました。

![MulticaのIssue詳細とagentコメント](https://raw.githubusercontent.com/yamazaki-yuki-23/qiita-tech-blogs/main/assets/2026-05-multica-ai-agent-platform/issue-detail.png)

### 補足: taskの完了とIssueの完了は別

Multicaでは、Issueをagentにassignすると、裏側でagent実行用の`task`が作られます。daemonがそのtaskを拾い、AI coding toolに渡し、実行が終わるとtaskは`completed`または`failed`になります。

今回の検証ではtaskは`completed`になりましたが、Issue自体のstatusは`in_review`でした。つまり、agentが作業を終えてレビュー待ちにした状態です。

実際の開発タスクでは、その後に人間が結果を確認し、問題なければIssueをDoneへ移す流れになります。

これで、次の流れを確認できました。

1. agentを作る
2. Issueを作る
3. Issueをagentにassignする
4. `todo`にする
5. local runtimeでagentが動く
6. taskが`completed`になり、Issueが`in_review`になる
7. 実行履歴とコメントがMulticaに残る

## 試してわかったこと

試して一番大きく感じたのは、AIエージェントを「作業を依頼する相手」として扱える点です。

Claude CodeやCodexを直接起動する場合、こちらがターミナル上で会話を管理します。どのタスクを依頼したか、どこまで進んだか、レビュー待ちなのか、失敗したのか——その状態管理は使う側の手元に残ります。

Multicaでは、その管理対象がIssueになります。

Issueにagentをassignすると、daemon経由でruntimeに通知され、agentが作業し、結果がコメントとして残ります。実行履歴もIssueに紐づくので、「このタスクに対してagentが何をしたか」を後から追いやすいです。

ローカルdaemon方式も現実的です。既にClaude CodeやCodexの認証を済ませているマシンなら、その環境をそのままruntimeとして使えます。今回も`multica setup`後に、ローカルのClaude、Codex、Gemini、Copilotが検出されました。

## 注意点

agentを動かすにはdaemonが起動していることが前提です。

```sh
multica daemon status
```

`running`になっていることを確認してから進めます。

IssueのStatusが`Backlog`のままだとagentは動きません。Multicaが最初に作るサンプルIssueにもその旨が書かれています。Issue作成時に`--status todo`を指定するか、Web UIでStatusをTodoに変更してから試してください。

```sh
multica issue create ... --status todo
```

Codex runtimeを使う場合、ローカルのCodex CLIが認証済みになっていることも確認します。daemonは手元のtoolchainを検出するだけで、認証情報は持っていません。

instructionsは慎重に書くのが無難です。今回の検証では、記事用の確認だけをしたかったので、次のように明示しました。

```text
do not modify repositories unless explicitly asked
```

実際の開発タスクで使う場合は、どのリポジトリを触ってよいか、どこまで自律的に変更してよいか、レビュー前に何を確認すべきかをinstructionsやworkspace contextに書いておくと安全です。

## まとめ

MulticaはAI coding agentをCLIの単発実行で終わらせず、Issueを担当するチームメンバーとして扱うためのプラットフォームです。

今回試した範囲では、HomebrewでCLIを入れ、`multica setup`でdaemonを起動し、Codex runtimeのagentを作成し、Issueをassignしてagentコメントが返るところまで確認できました。

実際に使うなら、調査、軽微な修正、ドキュメント更新、再現手順の確認のように、Issueとして切り出しやすく、あとからレビューしやすい作業と相性がよさそうです。

AIエージェントを複数使い始めると、「どのagentに何を頼んだか」「どこまで進んだか」「失敗したのかレビュー待ちなのか」を管理する手間がどこかに生まれます。その管理をIssueで一元化できるなら、ツールを増やしても混乱しにくい。個人開発でもチームでも使える構造です。

## 参考

- https://multica.ai/
- https://multica.ai/docs
- https://multica.ai/docs/daemon-runtimes
- https://multica.ai/docs/assigning-issues
- https://multica.ai/docs/tasks
- https://github.com/multica-ai/multica
- https://multica.ai/changelog

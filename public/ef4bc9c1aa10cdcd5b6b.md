---
title: '[Rails]postgreでDB作成が失敗したときに確認すべきこと'
tags:
  - Rails
  - PostgreSQL
private: false
updated_at: '2021-01-29T00:21:21+09:00'
id: ef4bc9c1aa10cdcd5b6b
organization_url_name: null
slide: false
ignorePublish: false
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---
#前提
既にRailsのアプリ開発するための環境構築は完了している

#アプリ新規作成

```
$ rails new 〇〇 -d postgresql  //〇〇にはアプリ名が入る
```
postgreSQLを使用するため、「-d」オプションでデータベースの指定をしています。

アプリ新規作成ができたら

```
$ cd 〇〇  //先程入力したアプリ名のディレクトリに移動
```

# データベース作成

```
$ bin/rails db:create
```

コマンド打ったら本来は下記が表示されますが

```
Created database '〇〇_development'
Created database '〇〇_test' 
```

私の環境下では

```
could not connect to server: No such file or directory
	Is the server running locally and accepting
	connections on Unix domain socket "/tmp/.s.PGSQL.5432"?
Couldn't create 'scaffold_app_development' database. Please check your configuration.
rails aborted!
ActiveRecord::ConnectionNotEstablished: could not connect to server: No such file or directory
	Is the server running locally and accepting
	connections on Unix domain socket "/tmp/.s.PGSQL.5432"?
/Users/▲▲/dev/rails/scaffold_app/bin/rails:5:in `<top (required)>'
/Users/▲▲/dev/rails/scaffold_app/bin/spring:10:in `block in <top (required)>'
/Users/▲▲/dev/rails/scaffold_app/bin/spring:7:in `tap'
/Users/▲▲/dev/rails/scaffold_app/bin/spring:7:in `<top (required)>'

Caused by:
PG::ConnectionBad: could not connect to server: No such file or directory
	Is the server running locally and accepting
	connections on Unix domain socket "/tmp/.s.PGSQL.5432"?
/Users/▲▲/dev/rails/scaffold_app/bin/rails:5:in `<top (required)>'
/Users/▲▲/dev/rails/scaffold_app/bin/spring:10:in `block in <top (required)>'
/Users/▲▲/dev/rails/scaffold_app/bin/spring:7:in `tap'
/Users/▲▲/dev/rails/scaffold_app/bin/spring:7:in `<top (required)>'
Tasks: TOP => db:create
(See full trace by running task with --trace)
```

が表示されました。（▲▲はPCのユーザー名が入るはずです）

#データベース作成失敗の原因
こちらを参考にさせていただきました。
[postgresqlでDBが作れなかったのを解決(してもらった)]
(https://haayaaa.hatenablog.com/entry/2019/01/23/111745)

記事の内容をまとめると
①まずログ（`/usr/local/var/log/postgresql`）を確認する
②エラーログの出力箇所を見つけ、内容を確認する

私の場合、エラーログは下記の通り出力されていました。

```:/usr/local/var/log/postgresql
The data directory was initialized by PostgreSQL version 11, which is not compatible with this version 13.1.
```

postgresqlのデータディレクトリがバージョン11なのに、バージョン13のpostgresqlも入ってしまっていたせいで上手く行かなかったようです。

解決方法としては
`brew install`でバージョン11のpostgresqlを入れ直すか、
データディレクトリを消してどちらも13をインストールし直す必要があるとのことでした。

#解決方法(データベース作成)
先程あげた解決方法のうち、今回はデータディレクトリを消すことにしました。
まずは、データディレクトリとhomebrewを削除します。

```
ディレクトリの削除
$ rm -rf /usr/local/var/postgres
```

```
homebrewの削除
$ brew uninstall --force postgresql
```

次にpostgresqlのインストール、そしてディレクトリを再作成します。

```
postgresqlのインストール
$ brew install postgresql 
```

```
ディレクトリ再作成
$ initdb /usr/local/var/postgresql -E utf8
```

PostgreSQLサーバの起動します。

```
$ brew services start postgresql
```

最後にfishの設定ファイルにパスを追記します

```
vimで設定ファイルを開きます。
$ vim ~/.config/fish/config.fish
```

```
以下の内容を追記します。
export PGDATA="/usr/local/var/postgres"
```

```
読み込ませます。
$ source ~/.config/fish/config.fish
```

ここまで行った後にデータベースを作成します。

```
bin/rails db:create
```

上手くいくと下記が表示されます（アプリ名：scaffold_app）。

```
Created database 'scaffold_app_development'
Created database 'scaffold_app_test'
```

---
title: OrcaでPR作成後の変更ファイルを編集する方法
tags:
  - macOS
  - Git
  - tips
private: false
updated_at: '2026-08-13T01:15:00+09:00'
id: 29717e5e1b00b51ef7f9
organization_url_name: null
slide: false
ignorePublish: true
posting_campaign_uuid: null
agreed_posting_campaign_term: false
---
## はじめに

Orca のワークツリーから PR を作成したあと、変更済みのファイルを修正したくなることがあります。しかし、ソース管理パネルから変更ファイルを開くと、差分確認用の読み取り専用表示になるため、そのままでは編集できません。

これまでは、ファイルパスを確認してから、Orca のファイルエクスプローラーで同じファイルを探していました。変数名やコメントを少し直すだけでも、この手順は手間です。

Orca には、差分表示から通常のファイルタブを開く機能があります。本記事では、この標準機能を使って変更ファイルを編集する方法を紹介します。

## 操作方法

次の操作で、差分表示中のファイルを編集モードで開けます。

### 1. 変更ファイルの差分を表示する

ソース管理パネルで変更ファイルを選択します。

![ソース管理パネルから変更ファイルを開き、読み取り専用の差分が表示されている](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/554111/a4e5ec15-390e-44f9-bf77-774f8d208a8e.png)

### 2. 「ファイルタブを開く」を押す

差分表示の右上にあるファイルアイコンにカーソルを合わせると、「ファイルタブを開く」と表示されます。

![差分表示の右上にある「ファイルタブを開く」ボタンを赤い枠と矢印で示している](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/554111/1fab1bf9-902b-4706-9236-b02bd2364240.png)

ボタンを押すと、同じファイルが通常の編集タブで開き、そのまま修正できます。読み取り専用の差分タブ自体が編集可能になるわけではありません。

![「ファイルタブを開く」を押した後、同じファイルが通常の編集タブで開いている](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/554111/6a4ac121-8fda-4b42-9bae-29f53d144937.png)

## まとめ

ソース管理パネルから開いた差分は読み取り専用ですが、右上の「ファイルタブを開く」を押すと、同じファイルを通常の編集タブで開けます。

当初は「アプリで開く」のカスタム設定を検討しましたが、今回の目的には Orca の標準機能だけで十分でした。

## 参考資料

- [差分表示の「ファイルタブを開く」ボタン](https://github.com/stablyai/orca/blob/09ec516ae50b7b83fa65343d9ad96159e3fe71fc/src/renderer/src/components/editor/EditorPanelHeader.tsx#L144-L179)
- [ファイルを編集モードで開く処理](https://github.com/stablyai/orca/blob/09ec516ae50b7b83fa65343d9ad96159e3fe71fc/src/renderer/src/components/editor/EditorPanel.tsx#L249-L265)

# DeguDesktopVer2

デスクトップで、デグーと暮らす。Electron製のデスクトップペットです。

[紹介・動きのお試し](https://udteach.github.io/DeguDesktopVer2/) · [ダウンロードと開き方](https://udteach.github.io/DeguDesktopVer2/download.html) · [配布ファイル](https://github.com/UDteach/DeguDesktopVer2/releases)

## インストール

- Windows 10以降（x64）：EXEでインストール。ZIP版はすべて展開してDeguDesktopVer2.exeを起動。
- Mac（macOS 13以降）：Apple Silicon / IntelそれぞれのDMGを開き、アプリをApplicationsへ移して起動。ZIP版も用意しています。

Node.js・Python・Goは不要です。開発者証明書による署名とApple公証はありません。Macは動作に必要なアドホック署名のみです。初回のセキュリティ確認、更新、削除、SHA-256照合は[ダウンロードページ](https://udteach.github.io/DeguDesktopVer2/download.html)を参照してください。

## デグーの暮らし

- 画面下を散歩、ひと休み、ときどき短いダッシュ。
- 全10色で、お顔くしくし・立ち上がり・回し車。
- アグーチの足ぴーん。他の毛色では散歩・待機を続けます。
- 1〜10匹、個別の毛色と名前、32 / 48 / 64 / 96px、4段階の移動速度。
- 表示モニター、歩く範囲、上下位置、一時停止、非表示。

動物の透明ウィンドウはクリックを背後に通し、フォーカスを奪いません。設定画面を閉じても常駐します。Windowsのトレイ／Macのメニューバーから設定・停止・非表示・終了を選べます。設定は自動保存されます。

カーソル追従と睡眠は収録していません。ジャンプの制作から採用した素材は、立ち上がりとして区別しています。回し車の出入りは短いフェードです。動作時間と頻度には演出上の調整があります。一部のアニメーションにAI生成素材を使用しています。

## 開発とビルド

Node.js 24で実行します。

```sh
npm ci --no-audit --no-fund
npm start
npm run check
npm run dist:win
# macOSホストで:
npm run dist:mac
npm run site:build
npm run site:check
```

WindowsはNSISインストーラーとZIP、Macは各CPU向けDMGとZIPを生成します。GitHub Actionsは3つのOS/CPU環境でハッシュと梱包内容、実際のアプリ起動・描画・設定の保存と復元を検査し、vタグから配布します。Pagesはアプリと同じPNGと描画モジュールを使います。

原936 PNG・順序・再生時間・表示補正を維持し、app/media/manifest.jsonの固定ハッシュと各PNGを検証します。追加素材はapp/motions/manifest.jsonで別途、生成元・プロンプト・抽出工程・フレームハッシュを追跡します。素材とコードの出典は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。

## 設定と確認範囲

Windows：%APPDATA%/DeguDesktopVer2/settings.json

Mac：~/Library/Application Support/DeguDesktopVer2/settings.json

旧DeguDesktop・Degu Desktop for Real・MofuMouseの設定は変更しません。自動更新と自動起動はありません。

Windowsでは透過・クリック透過・非アクティブ表示と各モーション、10色・サイズ・設定復元を確認しています。MacはCPU別のビルド環境で起動・描画・停止と非表示・設定復元、DMGとZIPの内容一致を確認しました。[配布版の検査記録](docs/DISTRIBUTION-QA.md)も公開しています。実機での画面の抜き差し・スリープ・DPI・初回Gatekeeper確認は環境ごとの確認が必要です。

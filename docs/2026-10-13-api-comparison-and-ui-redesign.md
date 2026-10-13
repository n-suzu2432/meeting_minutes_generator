# 2026-10-13 文字起こし・要約APIの比較調査 / フロントエンドのUI刷新

## 1. 文字起こし・要約APIの比較調査(コード変更なし)

### 背景
現行は `whisper-1` + `claude-sonnet-5`。コストを下げつつ品質を保てる組み合わせを知りたい、という相談。

### 実装
調査のみ。コードは変えていない。各社の公式料金ページを 2026-10-13 に確認した結果:

- 文字起こし: Groq `whisper-large-v3` $0.111/時間、`whisper-large-v3-turbo` $0.04/時間、ElevenLabs Scribe v2 $0.22/時間、OpenAI `whisper-1` $0.36/時間、`gpt-transcribe` $0.27/時間(タイムスタンプなし)。
- 要約: Claude Haiku 5.5 と OpenAI `gpt-6-luna` がどちらも入力 $0.10 / 出力 $0.50(100万トークン)。Claude Sonnet 5 / 5.5 は $2 / $10。
- 60分の会議1本の試算(1ドル=158.5円、入力2万・出力2千トークン仮定): Groq large-v3 + Haiku 5.5 で約18円。現行構成は約67円。

### 意思決定
- 文字起こしは Groq `whisper-large-v3` を使う方針(ユーザー決定)。OpenAI互換で `verbose_json` がそのまま使え、`backend/core/transcribe.py` の変更が小さい。turbo は公式の誤り率が 12% 対 10.3% と落ちるので不採用。
- 要約は `gpt-6-luna` ではなく Haiku 5.5 を推奨した。同価格で、独立評価(Artificial Analysis)の総合指標 43 対 38、ハルシネーション率 40% 対 77%。Anthropic SDK のままで済む。
- ユーザーは最終的に「Groq + Haiku 5.5 の金額」を確認したところまで。切り替えの実装指示はまだ出ていない。

### 残課題
- Groq / Haiku 5.5 への切り替えは未実装。
- `backend/config.py` の概算コスト定数(`CLAUDE_INPUT_COST_PER_MTOK = 3.0` / `CLAUDE_OUTPUT_COST_PER_MTOK = 15.0`)が現行 `claude-sonnet-5` の実単価($2 / $10)とずれている。未修正。
- 日本語議事録での要約品質の比較は公開データが見つからず未検証。実際の会議音声で見比べる必要がある。

## 2. フロントエンドのUI刷新

### 背景
「簡素すぎる。誰でも初見で使い方がわかり、スムーズに操作できるUI/UXに」という依頼。旧画面は辞書・アップロード・結果が縦に並ぶだけで、何から始めるか・今どこまで進んだかが伝わりにくく、結果もMarkdownを1枚流し込むだけだった。日本語フォントも読み込んでおらず端末任せだった。

### 実装
- `frontend/app/globals.css`: デザイントークンを `@theme` に定義(濃紺 `#14213d`、机の色 `#eef1f6`、蛍光ペンの黄 `#ffe14d` など)。蛍光ペンの線を引く `.marker` と、読み込み時に線が伸びる `.marker-draw` を追加。`prefers-reduced-motion` に対応。`@tailwindcss/typography` の読み込みは使わなくなったため削除。
- `frontend/app/layout.tsx`: フォントを Geist から Zen Kaku Gothic New(400/500/700/900)に変更。説明文から技術名を外した。
- `frontend/app/page.tsx`: 画面を「select → working → done」の3段階に分け、ファイル・進捗・エラー・結果の状態をここに集約。作成中は `beforeunload` で離脱確認を出す。失敗時はファイルを保持したまま1段階目に戻してエラーを表示。
- `frontend/app/components/StepIndicator.tsx`(新規): ヘッダーの3ステップ表示。
- `frontend/app/components/UploadForm.tsx`: ファイル選択専用に作り直し。未選択時は大きなドロップ枠、選択後はファイル名・サイズと「別のファイルにする」を表示。ボタンが押せない理由を下に出す。window 全体のドラッグ&ドロップと拡張子チェックは維持。
- `frontend/app/components/ProgressView.tsx`(新規): 作成中画面。%・メッセージ・経過時間・5段階のチェックリスト。最初の進捗イベントが届くまでは「ファイルを送っています…」を表示。
- `frontend/app/components/MinutesResult.tsx`: `result.minutes` の構造化データから要約・決定事項(蛍光ペン)・TODO(担当/期限のチップ)を個別に描画。発言ログは `statement_log_markdown` を行ごとにパースして折りたたみ表示。保存バーに Word / Markdown / 全文コピー。保存ファイル名を `元ファイル名_議事録.docx|md` に変更。「別の会議の議事録を作る」で1段階目に戻る。
- `frontend/app/components/DictionaryEditor.tsx`: 見出しを「社名や商品名を正しい表記にする(任意)」に変更、列見出し・例・登録件数を追加。`onSaved` で親に保存結果を返す。
- `frontend/app/components/HealthBanner.tsx`: 利用者向けの一文+管理者向けの確認項目、の2段構えに変更。
- `frontend/app/components/icons.tsx`(新規): インラインSVGアイコン。
- `frontend/public/illustrations/hero.webp` / `working.webp`(新規): `gpt-image-2` の quality=low で生成し、余白を切って WebP 化、背景を純白に補正。

### 意思決定
- **3ステップ式を採用**(1ページのまま磨く案・左右2カラム案は不採用)。各画面でやることを1つに絞れるのが初見向き。2カラムは情報量が多く、スマホでは結局縦積みになる。構成・トーン・画像・文言の4点を質問しようとしたがユーザーが質問を中断し(画像生成の許可だけ回答あり)、構成案の承認は得ていない。想定を明示して進めた。
- **トーンは「濃紺×白×蛍光ペン」**。議事録の大事な所に線を引く行為をそのまま画面の強調表現にした。黄色は決定事項・完了ステップ・主操作だけに使う。
- **技術名(Whisper / Claude)は画面から外した**。Groq / Haiku に切り替えても文言を直さずに済む。概算コストは結果画面の最下部に小さく残した。ただし `HealthBanner` の環境変数名は、設定する人が直すための情報なので残した。
- **結果は Markdown 流し込みをやめて構造化データから描画**。`react-markdown` は使わなくなったが `package.json` からは外していない。
- **辞書の初期値のバグを修正**。旧実装は `DictionaryEditor` を取得前にマウントしており、`useState(initialRows)` が後から届いた登録内容を拾わないため、登録済みの辞書が画面に出ず、保存すると上書きされる状態だった。取得完了後にマウントするよう変更。
- 作成中・完成の画面でもファイルのドロップでブラウザがそのファイルを開かないよう、`page.tsx` に window 全体の `dragover` / `drop` の `preventDefault` を常時登録した(`UploadForm` が選択画面でしかマウントされなくなったことによる退行を防ぐため)。
- `next/image` の `priority` は Next.js 16 で非推奨(同梱ドキュメントで確認)のため `loading="eager"` を使った。
- 完了イベント(`stage: "done"`)でチェックリストが全部未完了に戻らないよう、`ProgressView.tsx` の `stageIndex` で `done` を全ステップ完了として扱う。
- 画像は1枚目の「作成中」イラストが写真風・英字入りで出たため、画風指定を先頭に置いたプロンプトで作り直した(計3回生成、すべて low)。

### 検証
- `npm run lint`、`npx tsc --noEmit`、`npm run build` はすべて通過。
- ローカルで backend(uvicorn)と frontend(next dev)を起動し、Chrome で未選択・ファイル選択済み・エラー・作成中・完成の各画面を PC 幅と 400px 幅で目視確認。400px で横スクロールなし。
- 作成中・完成画面は一時的なプレビュー用の仮データ(`?preview=`)で表示して確認し、確認後に削除済み。

### 残課題
- 実際の音声ファイルを使った通しの動作(アップロード〜進捗〜結果〜ダウンロード)は未検証。
- ファイル選択ダイアログ経由の選択、ドラッグ&ドロップ、Word / Markdown 保存、全文コピーのクリック動作は未検証(コード上の処理は旧実装を踏襲)。
- `design-eye-auditor` による診断は未実施(スクリーンショットの自己点検で3点を修正: スマホ幅のファイルカードの折り返し、保存ボタンの改行、ドロップ枠見出しの改行位置)。
- 開発時に出るハイドレーション警告は、ブラウザ拡張が `body` に付ける `cz-shortcut-listen` 属性によるもので、アプリ側の問題ではない。
- `react-markdown` と `@tailwindcss/typography` が未使用の依存として残っている。

## 変更ファイル一覧

**新規作成**
- `frontend/app/components/StepIndicator.tsx`
- `frontend/app/components/ProgressView.tsx`
- `frontend/app/components/icons.tsx`
- `frontend/public/illustrations/hero.webp`
- `frontend/public/illustrations/working.webp`
- `docs/2026-10-13-api-comparison-and-ui-redesign.md`

**編集**
- `frontend/app/globals.css`(デザイントークン、蛍光ペン表現)
- `frontend/app/layout.tsx`(日本語フォント、説明文)
- `frontend/app/page.tsx`(3段階の画面切り替え、状態の集約)
- `frontend/app/components/UploadForm.tsx`(ファイル選択専用に作り直し)
- `frontend/app/components/MinutesResult.tsx`(構造化表示、保存バー)
- `frontend/app/components/DictionaryEditor.tsx`(文言・見た目、`onSaved`)
- `frontend/app/components/HealthBanner.tsx`(文言・見た目)

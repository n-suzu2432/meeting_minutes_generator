# 2026-08-03 バックエンド/フロントエンドのデプロイ先方針

## 背景

議事録自動生成アプリの本番デプロイに向けて、「バックエンドとフロントエンドでデプロイ先が違う」という認識で合っているかユーザーから確認があった。`docs/2026-08-01-tech-stack-architecture-design.md`の3回目実装(Next.js + FastAPIの2サービス構成化)時点で「本番デプロイ手順は未整備」が残課題として残っていたため、このタイミングで方針を整理した。

## 実装

コード変更なし。既存構成(`backend/Dockerfile`の有無、`frontend/`がNext.js標準構成であること)を確認した上で、デプロイ先の方向性を口頭で整理した。

- **フロントエンド(Next.js, `frontend/`)** → Vercelが第一候補。App Router / Turbopack構成のまま追加設定なしにデプロイ可能
- **バックエンド(FastAPI, `backend/`)** → Vercel Functionsには不向き。理由:
  - ffmpeg(システム依存パッケージ)が必要
  - `/api/minutes`が音声分割・並列文字起こし・Claude抽出を同期処理で行うため実行時間が長い
  - サーバーレスの実行時間・パッケージサイズ制限に引っかかりやすい
  - `backend/Dockerfile`が既に用意されているため、Render / Railway / Fly.ioのような常駐コンテナ型サービスの方が相性が良い

## 意思決定

- バックエンドとフロントエンドを同一サービスにまとめる案は採らず、2サービスに分けてデプロイする方針を踏襲することを確認(3回目実装時の「Next.js + FastAPI(2サービス)」構成の決定と整合)
- どのコンテナ型サービス(Render/Railway/Fly.io等)を具体的に使うかはユーザーとまだ相談中で未確定

## 残課題

- コンテナ型サービス(Render/Railway/Fly.io等)の具体的な選定は未決定
- デプロイ後の環境変数設計が未整備:
  - バックエンド側`FRONTEND_ORIGIN`(CORS許可)を本番フロントエンドURLに合わせる必要がある
  - フロントエンド側`NEXT_PUBLIC_`なAPIベースURLを本番バックエンドURLに合わせる必要がある
- 本番デプロイ手順そのもの(README等へのまとめ)は引き続き未整備

## 変更ファイル一覧(1回目)

- 新規作成: `docs/2026-08-03-backend-frontend-deploy-targets.md`

---

# APIキーをUI入力方式に変更(サーバー側.env依存の撤廃)

## 背景

上記のデプロイ先検討の流れで、本番公開時に自分のOPENAI_API_KEY/ANTHROPIC_API_KEYをバックエンドの環境変数に置くと、他の人が使った分の課金も自分持ちになってしまう懸念があった。そこでユーザーから「APIキー入力画面をフロントエンドに作り、そこに入れたキーで動くようにできるか」と相談があり、実装した。

方針をユーザーに確認:
- 入力したキーはブラウザに保存しない(毎回入力・リクエスト時のみ送信、localStorage等には保存しない)
- `.env`でのキー設定は廃止し、UI入力のみを正とする(未入力ならエラーにする)

## 実装

**バックエンド**
- `backend/config.py`: `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`の環境変数読み込みを削除。
- `backend/main.py`:
  - `/api/health`のレスポンスから`openai_configured`/`anthropic_configured`を削除(`ffmpeg_available`のみに)。
  - `/api/minutes`に`openai_api_key`/`anthropic_api_key`をフォームフィールドとして追加(`Form(...)`)。未入力(空白のみ含む)は`400`で「APIキーを入力してください。」を返す。
  - `_generate_minutes_stream`の引数にキーを追加し、`config.OPENAI_API_KEY`/`config.ANTHROPIC_API_KEY`参照箇所(Whisper呼び出し・Claude抽出呼び出し)をリクエスト由来の値に置き換え。サーバー側にキーを保持する変数は残していない。
- `backend/.env.example`: APIキー行を削除し、UI入力方式に変更した旨のコメントに置き換え。

**フロントエンド**
- `frontend/app/components/ApiKeyForm.tsx`(新規): OpenAI/Anthropicキーの入力欄(`type="password"`)。保存しない旨の注記を表示。
- `frontend/lib/api.ts`: `HealthStatus`から`openai_configured`/`anthropic_configured`を削除。`ApiKeys`型を追加し、`generateMinutes`が`FormData`に`openai_api_key`/`anthropic_api_key`を含めて送信するように変更。
- `frontend/app/components/HealthBanner.tsx`: APIキー未設定チェックを削除(ffmpegのみ表示)。
- `frontend/app/components/UploadForm.tsx`: `apiKeys`propを受け取り`generateMinutes`に渡すように変更。
- `frontend/app/page.tsx`: `openaiApiKey`/`anthropicApiKey`をstateで保持し、`ApiKeyForm`をヘルスバナーの下・辞書エディタの上に配置。`isReady`判定にキー入力済みかどうかを追加。

## 意思決定

- **キーの永続化はしない**: localStorage案もあったが、XSS等で漏れるリスクを避け「毎回入力」を選んだ(ユーザー確認済み)。
- **`.env`のフォールバックは持たせない**: ローカル開発時の利便性より、本番公開時に他人のキーがサーバーに残らない設計をシンプルに保つことを優先(ユーザー確認済み)。
- キーの受け渡しは、既存の`/api/minutes`が`multipart/form-data`(ファイルアップロード)であることに合わせ、追加のヘッダーではなく同じフォームのフィールドとして`openai_api_key`/`anthropic_api_key`を追加する形にした(実装がシンプルなため)。

## 残課題

- `backend/.env`(ローカルの実キー、gitignore対象)は未変更のまま残しているが、現状のコードからは参照されなくなった。ローカル動作には影響しない。
- 本番公開時にHTTPS化されていないと、入力したAPIキーが平文でネットワークを流れる。デプロイ手順整備時にHTTPS必須である点を明記する必要がある。
- レートリミットや不正利用対策(誰かが他人のキーを盗み見て使う、等)は未検討。個人利用〜小規模公開を想定した範囲での対応にとどまる。

## 変更ファイル一覧(2回目)

- 新規作成: `frontend/app/components/ApiKeyForm.tsx`
- 編集: `backend/config.py`, `backend/main.py`, `backend/.env.example`, `frontend/lib/api.ts`, `frontend/app/components/HealthBanner.tsx`, `frontend/app/components/UploadForm.tsx`, `frontend/app/page.tsx`

---

# バックエンドのホスティング先をRenderに決定

## 背景

`docs/2026-08-01-tech-stack-architecture-design.md`以来「残課題」として残っていたバックエンドのホスティング先(Render/Railway/Fly.io)について、ユーザーが「今まで通りRENDERでいく」と決定。以前から候補として挙がっていたRenderを正式採用した。

## 実装

- `render.yaml`(新規、リポジトリ直下)を作成。RenderのBlueprint機能で`backend/Dockerfile`をそのままWebサービスとしてデプロイできるように設定。APIキー(OPENAI_API_KEY/ANTHROPIC_API_KEY)は前段の変更でUI入力方式に変えたため、Render側の環境変数としては設定不要になっている。`FRONTEND_ORIGIN`(CORS許可先)のみ、Vercelのデプロイ後にダッシュボードで設定する運用とした。

## 意思決定

- `render.yaml`のフィールド名はRenderのBlueprint仕様に基づく想定で作成したが、実際にRenderダッシュボードでBlueprintを読み込ませた際にエラーが出た場合は、手動でのWebサービス作成(Dockerfileを指定するダッシュボードUI操作)に切り替える方が確実(仕様変更の可能性があるため)。

## 残課題

- Renderへの実デプロイ自体は未実施(アカウント操作が必要なため、ユーザー側での実行が必要)
- デプロイ後、`FRONTEND_ORIGIN`をVercel本番URLに合わせて設定する必要がある
- Render無料/低価格プランはアイドル時にスピンダウンする仕様があるため、初回リクエストのコールドスタート(数十秒)が発生しうる。既存の`HEARTBEAT_INTERVAL_SECONDS`によるプロキシタイムアウト対策があるため`/api/minutes`自体は問題ないと見込むが、ヘルスチェック(`/api/health`)含めコールドスタート挙動は実デプロイ後に要確認

## 変更ファイル一覧(3回目)

- 新規作成: `render.yaml`

---

# APIキーのUI入力方式を撤回し、.env方式に戻した

## 背景

APIキーをUI入力方式にした後、ユーザーから「一回入力してどこかに残すとなると流出リスクはあるか」と質問があった。保存先(メモリのみ/sessionStorage/localStorage)ごとのリスクを説明したところ、「バックエンドの環境変数に入れておくのが一番安全では」と聞かれた。

キー漏洩リスクだけで見ればその通り(ブラウザに一切渡らないため攻撃面が最小)。ただしUI入力方式に変えた元々の理由は「本番公開時に他人の利用分もAPI課金が自分持ちになる」という**コスト面のリスク**だったため、その前提が変わっていないか確認した。ユーザーに利用者範囲を確認したところ「自分だけ(個人利用)」であることが判明し、他人が使う前提がそもそも無いためコスト面のリスクは実質発生しない。よって、より単純で安全な.env方式に戻すことにした。

## 実装

今回のセッションで追加したUI入力方式(2回目の変更)を撤回し、実装1回目時点の.env方式に戻した。

- `backend/config.py`: `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`の環境変数読み込みを復元
- `backend/main.py`: `/api/health`のレスポンスに`openai_configured`/`anthropic_configured`を復元。`/api/minutes`から`openai_api_key`/`anthropic_api_key`フォームフィールドを削除し、`config.OPENAI_API_KEY`/`config.ANTHROPIC_API_KEY`を直接参照する形に戻す
- `backend/.env.example`: APIキー行を復元
- `frontend/app/components/ApiKeyForm.tsx`: 削除(不要になったため)
- `frontend/lib/api.ts`: `HealthStatus`に`openai_configured`/`anthropic_configured`を復元。`ApiKeys`型・`generateMinutes`のAPIキー引数を削除
- `frontend/app/components/HealthBanner.tsx`: APIキー未設定チェックを復元
- `frontend/app/components/UploadForm.tsx`: `apiKeys`propを削除
- `frontend/app/page.tsx`: `openaiApiKey`/`anthropicApiKey`のstateと`ApiKeyForm`表示を削除。`isReady`判定を`health.openai_configured`/`health.anthropic_configured`ベースに戻す
- `render.yaml`: `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`を環境変数として追加(`sync: false`、値はRenderダッシュボードで手動設定する想定)

## 意思決定

- **個人利用限定であることを前提に、キー管理はサーバー環境変数に一本化**(ユーザー確認済み)。今後もし複数人利用に広がる場合は、UI入力方式(今回撤回した実装)への再変更を検討する
- UI入力方式を採用している間に得た知見(セキュリティトレードオフの整理)は記録として本ログに残す。実装自体はロールバックしたが、判断の経緯は将来同様の相談があった際の参考にする

## 残課題

- Renderダッシュボードで`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`FRONTEND_ORIGIN`を実際に設定する作業が残っている(実デプロイ時)
- 「個人利用のみ」という前提が変わった場合(他の人にURLを共有する等)は、この方針を再検討する必要がある

## 変更ファイル一覧(4回目)

- 削除: `frontend/app/components/ApiKeyForm.tsx`
- 編集: `backend/config.py`, `backend/main.py`, `backend/.env.example`, `frontend/lib/api.ts`, `frontend/app/components/HealthBanner.tsx`, `frontend/app/components/UploadForm.tsx`, `frontend/app/page.tsx`, `render.yaml`

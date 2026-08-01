# 2026-08-01 議事録自動生成アプリ 技術スタック・アーキテクチャ設計

## 背景

ウィスパー(音声文字起こし)とLLM APIを使った議事録自動生成アプリを作成するにあたり、実装に入る前に要件整理・技術選定・懸念点の洗い出しを行った。既存の`app.py`/`transcribe.py`/`summarize.py`(Streamlit + Whisper API + DeepSeek API の最小構成)をベースに、要件に合わせて再設計する。

## 要件

1. MP3/MP4をアップロードしてWhisperで書き起こす
2. Claudeで「決定事項/TODO/参加者発言」を構造化抽出する
3. Markdownでダウンロードできる

## 達成基準

- 1時間音声を5分以内に書き起こす
- 話者分離はしないが時系列タイムスタンプは保持する
- 誤字を辞書置換できるUIがある(社名・商品名)

## 意思決定

### 使用言語: Python

- 既存コード(`app.py`等)がPythonで書かれており、それをベースに拡張するため
- UIフレームワークにStreamlit(Python専用)を採用しているため
- OpenAI(Whisper)・Anthropic(Claude)ともに公式Python SDKが充実しているため
- 音声処理(`pydub`)・非同期並列処理(`asyncio`)のエコシステムが揃っているため

### 技術スタック

| レイヤー | 技術 | 理由 |
|---|---|---|
| UI | Streamlit | 社内/学習ツール規模で十分。`st.data_editor`が辞書編集UIにそのまま使える |
| 文字起こし | OpenAI Whisper API(`whisper-1`) | 要件で名指し。ローカルGPU不要 |
| 音声分割 | pydub + ffmpeg | 25MB上限対応。無音検出でチャンク境界を選べる |
| 並列処理 | `asyncio` + `AsyncOpenAI` + `Semaphore` | I/Oバウンドな並列API呼び出しに向く。レート制限対策で同時実行数を制御 |
| 構造化抽出 | Anthropic Python SDK + **`claude-sonnet-5`** | ユーザー指定によりSonnetを採用。単発の抽出タスクなのでSonnetで十分な精度が見込める |
| 辞書永続化 | JSONファイル(`data/dictionary.json`) | この規模でDBは過剰 |
| Markdown整形 | 標準の文字列テンプレート | フォーマット固定のためテンプレートエンジン不要 |
| テスト | pytest(API部分はモック) | 純粋関数を中心に単体テスト |

### アーキテクチャ・フロー

```
MP3/MP4アップロード
   → 音声分割(無音検出ベース、25MB/チャンク制限対応、並列処理用)
   → Whisper API 並列文字起こし(verbose_json でタイムスタンプ取得)
   → チャンク結合(タイムスタンプをオフセット調整)
   → 誤字辞書で置換(社名・商品名、置換プレビューUIで確認)
   → Claude(claude-sonnet-5)で構造化抽出(決定事項/TODO/要約のみ)
   → 発言ログはコード側でWhisper segmentsから機械生成(Claudeには生成させない)
   → Markdown整形・ダウンロード
```

### ディレクトリ構成案

```
meeting_minutes_generator/
├── app.py                  # Streamlit UI
├── core/
│   ├── audio_utils.py      # pydub/ffmpegで音声分割(無音検出ベース)
│   ├── transcribe.py       # Whisper並列呼び出し + タイムスタンプ結合
│   ├── dictionary.py       # 誤字辞書の読み込み・適用
│   ├── extract.py          # Claude構造化抽出(決定事項/TODO/要約)
│   └── markdown.py         # 発言ログ+抽出結果 → Markdown整形
├── config.py                # 環境変数・定数
├── data/
│   └── dictionary.json      # ユーザー編集可能な辞書(永続化)
├── requirements.txt
├── .env.example
└── docs/                     # 作業ログ
```

## 懸念点と対応方針

設計段階で洗い出した問題点と対応策:

1. **発言ログをClaudeに生成させると危険**(トークン増大・タイムスタンプ誤生成)→ Whisperの`segments`からコード側で機械的にMarkdown化。Claudeは決定事項/TODO/要約のみ担当
2. **チャンク境界での精度劣化** → `pydub.silence.detect_silence()`で無音区間を境界に選ぶ。無音が見つからない場合は固定長+オーバーラップでフォールバック
3. **辞書置換の日本語対応**(正規表現の単語境界が使えない)→ 長い語から順に`str.replace`。誤爆確認のため置換プレビューUIを用意
4. **並列処理とレート制限** → `asyncio.Semaphore`で同時実行数制御(デフォルト3〜5、環境変数で調整可)。429/5xxは指数バックオフでリトライ
5. **チャンク単位の失敗ハンドリング** → 各チャンク独立でリトライ、失敗時はプレースホルダーを挿入して処理継続
6. **ffmpeg依存(Windows環境)** → 起動時に`shutil.which("ffmpeg")`でチェックし、未インストールならインストール手順を表示
7. **MP4からの音声抽出** → `pydub.AudioSegment.from_file()`が内部でffmpegを使うため特別分岐は不要
8. **テストの実音声依存** → 純粋関数(辞書置換・タイムスタンプ結合・Markdown整形)は`pytest`+モックでカバー。E2Eは小規模サンプルで段階検証
9. **データプライバシー** → README冒頭に「機密情報は入力しないこと」を明記
10. **コスト** → 音声長からWhisper/Claudeの概算コストをUI上に表示

## 実装(1回目)

### 背景

設計方針(技術スタック・言語・構成・懸念点への対応)が固まったため、実装に着手した。

### 実装内容

- `config.py`: 環境変数・定数を一元管理(APIキー、モデル名`claude-sonnet-5`、チャンク分割パラメータ、並列数、コスト概算単価、`ffmpeg_available()`)
- `core/audio_utils.py`: pydubで音声/動画を読み込み、`detect_silence`で無音区間を優先しつつtarget_chunk_ms間隔でチャンク分割。各チャンクは16kHzモノラル64kbps mp3にエクスポート(25MB上限に十分な余裕を持たせ、入力フォーマットによらず一律の挙動にする)
- `core/transcribe.py`: `AsyncOpenAI` + `asyncio.Semaphore`で並列文字起こし(`response_format="verbose_json"`でsegments取得)。チャンクごとに最大3回リトライ(指数バックオフ)、失敗時はエラー情報を保持したまま処理継続
- `core/dictionary.py`: 誤字辞書のロード/保存/適用。長い語から順に`str.replace`し、置換件数レポートを返す
- `core/extract.py`: Claude API(`claude-sonnet-5`)で決定事項/TODO/要約のみを構造化抽出。`output_config.format`(json_schema)で出力形式を強制し、`thinking: {"type": "disabled"}`でシンプルな抽出タスクとして高速・低コストを優先。発言ログはClaudeに生成させない
- `core/markdown.py`: Whisperのsegmentsからタイムスタンプ付き発言ログ(`[HH:MM:SS] テキスト`)を機械生成し、Claudeの抽出結果と合わせて議事録Markdownを整形
- `app.py`: Streamlit UIを全面再構成。辞書編集UI(`st.data_editor`)、ffmpeg存在チェック、Whisper/Claudeの概算コスト表示、失敗チャンクの警告表示、置換結果プレビューを追加
- `tests/`: 辞書置換・Markdown整形など純粋関数のユニットテストを追加。`pytest.ini`でプロジェクトルートをpythonpathに追加
- `requirements.txt` / `.env.example`: `anthropic`パッケージを追加、`DEEPSEEK_API_KEY`を`ANTHROPIC_API_KEY`に置き換え
- 旧`transcribe.py` / `summarize.py`(ルート直下)を削除し、`core/`配下に統合

### 意思決定

- 発言ログはWhisperの`segments`をコード側で機械整形し、ClaudeにはJSON Schemaで決定事項/TODO/要約のみ抽出させる(設計段階の懸念点1への対応)
- Claude呼び出しは`thinking: {"type": "disabled"}`とし、単純な抽出タスクとして`max_tokens=8000`・低コストを優先(adaptive thinkingは効果測定してから有効化を検討する方針)
- 音声チャンクは常に16kHzモノラル64kbps mp3に再エンコードすることで、入力フォーマット(wav/mp4等)によらず25MB制限を安全にクリアし、MP4からの音声抽出も特別分岐なしで対応(懸念点7への対応)

### 残課題(実装1回目時点、後に一部解消)

- ~~実機検証未実施(開発機にPython実行環境がない)~~ → 実装2回目で解消(下記)
- チャンク長(`TARGET_CHUNK_MS`)・並列数(`TRANSCRIBE_CONCURRENCY`)・無音検出閾値は未チューニング。実測の上で調整が必要
- 「1時間音声を5分以内」の達成基準はOpenAI側のレート制限次第で未達になる可能性があり、実測での検証が必要
- ffmpeg未インストール環境ではエラーメッセージ表示のみで、自動インストール等のフォールバックは未実装

### 変更ファイル一覧

- 新規作成: `config.py`, `core/__init__.py`, `core/audio_utils.py`, `core/transcribe.py`, `core/dictionary.py`, `core/extract.py`, `core/markdown.py`, `pytest.ini`, `tests/__init__.py`, `tests/test_dictionary.py`, `tests/test_markdown.py`
- 編集: `app.py`, `requirements.txt`, `.env.example`
- 削除: `transcribe.py`(ルート直下、`core/transcribe.py`に統合), `summarize.py`(ルート直下、`core/extract.py`に置き換え)

## 実装検証・環境構築(2回目)

### 背景

開発機にPython実行環境が無かった(`WindowsApps`配下のストア誘導スタブのみ)ため動作未検証だった件について、ユーザーの許可を得てPython・ffmpegをインストールし、実際に検証した。

### 実装内容

- `winget install Python.Python.3.12`(ユーザースコープ)でPython 3.12.10をインストール
- `winget install Gyan.FFmpeg`(ユーザースコープ)でffmpeg 8.1.2をインストール
- `pip install -r requirements.txt` で依存パッケージ導入
- `pytest` を実行し、純粋関数(辞書置換・Markdown整形)のユニットテスト11件を実施

### 意思決定

- テスト実行の過程で `core/dictionary.py` の `apply_dictionary()` に実バグを発見(設計段階で懸念していた「辞書置換の入れ子問題」が実際に再現した): 長い語から順に逐次`str.replace`する実装だと、例えば「AIツール→AI Tool」を先に置換した後、その置換結果に含まれる"AI"の部分文字列が続く「AI→人工知能」ルールで再度置換されてしまい、`"AI Toolを使う"`が`"人工知能 Toolを使う"`になってしまう不具合があった
  - **修正**: 全置換ルールを1つの正規表現(長い語を優先する交互パターン `wrong1|wrong2|...`)にまとめ、元のテキストに対して`re.sub`で1回のパスだけ置換するよう変更。マッチした時点で該当範囲は消費されるため、置換後の文字列が別ルールに再マッチすることがなくなる
  - この修正により、辞書置換のテストが本来検出すべきだったバグを検出でき、テストを書く意味が実証された

### 残課題

- ffmpegはインストールしたが、実音声ファイルでのE2E動作確認(1時間音声を5分以内に処理できるか等)はまだ未実施。OpenAI/Anthropic のAPIキーを設定した上でユーザー側での実行確認が必要
- チャンク長・並列数・無音検出閾値のチューニングは引き続き未実施

### 変更ファイル一覧

- 編集: `core/dictionary.py`(`apply_dictionary()`を正規表現の単一パス置換に修正)
- インストール(コード変更ではない): Python 3.12.10, ffmpeg 8.1.2(いずれもwingetでユーザースコープ)

## フロントエンドをNext.jsへ全面移行(3回目)

### 背景

Streamlit版のデザインをユーザーが「いまいち」と評価し、Next.jsでのフロントエンド作り直しを希望。バックエンド構成について「Next.js + FastAPI(2サービス)」か「Next.js単体でNode.jsに全面移植」かを確認し、既存のPythonロジック(音声分割・並列文字起こし・辞書置換の修正済みバグ含む)をそのまま活かせる**Next.js + FastAPI(2サービス構成)**を採用した。CORS設定・大容量ファイルの直接アップロード・進捗表示は同期HTTPで吸収する方針とした。

### 実装内容

- **バックエンドの再構成**: `config.py` / `core/` / `tests/` / `pytest.ini` / `.env` / `.env.example` / `requirements.txt` を `backend/` 配下に移動。Streamlit版の `app.py` は削除
- `backend/main.py`: FastAPIアプリを新規作成。エンドポイントは以下の3つ
  - `GET /api/health` — OPENAI_API_KEY/ANTHROPIC_API_KEY設定状況とffmpeg有無を返す
  - `GET /api/dictionary` / `PUT /api/dictionary` — 辞書の読み込み・保存
  - `POST /api/minutes` — 音声/動画ファイルを受け取り、分割→並列文字起こし→辞書置換→Claude構造化抽出→Markdown整形までを同期処理で実行し、結果をJSONで返す(`asyncio.to_thread`でCPUバウンドな同期関数をイベントループから逃がす)
  - `CORSMiddleware` で `FRONTEND_ORIGIN`(既定 `http://localhost:3000`)からのアクセスのみ許可
  - `backend/requirements.txt` から`streamlit`を除去し、`fastapi` / `uvicorn[standard]` / `python-multipart` を追加
- **フロントエンド新規作成**: `create-next-app`(TypeScript, Tailwind CSS v4, App Router, Turbopack)で`frontend/`をスキャフォールド。Next.js 16.2.12 / React 19.2.4
  - `lib/api.ts`: バックエンドAPIの型定義とfetchラッパー
  - `app/components/HealthBanner.tsx`: APIキー未設定・ffmpeg未検出を表示
  - `app/components/DictionaryEditor.tsx`: 辞書の追加・削除・保存UI(`<details>`によるアコーディオン)
  - `app/components/UploadForm.tsx`: ファイルアップロード+議事録作成ボタン、ローディング表示
  - `app/components/MinutesResult.tsx`: `react-markdown`で議事録を表示、Markdownダウンロードボタン、コスト概算・辞書置換結果の表示
  - `app/page.tsx`: 上記を統合するクライアントコンポーネント。マウント時に`/api/health`と`/api/dictionary`を取得
  - `react-markdown` と `@tailwindcss/typography` を追加インストール

### 意思決定

- Next.js 16はAGENTS.md/CLAUDE.mdの自動生成ファイルで「学習データと異なる破壊的変更がある」と明記されていたため、`node_modules/next/dist/docs/`の同梱ドキュメント(環境変数・Server/Client Components)を実装前に確認してから着手した(結果的に`"use client"`や`NEXT_PUBLIC_`プレフィックスなど基本規約は変更なしと確認)
- ページ全体を1つのクライアントコンポーネント(`"use client"`)として実装。バックエンドAPIを直接fetchするだけのシンプルなSPA的構成のため、Server Componentsによるデータフェッチの恩恵が薄いと判断
- Tailwind v4の`@plugin`記法で`@tailwindcss/typography`を読み込み、Claudeが返すMarkdownを`prose`クラスで整形表示する方針にした

### 検証

- `npx tsc --noEmit` / `npm run lint` ともにエラーなし
- backend(`uvicorn`)・frontend(`next dev`)を両方起動し、ブラウザ(Chrome自動操作)で実際に動作確認:
  - トップページのタイトル・説明文が正しく表示
  - `/api/health`をCORS越しに取得し、「OPENAI_API_KEY が未設定です」のバナーが正しく表示(意図した動作)
  - 辞書エディタで実際に「アンソロピック→Anthropic」を入力して保存 → `PUT /api/dictionary`が200で成功、`backend/data/dictionary.json`に反映されることを確認 → テスト後に削除して空配列に戻したことも確認
  - バックエンド起動時、このBashセッションのPATHにffmpegが通っていなかったため警告が出ていた問題は、winget導入先のパスを明示的にPATHへ追加して解消

### 残課題

- 実音声ファイルでの`/api/minutes`エンドポイントのE2E検証は未実施(OPENAI_API_KEYが引き続き空のため)。OpenAIキー設定後にユーザー側での実行確認が必要
- 本番デプロイ手順(2サービスの起動方法をREADME等にまとめる)は未整備
- チャンク長・並列数・無音検出閾値のチューニングは引き続き未実施

### 変更ファイル一覧

- 移動: `config.py`, `core/`, `tests/`, `pytest.ini`, `.env`, `.env.example`, `requirements.txt` → `backend/`配下
- 削除: `app.py`(Streamlit版UI)
- 新規作成: `backend/main.py`, `backend/config.py`の`FRONTEND_ORIGIN`追記, `frontend/`一式(`app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/components/HealthBanner.tsx`, `app/components/DictionaryEditor.tsx`, `app/components/UploadForm.tsx`, `app/components/MinutesResult.tsx`, `lib/api.ts`, `.env.local`, `.env.local.example`ほかNext.js標準ファイル)

## APIキー設定・最終ヘルスチェック確認(4回目)

### 背景

ユーザーがOPENAI_API_KEYを設定。ただし`backend/`への再構成後にもかかわらず、ユーザーはプロジェクトルート直下に新規で`.env`を作成してそこにキーを書いていた(VS Codeで開いていたファイルパスがルートの`.env`だった)。バックエンドは`backend/`をカレントディレクトリとして起動するため、`python-dotenv`の`load_dotenv()`は`backend/.env`を読む。ルートの`.env`はどのコードからも参照されない状態だった。

### 実装内容

- ルートの`.env`にあった`OPENAI_API_KEY`の値を`backend/.env`にコピーし、ルートの`.env`は削除して二重管理を解消
- OpenAI/Anthropic双方のAPIキーについて、無料エンドポイント(`models.list()`)で認証成功を確認
- backend(uvicorn)・frontend(next dev)を再起動し、フロントエンドの「バックエンドの設定を確認してください」バナーが消えて`議事録を作成する`ボタンが有効化されることを確認

### 意思決定

- Next.jsの開発オーバーレイに「1 Issue」(hydration mismatch)が表示されたが、エラー内容は`data-__embeded-gyazo-content-j-s`等、Gyazoブラウザ拡張機能がハイドレーション前にHTMLへ注入した属性が原因と判明(Next.js公式のエラーメッセージ内で「ブラウザ拡張機能が原因の場合がある」と明記されている典型パターン)。アプリケーションコードの不具合ではないため対応不要と判断

### 残課題

- 実音声ファイルでの`/api/minutes`のE2E検証(1時間音声を5分以内に処理できるか等)はまだ未実施。テスト用音声ファイルが必要
- 2サービスの起動手順のドキュメント化は未整備

### 変更ファイル一覧

- 編集: `backend/.env`(OPENAI_API_KEYを反映)
- 削除: `.env`(ルート直下、`backend/.env`に統合)

## 変更ファイル一覧(設計フェーズ)

- 新規作成: `docs/2026-08-01-tech-stack-architecture-design.md`

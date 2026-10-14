# CITYSCAPE — 都市運営シミュレーション

街の見た目の成長と自治体経営を組み合わせたブラウザゲーム。旧Phaserプロトタイプは引き継がず、React + PixiJS v8で実装し直した Phase 2 の交通シミュレーションを含みます。

## 起動

Node.js 22+、npm を用意して実行します。

```bash
npm install
npm run dev
```

### 検証

```bash
npm run verify
```

### Cloudflare Workers Static Assets

```bash
npm run build
npx wrangler deploy
```

Cloudflare側で認証が必要です。`main` ブランチから自動公開する場合は、Cloudflareの GitHub 連携または GitHub Actions にデプロイ資格情報を設定してください。

## Phase 1 でできること

- 64×64固定シード地形、アイソメトリック街並み、パン・ズーム
- 道路敷設、住宅・商業・工業地区の指定、建物自動成長
- 公園・学校・診療所の設置、撤去、資金不足・水上建設・重複チェック
- 月次進行、一時停止、1/2/4倍速、人口・雇用・財政・満足度の表示
- 住民税率・都市方針の変更、最大120か月の小さな人口グラフ
- IndexedDB自動保存・手動保存・バックアップ、JSONエクスポート/インポート

## 実装ルール

- シミュレーションは `src/core/city.ts` で完結し、React/PixiJS に依存しません。
- コマンドは検証後に `structuredClone` で新しい状態を返し、失敗時は何も変更しません。
- 月次乱数は記録されるシード状態から生成し、同じセーブからの継続結果が再現できます。
- シミュレーション結果の財政は **デフォルメされたゲーム内経済** です。税率・収支の実社会的な妥当性は後段階で調整します。
- データは端末のブラウザ内に保存されます。ブラウザのデータ削除で失われるため、JSON書き出し推奨。

## 次のフェーズ

- 建物の見た目（素材/立地/成長段階）の改良、アセット制作
- 道路グラフ・道路接続判定・渋滞・交通量の導入
- 水道・電力のインフラ、産業需要、家計・企業会計
- 住民年齢構成、施設容量、地価、都市政策とイベント
- IndexedDB容量検証、端末別の性能計測、E2E/ビジュアルリグレッション

## Phase 1: 操作・描画の改善

- 道路/住宅/商業/工業/撤去は「描く」モードでドラッグ操作可能（最大256区画／操作）。
- 右クリック/中ボタンでマップを移動、画面右上で移動/描画を切り替え。
- 拡大/縮小/中央へ戻すボタン。ブラウザのホイールズームも利用可能。
- 直前の建設/撤去を元に戻す（Ctrl+Z / Cmd+Z）。時間進行で取り消し履歴をリセット。
- ホバーで配置可能/不可の色を表示。ドラッグ中の区画をプレビュー。
- 地形と建築物の描画レイヤーを分離し、カーソル移動時の全マップ再描画を回避。
- 置けない区画をスキップし、実際に配置した区画分だけ請求する一括操作。

注意：連続操作は一括で完了するまで保存されないため、操作途中にブラウザを閉じても中途半端な建設は反映されません。

## Phase 1: セーブの信頼性強化

- 全セーブの書き込みを順序制御し、遅い古い保存が新しい都市を上書きしないようにしました。
- 最新の自動保存が破損している場合は、前回の正常なバックアップを試します。
- 破損したデータを正常なバックアップへ上書きすることを防ぎます。
- 都市画面から直前のバックアップを手動で復元できます。
- 初回ロード中にユーザーが編集を開始した場合、古い保存のロードで最新操作を上書きしません。

## ブラウザの自動テスト（Phase 1 QA）

```bash
npm install
npx playwright install chromium
npm run e2e
```

PCとモバイルのChromiumで、マップ描画、建設操作切替、ズーム、政策変更、保存後のリロード、横方向の表示崩れを検証します。GitHub Actionsでも実施し、失敗時の証跡をArtifactsに保存します。

## Phase 2: traffic and connected workplaces

- Road tiles form deterministic 4-neighbor connected networks.
- Buildings use the lowest-index adjacent road tile for access. Jobs in disconnected road components cannot employ residents of another component.
- A multi-source shortest-road search calculates representative commuter routes to the nearest job-access tile. Workplace delivery demand adds local freight load.
- Road traffic volume uses a nominal capacity of 85 weighted trips per road cell; congestion is a BPR-inspired gameplay approximation, not a literal traffic count or minutes.
- Congestion reduces resident happiness and enterprise-derived revenue; unreachable employment reduces employed population.
- The **交通・物流** tab visualizes road-load colors and reports congestion, average road-cell commute distance, network components, and affected households.
- Traffic analysis is derived on demand and **never saved**. City save schema remains v1, so existing IndexedDB/JSON cities continue to load.

### Quality

`npm run verify` checks TypeScript, Vitest and Vite build. The GitHub Actions workflow also runs Playwright Chromium tests on desktop and mobile emulation. E2E checks the traffic tab, map legend, and core interactions.

Deferred: dynamic lane capacity, intersections/signals, public transit, destination-choice capacity matching, dedicated freight origin-destination routes, and alternate-route congestion assignment.


### Phase 2 mobility-policy lever
- New **公共交通重視** city policy models public-transport subsidies and staggered commutes. Aggregate equivalent peak car trips fall to 45% of normal; employment does not fall.
- City operating expenses increase by 90 C + 0.14 C × population per month.
- When congestion is high, reduced traffic may recover resident happiness and enterprise efficiency; the municipal budget pays for the improvement. It is not an automatic free bonus.
- This is an economy-level policy, not yet a rendered physical bus or rail network. Save schema remains v1; previous policies and saves remain compatible.

## Phase 2-4: 幹線道路への改良

- 既存の一般道路 (`roads=1`) を建設ツール「幹線道路」で `roads=2` に改良。ドラッグ一括改良・Undo・撤去に対応。
- 工事費: **420 C/タイル**。道路交通容量: **85 → 220**。月次維持費: **0.85 → 3.25 C/タイル**（基本行政費とは別）。
- 幹線道路は見た目と交通ヒートマップの双方に反映。道路接続・住宅開発条件も従来どおり維持。
- 保存は既存の `schema:1` の `roads[]` に `2` を追加する方式で、旧データの `0,1` はそのまま読み込める。旧クライアントへ戻すと新データは読み込めないため、更新前のエクスポートを推奨。
- 注意: 車線数や速度を個別シミュレートするものではなく、混雑度を交通容量で近似したゲーム用モデル。

## Phase 2-5: 土地評価（開発立地の基礎）

- 64×64タイルを0〜100で評価。道路接続・水辺・公園・学校・診療所・商業施設・工業汚染・幹線道路の騒音・混雑などを反映する**ゲーム上の魅力度**。
- 「住民と人口」タブで評価ヒートマップと住宅地平均・高評価土地を表示。選択した土地でも評価値を確認可能。
- 自動開発候補は土地評価に応じた重み付き抽選に変更。住宅は高評価、工業は低評価、商業は中位の立地を選びやすくするが、各地区が必ず発展する保証はない。
- 数値は不動産価格や家賃の通貨額ではない。地価税・賃料・家計連動は将来の段階で追加。
- ヒートマップは都度再計算される派生データ。セーブ形式（schema 1）へ項目は追加しない。

## Phase 2-6: 住宅需要・家賃・雇用・人口移動

- `Building.residents` を実際の**入居人数**として扱い、住宅容量は既存の建物レベルから算出（Lv1=12、Lv2=18、Lv3=24人）。既存セーブの住宅入居人数はそのまま使い、schema 1を維持。
- **新築住宅は空室から開始**。利用可能な住宅容量、職場の求人、住民満足度、推定家賃負担に応じて毎月入居し、失業・生活費高騰・満足度低下によって転出も発生。
- 月間推定家賃（C／人）と住居負担率は、土地評価・想定世帯所得・住宅供給不足を使った**ゲーム用の市場指標**。実際の家計決済・家主間の送金や市税に家賃額を二重計上するものではありません。
- 入居・転出は好条件・悪条件の順で住宅に配分。市外からの人口移動は簡易集計モデルで、個々の世帯の年齢や収入は未実装です。
- 「住民と人口」タブに住宅の収容人数・空き・推定家賃・家賃負担率・住居負担のしやすさ・来月の人口移動予測を表示。予測は建設・政策変更・時間経過によって更新されます。
- 派生の土地評価・家賃・人口移動予測をセーブへ蓄積しません。履歴は既存の120か月制限を維持し、継続シミュレーションの再現性をテストします。
- 今後: 住宅の建設投資主体、家主の家賃収支、世帯所得分布、年齢・出生死亡、補助金・住宅政策と地価課税。


## Phase 2-7: 30〜100年の耐久・セーブ回帰検証

`tests/soak.test.ts` で以下をGitHub Actionsの単体テストと同時に検証します。

- **標準都市：100年（1,200か月）**。同じ都市を600か月進めてJSONセーブ・復元し、さらに600か月進めた結果と完全一致すること。
- **公共交通重視：100年**。政策を維持したまま計算・会計・セーブ状態が正常であること。
- **雇用崩壊：30年（360か月）**。職場と商工業用地区を除いた都市で転出が生じ、入居者が負数にならないこと。
- 各シナリオで、人口・財政・住宅容量・満足度の値、履歴最大120件、建物数最大マップタイル数を検証。
- JSON化した都市状態は**500KB未満**を回帰基準に設定。地価・交通量・家賃推定の派生キャッシュはセーブに追加しません。
- GitHub Actionsログへ経過月数・人口・資金・空室・建物数・セーブサイズ・所要時間を出力します。

これは**ヘッドレスの都市計算とセーブ検証**です。100年分の実ブラウザ描画やCloudflareのネットワーク転送を継続実行する試験ではありません。長期性能値はCI実行環境によって変動するため、今回のテストでは実行時間を固定閾値で合否判定しません。

## Phase 2-8: 100年耐久テストで発見した人口消失・幽霊税収の是正

- 100年実行で**人口0人なのに企業収入が発生し続ける**問題を検出。企業収入を到達可能な従業員／雇用枠の稼働率で補正し、就業者ゼロなら法人税収もゼロにする。
- 商工業の空き求人、住宅の空室を超過して都市が無制限に増築されないよう、需給に応じた建築候補フィルタを追加。
- 工場数に比例して無制限に増加していた公害負荷を適度に上限化し、過密や渋滞による生活満足度低下を調整。移住条件も低満足度下で完全停止する硬い閾値を緩和。
- CIの100年検証へ標準都市・公共交通重視都市の**人口が0人にならない**合格条件を追加。労働者のいない都市では企業収入が発生しない単体テストを追加。
- これらは長期に成立するゲームプレイの暫定調整値であり、政策別経済バランスは次フェーズの追加検証対象。

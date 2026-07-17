// 縦画面（ポートレート 9:16）のキャンバス
const ASPECT_W = 9;
const ASPECT_H = 16;
const MARGIN_Y = 60; // 上下の余白（px）

// ---- 背景：クラゲ写真をシェーダーのノイズで水面のように歪ませる（一番背後のレイヤー） ----
// （programmingBasicBPoster 由来。WEBGLバッファでシェーダー処理し、2Dキャンバスへ貼る）
let bgImg;        // 元のクラゲ画像
let bgPhotoBuf;   // クラゲをキャンバスに cover 配置した2Dバッファ（テクスチャ元）
let bgGL;         // WEBGL バッファ（ここでシェーダー歪ませ）
let bgShader;
let bgShaderSrc = null;     // シェーダーのソース文字列 { vert, frag }（fetch して保持）
let bgReady = false;        // シェーダー・バッファの準備ができたか
const BG_GL_SCALE = 0.5;    // 背景シェーダーの計算解像度（1=フル, 0.5=半分=負荷1/4）

// 背景の調整（Tweakpane）
const bg_p = {
  show: true,            // 背景を描くか
  scale: 1.45,           // 拡大縮小
  rotation: -3.14,       // 回転（ラジアン）
  offsetX: 130,          // 位置 X（px）
  offsetY: 957,          // 位置 Y（px）
  distortStrength: 0.152, // 横揺れの強さ（シェーダーの offset 量）
  distortSpeed: 0.82,    // 横揺れの速さ（時間スケール）
  edgeFade: 0.455,       // 縁を黒へフェードさせる幅（UV単位 0〜0.5, 0で無効）
  edgeFadeNoise: 0.29,   // 縁の滲み（境目）をノイズで揺らす量
};

// 直線族の包絡線（ストリングアート）
// 一辺を動く点 A と もう一辺を動く点 B を結ぶ直線を多数引くと、
// 放物線状の包絡線が浮かび、端で密集・中央で広がる模様になる。

// Tweakpane で調整するパラメータ
const params = {
  // 背景の漂う線（main10 由来：円運動しながらノイズで漂うトレイル線）
  flowShow: true,        // 描くか
  flowNum: 86,           // 線の本数
  flowTrail: 320,        // 1本の線の長さ（トレイルの点数）
  flowStrokeW: 1,        // 線の太さ
  flowSpeed: 3.1,        // 円運動の速度
  flowMinRadius: 50,     // 一番小さい円の半径
  flowMaxRadius: 350,    // 一番大きい円の半径
  flowDriftSpeed: 1.5,   // 円の中心が漂う速さ
  flowR: 50,             // 線の色（くらげの青）
  flowG: 108,
  flowB: 230,

  // 背景の稲妻（main20 由来）：縦に蛇行するパスから左右へ横線を引く。
  // Q キー（=クリック）でパスを引き直して更新。
  boltShow: true,        // 描くか
  boltWander: 119,       // 中央からの蛇行の振れ幅（px）
  boltLenMin: 130,       // 横線の長さの最小
  boltLenMax: 243,       // 横線の長さの最大
  // 縦間隔（密度）：上・中央・下の3帯で密、その間で疎にする。
  boltStepDense: 14,     // 密集帯での縦間隔（小さいほど密）
  boltStepSparse: 35,    // それ以外での縦間隔（大きいほど疎）
  boltBandWidth: 0.18,   // 各密集帯の効く幅（0〜0.5, キャンバス高さに対する割合）
  // 線幅のランダム範囲
  boltWMin: 0.5,         // 線幅の最小
  boltWMax: 2.25,        // 線幅の最大
  // グラデーション色（左→右）。Tweakpane のカラーピッカー（スポイト可）で調整
  boltColorL: { r: 120, g: 200, b: 255 }, // 左：水色
  boltColorR: { r: 150, g: 60, b: 220 },  // 右：紫

  // 人物ローポリ（main21）：カメラで全身をドロネー三角分割でポリゴン化
  polyShow: true,        // 描くか
  polyX: 0,              // 横位置（px, 中心からのずれ）
  polyY: 130,            // 縦位置（px, 中心からのずれ）
  polyFraction: 1.8,     // 全身がキャンバスの何割を占めるか（サイズ）
  polyPointCount: 850,   // 散布する点の数
  polyUpdateEvery: 7,    // 点配置を何フレームごとに更新するか
  // 横切る人への即応：bbox の中心移動/サイズ変化が「体サイズ×この割合」を超えたら
  // 上の周期を待たずに即再散布する。静止時（揺れ・呼吸）では届かない値にしてあり、
  // 立ち止まっている人の見た目には影響しない。
  polyMoveRescatter: 0.1,
  polyDarkBias: 3.4,     // 暗部に点を寄せる強さ
  polyTrackSmooth: 0.06, // bbox追従の平滑化
  polyContrastSmooth: 0.08, // コントラストの平滑化
  polyDarkThreshold: 22, // これ以下の明度は最も暗い色
  polyMirror: true,      // 左右反転（鏡像）
  polyWireframe: true,   // 三角形の縁線を表示
  polyWireAlpha: 0,      // 縁線の不透明度（普段は0、Qで一時的に上がる）
  polyWirePeak: 180,     // Q 発火時に縁線 alpha が跳ね上がるピーク値（強め）
  polyWireDecay: 0.98,   // 縁線ブーストの減衰率（1に近いほどゆっくり消える、約2秒）
  // グラデーション（上＝青→下＝緑）。青を明るめ・領域広めに
  polyColorTop: { r: 40, g: 90, b: 200 },    // 上の色（明るい青）
  polyColorBottom: { r: 140, g: 255, b: 0 }, // 下の色（緑）
  polyGradBias: 1.7,     // グラデの偏り（>1で青の領域が広がる）
  // マスク異常対策（放置後にマスクが「全面＝人物」になったまま固まる不具合への防御）。
  // 正常な運用では発動せず、描画には一切影響しない保守的な値にしてある。
  polyMaxCoverage: 0.9,  // 人物がフレームのこの割合を超えたら異常マスクとみなして描かない
  polyStaleSec: 3,       // マスク更新がこの秒数途絶えたらセグメンテーションを自動再起動

  // 動き検出ボックス（main22）：動いた領域を四角枠で囲み、中心点を近接リンクで結ぶ
  boxOn: true,           // 検出ボックスを描くか
  boxMotionGrid: 24,     // 動き検出グリッドのセル数（横方向）
  boxMotionThresh: 5,    // 動きと見なす輝度差のしきい値
  boxMinCells: 3,        // ボックスとして採用する最小セル数
  boxSmooth: 0.5,        // ボックスの位置・サイズの平滑化
  boxHold: 8,            // 検出が途切れても保持するフレーム数
  boxWeight: 1.5,        // 枠線の太さ
  boxDot: 4,             // 中心点の大きさ（直径px, 0で非表示）
  boxLinkOn: true,       // 中心点同士を線でつなぐ
  boxLinkDist: 280,      // この距離(px)以内の点だけ繋ぐ
  boxLinkWeight: 1,      // 接続線の太さ
  boxColor: { r: 228, g: 4, b: 158 }, // 線・点の色（ピンク）
  boxDash: true,         // 線を点線にするか
  boxDashLen: 8,         // 点線の実線部の長さ（px）
  boxGapLen: 6,          // 点線の隙間の長さ（px）

  // Q アニメの自動発動
  autoQ: true,           // 一定間隔で自動的に Q を発火するか
  autoQSec: 7,           // 自動発動の間隔（秒）

  // ロゴ枠線なぞりアニメ（Qで再生）
  logoAnimDrawMs: 1400,  // 輪郭を描き終えるまでの時間（ms）
  logoAnimFadeMs: 2200,  // 描き終えてから線が消えるまでの時間（ms）
  logoAnimWeight: 1.5,   // 線の太さ（表示px目安）
  logoAnimOffsetX: 0,    // 線だけをずらす量（px, +で右へ）
  logoAnimOffsetY: -10,  // 線だけをずらす量（px, +で下へ）

  // ストリングアートと人物が重なる部分を別色（紺）にする
  stringOverlapMode: 'shape', // 'off' | 'shape'（人物形状） | 'bbox'（矩形範囲）
  stringOverlapColor: { r: 30, g: 45, b: 110 }, // 重なり部分の色（紺）

  // 回転して流れる図形のハッチング色（5セット個別）
  triColor: { r: 0, g: 7, b: 37 },       // 三角（暗い紺）
  cirColor: { r: 107, g: 106, b: 187 },  // 円（青紫）
  sqColor: { r: 0, g: 2, b: 8 },         // 正方形（ほぼ黒い紺）
  tri2Color: { r: 85, g: 113, b: 238 },  // 三角2（明るい青）
  sq2Color: { r: 47, g: 81, b: 233 },    // 正方形2（紺）

  stringShow: true, // ストリングアートを描くか（収納）
  lines: 46,        // 直線の本数
  spacingBias: 1.0, // 点の進み方の偏り（1=均等, >1で片端に密集）
  spanA: 1.15,      // 辺A側の張る割合（始点からの長さ比）
  spanB: 2,         // 辺B側の張る割合
  shiftA: 0.43,     // 辺A側の開始位置オフセット（割合）
  shiftB: -0.09,    // 辺B側の開始位置オフセット（割合）
  offsetY: -370,    // 全体を縦にずらす量（px, +で下へ）
  extend: 0.7,      // 包絡線を t 範囲の外へ延長する量（傾けても端が埋まる）
  rotate: 16,       // 全体の傾き（度, 中心まわりに回転）
  strokeW: 1,       // 線の太さ
  colorR: 0,        // 線の色（水色）
  colorG: 200,
  colorB: 255,
  colorA: 255,      // 線の不透明度（0=透明, 255=不透明）
  mirror: true,     // 左右ミラーを描くか
  // 下部の帯（横長の長方形）
  band: false,      // 帯を描くか
  bandH: 0.1,       // 帯の高さ（キャンバス高さに対する割合）
  bandR: 0,         // 帯の色（黒）
  bandG: 0,
  bandB: 0,
  // 帯の上のテキスト
  textScale: 1,     // 文字全体の大きさ倍率
  textOffsetX: -0.04, // 横位置オフセット（割合, +で右へ。キャンバス幅基準）
  textOffsetY: -0.04, // 帯内での縦位置オフセット（割合, +で下へ）
  lineGap: 1.0,     // 行間の倍率

  // 流れるハッチング三角形（main13）
  triShow: true,        // 三角形を描くか
  triFade: true,        // 領域端でフェードさせるか
  triRows: 3,           // 縦の段数
  triCols: 10,          // 横の個数（0=領域幅から自動計算）
  triSize: 68,          // 三角形の外接円の半径
  triSpacingX: 123,     // 横の間隔
  triSpacingY: 94,      // 縦の間隔
  triLineSpacing: 3,    // ハッチング線の間隔
  triLineW: 1.25,       // ハッチング線の太さ
  triSpeed: 1,          // 流れる速度（px / フレーム）
  triFadeWidth: 204,    // 領域端でフェードする幅（px）
  triPaddingX: 0,       // 領域の左右余白（canvas 端からのオフセット）
  triOffsetY: 674,      // 三角形帯の縦位置（px, +で下へ）
  triAnimFrames: 100,   // Q アニメーションの長さ（フレーム）

  // 転がるハッチング円（main17）
  cirShow: true,        // 円を描くか
  cirFade: true,        // 領域端でフェードさせるか
  cirRows: 2,           // 縦の段数
  cirCols: 6,           // 横の個数（0=領域幅から自動計算）
  cirSize: 43,          // 円の半径
  cirSpacingX: 103,     // 横の間隔
  cirSpacingY: 103,     // 縦の間隔
  cirLineSpacing: 4,    // ハッチング線の間隔
  cirLineW: 1,          // ハッチング線の太さ
  cirSpeed: 1,          // 流れる速度（px / フレーム）
  cirFadeWidth: 120,    // 領域端でフェードする幅（px）
  cirPaddingX: 0,       // 領域の左右余白（canvas 端からのオフセット）
  cirOffsetY: 130,      // 円帯の縦位置（px, +で下へ）
  cirAnimFrames: 127,   // Q アニメーションの長さ（フレーム）

  // 転がるハッチング正方形（main18）
  sqShow: true,         // 正方形を描くか
  sqFade: true,         // 領域端でフェードさせるか
  sqRows: 2,            // 縦の段数
  sqCols: 6,            // 横の個数（0=領域幅から自動計算）
  sqSize: 43,           // 半辺長（中心から辺までの距離）
  sqSpacingX: 115,      // 横の間隔
  sqSpacingY: 98,       // 縦の間隔
  sqLineSpacing: 4,     // ハッチング線の間隔
  sqLineW: 1,           // ハッチング線の太さ
  sqSpeed: 0.7,         // 流れる速度（px / フレーム）
  sqFadeWidth: 335,     // 領域端でフェードする幅（px）
  sqPaddingX: 535,      // 領域の左右余白（canvas 端からのオフセット）
  sqOffsetY: 326,       // 正方形帯の縦位置（px, +で下へ）
  sqAnimFrames: 100,    // Q アニメーションの長さ（フレーム）

  // 流れるハッチング三角形 2（複製）
  tri2Show: true,
  tri2Fade: true,
  tri2Rows: 2,
  tri2Cols: 10,
  tri2Size: 45,
  tri2SpacingX: 86,
  tri2SpacingY: 70,
  tri2LineSpacing: 3,
  tri2LineW: 0.75,
  tri2Speed: 1,
  tri2FadeWidth: 148,
  tri2PaddingX: 391,
  tri2OffsetY: -891,
  tri2AnimFrames: 100,

  // 転がるハッチング正方形 2（複製）
  sq2Show: true,
  sq2Fade: true,
  sq2Rows: 2,
  sq2Cols: 10,
  sq2Size: 37,
  sq2SpacingX: 103,
  sq2SpacingY: 94,
  sq2LineSpacing: 4,
  sq2LineW: 1,
  sq2Speed: 0.7,
  sq2FadeWidth: 161,
  sq2PaddingX: 0,
  sq2OffsetY: -457,
  sq2AnimFrames: 100,

  // ロゴ文字（IDD.svg を I / D / D に分割）
  lettersShow: true,    // 文字を表示するか
  lettersScale: 0.85,   // 3文字共通の基準スケール
  lettersX: 43,         // 3文字共通の横位置（px, 中心からのずれ）
  lettersY: -565,       // 3文字共通の縦位置（px, 中心からのずれ）
  // I
  iShow: true,
  iX: 0, iY: 0,         // 個別オフセット（px）
  iScale: 1.0,          // 個別スケール
  iRot: 0,              // 個別回転（度）
  iAlpha: 255,          // 不透明度
  // D（左）
  d1Show: true,
  d1X: 0, d1Y: 0,
  d1Scale: 1.0,
  d1Rot: 0,
  d1Alpha: 255,
  // D（右）
  d2Show: true,
  d2X: 0, d2Y: 0,
  d2Scale: 1.0,
  d2Rot: 0,
  d2Alpha: 255,

  // ロゴ文字2（Logo.svg を I / D / D / D の4文字に分割）
  l2Show: true,         // 表示するか
  l2Scale: 0.9,         // 4文字共通の基準スケール
  l2X: -217,            // 4文字共通の横位置（px, 中心からのずれ）
  l2Y: 174,             // 4文字共通の縦位置（px, 中心からのずれ）
  // I
  l2iShow: true,
  l2iX: 0, l2iY: 0, l2iScale: 1.0, l2iRot: 0, l2iAlpha: 255,
  // D（1番目）
  l2d1Show: true,
  l2d1X: 0, l2d1Y: 0, l2d1Scale: 1.0, l2d1Rot: 0, l2d1Alpha: 255,
  // D（2番目）
  l2d2Show: true,
  l2d2X: 0, l2d2Y: 0, l2d2Scale: 1.0, l2d2Rot: 0, l2d2Alpha: 255,
  // D（3番目）
  l2d3Show: true,
  l2d3X: 0, l2d3Y: 0, l2d3Scale: 1.0, l2d3Rot: 0, l2d3Alpha: 255,

  // アンパサンド記号（&.svg、1文字）
  ampShow: true,
  ampX: 174, ampY: 370, ampScale: 1.01, ampRot: 0, ampAlpha: 255,

  // "design" ロゴ（design.svg を d/e/s/i/g/n の6文字に分割）
  deShow: true,         // 表示するか
  deScale: 0.85,        // 6文字共通の基準スケール
  deX: 43,              // 共通の横位置（px, 中心からのずれ）
  deY: 587,             // 共通の縦位置（px, 中心からのずれ）
  ddShow: true,  ddX: 0, ddY: 0, ddScale: 1.0, ddRot: 0, ddAlpha: 255, // d
  deeShow: true, deeX: 0, deeY: 0, deeScale: 1.0, deeRot: 0, deeAlpha: 255, // e
  dsShow: true,  dsX: 0, dsY: 0, dsScale: 1.0, dsRot: 0, dsAlpha: 255, // s
  diShow: true,  diX: 0, diY: 0, diScale: 1.0, diRot: 0, diAlpha: 255, // i
  dgShow: true,  dgX: 0, dgY: 0, dgScale: 1.0, dgRot: 0, dgAlpha: 255, // g
  dnShow: true,  dnX: 0, dnY: 0, dnScale: 1.0, dnRot: 0, dnAlpha: 255, // n

  // メインロゴ（logomain.svg、単一ロゴ）
  lmShow: true,
  lmX: -326, lmY: -543, lmScale: 0.31, lmRot: 0, lmAlpha: 255,

  // "system" ロゴ（system.svg を s/y/s/t/e/m の6文字に分割）
  syShow: true,         // 表示するか
  syScale: 0.69,        // 6文字共通の基準スケール
  syX: 239,             // 共通の横位置（px, 中心からのずれ）
  syY: 739,             // 共通の縦位置（px, 中心からのずれ）
  ss1Show: true, ss1X: 0, ss1Y: 0, ss1Scale: 1.0, ss1Rot: 0, ss1Alpha: 255, // s
  syyShow: true, syyX: 0, syyY: 0, syyScale: 1.0, syyRot: 0, syyAlpha: 255,  // y
  ss2Show: true, ss2X: 0, ss2Y: 0, ss2Scale: 1.0, ss2Rot: 0, ss2Alpha: 255, // s
  stShow: true,  stX: 0, stY: 0, stScale: 1.0, stRot: 0, stAlpha: 255,       // t
  seShow: true,  seX: 0, seY: 0, seScale: 1.0, seRot: 0, seAlpha: 255,       // e
  smShow: true,  smX: 0, smY: 0, smScale: 1.0, smRot: 0, smAlpha: 255,       // m

  // 日付ロゴ（2026.06.04.svg を 10文字に分割）。dt〜 は共通設定
  dtShow: true,
  dtScale: 0.74,        // 10文字共通の基準スケール
  dtX: 109,             // 共通の横位置（px, 中心からのずれ）
  dtY: -435,            // 共通の縦位置（px, 中心からのずれ）
  // 各文字（2 0 2 6 . 0 6 . 0 4）：dtc0〜dtc9
  dtc0Show: true, dtc0X: -87, dtc0Y: 0, dtc0Scale: 1.0, dtc0Rot: 0, dtc0Alpha: 255, // 2
  dtc1Show: true, dtc1X: -87, dtc1Y: 0, dtc1Scale: 1.0, dtc1Rot: 0, dtc1Alpha: 255, // 0
  dtc2Show: true, dtc2X: -87, dtc2Y: 0, dtc2Scale: 1.0, dtc2Rot: 0, dtc2Alpha: 255, // 2
  dtc3Show: true, dtc3X: -87, dtc3Y: 0, dtc3Scale: 1.0, dtc3Rot: 0, dtc3Alpha: 255, // 6
  dtc4Show: true, dtc4X: -65, dtc4Y: 0, dtc4Scale: 1.0, dtc4Rot: 0, dtc4Alpha: 255, // .
  dtc5Show: true, dtc5X: -43, dtc5Y: 0, dtc5Scale: 1.0, dtc5Rot: 0, dtc5Alpha: 255, // 0
  dtc6Show: true, dtc6X: -43, dtc6Y: 0, dtc6Scale: 1.0, dtc6Rot: 0, dtc6Alpha: 255, // 6
  dtc7Show: true, dtc7X: -22, dtc7Y: 0, dtc7Scale: 1.0, dtc7Rot: 0, dtc7Alpha: 255, // .
  dtc8Show: true, dtc8X: 0, dtc8Y: 0, dtc8Scale: 1.0, dtc8Rot: 0, dtc8Alpha: 255, // 0
  dtc9Show: true, dtc9X: 0, dtc9Y: 0, dtc9Scale: 1.0, dtc9Rot: 0, dtc9Alpha: 255, // 4
};

// 分割した文字SVGのDOM要素（ベクターのまま表示してジャギーを防ぐ）
let domI, domD1, domD2;
// 各 SVG の元サイズ（viewBox 基準）。ロード後に取得して transform 計算に使う
const SVG_W = 544.25;
const SVG_H = 214.79;

// ロゴ2（IDDD）の DOM 要素と元サイズ
let domL2I, domL2D1, domL2D2, domL2D3;
const SVG2_W = 533.53;
const SVG2_H = 216.11;

// アンパサンド（&）の DOM 要素と元サイズ
let domAmp;
const AMP_W = 144;
const AMP_H = 163.69;

// "design" の DOM 要素と元サイズ
let domDeD, domDeE, domDeS, domDeI, domDeG, domDeN;
const DES_W = 820.07;
const DES_H = 228.57;

// メインロゴ（logomain.svg）の DOM 要素と元サイズ
let domLM;
const LM_W = 955;
const LM_H = 940;

// "system" の DOM 要素と元サイズ
let domSyS1, domSyY, domSyS2, domSyT, domSyE, domSyM;
const SYS_W = 835.99;
const SYS_H = 206.14;

// 日付ロゴ（2026.06.04.svg、10文字）の DOM 要素と元サイズ
let domDate = [];
const DATE_W = 412.79;
const DATE_H = 63.92;
// 各文字SVGのファイル名（2 0 2 6 . 0 6 . 0 4 の順）
const DATE_FILES = [
  'date_d2_a.svg', 'date_d0_a.svg', 'date_d2_b.svg', 'date_d6_a.svg', 'date_dot_a.svg',
  'date_d0_b.svg', 'date_d6_b.svg', 'date_dot_b.svg', 'date_d0_c.svg', 'date_d4_a.svg',
];

// 各図形のアニメーション状態（Q キーで波アニメ）。
// 三角形・正方形は2セット分。generic 関数が animating/animT を書き換える。
const triState = { animating: false, animT: 0 };
const tri2State = { animating: false, animT: 0 };
const sqState = { animating: false, animT: 0 };
const sq2State = { animating: false, animT: 0 };

// 転がる円のアニメーション状態（円は専用関数のまま）
let cirColsN = 0;      // 実際に描く円の横の個数（自動計算 or 手動）
let cirAnimating = false;
let cirAnimT = 0;

// 背景の漂う線（main10）の状態
let flowLines = [];
const FLOW_NOISE_SCALE = 0.0008;
const FLOW_TIME_SCALE = 0.005;

// 背景の稲妻（main20）の状態。
// 横線のセグメント一式を生成時に確定して保持し、毎フレーム同じ稲妻を描く
// （Q キーで引き直すまで固定）。
let boltSegments = []; // { y, x0, x1, w } の配列

// flow の速度ブースト：Qで一気に上がり、毎フレーム 1.0 へ減衰する倍率
let flowBoost = 1;             // 現在の速度倍率（1 = 通常）
const FLOW_BOOST_ON = 6;       // Q を押した瞬間の倍率
const FLOW_BOOST_DECAY = 0.94; // 1フレームあたりの減衰率（1に近いほどゆっくり戻る）
// 加速の瞬間に線も少し太くする量（flowBoost の超過分にこの割合だけ太さへ反映）
const FLOW_BOOST_WIDTH_FACTOR = 0.18;

// 背景クラゲ画像を描画前に読み込む
function preload() {
  bgImg = loadImage('assets/kurage.png');

  // 人物ローポリ（main21）の ml5 モデルを preload で生成（ロード完了まで p5 が待つ）
  if (typeof ml5 !== 'undefined' && ml5.bodySegmentation) {
    polySeg = ml5.bodySegmentation('SelfieSegmentation', { maskType: 'person' });
  }
  if (typeof ml5 !== 'undefined' && ml5.handPose) {
    polyHandPose = ml5.handPose();
  }
}

function setup() {
  const canvas = createCanvas(...portraitSize());
  canvas.parent('canvas-wrap');

  // 線専用オーバーレイ canvas を、ロゴ <img> より手前に重ねて作る
  setupOverlay();

  // 背景（クラゲ＋シェーダー）を準備
  setupBackground();
  // 背景の漂う線を初期化
  initFlow();
  // 背景の稲妻を生成
  generateBolt();
  // 人物ローポリ（カメラ）を準備
  setupPoly();

  // SVG（ロゴ文字）を DOM 要素として作成しキャンバスに重ねる（ベクターのまま＝鮮明）
  domI = makeLetterDom('assets/I.svg');
  domD1 = makeLetterDom('assets/D1.svg');
  domD2 = makeLetterDom('assets/D2.svg');

  // ロゴ2（IDDD）も同様に DOM 要素として作成
  domL2I = makeLetterDom('assets/L_I.svg');
  domL2D1 = makeLetterDom('assets/L_D1.svg');
  domL2D2 = makeLetterDom('assets/L_D2.svg');
  domL2D3 = makeLetterDom('assets/L_D3.svg');

  // アンパサンド（&）。1文字なので単独で作成
  domAmp = makeLetterDom('assets/amp.svg');

  // "design" の6文字
  domDeD = makeLetterDom('assets/des_d.svg');
  domDeE = makeLetterDom('assets/des_e.svg');
  domDeS = makeLetterDom('assets/des_s.svg');
  domDeI = makeLetterDom('assets/des_i.svg');
  domDeG = makeLetterDom('assets/des_g.svg');
  domDeN = makeLetterDom('assets/des_n.svg');

  // メインロゴ（単一）
  domLM = makeLetterDom('assets/logomain.svg');

  // "system" の6文字
  domSyS1 = makeLetterDom('assets/sys_s1.svg');
  domSyY = makeLetterDom('assets/sys_y.svg');
  domSyS2 = makeLetterDom('assets/sys_s2.svg');
  domSyT = makeLetterDom('assets/sys_t.svg');
  domSyE = makeLetterDom('assets/sys_e.svg');
  domSyM = makeLetterDom('assets/sys_m.svg');

  // 日付ロゴ（10文字）
  domDate = DATE_FILES.map((f) => makeLetterDom('assets/' + f));

  try {
    setupPane();
  } catch (e) {
    console.warn('パネル初期化に失敗:', e);
  }
}

// 各ロゴ要素ごとの「輪郭ポリライン」一覧（枠線なぞりアニメ用）。
// makeLetterDom で SVG の path を getPointAtLength でサンプリングして作る。
// outlineByDom: Map<imgElement, { contours: [{pts:[{x,y}], len}], totalLen, vbW, vbH }>
const letterOutlines = new Map();

// 枠線なぞりアニメの状態（Qで再生）。時間/太さは params で調整。
let logoAnimActive = false;
let logoAnimStartMs = 0;
// このフレームで配置した各文字の描画情報（輪郭線を帯より後に描くため貯める）
// { el, cx, cy, sc, rot, svgW, svgH }
let logoPlacements = [];
// 線専用のオーバーレイ canvas（ロゴ <img> より手前に重ねる）とその 2D context
let overlayCanvas = null;
let overlayCtx = null;
// Q アニメの自動発動：最後に発火した時刻（ms）
let lastAutoQMs = 0;
// 人物 wireAlpha のブースト：Q で peak へ跳ね上がり、毎フレーム 0 へ減衰する加算量
let polyWireBoost = 0;

// ---- 人物ローポリ（main21）の状態 ----
const POLY_COLOR_TOP = [18, 28, 70];    // 暗めの紺（上）
const POLY_COLOR_BOTTOM = [140, 255, 0]; // 緑（下）
let polyVideo = null;
let polySeg = null;        // bodySegmentation モデル
let polyHandPose = null;   // handPose モデル
let polySegMask = null;
let polyHands = [];
let polyReady = false;     // カメラ準備完了か
// スムージング状態
let polySmoothMinB = 0, polySmoothMaxB = 255;
let polySmoothCenterX = 0, polySmoothCenterY = 0, polySmoothBodySize = 0;
let polyCenterInit = false;
let polySMinX = 0, polySMaxX = 0, polySMinY = 0, polySMaxY = 0;
let polyBboxInit = false;
let polyPoints = [];
let polyFrameSinceUpdate = 0;
// ドロネー三角分割の結果キャッシュ（点が更新されたフレームだけ作り直す）
let polyTris = null;
// このフレームで polyVideo/polySegMask の loadPixels を済ませたか（重複読み込み回避）
let polyPixelsFrame = -1;
// マスク異常対策の状態
let polySegMaskAtMs = 0;    // 最後にセグメンテーション結果を受け取った時刻（ms）
let polySegStartAtMs = 0;   // 最後に detectStart した時刻（ms）。再起動のクールダウンを兼ねる
let polyInvalidFrames = 0;  // 異常/無人マスクが連続したフレーム数（一定数で追跡状態をリセット）
let polyRestartCount = 0;   // セグメンテーションを再起動した回数（ログ用）
let lastDrawMs = 0;         // 前回 draw() の時刻。タブ非表示等からの復帰検出に使う
// 横切る人への即応（移動検出）用：最後に点を散布した時点の bbox 中心とサイズ
let polyLastScatterCX = 0, polyLastScatterCY = 0, polyLastScatterBody = 0;
let polyScatterInit = false;
// Tweakpane の参照（H キーで表示/非表示を切り替える）
let tweakPane = null;
// 人物のキャンバス座標での矩形範囲（重なり判定用）。{x,y,w,h} または null
let polyCanvasBox = null;
// 動き検出ボックス（main22）の状態
let boxPrevGrid = null;
let boxPrevGridW = 0, boxPrevGridH = 0;
let boxTracked = []; // [{x,y,w,h,life}]（マスク座標系）
// 人物シルエットのマスクバッファ（白=人物）。shape モードのクリップに使う
let polyMaskG = null;
// 紺ストリングアートを切り抜くためのオフスクリーンバッファ
let stringOverlayG = null;

// 線専用のオーバーレイ canvas を .canvas-wrap 内に作る。
// ロゴ <img>（.letter）より後に追加 + z-index で最前面にし、線をロゴ本体の上に出す。
function setupOverlay() {
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.className = 'overlay-lines';
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  wrap.appendChild(overlayCanvas);
  overlayCtx = overlayCanvas.getContext('2d');
}

// オーバーレイのサイズをメイン canvas に合わせる（リサイズ時に呼ぶ）
function resizeOverlay() {
  if (!overlayCanvas) return;
  overlayCanvas.width = width;
  overlayCanvas.height = height;
}

// SVG を <img> として .canvas-wrap 内に絶対配置で作る（色は元のグラデのまま安全）。
// 併せて、枠線なぞりアニメ用に SVG の path 輪郭をサンプリングして保持する。
function makeLetterDom(src) {
  const el = createImg(src, 'IDD');
  el.parent('canvas-wrap');
  el.class('letter');
  // 輪郭サンプリング（非同期。fetch → DOMParse → getPointAtLength）
  sampleSvgOutline(src, el.elt);
  return el;
}

// SVG の各 path を等間隔サンプリングして輪郭ポリラインを作り、letterOutlines に保存。
function sampleSvgOutline(src, imgEl) {
  fetch(src)
    .then((r) => r.text())
    .then((svgText) => {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return;
      // viewBox の幅・高さ（要素表示サイズへのスケールに使う）
      const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
      const vbW = vb[2] || 1;
      const vbH = vb[3] || 1;

      // getPointAtLength を使うため、一時的に DOM に挿入（非表示）して計測する
      svg.style.position = 'absolute';
      svg.style.left = '-99999px';
      svg.style.width = vbW + 'px';
      svg.style.height = vbH + 'px';
      document.body.appendChild(svg);

      const geoms = svg.querySelectorAll('path, polygon, polyline');
      const contours = [];
      let totalLen = 0;
      const STEP = 8;          // サンプリング間隔（viewBox 単位, px）。粗めで負荷減
      const MAX_PTS = 200;     // 1輪郭あたりの最大点数（重さの上限）
      geoms.forEach((g) => {
        if (typeof g.getTotalLength !== 'function') return; // polygon 等で未対応なら飛ばす
        let L = 0;
        try { L = g.getTotalLength(); } catch (e) { L = 0; }
        if (!L || L < 1) return;
        const pts = [];
        const n = Math.min(MAX_PTS, Math.max(2, Math.ceil(L / STEP)));
        for (let i = 0; i <= n; i++) {
          try {
            const p = g.getPointAtLength((i / n) * L);
            pts.push({ x: p.x, y: p.y });
          } catch (e) { /* 1点失敗は無視 */ }
        }
        if (pts.length >= 2) {
          contours.push({ pts, len: L });
          totalLen += L;
        }
      });

      document.body.removeChild(svg);
      letterOutlines.set(imgEl, { contours, totalLen, vbW, vbH });
    })
    .catch((e) => console.warn('輪郭サンプリング失敗:', src, e));
}

// 全ロゴの枠線なぞりアニメを再生（Qで呼ぶ）
function playLogoAnim() {
  logoAnimActive = true;
  logoAnimStartMs = millis();
}

// クラゲ画像を cover 配置した2Dバッファと、歪ませ用 WEBGL バッファ／シェーダーを用意。
// キャンバスサイズに合わせて作る（windowResized で作り直す）。
function setupBackground() {
  bgReady = false;
  if (!bgImg) return;

  // クラゲをキャンバス全面に cover フィット
  bgPhotoBuf = createGraphics(width, height);
  bgPhotoBuf.pixelDensity(1);
  const iw = bgImg.width;
  const ih = bgImg.height;
  const sc = Math.max(width / iw, height / ih);
  const dw = iw * sc;
  const dh = ih * sc;
  bgPhotoBuf.image(bgImg, (width - dw) / 2, (height - dh) / 2, dw, dh);

  // 歪ませ用 WEBGL レイヤーは低解像度で計算して負荷を下げる
  const gw = Math.max(1, Math.round(width * BG_GL_SCALE));
  const gh = Math.max(1, Math.round(height * BG_GL_SCALE));
  bgGL = createGraphics(gw, gh, WEBGL);
  bgGL.pixelDensity(1);

  // シェーダーを createShader で作る。
  // p5 の loadShader は preload 専用で setup 内から呼ぶと _decrementPreload エラーになるため、
  // ファイルを fetch でテキスト取得して createShader する（preload カウンタに依存しない）。
  // シェーダーは bgGL コンテキストに紐づくので、bgGL を作り直すたびに作り直す必要がある。
  const buildShaderFor = (glBuf, vert, frag) => {
    bgShader = glBuf.createShader(vert, frag);
    bgReady = true;
  };
  if (bgShaderSrc) {
    // ソース取得済み（リサイズ時）：新しい bgGL 用に作り直すだけ
    buildShaderFor(bgGL, bgShaderSrc.vert, bgShaderSrc.frag);
  } else {
    Promise.all([
      fetch('distort.vert').then((r) => r.text()),
      fetch('distort.frag').then((r) => r.text()),
    ]).then(([vert, frag]) => {
      bgShaderSrc = { vert, frag };
      buildShaderFor(bgGL, vert, frag);
    }).catch(() => {
      bgReady = false; // 失敗時は静止画フォールバック
    });
  }
}

// 背景（歪ませたクラゲ）をキャンバスに描く。shader 未準備時は静止画フォールバック。
// bg_p の scale / rotation / offset で、貼り付ける側を変形する。
function drawBackground() {
  if (!bgPhotoBuf) return;

  // 揺らした（または素の）背景画像を tex に用意
  let tex = bgPhotoBuf;
  if (bgReady && bgShader && bgGL) {
    try {
      const gw = bgGL.width;
      const gh = bgGL.height;
      bgGL.shader(bgShader);
      bgShader.setUniform('u_tex', bgPhotoBuf);
      bgShader.setUniform('u_resolution', [gw, gh]);
      bgShader.setUniform('u_time', millis() / 1000.0);
      bgShader.setUniform('u_strength', bg_p.distortStrength);
      bgShader.setUniform('u_speed', bg_p.distortSpeed);
      bgShader.setUniform('u_fade', bg_p.edgeFade);
      bgShader.setUniform('u_fadeNoise', bg_p.edgeFadeNoise);
      bgGL.noStroke();
      bgGL.rect(-gw / 2, -gh / 2, gw, gh);
      tex = bgGL;
    } catch (e) {
      tex = bgPhotoBuf; // shader 失敗時は静止画
    }
  }

  // キャンバス中心を基準に、位置・回転・拡大縮小をかけて貼る
  push();
  imageMode(CENTER);
  translate(width / 2 + bg_p.offsetX, height / 2 + bg_p.offsetY);
  rotate(bg_p.rotation);
  scale(bg_p.scale);
  image(tex, 0, 0, width, height);
  pop();
  imageMode(CORNER); // 既定に戻す
}

// 背景の漂う線（main10）を初期化。本数や半径を変えたら呼び直す。
function initFlow() {
  flowLines = [];
  for (let i = 0; i < params.flowNum; i++) {
    const x = random(width);
    const y = random(height);
    const radius = random(params.flowMinRadius, params.flowMaxRadius);
    const turn = (params.flowSpeed / radius) * (Math.random() < 0.5 ? 1 : -1);
    flowLines.push({
      x, y,
      angle: random(Math.PI * 2),
      turn,
      points: [{ x, y }],
      seed: Math.random() * 1000,
    });
  }
}

// 背景の漂う線を描く（円運動 + パーリンノイズで漂う、トレイル付き）。
// 色は flowR/G/B（くらげの青と同じ水色）。トレイルは古い側が透明→新しい側が不透明。
function drawFlow() {
  if (flowLines.length !== params.flowNum) initFlow();

  // 加速中(flowBoost>1)は線も少し太く。減衰とともに元の太さへ戻る。
  const widthMul = 1 + (flowBoost - 1) * FLOW_BOOST_WIDTH_FACTOR;
  const lineW = params.flowStrokeW * widthMul;

  noFill();
  const c = [params.flowR, params.flowG, params.flowB];
  for (const l of flowLines) {
    // 一定の回転量で角度を進める → 円を描く（ブースト中は回転も速める）
    l.angle += l.turn * flowBoost;
    const cx = Math.cos(l.angle) * params.flowSpeed * flowBoost;
    const cy = Math.sin(l.angle) * params.flowSpeed * flowBoost;

    // パーリンノイズで「円の中心」をランダムに漂わせる
    const driftAngle =
      noise(
        l.x * FLOW_NOISE_SCALE,
        l.y * FLOW_NOISE_SCALE,
        frameCount * FLOW_TIME_SCALE + l.seed
      ) * Math.PI * 2;
    const dx = Math.cos(driftAngle) * params.flowDriftSpeed * flowBoost;
    const dy = Math.sin(driftAngle) * params.flowDriftSpeed * flowBoost;

    const nx = l.x + cx + dx;
    const ny = l.y + cy + dy;

    if (nx < 0 || nx > width || ny < 0 || ny > height) {
      // 画面外に出たら再出現
      l.x = random(width);
      l.y = random(height);
      l.angle = random(Math.PI * 2);
      l.points = [{ x: l.x, y: l.y }];
    } else {
      l.x = nx;
      l.y = ny;
      l.points.push({ x: nx, y: ny });
      if (l.points.length > params.flowTrail) l.points.shift();
    }

    // トレイルを1本のパスで描き、古い端(透明)→新しい端(不透明)の線形グラデーションにする
    // （1セグメントずつ line() するより大幅に高速）
    const n = l.points.length;
    if (n >= 2) {
      const ctx = drawingContext;
      const p0 = l.points[0];
      const pEnd = l.points[n - 1];
      const grad = ctx.createLinearGradient(p0.x, p0.y, pEnd.x, pEnd.y);
      grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},1)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineW; // ブースト中は少し太く
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < n; i++) ctx.lineTo(l.points[i].x, l.points[i].y);
      ctx.stroke();
    }
  }

  // ブーストを 1.0 へ向けて減衰させる（1 を下回らないよう戻す）
  if (flowBoost > 1) {
    flowBoost = 1 + (flowBoost - 1) * FLOW_BOOST_DECAY;
    if (flowBoost < 1.01) flowBoost = 1;
  }
}

// 稲妻（main20）を生成。縦に蛇行するパスを作り、各点から左右へ伸びる
// 横線セグメントを確定して boltSegments に保持する（Qで引き直すまで固定）。
function generateBolt() {
  boltSegments = [];

  // 縦に蛇行するパス（上から下へ 1px ずつ、x がランダムに揺れる）
  let x = width / 2; // 中央から開始
  let p = random([-1, 1]);
  const minX = width / 2 - params.boltWander;
  const maxX = width / 2 + params.boltWander;
  const pathXs = []; // y ごとの x（y はインデックス=画面の縦px）
  for (let y = 0; y < height; y++) {
    pathXs.push(x);
    let dx = random(-19, 19);
    if (x + dx * p < minX || x + dx * p > maxX) p *= -1;
    x = constrain(x + dx * p, minX, maxX);
  }

  // パス上をたどり、各点から左右へランダム長の横線を引く。
  // 縦間隔は Y 位置で変える：上(0)・中央(0.5)・下(1.0) の帯に近いほど密、遠いほど疎。
  const dense = Math.max(1, params.boltStepDense);
  const sparse = Math.max(dense, params.boltStepSparse);
  const bw = Math.max(0.001, params.boltBandWidth); // 帯の幅（割合）
  const H = pathXs.length;

  let i = 0;
  while (i < H) {
    const ny = i / Math.max(1, H - 1); // 0〜1 の縦位置
    // 上・中央・下の各帯までの最短距離（割合）
    const d = Math.min(Math.abs(ny - 0), Math.abs(ny - 0.5), Math.abs(ny - 1));
    // 帯の内側(d=0)で 0、帯の外(d>=bw)で 1 へなめらかに。これで密→疎を補間
    const t = constrain(d / bw, 0, 1);
    const eased = t * t * (3 - 2 * t); // smoothstep
    const step = Math.max(1, Math.round(lerp(dense, sparse, eased)));

    const len = random(params.boltLenMin, params.boltLenMax);
    const w = random(params.boltWMin, params.boltWMax); // 線幅にランダム性
    boltSegments.push({ y: i, x0: pathXs[i] - len, x1: pathXs[i] + len, w });

    i += step;
  }
}

// 稲妻を描く。左：水色 → 右：紫 の線形グラデーション（main20 と同じ）。
function drawBolt() {
  if (boltSegments.length === 0) return;

  const ctx = drawingContext;
  const cl = params.boltColorL;
  const cr = params.boltColorR;
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, `rgb(${cl.r}, ${cl.g}, ${cl.b})`); // 左の色
  grad.addColorStop(1, `rgb(${cr.r}, ${cr.g}, ${cr.b})`); // 右の色
  ctx.strokeStyle = grad;
  ctx.lineCap = 'butt';

  noFill();
  for (const s of boltSegments) {
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y);
    ctx.lineTo(s.x1, s.y);
    ctx.stroke();
  }
}

// ---- 人物ローポリ（main21）----

// セグメンテーション結果の受け取り。再起動時にも同じものを使うため名前付きで持つ。
// 受信時刻の記録は死活監視（ウォッチドッグ）用。
function onPolySegResult(r) {
  polySegMask = r && r.mask ? r.mask : null;
  polySegMaskAtMs = millis();
}

// カメラとモデルの検出を開始
function setupPoly() {
  try {
    polyVideo = createCapture(VIDEO, () => {
      polyReady = true;
      // カメラ許可が遅れた場合に、健全な検出ループを誤って再起動しないよう
      // 「カメラが使えるようになった時刻」からウォッチドッグの計測を始める
      polySegStartAtMs = millis();
    });
    polyVideo.size(640, 480);
    polyVideo.hide();
    if (polySeg && polySeg.detectStart) {
      polySeg.detectStart(polyVideo, onPolySegResult);
      polySegStartAtMs = millis();
    }
    if (polyHandPose && polyHandPose.detectStart) {
      polyHandPose.detectStart(polyVideo, (r) => { polyHands = r || []; });
    }
  } catch (e) {
    polyReady = false;
    console.warn('カメラ準備に失敗:', e);
  }
}

// セグメンテーションの検出ループを再起動する（自己修復）。
// ml5@1.2.1 の detectLoop は推論が一度例外を投げると静かに死に、しかも内部の
// detecting フラグが true のまま残るため、普通に detectStart を呼び直しても
// no-op になる。そこでフラグを強制的に戻してから detectStart する
// （CDN でバージョン固定（@1.2.1）している前提の内部フラグ操作）。
function restartPolySeg() {
  if (!polySeg || !polySeg.detectStart || !polyVideo) return;
  polyRestartCount++;
  console.warn(`セグメンテーションが ${params.polyStaleSec} 秒無応答のため再起動します（${polyRestartCount} 回目）`);
  try {
    polySeg.detecting = false;   // 死んだループが残したフラグを解除
    polySeg.signalStop = false;
    polySeg.prevCall = '';       // ml5 の「二重 detectStart」警告を抑止
    polySeg.detectStart(polyVideo, onPolySegResult);
  } catch (e) {
    console.warn('セグメンテーション再起動に失敗:', e);
  }
  polySegStartAtMs = millis(); // 再起動直後の連続発火を防ぐ（クールダウン）
}

// 人物ローポリの追跡状態を破棄して、次の正常フレームで一から測り直す。
// 異常時（嘘マスク・NaN 等）にのみ呼ばれ、正常時の描画には影響しない。
function resetPolyState() {
  polyBboxInit = false;   // 次フレームで bbox を測り直す
  polyCenterInit = false; // 中心・サイズも測り直す
  polyTris = null;        // ドロネーキャッシュを破棄
  polyPoints = [];        // 点群も破棄（次の正常フレームで即再散布される）
  polyFrameSinceUpdate = 0;
  polyCanvasBox = null;   // ストリングアート重なり判定（bbox）も無効に
  polySmoothMinB = 0;     // コントラストの平滑化状態を初期値へ
  polySmoothMaxB = 255;
  polyScatterInit = false; // 移動検出（即再散布）の基準もリセット
  if (polyMaskG) polyMaskG.clear(); // 重なり色（shape）の残像も消す
}

// 指定座標に近い手のランドマーク z を返す（手が近くにある場合のみ）
function getPolyHandDepthAt(x, y) {
  let bestZ = null;
  let bestDist = 60 * 60; // 影響半径（固定）
  for (const hand of polyHands) {
    const kps = hand.keypoints || hand.keypoints3D || [];
    for (const kp of kps) {
      const dx = kp.x - x, dy = kp.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; bestZ = kp.z; }
    }
  }
  return bestZ;
}

// 映像のある座標（マスク座標系）の明るさ
function polyBrightnessAt(mx, my, mw, mh) {
  const vx = Math.floor((mx / mw) * polyVideo.width);
  const vy = Math.floor((my / mh) * polyVideo.height);
  const vIdx = (vy * polyVideo.width + vx) * 4;
  const r = polyVideo.pixels[vIdx];
  const g = polyVideo.pixels[vIdx + 1];
  const b = polyVideo.pixels[vIdx + 2];
  return (r + g + b) / 3;
}

// シルエット内に点を散布（暗部ほど密）
function scatterPolyPoints(minX, minY, maxX, maxY, mw, mh) {
  const pts = [];
  pts.push({ x: minX, y: minY }, { x: maxX, y: minY }, { x: minX, y: maxY }, { x: maxX, y: maxY });
  const target = params.polyPointCount;
  let tries = 0;
  const maxTries = target * 12;
  while (pts.length < target && tries < maxTries) {
    tries++;
    const x = random(minX, maxX), y = random(minY, maxY);
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || ix >= mw || iy < 0 || iy >= mh) continue;
    const mIdx = (iy * mw + ix) * 4;
    if (polySegMask.pixels[mIdx + 3] > 128) continue; // 背景は除外
    const br = polyBrightnessAt(x, y, mw, mh) / 255;
    const darkness = 1 - br;
    const accept = darkness * params.polyDarkBias + 0.15;
    if (random(1) > Math.min(accept, 1)) continue;
    pts.push({ x, y });
  }
  return pts;
}

// 人物をローポリで描く。位置は polyX/Y、サイズは polyFraction で調整。
// clipRect={x,y,w,h}（キャンバス座標）を渡すと、その矩形内だけに描画を制限する。
// polyVideo / polySegMask の loadPixels をフレーム内で1回だけ実行する
function ensurePolyPixels() {
  if (polyPixelsFrame === frameCount) return;
  if (polySegMask) polySegMask.loadPixels();
  if (polyVideo) polyVideo.loadPixels();
  polyPixelsFrame = frameCount;
}

function drawPolyPerson(clipRect) {
  if (!polySegMask || !polyVideo || !polyVideo.width || typeof d3 === 'undefined') return;

  ensurePolyPixels();
  const mw = polySegMask.width, mh = polySegMask.height;
  if (mw === 0 || mh === 0 || polyVideo.pixels.length === 0) return;

  // bbox 取得（stride で間引き）。あわせて「人物」ピクセルの被覆率も数える
  let minX = mw, maxX = -1, minY = mh, maxY = -1;
  const stride = 4;
  let personCount = 0, sampleCount = 0;
  for (let y = 0; y < mh; y += stride) {
    for (let x = 0; x < mw; x += stride) {
      const idx = (y * mw + x) * 4;
      sampleCount++;
      if (polySegMask.pixels[idx + 3] < 128) {
        personCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return;
  if (maxX - minX < 10 || maxY - minY < 10) return;

  // --- マスク妥当性ゲート（放置後の「全面ポリゴン化」対策） ---
  // セグメンテーションが壊れると「フレームほぼ全面＝人物」の嘘マスクが届く。
  // 数値としては正常なので既存の異常値ガードでは弾けず、被覆率で判定する。
  // 実際の人物が polyMaxCoverage（既定 0.9）を超えることは通常運用ではないため、
  // 正常時の描画には一切影響しない。
  const coverage = personCount / Math.max(sampleCount, 1);
  if (coverage > params.polyMaxCoverage) {
    if (!clipRect) { // 帯領域の2回目の呼び出しでは二重カウントしない
      polyInvalidFrames++;
      // 約0.5秒続いたら追跡状態を捨て、復旧後すぐ正しい位置にロックし直せるようにする
      if (polyInvalidFrames === 30) resetPolyState();
    }
    return; // 嘘マスクのフレームは描かない
  }
  if (!clipRect) polyInvalidFrames = 0;

  // bbox 各端をスムージング
  const k = params.polyTrackSmooth;
  if (!polyBboxInit) {
    polySMinX = minX; polySMaxX = maxX; polySMinY = minY; polySMaxY = maxY;
    polyBboxInit = true;
  } else {
    polySMinX = lerp(polySMinX, minX, k);
    polySMaxX = lerp(polySMaxX, maxX, k);
    polySMinY = lerp(polySMinY, minY, k);
    polySMaxY = lerp(polySMaxY, maxY, k);
  }
  // 生（未平滑化）の bbox を保持。点の散布はこちらを使う。
  // 平滑化 bbox は横切る人に追いつけず、散布範囲と実際のシルエットの重なりが
  // 縦の細い帯だけになって「縦にぶった斬られた」描画になるため。
  // （グラデーション・重なり判定・異常値ガードは従来どおり平滑化値を使う）
  const rawMinX = minX, rawMaxX = maxX, rawMinY = minY, rawMaxY = maxY;
  minX = polySMinX; maxX = polySMaxX; minY = polySMinY; maxY = polySMaxY;
  const bodyW = maxX - minX, bodyH = maxY - minY;

  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
  const s0 = Math.max(bodyW, bodyH);
  if (!polyCenterInit) {
    polySmoothCenterX = cx0; polySmoothCenterY = cy0; polySmoothBodySize = s0;
    polyCenterInit = true;
  } else {
    polySmoothCenterX = lerp(polySmoothCenterX, cx0, 0.3);
    polySmoothCenterY = lerp(polySmoothCenterY, cy0, 0.3);
    polySmoothBodySize = lerp(polySmoothBodySize, s0, 0.3);
  }

  // --- 異常値ガード＋自己回復（正常時は一切発動しないので見た目は不変） ---
  // スムージング値が NaN/Infinity / マスク範囲を大きく逸脱していたら、状態を破棄して
  // 次の正常フレームで測り直す（C: 自己回復）。このフレームは描画しない（B: スキップ）。
  const polyVals = [polySMinX, polySMaxX, polySMinY, polySMaxY, polySmoothCenterX, polySmoothCenterY, polySmoothBodySize];
  const polyBroken =
    polyVals.some((v) => !Number.isFinite(v)) ||
    bodyW <= 0 || bodyH <= 0 ||
    minX < -mw || maxX > mw * 2 || minY < -mh || maxY > mh * 2; // マスク範囲を大きく外れた
  if (polyBroken) {
    resetPolyState(); // 状態を破棄して次の正常フレームで測り直す（C: 自己回復）
    return;           // この異常フレームは描かない（B: スキップ）
  }

  // 固定倍率：人物サイズに追従させず、マスク座標系を一定倍率で表示する。
  // （近づくと映像内で大きく写る→そのまま大きく描かれる＝自然な遠近）
  const renderScale = (Math.min(width, height) / mh) * params.polyFraction;

  // 点の更新（step方式）。clipRect 付き（帯領域の2回目）の呼び出しでは更新しない。
  // 散布範囲は生の bbox（rawMinX..rawMaxY）＝現在のシルエットに常に一致させる。
  // さらに、bbox 中心の移動やサイズ変化が「体サイズ×polyMoveRescatter」を超えたら
  // 周期を待たずに即再散布する（横切る人・近づく人への即応。静止時は発動しない）。
  let pointsChanged = false;
  if (!clipRect) {
    polyFrameSinceUpdate++;
    const rawCX = (rawMinX + rawMaxX) / 2, rawCY = (rawMinY + rawMaxY) / 2;
    const bodyNow = Math.max(rawMaxX - rawMinX, rawMaxY - rawMinY, 1);
    const movedFar = polyScatterInit && (
      Math.hypot(rawCX - polyLastScatterCX, rawCY - polyLastScatterCY) > bodyNow * params.polyMoveRescatter ||
      Math.abs(bodyNow - polyLastScatterBody) > bodyNow * params.polyMoveRescatter
    );
    if (polyPoints.length === 0 || polyFrameSinceUpdate >= params.polyUpdateEvery || movedFar) {
      polyPoints = scatterPolyPoints(rawMinX, rawMinY, rawMaxX, rawMaxY, mw, mh);
      polyLastScatterCX = rawCX;
      polyLastScatterCY = rawCY;
      polyLastScatterBody = bodyNow;
      polyScatterInit = true;
      polyFrameSinceUpdate = 0;
      pointsChanged = true;
    }
  }
  if (polyPoints.length < 3) return;

  // コントラスト観測（見た目維持のため毎フレーム。ただし clipRect の2回目は1回目の値を使う）
  if (!clipRect) {
    let minB = 255, maxB = 0;
    for (const p of polyPoints) {
      const br = polyBrightnessAt(p.x, p.y, mw, mh);
      if (br < minB) minB = br;
      if (br > maxB) maxB = br;
    }
    polySmoothMinB = lerp(polySmoothMinB, minB, params.polyContrastSmooth);
    polySmoothMaxB = lerp(polySmoothMaxB, maxB, params.polyContrastSmooth);
  }
  const rangeB = Math.max(polySmoothMaxB - polySmoothMinB, 1);

  // ドロネー分割：点が変わったときだけ作り直してキャッシュ（毎フレームの再計算を避ける）。
  // キャッシュが点群と不整合（インデックスが点数を超える）なら必ず作り直す（安全ガード）。
  const cacheStale = polyTris !== null &&
    polyTris.length > 0 &&
    (polyTris.length % 3 !== 0 || polyTris.length / 3 > polyPoints.length * 3); // 異常に大きい
  if (pointsChanged || polyTris === null || cacheStale) {
    const flat = new Float64Array(polyPoints.length * 2);
    for (let i = 0; i < polyPoints.length; i++) {
      flat[i * 2] = polyPoints[i].x;
      flat[i * 2 + 1] = polyPoints[i].y;
    }
    polyTris = new d3.Delaunay(flat).triangles;
  }
  const tris = polyTris;

  // マスク座標 → キャンバス座標。
  // 人物の中心ではなく「マスク（映像）の中心」を基準にする＝位置追従しない。
  // 人が動けば映像どおりに画面内を動く。全体配置は polyX/Y で調整。
  const sign = params.polyMirror ? -1 : 1;
  const ox = width / 2 + params.polyX;
  const oy = height / 2 + params.polyY;
  const toCX = (mx) => ox + (mx - mw / 2) * renderScale * sign;
  const toCY = (my) => oy + (my - mh / 2) * renderScale;

  // 人物のキャンバス座標での矩形範囲を記録（重なり判定 bbox 用）。
  // clipRect 付き（帯領域の2回目）の呼び出しでは更新しない。
  if (!clipRect) {
    const cxs = [toCX(minX), toCX(maxX)];
    const cys = [toCY(minY), toCY(maxY)];
    const bx0 = Math.min(cxs[0], cxs[1]), bx1 = Math.max(cxs[0], cxs[1]);
    const by0 = Math.min(cys[0], cys[1]), by1 = Math.max(cys[0], cys[1]);
    polyCanvasBox = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };

    // shape モード用：人物シルエットをマスクバッファに白で描く
    if (params.stringOverlapMode === 'shape') {
      if (!polyMaskG || polyMaskG.width !== width || polyMaskG.height !== height) {
        polyMaskG = createGraphics(width, height);
        polyMaskG.pixelDensity(1);
      }
      polyMaskG.clear();
      polyMaskG.noStroke();
      polyMaskG.fill(255);
      for (let t = 0; t < tris.length; t += 3) {
        const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
        const pa = polyPoints[ia], pb = polyPoints[ib], pc = polyPoints[ic];
        if (!pa || !pb || !pc) continue; // キャッシュと点群の不整合ガード
        const ax = pa.x, ay = pa.y;
        const bx = pb.x, by = pb.y;
        const ccx = pc.x, ccy = pc.y;
        // 背景の三角形は除外（重心が背景なら飛ばす）
        const gx = (ax + bx + ccx) / 3, gy = (ay + by + ccy) / 3;
        const gix = Math.floor(gx), giy = Math.floor(gy);
        if (gix < 0 || gix >= mw || giy < 0 || giy >= mh) continue;
        const mi = (giy * mw + gix) * 4;
        if (polySegMask.pixels[mi + 3] > 128) continue;
        polyMaskG.triangle(toCX(ax), toCY(ay), toCX(bx), toCY(by), toCX(ccx), toCY(ccy));
      }
    }
  }

  // clipRect が指定されていれば、その矩形内だけに描画を制限する
  push();
  if (clipRect) {
    const ctx = drawingContext;
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
    ctx.clip();
  }

  if (params.polyWireframe) {
    // Q 発火時の縁線 alpha ブースト（base + boost、255 でクランプ）
    const wa = constrain(params.polyWireAlpha + polyWireBoost, 0, 255);
    stroke(255, wa);
    strokeWeight(0.5);
  } else {
    noStroke();
  }

  for (let t = 0; t < tris.length; t += 3) {
    const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
    const pa = polyPoints[ia], pb = polyPoints[ib], pc = polyPoints[ic];
    if (!pa || !pb || !pc) continue; // キャッシュと点群の不整合ガード
    const ax = pa.x, ay = pa.y;
    const bx = pb.x, by = pb.y;
    const ccx = pc.x, ccy = pc.y;
    const gx = (ax + bx + ccx) / 3, gy = (ay + by + ccy) / 3;

    const gix = Math.floor(gx), giy = Math.floor(gy);
    if (gix < 0 || gix >= mw || giy < 0 || giy >= mh) continue;
    const mIdx = (giy * mw + gix) * 4;
    if (polySegMask.pixels[mIdx + 3] > 128) continue; // 背景の三角形を除外

    let br = polyBrightnessAt(gx, gy, mw, mh);
    let level = constrain((br - polySmoothMinB) / rangeB, 0, 1);
    if (br < params.polyDarkThreshold) level = 0;

    const handZ = getPolyHandDepthAt(gx, gy);
    if (handZ !== null) {
      if (handZ < -0.1) level = Math.max(0, level - 0.15);
      else if (handZ > 0.1) level = Math.min(1, level + 0.15);
    }

    // 上→下のグラデ位置。bias>1 で青（上）の領域を広げる（緑が下に寄る）
    let gradT = constrain((gy - minY) / Math.max(bodyH, 1), 0, 1);
    gradT = Math.pow(gradT, Math.max(0.1, params.polyGradBias));
    const ct = params.polyColorTop, cb = params.polyColorBottom;
    const r0 = lerp(ct.r, cb.r, gradT);
    const g0 = lerp(ct.g, cb.g, gradT);
    const b0 = lerp(ct.b, cb.b, gradT);
    const shade = 0.25 + level * 0.75;
    fill(r0 * shade, g0 * shade, b0 * shade);

    triangle(toCX(ax), toCY(ay), toCX(bx), toCY(by), toCX(ccx), toCY(ccy));
  }

  if (clipRect) drawingContext.restore();
  pop();
}

// フレーム差分で「動いた領域」を検出し、塊ごとの bbox（マスク座標系）を返す（main22）。
function detectMotionBoxes(mw, mh) {
  const cols = params.boxMotionGrid;
  const cellPx = Math.floor(polyVideo.width / cols);
  if (cellPx < 1) return [];
  const rows = Math.floor(polyVideo.height / cellPx);

  // 各セルの平均輝度（間引きサンプリング）
  const grid = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0, cnt = 0;
      const x0 = cx * cellPx, y0 = cy * cellPx;
      for (let yy = 0; yy < cellPx; yy += 3) {
        for (let xx = 0; xx < cellPx; xx += 3) {
          const vIdx = ((y0 + yy) * polyVideo.width + (x0 + xx)) * 4;
          sum += (polyVideo.pixels[vIdx] + polyVideo.pixels[vIdx + 1] + polyVideo.pixels[vIdx + 2]) / 3;
          cnt++;
        }
      }
      grid[cy * cols + cx] = cnt > 0 ? sum / cnt : 0;
    }
  }

  // 前フレームと比較して「動いたセル」をマーク
  const moved = new Uint8Array(cols * rows);
  if (boxPrevGrid && boxPrevGridW === cols && boxPrevGridH === rows) {
    for (let i = 0; i < grid.length; i++) {
      if (Math.abs(grid[i] - boxPrevGrid[i]) > params.boxMotionThresh) moved[i] = 1;
    }
  }
  boxPrevGrid = grid; boxPrevGridW = cols; boxPrevGridH = rows;

  // 連結成分（4近傍 flood fill）で塊にまとめ bbox に
  const visited = new Uint8Array(cols * rows);
  const boxes = [];
  const sx = mw / cols, sy = mh / rows;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const idx = cy * cols + cx;
      if (!moved[idx] || visited[idx]) continue;
      let stack = [[cx, cy]];
      visited[idx] = 1;
      let bMinX = cx, bMaxX = cx, bMinY = cy, bMaxY = cy, count = 0;
      while (stack.length) {
        const [x, y] = stack.pop();
        count++;
        if (x < bMinX) bMinX = x;
        if (x > bMaxX) bMaxX = x;
        if (y < bMinY) bMinY = y;
        if (y > bMaxY) bMaxY = y;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          const nidx = ny * cols + nx;
          if (moved[nidx] && !visited[nidx]) { visited[nidx] = 1; stack.push([nx, ny]); }
        }
      }
      if (count < params.boxMinCells) continue;
      boxes.push({ x: bMinX * sx, y: bMinY * sy, w: (bMaxX - bMinX + 1) * sx, h: (bMaxY - bMinY + 1) * sy });
    }
  }
  return boxes;
}

// 検出boxを追跡boxに反映（平滑化＋保持でチラつき防止）
function updateBoxTracked(detected) {
  const used = new Array(boxTracked.length).fill(false);
  for (const d of detected) {
    let best = -1, bestDist = Infinity;
    const dcx = d.x + d.w / 2, dcy = d.y + d.h / 2;
    for (let i = 0; i < boxTracked.length; i++) {
      if (used[i]) continue;
      const t = boxTracked[i];
      const dist = Math.hypot(dcx - (t.x + t.w / 2), dcy - (t.y + t.h / 2));
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    if (best >= 0 && bestDist < Math.max(d.w, d.h) * 1.5) {
      const t = boxTracked[best];
      const kk = params.boxSmooth;
      t.x = lerp(t.x, d.x, kk); t.y = lerp(t.y, d.y, kk);
      t.w = lerp(t.w, d.w, kk); t.h = lerp(t.h, d.h, kk);
      t.life = params.boxHold; used[best] = true;
    } else {
      boxTracked.push({ x: d.x, y: d.y, w: d.w, h: d.h, life: params.boxHold });
    }
  }
  for (let i = boxTracked.length - 1; i >= 0; i--) {
    if (!used[i]) { boxTracked[i].life--; if (boxTracked[i].life <= 0) boxTracked.splice(i, 1); }
  }
}

// 動き検出ボックスを描く（ピンクの点線の枠＋近接リンク）（main22）
function drawMotionBoxes() {
  if (!polySegMask || !polyVideo || !polyVideo.width) return;
  ensurePolyPixels(); // polyShow=false でも pixels を確実に最新化（&重複読み込み回避）
  if (polyVideo.pixels.length === 0) return;
  const mw = polySegMask.width, mh = polySegMask.height;
  if (mw === 0 || mh === 0) return;

  // drawPolyPerson と同じ座標マッピング
  const renderScale = (Math.min(width, height) / mh) * params.polyFraction;
  const sign = params.polyMirror ? -1 : 1;
  const ox = width / 2 + params.polyX;
  const oy = height / 2 + params.polyY;
  const toCX = (mx) => ox + (mx - mw / 2) * renderScale * sign;
  const toCY = (my) => oy + (my - mh / 2) * renderScale;

  const detected = detectMotionBoxes(mw, mh);
  updateBoxTracked(detected);

  const col = params.boxColor;
  const ctx = drawingContext;
  // 点線設定（boxDash が true のとき破線、false で実線）
  ctx.setLineDash(params.boxDash ? [params.boxDashLen, params.boxGapLen] : []);

  stroke(col.r, col.g, col.b);
  strokeWeight(params.boxWeight);
  noFill();

  const centers = [];
  for (const b of boxTracked) {
    const xs = [toCX(b.x), toCX(b.x + b.w)];
    const ys = [toCY(b.y), toCY(b.y + b.h)];
    const x0 = Math.min(xs[0], xs[1]), x1 = Math.max(xs[0], xs[1]);
    const y0 = Math.min(ys[0], ys[1]), y1 = Math.max(ys[0], ys[1]);
    rect(x0, y0, x1 - x0, y1 - y0);
    centers.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  }

  // 近接リンク（距離 boxLinkDist 以内の中心点を点線で結ぶ）
  if (params.boxLinkOn) {
    strokeWeight(params.boxLinkWeight);
    stroke(col.r, col.g, col.b);
    const maxD = params.boxLinkDist;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const a = centers[i], b = centers[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) <= maxD) line(a.x, a.y, b.x, b.y);
      }
    }
  }

  // 中心点（点は実線＝塗りなので setLineDash の影響なし）
  if (params.boxDot > 0) {
    noStroke();
    fill(col.r, col.g, col.b);
    for (const c of centers) circle(c.x, c.y, params.boxDot);
  }

  ctx.setLineDash([]); // 点線設定を戻す（他の描画へ影響しないよう）
}

// 帯の領域（下部）の矩形を返す。帯が無効なら null。
function bandRect() {
  if (!params.band) return null;
  const bh = height * params.bandH;
  return { x: 0, y: height - bh, w: width, h: bh };
}

// キャンバスサイズを計算。
// フルスクリーン時は画面全体、通常時は画面に収まる最大の縦長(9:16)。
function portraitSize() {
  if (fullscreen()) {
    return [windowWidth, windowHeight];
  }
  let h = windowHeight - MARGIN_Y * 2;
  let w = h * (ASPECT_W / ASPECT_H);
  if (w > windowWidth) {
    w = windowWidth;
    h = w * (ASPECT_H / ASPECT_W);
  }
  return [w, h];
}

function setupPane() {
  // Tweakpane の読み込みに失敗しても描画は止めない
  if (typeof Tweakpane === 'undefined') {
    console.warn('Tweakpane が読み込めませんでした。パネルなしで描画します。');
    return;
  }
  const pane = new Tweakpane.Pane({ title: 'string art' });
  tweakPane = pane; // H キーで表示/非表示する用に保持

  // 一番背後：クラゲ背景（シェーダーで揺らす）
  const bg = pane.addFolder({ title: 'background (kurage)', expanded: false });
  bg.addInput(bg_p, 'show');
  bg.addInput(bg_p, 'scale', { min: 0.2, max: 3, step: 0.01 });
  bg.addInput(bg_p, 'rotation', { min: -Math.PI, max: Math.PI, step: 0.01 });
  bg.addInput(bg_p, 'offsetX', { min: -2000, max: 2000, step: 1 });
  bg.addInput(bg_p, 'offsetY', { min: -2000, max: 2000, step: 1 });
  bg.addInput(bg_p, 'distortStrength', { min: 0, max: 0.2, step: 0.001 });
  bg.addInput(bg_p, 'distortSpeed', { min: 0, max: 3, step: 0.01 });
  bg.addInput(bg_p, 'edgeFade', { min: 0, max: 0.5, step: 0.005 });
  bg.addInput(bg_p, 'edgeFadeNoise', { min: 0, max: 1, step: 0.01 });

  // 背景の漂う線（main10）
  const fl = pane.addFolder({ title: 'flow (漂う線)', expanded: false });
  fl.addInput(params, 'flowShow', { label: 'show' });
  fl.addInput(params, 'flowNum', { min: 1, max: 300, step: 1, label: 'num' }).on('change', initFlow);
  fl.addInput(params, 'flowTrail', { min: 10, max: 1000, step: 1, label: 'trail' });
  fl.addInput(params, 'flowStrokeW', { min: 1, max: 40, step: 1, label: 'strokeW' });
  fl.addInput(params, 'flowSpeed', { min: 0.5, max: 12, step: 0.1, label: 'speed' });
  fl.addInput(params, 'flowMinRadius', { min: 10, max: 800, step: 1, label: 'min radius' }).on('change', initFlow);
  fl.addInput(params, 'flowMaxRadius', { min: 10, max: 1500, step: 1, label: 'max radius' }).on('change', initFlow);
  fl.addInput(params, 'flowDriftSpeed', { min: 0, max: 10, step: 0.1, label: 'drift speed' });
  fl.addInput(params, 'flowR', { min: 0, max: 255, step: 1 });
  fl.addInput(params, 'flowG', { min: 0, max: 255, step: 1 });
  fl.addInput(params, 'flowB', { min: 0, max: 255, step: 1 });

  // 背景の稲妻（main20）。Q（=クリック）で引き直し
  const bolt = pane.addFolder({ title: 'bolt (稲妻)', expanded: false });
  bolt.addInput(params, 'boltShow', { label: 'show' });
  bolt.addInput(params, 'boltWander', { min: 10, max: 600, step: 1, label: 'wander' }).on('change', generateBolt);
  bolt.addInput(params, 'boltLenMin', { min: 10, max: 800, step: 1, label: 'len min' }).on('change', generateBolt);
  bolt.addInput(params, 'boltLenMax', { min: 10, max: 1200, step: 1, label: 'len max' }).on('change', generateBolt);
  // 縦間隔（密度）：上・中央・下で密、その間で疎
  bolt.addInput(params, 'boltStepDense', { min: 1, max: 40, step: 1, label: 'step 密' }).on('change', generateBolt);
  bolt.addInput(params, 'boltStepSparse', { min: 2, max: 120, step: 1, label: 'step 疎' }).on('change', generateBolt);
  bolt.addInput(params, 'boltBandWidth', { min: 0.02, max: 0.5, step: 0.01, label: '密集帯の幅' }).on('change', generateBolt);
  // 線幅のランダム範囲
  bolt.addInput(params, 'boltWMin', { min: 0.25, max: 10, step: 0.25, label: '線幅 min' }).on('change', generateBolt);
  bolt.addInput(params, 'boltWMax', { min: 0.25, max: 20, step: 0.25, label: '線幅 max' }).on('change', generateBolt);
  // グラデーション色（カラーピッカー。スポイトで画面の色を拾える）
  bolt.addInput(params, 'boltColorL', { label: 'color L (左)' });
  bolt.addInput(params, 'boltColorR', { label: 'color R (右)' });
  bolt.addButton({ title: '引き直す (=Q)' }).on('click', generateBolt);

  // 人物ローポリ（main21、カメラ）
  const poly = pane.addFolder({ title: 'person (polygon)', expanded: false });
  poly.addInput(params, 'polyShow', { label: 'show' });
  poly.addInput(params, 'polyX', { min: -1500, max: 1500, step: 1, label: 'X (横位置)' });
  poly.addInput(params, 'polyY', { min: -1500, max: 1500, step: 1, label: 'Y (縦位置)' });
  poly.addInput(params, 'polyFraction', { min: 0.2, max: 2, step: 0.01, label: 'size (大きさ)' });
  poly.addInput(params, 'polyPointCount', { min: 200, max: 3000, step: 50, label: 'points (点数)' });
  poly.addInput(params, 'polyUpdateEvery', { min: 1, max: 20, step: 1, label: 'update every' });
  poly.addInput(params, 'polyMoveRescatter', { min: 0.02, max: 0.5, step: 0.01, label: 'move rescatter (歩行追従)' });
  poly.addInput(params, 'polyDarkBias', { min: 0, max: 5, step: 0.1, label: 'dark bias' });
  poly.addInput(params, 'polyTrackSmooth', { min: 0.02, max: 0.5, step: 0.01, label: 'track smooth' });
  poly.addInput(params, 'polyContrastSmooth', { min: 0.01, max: 0.5, step: 0.01, label: 'contrast smooth' });
  poly.addInput(params, 'polyDarkThreshold', { min: 0, max: 80, step: 1, label: 'dark threshold' });
  poly.addInput(params, 'polyMirror', { label: 'mirror (鏡像)' });
  poly.addInput(params, 'polyWireframe', { label: 'wireframe (縁線)' });
  poly.addInput(params, 'polyWireAlpha', { min: 0, max: 255, step: 1, label: 'wire alpha (普段)' });
  poly.addInput(params, 'polyWirePeak', { min: 0, max: 255, step: 1, label: 'wire peak (Q時)' });
  poly.addInput(params, 'polyWireDecay', { min: 0.8, max: 0.995, step: 0.001, label: 'wire decay (消える速さ)' });
  // グラデーション（上＝青→下＝緑）
  poly.addInput(params, 'polyColorTop', { label: 'color top (上/青)' });
  poly.addInput(params, 'polyColorBottom', { label: 'color bottom (下/緑)' });
  poly.addInput(params, 'polyGradBias', { min: 0.3, max: 4, step: 0.05, label: 'grad bias (青の広さ)' });
  // マスク異常対策（放置後の全面ポリゴン化バグへの防御）
  poly.addInput(params, 'polyMaxCoverage', { min: 0.3, max: 1, step: 0.01, label: 'max coverage (異常判定)' });
  poly.addInput(params, 'polyStaleSec', { min: 1, max: 10, step: 0.5, label: 'stale sec (再起動まで)' });
  // 人物とストリングアートの重なり部分を別色（紺）に
  poly.addInput(params, 'stringOverlapMode', {
    label: '重なり色 mode',
    options: { off: 'off', '人物形状 shape': 'shape', '矩形 bbox': 'bbox' },
  });
  poly.addInput(params, 'stringOverlapColor', { label: '重なり色 (紺)' });

  // 動き検出ボックス（main22）
  const mbox = pane.addFolder({ title: 'motion box', expanded: false });
  mbox.addInput(params, 'boxOn', { label: 'show' });
  mbox.addInput(params, 'boxColor', { label: 'color (ピンク)' });
  mbox.addInput(params, 'boxDash', { label: '点線' });
  mbox.addInput(params, 'boxDashLen', { min: 1, max: 30, step: 1, label: '実線長' });
  mbox.addInput(params, 'boxGapLen', { min: 1, max: 30, step: 1, label: '隙間長' });
  mbox.addInput(params, 'boxMotionGrid', { min: 8, max: 48, step: 1, label: 'grid' });
  mbox.addInput(params, 'boxMotionThresh', { min: 5, max: 100, step: 1, label: 'thresh (感度)' });
  mbox.addInput(params, 'boxMinCells', { min: 1, max: 10, step: 1, label: 'min cells' });
  mbox.addInput(params, 'boxSmooth', { min: 0.05, max: 1, step: 0.01, label: 'smooth' });
  mbox.addInput(params, 'boxHold', { min: 0, max: 30, step: 1, label: 'hold' });
  mbox.addInput(params, 'boxWeight', { min: 0.5, max: 6, step: 0.5, label: '枠線太さ' });
  mbox.addInput(params, 'boxDot', { min: 0, max: 16, step: 1, label: '中心点' });
  mbox.addInput(params, 'boxLinkOn', { label: 'リンク線' });
  mbox.addInput(params, 'boxLinkDist', { min: 40, max: 800, step: 10, label: 'リンク距離' });
  mbox.addInput(params, 'boxLinkWeight', { min: 0.5, max: 4, step: 0.5, label: 'リンク太さ' });

  // ロゴ枠線なぞりアニメ（Qで再生）
  // Q アニメの自動発動
  const aq = pane.addFolder({ title: 'auto Q', expanded: false });
  aq.addInput(params, 'autoQ', { label: '自動発動' });
  aq.addInput(params, 'autoQSec', { min: 1, max: 30, step: 0.5, label: '間隔（秒）' });
  aq.addButton({ title: 'いま発動 (Q)' }).on('click', triggerQAnimation);

  const la = pane.addFolder({ title: 'logo outline anim', expanded: false });
  la.addInput(params, 'logoAnimDrawMs', { min: 200, max: 8000, step: 100, label: 'draw ms (描画時間)' });
  la.addInput(params, 'logoAnimFadeMs', { min: 0, max: 3000, step: 100, label: 'fade ms (消える時間)' });
  la.addInput(params, 'logoAnimWeight', { min: 0.5, max: 12, step: 0.5, label: 'line weight (太さ)' });
  la.addInput(params, 'logoAnimOffsetX', { min: -1000, max: 1000, step: 1, label: 'line X (横ずれ)' });
  la.addInput(params, 'logoAnimOffsetY', { min: -1000, max: 1000, step: 1, label: 'line Y (縦ずれ)' });
  la.addButton({ title: '再生 (=Q)' }).on('click', playLogoAnim);

  pane.addInput(params, 'stringShow', { label: 'string show' });
  pane.addInput(params, 'lines', { min: 2, max: 120, step: 1 });
  pane.addInput(params, 'spacingBias', { min: 0.1, max: 8, step: 0.1 });
  pane.addInput(params, 'spanA', { min: 0.1, max: 2, step: 0.01 });
  pane.addInput(params, 'spanB', { min: 0.1, max: 2, step: 0.01 });
  pane.addInput(params, 'shiftA', { min: -1, max: 1, step: 0.01 });
  pane.addInput(params, 'shiftB', { min: -1, max: 1, step: 0.01 });
  pane.addInput(params, 'offsetY', { min: -1000, max: 1000, step: 1 });
  pane.addInput(params, 'extend', { min: 0, max: 2, step: 0.05 });
  pane.addInput(params, 'rotate', { min: -180, max: 180, step: 1 });
  pane.addInput(params, 'strokeW', { min: 0.25, max: 6, step: 0.25 });
  pane.addInput(params, 'colorR', { min: 0, max: 255, step: 1 });
  pane.addInput(params, 'colorG', { min: 0, max: 255, step: 1 });
  pane.addInput(params, 'colorB', { min: 0, max: 255, step: 1 });
  pane.addInput(params, 'colorA', { min: 0, max: 255, step: 1 });
  pane.addInput(params, 'mirror');
  pane.addInput(params, 'band');
  pane.addInput(params, 'bandH', { min: 0, max: 0.5, step: 0.01 });
  pane.addInput(params, 'textScale', { min: 0.2, max: 3, step: 0.05 });
  pane.addInput(params, 'textOffsetX', { min: -1, max: 1, step: 0.01 });
  pane.addInput(params, 'textOffsetY', { min: -0.5, max: 0.5, step: 0.01 });
  pane.addInput(params, 'lineGap', { min: 0, max: 3, step: 0.05 });

  // 流れるハッチング三角形（main13）
  const tri = pane.addFolder({ title: 'triangles' });
  tri.addInput(params, 'triShow');
  tri.addInput(params, 'triColor', { label: 'color (色)' });
  tri.addInput(params, 'triFade');
  tri.addInput(params, 'triRows', { min: 1, max: 8, step: 1 });
  tri.addInput(params, 'triCols', { min: 0, max: 40, step: 1 });
  tri.addInput(params, 'triSize', { min: 10, max: 200, step: 1 });
  tri.addInput(params, 'triSpacingX', { min: 20, max: 400, step: 1 });
  tri.addInput(params, 'triSpacingY', { min: 20, max: 400, step: 1 });
  tri.addInput(params, 'triLineSpacing', { min: 1, max: 20, step: 1 });
  tri.addInput(params, 'triLineW', { min: 0.25, max: 6, step: 0.25 });
  tri.addInput(params, 'triSpeed', { min: 0, max: 10, step: 0.1 });
  tri.addInput(params, 'triFadeWidth', { min: 0, max: 400, step: 1 });
  tri.addInput(params, 'triPaddingX', { min: 0, max: 600, step: 1 });
  tri.addInput(params, 'triOffsetY', { min: -1000, max: 1000, step: 1 });
  tri.addInput(params, 'triAnimFrames', { min: 10, max: 300, step: 1 });

  // 転がるハッチング円（main17）
  const cir = pane.addFolder({ title: 'circles' });
  cir.addInput(params, 'cirShow');
  cir.addInput(params, 'cirColor', { label: 'color (色)' });
  cir.addInput(params, 'cirFade');
  cir.addInput(params, 'cirRows', { min: 1, max: 8, step: 1 });
  cir.addInput(params, 'cirCols', { min: 0, max: 40, step: 1 });
  cir.addInput(params, 'cirSize', { min: 10, max: 200, step: 1 });
  cir.addInput(params, 'cirSpacingX', { min: 20, max: 400, step: 1 });
  cir.addInput(params, 'cirSpacingY', { min: 20, max: 400, step: 1 });
  cir.addInput(params, 'cirLineSpacing', { min: 1, max: 20, step: 1 });
  cir.addInput(params, 'cirLineW', { min: 0.25, max: 6, step: 0.25 });
  cir.addInput(params, 'cirSpeed', { min: 0, max: 10, step: 0.1 });
  cir.addInput(params, 'cirFadeWidth', { min: 0, max: 400, step: 1 });
  cir.addInput(params, 'cirPaddingX', { min: 0, max: 600, step: 1 });
  cir.addInput(params, 'cirOffsetY', { min: -1000, max: 1000, step: 1 });
  cir.addInput(params, 'cirAnimFrames', { min: 10, max: 300, step: 1 });

  // 転がるハッチング正方形（main18）
  const sq = pane.addFolder({ title: 'squares' });
  sq.addInput(params, 'sqShow');
  sq.addInput(params, 'sqColor', { label: 'color (色)' });
  sq.addInput(params, 'sqFade');
  sq.addInput(params, 'sqRows', { min: 1, max: 8, step: 1 });
  sq.addInput(params, 'sqCols', { min: 0, max: 40, step: 1 });
  sq.addInput(params, 'sqSize', { min: 10, max: 200, step: 1 });
  sq.addInput(params, 'sqSpacingX', { min: 20, max: 400, step: 1 });
  sq.addInput(params, 'sqSpacingY', { min: 20, max: 400, step: 1 });
  sq.addInput(params, 'sqLineSpacing', { min: 1, max: 20, step: 1 });
  sq.addInput(params, 'sqLineW', { min: 0.25, max: 6, step: 0.25 });
  sq.addInput(params, 'sqSpeed', { min: 0, max: 10, step: 0.1 });
  sq.addInput(params, 'sqFadeWidth', { min: 0, max: 400, step: 1 });
  sq.addInput(params, 'sqPaddingX', { min: 0, max: 600, step: 1 });
  sq.addInput(params, 'sqOffsetY', { min: -1000, max: 1000, step: 1 });
  sq.addInput(params, 'sqAnimFrames', { min: 10, max: 300, step: 1 });

  // 流れるハッチング三角形 2（複製）
  const tri2 = pane.addFolder({ title: 'triangles 2' });
  tri2.addInput(params, 'tri2Show');
  tri2.addInput(params, 'tri2Color', { label: 'color (色)' });
  tri2.addInput(params, 'tri2Fade');
  tri2.addInput(params, 'tri2Rows', { min: 1, max: 8, step: 1 });
  tri2.addInput(params, 'tri2Cols', { min: 0, max: 40, step: 1 });
  tri2.addInput(params, 'tri2Size', { min: 10, max: 200, step: 1 });
  tri2.addInput(params, 'tri2SpacingX', { min: 20, max: 400, step: 1 });
  tri2.addInput(params, 'tri2SpacingY', { min: 20, max: 400, step: 1 });
  tri2.addInput(params, 'tri2LineSpacing', { min: 1, max: 20, step: 1 });
  tri2.addInput(params, 'tri2LineW', { min: 0.25, max: 6, step: 0.25 });
  tri2.addInput(params, 'tri2Speed', { min: 0, max: 10, step: 0.1 });
  tri2.addInput(params, 'tri2FadeWidth', { min: 0, max: 400, step: 1 });
  tri2.addInput(params, 'tri2PaddingX', { min: 0, max: 600, step: 1 });
  tri2.addInput(params, 'tri2OffsetY', { min: -1000, max: 1000, step: 1 });
  tri2.addInput(params, 'tri2AnimFrames', { min: 10, max: 300, step: 1 });

  // 転がるハッチング正方形 2（複製）
  const sq2 = pane.addFolder({ title: 'squares 2' });
  sq2.addInput(params, 'sq2Show');
  sq2.addInput(params, 'sq2Color', { label: 'color (色)' });
  sq2.addInput(params, 'sq2Fade');
  sq2.addInput(params, 'sq2Rows', { min: 1, max: 8, step: 1 });
  sq2.addInput(params, 'sq2Cols', { min: 0, max: 40, step: 1 });
  sq2.addInput(params, 'sq2Size', { min: 10, max: 200, step: 1 });
  sq2.addInput(params, 'sq2SpacingX', { min: 20, max: 400, step: 1 });
  sq2.addInput(params, 'sq2SpacingY', { min: 20, max: 400, step: 1 });
  sq2.addInput(params, 'sq2LineSpacing', { min: 1, max: 20, step: 1 });
  sq2.addInput(params, 'sq2LineW', { min: 0.25, max: 6, step: 0.25 });
  sq2.addInput(params, 'sq2Speed', { min: 0, max: 10, step: 0.1 });
  sq2.addInput(params, 'sq2FadeWidth', { min: 0, max: 400, step: 1 });
  sq2.addInput(params, 'sq2PaddingX', { min: 0, max: 600, step: 1 });
  sq2.addInput(params, 'sq2OffsetY', { min: -1000, max: 1000, step: 1 });
  sq2.addInput(params, 'sq2AnimFrames', { min: 10, max: 300, step: 1 });

  // ロゴ文字（I / D / D）
  const letters = pane.addFolder({ title: 'letters (IDD)' });
  letters.addInput(params, 'lettersShow');
  letters.addInput(params, 'lettersScale', { min: 0.1, max: 5, step: 0.01 });
  letters.addInput(params, 'lettersX', { min: -1000, max: 1000, step: 1 });
  letters.addInput(params, 'lettersY', { min: -1000, max: 1000, step: 1 });

  const fi = letters.addFolder({ title: 'I' });
  fi.addInput(params, 'iShow');
  fi.addInput(params, 'iX', { min: -1000, max: 1000, step: 1 });
  fi.addInput(params, 'iY', { min: -1000, max: 1000, step: 1 });
  fi.addInput(params, 'iScale', { min: 0.1, max: 5, step: 0.01 });
  fi.addInput(params, 'iRot', { min: -180, max: 180, step: 1 });
  fi.addInput(params, 'iAlpha', { min: 0, max: 255, step: 1 });

  const fd1 = letters.addFolder({ title: 'D (left)' });
  fd1.addInput(params, 'd1Show');
  fd1.addInput(params, 'd1X', { min: -1000, max: 1000, step: 1 });
  fd1.addInput(params, 'd1Y', { min: -1000, max: 1000, step: 1 });
  fd1.addInput(params, 'd1Scale', { min: 0.1, max: 5, step: 0.01 });
  fd1.addInput(params, 'd1Rot', { min: -180, max: 180, step: 1 });
  fd1.addInput(params, 'd1Alpha', { min: 0, max: 255, step: 1 });

  const fd2 = letters.addFolder({ title: 'D (right)' });
  fd2.addInput(params, 'd2Show');
  fd2.addInput(params, 'd2X', { min: -1000, max: 1000, step: 1 });
  fd2.addInput(params, 'd2Y', { min: -1000, max: 1000, step: 1 });
  fd2.addInput(params, 'd2Scale', { min: 0.1, max: 5, step: 0.01 });
  fd2.addInput(params, 'd2Rot', { min: -180, max: 180, step: 1 });
  fd2.addInput(params, 'd2Alpha', { min: 0, max: 255, step: 1 });

  // ロゴ文字2（IDDD）
  const letters2 = pane.addFolder({ title: 'letters2 (IDDD)' });
  letters2.addInput(params, 'l2Show');
  letters2.addInput(params, 'l2Scale', { min: 0.1, max: 5, step: 0.01 });
  letters2.addInput(params, 'l2X', { min: -1000, max: 1000, step: 1 });
  letters2.addInput(params, 'l2Y', { min: -1000, max: 1000, step: 1 });

  // 各文字（I / D / D / D）のサブフォルダを追加するヘルパー
  const addLetter2 = (title, p) => {
    const f = letters2.addFolder({ title });
    f.addInput(params, p + 'Show');
    f.addInput(params, p + 'X', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Y', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Scale', { min: 0.1, max: 5, step: 0.01 });
    f.addInput(params, p + 'Rot', { min: -180, max: 180, step: 1 });
    f.addInput(params, p + 'Alpha', { min: 0, max: 255, step: 1 });
  };
  addLetter2('I', 'l2i');
  addLetter2('D (1)', 'l2d1');
  addLetter2('D (2)', 'l2d2');
  addLetter2('D (3)', 'l2d3');

  // アンパサンド（&）
  const amp = pane.addFolder({ title: 'ampersand (&)' });
  amp.addInput(params, 'ampShow');
  amp.addInput(params, 'ampX', { min: -1000, max: 1000, step: 1 });
  amp.addInput(params, 'ampY', { min: -1000, max: 1000, step: 1 });
  amp.addInput(params, 'ampScale', { min: 0.1, max: 5, step: 0.01 });
  amp.addInput(params, 'ampRot', { min: -180, max: 180, step: 1 });
  amp.addInput(params, 'ampAlpha', { min: 0, max: 255, step: 1 });

  // "design" ロゴ
  const design = pane.addFolder({ title: 'design' });
  design.addInput(params, 'deShow');
  design.addInput(params, 'deScale', { min: 0.1, max: 5, step: 0.01 });
  design.addInput(params, 'deX', { min: -1000, max: 1000, step: 1 });
  design.addInput(params, 'deY', { min: -1000, max: 1000, step: 1 });

  // 各文字（d/e/s/i/g/n）のサブフォルダを追加するヘルパー
  const addDesLetter = (title, p) => {
    const f = design.addFolder({ title });
    f.addInput(params, p + 'Show');
    f.addInput(params, p + 'X', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Y', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Scale', { min: 0.1, max: 5, step: 0.01 });
    f.addInput(params, p + 'Rot', { min: -180, max: 180, step: 1 });
    f.addInput(params, p + 'Alpha', { min: 0, max: 255, step: 1 });
  };
  addDesLetter('d', 'dd');
  addDesLetter('e', 'dee');
  addDesLetter('s', 'ds');
  addDesLetter('i', 'di');
  addDesLetter('g', 'dg');
  addDesLetter('n', 'dn');

  // メインロゴ（logomain）
  const lm = pane.addFolder({ title: 'logo main' });
  lm.addInput(params, 'lmShow');
  lm.addInput(params, 'lmX', { min: -1000, max: 1000, step: 1 });
  lm.addInput(params, 'lmY', { min: -1000, max: 1000, step: 1 });
  lm.addInput(params, 'lmScale', { min: 0.1, max: 5, step: 0.01 });
  lm.addInput(params, 'lmRot', { min: -180, max: 180, step: 1 });
  lm.addInput(params, 'lmAlpha', { min: 0, max: 255, step: 1 });

  // "system" ロゴ
  const system = pane.addFolder({ title: 'system' });
  system.addInput(params, 'syShow');
  system.addInput(params, 'syScale', { min: 0.1, max: 5, step: 0.01 });
  system.addInput(params, 'syX', { min: -1000, max: 1000, step: 1 });
  system.addInput(params, 'syY', { min: -1000, max: 1000, step: 1 });

  // 各文字（s/y/s/t/e/m）のサブフォルダを追加するヘルパー
  const addSysLetter = (title, p) => {
    const f = system.addFolder({ title });
    f.addInput(params, p + 'Show');
    f.addInput(params, p + 'X', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Y', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Scale', { min: 0.1, max: 5, step: 0.01 });
    f.addInput(params, p + 'Rot', { min: -180, max: 180, step: 1 });
    f.addInput(params, p + 'Alpha', { min: 0, max: 255, step: 1 });
  };
  addSysLetter('s (1)', 'ss1');
  addSysLetter('y', 'syy');
  addSysLetter('s (2)', 'ss2');
  addSysLetter('t', 'st');
  addSysLetter('e', 'se');
  addSysLetter('m', 'sm');

  // 日付ロゴ（2026.06.04、10文字）
  const date = pane.addFolder({ title: 'date (2026.06.04)' });
  date.addInput(params, 'dtShow');
  date.addInput(params, 'dtScale', { min: 0.1, max: 5, step: 0.01 });
  date.addInput(params, 'dtX', { min: -1000, max: 1000, step: 1 });
  date.addInput(params, 'dtY', { min: -1000, max: 1000, step: 1 });

  // 各文字（2 0 2 6 . 0 6 . 0 4）のサブフォルダ
  const dateLabels = ['2', '0', '2', '6', '.', '0', '6', '.', '0', '4'];
  dateLabels.forEach((label, i) => {
    const p = 'dtc' + i;
    const f = date.addFolder({ title: `${label} (${i})`, expanded: false });
    f.addInput(params, p + 'Show');
    f.addInput(params, p + 'X', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Y', { min: -1000, max: 1000, step: 1 });
    f.addInput(params, p + 'Scale', { min: 0.1, max: 5, step: 0.01 });
    f.addInput(params, p + 'Rot', { min: -180, max: 180, step: 1 });
    f.addInput(params, p + 'Alpha', { min: 0, max: 255, step: 1 });
  });

  // 現在のパラメータを JSON でクリップボードにコピー
  // params（フラット）に加え、別オブジェクトの bg（くらげ背景）も含める
  pane.addButton({ title: 'copy params' }).on('click', () => {
    const all = { ...params, bg: { ...bg_p } };
    const json = JSON.stringify(all, null, 2);
    navigator.clipboard.writeText(json).then(
      () => console.log('copied:\n' + json),
      () => window.prompt('コピーして使ってください', json)
    );
  });
}

// 0..1 の t を一方向に偏らせる（p>1 で t=0 側が密、t=1 側へ疎に広がる）
function biasSpacing(t, p) {
  return Math.pow(t, p);
}

// 線形補間した点
function lerpPt(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// A→B を通る直線を、両端へ ext だけ延長した線分として描く
// （回転しても端が画面内で途切れないよう画面外まで伸ばす）
function drawExtendedLine(A, B, ext) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  line(
    A.x - ux * ext, A.y - uy * ext,
    B.x + ux * ext, B.y + uy * ext
  );
}

// ストリングアート（本体＋ミラー）を指定色で1パス描く。
// 全体の傾き・縦ずらしの変換を内側で適用する（呼び出し側の clip は維持される）。
function drawStringArtPass(r, g, b, a) {
  push();
  translate(width / 2, height / 2 + params.offsetY);
  rotate(radians(params.rotate));
  translate(-width / 2, -height / 2);

  stroke(r, g, b, a);
  strokeWeight(params.strokeW);
  noFill();

  const TL = { x: 0, y: 0 };
  const TR = { x: width, y: 0 };
  const BL = { x: 0, y: height };
  const BR = { x: width, y: height };

  drawStringArt(TL, BL, BL, BR);
  if (params.mirror) drawStringArt(TR, BR, BR, BL);
  pop();
}

// shape モード：紺のストリングアートをオフスクリーンに描き、人物マスクで切り抜いて貼る。
function drawStringOverlayMasked(oc) {
  if (!polyMaskG) return;
  // 専用バッファに紺のストリングアートを描く
  if (!stringOverlayG || stringOverlayG.width !== width || stringOverlayG.height !== height) {
    stringOverlayG = createGraphics(width, height);
    stringOverlayG.pixelDensity(1);
  }
  const g = stringOverlayG;
  g.clear();
  g.push();
  g.translate(width / 2, height / 2 + params.offsetY);
  g.rotate(radians(params.rotate));
  g.translate(-width / 2, -height / 2);
  g.stroke(oc.r, oc.g, oc.b, params.colorA);
  g.strokeWeight(params.strokeW);
  g.noFill();
  drawStringArtOn(g, { x: 0, y: 0 }, { x: 0, y: height }, { x: 0, y: height }, { x: width, y: height });
  if (params.mirror) {
    drawStringArtOn(g, { x: width, y: 0 }, { x: width, y: height }, { x: width, y: height }, { x: 0, y: height });
  }
  g.pop();
  // 人物マスク（白=人物）で切り抜く：マスク外を消す
  g.drawingContext.globalCompositeOperation = 'destination-in';
  g.image(polyMaskG, 0, 0);
  g.drawingContext.globalCompositeOperation = 'source-over';
  // 切り抜いた紺の線をメインキャンバスへ貼る
  image(g, 0, 0);
}

// 任意のグラフィックスバッファ g にストリングアート1セットを描く（drawStringArt の g 版）
function drawStringArtOn(g, a0, a1, b0, b1) {
  const n = params.lines;
  const ext = Math.hypot(width, height);
  const e = params.extend;
  const total = Math.max(2, Math.round(n * (1 + 2 * e)));
  for (let i = 0; i < total; i++) {
    const u = total === 1 ? 0 : i / (total - 1);
    const tRaw = lerp(-e, 1 + e, u);
    const t = tRaw < 0 || tRaw > 1 ? tRaw : biasSpacing(tRaw, params.spacingBias);
    const ta = params.shiftA + t * params.spanA;
    const tb = params.shiftB + t * params.spanB;
    const A = lerpPt(a0, a1, ta);
    const B = lerpPt(b0, b1, tb);
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    g.line(A.x - ux * ext, A.y - uy * ext, B.x + ux * ext, B.y + uy * ext);
  }
}

// ストリングアート1セットを描く。
// 辺A：a0→a1、辺B：b0→b1 上を点が進み、対応点同士を結ぶ
function drawStringArt(a0, a1, b0, b1) {
  const n = params.lines;
  // 回転しても画面全体を覆えるよう、各線を画面対角線分だけ両端へ延長
  const ext = Math.hypot(width, height);

  // 包絡線（放物線）を t 範囲の外へ延長：本数を増やし、t を [-e, 1+e] に広げる
  const e = params.extend;
  const total = Math.max(2, Math.round(n * (1 + 2 * e)));

  for (let i = 0; i < total; i++) {
    // -e .. 1+e の範囲を均等に進む（lerpPt は外挿するので辺の外にも点が出る）
    const u = total === 1 ? 0 : i / (total - 1);
    const tRaw = lerp(-e, 1 + e, u);
    // bias は 0..1 区間にだけ掛け、外挿部分はそのまま延長
    const t = tRaw < 0 || tRaw > 1
      ? tRaw
      : biasSpacing(tRaw, params.spacingBias);

    // span / shift で各辺の使う区間を調整
    const ta = params.shiftA + t * params.spanA;
    const tb = params.shiftB + t * params.spanB;

    const A = lerpPt(a0, a1, ta);
    const B = lerpPt(b0, b1, tb);
    drawExtendedLine(A, B, ext);
  }
}

// 横の個数を計算（cols>0 で手動指定、0 で領域幅から自動）
function resolveCols(cols, paddingX, spacingX) {
  if (cols > 0) return cols;
  const regionWidth = width - 2 * paddingX;
  return Math.max(1, Math.ceil(regionWidth / spacingX) + 2);
}

// 中心(0,0)・外接円半径 r の上向き三角形を縦線（ハッチング）で塗る
// opacity (0..1) で全体の不透明度を制御。lineW/lineSpacing は設定から渡す
function drawHatchedTriangle(r, t, opacity, lineW, lineSpacing, col) {
  const w = (r * Math.sqrt(3)) / 2;
  const bottomY = r / 2;
  const topY = -r;

  const envelope = t !== null ? Math.sin(t * Math.PI) : 0;
  const wavePos = t !== null ? t : 0;

  strokeWeight(lineW);
  for (let x = -w; x <= w; x += lineSpacing) {
    let yTop;
    if (x <= 0) {
      const tt = (x + w) / w;
      yTop = bottomY + tt * (topY - bottomY);
    } else {
      const tt = x / w;
      yTop = topY + tt * (bottomY - topY);
    }

    let brightness = 255;
    if (t !== null) {
      const linePos = (x + w) / (2 * w);
      const dist = linePos - wavePos;
      const peak = Math.exp(-dist * dist * 40);
      const dim = envelope * (1 - peak);
      brightness = 255 * (1 - dim * 0.9);
    }
    {
      const sb = brightness / 255; // 0..1 の明度
      const sc = col || { r: 47, g: 81, b: 233 };
      stroke(sc.r * sb, sc.g * sb, sc.b * sb, 255 * opacity);
    }
    line(x, yTop, x, bottomY);
  }
}

// 流れるハッチング三角形の帯を描く（main13）。
// cfg: tri* の設定値、state: アニメーション状態（{ animating, animT }）
function drawTriangleFlow(cfg, state) {
  const colsN = resolveCols(cfg.cols, cfg.paddingX, cfg.spacingX);

  const wrapStart = cfg.paddingX - cfg.spacingX; // 領域左端の1スロット前から
  const wrapRange = colsN * cfg.spacingX;

  const totalH = (cfg.rows - 1) * cfg.spacingY;
  const startY = height / 2 + cfg.offsetY - totalH / 2;

  const animValue = state.animating ? state.animT : null;

  for (let r = 0; r < cfg.rows; r++) {
    // 偶数段は左へ、奇数段は右へ（向きも交互）
    const direction = r % 2 === 0 ? -1 : 1;
    const rotation = r % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
    const rowOffset = frameCount * cfg.speed * direction;

    for (let c = 0; c < colsN; c++) {
      const baseX = wrapStart + c * cfg.spacingX;
      let x = baseX + rowOffset;
      x = (((x - wrapStart) % wrapRange) + wrapRange) % wrapRange + wrapStart;

      // 図形が並ぶ範囲（ラップ範囲）の両端からの距離で不透明度を計算
      const minDist = Math.min(x - wrapStart, wrapStart + wrapRange - x);
      const opacity = cfg.fade
        ? constrain(minDist / cfg.fadeWidth, 0, 1)
        : 1;

      const y = startY + r * cfg.spacingY;

      // 進行方向に転がる：画面上の位置 x を半径で割った角。位置ベースなので
      // ブレずにコロコロ転がる。direction で転がる向きを揃える。
      const roll = (x / cfg.size) * direction;

      push();
      translate(x, y);
      rotate(rotation + roll); // 段の向き + 転がり
      drawHatchedTriangle(cfg.size, animValue, opacity, cfg.lineW, cfg.lineSpacing, cfg.color);
      pop();
    }
  }

  advanceAnim(state, cfg.animFrames);
}

// アニメーション状態を1フレーム進める
function advanceAnim(state, animFrames) {
  if (state.animating) {
    state.animT += 1 / animFrames;
    if (state.animT >= 1) {
      state.animT = 1;
      state.animating = false;
    }
  }
}

// params から三角形の設定オブジェクトを取り出す（prefix='tri' or 'tri2'）
function triCfg(prefix) {
  return {
    rows: params[prefix + 'Rows'],
    cols: params[prefix + 'Cols'],
    size: params[prefix + 'Size'],
    spacingX: params[prefix + 'SpacingX'],
    spacingY: params[prefix + 'SpacingY'],
    lineSpacing: params[prefix + 'LineSpacing'],
    lineW: params[prefix + 'LineW'],
    speed: params[prefix + 'Speed'],
    fade: params[prefix + 'Fade'],
    fadeWidth: params[prefix + 'FadeWidth'],
    paddingX: params[prefix + 'PaddingX'],
    offsetY: params[prefix + 'OffsetY'],
    animFrames: params[prefix + 'AnimFrames'],
    color: params[prefix + 'Color'],
  };
}

// 領域を埋めるのに必要な円の数を計算
function recomputeCirCols() {
  if (params.cirCols > 0) {
    cirColsN = params.cirCols; // 手動指定
    return;
  }
  const regionWidth = width - 2 * params.cirPaddingX;
  cirColsN = Math.max(1, Math.ceil(regionWidth / params.cirSpacingX) + 2);
}

// 中心(0,0)・半径 r の円を横線（ハッチング）で塗る
// opacity (0..1) で全体の不透明度を制御
function drawHatchedCircle(r, t, opacity, col) {
  const envelope = t !== null ? Math.sin(t * Math.PI) : 0;
  const wavePos = t !== null ? t : 0;

  strokeWeight(params.cirLineW);
  for (let y = -r; y <= r; y += params.cirLineSpacing) {
    // 円の縁：y における左右の x
    const w = Math.sqrt(Math.max(0, r * r - y * y));

    let brightness = 255;
    if (t !== null) {
      const linePos = (y + r) / (2 * r);
      const dist = linePos - wavePos;
      const peak = Math.exp(-dist * dist * 40);
      const dim = envelope * (1 - peak);
      brightness = 255 * (1 - dim * 0.9);
    }
    {
      const sb = brightness / 255; // 0..1 の明度
      const sc = col || { r: 47, g: 81, b: 233 };
      stroke(sc.r * sb, sc.g * sb, sc.b * sb, 255 * opacity);
    }
    line(-w, y, w, y);
  }
}

// 転がるハッチング円の帯を描く（main17）
function drawCircles() {
  recomputeCirCols();

  const regionLeft = params.cirPaddingX;

  const wrapStart = regionLeft - params.cirSpacingX;
  const wrapRange = cirColsN * params.cirSpacingX;

  const totalH = (params.cirRows - 1) * params.cirSpacingY;
  const startY = height / 2 + params.cirOffsetY - totalH / 2;

  const animValue = cirAnimating ? cirAnimT : null;

  for (let r = 0; r < params.cirRows; r++) {
    // 偶数段は左へ、奇数段は右へ
    const direction = r % 2 === 0 ? -1 : 1;
    const rowOffset = frameCount * params.cirSpeed * direction;

    for (let c = 0; c < cirColsN; c++) {
      const baseX = wrapStart + c * params.cirSpacingX;
      let x = baseX + rowOffset;
      x = (((x - wrapStart) % wrapRange) + wrapRange) % wrapRange + wrapStart;

      // 図形が並ぶ範囲（ラップ範囲）の両端からの距離で不透明度を計算
      const minDist = Math.min(x - wrapStart, wrapStart + wrapRange - x);
      const opacity = params.cirFade
        ? constrain(minDist / params.cirFadeWidth, 0, 1)
        : 1;

      const y = startY + r * params.cirSpacingY;

      // 進行方向に転がる：画面上の位置 x を半径で割った角（位置ベースでブレない）
      const roll = (x / params.cirSize) * direction;

      push();
      translate(x, y);
      rotate(roll);
      drawHatchedCircle(params.cirSize, animValue, opacity, params.cirColor);
      pop();
    }
  }

  if (cirAnimating) {
    cirAnimT += 1 / params.cirAnimFrames;
    if (cirAnimT >= 1) {
      cirAnimT = 1;
      cirAnimating = false;
    }
  }
}

// 中心(0,0)・半辺長 r の正方形を横線（ハッチング）で塗る
// opacity (0..1) で全体の不透明度を制御。lineW/lineSpacing は設定から渡す
function drawHatchedSquare(r, t, opacity, lineW, lineSpacing, col) {
  const envelope = t !== null ? Math.sin(t * Math.PI) : 0;
  const wavePos = t !== null ? t : 0;

  strokeWeight(lineW);
  for (let y = -r; y <= r; y += lineSpacing) {
    // 正方形なので各横線は全幅一定
    const w = r;

    let brightness = 255;
    if (t !== null) {
      const linePos = (y + r) / (2 * r);
      const dist = linePos - wavePos;
      const peak = Math.exp(-dist * dist * 40);
      const dim = envelope * (1 - peak);
      brightness = 255 * (1 - dim * 0.9);
    }
    {
      const sb = brightness / 255; // 0..1 の明度
      const sc = col || { r: 47, g: 81, b: 233 };
      stroke(sc.r * sb, sc.g * sb, sc.b * sb, 255 * opacity);
    }
    line(-w, y, w, y);
  }
}

// 転がるハッチング正方形の帯を描く（main18）。
// cfg: sq* の設定値、state: アニメーション状態（{ animating, animT }）
function drawSquareFlow(cfg, state) {
  const colsN = resolveCols(cfg.cols, cfg.paddingX, cfg.spacingX);

  const wrapStart = cfg.paddingX - cfg.spacingX;
  const wrapRange = colsN * cfg.spacingX;

  const totalH = (cfg.rows - 1) * cfg.spacingY;
  const startY = height / 2 + cfg.offsetY - totalH / 2;

  const animValue = state.animating ? state.animT : null;

  for (let r = 0; r < cfg.rows; r++) {
    // 偶数段は左へ、奇数段は右へ
    const direction = r % 2 === 0 ? -1 : 1;
    const rowOffset = frameCount * cfg.speed * direction;

    for (let c = 0; c < colsN; c++) {
      const baseX = wrapStart + c * cfg.spacingX;
      let x = baseX + rowOffset;
      x = (((x - wrapStart) % wrapRange) + wrapRange) % wrapRange + wrapStart;

      // 図形が並ぶ範囲（ラップ範囲）の両端からの距離で不透明度を計算
      const minDist = Math.min(x - wrapStart, wrapStart + wrapRange - x);
      const opacity = cfg.fade
        ? constrain(minDist / cfg.fadeWidth, 0, 1)
        : 1;

      const y = startY + r * cfg.spacingY;

      // 進行方向に転がる：画面上の位置 x を半径で割った角（位置ベースでブレない）
      const roll = (x / cfg.size) * direction;

      push();
      translate(x, y);
      rotate(roll);
      drawHatchedSquare(cfg.size, animValue, opacity, cfg.lineW, cfg.lineSpacing, cfg.color);
      pop();
    }
  }

  advanceAnim(state, cfg.animFrames);
}

// params から正方形の設定オブジェクトを取り出す（prefix='sq' or 'sq2'）
function sqCfg(prefix) {
  return {
    rows: params[prefix + 'Rows'],
    cols: params[prefix + 'Cols'],
    size: params[prefix + 'Size'],
    spacingX: params[prefix + 'SpacingX'],
    spacingY: params[prefix + 'SpacingY'],
    lineSpacing: params[prefix + 'LineSpacing'],
    lineW: params[prefix + 'LineW'],
    speed: params[prefix + 'Speed'],
    fade: params[prefix + 'Fade'],
    fadeWidth: params[prefix + 'FadeWidth'],
    paddingX: params[prefix + 'PaddingX'],
    offsetY: params[prefix + 'OffsetY'],
    animFrames: params[prefix + 'AnimFrames'],
    color: params[prefix + 'Color'],
  };
}

function draw() {
  background(0); // 下地（背景の変形で隙間ができても黒地が見えるように）

  // Q アニメの自動発動（autoQSec 秒ごと）
  if (params.autoQ) {
    const now = millis();
    if (now - lastAutoQMs >= params.autoQSec * 1000) {
      lastAutoQMs = now;
      triggerQAnimation();
    }
  }

  // 人物 wireAlpha ブーストを 0 へ減衰（毎フレーム1回。drawPolyPerson は2回呼ばれるためここで）
  if (polyWireBoost > 0.5) {
    polyWireBoost *= params.polyWireDecay;
  } else {
    polyWireBoost = 0;
  }

  // セグメンテーションの死活監視（放置後の「全面ポリゴン化」対策）。
  // ml5 の検出ループは例外で静かに死ぬことがあり、死ぬとマスクが最後の値のまま凍結する。
  // コールバックが polyStaleSec 秒途絶えたらループが死んだと判断して再起動する。
  // 正常時はコールバックが毎秒何十回も来るため、ここは決して発動しない。
  // タブ非表示・スリープ等で描画自体が止まっていた場合は、ml5 のループも
  // 一緒に止まっていただけなので、復帰直後は再起動せず同じ猶予を与える。
  const nowMs = millis();
  if (lastDrawMs > 0 && nowMs - lastDrawMs > 1000) {
    polySegStartAtMs = nowMs; // 復帰直後：ウォッチドッグの計測をやり直す
  }
  lastDrawMs = nowMs;
  if (polyReady && polySeg && polySegStartAtMs > 0) {
    const aliveAt = Math.max(polySegMaskAtMs, polySegStartAtMs);
    if (nowMs - aliveAt > params.polyStaleSec * 1000) {
      restartPolySeg();
    }
  }

  // 一番背後のレイヤー：クラゲ写真をシェーダーで揺らした背景
  if (bg_p.show) {
    drawBackground();
  }

  // 背景の上に漂う線（main10）。ストリングアートより背後
  if (params.flowShow) {
    drawFlow();
  }

  // 背景の稲妻（main20）。Q（=クリック）で引き直す。ストリングアートより背後
  if (params.boltShow) {
    drawBolt();
  }

  // 人物ローポリ（main21）。flow/稲妻の手前・ストリングアートの背後。
  // ただし帯の領域は、帯の手前に出すため後でもう一度描く（ここでは帯より上だけ）。
  if (params.polyShow) {
    const br = bandRect();
    if (br) {
      // 帯より上の領域だけクリップして描く（帯にかかる部分は後で前面に）
      drawPolyPerson({ x: 0, y: 0, w: width, h: br.y });
    } else {
      drawPolyPerson();
    }
  }

  // 動き検出ボックス（main22）：ピンクの点線の枠＋近接リンク
  if (params.boxOn) {
    drawMotionBoxes();
  }

  stroke(params.colorR, params.colorG, params.colorB, params.colorA);
  strokeWeight(params.strokeW);
  noFill();

  // ストリングアート（収納できる）。通常色で全体を描く。
  if (params.stringShow) {
    drawStringArtPass(params.colorR, params.colorG, params.colorB, params.colorA);

    // 人物と重なる部分だけ、別色（紺）でもう一度描いて上書きする
    const overlap = params.stringOverlapMode;
    if (params.polyShow && overlap !== 'off') {
      const oc = params.stringOverlapColor;
      const ctx = drawingContext;
      let clipped = false;
      ctx.save();
      if (overlap === 'bbox' && polyCanvasBox) {
        ctx.beginPath();
        ctx.rect(polyCanvasBox.x, polyCanvasBox.y, polyCanvasBox.w, polyCanvasBox.h);
        ctx.clip();
        clipped = true;
      } else if (overlap === 'shape' && polyMaskG) {
        // 人物マスク（白=人物）を使い、これから描く線をマスク内だけに残す
        clipped = true; // マスク適用は描画後に合成で行う
      }
      if (overlap === 'shape' && polyMaskG && clipped) {
        // 紺の線をオフスクリーンに描き、マスクで人物形状に切り抜いてから貼る
        drawStringOverlayMasked(oc);
        ctx.restore();
      } else if (clipped) {
        drawStringArtPass(oc.r, oc.g, oc.b, params.colorA);
        ctx.restore();
      } else {
        ctx.restore();
      }
    }
  }

  // 流れるハッチング三角形（main13）。回転の影響を受けないよう pop の外で描く
  if (params.triShow) {
    drawTriangleFlow(triCfg('tri'), triState);
  }
  if (params.tri2Show) {
    drawTriangleFlow(triCfg('tri2'), tri2State);
  }

  // 転がるハッチング円（main17）。回転の影響を受けないよう pop の外で描く
  if (params.cirShow) {
    drawCircles();
  }

  // 転がるハッチング正方形（main18）。回転の影響を受けないよう pop の外で描く
  if (params.sqShow) {
    drawSquareFlow(sqCfg('sq'), sqState);
  }
  if (params.sq2Show) {
    drawSquareFlow(sqCfg('sq2'), sq2State);
  }

  // ロゴ文字（I / D / D）。DOM 要素なので毎フレーム位置を更新（表示/非表示も内部で処理）
  drawLetters();

  // 下部の帯（横長の長方形）。回転の影響を受けないよう pop の外で描く。
  // レイヤー順：帯の黒 → 人物（帯領域）→ 帯テキスト。
  // （人物は帯の黒より手前、ただし帯の文字は人物より前で読めるように）
  const bh = height * params.bandH;
  const top = height - bh;
  if (params.band) {
    noStroke();
    fill(params.bandR, params.bandG, params.bandB);
    rect(0, top, width, bh);

    // 帯の領域だけ、人物ローポリを帯の黒より手前に描く
    if (params.polyShow) {
      const br = bandRect();
      if (br) drawPolyPerson(br);
    }
  }

  // 帯テキスト（課題情報）は帯の有無に関わらず常に描く（人物より前＝最後）
  drawBandText(top, bh);

  // ロゴの輪郭線アニメは帯の後に描く（帯に隠れず最前面に出すため）
  drawLetterOutlines();
}

// ロゴ群を DOM 要素として配置・更新する（汎用）。
// 各文字SVGは元の viewBox を共有するので、同じ位置・倍率で重ねると元のロゴが再現される。
// group: { show, scale, x, y, svgW, svgH, letters[] }
//   letters[]: { dom, show, x, y, s, rot, a }
// DOM はベクターのまま描かれるので拡大してもジャギーにならない。
function drawLogoGroup(group) {
  for (const L of group.letters) {
    if (!L.dom) continue;
    const el = L.dom.elt;

    // 群全体オフ or 個別オフなら隠す
    if (!group.show || !L.show) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = 'block';

    // キャンバス座標系（1単位=1px）で、中心を基準に配置
    const cx = width / 2 + group.x + L.x;
    const cy = height / 2 + group.y + L.y;
    const scale = group.scale * L.s;

    // SVG の元サイズに合わせて幅を固定（高さは比率で追従）
    el.style.width = group.svgW + 'px';
    el.style.height = group.svgH + 'px';
    // translate でSVG中心を cx,cy に合わせる（要素左上が原点なので半分戻す）
    el.style.transform =
      `translate(${cx}px, ${cy}px) translate(-50%, -50%) ` +
      `rotate(${L.rot}deg) scale(${scale})`;
    el.style.opacity = (L.a / 255).toString();

    // 枠線なぞりアニメ中は、この文字の配置を記録しておき、帯より後でまとめて線を描く
    // （帯に隠れず最前面に出すため。実描画は drawLetterOutlines() で行う）
    if (logoAnimActive) {
      logoPlacements.push({ el, cx, cy, sc: scale, rot: L.rot, svgW: group.svgW, svgH: group.svgH });
    }
  }
}

// 記録した各文字の輪郭線を、オーバーレイ canvas（ロゴ <img> より手前）にまとめて描く。
function drawLetterOutlines() {
  if (!overlayCtx) return;
  // 毎フレーム、オーバーレイをクリア
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!logoAnimActive) return;
  for (const p of logoPlacements) {
    try {
      drawLetterOutline(p.el, p.cx, p.cy, p.sc, p.rot, p.svgW, p.svgH);
    } catch (e) {
      console.warn('outline 描画失敗:', e);
    }
  }
}

// 1文字分の輪郭を白い線でなぞって、オーバーレイ canvas に描く（Canvas2D で DOM の transform を再現）。
// progress に応じて各輪郭を totalLen の途中まで描き、最後はフェードして消す。
function drawLetterOutline(imgEl, cx, cy, sc, rotDeg, svgW, svgH) {
  const data = letterOutlines.get(imgEl);
  if (!data || data.totalLen <= 0) return;
  const ctx = overlayCtx;
  if (!ctx) return;

  // 全体進行：0→1 で描画、その後フェード
  const elapsed = millis() - logoAnimStartMs;
  const drawMs = Math.max(1, params.logoAnimDrawMs);
  const fadeMs = Math.max(1, params.logoAnimFadeMs);
  const drawT = constrain(elapsed / drawMs, 0, 1);
  const fade = elapsed <= drawMs
    ? 1
    : constrain(1 - (elapsed - drawMs) / fadeMs, 0, 1);
  if (fade <= 0) return;

  // この文字で「今描いてよい長さ」（viewBox 単位）
  const drawLen = data.totalLen * easeInOut(drawT);
  // viewBox → 表示サイズへのスケール（0除算ガード）
  const sx = data.vbW ? svgW / data.vbW : 1;
  const sy = data.vbH ? svgH / data.vbH : 1;
  // 輪郭点（viewBox座標）→ 画面座標への合成スケール
  const totalScale = sc * Math.max(sx, sy) || 1;

  ctx.save();
  // DOM の transform と同じ：中心へ移動（線だけ X/Y ずらす）→ 回転 → スケール → 左上原点へ → viewBox へ
  ctx.translate(cx + params.logoAnimOffsetX, cy + params.logoAnimOffsetY);
  ctx.rotate((rotDeg * Math.PI) / 180);
  ctx.scale(sc, sc);
  ctx.translate(-svgW / 2, -svgH / 2);
  ctx.scale(sx, sy);

  ctx.strokeStyle = `rgba(255,255,255,${fade})`;
  ctx.lineWidth = constrain(params.logoAnimWeight / totalScale, 0.0001, 50);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let remaining = drawLen;
  for (const ct of data.contours) {
    if (remaining <= 0) break;
    const pts = ct.pts;
    if (!pts || pts.length < 2) { remaining -= ct.len; continue; }
    const ratio = constrain(remaining / ct.len, 0, 1);
    const upto = Math.max(1, Math.floor((pts.length - 1) * ratio));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= upto; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    remaining -= ct.len;
  }
  ctx.restore();
}

// easeInOut（smoothstep）
function easeInOut(t) {
  t = constrain(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// ロゴ文字（IDD / IDDD の2群）を更新する
function drawLetters() {
  // 枠線なぞりアニメの終了判定（描画 + フェードが終わったら止める）
  if (logoAnimActive && millis() - logoAnimStartMs > params.logoAnimDrawMs + params.logoAnimFadeMs) {
    logoAnimActive = false;
  }
  // このフレームの配置記録をリセット（drawLogoGroup が貯め直す）
  logoPlacements = [];

  // ロゴ1（IDD）
  drawLogoGroup({
    show: params.lettersShow, scale: params.lettersScale,
    x: params.lettersX, y: params.lettersY, svgW: SVG_W, svgH: SVG_H,
    letters: [
      { dom: domI, show: params.iShow, x: params.iX, y: params.iY, s: params.iScale, rot: params.iRot, a: params.iAlpha },
      { dom: domD1, show: params.d1Show, x: params.d1X, y: params.d1Y, s: params.d1Scale, rot: params.d1Rot, a: params.d1Alpha },
      { dom: domD2, show: params.d2Show, x: params.d2X, y: params.d2Y, s: params.d2Scale, rot: params.d2Rot, a: params.d2Alpha },
    ],
  });

  // ロゴ2（IDDD）
  drawLogoGroup({
    show: params.l2Show, scale: params.l2Scale,
    x: params.l2X, y: params.l2Y, svgW: SVG2_W, svgH: SVG2_H,
    letters: [
      { dom: domL2I, show: params.l2iShow, x: params.l2iX, y: params.l2iY, s: params.l2iScale, rot: params.l2iRot, a: params.l2iAlpha },
      { dom: domL2D1, show: params.l2d1Show, x: params.l2d1X, y: params.l2d1Y, s: params.l2d1Scale, rot: params.l2d1Rot, a: params.l2d1Alpha },
      { dom: domL2D2, show: params.l2d2Show, x: params.l2d2X, y: params.l2d2Y, s: params.l2d2Scale, rot: params.l2d2Rot, a: params.l2d2Alpha },
      { dom: domL2D3, show: params.l2d3Show, x: params.l2d3X, y: params.l2d3Y, s: params.l2d3Scale, rot: params.l2d3Rot, a: params.l2d3Alpha },
    ],
  });

  // アンパサンド（&）。1文字なので群スケールは1、文字側で調整
  drawLogoGroup({
    show: params.ampShow, scale: 1, x: 0, y: 0, svgW: AMP_W, svgH: AMP_H,
    letters: [
      { dom: domAmp, show: true, x: params.ampX, y: params.ampY, s: params.ampScale, rot: params.ampRot, a: params.ampAlpha },
    ],
  });

  // "design"（d/e/s/i/g/n）
  drawLogoGroup({
    show: params.deShow, scale: params.deScale,
    x: params.deX, y: params.deY, svgW: DES_W, svgH: DES_H,
    letters: [
      { dom: domDeD, show: params.ddShow, x: params.ddX, y: params.ddY, s: params.ddScale, rot: params.ddRot, a: params.ddAlpha },
      { dom: domDeE, show: params.deeShow, x: params.deeX, y: params.deeY, s: params.deeScale, rot: params.deeRot, a: params.deeAlpha },
      { dom: domDeS, show: params.dsShow, x: params.dsX, y: params.dsY, s: params.dsScale, rot: params.dsRot, a: params.dsAlpha },
      { dom: domDeI, show: params.diShow, x: params.diX, y: params.diY, s: params.diScale, rot: params.diRot, a: params.diAlpha },
      { dom: domDeG, show: params.dgShow, x: params.dgX, y: params.dgY, s: params.dgScale, rot: params.dgRot, a: params.dgAlpha },
      { dom: domDeN, show: params.dnShow, x: params.dnX, y: params.dnY, s: params.dnScale, rot: params.dnRot, a: params.dnAlpha },
    ],
  });

  // メインロゴ（単一）
  drawLogoGroup({
    show: params.lmShow, scale: 1, x: 0, y: 0, svgW: LM_W, svgH: LM_H,
    letters: [
      { dom: domLM, show: true, x: params.lmX, y: params.lmY, s: params.lmScale, rot: params.lmRot, a: params.lmAlpha },
    ],
  });

  // "system"（s/y/s/t/e/m）
  drawLogoGroup({
    show: params.syShow, scale: params.syScale,
    x: params.syX, y: params.syY, svgW: SYS_W, svgH: SYS_H,
    letters: [
      { dom: domSyS1, show: params.ss1Show, x: params.ss1X, y: params.ss1Y, s: params.ss1Scale, rot: params.ss1Rot, a: params.ss1Alpha },
      { dom: domSyY, show: params.syyShow, x: params.syyX, y: params.syyY, s: params.syyScale, rot: params.syyRot, a: params.syyAlpha },
      { dom: domSyS2, show: params.ss2Show, x: params.ss2X, y: params.ss2Y, s: params.ss2Scale, rot: params.ss2Rot, a: params.ss2Alpha },
      { dom: domSyT, show: params.stShow, x: params.stX, y: params.stY, s: params.stScale, rot: params.stRot, a: params.stAlpha },
      { dom: domSyE, show: params.seShow, x: params.seX, y: params.seY, s: params.seScale, rot: params.seRot, a: params.seAlpha },
      { dom: domSyM, show: params.smShow, x: params.smX, y: params.smY, s: params.smScale, rot: params.smRot, a: params.smAlpha },
    ],
  });

  // 日付ロゴ（2026.06.04 の10文字）
  drawLogoGroup({
    show: params.dtShow, scale: params.dtScale,
    x: params.dtX, y: params.dtY, svgW: DATE_W, svgH: DATE_H,
    letters: domDate.map((dom, i) => ({
      dom,
      show: params['dtc' + i + 'Show'],
      x: params['dtc' + i + 'X'], y: params['dtc' + i + 'Y'],
      s: params['dtc' + i + 'Scale'], rot: params['dtc' + i + 'Rot'],
      a: params['dtc' + i + 'Alpha'],
    })),
  });
}

// 帯の上に課題情報を配置する
function drawBandText(top, bh) {
  const unit = bh * params.textScale; // 帯の高さ×倍率を基準に文字サイズを決める
  const size = unit * 0.13;
  const lineH = size * 1.4 * params.lineGap; // 1行の送り（行間）
  // 左の余白 + 横オフセット（textOffsetX で左右に調整）
  const padX = bh * 0.4 + width * params.textOffsetX;

  // 表示する行。空文字は空白行（1行目と2行目の間を空ける）
  const lines = [
    '多摩美術大学オープンキャンパス　情報デザイン棟4F',
    '',
    'プログラミング基礎　[担当教員]永松歩　高橋裕行',
    '多摩美術大学情報デザイン学科情報デザインコース1年Bクラス',
  ];

  fill(255);
  noStroke();
  textStyle(NORMAL);
  textSize(size);
  textAlign(LEFT, CENTER);

  // 全行をまとめて帯の縦中央に配置（textOffsetY で上下に調整）
  const blockH = lineH * (lines.length - 1);
  const cy = top + bh / 2 + bh * params.textOffsetY;
  let y = cy - blockH / 2;
  for (const s of lines) {
    text(s, padX, y);
    y += lineH;
  }
}

function windowResized() {
  resizeCanvas(...portraitSize());
  // オーバーレイ canvas もメインに合わせる
  resizeOverlay();
  // 背景バッファをキャンバスの新サイズで作り直す
  setupBackground();
  // 漂う線も新サイズで撒き直す
  initFlow();
  // 稲妻も新サイズで引き直す
  generateBolt();
}

// F キーでフルスクリーン、Q キーで三角形のハッチング波アニメーション
function keyPressed() {
  if (key === 'f' || key === 'F') {
    fullscreen(!fullscreen());
    // フルスクリーン反映後にキャンバスをリサイズ（反映は非同期）
    setTimeout(() => {
      resizeCanvas(...portraitSize());
      resizeOverlay();
      setupBackground();
    }, 100);
  }
  if (key === 'q' || key === 'Q') {
    triggerQAnimation();
  }
  if (key === 'h' || key === 'H') {
    // Tweakpane の UI を表示/非表示トグル
    if (tweakPane && tweakPane.element) {
      const el = tweakPane.element;
      el.style.display = (el.style.display === 'none') ? '' : 'none';
    }
  }
  if (key === 's' || key === 'S') {
    // 見た目全体（メインキャンバス + ロゴSVG + 線オーバーレイ）を1枚に合成して保存
    saveScreenshot();
  }
}

// 3つのレイヤー（メインcanvas / ロゴ<img> / 線オーバーレイcanvas）を
// 重なり順どおりに合成し、PNG としてダウンロードする。
function saveScreenshot() {
  const mainCanvas = document.querySelector('#canvas-wrap canvas');
  if (!mainCanvas) return;

  // 論理サイズ（CSS px）。ロゴ <img> の transform はこの座標系で指定されている。
  // メインキャンバスは Retina で実ピクセルが密度倍になっているため、論理座標へ統一する。
  const Wl = width;   // p5 の論理幅
  const Hl = height;  // p5 の論理高さ
  const density = (typeof pixelDensity === 'function' ? pixelDensity() : 1) || 1;

  // 合成用 canvas は実ピクセル解像度で作り、context を density 倍にして
  // 以降すべて「論理座標」で描く（メイン・ロゴ・オーバーレイの基準を一致させる）。
  const out = document.createElement('canvas');
  out.width = Math.round(Wl * density);
  out.height = Math.round(Hl * density);
  const ctx = out.getContext('2d');
  ctx.scale(density, density);

  // 1) メインキャンバス（背景・図形・帯）。実ピクセル→論理サイズへ縮小して貼る。
  ctx.drawImage(mainCanvas, 0, 0, Wl, Hl);

  // 2) ロゴSVG（.letter の <img>）。各要素の CSS transform を論理座標で再現。
  //    drawLogoGroup と同じ式：中心(cx,cy)→中心合わせ(-50%)→回転→スケール。
  const letters = document.querySelectorAll('#canvas-wrap .letter');
  letters.forEach((el) => {
    if (el.style.display === 'none' || !el.complete || el.naturalWidth === 0) return;
    const w = parseFloat(el.style.width) || el.naturalWidth;
    const h = parseFloat(el.style.height) || el.naturalHeight;
    const tr = el.style.transform || '';
    const mT = tr.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    const mR = tr.match(/rotate\(([-\d.]+)deg\)/);
    const mS = tr.match(/scale\(([-\d.]+)\)/);
    const cx = mT ? parseFloat(mT[1]) : Wl / 2;
    const cy = mT ? parseFloat(mT[2]) : Hl / 2;
    const rot = mR ? parseFloat(mR[1]) : 0;
    const sc = mS ? parseFloat(mS[1]) : 1;
    const op = el.style.opacity !== '' ? parseFloat(el.style.opacity) : 1;

    ctx.save();
    ctx.globalAlpha = op;
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sc, sc);
    ctx.drawImage(el, -w / 2, -h / 2, w, h);
    ctx.restore();
  });

  // 3) 線オーバーレイ canvas（ロゴの白い枠線アニメ）。論理サイズへ貼る。
  if (overlayCanvas) ctx.drawImage(overlayCanvas, 0, 0, Wl, Hl);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const link = document.createElement('a');
  link.download = `poster-${ts}.png`;
  link.href = out.toDataURL('image/png');
  link.click();
}

// Q のアニメーション一式を発火（手動 Q / 7秒ごとの自動の両方から呼ぶ）
function triggerQAnimation() {
  for (const s of [triState, tri2State, sqState, sq2State]) {
    s.animT = 0;
    s.animating = true;
  }
  cirAnimT = 0;
  cirAnimating = true;
  // flow を一気に加速（速度＋線幅ブースト）。毎フレーム 1.0 へ減衰する。
  flowBoost = FLOW_BOOST_ON;
  // 稲妻を引き直す（main20 のクリックと同じ動き）
  generateBolt();
  // ロゴの枠線描画アニメを再生（白い線でなぞる → 塗りが現れる）
  playLogoAnim();
  // 人物の縁線 alpha を peak まで跳ね上げる（その後 base へ減衰）
  polyWireBoost = Math.max(0, params.polyWirePeak - params.polyWireAlpha);
}

// クリックでも稲妻を引き直す（main20 の mousePressed と同じ）
function mousePressed() {
  generateBolt();
}

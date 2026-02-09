// 縦画面警告の表示制御
function updateOrientationWarning() {
  const warning = document.getElementById('orientation-warning');
  if (window.matchMedia('(orientation: portrait)').matches) {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

window.addEventListener('resize', updateOrientationWarning);
window.addEventListener('orientationchange', updateOrientationWarning);
document.addEventListener('DOMContentLoaded', updateOrientationWarning);
/* --------------------
   オーディオマネージャー
-------------------- */

const AudioManager = {
  bgm: {
    main: null,
    game: null
  },
  se: {
    correct: null,
    wrong: null,
    button: null  // 画面遷移ボタン用
  },
  currentBGM: null,
  currentBGMType: null,  // 現在再生中のBGMタイプ（'main' or 'game'）
  bgmUnlocked: false,    // BGMが一度でも再生成功したか
  isInitialized: false,
  userInteracted: false,

  // 音源の初期化
  init() {
    if (this.isInitialized) return;
    
    // BGM
    this.bgm.main = new Audio('audio/main.bgm.mp3');
    this.bgm.main.loop = true;
    this.bgm.main.volume = 0.3;
    
    this.bgm.game = new Audio('audio/game.bgm.mp3');
    this.bgm.game.loop = true;
    this.bgm.game.volume = 0.3;
    
    // SE
    this.se.correct = new Audio('audio/correct.mp3');
    this.se.correct.volume = 0.5;
    
    this.se.wrong = new Audio('audio/wrong.mp3');
    this.se.wrong.volume = 0.5;
    
    this.se.button = new Audio('audio/button.mp3');
    this.se.button.volume = 0.4;
    
    this.isInitialized = true;
  },

  // ユーザー操作後に初期化（スマホ対応）
  initOnUserInteraction() {
    if (this.userInteracted) return;
    this.userInteracted = true;
    this.init();
  },

  // BGM切り替え
  playBGM(type) {
    if (!this.isInitialized) {
      return;
    }
    
    const newBGM = this.bgm[type];
    if (!newBGM) {
      console.warn(`BGM type "${type}" not found`);
      return;
    }
    
    // 同じBGMタイプがすでに再生中なら何もしない
    if (this.currentBGMType === type && this.currentBGM && !this.currentBGM.paused) {
      return;
    }
    
    // 全てのBGMを停止
    Object.values(this.bgm).forEach(bgm => {
      if (bgm && !bgm.paused) {
        bgm.pause();
        bgm.currentTime = 0;
      }
    });
    
    // 新しいBGMを再生
    this.currentBGM = newBGM;
    this.currentBGMType = type;
    this.currentBGM.currentTime = 0;
    this.currentBGM.play().catch(err => {
      console.log('BGM autoplay prevented:', err.message);
    });
  },

  // SE再生
  playSE(type) {
    this.initOnUserInteraction();
    if (!this.isInitialized) return;
    
    const se = this.se[type];
    if (!se) {
      console.warn(`SE type "${type}" not found`);
      return;
    }
    
    // SEは毎回最初から再生
    se.currentTime = 0;
    se.play().catch(err => {
      // 再生失敗時は無視
    });
  },

  // BGM停止
  stopBGM() {
    if (this.currentBGM) {
      this.currentBGM.pause();
      this.currentBGM.currentTime = 0;
      this.currentBGM = null;
      this.currentBGMType = null;
    }
  }
};

/* --------------------
   登山条件データ
-------------------- */

const mountainConditions = {
  altitude: [
    { label: 1000 },
    { label: 2000 },
    { label: 3000 }
  ],
  weather: [
    { label: "clear" },
    { label: "cloudy" },
    { label: "rain" }
  ],
  season: [
    { label: "summer" },
    { label: "autumn" },
    { label: "winter" }
  ],
  wind: [
    { label: 0 },   // 無風
    { label: 2 },   // やや風
    { label: 4 }    // 強風
  ],
  state: [
    { label: "normal" },
    { label: "after_rain" },
    { label: "bear" },
    { label: "fog" },
    { label: "volcano" },
    { label: "rockfall" },
    { label: "river" }
  ],
  plan: [
    { label: "daytrip" },
    { label: "hut" },
    { label: "tent" }
  ]
};

// --------------------
// 画面表示用ラベル変換マッピング
// （データの label 自体はそのまま保持し、表示時だけ日本語に変換する）
// --------------------
const conditionLabelMap = {
  // 天気
  "clear": "快晴",
  "cloudy": "曇り",
  "rain": "時々雨",
  // 季節
  "summer": "夏(6-9月)",
  "autumn": "春秋(3-5,10-11月)",
  "winter": "冬(12-2月)",
  // 風
  "0": "無風",
  "2": "やや風",
  "4": "強風",
  // 状態
  "normal": "警戒事項なし",
  "after_rain": "前日雨",
  "bear": "クマ出没情報あり",
  "fog": "濃霧",
  "volcano": "活火山(噴火警戒レベル1)",
  "rockfall": "落石注意",
  "river": "渡渉あり",
  "snow": "積雪",
  // 山行
  "daytrip": "日帰り",
  "hut": "山小屋泊(有人)",
  "tent": "テント泊(1泊2日)"
};

// labelを表示用の文字列に変換する関数
function getDisplayLabel(label) {
  return conditionLabelMap[label] || label;
}

/* --------------------
   パッキング盤面管理（先頭に移動）
-------------------- */

// グローバルスコープに移動（初期化より前に定義）
const packConfig = {
  capacity: 20,
  cols: 4,
  rows: 5
};

let packGrid = [];
const placedItems = {};
let itemInstanceCounter = 0; // 装備インスタンスの一意ID用カウンター
let currentDraggedItem = null; // ドラッグ中のアイテム情報（itemId or instanceId）
let currentDragType = null; // "new" or "placed"
let currentCondition = null; // 現在の登山条件
let autoScrollInterval = null; // 自動スクロール用のインターバル
let savedPackingState = null; // 準備完了前の状態を保存
let dragPreviewElement = null; // ドラッグ中のプレビュー要素
let isDraggingActive = false; // ドラッグ中フラグ（全イベント共通）

/* --------------------
   初期化
-------------------- */

function init() {
  generateCondition();
  renderCondition();

  // 初期表示では登山条件コンテナを非表示（パズル画面に入ったときだけ表示する）
  const conditionContainer = document.getElementById("condition-container");
  if (conditionContainer) {
    conditionContainer.classList.add("hidden");
  }

  // 画面スケーリング設定
  setupScaling();
  window.addEventListener("resize", setupScaling);
}

/* --------------------
   画面スケーリング（1280×720を画面サイズに等比縮小）
-------------------- */

function setupScaling() {
  const uiFrame = document.getElementById("ui-frame");
  if (!uiFrame) return;

  const gameWidth = 1280;
  const gameHeight = 720;
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // 安全マージンを確保（最低解像度667×375pxでも確実に収まるように）
  const safeMargin = 0.98; // 2%のマージン
  
  // 等比縮小の倍率を計算（小さい方に合わせる）
  const scaleX = (windowWidth / gameWidth) * safeMargin;
  const scaleY = (windowHeight / gameHeight) * safeMargin;
  const scale = Math.min(scaleX, scaleY);
  
  // 最小スケールを設定（667×375pxでの計算値）
  const minScale = Math.min(667 / gameWidth, 375 / gameHeight) * safeMargin;
  const finalScale = Math.max(scale, minScale);
  
  // スケール適用
  uiFrame.style.transform = `scale(${finalScale})`;
  
  // 現在のスケール値をグローバル変数に保存（座標変換で使用）
  window.currentScale = finalScale;
}

/* --------------------
   Pointer Events用ヘルパー関数（スマホ対応）
-------------------- */

// ドラッグプレビュー要素を作成
function createDragPreview(item, rotated = false) {
  // 既存のプレビューがあれば削除
  removeDragPreview();
  
  const preview = document.createElement("div");
  preview.id = "drag-preview";
  preview.style.position = "fixed";
  preview.style.pointerEvents = "none";
  preview.style.zIndex = "10000";
  preview.style.opacity = "0.8";
  preview.style.transform = "translate(-50%, -50%)";
  preview.style.backgroundColor = "#ffffff";
  preview.style.border = "2px solid #2E7D32";
  preview.style.borderRadius = "4px";
  preview.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.3)";
  
  // サイズを設定（セルサイズベース）
  const cellSize = 40;
  const gap = 2;
  const width = rotated ? item.size.h : item.size.w;
  const height = rotated ? item.size.w : item.size.h;
  
  const previewWidth = width * cellSize + (width - 1) * gap;
  const previewHeight = height * cellSize + (height - 1) * gap;
  
  preview.style.width = `${previewWidth}px`;
  preview.style.height = `${previewHeight}px`;
  
  // block画像を設定（配置後と同じ見た目）
  const img = document.createElement("img");
  img.src = item.blockImage; // blockImageを使用
  img.alt = item.name;
  img.style.display = "block";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";
  img.style.position = "absolute";
  img.style.top = "50%";
  img.style.left = "50%";
  
  if (rotated) {
    img.style.transform = "translate(-50%, -50%) rotate(90deg)";
  } else {
    img.style.transform = "translate(-50%, -50%)";
  }
  
  preview.appendChild(img);
  document.body.appendChild(preview);
  dragPreviewElement = preview;
  
  console.log("ドラッグプレビュー作成:", item.name, "回転:", rotated, "サイズ:", `${width}×${height}`);
  
  return preview;
}

// ドラッグプレビュー要素の位置を更新
function updateDragPreview(clientX, clientY) {
  if (!dragPreviewElement) return;
  
  dragPreviewElement.style.left = `${clientX}px`;
  dragPreviewElement.style.top = `${clientY}px`;
}

// ドラッグプレビュー要素を削除
function removeDragPreview() {
  if (dragPreviewElement) {
    dragPreviewElement.remove();
    dragPreviewElement = null;
    console.log("ドラッグプレビュー削除");
  }
}

// scale変換を考慮してポインター座標からグリッドセルを取得
function getGridCellFromPointer(clientX, clientY) {
  const gridEl = document.getElementById("pack-grid");
  if (!gridEl) return null;
  
  const uiFrame = document.getElementById("ui-frame");
  if (!uiFrame) return null;
  
  // ui-frameの境界とスケール値を取得
  const frameRect = uiFrame.getBoundingClientRect();
  const scale = window.currentScale || 1;
  
  // スケール変換を考慮した座標計算
  // クライアント座標からui-frame内の座標に変換
  const frameX = (clientX - frameRect.left) / scale;
  const frameY = (clientY - frameRect.top) / scale;
  
  // グリッドの境界を取得
  const gridRect = gridEl.getBoundingClientRect();
  const gridLeft = (gridRect.left - frameRect.left) / scale;
  const gridTop = (gridRect.top - frameRect.top) / scale;
  
  // グリッド内の相対座標
  const relativeX = frameX - gridLeft;
  const relativeY = frameY - gridTop;
  
  // セルサイズとギャップ
  const cellSize = 40;
  const gap = 2;
  const padding = 4;
  
  // セル座標に変換
  const x = Math.floor((relativeX - padding) / (cellSize + gap));
  const y = Math.floor((relativeY - padding) / (cellSize + gap));
  
  // 範囲チェック
  if (x < 0 || x >= packConfig.cols || y < 0 || y >= packConfig.rows) {
    return null;
  }
  
  return { x, y };
}

// 新しいアイテムのドロップ処理
function handleItemDrop(cellX, cellY) {
  if (!currentDraggedItem || currentDragType !== "new") return;
  
  const item = packingItems.find(i => i.id === currentDraggedItem);
  if (!item) return;
  
  console.log(`アイテム「${item.name}」をグリッド(${cellX}, ${cellY})にドロップ`);
  
  // Y座標を調整（highlightPlacementAreaと同じロジック）
  let adjustedY = cellY;
  const height = item.size.h;
  
  if (cellY === packConfig.rows - 1) {
    // 最下辺の列：アイテムの下端がcellYになるように調整
    adjustedY = cellY - (height - 1);
    if (adjustedY < 0) adjustedY = 0;
  } else if (cellY === 0) {
    // 最上辺の列：アイテムの上端がcellYになる（調整不要）
    adjustedY = cellY;
  } else {
    // 中間の列：ドロップ位置がアイテムの範囲内になるように調整
    const offset = Math.floor(height / 2);
    adjustedY = cellY - offset;
    if (adjustedY < 0) adjustedY = 0;
    if (adjustedY + height > packConfig.rows) {
      adjustedY = packConfig.rows - height;
    }
  }
  
  console.log(`配置位置調整: (${cellX}, ${cellY}) → (${cellX}, ${adjustedY})`);
  
  // アイテムを配置
  placeItemOnGrid(item.id, cellX, adjustedY);
}

// 配置済みアイテムの移動処理
function handlePlacedItemDrop(instanceId, cellX, cellY) {
  if (!currentDraggedItem || currentDragType !== "placed") return;
  
  const placed = placedItems[instanceId];
  if (!placed) return;
  
  const item = packingItems.find(i => i.id === placed.itemId);
  if (!item) return;
  
  console.log(`配置済みアイテム「${item.name}」をグリッド(${cellX}, ${cellY})に移動`);
  
  // Y座標を調整（highlightPlacementAreaと同じロジック）
  let adjustedY = cellY;
  let height = placed.rotated ? item.size.w : item.size.h;
  
  // 圧縮状態を考慮
  if (placed.pressed && item.pressable) {
    height = Math.max(1, height - 1);
  }
  
  if (cellY === packConfig.rows - 1) {
    // 最下辺の列：アイテムの下端がcellYになるように調整
    adjustedY = cellY - (height - 1);
    if (adjustedY < 0) adjustedY = 0;
  } else if (cellY === 0) {
    // 最上辺の列：アイテムの上端がcellYになる（調整不要）
    adjustedY = cellY;
  } else {
    // 中間の列：ドロップ位置がアイテムの範囲内になるように調整
    const offset = Math.floor(height / 2);
    adjustedY = cellY - offset;
    if (adjustedY < 0) adjustedY = 0;
    if (adjustedY + height > packConfig.rows) {
      adjustedY = packConfig.rows - height;
    }
  }
  
  console.log(`移動位置調整: (${cellX}, ${cellY}) → (${cellX}, ${adjustedY})`);
  
  // アイテムを移動
  moveItemOnGrid(instanceId, cellX, adjustedY);
}

/* --------------------
   メインメニュー画像管理
-------------------- */
let currentImageIndex = -1;
const totalImages = 8;

function getRandomImageIndex() {
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * totalImages) + 1;
  } while (newIndex === currentImageIndex && totalImages > 1);
  return newIndex;
}

function updateMenuMainImage() {
  const img = document.getElementById("menu-main-image");
  if (img) {
    currentImageIndex = getRandomImageIndex();
    img.src = `img/main/${currentImageIndex}.png`;
  }
}

function initMenuMainImage() {
  const img = document.getElementById("menu-main-image");
  if (img) {
    // 初回ランダム表示
    updateMenuMainImage();
    
    // クリックで画像変更 + BGM再生（イベント伝播を停止）
    const handleImageInteraction = (e) => {
      e.stopPropagation();
      updateMenuMainImage();
      
      // BGMがまだアンロックされていない場合のみ再生
      if (!AudioManager.bgmUnlocked) {
        // オーディオ初期化（まだの場合）
        if (!AudioManager.isInitialized) {
          AudioManager.userInteracted = true;
          AudioManager.init();
          console.log('AudioManager initialized on image click');
        }
        
        // クリックイベントハンドラ内でmain.bgmを直接再生
        const mainBgm = AudioManager.bgm.main;
        if (mainBgm) {
          mainBgm.currentTime = 0;
          mainBgm.play().then(() => {
            AudioManager.currentBGM = mainBgm;
            AudioManager.currentBGMType = 'main';
            AudioManager.bgmUnlocked = true;
            console.log('main.bgm started on image click, BGM unlocked');
          }).catch(err => {
            console.log('BGM play failed:', err.message);
          });
        }
      }
    };
    
    img.addEventListener("click", handleImageInteraction);
    img.addEventListener("touchstart", handleImageInteraction);
  }
}

/* --------------------
   登山条件生成
-------------------- */

function generateCondition() {
  let attempts = 0;
  const maxAttempts = 100; // 無限ループ防止
  
  while (attempts < maxAttempts) {
    currentCondition = {
      altitude: pick(mountainConditions.altitude),
      weather: pick(mountainConditions.weather),
      season: pick(mountainConditions.season),
      wind: pick(mountainConditions.wind),
      state: pick(mountainConditions.state),
      plan: pick(mountainConditions.plan)
    };
    
    // 矛盾する組み合わせをチェック
    const alt = currentCondition.altitude.label;
    const weather = currentCondition.weather.label;
    const season = currentCondition.season.label;
    const state = currentCondition.state.label;
    const plan = currentCondition.plan.label;
    
    // 1. 3000m + 日帰り は不可
    if (alt === 3000 && plan === "daytrip") {
      attempts++;
      continue;
    }
    
    // 2. 1000m + 山小屋泊 は不可
    if (alt === 1000 && plan === "hut") {
      attempts++;
      continue;
    }
    
    // 3. 時々雨 + 危険なし は不可
    if (weather === "rain" && state === "normal") {
      attempts++;
      continue;
    }
    
    // 4. 1000m + 活火山 は不可
    if (alt === 1000 && state === "volcano") {
      attempts++;
      continue;
    }
    
    // 5. 冬 + (2000m or 3000m) + テント泊 は不可（積雪がある場合）今後「スノーフライ」を追加したら有効に
    if (season === "winter" && (alt === 2000 || alt === 3000) && plan === "tent") {
      attempts++;
      continue;
    }
    
    // すべてのチェックを通過したら有効な条件として採用
    break;
  }
  
  // 万が一100回試してもダメだった場合は警告
  if (attempts >= maxAttempts) {
    console.warn("登山条件の生成に失敗しました。デフォルト条件を使用します。");
  }
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/* --------------------
   登山条件表示
-------------------- */

function renderCondition() {
  const area = document.getElementById("condition-area");
  
  // 状態の表示を生成（冬かつ高標高の場合は積雪を追加）
  let stateDisplay = getDisplayLabel(currentCondition.state.label);
  
  // 冬かつ（2000mまたは3000m）の場合は積雪を追加
  const isWinter = currentCondition.season.label === "winter";
  const isHighAltitude = currentCondition.altitude.label === 2000 || currentCondition.altitude.label === 3000;
  
  if (isWinter && isHighAltitude) {
    stateDisplay += "<br>　　　" + getDisplayLabel("snow");
  }
  
  area.innerHTML = `
    標高: ${currentCondition.altitude.label}<br>
    天気: ${getDisplayLabel(currentCondition.weather.label)}<br>
    季節: ${getDisplayLabel(currentCondition.season.label)}<br>
    風: ${getDisplayLabel(String(currentCondition.wind.label))}<br>
    状態: ${stateDisplay}<br>
    山行: ${getDisplayLabel(currentCondition.plan.label)}
  `;
}

/* --------------------
   シーン切り替え
-------------------- */

function changeScene(name) {
  console.log("changeScene呼ばれた:", name);
  
  // 画面遷移時に効果音を再生
  AudioManager.playSE('button');

  const target = document.getElementById(`scene-${name}`);
  if (!target) {
    console.error(`scene-${name} が存在しません`);
    return;
  }

  document.querySelectorAll(".scene").forEach(s => {
    s.classList.add("hidden");
  });

  target.classList.remove("hidden");
  
  // パッキング画面でのみ画面固定を適用（スマホでのドラッグ操作時の揺れ防止）
  if (name === "packing") {
    document.body.classList.add("packing-mode");
  } else {
    document.body.classList.remove("packing-mode");
    // 他の画面ではスクロール制限を解除
    document.body.style.touchAction = "";
    document.body.style.overscrollBehavior = "";
  }
  
  // BGM切り替え（画面に応じて適切なBGMを再生）
  console.log('Switching BGM for scene:', name);
  if (name === "menu") {
    AudioManager.playBGM('main');
  } else if (name === "packing" || name === "quiz" || name === "shopping") {
    AudioManager.playBGM('game');
  } else if (name === "custom-condition") {
    // カスタム条件画面ではgame BGMを継続
    AudioManager.playBGM('game');
  } else if (name === "packing-result") {
    // リザルト画面でもgame BGMを継続
    AudioManager.playBGM('game');
  }
  
  // 登山条件コンテナの表示制御
  const conditionContainer = document.getElementById("condition-container");
  
  if (name === "packing") {
    // パッキング画面では表示
    conditionContainer?.classList.remove("hidden");
  } else {
    // それ以外の画面では非表示
    conditionContainer?.classList.add("hidden");
    // 装備チェックリストも非表示
    hideEquipmentChecklist();
    
    // メニューに戻る際はパッキング状態をリセット
    if (name === "menu") {
      console.log("メニューに戻るためパッキング状態をリセット");
      // グリッドと配置済みアイテムをクリア
      packGrid = [];
      for (const key in placedItems) delete placedItems[key];
      itemInstanceCounter = 0;
      currentDraggedItem = null;
      currentDragType = null;
      savedPackingState = null;
      currentCondition = null; // 登山条件もリセット
      // 重量表示もリセット
      const weightEl = document.getElementById("packing-weight");
      if (weightEl) {
        weightEl.textContent = "0.0kg";
      }
      // グリッド上の装備名表示をすべて削除
      const gridEl = document.getElementById("pack-grid");
      if (gridEl) {
        const nameDisplays = gridEl.querySelectorAll(".item-name-display");
        nameDisplays.forEach(el => el.remove());
        // グリッドの内容もクリア
        gridEl.innerHTML = "";
      }
    }
  }
}

/* --------------------
   カスタム条件選択機能
-------------------- */

let customConditionSelection = {
  altitude: null,
  weather: null,
  season: null,
  wind: null,
  state: null,
  plan: null
};

function showCustomConditionScreen() {
  // カスタム選択画面に遷移
  changeScene("custom-condition");
  
  // 選択肢を生成
  renderCustomOptions();
}

function renderCustomOptions() {
  // 標高
  const altitudeContainer = document.getElementById("custom-altitude");
  altitudeContainer.innerHTML = mountainConditions.altitude.map(item => 
    `<div class="custom-option" data-type="altitude" data-value="${item.label}">${item.label}m</div>`
  ).join('');
  
  // 天気
  const weatherContainer = document.getElementById("custom-weather");
  weatherContainer.innerHTML = mountainConditions.weather.map(item => 
    `<div class="custom-option" data-type="weather" data-value="${item.label}">${getDisplayLabel(item.label)}</div>`
  ).join('');
  
  // 季節
  const seasonContainer = document.getElementById("custom-season");
  seasonContainer.innerHTML = mountainConditions.season.map(item => 
    `<div class="custom-option" data-type="season" data-value="${item.label}">${getDisplayLabel(item.label)}</div>`
  ).join('');
  
  // 風
  const windContainer = document.getElementById("custom-wind");
  windContainer.innerHTML = mountainConditions.wind.map(item => 
    `<div class="custom-option" data-type="wind" data-value="${item.label}">${getDisplayLabel(String(item.label))}</div>`
  ).join('');
  
  // 状態
  const stateContainer = document.getElementById("custom-state");
  stateContainer.innerHTML = mountainConditions.state.map(item => 
    `<div class="custom-option" data-type="state" data-value="${item.label}">${getDisplayLabel(item.label)}</div>`
  ).join('');
  
  // 山行
  const planContainer = document.getElementById("custom-plan");
  planContainer.innerHTML = mountainConditions.plan.map(item => 
    `<div class="custom-option" data-type="plan" data-value="${item.label}">${getDisplayLabel(item.label)}</div>`
  ).join('');
  
  // クリックイベントを設定
  document.querySelectorAll('.custom-option').forEach(option => {
    option.addEventListener('click', function() {
      const type = this.dataset.type;
      const value = this.dataset.value;
      
      // 同じタイプの他の選択を解除
      document.querySelectorAll(`.custom-option[data-type="${type}"]`).forEach(opt => {
        opt.classList.remove('selected');
      });
      
      // 選択
      this.classList.add('selected');
      customConditionSelection[type] = value;
      
      // パッキング開始ボタンの有効化チェック
      checkCustomConditionComplete();
    });
  });
  
  // 選択状態をリセット
  customConditionSelection = {
    altitude: null,
    weather: null,
    season: null,
    wind: null,
    state: null,
    plan: null
  };
  
  checkCustomConditionComplete();
}

function checkCustomConditionComplete() {
  const btnStartPacking = document.getElementById("btn-start-packing");
  const allSelected = Object.values(customConditionSelection).every(val => val !== null);
  
  if (allSelected) {
    btnStartPacking.disabled = false;
  } else {
    btnStartPacking.disabled = true;
  }
}

function applyCustomCondition() {
  // 選択された条件を適用
  currentCondition = {
    altitude: { label: Number(customConditionSelection.altitude) },
    weather: { label: customConditionSelection.weather },
    season: { label: customConditionSelection.season },
    wind: { label: Number(customConditionSelection.wind) },
    state: { label: customConditionSelection.state },
    plan: { label: customConditionSelection.plan }
  };
  
  // 登山条件を表示
  renderCondition();
  
  // グリッドと配置済みアイテムをリセット
  createEmptyGrid();
  
  // パッキング画面に遷移
  changeScene("packing");
}

/* --------------------
   買い物ゲームデータ
-------------------- */

/* 装備マスタ */
const equipmentMaster = {
  1:"レインウェア",2:"レインパンツ",3:"保温着",4:"ウィンドシェルウェア",
  5:"ウィンドシェルパンツ",6:"登山パンツ",7:"速乾半袖シャツ",
  8:"速乾長袖シャツ",9:"登山用靴下",10:"速乾アンダーウェア",
  11:"速乾アンダーパンツ",12:"登山靴",13:"帽子",14:"サングラス",
  15:"ヘッドライト",16:"タオル",17:"水分",18:"行動食",
  19:"エマージェンシーキット",20:"モバイルバッテリー・電池",
  21:"現金",22:"紙地図",23:"コンパス",24:"ゲイター",
  25:"バラクラバ",26:"簡易トイレ",27:"浄水器",28:"手袋",
  29:"ストック",30:"チェーンスパイク",31:"ヘルメット",
  32:"ネックウォーマー",33:"ザック",34:"ザックカバー",
  35:"ピッケル",36:"クマスプレー",37:"熊鈴"
};

/* 山×季節 定義 */
const shoppingConditions = {
  taisetsu: {
    summer:[1,2,3,4,6,8,9,10,12,13,14,15,16,17,18,19,20,21,22,23,24,28,29,32,33,34,36,37]
  },
  chokai: {
    summer:[1,2,3,4,6,8,9,10,12,13,14,15,16,17,18,19,20,21,22,23,24,28,29,31,32,33,34,36,37]
  },
  takao: {
    spring:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33],
    summer:[1,2,6,7,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33,37],
    autumn:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33,37]
  },
  fuji: {
    summer:[1,2,3,4,6,8,9,10,11,12,13,14,15,16,17,18,19,20,21,24,28,29,32,33,34]
  },
  rokko: {
    spring:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33],
    summer:[1,2,6,7,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33],
    autumn:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33]
  },
  daisen: {
    spring:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,30,33],
    summer:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33],
    autumn:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,30,33]
  },
  aso: {
    spring:[1,2,6,7,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33],
    summer:[1,2,6,7,9,10,12,13,14,16,17,18,20,21,22,28,29,33],
    autumn:[1,2,6,8,9,10,12,13,14,16,17,18,20,21,22,28,29,33]
  }
};

/* 購入済み状態（画面内のみ） */
let purchasedState = {};
/* 現地購入状態 */
let localPurchaseState = {};

document.addEventListener("DOMContentLoaded", () => {

  // 初期化処理を実行
  init();
  
  // メインメニュー画像の初期化（画像クリックでBGM再生）
  initMenuMainImage();

  // ===== ボタン =====
  const btnQuiz = document.getElementById("btn-quiz");
  const btnPacking = document.getElementById("btn-packing");
  const btnShopping = document.getElementById("btn-shopping");
  const btnBackMenu = document.getElementById("btn-back-menu");
  const btnQuizBackMenu = document.getElementById("btn-quiz-back-menu");
  const btnCompress = document.getElementById("btn-compress");
  const btnReady = document.getElementById("btn-ready");
  // リザルト画面のボタンは動的に生成されるため取得しない
  const btnRerollCondition = document.getElementById("btn-reroll-condition");
  const btnCustomCondition = document.getElementById("btn-custom-condition");
  const btnStartPacking = document.getElementById("btn-start-packing");
  const btnCancelCustom = document.getElementById("btn-cancel-custom");

  // ===== シーン =====
  const sceneMenu = document.getElementById("scene-menu");
  const sceneQuiz = document.getElementById("scene-quiz");
  const scenePacking = document.getElementById("scene-packing");
  const sceneShopping = document.getElementById("scene-shopping");
  const sceneCustomCondition = document.getElementById("scene-custom-condition");
  const scenePackingResult = document.getElementById("scene-packing-result");

  // ===== ボタンイベント =====
  btnQuiz?.addEventListener("click", () => {
    console.log("クイズボタン押下");
    changeScene("quiz");
  });

  btnPacking?.addEventListener("click", () => {
    console.log("パッキングボタン押下");
    // 登山条件を生成（未生成の場合のみ）
    if (!currentCondition) {
      console.log("登山条件を新規生成");
      generateCondition();
      renderCondition();
    }
    changeScene("packing");
    renderPackingScene();
    // パッキング画面が表示された後に容量を設定してグリッドを再描画
    requestAnimationFrame(() => {
      // 容量が設定されていない場合はデフォルト値を使用
      if (packConfig.cols === 0 || packConfig.rows === 0) {
        setPackCapacity(20);
      } else {
        renderEmptyGrid();
      }
    });
  });

  btnShopping?.addEventListener("click", () => {
    console.log("ショッピングボタン押下");
    changeScene("shopping");
  });

  btnBackMenu?.addEventListener("click", () => {
    console.log("メニューに戻る");
    changeScene("menu");
  });

  // クイズ画面からメニューに戻るボタン
  btnQuizBackMenu?.addEventListener("click", () => {
    console.log("クイズ画面からメニューに戻る");
    changeScene("menu");
  });

  // 圧縮ボタン
  btnCompress?.addEventListener("click", () => {
    console.log("圧縮ボタン押下");
    compressItems();
  });

  // 準備完了ボタン
  btnReady?.addEventListener("click", () => {
    console.log("準備完了ボタン押下");
    showPackingResult();
  });

  // 登山条件再抽選ボタン
  btnRerollCondition?.addEventListener("click", () => {
    console.log("登山条件を再抽選");
    generateCondition();
    renderCondition();
    // グリッドと配置済みアイテムをリセット
    createEmptyGrid();
  });

  // カスタム条件選択ボタン
  btnCustomCondition?.addEventListener("click", () => {
    console.log("カスタム条件選択画面へ");
    showCustomConditionScreen();
  });

  // パッキング開始ボタン
  btnStartPacking?.addEventListener("click", () => {
    console.log("カスタム条件でパッキング開始");
    applyCustomCondition();
  });

  // カスタムキャンセルボタン
  btnCancelCustom?.addEventListener("click", () => {
    console.log("カスタム選択をキャンセル");
    changeScene("packing");
  });

  // ===== 買い物ゲームのボタン =====
  const btnGoShopping = document.getElementById("btn-go-shopping");
  const btnExitShopping = document.getElementById("btn-exit-shopping");
  
  // 選択状態を保持
  let selectedSeason = null;
  let selectedMountain = null;
  
  // 季節ボタンのイベント設定
  const seasonButtons = document.querySelectorAll(".season-btn");
  seasonButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      seasonButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedSeason = btn.dataset.season;
      
      // 選択された季節に対応する山ボタンを有効/無効化
      updateMountainButtons();
    });
  });
  
  // 山ボタンの有効/無効を更新する関数
  function updateMountainButtons() {
    if (!selectedSeason) return;
    
    mountainButtons.forEach(btn => {
      const mountain = btn.dataset.mountain;
      const isAvailable = shoppingConditions[mountain]?.[selectedSeason];
      
      if (isAvailable) {
        btn.classList.remove("disabled");
      } else {
        btn.classList.add("disabled");
        // 無効化された山が選択されていた場合、選択を解除
        if (selectedMountain === mountain) {
          btn.classList.remove("selected");
          selectedMountain = null;
        }
      }
    });
  }
  
  // 山ボタンのイベント設定
  const mountainButtons = document.querySelectorAll(".mountain-btn");
  mountainButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      // 無効化されている場合はクリックを無視
      if (btn.classList.contains("disabled")) {
        return;
      }
      
      mountainButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedMountain = btn.dataset.mountain;
    });
  });
  
  /* 描画 */
  btnGoShopping?.addEventListener("click", () => {
    if (!selectedSeason || !selectedMountain) {
      alert("季節と山を選択してください");
      return;
    }

    const list = shoppingConditions[selectedMountain]?.[selectedSeason];
    if (!list) {
      alert("選択された組み合わせのデータがありません");
      return;
    }

    // 選択エリアとh2タイトルを非表示
    const selectorsArea = document.getElementById("shopping-selectors");
    if (selectorsArea) {
      selectorsArea.style.display = "none";
    }
    
    const shoppingTitle = document.querySelector("#shopping-ui h2");
    if (shoppingTitle) {
      shoppingTitle.style.display = "none";
    }
    
    const area = document.getElementById("shopping-items");
    area.innerHTML = "";
    
    // 凡例を表示
    const legend = document.getElementById("shopping-legend");
    if (legend) {
      legend.style.display = "flex";
    }

    list.forEach(id => {
      const item = document.createElement("div");
      item.className = "shopping-item";
      item.textContent = equipmentMaster[id];
      item.dataset.id = id;

      const purchasedMark = document.createElement("div");
      purchasedMark.className = "purchased";
      purchasedMark.textContent = "購入済";

      const localPurchaseMark = document.createElement("div");
      localPurchaseMark.className = "local-purchase";
      localPurchaseMark.textContent = "現地購入";

      item.appendChild(purchasedMark);
      item.appendChild(localPurchaseMark);

      if (purchasedState[id]) {
        item.classList.add("purchased-on");
      }
      
      if (localPurchaseState[id]) {
        item.classList.add("local-purchase-on");
      }

      // クリック: 未選択 → 購入済 → 現地購入 → 未選択 の順で切り替え
      item.onclick = () => {
        // --- ツールチップ表示用 ---
        const tooltip = document.createElement("div");
        tooltip.className = "packing-item-tooltip hidden";
        tooltip.innerHTML = `サイズ: ${item.size.w}×${item.size.h}<br>重量: ${item.weight}kg`;
        itemEl.appendChild(tooltip);

        // PC: マウスオーバーで表示（従来通り）
        itemEl.addEventListener("mouseenter", () => {
          tooltip.classList.remove("hidden");
        });
        itemEl.addEventListener("mouseleave", () => {
          tooltip.classList.add("hidden");
        });

        // スマホ: 長押しで画面中央に表示
        let touchTimer = null;
        let centerTooltip = null;
        itemEl.addEventListener("touchstart", (e) => {
          touchTimer = setTimeout(() => {
            // 画面幅が狭い場合（スマホ判定）
            if (window.innerWidth <= 800) {
              centerTooltip = document.createElement("div");
              centerTooltip.className = "packing-item-tooltip center-tooltip";
              centerTooltip.innerHTML = `サイズ: ${item.size.w}×${item.size.h}<br>重量: ${item.weight}kg`;
              Object.assign(centerTooltip.style, {
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 9999,
                background: "rgba(0,0,0,0.85)",
                color: "#fff",
                padding: "18px 32px",
                borderRadius: "12px",
                fontSize: "5vw",
                textAlign: "center",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                pointerEvents: "none"
              });
              document.body.appendChild(centerTooltip);
            } else {
              tooltip.classList.remove("hidden");
            }
          }, 500); // 0.5秒長押しで表示
        });
        itemEl.addEventListener("touchend", (e) => {
          clearTimeout(touchTimer);
          if (centerTooltip) {
            document.body.removeChild(centerTooltip);
            centerTooltip = null;
          }
          tooltip.classList.add("hidden");
        });
        itemEl.addEventListener("touchcancel", (e) => {
          clearTimeout(touchTimer);
          if (centerTooltip) {
            document.body.removeChild(centerTooltip);
            centerTooltip = null;
          }
          tooltip.classList.add("hidden");
        });
        // 現在の状態を判定
        const isPurchased = purchasedState[id];
        const isLocalPurchase = localPurchaseState[id];

        if (!isPurchased && !isLocalPurchase) {
          // 未選択 → 購入済
          purchasedState[id] = true;
          localPurchaseState[id] = false;
          item.classList.add("purchased-on");
          item.classList.remove("local-purchase-on");
        } else if (isPurchased && !isLocalPurchase) {
          // 購入済 → 現地購入
          purchasedState[id] = false;
          localPurchaseState[id] = true;
          item.classList.remove("purchased-on");
          item.classList.add("local-purchase-on");
        } else if (!isPurchased && isLocalPurchase) {
          // 現地購入 → 未選択
          purchasedState[id] = false;
          localPurchaseState[id] = false;
          item.classList.remove("purchased-on");
          item.classList.remove("local-purchase-on");
        }
      };

      area.appendChild(item);
    });
  });

  /* 画面を離れたら破棄 */
  btnExitShopping?.addEventListener("click", () => {
    purchasedState = {};
    localPurchaseState = {};
    document.getElementById("shopping-items").innerHTML = "";
    
    // 凡例を非表示
    const legend = document.getElementById("shopping-legend");
    if (legend) {
      legend.style.display = "none";
    }
    
    // 選択エリアとh2タイトルを再表示
    const selectorsArea = document.getElementById("shopping-selectors");
    if (selectorsArea) {
      selectorsArea.style.display = "flex";
    }
    
    const shoppingTitle = document.querySelector("#shopping-ui h2");
    if (shoppingTitle) {
      shoppingTitle.style.display = "block";
    }
    
    // 選択状態をリセット
    selectedSeason = null;
    selectedMountain = null;
    seasonButtons.forEach(b => b.classList.remove("selected"));
    mountainButtons.forEach(b => {
      b.classList.remove("selected");
      b.classList.remove("disabled");
    });
    changeScene("menu");
  });

  // リザルト画面のボタンは動的に生成されるため、ここでは設定しない
  // （showPackingResult関数内で設定される）

  // ===== 容量選択ボタン =====
  // 少し遅延させて設定（DOMが完全に読み込まれた後に実行）
  setTimeout(() => {
    const capacityButtons = document.querySelectorAll("[data-capacity]");
    console.log(`容量選択ボタンを検出: ${capacityButtons.length}個`);
    
    if (capacityButtons.length === 0) {
      console.error("容量選択ボタンが見つかりません！");
      // もう一度試す
      setTimeout(() => {
        const retryButtons = document.querySelectorAll("[data-capacity]");
        console.log(`再試行: 容量選択ボタンを検出: ${retryButtons.length}個`);
        if (retryButtons.length > 0) {
          setupCapacityButtons(retryButtons);
        }
      }, 100);
      return;
    }
    
    setupCapacityButtons(capacityButtons);
  }, 100);

  // ===== 初期表示 =====
  changeScene("menu");
});

/* --------------------
   クイズデータ
-------------------- */

const quizData = [
  // 各問題にnumber（1始まり）を付与。画像名等で利用。
  // 例: { number: 1, question: ..., ... }
  // ※画面には表示しない
  //
  // 1
  {
    number: 1,
    question: "足のサイズが中厚手の靴下を履いた状態で25.0cmの場合、登山靴は何cm前後で探す？",
    choices: [
      "A: 24.0~24.5",
      "B: 24.5~25.5",
      "C: 25.5~26.5"
    ],
    correct: 2,
    explanation:
`答えはC。登山靴はつま先に余裕を持たせるのが一般的であり、
1cm前後の余白が目安とされる。
曲げた時に足先が靴本体に当たりにくくするためである。`
  },
  {
    number: 2,
    question: "登山の服装でこだわったほうが良い部分は？",
    choices: [
      "A: 肌着などのベースレイヤー",
      "B: 行動着や保温着などのミドルレイヤー",
      "C: レインウェアなどのアウターレイヤー"
    ],
    correct: 0,
    explanation:
`おすすめはAのベースレイヤー。
全体の組み合わせを考えることが前提ではあるが、
中でもベースレイヤーは汗をかいた時の快適性に直結する。`
  },
  {
    number: 3,
    question: "夏秋の富士山や日本アルプスの山々の登山に挑戦したい。履き口がくるぶしより上にあるものから選ぶとして、ソールはどのくらいの硬さが良い？",
    choices: [
      "A: 片手で曲げられる硬さ",
      "B: 両手で曲げられる硬さ",
      "C: 両手でも曲げられない硬さ"
    ],
    correct: 1,
    explanation:
`答えはB。
長時間歩行では、柔らかすぎず硬すぎないソールが負担を抑えやすい。
一般登山道向けの標準的な硬さである。`
  },
  {
    number: 4,
    question: "前泊して翌日に富士山に挑戦予定の人がザックを選ぶ時に何L辺りが良い？",
    choices: [
      "A: ~25L",
      "B: 30~40L",
      "C: 45L~"
    ],
    correct: 1,
    explanation:
`おすすめはB。
防寒着や着替えなどを含めると1泊2日のザック容量は30~40L程度が丁度いいとされる。
Aは容量が不足しやすく、Cは大きすぎて荷物が増えがちになる。`
  },
  {
    number: 5,
    question: "登山を本格的に始めていくとして、3種の神器で何をはじめに買うのがおすすめ？",
    choices: [
      "A: 登山靴",
      "B: レインウェア",
      "C: ザック"
    ],
    correct: 0,
    explanation:
`おすすめはA。
レインウェアやザックはレンタルや現地調達も可能であるが、
登山靴はレンタルでは自分の足に合わない可能性があるため、
はじめに自前で用意するのに適している。`
  },
  {
    number: 6,
    question: "降水予報のない以下の日ならどの日に登るのが良い？",
    choices: [
      "A: 前日大雨だった晴れの日",
      "B: 薄い雲が広がっている曇りの日",
      "C: 風がとても強い快晴の日"
    ],
    correct: 1,
    explanation:
`おすすめはB。展望は期待できないかもしれないが、安全性は1番高い。
Aは地盤が緩んでいる可能性があり、Cは体温低下など危険要素が多い。
Cは展望は良いが体力消耗も激しくなるため、慣れてきたら挑戦すると良い。`
  },
  {
    number: 7,
    question: "登山を始めてみようかな、という人はまずはどういう山に挑戦してみるのが良い？",
    choices: [
      "A: 人が少なく、静かなマイナーな山",
      "B: 登山道が整備されている近隣の山",
      "C: ロープウェイのある標高が高い有名な山"
    ],
    correct: 1,
    explanation:
`おすすめはB。登山道が整備されていることで安全性が高く、
近隣であればアクセスも良いため、無理なく登山を体験できる。
ただ、登りたい山があるのなら、準備をしっかりしてその山に挑戦しても良い。`
  },
  {
    number: 8,
    question: "いつまでに下山を終えるのが望ましい？",
    choices: [
      "A: 正午まで",
      "B: 明るいうち",
      "C: 日没まで"
    ],
    correct: 1,
    explanation:
`正解はB。Aは山行によっては現実的ではない。
山は比較的午後に天気が変わりやすいため、下山のし始めの基準として設ける。
Cは日没よりも早く山は暗くなることが多いため、危険である。`

  },
  {
    number: 9,
    question: "登山道が分かりづらい場合は何を参考にして進めばいい？",
    choices: [
      "A: 先に行った登山者の歩いた痕跡",
      "B: 木に巻かれているテープ",
      "C: 樹木が空いているほう"
    ],
    correct: 1,
    explanation:
`正解はB。その山の所有者や山岳会の方が付けてくれている道標のようなもの。
色は様々だが赤が多い。登山者向けではない場合もあるため、
参考程度にして、地図や方角で確認が安全。`
  },
  {
    number: 10,
    question: "トレッキングポールは取っ手を持って地面についた時に、どのくらいの長さが適切？",
    choices: [
      "A: ついた時に肘が伸びる長さ",
      "B: ついた時に肘が直角に曲がる長さ",
      "C: ついた時に肘がかなり曲がる長さ"
    ],
    correct: 1,
    explanation:
`答えはB。
基本姿勢では肘が直角になる長さが目安とされる。
長すぎると腕が疲れやすく、短すぎると効果が薄れる。`
  },
  {
    number: 11,
    question: "基本的に日帰り登山をする人の場合、初めての登山靴はどれを選ぶのが良い？",
    choices: [
      "A: くるぶしより下の、ローカット",
      "B: くるぶしより上の、ミドルカット",
      "C: 足首を覆う、ハイカット"
    ],
    correct: 1,
    explanation:
`おすすめはB。Aのローカットでも日帰り登山だったら基本的には問題なく行ける所が多いが、
足への疲労感、足首の保護などを加味して汎用性の高いBのミドルカットがおすすめ。`
  },
  {
    number: 12,
    question: "目的に合わせたレインウェアを選ぶ際にまず重視した方が良いポイントは、「防水性」と何？",
    choices: [
      "A: 来た時の負担が減る軽さ",
      "B: 晴れているときにコンパクトに収納できる携帯性",
      "C: 身体からの蒸れを外に出す透湿性"
    ],
    correct: 2,
    explanation:
`答えはC。外がどんなに寒くても登山中は汗をかくため、
汗冷えを防ぐためにも透湿性は防水性と一緒に見るべきポイント。`
  },
  {
    number: 13,
    question: "目の前の大きな段差を登るときに意識するポイントは？",
    choices: [
      "A: 大股で勢いをつけながら登る",
      "B: 転がっている岩や木の根を使って段差を小さくして登る",
      "C: 道を少し外して段差の低いところを探して登る"
    ],
    correct: 2,
    explanation:
`答えはC。Aは使用する筋肉が大きく疲労が溜まりやすい。
Bは段差を小さくできる点は良いが、足首を痛める危険性がある。`
  },
  {
    number: 14,
    question: "斜面を下るときに意識するポイントは？",
    choices: [
      "A: 内股で歩幅を小さくしながら下る",
      "B: ひざと足先の向きをそろえて背筋を伸ばしながら下る",
      "C: 若干ガニ股で体を左右にねじりながら下る"
    ],
    correct: 1,
    explanation:`答えはB。
    Aは内股で歩くと太ももへのダメージが大きく、
    Cは膝へのダメージが大きい。`
  },
  {
    number: 15,
    question: "標高が100m上がると気温は何℃下がる？",
    choices: [
      "A: 0.6℃",
      "B: 0.8℃",
      "C: 1.0℃"
    ],
    correct: 0,
    explanation:`答えはA`
  },
  {
    number: 16,
    question: "体重60kgの人が標高1000m、往復4時間の山を登山中に何Lの水分を摂取するのが良い？",
    choices: [
      "A: 0.5L",
      "B: 1.0L",
      "C: 1.5L"
    ],
    correct: 1,
    explanation:
`この場合はBの1.0Lを基準にするのが良い。
【体重(kg)×5(ml)×行動時間(h)×0.8】で
これで脱水しないために必要な水分量がある程度わかる。`
  },
  {
    number: 17,
    question: "登山道ですれ違う時の基本的なルールは？",
    choices: [
      "A: 上り優先",
      "B: 下り優先",
      "C: 決まりはない"
    ],
    correct: 0,
    explanation:
`答えは上り。ただ、その登山者の疲労具合や互いのコミュニケーションで
譲り合いが起きた場合はそれに準ずる。また、止まる時は山側で止まるのが良い。`
  },
  {
    number: 18,
    question: "比較的落ち着いている熊と一定の距離で遭遇した時の対処は？",
    choices: [
      "A: 大きな音を出しながら距離をとる",
      "B: 熊を見ながら静かに距離をとる",
      "C: 荷物を置いて身軽な状態で素早く距離をとる"
    ],
    correct: 1,
    explanation:
`Bの行動が基本とされている。
荷物内に食べ物が無ければ荷物を置いて距離を取っても可。`
  },
  {
    number: 19,
    question: "登山日当日にまずはじめに確認すべきことは？",
    choices: [
      "A: 前日の登山者の投稿",
      "B: 前日の山の天気",
      "C: 当日の山の天気"
    ],
    correct: 2,
    explanation:
`答えはC。前日の天候によっても山の状態は左右するが、
それ以上に当日の天気を見て行くかどうかを判断するため
登山前に確認することとして重要視することである。`
  },
  {
    number: 20,
    question: "春～秋の肌着(ベースレイヤー)として良いものは？",
    choices: [
      "A: 綿素材のもの",
      "B: 保温性の高いもの",
      "C: 化学繊維のもの"
    ],
    correct: 2,
    explanation:
`答えはC。綿素材のものは乾きづらく汗冷えが起きやすい。
保温性の高いものは汗が出すぎて乾くのが追いつかないことが多い。
化学繊維のものといえばの代表格は「ポリエステル」や「メリノウール」が挙げられる。`
  },
  // ← 今後ここに問題を追加していくだけで拡張可能
];

/* --------------------
   状態管理
-------------------- */

let quizOrder = [];
let quizIndex = 0;
let correctCount = 0;
let lastTappedChoice = null;

/* --------------------
   クイズ開始
-------------------- */

function startQuiz() {
  quizOrder = shuffle([...quizData]).slice(0, 20);
  quizIndex = 0;
  correctCount = 0;
  showQuiz();
}

function showQuiz() {
  const quiz = quizOrder[quizIndex];

  // イラスト画像の表示
  const illustArea = document.getElementById("quiz-illust-area");
  if (illustArea) {
    // 画像名は「quiz/番号.png」
    const imgPath = `quiz/${quiz.number}.png`;
    illustArea.innerHTML = `<img src="${imgPath}" alt="クイズイラスト" style="max-width:90%;max-height:320px;object-fit:contain;">`;
  }

  const questionArea = document.getElementById("quiz-question-area");
  const questionEl = document.getElementById("quiz-question");
  
  // 問題文表示時は元のスタイルに戻す
  questionArea.style.height = "40%";
  questionEl.style.fontSize = "";
  questionEl.style.fontWeight = "";
  
  questionEl.textContent = quiz.question;

  // 選択肢エリアを表示する
  const choicesArea = document.getElementById("quiz-choices-area");
  choicesArea.style.display = "";

  document.querySelectorAll(".quiz-choice").forEach((el, i) => {
    el.textContent = quiz.choices[i];
    el.classList.remove("selected");
  });

  document.getElementById("quiz-result").classList.add("hidden");
  document.getElementById("quiz-explanation").classList.add("hidden");

  document.getElementById("footer-area").innerHTML = "";
  lastTappedChoice = null;
}

/* --------------------
   選択肢操作
-------------------- */

document.querySelectorAll(".quiz-choice").forEach(choice => {
  choice.addEventListener("click", () => {
    const index = Number(choice.dataset.index);
    
    // ワンクリックで回答
    document.querySelectorAll(".quiz-choice").forEach(c => c.classList.remove("selected"));
    choice.classList.add("selected");
    judgeAnswer(index);
  });
});

/* --------------------
   正誤判定
-------------------- */

function judgeAnswer(selected) {
  const quiz = quizOrder[quizIndex];
  const result = document.getElementById("quiz-result");
  const explanation = document.getElementById("quiz-explanation");

  if (selected === quiz.correct) {
    result.textContent = "○";
    correctCount++;
    AudioManager.playSE('correct'); // 正解音
    quizOrder[quizIndex].userResult = true;
  } else {
    result.textContent = "×";
    AudioManager.playSE('wrong'); // 不正解音
    quizOrder[quizIndex].userResult = false;
  }

  result.classList.remove("hidden");
  explanation.textContent = quiz.explanation;
  explanation.classList.remove("hidden");

  renderQuizFooter();
}

/* --------------------
   フッター
-------------------- */

function renderQuizFooter() {
  const explanation = document.getElementById("quiz-explanation");
  
  // 既存のボタンを削除（もしあれば）
  const existingButton = explanation.querySelector("#quiz-next");
  if (existingButton) {
    existingButton.remove();
  }
  
  // 解説エリア内にボタンを追加
  const button = document.createElement("button");
  button.id = "quiz-next";
  button.textContent = "次へ";
  button.style.marginTop = "30px";
  button.style.padding = "12px 24px";
  button.style.fontSize = "4vmin";
  button.style.background = "#ef534b";
  button.style.color = "#fff";
  button.style.border = "none";
  button.style.borderRadius = "4px";
  button.style.cursor = "pointer";
  
  button.onclick = () => {
  // 再挑戦モードの場合はリザルトに戻る
  if (window.quizRetryMode) {
    window.quizRetryMode = false;
    showResult();
    return;
  }
  quizIndex++;
  if (quizIndex >= quizOrder.length) {
    showResult();
  } else {
    showQuiz();
  }
};
  
  explanation.appendChild(button);
}

/* --------------------
   結果表示
-------------------- */

function showResult() {
  const rate = Math.round((correctCount / quizOrder.length) * 100);
  const questionArea = document.getElementById("quiz-question-area");
  const questionEl = document.getElementById("quiz-question");
  questionEl.textContent = `正解率 ${rate}%`;

  // イラストを非表示し、問題一覧と正誤結果を表示
  const illustArea = document.getElementById("quiz-illust-area");
if (illustArea) {
  let listHtml = '<div style="text-align:left;max-width:90%;margin:0 auto;">';
  listHtml += '<h2 style="font-size:4vmin;margin-bottom:16px;">出題された問題の一覧</h2>';
  listHtml += '<ul style="list-style:none;padding:0;">';
  const sortedQuizOrder = [...quizOrder].sort((a, b) => a.number - b.number);
  for (let i = 0; i < sortedQuizOrder.length; i++) {
    const quiz = sortedQuizOrder[i];
    const result = quiz.userResult;
    const resultText = result === true ? '正解' : '不正解';
    listHtml += `<li class="result-quiz-item" data-number="${quiz.number}" style="margin-bottom:8px;font-size:3vmin;cursor:pointer;color:#333;">問題${quiz.number}：${resultText}</li>`;
  }
  listHtml += '</ul>';
  listHtml += '</div>';
  illustArea.innerHTML = listHtml;

  // 各問題リストにクリック/タップイベントを付与
  Array.from(illustArea.querySelectorAll('.result-quiz-item')).forEach(el => {
    el.addEventListener('click', () => {
      retryQuizByNumber(Number(el.dataset.number));
    });
    el.addEventListener('touchstart', () => {
      retryQuizByNumber(Number(el.dataset.number));
    });
  });
}
window.quizRetryMode = false;

  // 正解率を画面中央に表示するためのスタイル設定
  questionArea.style.height = "100%";
  questionArea.style.display = "flex";
  questionArea.style.alignItems = "center";
  questionArea.style.justifyContent = "center";
  questionEl.style.fontSize = "8vmin";
  questionEl.style.fontWeight = "bold";

  // 再挑戦用フラグ
  window.quizRetryMode = false;

  // 選択肢エリアを非表示にする（削除はしない）
  const choicesArea = document.getElementById("quiz-choices-area");
  choicesArea.style.display = "none";

  document.getElementById("quiz-result").classList.add("hidden");
  document.getElementById("quiz-explanation").classList.add("hidden");
  document.getElementById("footer-area").innerHTML = "";
}

function retryQuizByNumber(number) {
  const idx = quizOrder.findIndex(q => q.number === number);
  if (idx !== -1) {
    quizIndex = idx;
    window.quizRetryMode = true;
    showQuiz();
  }
}

/* --------------------
   ユーティリティ
-------------------- */

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/* --------------------
   シーン切り替え連動
-------------------- */

const originalChangeScene = changeScene;

changeScene = function(name) {
  originalChangeScene(name);

  // 登山条件の表示／非表示をシーンに応じて切り替え
  const conditionArea = document.getElementById("condition-area");
  if (conditionArea) {
    if (name === "packing") {
      conditionArea.classList.remove("hidden");
    } else {
      conditionArea.classList.add("hidden");
    }
  }

  if (name === "quiz") {
    startQuiz();

  } else if (name === "packing") {


    // パッキング画面に移行した時に容量を設定してグリッドを再描画
    requestAnimationFrame(() => {

      // 容量が設定されていない場合はデフォルト値を使用
      if (packConfig.cols === 0 || packConfig.rows === 0) {
        setPackCapacity(20);
      } else {
        renderEmptyGrid();
      }
    });
  }
};

/* --------------------
   パズル用 装備データ定義
-------------------- */

// 必要度を表す定数（装備データ内で使用）
// evaluatePacking 内では "必要" / "補助" の文字列と比較しているため、それに対応させる
const NECESSITY = {
  REQUIRED: "必要",  // REQUIRED: その登山条件では必須の装備（未装備だとランクが下がる）
  OPTIONAL: "補助"   // OPTIONAL: あると便利な装備（未装備でもランクには影響しない）
};

const packingItems = [

  {
    id: "rainwear",
    name: "レインウェア",
    iconImage: "img/items/icons/rainwear.png",
    blockImage: "img/items/blocks/rainwear-block.png",
    size: { w: 2, h: 4 },
    weight: 0.25,
    pressable: true,
    default: NECESSITY.REQUIRED // すべての条件で必要
  },

  {
    id: "rainpants",
    name: "レインパンツ",
    iconImage: "img/items/icons/rainpants.png",
    blockImage: "img/items/blocks/rainpants-block.png",
    size: { w: 2, h: 4 },
    weight: 0.17,
    pressable: true,
    default: NECESSITY.REQUIRED // すべての条件で必要
  },

  {
    id: "headlight",
    name: "ヘッドライト",
    iconImage: "img/items/icons/headlight.png",
    blockImage: "img/items/blocks/headlight-block.png",
    size: { w: 1, h: 1 },
    weight: 0.10,
    pressable: false,
    default: NECESSITY.REQUIRED // すべての条件で必要
  },

  {
    id: "midlayer",
    name: "中間着",
    iconImage: "img/items/icons/midlayer.png",
    blockImage: "img/items/blocks/midlayer-block.png",
    size: { w: 2, h: 4 },
    weight: 0.25,
    pressable: true,
    default: NECESSITY.OPTIONAL,
    // 特殊判定: 快晴・夏・無風・日帰りの全条件で「不要」
    specialCondition: (condition) => {
      if (condition.weather === "clear" && 
          condition.season === "summer" && 
          condition.wind === 0 && 
          condition.plan === "daytrip") {
        return "不要";
      }
      return null; // 特殊条件に該当しない場合はnullを返す
    }
  },

  {
    id: "towel",
    name: "速乾タオル",
    iconImage: "img/items/icons/towel.png",
    blockImage: "img/items/blocks/towel-block.png",
    size: { w: 1, h: 2 },
    weight: 0.05,
    pressable: true,
    default: NECESSITY.OPTIONAL
  },

  {
    id: "water",
    name: "500ml水分",
    iconImage: "img/items/icons/water.png",
    blockImage: "img/items/blocks/water-block.png",
    size: { w: 1, h: 3 },
    weight: 0.50,
    pressable: false,
    default: NECESSITY.OPTIONAL,
    // 水分は複数必要となる可能性がある装備
    // 必要数の計算ロジック:
    // - 基本: 1000m=1, 2000m=2, 3000m=4
    // - 山小屋泊: 基本 × 0.5
    // - テント泊: 基本 + 2
    // - 夏: +1
    hasQuantity: true,
    calculateQuantity: (condition) => {
      let needed = 0;
      
      // 標高に応じた基本数
      if (condition.altitude === 1000) needed = 1;
      else if (condition.altitude === 2000) needed = 2;
      else if (condition.altitude === 3000) needed = 4;
      
      // 季節による調整
      if (condition.season === "summer") {
        needed += 1; // 夏は+1
      }
      
      // テント泊による調整
      if (condition.plan === "tent") {
        needed += 2; // テント泊は+1
      }
      
      // 山小屋泊による調整（最後に適用）
      if (condition.plan === "hut") {
        needed = Math.floor(needed * 0.5); // 山小屋泊は半分（切り捨て）
      }
      
      return needed;
    }
  },

  {
    id: "battery",
    name: "モバイル<br>バッテリーと<br>替えの電池",
    iconImage: "img/items/icons/battery.png",
    blockImage: "img/items/blocks/battery-block.png",
    size: { w: 1, h: 1 },
    weight: 0.30,
    pressable: false,
    default: NECESSITY.REQUIRED
  },

  {
    id: "cash",
    name: "現金",
    iconImage: "img/items/icons/cash.png",
    blockImage: "img/items/blocks/cash-block.png",
    size: { w: 1, h: 1 },
    weight: 0.15,
    pressable: true,
    default: NECESSITY.REQUIRED
  },

  {
    id: "food",
    name: "食料",
    iconImage: "img/items/icons/snack.png",
    blockImage: "img/items/blocks/snack-block.png",
    size: { w: 1, h: 1 },
    weight: 0.06,
    pressable: true,
    default: NECESSITY.REQUIRED
  },

  {
    id: "health",
    name: "救急キット",
    iconImage: "img/items/icons/health.png",
    blockImage: "img/items/blocks/health-block.png",
    size: { w: 1, h: 1 },
    weight: 0.06,
    pressable: true,
    default: NECESSITY.OPTIONAL // 全条件であったほうがいい装備
  },

  {
    id: "hat",
    name: "帽子",
    iconImage: "img/items/icons/hat.png",
    blockImage: "img/items/blocks/hat-block.png",
    size: { w: 1, h: 1 },
    weight: 0.05,
    pressable: true,
    altitude: {
      2000: NECESSITY.OPTIONAL,
      3000: NECESSITY.REQUIRED
    },
    weather: {
      clear: NECESSITY.OPTIONAL
    },
    season: {
      summer: NECESSITY.REQUIRED
    }
  },

  {
    id: "sunglasses",
    name: "サングラス",
    iconImage: "img/items/icons/sunglass.png",
    blockImage: "img/items/blocks/sunglass-block.png",
    size: { w: 1, h: 1 },
    weight: 0.02,
    pressable: false,
    default: NECESSITY.REQUIRED // どんな条件でも必要
  },

{
  id: "map",
  name: "紙地図と<br>コンパス",
  iconImage: "img/items/icons/map.png",
    blockImage: "img/items/blocks/map-block.png",
  size: { w: 1, h: 1 },
  weight: 0.01,
  pressable: true,
  default: NECESSITY.OPTIONAL
},

{
  id: "bugspray",
  name: "虫除け<br>スプレー",
  iconImage: "img/items/icons/spray.png",
    blockImage: "img/items/blocks/spray-block.png",
  size: { w: 1, h: 2 },
  weight: 0.10,
  pressable: false,
  default: "不要" // 評価には影響しない装備
},

{
  id: "cookware",
  name: "調理器具",
  iconImage: "img/items/icons/cooker.png",
    blockImage: "img/items/blocks/cooker-block.png",
  size: { w: 2, h: 3 },
  weight: 0.80,
  pressable: false,
  plan: {
    tent: NECESSITY.REQUIRED
  }
},

{
  id: "gaiter",
  name: "ライト<br>スパッツ",
  iconImage: "img/items/icons/gaiter.png",
    blockImage: "img/items/blocks/gaiter-block.png",
  size: { w: 1, h: 1 },
  weight: 0.10,
  pressable: true,
  default: "不要", // 基本的には不要
  state: {
    volcano: NECESSITY.OPTIONAL // 活火山のときのみあったほうがいい
  }
},

{
  id: "beargear",
  name: "熊対策用品",
  iconImage: "img/items/icons/bear.png",
    blockImage: "img/items/blocks/bear-block.png",
  size: { w: 1, h: 2 },
  weight: 0.20,
  pressable: false,
  default: "不要", // 基本的には不要
  state: {
    bear: NECESSITY.REQUIRED // 熊出没情報があるときのみ必要
  }
},

{
  id: "mat",
  name: "マット",
  iconImage: "img/items/icons/mat.png",
    blockImage: "img/items/blocks/mat-block.png",
  size: { w: 1, h: 6 },
  weight: 0.30,
  pressable: true,
  plan: {
    tent: NECESSITY.REQUIRED
  }
},

{
  id: "sandal",
  name: "サンダル",
  iconImage: "img/items/icons/sandal.png",
    blockImage: "img/items/blocks/sandal-block.png",
  size: { w: 1, h: 2 },
  weight: 0.10,
  pressable: true,
  state: {
    river: NECESSITY.REQUIRED
  },
},

{
  id: "portable_toilet",
  name: "簡易トイレ",
  iconImage: "img/items/icons/toilet.png",
    blockImage: "img/items/blocks/toilet-block.png",
  size: { w: 1, h: 1 },
  weight: 0.05,
  pressable: true,
  default: NECESSITY.OPTIONAL
},

{
  id: "umbrella",
  name: "折りたたみ傘",
  iconImage: "img/items/icons/umbrella.png",
    blockImage: "img/items/blocks/umbrella-block.png",
  size: { w: 1, h: 3 },
  weight: 0.20,
  pressable: false,
  default: "不要" // すべての条件で評価に影響しない
},

{
  id: "trashbag",
  name: "ゴミ袋",
  iconImage: "img/items/icons/trashbag.png",
    blockImage: "img/items/blocks/trashbag-block.png",
  size: { w: 1, h: 1 },
  weight: 0.00,
  pressable: true,
  default: NECESSITY.OPTIONAL
},

{
  id: "waterfilter",
  name: "浄水器",
  iconImage: "img/items/icons/waterfilter.png",
    blockImage: "img/items/blocks/waterfilter-block.png",
  size: { w: 1, h: 1 },
  weight: 0.05,
  pressable: false,
  default: NECESSITY.OPTIONAL, // 基本的にはあったほうがいい
  // 特殊条件: 山小屋泊のときは不要
  specialCondition: (condition) => {
    if (condition.plan === "hut") {
      return "不要"; // 山小屋泊では評価に影響なし
    }
    return null; // それ以外はデフォルト（あったほうがいい）を使用
  }
},

{
  id: "sanitary",
  name: "生理用品",
  iconImage: "img/items/icons/sanitary.png",
    blockImage: "img/items/blocks/sanitary-block.png",
  size: { w: 1, h: 1 },
  weight: 0.02,
  pressable: true,
  default: NECESSITY.OPTIONAL
},

{
  id: "gloves",
  name: "手袋",
  iconImage: "img/items/icons/gloves.png",
    blockImage: "img/items/blocks/gloves-block.png",
  size: { w: 1, h: 1 },
  weight: 0.05,
  pressable: true,
  default: "不要", // 基本的には不要
  // 複雑な条件判定
  specialCondition: (condition) => {
    // 「時々雨」OR「春秋」OR「冬」OR「強風」OR「濃霧」OR「テント泊」のいずれかがある場合
    if (condition.weather === "rain" ||
        condition.season === "autumn" ||
        condition.season === "winter" ||
        condition.wind === 4 ||
        condition.state === "fog" ||
        condition.plan === "tent") {
      return "補助"; // あったほうがいい
    }
    
    // それ以外は「不要」（デフォルト値を使用）
    return null;
  }
},

{
  id: "tent",
  name: "テント",
  iconImage: "img/items/icons/tent.png",
    blockImage: "img/items/blocks/tent-block.png",
  size: { w: 2, h: 4 },
  weight: 1.00,
  pressable: true,
  plan: {
    tent: NECESSITY.REQUIRED
  }
},

{
  id: "groundsheet",
  name: "グラウンド<br>シート",
  iconImage: "img/items/icons/groundsheet.png",
    blockImage: "img/items/blocks/groundsheet-block.png",
  size: { w: 1, h: 1 },
  weight: 0.20,
  pressable: true,
  requiresTent: true,
  plan: {
    tent: NECESSITY.REQUIRED
  }
},

{
  id: "rainfly",
  name: "レインフライ",
  iconImage: "img/items/icons/rainfly.png",
    blockImage: "img/items/blocks/rainfly-block.png",
  size: { w: 1, h: 3 },
  weight: 0.35,
  pressable: true,
  requiresTent: true,
  plan: {
    tent: NECESSITY.REQUIRED
  }
},

{
  id: "peg",
  name: "ペグ",
  iconImage: "img/items/icons/peg.png",
    blockImage: "img/items/blocks/peg-block.png",
  size: { w: 1, h: 1 },
  weight: 0.12,
  pressable: false,
  requiresTent: true,
  plan: {
    tent: NECESSITY.REQUIRED
  }
},

{
  id: "sleepingbag",
  name: "寝袋",
  iconImage: "img/items/icons/sleepingbag.png",
    blockImage: "img/items/blocks/sleepingbag-block.png",
  size: { w: 2, h: 5 },
  weight: 0.60,
  pressable: true,
  plan: {
    hut: NECESSITY.OPTIONAL,
    tent: NECESSITY.REQUIRED
  }
},

{
  id: "down_shirt",
  name: "ダウンシャツ",
  iconImage: "img/items/icons/downshirt.png",
    blockImage: "img/items/blocks/downshirt-block.png",
  size: { w: 2, h: 4 },
  weight: 0.25,
  pressable: true,
  default: "不要", // 基本的には評価に影響なし
  // 特殊条件: 冬×山小屋泊 または 冬×テント泊 で「あったほうがいい」
  specialCondition: (condition) => {
    if (condition.season === "winter" && 
        (condition.plan === "hut" || condition.plan === "tent")) {
      return "補助";
    }
    return null; // 特殊条件に該当しない場合はnullを返す
  }
},

{
  id: "down_pants",
  name: "ダウンパンツ",
  iconImage: "img/items/icons/downpants.png",
    blockImage: "img/items/blocks/downpants-block.png",
  size: { w: 2, h: 4 },
  weight: 0.20,
  pressable: true,
  default: "不要", // 基本的には評価に影響なし
  // 特殊条件: 冬×山小屋泊 または 冬×テント泊 で「あったほうがいい」
  specialCondition: (condition) => {
    if (condition.season === "winter" && 
        (condition.plan === "hut" || condition.plan === "tent")) {
      return "補助";
    }
    return null; // 特殊条件に該当しない場合はnullを返す
  }
},

{
  id: "trekking_pole",
  name: "ストック",
  iconImage: "img/items/icons/stock.png",
    blockImage: "img/items/blocks/stock-block.png",
  size: { w: 1, h: 5 },
  weight: 0.20,
  pressable: false,
  default: NECESSITY.OPTIONAL
},

{
  id: "helmet",
  name: "ヘルメット",
  iconImage: "img/items/icons/helmet.png",
  blockImage: "img/items/blocks/helmet-block.png",
  size: { w: 2, h: 2 },
  weight: 0.25,
  pressable: false,
  state: {
    rockfall: NECESSITY.REQUIRED
  }
},

{
  id: "change",
  name: "着替え",
  iconImage: "img/items/icons/change.png",
  blockImage: "img/items/blocks/change-block.png",
  size: { w: 2, h: 2 },
  weight: 1.00,
  pressable: true,
  default: "不要", // 基本的には評価に影響なし
  weather: {
    rain: NECESSITY.OPTIONAL // 時々雨のときはあったほうがいい
  },
  plan: {
    hut: NECESSITY.OPTIONAL // 山小屋泊のときはあったほうがいい
  }
},

{
  id: "id_card",
  name: "身分証明書と保険証",
  iconImage: "img/items/icons/id.png",
  blockImage: "img/items/blocks/id-block.png",
  size: { w: 1, h: 1 },
  weight: 0.01,
  pressable: true,
  default: NECESSITY.REQUIRED
}

];

window.packingItems = packingItems;

  // ===== パッキング画面描画 =====
  function renderPackingScene() {
    console.log("renderPackingScene が呼ばれました");

    // グローバルではなく、その都度DOMから取得して参照する
    const scenePackingEl = document.getElementById("scene-packing");
    if (!scenePackingEl) {
      console.error("scene-packing が存在しません");
      return;
    }

    let packingUI = scenePackingEl.querySelector("#packing-ui");
    let packingWeight = scenePackingEl.querySelector("#packing-weight");

    // 無ければ作る
    if (!packingUI) {
      packingUI = document.createElement("div");
      packingUI.id = "packing-ui";
      scenePackingEl.appendChild(packingUI);
    }

    if (!packingWeight) {
      packingWeight = document.createElement("div");
      packingWeight.id = "packing-weight";
      const packingInfo = scenePackingEl.querySelector("#packing-info");
      if (packingInfo) {
        packingInfo.appendChild(packingWeight);
      }
    }

    packingWeight.textContent = "0.0kg";

    // ★ 装備一覧コンテナを保証
    let packingItemsContainer = scenePackingEl.querySelector("#packing-items");
    if (!packingItemsContainer) {
      packingItemsContainer = document.createElement("div");
      packingItemsContainer.id = "packing-items";
      packingUI.appendChild(packingItemsContainer);
    }

    // 装備一覧を表示
    renderPackingItems();

    // グリッドが存在することを確認してから再描画
    requestAnimationFrame(() => {
      const gridEl = scenePackingEl.querySelector("#pack-grid");
      if (gridEl) {
        // 容量が設定されていない場合はデフォルト値を使用
        if (packConfig.cols === 0 || packConfig.rows === 0) {
          setPackCapacity(20);
        } else {
          renderEmptyGrid();
        }
      }
    });
  }
// 判定ロジック
/**
 * condition: 確定した登山条件オブジェクト
 * 例:
 * {
 *   altitude: { label: "3000m", value: 3000 },
 *   weather: { label: "時々雨" },
 *   season: { label: "冬" },
 *   wind: { label: "強風" },
 *   state: { label: "熊出没情報あり" },
 *   plan: { label: "1泊2日" }
 * }
 *
 * packedItemIds: パズルに入っている装備IDの配列
 * 例: ["rainwear", "headlight", "tent", ...]
 *
 * packingItems: 全装備データ配列
 */
// ザック内のバランスを判定（グリッドを縦3分割して重量を計算）
function evaluatePackingBalance() {
  // 容量に応じたエリア分割設定（上, 中, 下の行数）
  const divisionMap = {
    20: [1, 3, 1],  // 4×5グリッド
    30: [2, 3, 2],  // 4×7グリッド
    40: [3, 4, 3],  // 4×10グリッド
    50: [3, 4, 3],  // 5×10グリッド
    60: [4, 4, 4],  // 5×12グリッド
    80: [5, 6, 5]   // 5×16グリッド
  };
  
  const division = divisionMap[packConfig.capacity];
  if (!division) {
    console.error("無効な容量:", packConfig.capacity);
    return { balanced: true }; // デフォルトでバランスOK
  }
  
  const [upperRows, middleRows, lowerRows] = division;
  
  // 各エリアの重量を計算
  let upperWeight = 0;
  let middleWeight = 0;
  let lowerWeight = 0;
  
  // 各装備の重量を計算し、エリアごとに振り分け
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    const item = packingItems.find(i => i.id === placed.itemId);
    if (!item) continue;
    
    // 装備の高さを計算
    let itemHeight = placed.rotated ? item.size.w : item.size.h;
    if (placed.pressed && item.pressable) {
      itemHeight = Math.max(1, itemHeight - 1);
    }
    
    // 装備の占有する行の範囲
    const itemTop = placed.y;
    const itemBottom = placed.y + itemHeight - 1;
    
    // エリア境界を計算
    const upperEnd = upperRows - 1;
    const middleEnd = upperRows + middleRows - 1;
    
    // 装備が各エリアに占める行数を計算
    const upperOverlap = Math.max(0, Math.min(itemBottom, upperEnd) - Math.max(itemTop, 0) + 1);
    const middleOverlap = Math.max(0, Math.min(itemBottom, middleEnd) - Math.max(itemTop, upperRows) + 1);
    const lowerOverlap = Math.max(0, Math.min(itemBottom, packConfig.rows - 1) - Math.max(itemTop, upperRows + middleRows) + 1);
    
    // 優先度：下 > 中 > 上
    if (lowerOverlap > 0) {
      lowerWeight += item.weight;
    } else if (middleOverlap > 0) {
      middleWeight += item.weight;
    } else if (upperOverlap > 0) {
      upperWeight += item.weight;
    }
  }
  
  // バランス判定：中 > 下 > 上 が理想
  const balanced = (middleWeight >= lowerWeight) && (lowerWeight >= upperWeight);
  
  console.log(`バランス判定: 上=${upperWeight.toFixed(2)}kg, 中=${middleWeight.toFixed(2)}kg, 下=${lowerWeight.toFixed(2)}kg, バランス=${balanced}`);
  
  return {
    balanced,
    upperWeight,
    middleWeight,
    lowerWeight
  };
}

function evaluatePacking(packingItems, condition, packedItemIds) {
  // 登山条件の優先順位（左が最優先、右に行くほど優先度が低い）
  // 各装備の必要度判定で、複数の条件が該当する場合はこの順序で上書きされる
  const PRIORITY = [
    "weather",   // 1. 天気（最優先）
    "wind",      // 2. 風
    "season",    // 3. 季節
    "plan",      // 4. 山行計画（日帰り/山小屋泊/テント泊）
    "state",     // 5. 特殊状態（クマ出没、濃霧など）
    "altitude"   // 6. 標高（最低優先）
  ];

  const missingRequired = [];
  const missingOptional = [];

  const hasTent = packedItemIds.includes("tent");

  for (const item of packingItems) {
    let necessity = item.default ?? "不要";

    // 依存関係処理
    if (item.requiresTent && !hasTent) {
      continue;
    }

    // 優先順位に従って上書き
    for (const key of PRIORITY) {
      const conditionValue = condition[key];
      if (conditionValue == null) continue;

      const rule = item[key];
      if (!rule) continue;

      // state は複数想定
      if (Array.isArray(conditionValue)) {
        for (const v of conditionValue) {
          if (rule[v]) {
            necessity = rule[v];
            break;
          }
        }
      } else {
        if (rule[conditionValue]) {
          necessity = rule[conditionValue];
        }
      }

      // 優先条件が当たったら以降は見ない
      if (rule && rule[conditionValue]) {
        break;
      }
    }

    // 特殊条件判定（複数条件の組み合わせ）
    if (item.specialCondition) {
      const specialResult = item.specialCondition(condition);
      if (specialResult !== null) {
        necessity = specialResult;
      }
    }

    const isPacked = packedItemIds.includes(item.id);

    // 数量が必要な装備の場合
    if (item.hasQuantity && item.calculateQuantity) {
      const neededQuantity = item.calculateQuantity(condition);
      const packedQuantity = packedItemIds.filter(id => id === item.id).length;
      
      if (packedQuantity < neededQuantity) {
        const shortfall = neededQuantity - packedQuantity;
        missingRequired.push({ name: item.name, shortfall: shortfall });
      }
      continue; // 数量管理装備は通常の判定をスキップ
    }

    if (necessity === "必要" && !isPacked) {
      missingRequired.push({ name: item.name });
    }

    if (necessity === "補助" && !isPacked) {
      missingOptional.push({ name: item.name });
    }
  }

  return {
    success: missingRequired.length === 0,
    missingRequired,
    missingOptional
  };
}

function maxNecessity(a, b) {
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

// テスト用コード(最終的に消す)
const equipmentData = [
  {
    itemId: "rainwear",
    name: "レインウェア",
    baseWidth: 1,
    baseHeight: 2,
    weight: 0.25,
    pressable: true
  },
  {
    itemId: "headlight",
    name: "ヘッドライト",
    baseWidth: 1,
    baseHeight: 1,
    weight: 0.10,
    pressable: false
  },
  {
    itemId: "rainpants",
    name: "レインパンツ",
    baseWidth: 1,
    baseHeight: 2,
    weight: 0.17,
    pressable: true
  }
];

/* ====================
   パッキング盤面管理
==================== */

/* --------------------
   ザック設定
-------------------- */

// packConfigはファイル先頭で定義済み

// 容量選択ボタンのイベントリスナーを設定する関数（グローバルスコープ）
function setupCapacityButtons(buttons) {
  buttons.forEach((btn, index) => {
    const capacity = btn.dataset.capacity;
    console.log(`ボタン[${index}]設定中: data-capacity="${capacity}"`, btn);
    
    // 既存のイベントリスナーを削除（重複を防ぐ）
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    // 通常のクリックイベントとして設定
    newBtn.addEventListener("click", function(e) {
      console.log("クリックイベント発生！", this, e);
      const cap = Number(this.dataset.capacity);
      console.log(`容量選択ボタンが押されました: ${cap}`);
      if (!isNaN(cap)) {
        setPackCapacity(cap);
      } else {
        console.error("無効な容量値:", this.dataset.capacity);
      }
    });
    
    // 念のため、mousedownイベントも設定
    newBtn.addEventListener("mousedown", function(e) {
      console.log("mousedownイベント発生！", this.dataset.capacity);
    });
  });
  console.log("容量選択ボタンのイベントリスナー設定完了");
}

function setPackCapacity(capacity) {
  const map = { 20:[4,5], 30:[4,7], 40:[4,10], 50:[5,10], 60:[5,12], 80:[5,16] };
  if (!map[capacity]) {
    console.error("無効な容量:", capacity);
    return;
  }

  console.log(`容量を${capacity}に設定します: ${map[capacity][0]}×${map[capacity][1]}`);
  
  packConfig.capacity = capacity;
  packConfig.cols = map[capacity][0];
  packConfig.rows = map[capacity][1];

  console.log("packConfig更新後:", packConfig);

  // 容量選択ボタンのスタイルを更新
  document.querySelectorAll("[data-capacity]").forEach(btn => {
    if (Number(btn.dataset.capacity) === capacity) {
      btn.style.backgroundColor = "#4CAF50";
      btn.style.color = "#fff";
    } else {
      btn.style.backgroundColor = "";
      btn.style.color = "";
    }
  });

  // グリッドを再作成
  createEmptyGrid();
}

function createEmptyGrid() {
  console.log(`createEmptyGrid: packConfig = cols:${packConfig.cols}, rows:${packConfig.rows}`);
  
  packGrid = Array.from({ length: packConfig.rows }, () =>
    Array(packConfig.cols).fill(null)
  );
  
  console.log(`packGrid作成完了: ${packGrid.length}行 x ${packGrid[0].length}列`);
  
  for (const key in placedItems) delete placedItems[key];
  
  // 重量表示をリセット
  updateWeightDisplay();
  
  renderEmptyGrid();
}

/* --------------------
   圧縮機能
-------------------- */

// 圧縮可能なアイテムを圧縮する関数
function compressItems() {
  console.log("圧縮処理を開始");
  
  // フェーズ1: 処理対象の装備を準備（すでに圧縮済みの装備は除外）
  const itemsToProcess = [];
  const fixedItems = []; // すでに圧縮済みの装備（固定）
  
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    const item = packingItems.find(i => i.id === placed.itemId);
    
    if (!item) continue;
    
    // 現在のサイズを計算
    const currentWidth = placed.rotated ? item.size.h : item.size.w;
    let currentHeight = placed.rotated ? item.size.w : item.size.h;
    
    // 既に圧縮されている場合は、圧縮後のサイズを計算
    if (placed.pressed && item.pressable) {
      currentHeight = Math.max(1, currentHeight - 1);
    }
    
    // すでに圧縮済みの装備は固定（処理対象外）
    if (placed.pressed) {
      console.log(`固定: ${item.name} (${instanceId}) - すでに圧縮済み`);
      fixedItems.push({
        instanceId,
        itemId: placed.itemId,
        x: placed.x,
        y: placed.y,
        rotated: placed.rotated,
        width: currentWidth,
        height: currentHeight,
        pressed: true
      });
      continue; // 処理対象から除外
    }
    
    // 圧縮可能かチェック：pressableがtrue、まだ圧縮されていない、縦が2以上
    const canCompress = item.pressable && !placed.pressed && currentHeight >= 2;
    
    let newHeight, willBePressed;
    
    if (canCompress) {
      console.log(`圧縮: ${item.name} (${instanceId})`);
      // 縦方向を1マス減らす
      newHeight = currentHeight - 1;
      willBePressed = true;
    } else {
      console.log(`落下のみ: ${item.name} (${instanceId}), 圧縮不可: pressed=${placed.pressed}, height=${currentHeight}`);
      // 圧縮せず、現在のサイズのまま
      newHeight = currentHeight;
      willBePressed = false;
    }
    
    console.log(`サイズ: ${currentWidth}x${currentHeight} → ${currentWidth}x${newHeight}, 回転: ${placed.rotated}, 圧縮: ${willBePressed}`);
    
    itemsToProcess.push({
      instanceId,
      itemId: placed.itemId,
      x: placed.x,
      originalY: placed.y,
      originalHeight: currentHeight,
      rotated: placed.rotated,
      width: currentWidth,
      height: newHeight,
      pressed: willBePressed
    });
  }
  
  // Y座標でソート（下から上へ処理：Y座標が大きい = 下にある）
  itemsToProcess.sort((a, b) => {
    // Y座標の下端で比較（下端が下にあるものから処理）
    const aBottom = a.originalY + a.originalHeight;
    const bBottom = b.originalY + b.originalHeight;
    return bBottom - aBottom;
  });
  
  // フェーズ2: 処理対象の装備のみグリッドから削除（固定装備は残す）
  for (const itemData of itemsToProcess) {
    clearItemFromGrid(itemData.instanceId);
  }
  
  // 下から順に配置（圧縮して、下に落下できるだけ落下）
  for (const itemData of itemsToProcess) {
    // まず、できるだけ下に落下させる位置を計算
    // グリッドの下から上に向かって、配置可能な位置を探す
    let finalY = packConfig.rows - itemData.height; // 最下段から開始
    
    // 下から上に向かって、配置可能かチェック
    for (let testY = packConfig.rows - itemData.height; testY >= 0; testY--) {
      if (canPlaceCompressedItem(itemData.x, testY, itemData.width, itemData.height, null)) {
        finalY = testY;
        break; // 最初に見つかった位置（最も下）で確定
      }
    }
    
    console.log(`${itemData.instanceId}: y=${itemData.originalY} (height=${itemData.originalHeight}) → y=${finalY} (height=${itemData.height}) 圧縮=${itemData.pressed}`);
    
    placeCompressedItem(
      itemData.instanceId,
      itemData.itemId,
      itemData.x,
      finalY,
      itemData.rotated,
      itemData.width,
      itemData.height,
      itemData.pressed
    );
  }
  
  console.log("圧縮処理完了");
}

// 圧縮後のサイズで配置可能かチェック
function canPlaceCompressedItem(x, y, width, height, skipInstanceId = null) {
  // 範囲チェック
  if (x + width > packConfig.cols || y + height > packConfig.rows) {
    return false;
  }
  
  // セルが空いているかチェック
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const checkY = y + dy;
      const checkX = x + dx;
      const cellValue = packGrid[checkY][checkX];
      
      // 自分自身以外のアイテムが占有している場合はNG
      if (cellValue !== null && cellValue !== skipInstanceId) {
        return false;
      }
    }
  }
  
  return true;
}

// 圧縮状態でアイテムを配置
function placeCompressedItem(instanceId, itemId, x, y, rotated, width, height, pressed = true) {
  const item = packingItems.find(i => i.id === itemId);
  if (!item) return;
  
  // グリッドに記録
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      packGrid[y + dy][x + dx] = instanceId;
    }
  }
  
  // 配置情報を保存（圧縮状態を引数から設定）
  placedItems[instanceId] = { itemId, x, y, rotated, pressed: pressed };
  
  // 既存の視覚要素を削除
  const gridEl = document.getElementById("pack-grid");
  const existingEl = gridEl.querySelector(`[data-placed-item-id="${instanceId}"]`);
  if (existingEl) {
    existingEl.remove();
  }
  
  // 視覚的に配置
  renderPlacedItem(instanceId, itemId, x, y, width, height, rotated);
}

// 装備をグリッド内で移動させる関数
function moveItemOnGrid(instanceId, newX, newY) {
  const placed = placedItems[instanceId];
  if (!placed) {
    console.error("配置情報が見つかりません:", instanceId);
    return;
  }
  
  const item = packingItems.find(i => i.id === placed.itemId);
  if (!item) {
    console.error("装備が見つかりません:", placed.itemId);
    return;
  }
  
  // 移動時は圧縮を解除
  const { rotated } = placed;
  const width = rotated ? item.size.h : item.size.w;
  const height = rotated ? item.size.w : item.size.h;
  
  // 現在の位置からグリッドをクリア（重量計算は更新しない）
  clearItemFromGrid(instanceId);
  
  // 新しい位置に配置可能かチェック
  if (newX + width > packConfig.cols || newY + height > packConfig.rows) {
    console.warn("移動先がグリッド外です");
    placeExistingItem(instanceId, placed.itemId, placed.x, placed.y, rotated, false);
    return;
  }
  
  // 他の装備と重ならないかチェック
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const checkX = newX + dx;
      const checkY = newY + dy;
      const cellValue = packGrid[checkY][checkX];
      if (cellValue !== null) {
        console.warn(`移動先セル(${checkX}, ${checkY})は占有されています`);
        placeExistingItem(instanceId, placed.itemId, placed.x, placed.y, rotated, false);
        return;
      }
    }
  }
  
  // 新しい位置に配置（圧縮を解除）
  placeExistingItem(instanceId, placed.itemId, newX, newY, rotated, false);
}

// グリッドから装備をクリアする（重量更新なし、移動用）
function clearItemFromGrid(instanceId) {
  const placed = placedItems[instanceId];
  if (!placed) return;
  
  const item = packingItems.find(i => i.id === placed.itemId);
  if (!item) return;
  
  let width = placed.rotated ? item.size.h : item.size.w;
  let height = placed.rotated ? item.size.w : item.size.h;
  
  // 圧縮されている場合は、実際のサイズを計算
  if (placed.pressed && item.pressable) {
    if (placed.rotated) {
      // 回転している場合、横方向（元の縦方向）が圧縮されている
      width = Math.max(1, width - 1);
    } else {
      // 通常の場合、縦方向が圧縮されている
      height = Math.max(1, height - 1);
    }
  }
  
  // グリッドから削除
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const checkY = placed.y + dy;
      const checkX = placed.x + dx;
      if (checkY < packGrid.length && checkX < packGrid[0].length) {
        packGrid[checkY][checkX] = null;
      }
    }
  }
}

// 既存のinstanceIdで装備を配置する関数
function placeExistingItem(instanceId, itemId, x, y, rotated, pressed) {
  const item = packingItems.find(i => i.id === itemId);
  if (!item) return;
  
  const width = rotated ? item.size.h : item.size.w;
  const height = rotated ? item.size.w : item.size.h;
  
  // グリッドに記録
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      packGrid[y + dy][x + dx] = instanceId;
    }
  }
  
  // 配置情報を保存
  placedItems[instanceId] = { itemId, x, y, rotated, pressed };
  
  // 既存の視覚要素を削除
  const gridEl = document.getElementById("pack-grid");
  const existingEl = gridEl.querySelector(`[data-placed-item-id="${instanceId}"]`);
  if (existingEl) {
    existingEl.remove();
  }
  
  // 視覚的に配置
  renderPlacedItem(instanceId, itemId, x, y, width, height, rotated);
}

// 重量表示を更新する関数
function updateWeightDisplay() {
  let totalWeight = 0;
  
  // 配置済みの全装備の重量を計算
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    const item = packingItems.find(i => i.id === placed.itemId);
    if (item) {
      totalWeight += item.weight;
    }
  }
  
  // 表示を更新
  const weightEl = document.getElementById("packing-weight");
  if (weightEl) {
    weightEl.textContent = `${totalWeight.toFixed(2)}kg`;
  }
  
  console.log(`合計重量: ${totalWeight.toFixed(2)}kg`);
}

// 装備をグリッドに配置する関数
function placeItemOnGrid(itemId, x, y) {
  console.log("placeItemOnGrid呼び出し:", { itemId, x, y });
  console.log("packGridの状態:");
  for (let row = 0; row < packConfig.rows; row++) {
    let rowStr = `Row ${row}: `;
    for (let col = 0; col < packConfig.cols; col++) {
      rowStr += (packGrid[row][col] === null ? '□' : '■') + ' ';
    }
    console.log(rowStr);
  }
  
  const item = packingItems.find(i => i.id === itemId);
  if (!item) {
    console.error("装備が見つかりません:", itemId);
    console.error("利用可能な装備ID:", packingItems.map(i => i.id));
    return;
  }
  
  // 一意IDを生成（同じ装備を複数配置できるように）
  itemInstanceCounter++;
  const instanceId = `${itemId}_${itemInstanceCounter}`;
  console.log(`新しいインスタンスID: ${instanceId}`);
  
  const width = item.size.w;
  const height = item.size.h;
  
  console.log(`配置チェック: サイズ ${width}x${height}, 位置 (${x}, ${y})`);
  console.log(`グリッド設定: cols=${packConfig.cols}, rows=${packConfig.rows}`);
  console.log(`配置後の範囲: x=${x} + width=${width} = ${x + width} (max: ${packConfig.cols})`);
  console.log(`配置後の範囲: y=${y} + height=${height} = ${y + height} (max: ${packConfig.rows})`);
  
  // 配置可能かチェック
  if (x + width > packConfig.cols || y + height > packConfig.rows) {
    console.warn("グリッドからはみ出します:", { 
      x, y, width, height, 
      cols: packConfig.cols, 
      rows: packConfig.rows,
      xEnd: x + width,
      yEnd: y + height
    });
    return;
  }
  
  // セルが空いているかチェック
  console.log(`セルチェック: (${x},${y})から${width}x${height}マス`);
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const checkY = y + dy;
      const checkX = x + dx;
      
      // packGridの範囲チェック
      if (!packGrid[checkY]) {
        console.error(`packGrid[${checkY}]が未定義です。packGrid.length=${packGrid.length}`);
        return;
      }
      
      const cellValue = packGrid[checkY][checkX];
      console.log(`  セル(${checkX}, ${checkY}): ${cellValue === null ? '空(□)' : '占有(■) by ' + cellValue}`);
      
      if (cellValue !== null) {
        console.warn(`セル(${checkX}, ${checkY})は既に占有されています:`, cellValue);
        return;
      }
    }
  }
  
  // グリッドに一意IDを記録
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      packGrid[y + dy][x + dx] = instanceId;
    }
  }
  
  // 配置情報を保存（itemIdも保持）
  placedItems[instanceId] = { itemId, x, y, rotated: false, pressed: false };
  
  // 視覚的に配置
  renderPlacedItem(instanceId, itemId, x, y, width, height, false);
  
  console.log(`装備「${item.name}」を(${x}, ${y})に配置`);
  
  // 重量表示を更新
  updateWeightDisplay();
}

// グリッドから装備を削除する関数
function removeItemFromGrid(instanceId) {
  const placed = placedItems[instanceId];
  if (!placed) {
    console.log(`削除: ${instanceId} は配置されていません`);
    return;
  }
  
  const item = packingItems.find(i => i.id === placed.itemId);
  if (!item) {
    console.error(`削除: アイテム ${placed.itemId} が見つかりません`);
    return;
  }
  
  // 回転状態を考慮したサイズを取得
  const width = placed.rotated ? item.size.h : item.size.w;
  const height = placed.rotated ? item.size.w : item.size.h;
  
  console.log(`削除: ${item.name} (${placed.x}, ${placed.y}) サイズ: ${width}x${height}, 回転: ${placed.rotated}`);
  
  // グリッドから削除
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const checkY = placed.y + dy;
      const checkX = placed.x + dx;
      if (packGrid[checkY] && packGrid[checkY][checkX] === instanceId) {
        packGrid[checkY][checkX] = null;
        console.log(`  セル(${checkX}, ${checkY})をクリア`);
      }
    }
  }
  
  // 配置情報を削除
  delete placedItems[instanceId];
  
  // 視覚的な要素を削除
  const gridEl = document.getElementById("pack-grid");
  const itemEl = gridEl.querySelector(`[data-placed-item-id="${instanceId}"]`);
  if (itemEl) {
    itemEl.remove();
  }
  
  console.log(`削除完了: ${instanceId}`);
  
  // 重量表示を更新
  updateWeightDisplay();
}

// 配置された装備を視覚的に表示する関数
function renderPlacedItem(instanceId, itemId, x, y, width, height, rotated = false) {
  const item = packingItems.find(i => i.id === itemId);
  if (!item) return;
  
  const placed = placedItems[instanceId];
  const pressed = placed ? placed.pressed : false;
  
  const gridEl = document.getElementById("pack-grid");
  if (!gridEl) return;
  
  // セルサイズを取得（40px + gap 2px）
  const cellSize = 40;
  const gap = 2;
  
  // 装備の実際のピクセルサイズを計算
  const itemWidth = width * cellSize + (width - 1) * gap;
  const itemHeight = height * cellSize + (height - 1) * gap;
  
  // グリッド内の位置を計算（絶対配置）
  const offsetX = x * (cellSize + gap) + 4; // +4はグリッドのpadding
  const offsetY = y * (cellSize + gap) + 4;
  
  // 装備の表示要素を作成
  const itemEl = document.createElement("div");
  itemEl.className = "placed-item";
  itemEl.dataset.placedItemId = instanceId;
  itemEl.draggable = true;
  itemEl.style.position = "absolute";
  itemEl.style.left = `${offsetX}px`;
  itemEl.style.top = `${offsetY}px`;
  itemEl.style.width = `${itemWidth}px`;
  itemEl.style.height = `${itemHeight}px`;
  itemEl.style.pointerEvents = "auto";
  itemEl.style.cursor = "move";
  itemEl.style.zIndex = "10";
  
  // ブロック画像を設定（グリッド配置時はblockImageを使用）
  const img = document.createElement("img");
  img.src = item.blockImage; // グリッド上ではblockImageを使用
  img.alt = item.name;
  img.style.display = "block";
  img.style.transition = "transform 0.3s ease";
  img.style.position = "absolute";
  img.style.top = "50%";
  img.style.left = "50%";
  img.style.backgroundColor = "#ffffff"; // 余白を白で補う
  
  // 圧縮状態と回転状態に応じて画像を調整
  // widthとheightは既に最終的なサイズなので、そのまま使用
  if (rotated) {
    // 回転時：画像のサイズを入れ替えて中央配置
    img.style.width = `${itemHeight}px`;
    img.style.height = `${itemWidth}px`;
    img.style.transform = "translate(-50%, -50%) rotate(90deg)";
    console.log(`画像を90度回転: ${item.name}, サイズ: ${itemHeight}×${itemWidth}, 圧縮: ${pressed}`);
  } else {
    // 通常時：コンテナに合わせる
    img.style.width = `${itemWidth}px`;
    img.style.height = `${itemHeight}px`;
    img.style.transform = "translate(-50%, -50%) rotate(0deg)";
  }
  
  // マスの短辺に合わせて拡大縮小し、足りない部分は白で補う
  img.style.objectFit = "contain"; // アスペクト比を維持して短辺に合わせる
  img.style.objectPosition = "center"; // 中央配置
  
  console.log(`装備「${item.name}」をグリッドに表示: ${img.src}, 回転: ${rotated}`);
  img.onerror = function() {
    // 画像が読み込めない場合のフォールバック
    itemEl.style.backgroundColor = "#4CAF50";
    itemEl.style.border = "2px solid #2E7D32";
    const label = document.createElement("div");
    label.textContent = item.name;
    label.style.fontSize = "10px";
    label.style.textAlign = "center";
    label.style.color = "#fff";
    label.style.padding = "2px";
    label.style.position = "absolute";
    label.style.top = "50%";
    label.style.left = "50%";
    label.style.transform = "translate(-50%, -50%)";
    label.style.width = "90%";
    itemEl.appendChild(label);
  };
  
  itemEl.appendChild(img);
  
  // 装備名表示用のタイマー
  let nameDisplayTimer = null;
  
  // マウスオーバー時に装備名を表示
  // itemEl.addEventListener("mouseenter", (e) => {
  //   // 1秒後に名前を表示
  //   nameDisplayTimer = setTimeout(() => {
  //     showItemName(itemEl, item.name, offsetX, offsetY, itemWidth);
  //   }, 1000);
  // });
  itemEl.addEventListener("mouseenter", (e) => {
  // 1秒後に名前を表示
  nameDisplayTimer = setTimeout(() => {
    const safeName = item.name.replace(/<br>/g, "");
    showItemName(itemEl, safeName, offsetX, offsetY, itemWidth);
  }, 1000);
});
  
  itemEl.addEventListener("mouseleave", (e) => {
    // タイマーをクリア
    if (nameDisplayTimer) {
      clearTimeout(nameDisplayTimer);
      nameDisplayTimer = null;
    }
    // 名前表示を削除
    hideItemName(instanceId);
  });
  
  // Pointer Eventsで配置済み装備のドラッグを実装（スマホ対応）
  let isDraggingPlaced = false;
  let pointerDownTime = 0;
  
  itemEl.addEventListener("pointerdown", (e) => {
    pointerDownTime = Date.now();
    isDraggingPlaced = true;
    isDraggingActive = true;
    currentDraggedItem = instanceId;
    currentDragType = "placed";
    itemEl.style.opacity = "0.5";
    itemEl.setPointerCapture(e.pointerId);
    
    if (nameDisplayTimer) {
      clearTimeout(nameDisplayTimer);
      nameDisplayTimer = null;
    }
    hideItemName(instanceId);
    
    // プレビュー要素を作成
    createDragPreview(item, placed.rotated);
    updateDragPreview(e.clientX, e.clientY);
    
    console.log("配置済み装備のドラッグ開始:", instanceId);
    e.stopPropagation();
  });
  
  itemEl.addEventListener("pointermove", (e) => {
    if (!isDraggingPlaced) return;
    
    // プレビュー要素を更新
    updateDragPreview(e.clientX, e.clientY);
    
    // グリッドセルのハイライト更新
    const dropTarget = getGridCellFromPointer(e.clientX, e.clientY);
    if (dropTarget) {
      highlightPlacementArea(dropTarget.x, dropTarget.y);
    } else {
      clearAllHighlights();
    }
  });
  
  itemEl.addEventListener("pointerup", (e) => {
    if (!isDraggingPlaced) return;
    
    const dragDuration = Date.now() - pointerDownTime;
    isDraggingPlaced = false;
    isDraggingActive = false;
    itemEl.style.opacity = "1";
    
    // プレビュー要素を削除
    removeDragPreview();
    
    // 短時間のタップはクリック（回転）として扱う
    if (dragDuration < 200) {
      currentDraggedItem = null;
      currentDragType = null;
      clearAllHighlights();
      itemEl.releasePointerCapture(e.pointerId);
      rotateItem(instanceId);
      e.stopPropagation();
      return;
    }
    
    // ドロップ先の座標を取得
    const dropTarget = getGridCellFromPointer(e.clientX, e.clientY);
    if (dropTarget) {
      // グリッド内にドロップ: 再配置
      handlePlacedItemDrop(instanceId, dropTarget.x, dropTarget.y);
    } else {
      // グリッド外にドロップ: 削除
      console.log("グリッド外にドロップして削除:", instanceId);
      removeItemFromGrid(instanceId);
    }
    
    currentDraggedItem = null;
    currentDragType = null;
    clearAllHighlights();
    itemEl.releasePointerCapture(e.pointerId);
    e.stopPropagation();
  });
  
  itemEl.addEventListener("pointercancel", (e) => {
    isDraggingPlaced = false;
    isDraggingActive = false;
    itemEl.style.opacity = "1";
    removeDragPreview();
    currentDraggedItem = null;
    currentDragType = null;
    clearAllHighlights();
  });
  
  // 旧式のdragイベントも残す（互換性のため）
  itemEl.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    e.dataTransfer.setData("placedInstanceId", instanceId);
    currentDraggedItem = instanceId;
    currentDragType = "placed";
    isDraggingActive = true;
    itemEl.style.opacity = "0.5";
    if (nameDisplayTimer) {
      clearTimeout(nameDisplayTimer);
      nameDisplayTimer = null;
    }
    hideItemName(instanceId);
    console.log("配置済み装備のドラッグ開始:", instanceId);
  });
  
  itemEl.addEventListener("dragend", (e) => {
    itemEl.style.opacity = "1";
    currentDraggedItem = null;
    currentDragType = null;
    isDraggingActive = false;
    clearAllHighlights();
  });
  
  gridEl.appendChild(itemEl);
}

// 装備名を表示
function showItemName(itemEl, itemName, x, y, itemWidth) {
  const gridEl = document.getElementById("pack-grid");
  if (!gridEl) return;
  
  const instanceId = itemEl.dataset.placedItemId;
  
  // 既存の名前表示があれば削除
  hideItemName(instanceId);
  
  // 名前表示用の要素を作成
  const nameEl = document.createElement("div");
  nameEl.className = "item-name-display";
  nameEl.dataset.nameFor = instanceId;
  nameEl.textContent = itemName;
  nameEl.style.position = "absolute";
  nameEl.style.top = `${y}px`;
  nameEl.style.right = `${gridEl.offsetWidth - x + 8}px`; // 装備の左側に表示（8pxの余白）
  nameEl.style.background = "rgba(0, 0, 0, 0.8)";
  nameEl.style.color = "#fff";
  nameEl.style.padding = "4px 8px";
  nameEl.style.borderRadius = "4px";
  nameEl.style.fontSize = "12px";
  nameEl.style.whiteSpace = "nowrap";
  nameEl.style.zIndex = "20";
  nameEl.style.pointerEvents = "none"; // クリックイベントを透過
  
  gridEl.appendChild(nameEl);
}

// 装備名を非表示
function hideItemName(instanceId) {
  const gridEl = document.getElementById("pack-grid");
  if (!gridEl) return;
  
  const nameEl = gridEl.querySelector(`[data-name-for="${instanceId}"]`);
  if (nameEl) {
    nameEl.remove();
  }
}

// 装備を回転させる関数
function rotateItem(instanceId) {
  const placed = placedItems[instanceId];
  if (!placed) {
    console.error("配置情報が見つかりません:", instanceId);
    return;
  }
  
  const item = packingItems.find(i => i.id === placed.itemId);
  if (!item) {
    console.error("装備が見つかりません:", placed.itemId);
    return;
  }
  
  // 圧縮されている場合は回転不可
  if (placed.pressed) {
    console.log("圧縮済みの装備は回転できません:", item.name);
    return;
  }
  
  // 現在の配置情報
  const { x, y, rotated, pressed } = placed;
  let currentWidth = rotated ? item.size.h : item.size.w;
  let currentHeight = rotated ? item.size.w : item.size.h;
  
  // 圧縮されている場合は、現在の高さを調整
  if (pressed && item.pressable) {
    if (rotated) {
      // 回転している場合、横方向（元の縦方向）が圧縮されている（1マス減）
      currentWidth = Math.max(1, currentWidth - 1);
    } else {
      // 通常の場合、縦方向が圧縮されている（1マス減）
      currentHeight = Math.max(1, currentHeight - 1);
    }
  }
  
  // 回転後のサイズ
  const newRotated = !rotated;
  let newWidth = newRotated ? item.size.h : item.size.w;
  let newHeight = newRotated ? item.size.w : item.size.h;
  
  // 圧縮状態を維持する場合は、回転後のサイズにも圧縮を適用
  if (pressed && item.pressable) {
    if (newRotated) {
      // 回転後、横方向（元の縦方向）が圧縮される（1マス減）
      newWidth = Math.max(1, newWidth - 1);
    } else {
      // 回転後、縦方向が圧縮される（1マス減）
      newHeight = Math.max(1, newHeight - 1);
    }
  }
  
  console.log(`回転試行: ${item.name} (${currentWidth}x${currentHeight}) -> (${newWidth}x${newHeight}), 圧縮: ${pressed}`);
  
  // 一旦現在の配置をグリッドから削除
  for (let dy = 0; dy < currentHeight; dy++) {
    for (let dx = 0; dx < currentWidth; dx++) {
      if (packGrid[y + dy] && packGrid[y + dy][x + dx] === instanceId) {
        packGrid[y + dy][x + dx] = null;
      }
    }
  }
  
  // 右回転を試す（90度）
  let canRotate = true;
  let finalX = x;
  let finalY = y;
  
  // 範囲内かチェック
  if (x + newWidth > packConfig.cols || y + newHeight > packConfig.rows) {
    canRotate = false;
    console.warn("右回転後にグリッドからはみ出ます");
  }
  
  // 他の装備と重ならないかチェック
  if (canRotate) {
    for (let dy = 0; dy < newHeight; dy++) {
      for (let dx = 0; dx < newWidth; dx++) {
        if (packGrid[y + dy][x + dx] !== null) {
          canRotate = false;
          console.warn("右回転先に他の装備があります");
          break;
        }
      }
      if (!canRotate) break;
    }
    // 範囲内かチェック
    if (leftRotateX < 0 || leftRotateX + newWidth > packConfig.cols || 
        leftRotateY < 0 || leftRotateY + newHeight > packConfig.rows) {
      canRotate = false;
      console.warn(`左回転後にグリッドからはみ出ます: (${leftRotateX}, ${leftRotateY}) size:(${newWidth}x${newHeight})`);
    }
    
    // 他の装備と重ならないかチェック
    if (canRotate) {
      for (let dy = 0; dy < newHeight; dy++) {
        for (let dx = 0; dx < newWidth; dx++) {
          const checkY = leftRotateY + dy;
          const checkX = leftRotateX + dx;
          if (checkY >= 0 && checkY < packGrid.length && 
              checkX >= 0 && checkX < packGrid[0].length) {
            if (packGrid[checkY][checkX] !== null) {
              canRotate = false;
              console.warn(`左回転先に他の装備があります: (${checkX}, ${checkY})`);
              break;
            }
          }
        }
        if (!canRotate) break;
      }
    }
    
    if (canRotate) {
      finalX = leftRotateX;
      finalY = leftRotateY;
      console.log(`左回転成功: 位置調整 (${x}, ${y}) -> (${finalX}, ${finalY})`);
    }
  }
  
  if (canRotate) {
    // 回転後の位置で配置
    for (let dy = 0; dy < newHeight; dy++) {
      for (let dx = 0; dx < newWidth; dx++) {
        packGrid[finalY + dy][finalX + dx] = instanceId;
      }
    }
    
    // 配置情報を更新（圧縮状態を維持、位置は調整後のものを使用）
    placedItems[instanceId] = { itemId: placed.itemId, x: finalX, y: finalY, rotated: newRotated, pressed: pressed };
    
    // 視覚的に再描画
    const gridEl = document.getElementById("pack-grid");
    const oldItemEl = gridEl.querySelector(`[data-placed-item-id="${instanceId}"]`);
    if (oldItemEl) {
      oldItemEl.remove();
    }
    renderPlacedItem(instanceId, placed.itemId, finalX, finalY, newWidth, newHeight, newRotated);
    
    console.log(`装備「${item.name}」を回転しました`);
  } else {
    // 回転できない場合は元に戻す
    for (let dy = 0; dy < currentHeight; dy++) {
      for (let dx = 0; dx < currentWidth; dx++) {
        packGrid[y + dy][x + dx] = instanceId;
      }
    }
    console.warn("右回転も左回転もできませんでした");
  }
}

// 配置範囲のハイライト表示
function highlightPlacementArea(cellX, cellY) {
  // 一旦すべてのハイライトをクリア
  clearAllHighlights();
  
  if (!currentDraggedItem) {
    console.log("ハイライト: currentDraggedItemがnull");
    return;
  }
  
  let item = null;
  let width = 0;
  let height = 0;
  let adjustedY = cellY;
  
  if (currentDragType === "new") {
    // 新規配置の場合
    item = packingItems.find(i => i.id === currentDraggedItem);
    if (!item) return;
    
    width = item.size.w;
    height = item.size.h;
    
    // 配置位置を調整
    if (cellY === packConfig.rows - 1) {
      adjustedY = cellY - (height - 1);
      if (adjustedY < 0) adjustedY = 0;
    } else if (cellY === 0) {
      adjustedY = cellY;
    } else {
      const offset = Math.floor(height / 2);
      adjustedY = cellY - offset;
      if (adjustedY < 0) adjustedY = 0;
      if (adjustedY + height > packConfig.rows) {
        adjustedY = packConfig.rows - height;
      }
    }
  } else if (currentDragType === "placed") {
    // 既存アイテムの移動の場合
    const placed = placedItems[currentDraggedItem];
    if (!placed) return;
    
    item = packingItems.find(i => i.id === placed.itemId);
    if (!item) return;
    
    width = placed.rotated ? item.size.h : item.size.w;
    height = placed.rotated ? item.size.w : item.size.h;
    
    // 圧縮状態を考慮
    if (placed.pressed && item.pressable) {
      height = Math.max(1, height - 1);
    }
    
    // 配置位置を調整
    if (cellY === packConfig.rows - 1) {
      adjustedY = cellY - (height - 1);
      if (adjustedY < 0) adjustedY = 0;
    } else if (cellY === 0) {
      adjustedY = cellY;
    } else {
      const offset = Math.floor(height / 2);
      adjustedY = cellY - offset;
      if (adjustedY < 0) adjustedY = 0;
      if (adjustedY + height > packConfig.rows) {
        adjustedY = packConfig.rows - height;
      }
    }
  }
  
  // 配置範囲のセルをハイライト
  const gridEl = document.getElementById("pack-grid");
  if (!gridEl) return;
  
  let highlightedCount = 0;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const targetX = cellX + dx;
      const targetY = adjustedY + dy;
      
      // 範囲チェック
      if (targetX >= 0 && targetX < packConfig.cols && 
          targetY >= 0 && targetY < packConfig.rows) {
        const targetCell = gridEl.querySelector(`[data-x="${targetX}"][data-y="${targetY}"]`);
        if (targetCell) {
          targetCell.classList.add("drag-over");
          highlightedCount++;
        }
      }
    }
  }
  
  if (highlightedCount > 0) {
    console.log(`ハイライト表示: ${highlightedCount}セル at (${cellX}, ${adjustedY})`);
  }
}

// すべてのハイライトをクリア
function clearAllHighlights() {
  const gridEl = document.getElementById("pack-grid");
  if (!gridEl) return;
  
  const highlightedCells = gridEl.querySelectorAll(".drag-over");
  highlightedCells.forEach(cell => {
    cell.classList.remove("drag-over");
  });
}

function renderEmptyGrid() {
  const gridEl = document.getElementById("pack-grid");
  if (!gridEl) {
    console.error("pack-grid要素が見つかりません");
    return;
  }

  console.log("renderEmptyGrid が呼ばれました", { cols: packConfig.cols, rows: packConfig.rows, capacity: packConfig.capacity });

  if (packConfig.cols === 0 || packConfig.rows === 0) {
    console.error("グリッドサイズが設定されていません", packConfig);
    // デフォルト値で描画
    packConfig.cols = 4;
    packConfig.rows = 5;
    packConfig.capacity = 20;
  }

  // 既存の内容を完全にクリア
  gridEl.innerHTML = "";
  
  // グリッドスタイルを確実に設定
  gridEl.style.display = "grid";
  gridEl.style.position = "relative"; // 絶対配置の子要素のための基準点
  // setProperty を使用して確実に適用（ケバブケースで指定）
  gridEl.style.setProperty("grid-template-columns", `repeat(${packConfig.cols}, 40px)`, "");
  gridEl.style.setProperty("grid-template-rows", `repeat(${packConfig.rows}, 40px)`, "");
  gridEl.style.setProperty("gap", "2px", "");
  gridEl.style.setProperty("background", "#333", "");
  gridEl.style.setProperty("padding", "4px", "");
  gridEl.style.setProperty("width", "fit-content", "");
  gridEl.style.setProperty("height", "fit-content", "");
  gridEl.style.setProperty("margin", "auto", "");
  
  // 親要素（#pack-area）を中央配置にスクロール
  const packArea = gridEl.closest("#pack-area");
  if (packArea) {
    // グリッドが描画された後に中央にスクロール
    requestAnimationFrame(() => {
      const gridHeight = gridEl.offsetHeight;
      const areaHeight = packArea.clientHeight;
      if (gridHeight > areaHeight) {
        // グリッドが大きい場合は、中央にスクロール
        packArea.scrollTop = (gridHeight - areaHeight) / 2;
      } else {
        packArea.scrollTop = 0;
      }
    });
  }

  console.log(`グリッドスタイルを設定: grid-template-columns: repeat(${packConfig.cols}, 40px), grid-template-rows: repeat(${packConfig.rows}, 40px)`);

  // セルを生成
  const totalCells = packConfig.cols * packConfig.rows;
  console.log(`セルを${totalCells}個生成します (${packConfig.cols}×${packConfig.rows})`);
  
  for (let y = 0; y < packConfig.rows; y++) {
    for (let x = 0; x < packConfig.cols; x++) {
      const cell = document.createElement("div");
      cell.className = "pack-cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      
      // Pointer Events（スマホ対応）
      cell.addEventListener("pointerover", (e) => {
        if (!currentDraggedItem) return;
        
        const cellX = parseInt(cell.dataset.x);
        const cellY = parseInt(cell.dataset.y);
        highlightPlacementArea(cellX, cellY);
      });
      
      cell.addEventListener("pointerout", (e) => {
        // ポインターが離れたらハイライト解除
        if (e.pointerType === "touch") return; // タッチの場合は解除しない
        clearAllHighlights();
      });
      
      // ドラッグオーバーイベント（ドロップを許可）- 旧式も維持
      cell.addEventListener("dragover", (e) => {
        e.preventDefault();
        
        // 装備が配置される範囲をハイライト
        const cellX = parseInt(cell.dataset.x);
        const cellY = parseInt(cell.dataset.y);
        highlightPlacementArea(cellX, cellY);
      });
      
      // ドラッグリーブイベント（ハイライト解除）
      cell.addEventListener("dragleave", (e) => {
        // 一旦すべてのハイライトをクリア
        clearAllHighlights();
      });
      
      // ドロップイベント（装備を配置）
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearAllHighlights();
        
        // このセルの座標を取得
        const cellX = parseInt(cell.dataset.x);
        const cellY = parseInt(cell.dataset.y);
        console.log(`ドロップ位置: セル(${cellX}, ${cellY})`);
        
        // 装備一覧からのドロップ
        const itemId = e.dataTransfer.getData("itemId");
        if (itemId) {
          const item = packingItems.find(i => i.id === itemId);
          if (!item) return;
          
          let adjustedY = cellY;
          
          if (cellY === packConfig.rows - 1) {
            // 最下辺の列：アイテムの下端がcellYになるように調整
            adjustedY = cellY - (item.size.h - 1);
            if (adjustedY < 0) adjustedY = 0;
            console.log(`最下辺配置: y座標を${cellY}から${adjustedY}に調整（アイテム高さ: ${item.size.h}）`);
          } else if (cellY === 0) {
            // 最上辺の列：アイテムの上端がcellYになる（調整不要）
            adjustedY = cellY;
            console.log(`最上辺配置: y座標=${cellY}（アイテム上端基準）`);
          } else {
            // 中間の列：ドロップ位置がアイテムの範囲内になるように調整
            // ドロップしたセルがアイテムの中央付近になるように配置
            adjustedY = cellY;
            // アイテムの高さの半分を引いて中央配置
            const offset = Math.floor(item.size.h / 2);
            adjustedY = cellY - offset;
            // 範囲内に収める
            if (adjustedY < 0) adjustedY = 0;
            if (adjustedY + item.size.h > packConfig.rows) {
              adjustedY = packConfig.rows - item.size.h;
            }
            console.log(`中間配置: y座標を${cellY}から${adjustedY}に調整（アイテム中央基準、高さ: ${item.size.h}）`);
          }
          
          placeItemOnGrid(itemId, cellX, adjustedY);
          return;
        }
        
        // 配置済み装備の移動
        const placedInstanceId = e.dataTransfer.getData("placedInstanceId");
        if (placedInstanceId) {
          const placed = placedItems[placedInstanceId];
          if (!placed) return;
          
          const item = packingItems.find(i => i.id === placed.itemId);
          if (!item) return;
          
          // 圧縮状態を考慮した高さを計算
          let height = placed.rotated ? item.size.w : item.size.h;
          if (placed.pressed && item.pressable) {
            height = Math.max(1, height - 1);
          }
          
          let adjustedY = cellY;
          
          if (cellY === packConfig.rows - 1) {
            // 最下辺の列：アイテムの下端がcellYになるように調整
            adjustedY = cellY - (height - 1);
            if (adjustedY < 0) adjustedY = 0;
            console.log(`最下辺移動: y座標を${cellY}から${adjustedY}に調整（アイテム高さ: ${height}）`);
          } else if (cellY === 0) {
            // 最上辺の列：アイテムの上端がcellYになる（調整不要）
            adjustedY = cellY;
            console.log(`最上辺移動: y座標=${cellY}（アイテム上端基準）`);
          } else {
            // 中間の列：ドロップ位置がアイテムの範囲内になるように調整
            const offset = Math.floor(height / 2);
            adjustedY = cellY - offset;
            // 範囲内に収める
            if (adjustedY < 0) adjustedY = 0;
            if (adjustedY + height > packConfig.rows) {
              adjustedY = packConfig.rows - height;
            }
            console.log(`中間移動: y座標を${cellY}から${adjustedY}に調整（アイテム中央基準、高さ: ${height}）`);
          }
          
          moveItemOnGrid(placedInstanceId, cellX, adjustedY);
        }
      });
      
      gridEl.appendChild(cell);
    }
  }

  const createdCells = gridEl.children.length;
  console.log(`グリッドを描画しました: ${packConfig.cols}×${packConfig.rows} (容量: ${packConfig.capacity}), 作成されたセル数: ${createdCells}`);
  
  // packGridを初期化（createEmptyGridで既に初期化済みの場合はスキップ）
  if (!packGrid || packGrid.length === 0 || packGrid.length !== packConfig.rows || (packGrid[0] && packGrid[0].length !== packConfig.cols)) {
    console.log("packGridを再初期化します...");
    packGrid = Array.from({ length: packConfig.rows }, () =>
      Array(packConfig.cols).fill(null)
    );
    console.log("packGrid再初期化完了");
  } else {
    console.log("packGridは既に正しく初期化されています");
  }
  
  // packGridの状態を表示
  console.log("packGridの現在の状態:");
  for (let row = 0; row < packConfig.rows; row++) {
    let rowStr = `Row ${row}: `;
    for (let col = 0; col < packConfig.cols; col++) {
      rowStr += (packGrid[row][col] === null ? '□' : '■') + ' ';
    }
    console.log(rowStr);
  }
  
  // 実際のスタイルを確認
  const computedStyle = window.getComputedStyle(gridEl);
  console.log("実際のグリッドスタイル:", {
    gridTemplateColumns: computedStyle.gridTemplateColumns,
    gridTemplateRows: computedStyle.gridTemplateRows,
    display: computedStyle.display
  });
  
  // グリッド上でマウスが移動した時に、アイテムの上にない場合は装備名を非表示にする
  gridEl.addEventListener("mousemove", (e) => {
    const target = e.target;
    // マウスがアイテムの上にない場合、すべての装備名を非表示にする
    if (!target.classList.contains("placed-item") && target !== gridEl) {
      const allNameDisplays = gridEl.querySelectorAll(".item-name-display");
      allNameDisplays.forEach(nameEl => nameEl.remove());
    }
  });
  
  // グリッド全体でのpointermoveイベント（スマホ対応のハイライト更新）
  gridEl.addEventListener("pointermove", (e) => {
    if (!isDraggingActive || !currentDraggedItem) return;
    
    // ポインター座標からグリッドセルを取得
    const dropTarget = getGridCellFromPointer(e.clientX, e.clientY);
    if (dropTarget) {
      highlightPlacementArea(dropTarget.x, dropTarget.y);
    } else {
      clearAllHighlights();
    }
  });
  
  // グリッド外へのドロップで装備を削除
  gridEl.addEventListener("dragover", (e) => {
    // グリッド自体へのドロップを許可
    e.preventDefault();
    
    // ドラッグ中の自動スクロール処理
    handleAutoScroll(e);
  });
  
  gridEl.addEventListener("drop", (e) => {
    // 自動スクロールを停止
    stopAutoScroll();
    
    // グリッドのセル以外にドロップされた場合（padding部分など）
    if (e.target === gridEl) {
      const placedInstanceId = e.dataTransfer.getData("placedInstanceId");
      if (placedInstanceId) {
        console.log("グリッド外にドロップ:", placedInstanceId);
        removeItemFromGrid(placedInstanceId);
      }
    }
  });
  
  gridEl.addEventListener("dragleave", () => {
    // グリッドから離れたら自動スクロールを停止
    stopAutoScroll();
  });
  
  // グリッド外へのドロップで削除（グリッドの親要素）- 既存のpackAreaを再利用
  if (packArea) {
    // pack-area全体でのpointermove（プレビュー更新とハイライト）
    packArea.addEventListener("pointermove", (e) => {
      if (!isDraggingActive || !currentDraggedItem) return;
      
      // プレビュー要素の位置を更新
      updateDragPreview(e.clientX, e.clientY);
      
      // グリッドセルのハイライト更新
      const dropTarget = getGridCellFromPointer(e.clientX, e.clientY);
      if (dropTarget) {
        highlightPlacementArea(dropTarget.x, dropTarget.y);
      } else {
        clearAllHighlights();
      }
    });
    
    packArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      
      // pack-area上でも自動スクロール処理
      handleAutoScroll(e);
    });
    
    packArea.addEventListener("drop", (e) => {
      // 自動スクロールを停止
      stopAutoScroll();
      
      // pack-areaにドロップされた場合（グリッド外）
      if (e.target === packArea || e.target.id === "packing-header" || e.target.closest("#packing-header")) {
        const placedInstanceId = e.dataTransfer.getData("placedInstanceId");
        if (placedInstanceId) {
          console.log("グリッド外にドロップして削除:", placedInstanceId);
          removeItemFromGrid(placedInstanceId);
        }
      }
    });
    
    packArea.addEventListener("dragleave", () => {
      // pack-areaから離れたら自動スクロールを停止
      stopAutoScroll();
    });
  }

  renderPackingItems();
}

// 容量選択ボタンのイベントリスナーは133行目のDOMContentLoaded内で設定済み
// 重複を避けるため、この部分は削除しました

/* --------------------
   ドラッグ中の自動スクロール
-------------------- */

function handleAutoScroll(e) {
  const scene = document.getElementById("scene-packing");
  if (!scene) return;
  
  const scrollThreshold = 50; // 端から何ピクセル以内でスクロール開始するか
  const scrollSpeed = 10; // スクロール速度
  
  // マウスの位置を取得（ビューポート座標）
  const mouseY = e.clientY;
  const viewportHeight = window.innerHeight;
  
  // 自動スクロールが必要かどうかを判定
  let shouldScroll = false;
  let scrollDirection = 0; // 1: 下, -1: 上
  
  if (mouseY < scrollThreshold) {
    // 上端に近い場合は上にスクロール
    shouldScroll = true;
    scrollDirection = -1;
  } else if (mouseY > viewportHeight - scrollThreshold) {
    // 下端に近い場合は下にスクロール
    shouldScroll = true;
    scrollDirection = 1;
  }
  
  if (shouldScroll) {
    // 既存のインターバルをクリア
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
    }
    
    // 新しいインターバルを開始
    autoScrollInterval = setInterval(() => {
      scene.scrollTop += scrollSpeed * scrollDirection;
    }, 20);
  } else {
    // スクロール不要な場合はインターバルをクリア
    stopAutoScroll();
  }
}

function stopAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
}

/* --------------------
   パッキング状態の保存と復元
-------------------- */

function savePackingState() {
  // 現在のpackGridをディープコピー
  const gridCopy = packGrid.map(row => [...row]);
  
  // placedItemsをディープコピー
  const itemsCopy = {};
  for (const key in placedItems) {
    itemsCopy[key] = { ...placedItems[key] };
  }
  
  // 状態を保存
  savedPackingState = {
    packGrid: gridCopy,
    placedItems: itemsCopy,
    packConfig: { ...packConfig },
    itemInstanceCounter: itemInstanceCounter
  };
  
  console.log("パッキング状態を保存しました:", savedPackingState);
}

function restorePackingState() {
  if (!savedPackingState) {
    console.warn("保存された状態がありません");
    return;
  }
  
  // グリッドを復元
  packGrid = savedPackingState.packGrid.map(row => [...row]);
  
  // 配置済みアイテムを復元
  for (const key in placedItems) {
    delete placedItems[key];
  }
  for (const key in savedPackingState.placedItems) {
    placedItems[key] = { ...savedPackingState.placedItems[key] };
  }
  
  // 容量設定を復元
  packConfig.capacity = savedPackingState.packConfig.capacity;
  packConfig.cols = savedPackingState.packConfig.cols;
  packConfig.rows = savedPackingState.packConfig.rows;
  
  // カウンターを復元
  itemInstanceCounter = savedPackingState.itemInstanceCounter;
  
  console.log("パッキング状態を復元しました:", savedPackingState);
  
  // UIを更新
  renderEmptyGrid();
  
  // 配置済みアイテムを描画
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    const item = packingItems.find(i => i.id === placed.itemId);
    if (item) {
      // アイテムのサイズを計算
      let width = item.size.w;
      let height = item.size.h;
      
      if (placed.rotated) {
        [width, height] = [height, width];
      }
      
      if (placed.pressed && item.pressable) {
        height = Math.max(1, height - 1);
      }
      
      // アイテムを描画
      drawPlacedItem(placed.itemId, placed.x, placed.y, width, height, instanceId, placed.rotated, placed.pressed);
    }
  }
  
  updateWeightDisplay();
  
  // 装備チェックリストを表示
  showEquipmentChecklist();
}

/* --------------------
   装備チェックリスト表示
-------------------- */

function showEquipmentChecklist() {
  const checklistEl = document.getElementById("equipment-checklist");
  if (!checklistEl) return;
  
  // 現在の登山条件をevaluatePackingの形式に変換
  const conditionForEval = {
    altitude: currentCondition.altitude.label,
    weather: currentCondition.weather.label,
    season: currentCondition.season.label,
    wind: currentCondition.wind.label,
    state: currentCondition.state.label,
    plan: currentCondition.plan.label
  };
  
  // 配置済みアイテムのIDを取得
  const packedItemIds = [];
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    packedItemIds.push(placed.itemId);
  }
  
  // パッキング評価
  const result = evaluatePacking(packingItems, conditionForEval, packedItemIds);
  
  // チェックリストHTML生成
  let html = '<h3>装備<br>チェックリスト</h3><ul>';
  
  // 配置済み装備（黒文字）
  const packedItems = new Set(packedItemIds);
  const packedList = [];
  for (const itemId of packedItems) {
    const item = packingItems.find(i => i.id === itemId);
    if (item) {
      packedList.push(item.name);
    }
  }
  
  packedList.forEach(name => {
    const itemData = packingItems.find(i => i.name === name);
    const icon = itemData && itemData.iconImage ? `<img src="${itemData.iconImage}" alt="${name}" class="result-item-icon">` : "";
    html += `<li class="packed">${icon}✓ ${name}</li>`;
  });
  
  // 必要だが未配置の装備（赤文字）
  result.missingRequired.forEach(item => {
    const itemData = packingItems.find(i => i.id === item.id);
    const icon = itemData && itemData.iconImage ? `<img src="${itemData.iconImage}" alt="${item.name}" class="result-item-icon">` : "";
    if (item.shortfall) {
      html += `<li class="missing">${icon}× ${item.name}（あと${item.shortfall}個）</li>`;
    } else {
      html += `<li class="missing">${icon}× ${item.name}</li>`;
    }
  });
  
  html += '</ul>';
  
  checklistEl.innerHTML = html;
  checklistEl.classList.remove("hidden");
}

function hideEquipmentChecklist() {
  const checklistEl = document.getElementById("equipment-checklist");
  if (checklistEl) {
    checklistEl.classList.add("hidden");
  }
}

/* --------------------
   リザルト画面用装備チェックリスト表示
-------------------- */

function showResultEquipmentChecklist() {
  console.log("装備確認表示を開始");
  const checklistEl = document.getElementById("result-equipment-checklist");
  console.log("チェックリスト要素:", checklistEl);
  if (!checklistEl) {
    console.error("result-equipment-checklist要素が見つかりません");
    return;
  }
  
  // すでに表示されている場合は非表示にする（トグル）
  if (!checklistEl.classList.contains("hidden")) {
    console.log("既に表示中のため非表示にします");
    checklistEl.classList.add("hidden");
    return;
  }
  
  console.log("装備チェックリストを生成します");
  
  // 現在の登山条件をevaluatePackingの形式に変換
  const conditionForEval = {
    altitude: currentCondition.altitude.label,
    weather: currentCondition.weather.label,
    season: currentCondition.season.label,
    wind: currentCondition.wind.label,
    state: currentCondition.state.label,
    plan: currentCondition.plan.label
  };
  
  // 配置済みアイテムのIDを取得
  const packedItemIds = [];
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    packedItemIds.push(placed.itemId);
  }
  
  // パッキング評価
  const result = evaluatePacking(packingItems, conditionForEval, packedItemIds);
  
  // チェックリストHTML生成
  let html = '<h3>装備<br>チェックリスト</h3><ul>';
  
  // 配置済み装備（黒文字）
  const packedItems = new Set(packedItemIds);
  const packedList = [];
  for (const itemId of packedItems) {
    const item = packingItems.find(i => i.id === itemId);
    if (item) {
      packedList.push(item.name);
    }
  }
  
  packedList.forEach(name => {
    const itemData = packingItems.find(i => i.name === name);
    const icon = itemData && itemData.iconImage ? `<img src="${itemData.iconImage}" alt="${name}" class="result-item-icon">` : "";
    html += `<li class="packed">${icon}✓ ${name}</li>`;
  });
  
  // 必要だが未配置の装備（赤文字）
  result.missingRequired.forEach(item => {
    const itemData = packingItems.find(i => i.id === item.id);
    const icon = itemData && itemData.iconImage ? `<img src="${itemData.iconImage}" alt="${item.name}" class="result-item-icon">` : "";
    if (item.shortfall) {
      html += `<li class="missing">${icon}× ${item.name}（あと${item.shortfall}個）</li>`;
    } else {
      html += `<li class="missing">${icon}× ${item.name}</li>`;
    }
  });
  
  html += '</ul>';
  
  console.log("チェックリストHTML:", html);
  checklistEl.innerHTML = html;
  console.log("hidden クラスを削除して表示します");
  checklistEl.classList.remove("hidden");
  console.log("装備確認表示完了。classList:", checklistEl.classList.toString());
}

/* --------------------
   リザルト画面で重量情報を表示
-------------------- */

function showResultWeightInfo() {
  const weightInfoEl = document.getElementById("result-weight-info");
  if (!weightInfoEl) {
    console.error("result-weight-info 要素が見つかりません");
    return;
  }
  
  // 既に表示されている場合は非表示にする（トグル）
  if (!weightInfoEl.classList.contains("hidden")) {
    console.log("重量確認を非表示にします");
    weightInfoEl.classList.add("hidden");
    return;
  }
  
  // 装備確認を非表示にする
  const checklistEl = document.getElementById("result-equipment-checklist");
  if (checklistEl) {
    checklistEl.classList.add("hidden");
  }
  
  // 総重量を計算
  let totalWeight = 0;
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    const item = packingItems.find(i => i.id === placed.itemId);
    if (item) {
      totalWeight += item.weight;
    }
  }
  
  // バランス判定から各エリアの重量を取得
  const balanceResult = evaluatePackingBalance();
  
  // 重量情報HTML生成
  let html = `
    <div class="weight-info-content">
      <h3>重量情報</h3>
      <div class="weight-total">
        <span class="weight-label">総重量:</span>
        <span class="weight-value">${totalWeight.toFixed(2)}kg</span>
      </div>
      <div class="weight-breakdown">
        <div class="weight-area">
          <span class="weight-label">上エリア:</span>
          <span class="weight-value">${balanceResult.upperWeight.toFixed(2)}kg</span>
        </div>
        <div class="weight-area">
          <span class="weight-label">中エリア:</span>
          <span class="weight-value">${balanceResult.middleWeight.toFixed(2)}kg</span>
        </div>
        <div class="weight-area">
          <span class="weight-label">下エリア:</span>
          <span class="weight-value">${balanceResult.lowerWeight.toFixed(2)}kg</span>
        </div>
      </div>
      ${balanceResult.balanced ? 
        '<p class="balance-status good">✓ バランス良好</p>' : 
        '<p class="balance-status bad">⚠ バランス不安定</p>'}
    </div>
  `;
  
  weightInfoEl.innerHTML = html;
  weightInfoEl.classList.remove("hidden");
  console.log("重量確認表示完了");
}

/* --------------------
   装備サイズ取得（統一）
-------------------- */

function getItemSize(itemData, placedItem) {
  let width = itemData.width;
  let height = itemData.height;

  if (placedItem.rotated) [width, height] = [height, width];
  if (placedItem.pressed && itemData.pressable) {
    height = Math.ceil(height * 0.5);
  }

  return { width, height };
}

/* --------------------
   配置可能判定
-------------------- */

function canPlaceItem(itemId, x, y, rotated = false, pressed = false) {
  const item = packingItems[itemId];
  if (!item) return false;

  const size = getItemSize(item, { rotated, pressed });

  if (
    x < 0 ||
    y < 0 ||
    x + size.width > packConfig.cols ||
    y + size.height > packConfig.rows
  ) {
    return false;
  }

  for (let dy = 0; dy < size.height; dy++) {
    for (let dx = 0; dx < size.width; dx++) {
      if (packGrid[y + dy][x + dx] !== null) {
        return false;
      }
    }
  }

  return true;
}

/* --------------------
   配置確定
-------------------- */

function placeItem(itemId, x, y, rotated = false, pressed = false) {
  if (!canPlaceItem(itemId, x, y, rotated, pressed)) {
    return false;
  }

  const item = packingItems[itemId];
  const size = getItemSize(item, { rotated, pressed });

  for (let dy = 0; dy < size.height; dy++) {
    for (let dx = 0; dx < size.width; dx++) {
      packGrid[y + dy][x + dx] = itemId;
    }
  }

  placedItems[itemId] = { x, y, rotated, pressed };
  return true;
}

/* --------------------
   削除
-------------------- */

function removeItem(itemId) {
  const placed = placedItems[itemId];
  if (!placed) return false;

  const item = packingItems[itemId];
  const size = getItemSize(item, placed);

  for (let dy = 0; dy < size.height; dy++) {
    for (let dx = 0; dx < size.width; dx++) {
      packGrid[placed.y + dy][placed.x + dx] = null;
    }
  }

  delete placedItems[itemId];
  return true;
}

/* --------------------
   ②の最終成果
-------------------- */

function getPackedItemIds() {
  return Object.keys(placedItems);
}

// 確認用
function debugTestPacking() {
// ----------------------
// 2. パズル枠作成
function createPackGrid(cols, rows) {
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ occupied: false }))
  );
  return grid;
}

// ----------------------
// 3. 装備サイズ取得
function getItemSize(itemData, state) {
  if (!itemData) {
    console.error("getItemSize: itemData undefined", state);
    return { width: 0, height: 0 };
  }
  let width = itemData.size.w;
  let height = itemData.size.h;
  if (state.rotated) [width, height] = [height, width];
  if (state.pressed) height *= 0.5;
  return { width, height };
}

// ----------------------
// 4. 配置可能判定
function canPlaceItem(grid, x, y, width, height) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      if (!grid[row] || !grid[row][col] || grid[row][col].occupied) return false;
    }
  }
  return true;
}

// ----------------------
// 5. 盤面に配置
function applyPlacedItemToGrid(grid, state, itemData) {
  const size = getItemSize(itemData, state);
  for (let row = state.y; row < state.y + size.height; row++) {
    for (let col = state.x; col < state.x + size.width; col++) {
      if (grid[row] && grid[row][col]) {
        grid[row][col].occupied = true;
      }
    }
  }
}

// ----------------------
// 6. 重量計算
function calculateTotalWeight(items) {
  return items.reduce((sum, state) => {
    if (!state.itemId) {
      console.warn("itemId が存在しない:", state);
      return sum;
    }
    const itemData = packingItems.find(
  i => i.id === state.itemId
);
    if (!itemData) {
      console.warn("packingItems に存在しない:", state.itemId);
      return sum;
    }
    return sum + itemData.weight;
  }, 0);
}

// ----------------------
// 7. テスト関数
function debugTestPacking() {
  console.log("=== 複数装備パッキングテスト開始 ===");

  const grid = createPackGrid(4, 10); // 例: 4×10

  // 配置済み装備
  const placedItems = [
    { itemId: "rainwear", x: 0, y: 0, rotated: false, pressed: false },
    { itemId: "headlight", x: 2, y: 0, rotated: false, pressed: false }
  ];

  // 盤面反映
  placedItems.forEach(state => {
    console.log("state:", state);
    const itemData = packingItems.find(
      i => i && i.itemId && i.itemId.toLowerCase() === state.itemId.toLowerCase()
    );
    if (!itemData) {
      console.error("packingItems に存在しません:", state.itemId);
      return;
    }
    applyPlacedItemToGrid(grid, state, itemData);
  });

  console.log("現在の盤面:", grid);

  // 新しい装備配置テスト
  const newItemState = { itemId: "rainpants", x: 1, y: 0, rotated: false, pressed: false };
  const newItemData = packingItems.find(
    i => i && i.itemId && i.itemId.toLowerCase() === newItemState.itemId.toLowerCase()
  );
  if (newItemData) {
    const size = getItemSize(newItemData, newItemState);
    const canPlace = canPlaceItem(grid, newItemState.x, newItemState.y, size.width, size.height);
    console.log("新しい装備は配置可能か:", canPlace);
  } else {
    console.error("packingItems に存在しません:", newItemState.itemId);
  }

  // 重量計算
  const totalWeight = calculateTotalWeight(placedItems);
  console.log("合計重量:", totalWeight, "kg");

  console.log("=== テスト終了 ===");
}

// ----------------------
// 実行
debugTestPacking();
}

// ドラッグスクロール機能を設定
function setupDragScroll(container) {
  let isDown = false;
  let startX;
  let scrollLeft;
  let isDragging = false;
  
  container.addEventListener("mousedown", (e) => {
    // 装備アイテム自体のドラッグは除外
    if (e.target.closest(".packing-item")) {
      return;
    }
    
    isDown = true;
    isDragging = false;
    container.style.cursor = "grabbing";
    container.style.userSelect = "none";
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
  });
  
  container.addEventListener("mouseleave", () => {
    isDown = false;
    container.style.cursor = "grab";
  });
  
  container.addEventListener("mouseup", () => {
    isDown = false;
    container.style.cursor = "grab";
    
    // ドラッグ中だった場合、装備のドラッグを防止
    if (isDragging) {
      setTimeout(() => {
        isDragging = false;
      }, 10);
    }
  });
  
  container.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 2; // スクロール速度を2倍に
    
    // 一定以上動いたらドラッグと判定
    if (Math.abs(walk) > 5) {
      isDragging = true;
    }
    
    container.scrollLeft = scrollLeft - walk;
  });
  
  // タッチイベント（モバイル対応）
  let touchStartX;
  let touchScrollLeft;
  
  container.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].pageX - container.offsetLeft;
    touchScrollLeft = container.scrollLeft;
  }, { passive: true });
  
  container.addEventListener("touchmove", (e) => {
    if (!touchStartX) return;
    
    const x = e.touches[0].pageX - container.offsetLeft;
    const walk = (x - touchStartX) * 2;
    container.scrollLeft = touchScrollLeft - walk;
  }, { passive: true });
  
  container.addEventListener("touchend", () => {
    touchStartX = null;
  });
  
  // 初期カーソルスタイル
  container.style.cursor = "grab";
}

function renderPackingItems() {
  const container = document.getElementById("packing-items");
  if (!container) {
    console.error("packing-items要素が見つかりません");
    return;
  }

  // ドラッグスクロール機能を追加（1回だけ設定）
  if (!container.dataset.scrollEnabled) {
    setupDragScroll(container);
    container.dataset.scrollEnabled = "true";
  }

  // 装備データは window.packingItems に集約して参照する（TDZ回避のため、直接 packingItems には触れない）
  const items = window.packingItems;
  if (!items || items.length === 0) {
    console.error("装備データが見つかりません", { window: window.packingItems });
    return;
  }

  // ★ packing-items 内に packing-item-list を作成（無ければ）
  let list = container.querySelector(".packing-item-list");
  if (!list) {
    list = document.createElement("div");
    list.className = "packing-item-list";
    container.appendChild(list);
  }

  // 中身をリセット
  list.innerHTML = "";

  // 各装備アイテムを追加（装備データの順番通りに）
  items.forEach(item => {
    const itemEl = document.createElement("div");
    itemEl.className = "packing-item";
    itemEl.dataset.itemId = item.id;
    itemEl.draggable = true; // ドラッグ可能にする

    // 装備一覧ではiconImageを使用
    const img = document.createElement("img");
    img.src = item.iconImage || "";
    img.alt = item.name || "";
    console.log(`装備一覧に追加: ${item.name} - ${img.src}`);
    img.onerror = function() {
      // 画像が読み込めない場合のフォールバック
      this.style.display = "none";
      const fallback = document.createElement("div");
      fallback.textContent = "📦";
      fallback.style.fontSize = "24px";
      itemEl.insertBefore(fallback, itemEl.firstChild);
    };

    const label = document.createElement("div");
    label.className = "packing-item-label";
    label.innerHTML = item.name || "";

    itemEl.appendChild(img);
    itemEl.appendChild(label);

    // --- ツールチップ表示用 ---
    const tooltip = document.createElement("div");
    tooltip.className = "packing-item-tooltip hidden";
    const totalCells = item.size.w * item.size.h;
    tooltip.innerHTML = ` ${totalCells}マス<br> ${item.weight}kg`;
    itemEl.appendChild(tooltip);

    // PC: マウスオーバーで表示
    itemEl.addEventListener("mouseenter", () => {
      tooltip.classList.remove("hidden");
    });
    itemEl.addEventListener("mouseleave", () => {
      tooltip.classList.add("hidden");
    });

    // スマホ: 長押しで表示（touchstart→一定時間後に表示、touchendで非表示）
    let touchTimer = null;
    itemEl.addEventListener("touchstart", (e) => {
      touchTimer = setTimeout(() => {
        tooltip.classList.remove("hidden");
      }, 500); // 0.5秒長押しで表示
    });
    itemEl.addEventListener("touchend", (e) => {
      clearTimeout(touchTimer);
      tooltip.classList.add("hidden");
    });
    itemEl.addEventListener("touchcancel", (e) => {
      clearTimeout(touchTimer);
      tooltip.classList.add("hidden");
    });

    // Pointer Eventsでドラッグ操作を実装（スマホ対応）
    let isDragging = false;
    itemEl.addEventListener("pointerdown", (e) => {
      isDragging = true;
      isDraggingActive = true;
      currentDraggedItem = item.id;
      currentDragType = "new";
      itemEl.classList.add("dragging");
      itemEl.setPointerCapture(e.pointerId);
      // プレビュー要素を作成
      createDragPreview(item, false);
      updateDragPreview(e.clientX, e.clientY);
      console.log("装備一覧: ドラッグ開始", item.name);
      e.preventDefault();
    });
    itemEl.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      updateDragPreview(e.clientX, e.clientY);
      const dropTarget = getGridCellFromPointer(e.clientX, e.clientY);
      if (dropTarget) {
        highlightPlacementArea(dropTarget.x, dropTarget.y);
      } else {
        clearAllHighlights();
      }
    });
    itemEl.addEventListener("pointerup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      isDraggingActive = false;
      removeDragPreview();
      const dropTarget = getGridCellFromPointer(e.clientX, e.clientY);
      if (dropTarget) {
        handleItemDrop(dropTarget.x, dropTarget.y);
      }
      itemEl.classList.remove("dragging");
      currentDraggedItem = null;
      currentDragType = null;
      clearAllHighlights();
      itemEl.releasePointerCapture(e.pointerId);
    });
    itemEl.addEventListener("pointercancel", (e) => {
      isDragging = false;
      isDraggingActive = false;
      removeDragPreview();
      itemEl.classList.remove("dragging");
      currentDraggedItem = null;
      currentDragType = null;
      clearAllHighlights();
    });
    // 旧式のdragイベントも残す（互換性のため）
    itemEl.draggable = true;
    itemEl.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("itemId", item.id);
      currentDraggedItem = item.id;
      currentDragType = "new";
      isDraggingActive = true;
      itemEl.classList.add("dragging");
    });
    itemEl.addEventListener("dragend", (e) => {
      itemEl.classList.remove("dragging");
      currentDraggedItem = null;
      currentDragType = null;
      isDraggingActive = false;
      clearAllHighlights();
    });
    list.appendChild(itemEl);
  });

  console.log(`装備一覧を表示しました: ${items.length}個`);
}

// 配置済み装備を可視化する簡易UI
function renderPackingUI(grid, placedItems) {
  const container = document.getElementById("test-packing-ui");
  container.innerHTML = ""; // 既存をクリア

  const rows = grid.length;
  const cols = grid[0].length;

  for (let r = 0; r < rows; r++) {
    const rowDiv = document.createElement("div");
    rowDiv.style.display = "flex";
    for (let c = 0; c < cols; c++) {
      const cellDiv = document.createElement("div");
      cellDiv.style.width = "30px";
      cellDiv.style.height = "30px";
      cellDiv.style.border = "1px solid #999";
      cellDiv.style.boxSizing = "border-box";

      if (grid[r][c].occupied) {
        // 配置済み装備を色分け
        let occupyingItem = placedItems.find(item => {
          const itemSize = getItemSize(
            packingItems.find(i => i.itemId === item.itemId),
            item
          );
          return (
            r >= item.y &&
            r < item.y + itemSize.height &&
            c >= item.x &&
            c < item.x + itemSize.width
          );
        });
        cellDiv.style.backgroundColor = occupyingItem ? "#4CAF50" : "#ccc";
      } else {
        cellDiv.style.backgroundColor = "#fff";
      }

      rowDiv.appendChild(cellDiv);
    }
    container.appendChild(rowDiv);
  }

  // 重量表示
  const weightDiv = document.getElementById("test-packing-weight");
  weightDiv.textContent = "合計重量: " + calculateTotalWeight(placedItems).toFixed(2) + " kg";
}


// テスト関数を更新
function debugTestPackingUI() {
  console.log("=== 配置済み装備 UI テスト開始 ===");

  const grid = createPackGrid(40); // 4×10
  const placedItems = [
    { itemId: "rainwear", x: 0, y: 0, rotated: false, pressed: false },
    { itemId: "headlight", x: 2, y: 0, rotated: false, pressed: false }
  ];

  // 盤面に配置
  placedItems.forEach(state => {
    const itemData = packingItems.find(i => i.itemId === state.itemId);
    if (itemData) applyPlacedItemToGrid(grid, state, itemData);
  });

  renderPackingUI(grid, placedItems);

  console.log("=== テスト終了 ===");
}

// packingItems は既に定義済みと仮定
// 例:
// const packingItems = [
//   {id: "rainwear", name: "レインウェア", size: {width:1,height:2}, weight:0.25, pressable:true, rotated:false, pressed:false},
//   ...
// ];

// DOM 読み込み後に実行する
// ※ 以下のテスト用関数は開発時専用のため、実行を無効化
// window.addEventListener("DOMContentLoaded", () => {
//   debugSinglePackingUI();
//   debugTestPackingUI();
// });

// ---------------------
// 単一装備パッキングUIテスト
function debugSinglePackingUI() {
  // 開発用テスト関数（現在は未使用）
}

// ---------------------
// 複数装備パッキングUIテスト
function debugTestPackingUI() {
  // 開発用テスト関数（現在は未使用）
}


/* --------------------
   パッキングリザルト表示
-------------------- */

function showPackingResult() {
  // 配置済みアイテムのIDを取得（水分など複数個配置される装備に対応）
  const packedItemIds = [];
  for (const instanceId in placedItems) {
    const placed = placedItems[instanceId];
    packedItemIds.push(placed.itemId); // 重複を含めてすべて追加
  }

  console.log("配置済みアイテム:", packedItemIds);
  console.log("登山条件:", currentCondition);

  // 登山条件をevaluatePackingの形式に変換
  const conditionForEval = {
    altitude: currentCondition.altitude.label,
    weather: currentCondition.weather.label,
    season: currentCondition.season.label,
    wind: currentCondition.wind.label,
    state: currentCondition.state.label,
    plan: currentCondition.plan.label
  };

  // パッキング評価
  const result = evaluatePacking(packingItems, conditionForEval, packedItemIds);

  // ランク判定（不足している必要な装備の数で判定）
  const missingCount = result.missingRequired.length;
  let rank, rankColor;
  if (missingCount === 0) {
    rank = 'S';
    rankColor = '#FFD700'; // ゴールド
  } else if (missingCount <= 2) {
    rank = 'A';
    rankColor = '#4CAF50'; // グリーン
  } else if (missingCount <= 5) {
    rank = 'B';
    rankColor = '#FF9800'; // オレンジ
  } else {
    rank = 'C';
    rankColor = '#f44336'; // レッド
  }

  // 空きマスをカウント
  let emptySpaces = 0;
  for (let row = 0; row < packGrid.length; row++) {
    for (let col = 0; col < packGrid[row].length; col++) {
      if (packGrid[row][col] === null) {
        emptySpaces++;
      }
    }
  }
  
  // 空きマスが8マス以上ある場合のコメント
  const spaceComment = emptySpaces >= 8 ? `
    <div class="space-comment">
      <div>ザック内の空間に</div>
      <div>余裕があります</div>
    </div>
  ` : '';
  
  // バランス判定
  const balanceResult = evaluatePackingBalance();
  const balanceComment = !balanceResult.balanced ? `
    <div class="balance-comment">
      <div>バランスが不安定です</div>
    </div>
  ` : '';

  // リザルト画面に結果を表示
  const resultContent = document.getElementById("result-content");
  resultContent.innerHTML = `
    <div class="rank-and-comment">
      <div class="rank-display" style="background-color: ${rankColor};">
        <div class="rank-label">ランク</div>
        <div class="rank-value">${rank}</div>
      </div>
      ${spaceComment}
      ${balanceComment}
    </div>
    
    <div class="missing-items-container">
      ${result.missingRequired.length > 0 ? `
        <div class="missing-items-section">
          <h4>必要な装備（未装備）</h4>
          <ul>
            ${result.missingRequired.map(item => {
              let itemsArr = window.packingItems || (typeof packingItems !== 'undefined' ? packingItems : []);
              const itemData = itemsArr.find(i => i.id === item.id);
              const icon = itemData && itemData.iconImage ? `<img src="${itemData.iconImage}" alt="${item.name}" class="result-item-icon">` : "";
              if (item.shortfall) {
                return `<li>${icon}<span class="item-name">${item.name}</span><span class="item-shortage">あと${item.shortfall}個</span></li>`;
              }
              return `<li>${icon}${item.name}</li>`;
            }).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${result.missingOptional.length > 0 ? `
        <div class="missing-items-section">
          <h4>あってもいい装備（未装備）</h4>
          <ul>
            ${result.missingOptional.map(item => {
              let itemsArr = window.packingItems || (typeof packingItems !== 'undefined' ? packingItems : []);
              const itemData = itemsArr.find(i => i.id === item.id);
              const icon = itemData && itemData.iconImage ? `<img src="${itemData.iconImage}" alt="${item.name}" class="result-item-icon">` : "";
              if (item.shortfall) {
                return `<li>${icon}<span class="item-name">${item.name}</span><span class="item-shortage">あと${item.shortfall}個</span></li>`;
              }
              return `<li>${icon}${item.name}</li>`;
            }).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${result.missingRequired.length === 0 && result.missingOptional.length === 0 ? `
        <div class="missing-items-section">
          <p style="color: #4CAF50; font-weight: bold;">すべての装備が揃っています！</p>
        </div>
      ` : ''}
    </div>
    
    <div class="result-buttons-container">
      <div class="result-buttons">
        <button id="btn-result-back-menu">メニューに戻る</button>
        <button id="btn-result-condition">登山条件確認</button>
        <button id="btn-result-review">装備したもの確認</button>
        <button id="btn-result-weight">重量確認</button>
      </div>
      
      <!-- 装備チェックリスト表示エリア（装備確認ボタンの下） -->
      <div id="result-equipment-checklist" class="hidden"></div>
      
      <!-- 重量確認表示エリア -->
      <div id="result-weight-info" class="hidden"></div>
    </div>
  `;

  // リザルト画面に切り替え
  changeScene("packing-result");

  // DOMが更新された後にイベントリスナーを設定
  requestAnimationFrame(() => {
    const btnResultBackMenu = document.getElementById("btn-result-back-menu");
    const btnResultCondition = document.getElementById("btn-result-condition");
    const btnResultReview = document.getElementById("btn-result-review");
    const btnResultWeight = document.getElementById("btn-result-weight");
    
    if (btnResultBackMenu) {
      btnResultBackMenu.addEventListener("click", () => {
        console.log("リザルト画面からメニューに戻る");
        changeScene("menu");
      });
    }
    
    if (btnResultCondition) {
      btnResultCondition.addEventListener("click", () => {
        const checklistEl = document.getElementById("result-equipment-checklist");
        if (!checklistEl) return;
        // すでに表示中なら非表示
        if (!checklistEl.classList.contains("hidden")) {
          checklistEl.classList.add("hidden");
          return;
        }
        // 登山条件をHTMLで表示
        let html = '<h3>今回の登山条件</h3><ul>';
        html += `<li>標高: ${getDisplayLabel(currentCondition.altitude.label)}</li>`;
        html += `<li>天気: ${getDisplayLabel(currentCondition.weather.label)}</li>`;
        html += `<li>季節: ${getDisplayLabel(currentCondition.season.label)}</li>`;
        html += `<li>風: ${getDisplayLabel(String(currentCondition.wind.label))}</li>`;
        html += `<li>状態: ${getDisplayLabel(currentCondition.state.label)}</li>`;
        html += `<li>山行: ${getDisplayLabel(currentCondition.plan.label)}</li>`;
        html += '</ul>';
        checklistEl.innerHTML = html;
        checklistEl.classList.remove("hidden");
      });
    }
    
    if (btnResultReview) {
      btnResultReview.addEventListener("click", () => {
        console.log("装備確認を表示");
        showResultEquipmentChecklist();
      });
    }
    
    if (btnResultWeight) {
      btnResultWeight.addEventListener("click", () => {
        console.log("重量確認を表示");
        showResultWeightInfo();
      });
    }
  });
}

/* --------------------
   スマートフォン対応：画面向きチェック
-------------------- */
function checkOrientation() {
  const isPortrait = window.innerHeight > window.innerWidth;
  const rotateWarning = document.getElementById("rotate-warning");
  if (rotateWarning) {
    rotateWarning.style.display = isPortrait ? "flex" : "none";
  }
}

window.addEventListener("resize", checkOrientation);
window.addEventListener("orientationchange", checkOrientation);
checkOrientation();

/* --------------------
   スマートフォン対応：画面全体の動的スケール調整
   設計解像度: 1280x720（横画面）
   PC（1280x720以上）: scale(1) = そのまま表示
   スマホ（それ以下）: transform: scale() で等比率縮小
-------------------- */
function adjustGameScale() {
  const uiFrame = document.getElementById("ui-frame");
  if (!uiFrame) return;
  
  // 設計解像度（PC版の完成サイズ）
  const BASE_WIDTH = 1280;
  const BASE_HEIGHT = 720;
  
  // 現在の画面サイズ
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  // 縦向きの場合はスケール調整しない（警告表示のため）
  const isPortrait = screenHeight > screenWidth;
  if (isPortrait) {
    uiFrame.style.transform = "scale(1)";
    return;
  }
  
  // スケール計算：画面サイズ / 設計解像度
  const scaleX = screenWidth / BASE_WIDTH;
  const scaleY = screenHeight / BASE_HEIGHT;
  const scale = Math.min(scaleX, scaleY); // 縦横比を保って縮小
  
  // PC（1280x720以上）ではscale(1)、スマホでは縮小
  uiFrame.style.transform = `scale(${scale})`;
}

// 初回実行とリサイズ時に実行
window.addEventListener("resize", adjustGameScale);
window.addEventListener("orientationchange", adjustGameScale);
adjustGameScale();

/* --------------------
   スマートフォン対応：タッチ操作サポート
-------------------- */
let touchDragData = {
  isDragging: false,
  startX: 0,
  startY: 0,
  currentElement: null,
  draggedElement: null,
  longPressTimer: null,
  touchMoved: false,
  isLongPress: false
};

// タッチでドラッグ開始（長押し対応）
function setupTouchDrag() {
  const packingItemsContainer = document.getElementById("packing-items");
  const packGrid = document.getElementById("pack-grid");
  
  // 装備リストのタッチ対応
  if (packingItemsContainer) {
    packingItemsContainer.addEventListener("touchstart", handleTouchStart, { passive: false });
  }
  
  // グリッドのタッチ対応
  if (packGrid) {
    packGrid.addEventListener("touchstart", handleTouchStartOnGrid, { passive: false });
  }
  
  // 共通のタッチムーブ・タッチエンド
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: false });
  document.addEventListener("touchcancel", handleTouchEnd, { passive: false });
}

// 装備リストのタッチ開始
function handleTouchStart(e) {
  const target = e.target.closest(".packing-item");
  if (!target) return;
  
  touchDragData.touchMoved = false;
  touchDragData.isLongPress = false;
  touchDragData.currentElement = target;
  touchDragData.startX = e.touches[0].clientX;
  touchDragData.startY = e.touches[0].clientY;
  
  // 長押しタイマー（500ms）
  touchDragData.longPressTimer = setTimeout(() => {
    touchDragData.isLongPress = true;
    e.preventDefault(); // ブラウザのデフォルト動作を防止
    startDragFromTouch(target, "new");
  }, 500);
}

// グリッド上の配置済みアイテムのタッチ開始
function handleTouchStartOnGrid(e) {
  const target = e.target.closest(".placed-item");
  if (!target) return;
  
  touchDragData.touchMoved = false;
  touchDragData.isLongPress = false;
  touchDragData.currentElement = target;
  touchDragData.startX = e.touches[0].clientX;
  touchDragData.startY = e.touches[0].clientY;
  
  // 長押しタイマー（500ms）でドラッグ開始、短いタップで回転
  touchDragData.longPressTimer = setTimeout(() => {
    touchDragData.isLongPress = true;
    e.preventDefault(); // ブラウザのデフォルト動作を防止
    const instanceId = target.dataset.instanceId;
    if (instanceId) {
      // 装備名を表示
      const placed = placedItems[instanceId];
      if (placed) {
        const item = packingItems.find(i => i.id === placed.itemId);
        if (item) {
          showItemName(target, item.name, placed.x, placed.y, placed.width);
        }
      }
      startDragFromTouch(target, "placed", instanceId);
    }
  }, 500);
}

// タッチドラッグ開始
function startDragFromTouch(element, dragType, instanceId = null) {
  touchDragData.isDragging = true;
  element.style.opacity = "0.5";
  
  // パッキング画面でのみドラッグ中のブラウザのタッチ操作（スクロール、スワイプ等）を無効化
  if (document.body.classList.contains("packing-mode")) {
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "none";
  }
  
  if (dragType === "new") {
    const itemId = element.dataset.itemId;
    currentDraggedItem = itemId;
    currentDragType = "new";
    element.classList.add("dragging");
  } else if (dragType === "placed") {
    currentDraggedItem = instanceId;
    currentDragType = "placed";
  }
  
  touchDragData.draggedElement = element;
}

// タッチムーブ
function handleTouchMove(e) {
  if (!touchDragData.currentElement) return;
  
  const deltaX = Math.abs(e.touches[0].clientX - touchDragData.startX);
  const deltaY = Math.abs(e.touches[0].clientY - touchDragData.startY);
  
  // 10px以上動いたら移動と判定
  if (deltaX > 10 || deltaY > 10) {
    touchDragData.touchMoved = true;
    
    // 長押し前の移動ならタイマーをキャンセル
    if (!touchDragData.isLongPress && touchDragData.longPressTimer) {
      clearTimeout(touchDragData.longPressTimer);
      touchDragData.longPressTimer = null;
    }
  }
  
  // ドラッグ中ならハイライト処理
  if (touchDragData.isDragging) {
    e.preventDefault();
    
    // タッチ位置の要素を取得
    const touch = e.touches[0];
    const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = elementAtPoint?.closest(".pack-cell");
    
    if (cell) {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);
      handleCellDragOver(row, col);
    }
  }
}

// タッチエンド
function handleTouchEnd(e) {
  // 長押しタイマーをクリア
  if (touchDragData.longPressTimer) {
    clearTimeout(touchDragData.longPressTimer);
    touchDragData.longPressTimer = null;
  }
  
  // ドラッグ中だった場合
  if (touchDragData.isDragging) {
    e.preventDefault();
    
    // ドロップ位置を判定
    const touch = e.changedTouches[0];
    const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = elementAtPoint?.closest(".pack-cell");
    
    if (cell) {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);
      handleCellDrop(row, col);
    }
    
    // ドラッグ終了処理
    if (touchDragData.draggedElement) {
      touchDragData.draggedElement.style.opacity = "1";
      touchDragData.draggedElement.classList.remove("dragging");
    }
    
    currentDraggedItem = null;
    currentDragType = null;
    clearAllHighlights();
    
  } else if (!touchDragData.touchMoved && touchDragData.currentElement) {
    // 短いタップ（移動なし、長押しでもない）= クリック扱い
    const target = touchDragData.currentElement;
    
    // グリッド上のアイテムなら回転
    if (target.classList.contains("placed-item")) {
      const instanceId = target.dataset.instanceId;
      if (instanceId) {
        rotateItem(instanceId);
      }
    }
  }
  
  // リセット
  touchDragData.isDragging = false;
  touchDragData.currentElement = null;
  touchDragData.draggedElement = null;
  touchDragData.touchMoved = false;
  touchDragData.isLongPress = false;
  
  // パッキング画面でのみドラッグ終了後にタッチ操作を復元
  // （他の画面では画面固定をしていないため、復元不要）
  if (document.body.classList.contains("packing-mode")) {
    document.body.style.touchAction = "";
    document.body.style.overscrollBehavior = "";
  }
}

// ハイライト処理（タッチ用）
function handleCellDragOver(row, col) {
  if (!currentDraggedItem) return;
  
  clearAllHighlights();
  
  let item;
  if (currentDragType === "new") {
    item = packingItems.find(i => i.id === currentDraggedItem);
    if (!item) return;
    
    const placed = {
      itemId: item.id,
      x: col,
      y: row,
      width: item.width,
      height: item.height,
      rotated: false
    };
    
    const gridEl = document.getElementById("pack-grid");
    if (canPlaceItem(placed)) {
      highlightCells(placed, gridEl, true);
    } else {
      highlightCells(placed, gridEl, false);
    }
    
  } else if (currentDragType === "placed") {
    const placed = placedItems[currentDraggedItem];
    if (!placed) return;
    
    const newPlaced = { ...placed, x: col, y: row };
    
    const gridEl = document.getElementById("pack-grid");
    if (canPlaceItem(newPlaced, currentDraggedItem)) {
      highlightCells(newPlaced, gridEl, true);
    } else {
      highlightCells(newPlaced, gridEl, false);
    }
  }
}

// ドロップ処理（タッチ用）
function handleCellDrop(row, col) {
  if (!currentDraggedItem) return;
  
  if (currentDragType === "new") {
    const item = packingItems.find(i => i.id === currentDraggedItem);
    if (!item) return;
    
    const newPlaced = {
      itemId: item.id,
      x: col,
      y: row,
      width: item.width,
      height: item.height,
      rotated: false
    };
    
    if (canPlaceItem(newPlaced)) {
      const instanceId = `instance-${itemInstanceCounter++}`;
      placedItems[instanceId] = newPlaced;
      updatePackGrid();
      renderPlacedItem(instanceId, newPlaced);
    }
    
  } else if (currentDragType === "placed") {
    const placed = placedItems[currentDraggedItem];
    if (!placed) return;
    
    const newPlaced = { ...placed, x: col, y: row };
    
    if (canPlaceItem(newPlaced, currentDraggedItem)) {
      placedItems[currentDraggedItem] = newPlaced;
      updatePackGrid();
      const itemEl = document.querySelector(`[data-instance-id="${currentDraggedItem}"]`);
      if (itemEl) {
        itemEl.remove();
      }
      renderPlacedItem(currentDraggedItem, newPlaced);
      hideItemName(currentDraggedItem);
    }
  }
  
  clearAllHighlights();
}

// 配置済みアイテムの長押しで装備名表示（タッチ用）
function setupTouchLongPressForItemName() {
  const packGrid = document.getElementById("pack-grid");
  if (!packGrid) return;
  
  let touchTimer = null;
  let touchTarget = null;
  
  packGrid.addEventListener("touchstart", (e) => {
    const target = e.target.closest(".placed-item");
    if (!target || touchDragData.isDragging) return;
    
    touchTarget = target;
    const instanceId = target.dataset.instanceId;
    
    // 長押しで装備名表示（ドラッグしない場合）
    touchTimer = setTimeout(() => {
      if (!touchDragData.touchMoved && instanceId) {
        const placed = placedItems[instanceId];
        if (placed) {
          const item = packingItems.find(i => i.id === placed.itemId);
          if (item) {
            showItemName(target, item.name, placed.x, placed.y, placed.width);
          }
        }
      }
    }, 1000);
  });
  
  packGrid.addEventListener("touchmove", () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  });
  
  packGrid.addEventListener("touchend", () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  });
}

// 初期化時にタッチサポートを設定
document.addEventListener("DOMContentLoaded", () => {
  setupTouchDrag();
  setupTouchLongPressForItemName();
});

// 開発中のみ呼び出す
debugSinglePackingUI()
// 開発中のみ呼び出す
debugTestPackingUI();
// 開発中のみ呼び出す
debugTestPacking();


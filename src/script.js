/* ==================== Firebase Config ==================== */
const firebaseConfig = {
  apiKey: "AIzaSyBi-VIoa3swbrQqoeik9y5FtOHheJ3x8KA",
  authDomain: "truth-or-dare-online-v2.firebaseapp.com",
  databaseURL: "https://truth-or-dare-online-v2-default-rtdb.firebaseio.com",
  projectId: "truth-or-dare-online-v2",
  storageBucket: "truth-or-dare-online-v2.firebasestorage.app",
  messagingSenderId: "144397063274",
  appId: "1:144397063274:web:5c9e0d2161a1fcdd296613",
  measurementId: "G-86LC0DZ2RS",
};

let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.warn("Firebase Init Error:", e);
}

/* ==================== Network Module ==================== */
const NetworkModule = {
  roomId: null,
  isHost: false,
  nickname: "匿名",
  roomRef: null,
  lastProcessedSpinTrigger: 0,
  lastProcessedResultTime: 0,
  pendingResult: null,
  nextSpinner: null,

  createRoom() {
    if (!db) return this.startOffline();
    const name =
      document.getElementById("nickname-input").value.trim() || "Host";
    this.nickname = name;
    this.isHost = true;
    this.roomId = Math.floor(100000 + Math.random() * 900000).toString();

    this.roomRef = db.ref("rooms/" + this.roomId);

    // 使用物件結構儲存玩家，以便處理 onDisconnect
    // 初始化房間，將 LocalStorage 的資料推上去
    const initialData = {
      host: name,
      status: "waiting",
      spinTrigger: 0,
      currentResult: null,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      players: {}, // 初始化為空物件，enterGame 會加入房主
      questions: DataModule.state.questions, // Sync questions
      settings: DataModule.state.settings, // Sync settings
      history: [],
      stats: {},
      nextSpinner: null,
    };

    this.roomRef.set(initialData).then(() => {
      this.enterGame();
    });
  },

  joinRoom() {
    if (!db) return this.startOffline();
    const code = document.getElementById("room-code-input").value.trim();
    const name =
      document.getElementById("nickname-input").value.trim() || "Guest";
    if (code.length !== 6) return alert("請輸入正確的6位數房間碼");

    this.roomId = code;
    this.nickname = name;
    this.isHost = false;
    this.roomRef = db.ref("rooms/" + this.roomId);

    this.roomRef.once("value").then((snapshot) => {
      if (snapshot.exists()) {
        this.enterGame();
      } else {
        alert("房間不存在！");
      }
    });
  },

  startOffline() {
    this.isHost = true;
    this.roomId = "LOCAL";
    this.enterGame();
  },

  enterGame() {
    document.getElementById("login-overlay").classList.add("hidden");
    const roomText = this.isHost ? `${this.roomId} (Host)` : `${this.roomId}`;
    document.getElementById("room-display").innerText =
      this.roomId === "LOCAL" ? "OFFLINE" : roomText;

    if (this.roomId !== "LOCAL") {
      document.getElementById("status-indicator").classList.add("online");
      document.getElementById("qr-btn").style.display = "inline-block";

      // 設定玩家上線與斷線自動移除
      // 替換不合法字元以作為 Key
      const safeName = this.nickname.replace(/[.$#\[\]\/]/g, "_");
      const playerRef = this.roomRef.child("players/" + safeName);
      playerRef.set({
        name: this.nickname,
        isHost: this.isHost,
        weight: 1,
      });
      playerRef.onDisconnect().remove();

      this.listenForUpdates();
      this.listenForReactions();
    } else {
      // 單機模式：從 local storage 初始化
      DataModule.loadFromStorage();
    }

    UIModule.updateRoleUI();

    // 如果是 Host，每次本地數據變動都上傳
    // 如果是 Guest，addPlayer 只是為了更新本地顯示，真實同步在 listenForUpdates
    if (!this.isHost && this.roomId !== "LOCAL") {
      // Guest specific init if needed
    } else {
      // Host: sync local players to UI
      UIModule.renderPlayerList();
    }
  },

  listenForUpdates() {
    // 監聽所有重要資料
    this.roomRef.on("value", (snap) => {
      const val = snap.val();
      if (!val) return;

      // Sync Players
      // 將 Firebase 的物件結構 { key: {name: "A"}, key2: {name: "B"} } 轉回陣列 ["A", "B"]
      // v3.1 Update: Sync objects {name, weight}
      const serverPlayersObj = val.players || {};
      const serverPlayersList = Object.values(serverPlayersObj).map((p) => ({
        name: p.name,
        weight: p.weight !== undefined ? p.weight : 1,
      }));

      if (
        JSON.stringify(DataModule.state.players) !==
        JSON.stringify(serverPlayersList)
      ) {
        DataModule.state.players = serverPlayersList;
        UIModule.renderPlayerList();
      }

      // Sync Questions
      const serverQuestions = val.questions || [];
      if (
        JSON.stringify(DataModule.state.questions) !==
        JSON.stringify(serverQuestions)
      ) {
        DataModule.state.questions = serverQuestions;
        DataModule.saveToStorage();
        UIModule.renderQuestionList();
      }

      // Sync Settings
      if (!this.isHost && val.settings) {
        DataModule.state.settings = val.settings;
        UIModule.renderSettingsValues();
        WheelModule.generateSegments();
        WheelModule.draw();
      }

      // Sync History
      if (val.history) {
        DataModule.state.history = val.history;
        UIModule.renderHistory();
      }

      // Sync Stats
      if (val.stats) {
        DataModule.state.stats = val.stats;
        // Only re-render if active panel is leaderboard to save performance
        if (
          document
            .getElementById("panel-leaderboard")
            .classList.contains("active")
        ) {
          UIModule.renderLeaderboard();
        }
      }

      // Sync Spin
      if (val.spinTrigger && val.spinTrigger > this.lastProcessedSpinTrigger) {
        this.lastProcessedSpinTrigger = val.spinTrigger;
        if (val.spinTrigger > Date.now() - 10000 && !WheelModule.isSpinning) {
          WheelModule.spin(false);
        }
      }

      // Sync Result
      if (
        !this.isHost &&
        val.currentResult &&
        val.currentResult.timestamp > this.lastProcessedResultTime
      ) {
        this.lastProcessedResultTime = val.currentResult.timestamp;
        if (WheelModule.isSpinning) {
          this.pendingResult = val.currentResult;
        } else {
          UIModule.showResult(
            val.currentResult.type,
            val.currentResult.content,
            val.currentResult.player
          );
        }
      }

      // Sync Next Spinner
      if (val.nextSpinner !== undefined) {
        this.nextSpinner = val.nextSpinner;
        UIModule.updateSpinPermission();
      }
    });
  },

  listenForReactions() {
    // Listen for new reactions
    // Use limitToLast(1) to avoid fetching huge history,
    // and check timestamp to ignore old ones on initial load.
    this.roomRef
      .child("reactions")
      .limitToLast(1)
      .on("child_added", (snap) => {
        const val = snap.val();
        if (!val) return;
        // Allow 5 seconds buffer. If older than 5s, ignore.
        if (Date.now() - val.ts < 5000) {
          UIModule.showReaction(val.emoji);
        }
      });
  },

  leaveRoom() {
    if (this.roomId !== "LOCAL" && this.roomRef) {
      // 移除線上玩家節點
      const safeName = this.nickname.replace(/[.$#\[\]\/]/g, "_");
      this.roomRef.child("players/" + safeName).remove();
      this.roomRef.off(); // 停止監聽
    }

    this.roomId = null;
    this.isHost = false;
    this.roomRef = null;

    // 重置 UI 與狀態
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("room-display").innerText = "OFFLINE";
    document.getElementById("status-indicator").classList.remove("online");
    document.getElementById("qr-btn").style.display = "none";
  },

  sendReaction(emoji) {
    if (this.roomId !== "LOCAL" && this.roomRef) {
      this.roomRef.child("reactions").push({
        emoji: emoji,
        sender: this.nickname,
        ts: firebase.database.ServerValue.TIMESTAMP,
      });
    } else {
      // Local mode: just show it
      UIModule.showReaction(emoji);
    }
  },

  // Update Helpers
  pushUpdate(key, data) {
    if (this.roomId === "LOCAL" || !this.roomRef) return;
    // Only Host should push most structural changes, but Guests trigger spins via Host or receive updates
    // Here we assume simple trust: whoever changes state pushes it if allowed.
    if (this.isHost || key === "questions") {
      this.roomRef.update({ [key]: data });
    }
  },
};

/* ==================== Data Module ==================== */
const DataModule = {
  key: "luxuryTOD_v3",
  defaultDB: DEFAULT_QUESTIONS,
  state: {
    players: [],
    questions: [],
    history: [],
    stats: {},
    settings: {
      speed: 30,
      duration: 5000,
      difficultyFilter: "All",
      segmentCounts: { truth: 10, dare: 10, pass: 2 },
      noRepeat: false,
    },
  },
  tempSelected: [],
  init() {
    // Default init
    this.state.questions = [...this.defaultDB];
    this.loadFromStorage();
  },
  loadFromStorage() {
    const saved = localStorage.getItem(this.key);
    if (saved) {
      const parsed = JSON.parse(saved);
      this.state = { ...this.state, ...parsed };
      // Migration for old difficulty filter
      if (this.state.settings.difficultyFilter === "Any")
        this.state.settings.difficultyFilter = "All";
      // Migration for players (string -> object)
      if (
        this.state.players.length > 0 &&
        typeof this.state.players[0] === "string"
      ) {
        this.state.players = this.state.players.map((name) => ({
          name,
          weight: 1,
        }));
      }
      // Migration for noRepeat
      if (this.state.settings.noRepeat === undefined) {
        this.state.settings.noRepeat = false;
      }
    }
  },
  saveToStorage() {
    localStorage.setItem(this.key, JSON.stringify(this.state));
  },
  resetToDefault() {
    if (confirm("確定要恢復預設值嗎？所有自訂題目、玩家與紀錄將被清除。")) {
      localStorage.removeItem(this.key);
      location.reload();
    }
  },
  // Methods modified to sync with Network
  addPlayer(name) {
    if (NetworkModule.roomId !== "LOCAL") {
      // 線上模式：寫入節點
      const safeName = name.replace(/[.$#\[\]\/]/g, "_");
      NetworkModule.roomRef
        .child("players/" + safeName)
        .set({ name: name, isHost: false, weight: 1 });
      return true;
    } else if (!this.state.players.some((p) => p.name === name)) {
      // 單機模式
      this.state.players.push({ name: name, weight: 1 });
      this.saveToStorage();
      UIModule.renderPlayerList();
      return true;
    }
    return false;
  },
  removePlayer(index) {
    const p = this.state.players[index];
    if (!p) return;
    const name = p.name;

    if (NetworkModule.roomId !== "LOCAL") {
      // 線上模式：移除節點
      const safeName = name.replace(/[.$#\[\]\/]/g, "_");
      NetworkModule.roomRef.child("players/" + safeName).remove();
    } else {
      // 單機模式
      this.state.players.splice(index, 1);
      this.saveToStorage();
      UIModule.renderPlayerList();
    }
  },
  updatePlayerWeight(index, weight) {
    const w = parseInt(weight);
    if (isNaN(w) || w < 0) return;
    const p = this.state.players[index];
    if (!p) return;

    if (NetworkModule.roomId !== "LOCAL") {
      const safeName = p.name.replace(/[.$#\[\]\/]/g, "_");
      NetworkModule.roomRef.child("players/" + safeName).update({ weight: w });
    } else {
      p.weight = w;
      this.saveToStorage();
    }
  },
  addQuestion(q) {
    this.state.questions.push(q);
    this.saveToStorage();
    NetworkModule.pushUpdate("questions", this.state.questions);
    UIModule.renderQuestionList();
  },
  removeQuestion(index) {
    this.state.questions.splice(index, 1);
    this.saveToStorage();
    NetworkModule.pushUpdate("questions", this.state.questions);
    UIModule.renderQuestionList();
  },
  clearQuestions() {
    this.state.questions = [];
    this.saveToStorage();
    NetworkModule.pushUpdate("questions", this.state.questions);
    UIModule.renderQuestionList();
  },
  addHistory(item) {
    this.state.history.unshift(item);
    if (this.state.history.length > 50) this.state.history.pop();
    this.saveToStorage();
    NetworkModule.pushUpdate("history", this.state.history);
  },
  clearHistory() {
    this.state.history = [];
    this.saveToStorage();
    NetworkModule.pushUpdate("history", this.state.history);
  },
  incrementStat(name) {
    if (!this.state.stats) this.state.stats = {};
    this.state.stats[name] = (this.state.stats[name] || 0) + 1;
    this.saveToStorage();
    NetworkModule.pushUpdate("stats", this.state.stats);
  },
  resetStats() {
    this.state.stats = {};
    this.saveToStorage();
    NetworkModule.pushUpdate("stats", this.state.stats);
  },
  updateSettings() {
    this.saveToStorage();
    NetworkModule.pushUpdate("settings", this.state.settings);
  },

  // Helpers
  getQuestionByType(type) {
    let filtered = this.state.questions.filter((q) => q.type === type);
    const filterLevel = this.state.settings.difficultyFilter;

    if (filterLevel === "Safe") {
      filtered = filtered.filter((q) => ["Easy", "Normal"].includes(q.level));
    } else if (filterLevel === "Standard") {
      filtered = filtered.filter((q) =>
        ["Easy", "Normal", "Hard"].includes(q.level)
      );
    } else if (filterLevel === "Spicy") {
      filtered = filtered.filter((q) => ["Hard", "Adult"].includes(q.level));
    } else if (filterLevel === "Adult") {
      filtered = filtered.filter((q) => q.level === "Adult");
    }
    // "All" returns everything

    if (filtered.length === 0) return { content: "無符合條件的題目" };
    return filtered[Math.floor(Math.random() * filtered.length)];
  },
  getRandomPlayer() {
    if (this.state.players.length === 0) return "匿名玩家";

    let candidates = this.state.players;

    // No Repeat Logic
    if (this.state.settings.noRepeat) {
      // Filter out players who are already in tempSelected
      // Ensure tempSelected only contains current valid players
      this.tempSelected = this.tempSelected.filter((name) =>
        this.state.players.some((p) => p.name === name)
      );

      const unpicked = this.state.players.filter(
        (p) => !this.tempSelected.includes(p.name)
      );

      if (unpicked.length === 0) {
        // All picked, reset
        this.tempSelected = [];
        candidates = this.state.players;
      } else {
        candidates = unpicked;
      }
    }

    const totalWeight = candidates.reduce((sum, p) => sum + (p.weight || 0), 0);
    let selectedName = "";

    if (totalWeight <= 0) {
      selectedName =
        candidates[Math.floor(Math.random() * candidates.length)].name;
    } else {
      let r = Math.random() * totalWeight;
      for (const p of candidates) {
        const w = p.weight || 0;
        if (r < w) {
          selectedName = p.name;
          break;
        }
        r -= w;
      }
      if (!selectedName) selectedName = candidates[candidates.length - 1].name;
    }

    if (this.state.settings.noRepeat) {
      this.tempSelected.push(selectedName);
    }

    return selectedName;
  },
  aiGenerate() {
    const types = ["truth", "dare"];
    const newQ = {
      type: types[Math.floor(Math.random() * 2)],
      content: `(AI生成) 請詳細描述你對${Math.floor(
        Math.random() * 100
      )}號話題的看法。`,
      level: "Normal",
    };
    this.addQuestion(newQ);
    return true;
  },
  exportData() {
    const dataStr = JSON.stringify(this.state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
  importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data.players && data.questions) {
        // Migration
        if (data.players.length > 0 && typeof data.players[0] === "string") {
          data.players = data.players.map((name) => ({
            name,
            weight: 1,
          }));
        }
        this.state = data;
        this.saveToStorage();
        // If Host, sync to everyone
        if (NetworkModule.isHost) {
          NetworkModule.pushUpdate("players", this.state.players);
          NetworkModule.pushUpdate("questions", this.state.questions);
          NetworkModule.pushUpdate("settings", this.state.settings);
        }
        return true;
      }
    } catch (e) {}
    return false;
  },
};

/* ==================== Wheel Module ==================== */
const WheelModule = {
  canvas: null,
  ctx: null,
  pointerEl: null,
  segments: [],
  angleCurrent: 0,
  angleDelta: 0,
  isSpinning: false,
  spinTime: 0,
  spinTimeTotal: 0,
  startTime: 0,
  startAngle: 0,
  targetAngle: 0,
  requestFrameId: null,

  init() {
    this.canvas = document.getElementById("wheelCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.pointerEl = document.querySelector(".pointer");
    this.generateSegments();
    this.draw();
  },
  generateSegments() {
    const { truth, dare, pass } = DataModule.state.settings.segmentCounts;
    const tPool = Array(parseInt(truth)).fill({
      text: "真心話",
      type: "truth",
      color: "#1565C0",
      txtColor: "#FFF",
    });
    const dPool = Array(parseInt(dare)).fill({
      text: "大冒險",
      type: "dare",
      color: "#C62828",
      txtColor: "#FFF",
    });
    const pPool = Array(parseInt(pass)).fill({
      text: "Pass",
      type: "pass",
      color: "#D4AF37",
      txtColor: "#000",
    });

    let combined = [];
    const max = Math.max(truth, dare, pass);
    for (let i = 0; i < max; i++) {
      if (tPool[i]) combined.push(tPool[i]);
      if (dPool[i]) combined.push(dPool[i]);
      if (pPool[i]) combined.push(pPool[i]);
    }
    if (combined.length === 0)
      combined.push({
        text: "設定",
        type: "pass",
        color: "#888",
        txtColor: "#FFF",
      });
    this.segments = combined;
  },
  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w / 2 - 10;
    const count = this.segments.length;
    const arc = (Math.PI * 2) / count;

    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < count; i++) {
      const angle = this.angleCurrent + i * arc;
      const seg = this.segments[i];
      ctx.fillStyle = seg.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angle, angle + arc);
      ctx.fill();
      ctx.save();
      ctx.translate(
        cx + Math.cos(angle + arc / 2) * (radius - 50),
        cy + Math.sin(angle + arc / 2) * (radius - 50)
      );
      ctx.rotate(angle + arc / 2 + Math.PI / 2);
      ctx.fillStyle = seg.txtColor;
      ctx.font = 'bold 14px "Noto Sans TC"';
      ctx.fillText(seg.text, -ctx.measureText(seg.text).width / 2, 0);
      ctx.restore();
    }
  },
  spin(isInitiator = true) {
    // 停止震動與鬧鐘相關效果
    if (navigator.vibrate) navigator.vibrate(0);
    document.body.classList.remove("shake-screen");
    document.getElementById("timer-display").classList.remove("timer-blink");
    AudioModule.stop("alarm");

    if (this.isSpinning) return;
    this.isSpinning = true;
    document.querySelector(".game-info").style.background =
      "rgba(0, 0, 0, 0.6)";

    if (isInitiator) {
      // Host triggers network event
      if (
        NetworkModule.roomRef &&
        (NetworkModule.isHost ||
          NetworkModule.nickname === NetworkModule.nextSpinner)
      ) {
        NetworkModule.roomRef.update({
          spinTrigger: firebase.database.ServerValue.TIMESTAMP,
        });
      }
    }

    const speedMult = DataModule.state.settings.speed / 10;
    this.spinTimeTotal =
      DataModule.state.settings.duration * (0.8 + Math.random() * 0.4);
    this.startTime = null;
    this.startAngle = this.angleCurrent;

    // 計算目標角度：基礎圈數 + 隨機圈數，使用 EaseOutQuart 模擬摩擦力
    const rotations = (5 + Math.random() * 5) * speedMult;
    const totalRadians = rotations * 2 * Math.PI;
    this.targetAngle = this.startAngle + totalRadians;

    AudioModule.play("spin");
    this.requestFrameId = requestAnimationFrame(this.rotate.bind(this));
  },
  rotate(timestamp) {
    if (!this.startTime) this.startTime = timestamp;
    const elapsed = timestamp - this.startTime;

    if (elapsed >= this.spinTimeTotal) {
      this.angleCurrent = this.targetAngle;
      this.draw();
      this.stop();
      return;
    }

    // 使用 EaseOutQuart (1 - (1-t)^4) 模擬摩擦力減速效果
    const t = elapsed / this.spinTimeTotal;
    const ease = 1 - Math.pow(1 - t, 4);
    const newAngle =
      this.startAngle + (this.targetAngle - this.startAngle) * ease;

    // 計算速度並應用指針擺動動畫
    const speed = newAngle - this.angleCurrent;
    this.angleCurrent = newAngle;

    if (this.pointerEl) {
      const count = this.segments.length;
      // 模擬指針撞擊格子的效果：sin波形 * 速度 * 強度係數
      const wobble = Math.sin(this.angleCurrent * count) * speed * 150;
      this.pointerEl.style.transform = `translateX(-50%) rotate(${wobble}deg)`;
    }

    this.draw();
    this.requestFrameId = requestAnimationFrame(this.rotate.bind(this));
  },
  stop() {
    this.isSpinning = false;
    cancelAnimationFrame(this.requestFrameId);
    if (this.pointerEl) {
      this.pointerEl.style.transform = "translateX(-50%) rotate(0deg)";
    }
    AudioModule.stop("spin");
    AudioModule.play("win");

    const count = this.segments.length;
    const arc = (Math.PI * 2) / count;
    const rotation = this.angleCurrent % (Math.PI * 2);
    let index = Math.floor((Math.PI * 1.5 - rotation) / arc);
    index = ((index % count) + count) % count;
    const result = this.segments[index];

    // 只有房主負責寫入結果與統計
    if (NetworkModule.isHost) {
      const player = DataModule.getRandomPlayer();
      let content =
        result.type === "pass"
          ? "直接跳過！"
          : DataModule.getQuestionByType(result.type).content;

      DataModule.incrementStat(player);
      DataModule.addHistory({
        player,
        type: result.type,
        content,
        time: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });

      if (NetworkModule.roomRef) {
        NetworkModule.roomRef.update({
          currentResult: {
            type: result.type,
            content,
            player,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
          },
          nextSpinner: player,
        });
      }
      UIModule.showResult(result.type, content, player);
    } else if (NetworkModule.roomId === "LOCAL") {
      // 單機模式
      const player = DataModule.getRandomPlayer();
      let content =
        result.type === "pass"
          ? "直接跳過！"
          : DataModule.getQuestionByType(result.type).content;
      DataModule.incrementStat(player);
      DataModule.addHistory({
        player,
        type: result.type,
        content,
        time: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
      UIModule.showResult(result.type, content, player);
    } else {
      // 訪客：只顯示特效，等待 Firebase 的 currentResult 同步內容
      EffectModule.triggerConfetti();
      if (NetworkModule.pendingResult) {
        UIModule.showResult(
          NetworkModule.pendingResult.type,
          NetworkModule.pendingResult.content,
          NetworkModule.pendingResult.player
        );
        NetworkModule.pendingResult = null;
      }
    }
  },
};

/* ==================== UI & Audio & Effect ==================== */
const UIModule = {
  currentQuestionFilter: "all",
  init() {
    this.bindEvents();
    this.renderSettingsValues();
    this.updateSpinPermission();
    WheelModule.init();
    AudioModule.init();
  },
  bindEvents() {
    document
      .getElementById("spinBtn")
      .addEventListener("click", () => WheelModule.spin(true));
    document
      .getElementById("menu-toggle")
      .addEventListener("click", () =>
        document.body.classList.toggle("sidebar-collapsed")
      );
    document.getElementById("add-player-btn").addEventListener("click", () => {
      const input = document.getElementById("new-player-input");
      if (input.value) {
        DataModule.addPlayer(input.value);
        input.value = "";
      }
    });
    document.getElementById("add-q-btn").addEventListener("click", () => {
      const input = document.getElementById("new-q-input");
      if (input.value) {
        DataModule.addQuestion({
          type: document.getElementById("q-type").value,
          content: input.value,
          level: "Normal",
        });
        input.value = "";
      }
    });
    document.getElementById("clear-q-btn").addEventListener("click", () => {
      if (confirm("清空?")) DataModule.clearQuestions();
    });
    document
      .getElementById("ai-generate-btn")
      .addEventListener("click", () => DataModule.aiGenerate());
    document
      .getElementById("clear-history-btn")
      .addEventListener("click", () => DataModule.clearHistory());
    document
      .getElementById("reset-stats-btn")
      .addEventListener("click", () => DataModule.resetStats());

    // Settings Inputs
    ["range-truth", "range-dare", "range-pass"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => {
        const t = document.getElementById("range-truth").value;
        const d = document.getElementById("range-dare").value;
        const p = document.getElementById("range-pass").value;
        document.getElementById("val-truth").innerText = t;
        document.getElementById("val-dare").innerText = d;
        document.getElementById("val-pass").innerText = p;
        DataModule.state.settings.segmentCounts = {
          truth: t,
          dare: d,
          pass: p,
        };
        WheelModule.generateSegments();
        WheelModule.draw();
        DataModule.updateSettings();
      });
    });
    document
      .getElementById("check-no-repeat")
      .addEventListener("change", (e) => {
        DataModule.state.settings.noRepeat = e.target.checked;
        DataModule.updateSettings();
      });
    // Import/Export
    document
      .getElementById("btn-export")
      .addEventListener("click", () => DataModule.exportData());
    document
      .getElementById("btn-import")
      .addEventListener("click", () =>
        document.getElementById("file-import").click()
      );
    document
      .getElementById("btn-reset-default")
      .addEventListener("click", () => DataModule.resetToDefault());
    document.getElementById("btn-leave-room").addEventListener("click", () => {
      if (confirm("確定要退出房間嗎？")) NetworkModule.leaveRoom();
    });
    document.getElementById("file-import").addEventListener("change", (e) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (DataModule.importData(ev.target.result)) location.reload();
      };
      if (e.target.files[0]) reader.readAsText(e.target.files[0]);
    });

    // Tabs
    document.querySelectorAll(".diff-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const parent = tab.parentElement;
        if (parent.id === "diff-selector") {
          parent
            .querySelectorAll(".diff-tab")
            .forEach((t) => t.classList.remove("active"));
          e.target.classList.add("active");
          UIModule.renderQuestionList(e.target.dataset.val);
        } else if (parent.id === "timer-mode-selector") {
          parent
            .querySelectorAll(".diff-tab")
            .forEach((t) => t.classList.remove("active"));
          e.target.classList.add("active");
          TimerModule.switchMode(e.target.dataset.mode);
        }
      });
    });

    document
      .getElementById("list-difficulty-filter")
      .addEventListener("change", () => {
        UIModule.renderQuestionList();
      });

    // Keyboard
    document.addEventListener("keydown", (e) => {
      if (
        ["input", "select"].includes(
          document.activeElement.tagName.toLowerCase()
        )
      )
        return;
      if (
        e.code === "Space" &&
        document.getElementById("panel-home").classList.contains("active")
      ) {
        e.preventDefault();
        const btn = document.getElementById("spinBtn");
        if (!btn.disabled) WheelModule.spin(true);
      }
      if (e.code === "Escape") this.switchPanel("panel-home");
    });
  },
  switchPanel(id, btn) {
    document
      .querySelectorAll(".panel")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    document
      .querySelectorAll(".nav-btn")
      .forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    else {
      // Auto active nav
    }
    if (id === "panel-leaderboard") this.renderLeaderboard();
  },
  updateRoleUI() {
    if (NetworkModule.isHost) {
      document
        .querySelectorAll(".host-only")
        .forEach((el) => el.classList.remove("guest-hidden"));
      document
        .querySelectorAll(".guest-hidden-ctrl")
        .forEach((el) => (el.style.display = ""));
      document.getElementById("guest-msg").classList.add("guest-hidden");
      document
        .querySelectorAll(".host-control")
        .forEach((el) => (el.disabled = false));
      this.updateSpinPermission();
    } else {
      document
        .querySelectorAll(".host-only")
        .forEach((el) => el.classList.add("guest-hidden"));
      document.getElementById("guest-msg").classList.remove("guest-hidden");
      document
        .querySelectorAll(".host-control")
        .forEach((el) => (el.disabled = true));
      this.updateSpinPermission();
    }
  },
  updateSpinPermission() {
    const btn = document.getElementById("spinBtn");
    if (NetworkModule.roomId === "LOCAL") {
      btn.disabled = false;
      btn.innerText = "開始抽籤";
      return;
    }
    const isMe = NetworkModule.nickname === NetworkModule.nextSpinner;
    if (NetworkModule.isHost || isMe) {
      btn.disabled = false;
      btn.innerText = isMe ? "輪到你了！開始抽籤" : "開始抽籤 (Host)";
    } else {
      btn.disabled = true;
      btn.innerText = NetworkModule.nextSpinner
        ? `等待 ${NetworkModule.nextSpinner} 抽籤`
        : "等待房主開始";
    }
  },
  renderPlayerList() {
    const list = document.getElementById("player-list");
    let html = "";
    DataModule.state.players.forEach((p, i) => {
      const isHost = NetworkModule.isHost;
      const weight = p.weight !== undefined ? p.weight : 1;
      const weightInput = isHost
        ? `<div style="display:flex; align-items:center; margin-right:5px" onclick="event.stopPropagation()">
             <input type="range" style="width:80px; accent-color:var(--gold); margin-right:5px; cursor:pointer; padding:0" value="${weight}" min="0" max="10" 
             oninput="document.getElementById('w-val-${i}').innerText=this.value" 
             onchange="DataModule.updatePlayerWeight(${i}, this.value)">
             <span id="w-val-${i}" style="width:20px; text-align:center; color:var(--gold); font-weight:bold">${weight}</span>
           </div>`
        : `<span style="font-size:0.8rem; color:#888; margin-right:5px">權重: ${weight}</span>`;

      const delBtn = isHost
        ? `<button class="delete-btn" onclick="DataModule.removePlayer(${i})"><i class="material-icons">delete</i></button>`
        : "";

      html += `<div class="list-item">
          <div style="display:flex; align-items:center; flex:1">
              <i class="material-icons" style="font-size:16px; margin-right:5px">person</i> 
              <span>${p.name}</span>
          </div>
          <div style="display:flex; align-items:center; gap:5px">${weightInput}${delBtn}</div>
      </div>`;
    });
    list.innerHTML = html;
    document.getElementById("player-count").innerText =
      DataModule.state.players.length;
  },
  renderQuestionList(filterType) {
    if (filterType) this.currentQuestionFilter = filterType;
    const list = document.getElementById("question-list");
    const levelFilter = document.getElementById("list-difficulty-filter").value;

    list.innerHTML = "";
    DataModule.state.questions.forEach((q, i) => {
      if (
        this.currentQuestionFilter !== "all" &&
        q.type !== this.currentQuestionFilter
      )
        return;
      if (levelFilter !== "all" && q.level !== levelFilter) return;

      // Simplified render
      const delBtn = NetworkModule.isHost
        ? `<button class="delete-btn" onclick="DataModule.removeQuestion(${i})"><i class="material-icons">delete</i></button>`
        : "";
      list.innerHTML += `<div class="list-item ${
        q.type === "truth" ? "truth" : "dare"
      }"><div><span class="tag">${q.type}</span>${
        q.content
      }</div>${delBtn}</div>`;
    });
  },
  renderHistory() {
    const list = document.getElementById("history-list");
    list.innerHTML = "";
    DataModule.state.history.forEach((h) => {
      list.innerHTML += `<div class="list-item ${h.type}"><div><div style="color:var(--gold)">${h.player}</div>${h.content} <span style="font-size:0.7rem; color:#666">${h.time}</span></div></div>`;
    });
  },
  renderLeaderboard() {
    const list = document.getElementById("leaderboard-list");
    list.innerHTML = "";
    const stats = Object.entries(DataModule.state.stats)
      .map(([k, v]) => ({ name: k, count: v }))
      .sort((a, b) => b.count - a.count);
    stats.forEach((p, i) => {
      let cls =
        i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";
      list.innerHTML += `<div class="list-item ${cls}"><span>#${i + 1} ${
        p.name
      }</span><span class="rank-count">${p.count}</span></div>`;
    });
  },
  renderSettingsValues() {
    const s = DataModule.state.settings;
    document.getElementById("val-truth").innerText = s.segmentCounts.truth;
    document.getElementById("val-dare").innerText = s.segmentCounts.dare;
    document.getElementById("val-pass").innerText = s.segmentCounts.pass;
    document.getElementById("range-truth").value = s.segmentCounts.truth;
    document.getElementById("range-dare").value = s.segmentCounts.dare;
    document.getElementById("range-pass").value = s.segmentCounts.pass;
    document.getElementById("speed-range").value = s.speed;
    document.getElementById("duration-range").value = s.duration / 1000;
    document.getElementById("game-difficulty-filter").value =
      s.difficultyFilter;
    document.getElementById("check-no-repeat").checked = !!s.noRepeat;
  },
  showResult(type, content, player) {
    document.getElementById("player-name-slot").innerText = player;
    const box = document.getElementById("display-result");

    let color = "#ccc";
    let grad = "rgba(0,0,0,0.6)";

    if (type === "truth") {
      color = "#4CAF50";
      grad =
        "linear-gradient(135deg, rgba(21, 101, 192, 0.5) 0%, rgba(0, 0, 0, 0.8) 100%)";
    }
    if (type === "dare") {
      color = "#FF5722";
      grad =
        "linear-gradient(135deg, rgba(198, 40, 40, 0.5) 0%, rgba(0, 0, 0, 0.8) 100%)";
    }
    if (type === "pass") {
      color = "#D4AF37";
      grad =
        "linear-gradient(135deg, rgba(212, 175, 55, 0.4) 0%, rgba(0, 0, 0, 0.8) 100%)";
    }

    document.querySelector(".game-info").style.background = grad;
    box.innerHTML = `<span style="color:${color}">[${type.toUpperCase()}]</span> ${content}`;

    EffectModule.triggerConfetti();
  },
  showRoomQR() {
    if (NetworkModule.roomId && NetworkModule.roomId !== "LOCAL") {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${NetworkModule.roomId}`;
      document.getElementById("qr-image").src = url;
      document.getElementById("qr-display-overlay").classList.remove("hidden");
    }
  },
  showReaction(emoji) {
    const layer = document.getElementById("danmaku-layer");
    const el = document.createElement("div");
    el.className = "danmaku-item";
    el.innerText = emoji;

    // Random position
    const left = Math.random() * 80 + 10; // 10% to 90%
    el.style.left = left + "%";

    // Random size variation
    const size = 1.5 + Math.random();
    el.style.fontSize = size + "rem";

    // Random duration
    const duration = 3 + Math.random() * 2;
    el.style.animationDuration = duration + "s";

    layer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, duration * 1000);
  },
  toggleReactions() {
    document.getElementById("reaction-menu").classList.toggle("hidden");
  },
};

const EffectModule = {
  triggerConfetti() {
    const colors = ["#d4af37", "#f4df87", "#ffffff"];
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: colors,
    });
  },
};

const AudioModule = {
  bgm: null,
  spin: null,
  win: null,
  alarm: null,
  init() {
    this.bgm = document.getElementById("bgm");
    this.spin = document.getElementById("sfx-spin");
    this.win = document.getElementById("sfx-win");
    this.alarm = document.getElementById("sfx-alarm");
  },
  play(k) {
    if (this[k]) this[k].play().catch(() => {});
  },
  stop(k) {
    if (this[k]) {
      this[k].pause();
      this[k].currentTime = 0;
    }
  },
};

const TimerModule = {
  mode: "countdown",
  time: 0,
  initialTime: 0,
  interval: null,
  isRunning: false,
  init() {
    this.update();
  },
  switchMode(newMode) {
    this.reset();
    this.mode = newMode;
    const presets = document.getElementById("timer-presets-container");
    if (this.mode === "stopwatch") {
      this.time = 0;
      this.initialTime = 0;
      presets.style.display = "none";
    } else {
      this.time = 0;
      this.initialTime = 0;
      presets.style.display = "flex";
    }
    this.update();
  },
  toggle() {
    if (this.isRunning) this.pause();
    else this.start();
  },
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    document.getElementById("timer-icon-play").innerText = "pause";
    this.interval = setInterval(() => {
      if (this.mode === "countdown") {
        this.time--;
        if (this.time <= 0) this.finish();
      } else this.time++;
      this.update();
    }, 1000);
  },
  pause() {
    this.isRunning = false;
    clearInterval(this.interval);
    document.getElementById("timer-icon-play").innerText = "play_arrow";
  },
  reset() {
    this.pause();
    this.time = this.initialTime;
    // Smart Reset: 若當前已是設定時間，再次點擊則歸零(預設值)；否則重置回設定時間
    if (this.time === this.initialTime && this.initialTime > 0) {
      this.time = 0;
      this.initialTime = 0;
    } else {
      this.time = this.initialTime;
    }
    document.getElementById("timer-display").classList.remove("timer-blink");
    document.body.classList.remove("shake-screen");
    this.update();
  },
  finish() {
    this.pause();
    document.getElementById("timer-display").classList.add("timer-blink");
    document.body.classList.add("shake-screen");
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    AudioModule.play("alarm");
    // Stop shaking after 5 seconds
    setTimeout(() => {
      document.body.classList.remove("shake-screen");
    }, 5000);
  },
  addTime(s) {
    if (this.mode === "countdown") {
      this.time += s;
      this.initialTime = this.time;
      this.update();
    }
  },
  update() {
    const m = Math.floor(this.time / 60)
      .toString()
      .padStart(2, "0");
    const s = (this.time % 60).toString().padStart(2, "0");
    document.getElementById("timer-display").innerText = `${m}:${s}`;
  },
};

const ScannerModule = {
  scanner: null,
  start() {
    document.getElementById("scanner-overlay").classList.remove("hidden");
    setTimeout(() => {
      if (!this.scanner) {
        this.scanner = new Html5Qrcode("reader");
      }
      this.scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            this.stop();
            document.getElementById("room-code-input").value = decodedText;
            if (/^\d{6}$/.test(decodedText)) NetworkModule.joinRoom();
          },
          (errorMessage) => {}
        )
        .catch((err) => {
          alert("無法啟動相機");
          this.stop();
        });
    }, 100);
  },
  stop() {
    document.getElementById("scanner-overlay").classList.add("hidden");
    if (this.scanner)
      this.scanner
        .stop()
        .then(() => this.scanner.clear())
        .catch(() => {});
  },
};

window.onload = () => {
  DataModule.init();
  UIModule.init();
  TimerModule.init();
};

// 初始問題庫
const defaultQuestions = {
  truth: [
    "你最近一次撒謊是什麼時候？",
    "你曾經暗戀過誰？",
    "你最大的秘密是什麼？",
    "你曾經做過最尷尬的事是什麼？",
    "你最後一次哭是什麼時候？為什麼？",
    "你最不喜歡自己的哪個特點？",
    "你曾經偷偷喜歡過朋友的伴侶嗎？",
  ],
  dare: [
    "模仿一位名人直到下一輪",
    "用奇怪的嗓音說接下來三句話",
    "在社交媒體上發布一張搞怪自拍",
    "給通訊錄第10個人打電話說『我愛你』",
    "做10個俯臥撑",
    "學貓叫一分鐘",
    "用屁股寫自己的名字",
  ],
};

// 初始玩家列表
const defaultPlayers = ["玩家1", "玩家2", "玩家3", "玩家4"];

// 當前數據
let questions = JSON.parse(JSON.stringify(defaultQuestions));
let players = [...defaultPlayers];
let currentCategory = "truth";
let isPlayerSpinning = false;
let isGameSpinning = false;
let gameHistory = [];

// 初始化轉盤
function initWheels() {
  initPlayerWheel();
  initGameWheel();
}

// 初始化玩家轉盤
function initPlayerWheel() {
  const wheel = document.getElementById("player-wheel");
  wheel.innerHTML = "";

  if (players.length === 0) {
    const message = document.createElement("div");
    message.style.display = "flex";
    message.style.alignItems = "center";
    message.style.justifyContent = "center";
    message.style.height = "100%";
    message.style.color = "white";
    message.textContent = "請添加玩家";
    wheel.appendChild(message);
    return;
  }

  // 創建轉盤區域
  const colors = generateColors(players.length);

  players.forEach((player, index) => {
    const section = document.createElement("div");
    section.className = "wheel-section-item";
    section.style.transform = `rotate(${index * (360 / players.length)}deg)`;
    section.style.background = colors[index];

    const text = document.createElement("div");
    text.className = "wheel-text";
    text.textContent = player;

    section.appendChild(text);
    wheel.appendChild(section);
  });

  updatePlayerCount();
}

// 初始化遊戲轉盤
function initGameWheel() {
  const wheel = document.getElementById("game-wheel");
  wheel.innerHTML = "";

  // 創建轉盤區域
  const categories = ["真心話", "大冒險", "真心話", "大冒險"];
  const colors = ["#FF5252", "#FF9800", "#4CAF50", "#2196F3"];

  categories.forEach((category, index) => {
    const section = document.createElement("div");
    section.className = "wheel-section-item";
    section.style.transform = `rotate(${index * 90}deg)`;
    section.style.background = colors[index];

    const text = document.createElement("div");
    text.className = "wheel-text";
    text.textContent = category;

    section.appendChild(text);
    wheel.appendChild(section);
  });
}

// 生成顏色數組
function generateColors(count) {
  const colors = [];
  const hueStep = 360 / count;

  for (let i = 0; i < count; i++) {
    const hue = i * hueStep;
    colors.push(`hsl(${hue}, 70%, 60%)`);
  }

  return colors;
}

// 旋轉玩家轉盤
function spinPlayerWheel() {
  if (isPlayerSpinning || players.length === 0) return;

  isPlayerSpinning = true;
  const wheel = document.getElementById("player-wheel");
  const resultDiv = document.getElementById("player-result");

  // 禁用按鈕
  document.getElementById("spin-player-btn").disabled = true;
  resultDiv.textContent = "選擇玩家中...";

  // 隨機旋轉角度 (至少旋轉5圈)
  const degrees = 1800 + Math.floor(Math.random() * 360);
  wheel.style.transform = `rotate(${degrees}deg)`;

  // 計算結果 (基於旋轉角度)
  setTimeout(() => {
    const normalizedDegrees = degrees % 360;
    const playerIndex =
      Math.floor(normalizedDegrees / (360 / players.length)) % players.length;
    const result = players[playerIndex];

    resultDiv.textContent = `選中的玩家: ${result}`;

    // 啟用按鈕
    document.getElementById("spin-player-btn").disabled = false;
    isPlayerSpinning = false;

    // 添加到歷史記錄
    addToHistory(`選中玩家: ${result}`);
  }, 4000);
}

// 旋轉遊戲轉盤
function spinGameWheel() {
  if (isGameSpinning) return;

  isGameSpinning = true;
  const wheel = document.getElementById("game-wheel");
  const resultDiv = document.getElementById("game-result");

  // 禁用按鈕
  document.getElementById("spin-game-btn").disabled = true;
  resultDiv.textContent = "轉盤旋轉中...";

  // 隨機旋轉角度 (至少旋轉5圈)
  const degrees = 1800 + Math.floor(Math.random() * 360);
  wheel.style.transform = `rotate(${degrees}deg)`;

  // 計算結果 (基於旋轉角度)
  setTimeout(() => {
    const normalizedDegrees = degrees % 360;
    let result;
    let category;

    if (normalizedDegrees < 90) {
      category = "truth";
      result = getRandomQuestion("truth");
    } else if (normalizedDegrees < 180) {
      category = "dare";
      result = getRandomQuestion("dare");
    } else if (normalizedDegrees < 270) {
      category = "truth";
      result = getRandomQuestion("truth");
    } else {
      category = "dare";
      result = getRandomQuestion("dare");
    }

    // 添加類別標示
    const categoryText = category === "truth" ? "【真心話】" : "【大冒險】";
    resultDiv.innerHTML = `<span>${categoryText}</span><br>${result}`;

    // 啟用按鈕
    document.getElementById("spin-game-btn").disabled = false;
    isGameSpinning = false;

    // 添加到歷史記錄
    addToHistory(`${categoryText} ${result}`);
  }, 4000);
}

// 獲取隨機問題
function getRandomQuestion(category) {
  const categoryQuestions = questions[category];
  if (categoryQuestions.length === 0) {
    return category === "truth" ? "請添加真心話問題！" : "請添加大冒險挑戰！";
  }

  const randomIndex = Math.floor(Math.random() * categoryQuestions.length);
  return categoryQuestions[randomIndex];
}

// 更新玩家列表顯示
function updatePlayersList() {
  const playersList = document.getElementById("player-list");
  playersList.innerHTML = "";

  // 如果沒有玩家，顯示提示
  if (players.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "player-item";
    emptyMsg.textContent = "暫無玩家，請添加玩家！";
    playersList.appendChild(emptyMsg);
    return;
  }

  players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = "player-item";

    const text = document.createElement("span");
    text.className = "player-name";
    text.textContent = player;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.onclick = () => removePlayer(index);

    item.appendChild(text);
    item.appendChild(removeBtn);
    playersList.appendChild(item);
  });

  updatePlayerCount();
  initPlayerWheel();
}

// 更新玩家數量顯示
function updatePlayerCount() {
  document.getElementById("player-count").textContent = players.length;
}

// 添加新玩家
function addPlayer() {
  const input = document.getElementById("new-player");
  const text = input.value.trim();

  if (text) {
    players.push(text);
    input.value = "";
    updatePlayersList();
    showNotification("玩家添加成功！");
  } else {
    showNotification("請輸入玩家名稱！", "error");
  }
}

// 移除玩家
function removePlayer(index) {
  players.splice(index, 1);
  updatePlayersList();
  showNotification("玩家已移除！");
}

// 隨機生成玩家
function randomizePlayers() {
  const count = Math.max(2, Math.floor(Math.random() * 8) + 2); // 2-10個玩家
  players = [];

  for (let i = 1; i <= count; i++) {
    players.push(`玩家${i}`);
  }

  updatePlayersList();
  showNotification(`已隨機生成${count}位玩家！`);
}

// 清除所有玩家
function clearPlayers() {
  if (players.length > 0 && confirm("確定要清除所有玩家嗎？")) {
    players = [];
    updatePlayersList();
    showNotification("所有玩家已清除！");
  }
}

// 增加玩家數量
function increasePlayerCount() {
  const newPlayer = `玩家${players.length + 1}`;
  players.push(newPlayer);
  updatePlayersList();
  showNotification(`已添加${newPlayer}！`);
}

// 減少玩家數量
function decreasePlayerCount() {
  if (players.length > 0) {
    players.pop();
    updatePlayersList();
    showNotification("已移除一位玩家！");
  } else {
    showNotification("沒有玩家可以移除！", "error");
  }
}

// 更新問題列表顯示
function updateQuestionsList() {
  const questionsList = document.getElementById("questions-list");
  questionsList.innerHTML = "";

  // 如果沒有問題，顯示提示
  if (questions[currentCategory].length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "question-item";
    emptyMsg.textContent = "暫無問題，請添加問題！";
    questionsList.appendChild(emptyMsg);
    return;
  }

  questions[currentCategory].forEach((question, index) => {
    const item = document.createElement("div");
    item.className = "question-item";

    const text = document.createElement("span");
    text.textContent = question;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.onclick = () => removeQuestion(index);

    item.appendChild(text);
    item.appendChild(removeBtn);
    questionsList.appendChild(item);
  });
}

// 添加新問題
function addQuestion() {
  const input = document.getElementById("new-question");
  const text = input.value.trim();

  if (text) {
    questions[currentCategory].push(text);
    input.value = "";
    updateQuestionsList();
    showNotification("問題添加成功！");
  } else {
    showNotification("請輸入問題內容！", "error");
  }
}

// 移除問題
function removeQuestion(index) {
  questions[currentCategory].splice(index, 1);
  updateQuestionsList();
  showNotification("問題已移除！");
}

// 隨機生成問題
function randomizeQuestions() {
  const truthCount = Math.floor(Math.random() * 5) + 3; // 3-7個真心話
  const dareCount = Math.floor(Math.random() * 5) + 3; // 3-7個大冒險

  questions.truth = [];
  questions.dare = [];

  for (let i = 0; i < truthCount; i++) {
    questions.truth.push(`真心話問題範例 ${i + 1}`);
  }

  for (let i = 0; i < dareCount; i++) {
    questions.dare.push(`大冒險挑戰範例 ${i + 1}`);
  }

  updateQuestionsList();
  showNotification(`已隨機生成${truthCount}個真心話和${dareCount}個大冒險！`);
}

// 清除所有問題
function clearQuestions() {
  if (
    (questions.truth.length > 0 || questions.dare.length > 0) &&
    confirm("確定要清除所有問題嗎？")
  ) {
    questions.truth = [];
    questions.dare = [];
    updateQuestionsList();
    showNotification("所有問題已清除！");
  }
}

// 切換分類
function switchCategory(category) {
  currentCategory = category;

  // 更新按鈕狀態
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });

  updateQuestionsList();
}

// 添加到歷史記錄
function addToHistory(text) {
  const historyList = document.getElementById("history-list");
  const now = new Date();
  const timeString = now.toLocaleTimeString();

  const historyItem = document.createElement("div");
  historyItem.className = "history-item";
  historyItem.textContent = `[${timeString}] ${text}`;

  historyList.appendChild(historyItem);

  // 保存到數組
  gameHistory.push({
    time: timeString,
    text: text,
  });

  // 限制歷史記錄數量
  if (historyList.children.length > 10) {
    historyList.removeChild(historyList.firstChild);
    gameHistory.shift();
  }

  // 自動滾動到底部
  historyList.scrollTop = historyList.scrollHeight;
}

// 顯示通知
function showNotification(message, type = "success") {
  // 創建通知元素
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // 顯示通知
  setTimeout(() => {
    notification.style.opacity = "1";
  }, 10);

  // 3秒後移除通知
  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// 事件監聽器設置
function setupEventListeners() {
  // 玩家轉盤事件
  document
    .getElementById("spin-player-btn")
    .addEventListener("click", spinPlayerWheel);
  document
    .getElementById("add-player-btn")
    .addEventListener("click", addPlayer);
  document
    .getElementById("randomize-players-btn")
    .addEventListener("click", randomizePlayers);
  document
    .getElementById("clear-players-btn")
    .addEventListener("click", clearPlayers);
  document
    .getElementById("increase-count")
    .addEventListener("click", increasePlayerCount);
  document
    .getElementById("decrease-count")
    .addEventListener("click", decreasePlayerCount);

  // 按Enter鍵添加玩家
  document
    .getElementById("new-player")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        addPlayer();
      }
    });

  // 遊戲轉盤事件
  document
    .getElementById("spin-game-btn")
    .addEventListener("click", spinGameWheel);
  document
    .getElementById("add-question-btn")
    .addEventListener("click", addQuestion);
  document
    .getElementById("randomize-questions-btn")
    .addEventListener("click", randomizeQuestions);
  document
    .getElementById("clear-questions-btn")
    .addEventListener("click", clearQuestions);

  // 按Enter鍵添加問題
  document
    .getElementById("new-question")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        addQuestion();
      }
    });

  // 分類按鈕事件
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchCategory(btn.dataset.category));
  });
}

// 初始化應用
function initApp() {
  initWheels();
  updatePlayersList();
  updateQuestionsList();
  setupEventListeners();
}

// 當頁面加載完成後初始化應用
document.addEventListener("DOMContentLoaded", initApp);

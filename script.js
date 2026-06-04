let currentUser = JSON.parse(localStorage.getItem("card-site-session") || "null");
let backendAvailable = true;

const pageCache = new Map();
const persistentMusic = new Audio("assets/bg-music.mp3");
persistentMusic.loop = true;
persistentMusic.preload = "none";
persistentMusic.volume = 0.72;

let musicHasLoaded = false;
let triedAutoplay = false;
let pointerResumeBound = false;
let musicEventsBound = false;

const defaultMessages = [
  {
    name: "晓染主页",
    message: "欢迎来到我的个人主页，留言会保存在数据库里；本地预览时会临时保存在当前浏览器。",
    time: "刚刚",
  },
];

init();

async function init() {
  restoreMusicState();
  setupClientNavigation();
  bindPage();
  await loadSession();
  await setupMessages();
  prefetchPages();
  persistMusicState();
}

function bindPage() {
  updateYear();
  setupActiveNav();
  setupCopyButtons();
  setupAccountForms();
  setupMusicControls();
  setupReveal();
}

function updateYear() {
  document.querySelectorAll("#year").forEach((year) => {
    year.textContent = new Date().getFullYear();
  });
}

function setupClientNavigation() {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("a[href]");

    if (!link || !isInternalPageLink(link)) {
      return;
    }

    if (location.protocol === "file:") {
      return;
    }

    event.preventDefault();
    await navigateTo(link.dataset.page || link.getAttribute("href"));
  });

  window.addEventListener("popstate", async () => {
    await navigateTo(getPageFromHash() || "index.html", { push: false });
  });
}

function isInternalPageLink(link) {
  const href = link.getAttribute("href");

  return (
    link.dataset.page ||
    (href &&
    !href.startsWith("#") &&
    !href.startsWith("mailto:") &&
    !href.startsWith("http") &&
    href.endsWith(".html"))
  );
}

async function navigateTo(page, options = {}) {
  const normalizedPage = page || "index.html";

  try {
    const html = await fetchPage(normalizedPage);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const nextMain = parsed.querySelector("main");
    const currentMain = document.querySelector("main");

    if (!nextMain || !currentMain) {
      location.href = normalizedPage;
      return;
    }

    document.title = parsed.title || document.title;
    currentMain.replaceWith(nextMain);

    if (options.push !== false) {
      history.pushState({}, "", getHashForPage(normalizedPage));
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    bindPage();
    await setupMessages();
  } catch {
    location.href = normalizedPage;
  }
}

function getPageFromHash() {
  const map = {
    "#home": "index.html",
    "#qq": "qq.html",
    "#account": "account.html",
    "#messages": "messages.html",
    "#skills": "skills.html",
    "#awards": "awards.html",
  };

  return map[location.hash] || "";
}

function getHashForPage(page) {
  const map = {
    "index.html": "#home",
    "qq.html": "#qq",
    "account.html": "#account",
    "messages.html": "#messages",
    "skills.html": "#skills",
    "awards.html": "#awards",
  };

  return map[page] || "#home";
}

async function fetchPage(page) {
  if (pageCache.has(page)) {
    return pageCache.get(page);
  }

  const response = await fetch(page);

  if (!response.ok) {
    throw new Error("页面加载失败");
  }

  const html = await response.text();
  pageCache.set(page, html);
  return html;
}

function prefetchPages() {
  const pages = ["index.html", "qq.html", "account.html", "messages.html", "skills.html", "awards.html"];

  const run = () => {
    pages.forEach((page) => {
      if (!pageCache.has(page)) {
        fetchPage(page).catch(() => {});
      }
    });
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(run, { timeout: 1200 });
  } else {
    window.setTimeout(run, 600);
  }
}

function setupActiveNav() {
  const currentPage = location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".site-header nav a").forEach((link) => {
    const linkPage = link.getAttribute("href");
    link.classList.toggle("active", linkPage === currentPage);
  });
}

function setupCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", async () => {
      const value = button.dataset.copy;
      const copyStatus = document.querySelector("#copyStatus");

      try {
        await navigator.clipboard.writeText(value);
        if (copyStatus) {
          copyStatus.textContent = `已复制：${value}`;
        }
      } catch {
        if (copyStatus) {
          copyStatus.textContent = `复制失败，请手动复制：${value}`;
        }
      }
    });
  });
}

async function loadSession() {
  try {
    const data = await apiFetch("/api/session");
    currentUser = data.user;

    if (currentUser) {
      localStorage.setItem("card-site-session", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("card-site-session");
    }
  } catch {
    backendAvailable = false;
  }
}

function setupAccountForms() {
  const tabs = document.querySelectorAll(".tab");
  const loginForm = document.querySelector("#loginForm");
  const registerForm = document.querySelector("#registerForm");
  const accountStatus = document.querySelector("#accountStatus");

  if (!loginForm || !registerForm || !accountStatus || loginForm.dataset.bound === "true") {
    return;
  }

  loginForm.dataset.bound = "true";
  registerForm.dataset.bound = "true";

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const isLogin = tab.dataset.tab === "login";

      tabs.forEach((item) => item.classList.toggle("active", item === tab));
      loginForm.classList.toggle("hidden", !isLogin);
      registerForm.classList.toggle("hidden", isLogin);
      accountStatus.textContent = "";
    });
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = new FormData(registerForm);
    const nickname = form.get("nickname").trim();
    const email = form.get("email").trim();
    const password = form.get("password");

    if (!nickname || !email || password.length < 6) {
      accountStatus.textContent = "请填写昵称、邮箱，并设置至少 6 位密码。";
      return;
    }

    try {
      const data = await apiFetch("/api/register", {
        method: "POST",
        body: { nickname, email, password },
      });

      currentUser = data.user;
      localStorage.setItem("card-site-session", JSON.stringify(currentUser));
      accountStatus.textContent = "注册成功，正在进入留言页。";
      registerForm.reset();
      window.setTimeout(() => navigateTo("messages.html"), 500);
    } catch (error) {
      if (!backendAvailable || error.isNetwork) {
        saveLocalUser({ nickname, email, password });
        accountStatus.textContent = "本地演示注册成功，正在进入留言页。";
        registerForm.reset();
        window.setTimeout(() => navigateTo("messages.html"), 500);
        return;
      }

      accountStatus.textContent = error.message;
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = new FormData(loginForm);
    const loginName = form.get("loginName").trim();
    const password = form.get("loginPassword");

    try {
      const data = await apiFetch("/api/login", {
        method: "POST",
        body: { loginName, password },
      });

      currentUser = data.user;
      localStorage.setItem("card-site-session", JSON.stringify(currentUser));
      accountStatus.textContent = `欢迎回来，${currentUser.nickname}，正在进入留言页。`;
      loginForm.reset();
      window.setTimeout(() => navigateTo("messages.html"), 500);
    } catch (error) {
      if (!backendAvailable || error.isNetwork) {
        const localUser = loginLocalUser(loginName, password);

        if (localUser) {
          currentUser = localUser;
          localStorage.setItem("card-site-session", JSON.stringify(currentUser));
          accountStatus.textContent = `本地演示登录成功：${currentUser.nickname}`;
          loginForm.reset();
          window.setTimeout(() => navigateTo("messages.html"), 500);
          return;
        }
      }

      accountStatus.textContent = error.message || "账号或密码不对。";
    }
  });
}

async function setupMessages() {
  const messageForm = document.querySelector("#messageForm");
  const messageList = document.querySelector("#messageList");
  const messageGate = document.querySelector("#messageGate");

  if (!messageForm || !messageList || !messageGate) {
    return;
  }

  updateMessageGate();
  await renderMessages();

  if (messageForm.dataset.bound === "true") {
    return;
  }

  messageForm.dataset.bound = "true";
  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      messageGate.textContent = "还没登录，先注册或登录后再留言。";
      return;
    }

    const form = new FormData(messageForm);
    const name = form.get("name").trim() || currentUser.nickname;
    const message = form.get("message").trim();

    if (!message) {
      return;
    }

    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: { name, message },
      });
    } catch (error) {
      if (!backendAvailable || error.isNetwork) {
        const messages = getLocalMessages();
        messages.unshift({
          name,
          message,
          time: new Date().toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        saveLocalMessages(messages.slice(0, 8));
      } else {
        messageGate.textContent = error.message;
        return;
      }
    }

    messageForm.reset();
    await renderMessages();
  });
}

function updateMessageGate() {
  const messageForm = document.querySelector("#messageForm");
  const messageGate = document.querySelector("#messageGate");

  if (!messageForm || !messageGate) {
    return;
  }

  const isLoggedIn = Boolean(currentUser);
  const inputs = messageForm.querySelectorAll("input, textarea, button");

  inputs.forEach((input) => {
    input.disabled = !isLoggedIn;
  });

  if (isLoggedIn) {
    messageGate.textContent = backendAvailable
      ? `已登录：${currentUser.nickname}，可以发送留言。`
      : `本地演示登录：${currentUser.nickname}，上线绑定 D1 后会写入数据库。`;
    return;
  }

  messageGate.textContent = "请先在登录页注册或登录，登录后这里会开放留言。";
}

async function renderMessages() {
  const messageList = document.querySelector("#messageList");

  if (!messageList) {
    return;
  }

  const messages = await getMessages();
  messageList.innerHTML = messages
    .map(
      (item) => `
        <article class="message-item">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.time)}</small>
          <p>${escapeHtml(item.message)}</p>
        </article>
      `
    )
    .join("");
}

async function getMessages() {
  try {
    const data = await apiFetch("/api/messages");
    return data.messages.length ? data.messages : defaultMessages;
  } catch {
    backendAvailable = false;
    return getLocalMessages();
  }
}

function getLocalMessages() {
  return JSON.parse(localStorage.getItem("card-site-messages") || "null") || defaultMessages;
}

function saveLocalMessages(messages) {
  localStorage.setItem("card-site-messages", JSON.stringify(messages));
}

function saveLocalUser(user) {
  localStorage.setItem("card-site-user", JSON.stringify(user));
  currentUser = { nickname: user.nickname, email: user.email };
  localStorage.setItem("card-site-session", JSON.stringify(currentUser));
}

function loginLocalUser(loginName, password) {
  const savedUser = JSON.parse(localStorage.getItem("card-site-user") || "null");

  if (!savedUser) {
    return null;
  }

  const matched =
    (loginName === savedUser.email || loginName === savedUser.nickname) &&
    password === savedUser.password;

  return matched ? { nickname: savedUser.nickname, email: savedUser.email } : null;
}

async function apiFetch(path, options = {}) {
  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiError = new Error(data.error || "服务器暂时不可用。");
      apiError.isApi = true;
      throw apiError;
    }

    backendAvailable = true;
    return data;
  } catch (error) {
    if (error.isApi) {
      throw error;
    }

    error.isNetwork = true;
    throw error;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return map[char];
  });
}

function setupMusicControls() {
  ensureFloatingMusicControls();

  const pageAudio = document.querySelector("#bgMusic");
  const controls = document.querySelectorAll("[data-music-toggle], #musicToggle");
  const statuses = document.querySelectorAll("[data-music-status], #musicStatus");

  if (pageAudio) {
    pageAudio.hidden = true;
    pageAudio.controls = false;
  }

  statuses.forEach((status) => {
    status.textContent = persistentMusic.paused ? "" : "音乐播放中";
  });

  controls.forEach((musicToggle) => {
    if (musicToggle.dataset.bound === "true") {
      return;
    }

    musicToggle.dataset.bound = "true";
    musicToggle.addEventListener("click", async () => {
      if (persistentMusic.paused) {
        await playMusic();
      } else {
        persistentMusic.pause();
        localStorage.setItem("card-site-music-playing", "false");
        setMusicStatus("音乐已暂停");
        updateMusicControls();
      }
    });
  });

  if (!musicEventsBound) {
    musicEventsBound = true;
    persistentMusic.addEventListener("play", updateMusicControls);
    persistentMusic.addEventListener("pause", updateMusicControls);
  }
  updateMusicControls();

  if (!triedAutoplay) {
    triedAutoplay = true;
    window.setTimeout(() => {
      if (localStorage.getItem("card-site-music-playing") !== "false") {
        playMusic();
      }
    }, 500);
  }

  bindPointerResume();
}

function ensureFloatingMusicControls() {
  if (document.querySelector("#floatingMusic")) {
    return;
  }

  const floating = document.createElement("div");
  floating.id = "floatingMusic";
  floating.className = "floating-music";
  floating.innerHTML = `
    <button class="button secondary" type="button" data-music-toggle>播放音乐</button>
  `;
  document.body.append(floating);
}

async function playMusic() {
  try {
    if (!musicHasLoaded) {
      persistentMusic.load();
      musicHasLoaded = true;
    }

    persistentMusic.muted = false;
    await persistentMusic.play();
    localStorage.setItem("card-site-music-playing", "true");
    setMusicStatus("音乐播放中");
  } catch {
    setMusicStatus("浏览器拦截了自动播放，请点播放按钮");
  } finally {
    updateMusicControls();
  }
}

function updateMusicControls() {
  document.querySelectorAll("[data-music-toggle], #musicToggle").forEach((musicToggle) => {
    musicToggle.textContent = persistentMusic.paused ? "播放音乐" : "暂停音乐";
  });
}

function setMusicStatus(text) {
  document.querySelectorAll("[data-music-status], #musicStatus").forEach((status) => {
    status.textContent = text;
  });
}

function restoreMusicState() {
  const savedTime = Number(localStorage.getItem("card-site-music-time") || "0");

  if (Number.isFinite(savedTime) && savedTime > 0) {
    persistentMusic.currentTime = savedTime;
  }
}

function persistMusicState() {
  persistentMusic.addEventListener("timeupdate", () => {
    if (!persistentMusic.paused && Number.isFinite(persistentMusic.currentTime)) {
      localStorage.setItem("card-site-music-time", String(persistentMusic.currentTime));
    }
  });

  window.addEventListener("pagehide", () => {
    if (Number.isFinite(persistentMusic.currentTime)) {
      localStorage.setItem("card-site-music-time", String(persistentMusic.currentTime));
    }
  });
}

function bindPointerResume() {
  if (pointerResumeBound) {
    return;
  }

  pointerResumeBound = true;
  window.addEventListener("pointerdown", () => {
    if (persistentMusic.paused && localStorage.getItem("card-site-music-playing") !== "false") {
      playMusic();
    }
  });
}

function setupReveal() {
  document.querySelectorAll(".music-player, .section").forEach((item) => {
    item.classList.add("is-visible");
  });
}

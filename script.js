let currentUser = JSON.parse(localStorage.getItem("card-site-session") || "null");
let backendAvailable = true;
let sessionReady = false;

const pageCache = new Map();
const persistentMusic = new Audio("assets/bg-music.mp3");
persistentMusic.loop = true;
persistentMusic.preload = "auto";
persistentMusic.volume = 0.72;

let musicEventsBound = false;
let musicAutoplayTried = false;
let musicGestureBound = false;

const defaultMessages = [
  {
    name: "晓染主页",
    message: "欢迎来到我的个人主页。",
    time: "刚刚",
  },
];

init();

async function init() {
  restoreMusicState();
  setupClientNavigation();
  bindPage();
  if (!isStaticPreview()) {
    await loadSession();
  } else {
    currentUser = JSON.parse(localStorage.getItem("card-site-session") || "null");
  }
  sessionReady = true;
  await handleEntryGate();
  updateNavAuthLink();
  await setupMessages();
  await routeInitialHash();
  tryAutoplayMusic();
  prefetchPages();
}

function bindPage() {
  updateBodyStateClasses();
  updateYear();
  setupActiveNav();
  updateNavAuthLink();
  setupCopyButtons();
  setupAccountForms();
  setupGuestEntry();
  setupLogout();
  setupMusicControls();
  setupAdminDashboard();
  setupReveal();
}

function updateBodyStateClasses() {
  document.body.classList.toggle("has-home-main", Boolean(document.querySelector(".home-main")));
  document.body.classList.toggle("has-card-grid", Boolean(document.querySelector(".card-grid")));
  document.body.classList.toggle("has-message-layout", Boolean(document.querySelector(".message-layout")));
  document.body.classList.toggle("has-skills-page", Boolean(document.querySelector("#skills")));
  document.body.classList.toggle("has-awards-page", Boolean(document.querySelector("#awards")));
  document.body.classList.toggle("has-entry-page", Boolean(document.querySelector(".entry-shell")));
  document.body.classList.toggle("has-admin-page", Boolean(document.querySelector("#adminDashboard")));
}

function updateYear() {
  document.querySelectorAll("#year").forEach((year) => {
    year.textContent = new Date().getFullYear();
  });
}

function setupClientNavigation() {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("a[href]");

    if (!link || !isInternalPageLink(link) || location.protocol === "file:") {
      return;
    }

    event.preventDefault();
    await navigateTo(link.dataset.page || link.getAttribute("href"));
  });

  window.addEventListener("popstate", async () => {
    await navigateTo(getPageFromHash() || "home.html", { push: false });
  });
}

async function handleEntryGate() {
  const currentPage = getCurrentPage();

  if (currentPage !== "index.html" && !currentUser && !isGuest()) {
    await navigateTo("index.html", { replace: true, fullPath: true });
    return;
  }

  if (currentPage === "index.html" && (currentUser || isGuest())) {
    await navigateTo("home.html", { replace: true, fullPath: true });
  }
}

function isInternalPageLink(link) {
  const href = link.getAttribute("href");

  if (link.dataset.authAction) {
    return false;
  }

  return (
    link.dataset.page ||
    (href &&
      !href.startsWith("mailto:") &&
      !href.startsWith("http") &&
      (href.endsWith(".html") || href.startsWith("#")))
  );
}

async function navigateTo(page, options = {}) {
  const normalizedPage = normalizePage(page || "home.html");

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
    syncOptionalElement("header.site-header", parsed);
    currentMain.replaceWith(nextMain);
    syncOptionalElement("footer", parsed);
    document.body.className = parsed.body.className;

    const nextUrl = options.fullPath === true ? getFullUrlForPage(normalizedPage) : getHashForPage(normalizedPage);

    if (options.replace === true) {
      history.replaceState({}, "", nextUrl);
    } else if (options.push !== false) {
      history.pushState({}, "", getHashForPage(normalizedPage));
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    bindPage();
    await setupMessages();
  } catch {
    location.href = normalizedPage;
  }
}

async function routeInitialHash() {
  const hashPage = getPageFromHash();

  if (hashPage && hashPage !== getCurrentPage()) {
    await navigateTo(hashPage, { push: false });
    return;
  }

  setupActiveNav();
}

function syncOptionalElement(selector, parsed) {
  const next = parsed.querySelector(selector);
  const current = document.querySelector(selector);

  if (next && current) {
    current.replaceWith(next);
    return;
  }

  if (next && !current) {
    const main = document.querySelector("main");

    if (selector.startsWith("header")) {
      document.body.insertBefore(next, main);
    } else {
      document.body.append(next);
    }
    return;
  }

  if (!next && current) {
    current.remove();
  }
}

function getPageFromHash() {
  const map = {
    "#entry": "index.html",
    "#home": "home.html",
    "#school": "school.html",
    "#qq": "school.html",
    "#account": "index.html",
    "#messages": "messages.html",
    "#skills": "skills.html",
    "#awards": "awards.html",
    "#admin": "admin.html",
  };

  return map[location.hash.toLowerCase()] || "";
}

function getHashForPage(page) {
  const map = {
    "index.html": "#entry",
    "home.html": "#home",
    "school.html": "#school",
    "qq.html": "#school",
    "account.html": "#entry",
    "messages.html": "#messages",
    "skills.html": "#skills",
    "awards.html": "#awards",
    "admin.html": "#admin",
  };

  return map[normalizePage(page)] || "#home";
}

function getFullUrlForPage(page) {
  const normalizedPage = normalizePage(page);
  return `${normalizedPage}${getHashForPage(normalizedPage)}`;
}

function normalizePage(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^#/, "")
    .replace(/^\//, "")
    .split("?")[0]
    .toLowerCase();
  if (raw === "logout") {
    return "logout";
  }
  const name = raw.endsWith(".html") ? raw : `${raw || "home"}.html`;
  const aliases = {
    "account.html": "index.html",
    "entry.html": "index.html",
    "qq.html": "school.html",
  };

  return aliases[name] || name;
}

function getCurrentPage() {
  return normalizePage(location.pathname.split("/").pop() || "index.html");
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
  const pages = ["index.html", "home.html", "school.html", "messages.html", "skills.html", "awards.html", "admin.html"];

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
  const currentPage = getPageFromHash() || getCurrentPage();

  document.querySelectorAll(".site-header nav a").forEach((link) => {
    const linkPage = normalizePage(link.dataset.page || link.getAttribute("href"));
    const isActive = linkPage === currentPage;

    link.classList.toggle("active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function updateNavAuthLink() {
  document.querySelectorAll(".site-header nav").forEach((nav) => {
    let authLink = nav.querySelector("[data-auth-action]");
    const oldEntry = nav.querySelector('a[data-page="index.html"]');

    if (!authLink && oldEntry) {
      authLink = oldEntry;
      authLink.dataset.authAction = "logout";
      authLink.removeAttribute("data-page");
      authLink.setAttribute("href", "#logout");
    }

    if (!authLink && !document.body.classList.contains("entry-page")) {
      authLink = document.createElement("a");
      authLink.href = "#logout";
      authLink.dataset.authAction = "logout";
      nav.append(authLink);
    }

    if (authLink) {
      authLink.textContent = currentUser || isGuest() ? "登出" : "登录";
      authLink.setAttribute("aria-label", currentUser || isGuest() ? "退出登录" : "返回登录入口");
    }
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
        setText(copyStatus, `已复制：${value}`);
      } catch {
        setText(copyStatus, `复制失败：${value}`);
      }
    });
  });
}

async function loadSession() {
  if (isStaticPreview()) {
    backendAvailable = false;
    return;
  }

  try {
    const data = await apiFetch("/api/session");
    currentUser = data.user;

    if (currentUser) {
      localStorage.setItem("card-site-session", JSON.stringify(currentUser));
      localStorage.removeItem("card-site-guest");
    } else if (!isGuest()) {
      localStorage.removeItem("card-site-session");
    }
  } catch {
    backendAvailable = false;
  }
}

function setupGuestEntry() {
  document.querySelectorAll("[data-guest-login]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      currentUser = null;
      localStorage.removeItem("card-site-session");
      localStorage.setItem("card-site-guest", "true");
      updateNavAuthLink();
      navigateTo("home.html", { replace: true, fullPath: true });
    });
  });
}

function setupLogout() {
  document.querySelectorAll("[data-auth-action='logout']").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      await logoutUser();
    });
  });
}

async function logoutUser() {
  if (!isStaticPreview()) {
    await apiFetch("/api/logout", { method: "POST" }).catch(() => {});
  }

  currentUser = null;
  localStorage.removeItem("card-site-session");
  localStorage.removeItem("card-site-guest");
  updateNavAuthLink();
  await navigateTo("index.html", { replace: true, fullPath: true });
}

function isGuest() {
  return localStorage.getItem("card-site-guest") === "true" && !currentUser;
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
      tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
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
      accountStatus.textContent = "请补全账号信息";
      return;
    }

    try {
      const data = await apiFetch("/api/register", {
        method: "POST",
        body: { nickname, email, password },
      });

      currentUser = data.user;
      localStorage.setItem("card-site-session", JSON.stringify(currentUser));
      localStorage.removeItem("card-site-guest");
      updateNavAuthLink();
      accountStatus.textContent = "已进入";
      registerForm.reset();
      window.setTimeout(() => navigateTo("home.html", { replace: true, fullPath: true }), 280);
    } catch (error) {
      accountStatus.textContent = error.isNetwork ? "服务暂不可用，请稍后再试" : error.message;
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
      localStorage.removeItem("card-site-guest");
      updateNavAuthLink();
      accountStatus.textContent = "已进入";
      loginForm.reset();
      window.setTimeout(() => navigateTo("home.html", { replace: true, fullPath: true }), 280);
    } catch (error) {
      accountStatus.textContent = error.isNetwork ? "服务暂不可用，请稍后再试" : error.message || "账号或密码不对";
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
      messageGate.textContent = isGuest() ? "游客不可发送私信" : "未登录";
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
      messageGate.textContent = error.isNetwork ? "服务暂不可用，请稍后再试" : error.message;
      return;
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

  const canSend = Boolean(currentUser);
  const inputs = messageForm.querySelectorAll("input, textarea, button");

  inputs.forEach((input) => {
    input.disabled = !canSend;
  });

  messageForm.querySelectorAll("[data-required-when-active]").forEach((input) => {
    input.toggleAttribute("required", canSend);
  });

  messageGate.innerHTML = canSend
    ? `已登录：${escapeHtml(currentUser.nickname)}`
    : isGuest()
      ? `游客模式不可发送私信，<a href="#entry" data-page="index.html">登录或注册</a>`
      : `未登录，<a href="#entry" data-page="index.html">登录或注册</a>`;
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
          <div class="message-meta">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.time)}</small>
            </div>
            ${canDeleteMessage(item) ? `<button class="message-delete" type="button" data-delete-message="${escapeHtml(item.id)}">删除</button>` : ""}
          </div>
          <p>${escapeHtml(item.message)}</p>
        </article>
      `
    )
    .join("");

  messageList.querySelectorAll("[data-delete-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteMessage(button.dataset.deleteMessage);
    });
  });
}

async function getMessages() {
  if (isStaticPreview()) {
    return defaultMessages;
  }

  try {
    const data = await apiFetch("/api/messages");
    return data.messages.length ? data.messages : defaultMessages;
  } catch {
    backendAvailable = false;
    return defaultMessages;
  }
}

function canDeleteMessage(item) {
  if (!currentUser || !item.id) {
    return false;
  }

  return !item.userId || item.userId === currentUser.id || item.userId === "local";
}

async function deleteMessage(id) {
  const messageGate = document.querySelector("#messageGate");

  try {
    await apiFetch(`/api/messages?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch (error) {
    setText(messageGate, error.isNetwork ? "服务暂不可用，请稍后再试" : error.message);
    return;
  }

  await renderMessages();
}

async function setupAdminDashboard() {
  const dashboard = document.querySelector("#adminDashboard");

  if (!dashboard) {
    return;
  }

  const status = document.querySelector("#adminStatus");

  if (isStaticPreview()) {
    renderAdminSummary();
    renderAdminUsers([]);
    renderAdminMessages([]);
    setText(status, "本地静态预览不运行管理接口。");
    return;
  }

  try {
    const [summary, users, messages] = await Promise.all([
      apiFetch("/api/admin/summary"),
      apiFetch("/api/admin/users"),
      apiFetch("/api/admin/messages"),
    ]);

    renderAdminSummary(summary);
    renderAdminUsers(users.users || []);
    renderAdminMessages(messages.messages || []);
    setText(status, summary.admin ? `当前管理员：${summary.admin.nickname}` : "");
  } catch (error) {
    renderAdminSummary();
    renderAdminUsers([]);
    renderAdminMessages([]);
    setText(status, error.message || "请用管理员账号登录后查看。");
  }
}

function renderAdminSummary(summary = null) {
  const stats = document.querySelector("#adminStats");

  if (!stats) {
    return;
  }

  const totals = summary?.totals || { users: "-", messages: "-", sessions: "-" };
  stats.innerHTML = `
    <div><strong>${escapeHtml(totals.users)}</strong><span>用户</span></div>
    <div><strong>${escapeHtml(totals.messages)}</strong><span>留言</span></div>
    <div><strong>${escapeHtml(totals.sessions)}</strong><span>会话</span></div>
  `;
}

function renderAdminUsers(users) {
  const list = document.querySelector("#adminUsers");

  if (!list) {
    return;
  }

  list.innerHTML = users.length
    ? users
        .map(
          (user) => `
            <article class="admin-item">
              <div>
                <strong>${escapeHtml(user.nickname)}</strong>
                <span>${escapeHtml(user.email)}</span>
              </div>
              <time>${escapeHtml(user.time)}</time>
            </article>
          `
        )
        .join("")
    : `<p class="admin-empty">暂无用户</p>`;
}

function renderAdminMessages(messages) {
  const list = document.querySelector("#adminMessages");

  if (!list) {
    return;
  }

  list.innerHTML = messages.length
    ? messages
        .map(
          (item) => `
            <article class="admin-item admin-message-item">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.email || item.time)}</span>
                <p>${escapeHtml(item.message)}</p>
              </div>
              <button class="message-delete" type="button" data-admin-delete-message="${escapeHtml(item.id)}">删除</button>
            </article>
          `
        )
        .join("")
    : `<p class="admin-empty">暂无留言</p>`;

  list.querySelectorAll("[data-admin-delete-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteAdminMessage(button.dataset.adminDeleteMessage);
    });
  });
}

async function deleteAdminMessage(id) {
  const status = document.querySelector("#adminStatus");

  try {
    await apiFetch(`/api/admin/messages?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setText(status, "已删除留言。");
    await setupAdminDashboard();
  } catch (error) {
    setText(status, error.message || "删除失败。");
  }
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
      const apiError = new Error(data.error || "服务暂不可用");
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

function isStaticPreview() {
  return ["127.0.0.1", "localhost"].includes(location.hostname);
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
  const music = getMusic();

  if (pageAudio) {
    pageAudio.remove();
  }

  statuses.forEach((status) => {
    status.textContent = music.paused ? "" : "音乐播放中";
  });

  controls.forEach((musicToggle) => {
    if (musicToggle.dataset.bound === "true") {
      return;
    }

    musicToggle.dataset.bound = "true";
    musicToggle.addEventListener("click", async () => {
      if (music.paused) {
        await playMusic();
      } else {
        music.pause();
        localStorage.setItem("card-site-music-playing", "false");
        setMusicStatus("音乐已暂停");
        updateMusicControls();
      }
    });
  });

  if (!musicEventsBound) {
    musicEventsBound = true;
    music.addEventListener("play", updateMusicControls);
    music.addEventListener("pause", updateMusicControls);
    music.addEventListener("timeupdate", persistMusicTime);
    window.addEventListener("pagehide", persistMusicTime);
  }

  updateMusicControls();
}

function getMusic() {
  return persistentMusic;
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
  const music = getMusic();

  try {
    music.preload = "auto";
    music.muted = false;
    await music.play();
    localStorage.setItem("card-site-music-playing", "true");
    setMusicStatus("音乐播放中");
  } catch {
    setMusicStatus("点击后播放");
  } finally {
    updateMusicControls();
  }
}

async function tryAutoplayMusic() {
  if (musicAutoplayTried) {
    return;
  }

  musicAutoplayTried = true;

  const wantsMusic = localStorage.getItem("card-site-music-playing") !== "false";

  if (wantsMusic) {
    await playMusic();
    bindMusicGestureResume();
  }
}

function bindMusicGestureResume() {
  if (musicGestureBound || localStorage.getItem("card-site-music-playing") === "false") {
    return;
  }

  musicGestureBound = true;

  const resume = async () => {
    if (getMusic().paused) {
      await playMusic();
    }

    if (!getMusic().paused) {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("touchstart", resume);
    }
  };

  window.addEventListener("pointerdown", resume, { passive: true });
  window.addEventListener("keydown", resume);
  window.addEventListener("touchstart", resume, { passive: true });
}

function updateMusicControls() {
  const music = getMusic();

  document.querySelectorAll("[data-music-toggle], #musicToggle").forEach((musicToggle) => {
    musicToggle.textContent = music.paused ? "播放音乐" : "暂停音乐";
  });
}

function setMusicStatus(text) {
  document.querySelectorAll("[data-music-status], #musicStatus").forEach((status) => {
    status.textContent = text;
  });
}

function persistMusicTime() {
  const music = getMusic();

  if (Number.isFinite(music.currentTime)) {
    localStorage.setItem("card-site-music-time", String(music.currentTime));
  }
}

function restoreMusicState() {
  const savedTime = Number(localStorage.getItem("card-site-music-time") || "0");

  if (Number.isFinite(savedTime) && savedTime > 0) {
    persistentMusic.currentTime = savedTime;
  }
}

function setupReveal() {
  document.querySelectorAll(".reveal-card, .section").forEach((item) => {
    item.classList.add("is-visible");
  });
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

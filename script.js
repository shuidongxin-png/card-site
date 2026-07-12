let currentUser = JSON.parse(localStorage.getItem("card-site-session") || "null");
let backendAvailable = true;
let sessionReady = false;
let adminAccess = false;
let adminAccessCheckedFor = "";
let adminAccessChecking = false;

const pageCache = new Map();
let persistentMusic = null;

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
  bindPage();
  updateNavAuthLink();
  await setupMessages();
  await routeInitialHash();
  await setupGallerySections();
  // Don't auto-download music on first paint; wait for user gesture via controls
  updateMusicControls();
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
  setupGalleryUploadUI();
  setupReveal();
  // Gallery render is async; kick it after SPA swaps too
  setupGallerySections();
}

function updateBodyStateClasses() {
  document.body.classList.toggle("has-home-main", Boolean(document.querySelector(".home-main")));
  document.body.classList.toggle(
    "has-card-grid",
    Boolean(document.querySelector(".card-grid, .skills-masonry, .skills-bento, .awards-layout, .awards-wall"))
  );
  document.body.classList.toggle("has-message-layout", Boolean(document.querySelector(".message-layout")));
  document.body.classList.toggle("has-skills-page", Boolean(document.querySelector("#skills")));
  document.body.classList.toggle("has-awards-page", Boolean(document.querySelector("#awards")));
  document.body.classList.toggle("has-fitness-page", Boolean(document.querySelector("#fitness")));
  document.body.classList.toggle(
    "has-entry-page",
    Boolean(document.querySelector(".entry-split, .entry-shell, .entry-page"))
  );
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

  if (currentPage === "admin.html" && !currentUser) {
    await navigateTo("index.html", { replace: true, fullPath: true });
    return;
  }

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
    "#fitness": "fitness.html",
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
    "fitness.html": "#fitness",
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
  // Only warm pages the user is likely to open next — avoid pulling everything on first paint
  const current = getCurrentPage();
  const all = ["home.html", "skills.html", "awards.html", "fitness.html", "school.html", "messages.html"];
  const pages = all.filter((page) => page !== current).slice(0, 3);

  const run = () => {
    pages.forEach((page) => {
      if (!pageCache.has(page)) {
        fetchPage(page).catch(() => {});
      }
    });
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 1500);
  }
}

function setupActiveNav() {
  const currentPage = getPageFromHash() || getCurrentPage();
  let activeLink = null;

  document.querySelectorAll(".site-header nav a").forEach((link) => {
    const linkPage = normalizePage(link.dataset.page || link.getAttribute("href"));
    const isActive = linkPage === currentPage;

    link.classList.toggle("active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
      activeLink = link;
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (activeLink) {
    const nav = activeLink.closest("nav");

    if (nav && nav.scrollWidth > nav.clientWidth) {
      requestAnimationFrame(() => {
        nav.scrollLeft = activeLink.offsetLeft - (nav.clientWidth - activeLink.clientWidth) / 2;
      });
    }
  }
}

function updateNavAuthLink() {
  document.querySelectorAll(".site-header nav").forEach((nav) => {
    let authLink = nav.querySelector("[data-auth-action]");
    const oldEntry = nav.querySelector('a[data-page="index.html"]');
    let adminLink = nav.querySelector('a[data-page="admin.html"]');

    if (!authLink && oldEntry) {
      authLink = oldEntry;
      authLink.dataset.authAction = "logout";
      authLink.removeAttribute("data-page");
      authLink.setAttribute("href", "#logout");
    }

    if (!adminAccess && adminLink) {
      adminLink.remove();
      adminLink = null;
    }

    if (adminAccess && !adminLink) {
      adminLink = document.createElement("a");
      adminLink.href = "#admin";
      adminLink.dataset.page = "admin.html";
      adminLink.textContent = "管理";
      adminLink.setAttribute("aria-label", "进入管理面板");

      if (authLink) {
        nav.insertBefore(adminLink, authLink);
      } else {
        nav.append(adminLink);
      }
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

  setupActiveNav();
  checkAdminAccess();
}

async function checkAdminAccess() {
  if (isStaticPreview() || !currentUser || isGuest()) {
    adminAccess = false;
    adminAccessCheckedFor = "";
    return;
  }

  const email = String(currentUser.email || "").toLowerCase();

  if (!email || adminAccessCheckedFor === email || adminAccessChecking) {
    return;
  }

  adminAccessChecking = true;

  try {
    await apiFetch("/api/admin/summary");
    adminAccess = true;
  } catch {
    adminAccess = false;
  } finally {
    adminAccessCheckedFor = email;
    adminAccessChecking = false;
    updateNavAuthLink();
    setupGalleryUploadUI();
    // Re-render dynamic cards so delete buttons appear for admins
    setupGallerySections();
  }
}

function resetAdminAccess() {
  adminAccess = false;
  adminAccessCheckedFor = "";
  adminAccessChecking = false;
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
      resetAdminAccess();
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
  resetAdminAccess();
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

  setupPasswordToggles();
  setupEntryFieldFocus();

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
      resetAdminAccess();
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
      resetAdminAccess();
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

function setupPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const field = button.closest(".password-field");
      const input = field?.querySelector("input");
      const eye = button.querySelector(".icon-eye");
      const eyeOff = button.querySelector(".icon-eye-off");

      if (!input) {
        return;
      }

      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
      eye?.classList.toggle("hidden", show);
      eyeOff?.classList.toggle("hidden", !show);
      document.body.classList.toggle("entry-password-visible", show && document.body.classList.contains("has-entry-page"));
    });
  });
}

function setupEntryFieldFocus() {
  document.querySelectorAll("[data-entry-field]").forEach((input) => {
    if (input.dataset.focusBound === "true") {
      return;
    }

    input.dataset.focusBound = "true";
    input.addEventListener("focus", () => {
      document.body.classList.add("entry-typing");
    });
    input.addEventListener("blur", () => {
      document.body.classList.remove("entry-typing");
    });
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

  if (!sessionReady) {
    return;
  }

  const status = document.querySelector("#adminStatus");
  setupGalleryUploadUI();

  if (isStaticPreview()) {
    renderAdminSummary();
    renderAdminUsers([]);
    renderAdminMessages([]);
    renderAdminGallery(loadLocalGallery());
    setText(status, "本地静态预览：上传会暂存浏览器，不写云端。");
    return;
  }

  try {
    const [summary, users, messages, gallery] = await Promise.all([
      apiFetch("/api/admin/summary"),
      apiFetch("/api/admin/users"),
      apiFetch("/api/admin/messages"),
      apiFetch("/api/admin/gallery").catch(() => ({ items: [] })),
    ]);

    renderAdminSummary(summary);
    renderAdminUsers(users.users || []);
    renderAdminMessages(messages.messages || []);
    renderAdminGallery(gallery.items || []);
    setText(status, summary.admin ? `当前管理员：${summary.admin.nickname}` : "");
  } catch (error) {
    renderAdminSummary();
    renderAdminUsers([]);
    renderAdminMessages([]);
    renderAdminGallery([]);
    setText(status, error.message || "请用管理员账号登录后查看。");
  }
}

function renderAdminGallery(items) {
  const list = document.querySelector("#adminGalleryList");
  const status = document.querySelector("#adminGalleryStatus");

  if (!list) {
    return;
  }

  if (!items.length) {
    list.innerHTML = `<p class="status">还没有通过上传新增的作品 / 证书。</p>`;
    setText(status, "");
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
      <article class="admin-item admin-gallery-item">
        <img src="${escapeHtml(item.imageUrl)}" alt="" width="64" height="64" loading="lazy" />
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.kind)} · ${escapeHtml(item.tag || "")}</span>
        </div>
        ${
          adminAccess || isStaticPreview()
            ? `<button class="message-delete" type="button" data-gallery-delete="${escapeHtml(item.id)}">删除</button>`
            : ""
        }
      </article>
    `
    )
    .join("");

  list.querySelectorAll("[data-gallery-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.galleryDelete;
      const row = items.find((item) => String(item.id) === String(id));
      await deleteGalleryItem(id, row?.kind || "skill");
      await setupAdminDashboard();
    });
  });

  setText(status, `共 ${items.length} 条动态图库记录`);
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
    const isForm = options.formData === true || (typeof FormData !== "undefined" && options.body instanceof FormData);
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: isForm || !options.body ? undefined : { "Content-Type": "application/json" },
      body: options.body ? (isForm ? options.body : JSON.stringify(options.body)) : undefined,
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
  // file:// or plain static server without Pages Functions
  return location.protocol === "file:" || ["127.0.0.1", "localhost"].includes(location.hostname);
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
  if (!persistentMusic) {
    // Defer loading ~700KB audio until the user actually interacts with music
    persistentMusic = new Audio("assets/bg-music.mp3");
    persistentMusic.loop = true;
    persistentMusic.preload = "none";
    persistentMusic.volume = 0.72;
    restoreMusicState();
  }

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
  if (!persistentMusic) {
    return;
  }

  const savedTime = Number(localStorage.getItem("card-site-music-time") || "0");

  if (Number.isFinite(savedTime) && savedTime > 0) {
    persistentMusic.currentTime = savedTime;
  }
}

/* ========== Gallery upload (skills / awards) → D1 + R2 ========== */

const GALLERY_LOCAL_KEY = "card-site-gallery-items";

async function setupGallerySections() {
  const skillsMount = document.querySelector("[data-gallery-mount='skill']");
  const awardsMount = document.querySelector("[data-gallery-mount='award']");

  if (!skillsMount && !awardsMount) {
    return;
  }

  if (skillsMount) {
    await renderGalleryMount(skillsMount, "skill");
  }

  if (awardsMount) {
    await renderGalleryMount(awardsMount, "award");
  }

  setupGalleryUploadUI();
  setupAosAnimations();
}

async function renderGalleryMount(mount, kind) {
  const items = await getGalleryItems(kind);
  const staticCount = Number(mount.dataset.staticCount || "0");
  const total = staticCount + items.length;

  document.querySelectorAll(`[data-gallery-count='${kind}']`).forEach((el) => {
    el.textContent = String(total).padStart(2, "0");
  });

  // Remove previously injected dynamic cards (keep static HTML + upload slot)
  mount.querySelectorAll("[data-gallery-id]").forEach((node) => node.remove());

  const uploadSlot = mount.querySelector("[data-gallery-upload]");
  const fragment = document.createDocumentFragment();

  items.forEach((item, index) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = renderGalleryCard(item, kind, index).trim();
    const card = wrap.firstElementChild;

    if (!card) {
      return;
    }

    card.querySelectorAll("[data-gallery-delete]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await deleteGalleryItem(button.dataset.galleryDelete, kind);
      });
    });

    fragment.appendChild(card);
  });

  if (uploadSlot) {
    mount.insertBefore(fragment, uploadSlot);
  } else {
    mount.appendChild(fragment);
  }
}

function renderGalleryCard(item, kind, index) {
  const delay = Math.min(index * 80, 400);
  const canDelete = Boolean(adminAccess);
  const deleteBtn = canDelete
    ? `<button class="gallery-delete" type="button" data-gallery-delete="${escapeHtml(item.id)}" aria-label="删除">删除</button>`
    : "";

  if (kind === "skill") {
    return `
      <article class="poster-card glass-panel" data-aos="fade-up" data-aos-delay="${delay}" data-gallery-id="${escapeHtml(item.id)}">
        <div class="poster-frame">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
        </div>
        <div class="poster-caption">
          <span class="tag">${escapeHtml(item.tag || "作品")}</span>
          <h2>${escapeHtml(item.title)}</h2>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
          ${deleteBtn}
        </div>
      </article>
    `;
  }

  return `
    <article class="award-tile glass-panel" data-aos="flip-up" data-aos-delay="${delay}" data-gallery-id="${escapeHtml(item.id)}">
      <div class="award-tile-media">
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
      </div>
      <div class="award-tile-body">
        <span class="tag">${escapeHtml(item.tag || "证书")}</span>
        <h2>${escapeHtml(item.title)}</h2>
        ${deleteBtn}
      </div>
    </article>
  `;
}

async function getGalleryItems(kind) {
  if (isStaticPreview()) {
    return loadLocalGallery().filter((item) => item.kind === kind);
  }

  try {
    const data = await apiFetch(`/api/gallery?kind=${encodeURIComponent(kind)}`);
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    // Offline / API not migrated yet — fall back to browser-local uploads
    return loadLocalGallery().filter((item) => item.kind === kind);
  }
}

function loadLocalGallery() {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalGallery(items) {
  localStorage.setItem(GALLERY_LOCAL_KEY, JSON.stringify(items));
}

function setupGalleryUploadUI() {
  document.querySelectorAll("[data-gallery-upload]").forEach((slot) => {
    if (slot.dataset.bound === "true") {
      return;
    }

    slot.dataset.bound = "true";
    const kind = slot.dataset.galleryUpload;
    const input = slot.querySelector('input[type="file"]');

    // Admins online, or anyone in local/static preview (saved to browser only)
    const allowUpload = Boolean(adminAccess) || isStaticPreview() || location.protocol === "file:";
    slot.classList.toggle("is-uploadable", allowUpload);

    slot.addEventListener("click", async () => {
      if (!(adminAccess || isStaticPreview() || location.protocol === "file:")) {
        setText(slot.querySelector("[data-upload-status]"), "请先用管理员账号登录");
        return;
      }

      if (!input) {
        return;
      }

      input.click();
    });

    if (input && input.dataset.bound !== "true") {
      input.dataset.bound = "true";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";

        if (!file) {
          return;
        }

        await uploadGalleryItem(kind, file, slot);
      });
    }
  });
}

async function uploadGalleryItem(kind, file, slot) {
  const status = slot.querySelector("[data-upload-status]");
  const maxBytes = 4.5 * 1024 * 1024;

  if (!file.type.startsWith("image/")) {
    setText(status, "请选择图片文件");
    return;
  }

  if (file.size > maxBytes) {
    setText(status, "图片请小于 4.5MB");
    return;
  }

  setText(status, "上传中…");
  slot.classList.add("is-uploading");

  const titleDefault = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || (kind === "skill" ? "新作品" : "新证书");
  const title = window.prompt("标题", titleDefault) || titleDefault;
  const tag = window.prompt("标签", kind === "skill" ? "作品" : "证书") || (kind === "skill" ? "作品" : "证书");
  const description = kind === "skill" ? window.prompt("简介（可留空）", "") || "" : "";

  try {
    const form = new FormData();
    form.append("kind", kind);
    form.append("title", title);
    form.append("tag", tag);
    form.append("description", description);
    form.append("file", file);

    // Prefer cloud API whenever not opening as a raw file:// page
    if (location.protocol !== "file:") {
      try {
        await apiFetch("/api/admin/gallery", {
          method: "POST",
          body: form,
          formData: true,
        });
        setText(status, "上传成功");
        await setupGallerySections();
        return;
      } catch (error) {
        // Local python server / missing R2 → keep a browser fallback so the slot is still usable
        if (!error.isNetwork && error.isApi) {
          throw error;
        }
      }
    }

    const dataUrl = await readFileAsDataUrl(file);
    const items = loadLocalGallery();
    items.unshift({
      id: `local-${Date.now()}`,
      kind,
      title,
      tag,
      description,
      imageUrl: dataUrl,
      createdAt: new Date().toISOString(),
    });
    saveLocalGallery(items);
    setText(status, "已保存到本机（离线/本地预览）");
    await setupGallerySections();
  } catch (error) {
    setText(status, error.isNetwork ? "服务暂不可用或未配置 R2" : error.message || "上传失败");
  } finally {
    slot.classList.remove("is-uploading");
  }
}

async function deleteGalleryItem(id, kind) {
  if (!id || !window.confirm("确定删除这项内容吗？")) {
    return;
  }

  try {
    if (isStaticPreview() || String(id).startsWith("local-")) {
      saveLocalGallery(loadLocalGallery().filter((item) => String(item.id) !== String(id)));
    } else {
      await apiFetch(`/api/admin/gallery?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    }

    await setupGallerySections();
  } catch (error) {
    window.alert(error.message || "删除失败");
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function setupReveal() {
  document.querySelectorAll(".reveal-card, .section").forEach((item) => {
    item.classList.add("is-visible");
  });

  // Open-source enter animations: AOS (https://github.com/michalsnik/aos)
  setupAosAnimations();
}

let aosLoadPromise = null;

function ensureAosAssets() {
  if (window.AOS) {
    return Promise.resolve(window.AOS);
  }

  if (aosLoadPromise) {
    return aosLoadPromise;
  }

  aosLoadPromise = new Promise((resolve) => {
    const existingCss = document.querySelector('link[data-aos-css]');
    if (!existingCss) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "assets/vendor/aos/aos.css";
      link.dataset.aosCss = "true";
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector("script[data-aos-js]");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.AOS || null), { once: true });
      if (window.AOS) {
        resolve(window.AOS);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "assets/vendor/aos/aos.js";
    script.defer = true;
    script.dataset.aosJs = "true";
    script.onload = () => resolve(window.AOS || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return aosLoadPromise;
}

async function setupAosAnimations() {
  const hasAosNodes = document.querySelector("[data-aos]");
  if (!hasAosNodes) {
    return;
  }

  const AOS = await ensureAosAssets();
  if (!AOS) {
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!window.__cardSiteAosReady) {
    AOS.init({
      duration: 780,
      easing: "ease-out-cubic",
      once: true,
      offset: 48,
      delay: 0,
      disable: reduceMotion,
    });
    window.__cardSiteAosReady = true;
  } else {
    AOS.refreshHard();
  }

  // After SPA swap, force a second refresh once images settle
  window.requestAnimationFrame(() => {
    try {
      AOS.refresh();
    } catch {
      /* ignore */
    }
  });
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

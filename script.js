const year = document.querySelector("#year");
const copyButtons = document.querySelectorAll("[data-copy]");
const copyStatus = document.querySelector("#copyStatus");
const tabs = document.querySelectorAll(".tab");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const accountStatus = document.querySelector("#accountStatus");
const messageForm = document.querySelector("#messageForm");
const messageList = document.querySelector("#messageList");
const messageGate = document.querySelector("#messageGate");
let currentUser = JSON.parse(localStorage.getItem("card-site-session") || "null");

const defaultMessages = [
  {
    name: "晓染主页",
    message: "欢迎来到税冬鑫的个人主页，留言会临时保存在当前浏览器。",
    time: "刚刚",
  },
];

year.textContent = new Date().getFullYear();
updateMessageGate();

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;

    try {
      await navigator.clipboard.writeText(value);
      copyStatus.textContent = `已复制：${value}`;
    } catch {
      copyStatus.textContent = `复制失败，请手动复制：${value}`;
    }
  });
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const isLogin = tab.dataset.tab === "login";

    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    loginForm.classList.toggle("hidden", !isLogin);
    registerForm.classList.toggle("hidden", isLogin);
    accountStatus.textContent = "";
  });
});

registerForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = new FormData(registerForm);
  const nickname = form.get("nickname").trim();
  const email = form.get("email").trim();
  const password = form.get("password");

  if (!nickname || !email || password.length < 6) {
    accountStatus.textContent = "请填写昵称、邮箱，并设置至少 6 位密码。";
    return;
  }

  localStorage.setItem(
    "card-site-user",
    JSON.stringify({ nickname, email, password })
  );
  accountStatus.textContent = "注册成功。现在可以切到登录试试。";
  registerForm.reset();
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const savedUser = JSON.parse(localStorage.getItem("card-site-user") || "null");
  const form = new FormData(loginForm);
  const loginName = form.get("loginName").trim();
  const password = form.get("loginPassword");

  if (!savedUser) {
    accountStatus.textContent = "还没有注册账号，先点右上方“注册”。";
    return;
  }

  if ((loginName === savedUser.email || loginName === savedUser.nickname) && password === savedUser.password) {
    currentUser = { nickname: savedUser.nickname, email: savedUser.email };
    localStorage.setItem("card-site-session", JSON.stringify(currentUser));
    accountStatus.textContent = `欢迎回来，${savedUser.nickname}。`;
    loginForm.reset();
    updateMessageGate();
  } else {
    accountStatus.textContent = "账号或密码不对。";
  }
});

function updateMessageGate() {
  const isLoggedIn = Boolean(currentUser);
  const inputs = messageForm.querySelectorAll("input, textarea, button");

  inputs.forEach((input) => {
    input.disabled = !isLoggedIn;
  });

  messageGate.textContent = isLoggedIn
    ? `已登录：${currentUser.nickname}，可以发送留言。`
    : "请先在上方登录，登录后这里会开放留言。";
}

function getMessages() {
  return JSON.parse(localStorage.getItem("card-site-messages") || "null") || defaultMessages;
}

function saveMessages(messages) {
  localStorage.setItem("card-site-messages", JSON.stringify(messages));
}

function renderMessages() {
  const messages = getMessages();

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

messageForm.addEventListener("submit", (event) => {
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

  const messages = getMessages();
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
  saveMessages(messages.slice(0, 8));
  messageForm.reset();
  renderMessages();
});

renderMessages();

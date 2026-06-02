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
const bgMusic = document.querySelector("#bgMusic");
const musicToggle = document.querySelector("#musicToggle");
const musicStatus = document.querySelector("#musicStatus");
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
setupMusic();
setupReveal();

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

function setupMusic() {
  if (!bgMusic || !musicToggle || !musicStatus) {
    return;
  }

  let soundUnlocked = false;

  const updateMusicText = () => {
    musicToggle.textContent = bgMusic.paused ? "播放音乐" : "暂停音乐";
  };

  const playWithSound = async () => {
    try {
      bgMusic.muted = false;
      await bgMusic.play();
      soundUnlocked = true;
      musicStatus.textContent = "音乐播放中";
    } catch {
      musicStatus.textContent = "浏览器拦截了自动播放，点一下页面或按钮即可播放。";
    } finally {
      updateMusicText();
    }
  };

  const tryAutoplay = async () => {
    try {
      bgMusic.volume = 0.72;
      await bgMusic.play();
      musicStatus.textContent = "音乐播放中";
    } catch {
      try {
        bgMusic.muted = true;
        await bgMusic.play();
        musicStatus.textContent = "已静音预载，点一下页面后会打开声音。";
      } catch {
        musicStatus.textContent = "点一下页面或按钮播放音乐。";
      }
    } finally {
      updateMusicText();
    }
  };

  musicToggle.addEventListener("click", async () => {
    if (bgMusic.paused) {
      await playWithSound();
    } else {
      bgMusic.pause();
      musicStatus.textContent = "音乐已暂停";
      updateMusicText();
    }
  });

  document.addEventListener(
    "pointerdown",
    () => {
      if (!soundUnlocked) {
        playWithSound();
      }
    },
    { once: true }
  );

  bgMusic.addEventListener("play", updateMusicText);
  bgMusic.addEventListener("pause", updateMusicText);
  tryAutoplay();
}

function setupReveal() {
  const items = document.querySelectorAll(".music-player, .section");

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  items.forEach((item) => item.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -80px 0px" }
  );

  items.forEach((item) => observer.observe(item));
}

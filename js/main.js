/* ============================================================
   xfgken · 个人主页
   页面内容全部从后端 /api/content 读取后渲染
   ============================================================ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const body = document.body;

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let CONTENT = {};                 // 站点内容
  let navItems = [];                // 章节目录

  /* ------------------------------------------------------------
     工具
     ------------------------------------------------------------ */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&" + "quot;");
  }

  // 行内强调语法：
  //   ==词== 松绿   __词__ 下划线   **词** 加粗
  //   ~~词~~ 虚线   %%词%% 荧光底色 //词// 斜体
  const INLINE_RULES = [
    [/\*\*([^*]+)\*\*/g, "hl-bold"],
    [/%%([^%]+)%%/g, "hl-bg"],
    [/__([^_]+)__/g, "hl-line"],
    [/~~([^~]+)~~/g, "hl-dash"],
    [/==([^=]+)==/g, "hl"],
    [/\/\/([^/]+)\/\//g, "hl-i"]
  ];

  function inline(text) {
    let out = escapeHtml(text);
    INLINE_RULES.forEach(([re, cls]) => {
      out = out.replace(re, (m, p1) => '<span class="' + cls + '">' + p1 + "</span>");
    });
    return out;
  }

  const toastEl = $("#toast");
  let toastTimer = null;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = "toast"; }, 2400);
  }

  /* ------------------------------------------------------------
     主题
     ------------------------------------------------------------ */
  const themeBtn = $("#themeBtn");
  const themeBtnM = $("#themeBtnM");

  function savedTheme() {
    try { return localStorage.getItem("site-theme"); } catch (e) { return null; }
  }
  function sysDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // 图标不在这里换 —— 太阳/月亮两个 SVG 都在 DOM 里，
  // 靠 body.dark 触发 CSS 的交叉旋转淡入淡出
  function paintTheme(dark) {
    body.classList.toggle("dark", dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#121316" : "#faf9f7");
  }

  let themeMode = savedTheme();          // null = 跟随系统
  paintTheme(themeMode === null ? sysDark() : themeMode === "dark");

  function toggleTheme() {
    const next = !body.classList.contains("dark");
    themeMode = next ? "dark" : "light";
    try { localStorage.setItem("site-theme", themeMode); } catch (e) {}
    paintTheme(next);
  }

  [themeBtn, themeBtnM].forEach((el) => {
    if (el) el.addEventListener("click", toggleTheme);
  });

  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => { if (themeMode === null) paintTheme(mq.matches); };
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
  }

  /* ------------------------------------------------------------
     渲染：站点框架
     ------------------------------------------------------------ */
  function renderSite(site) {
    const name = site.name || "";
    const nick = site.nickname || "";

    document.title = site.title || (name + " / " + nick);
    const desc = $("#metaDesc");
    if (desc && site.description) desc.setAttribute("content", site.description);

    $("#sideName").innerHTML = escapeHtml(name) + "<em>" + escapeHtml(nick) + "</em>";
    $("#mbName").innerHTML = escapeHtml(name) + "<span>" + escapeHtml(nick) + "</span>";
    const note = $("#sideNote");
    note.innerHTML = site.sideNote || "";
    note.hidden = !site.sideNote;   /* 没写内容时整块隐藏，避免留白 */
    $("#footText").textContent = site.footer || "";

    $("#panelEyebrow").textContent = site.panelTitle || "";
    $("#panelSubtitle").textContent = site.panelSubtitle || "";
  }

  /* ------------------------------------------------------------
     渲染：开场（诗句 + 打字机）
     ------------------------------------------------------------ */
  let poemText = "";

  function renderHero(hero) {
    poemText = hero.poem || "";

    let ghost;
    if (poemText.slice(-1) === "。") {
      ghost = escapeHtml(poemText.slice(0, -1)) + '<span class="ghost-dot"></span>';
    } else {
      ghost = escapeHtml(poemText);
    }

    $("#opening").innerHTML =
      "<h1>" + (hero.title || "") + "</h1>" +
      '<div class="poem">' +
        '<p class="poem-text">' +
          '<span class="poem-ghost" aria-hidden="true">' + ghost + "</span>" +
          '<span class="poem-live"><span id="typeTarget"></span>' +
          '<span class="poem-caret" aria-hidden="true"></span></span>' +
        "</p>" +
        '<p class="poem-source">' + escapeHtml(hero.poemSource || "") + "</p>" +
      "</div>";
  }

  /* 诗句字号完全交给 CSS：
     .poem-text 用容器查询单位 clamp(15px, calc(100cqw / 15.5), 45px)，
     .opening 已声明 container-type: inline-size。
     刻意不再用 JS 写行内 font-size —— 那会在 resize 时对页面顶部强制重排，
     连带把滚动位置带偏（表现为滚到底部时被“强行弹走”）。 */

  function initPoem() {
    const target = $("#typeTarget");
    if (!target || !poemText) return;

    const source = $(".poem-source");
    const caret = $(".poem-caret");

    if (reduceMotion) {
      target.textContent = poemText;
      if (source) source.classList.add("in");
      if (caret) caret.classList.add("gone");
      return;
    }

    const SPEED = 150, PAUSE = 380;
    let idx = 0;

    function tick() {
      if (idx >= poemText.length) {
        if (source) source.classList.add("in");
        if (caret) caret.classList.add("gone");
        return;
      }
      const ch = poemText.charAt(idx++);
      const span = document.createElement("span");
      span.className = "poem-ch";
      if (ch === "。") span.classList.add("poem-dot");
      else span.textContent = ch;
      target.appendChild(span);
      setTimeout(tick, /[,.。]/.test(ch) ? PAUSE : SPEED);
    }

    setTimeout(tick, 700);
  }

  /* ------------------------------------------------------------
     渲染：区块
     ------------------------------------------------------------ */
  const FORM_HTML = `
    <form class="form" id="contactForm" novalidate>
      <div class="row">
        <div class="field">
          <label for="cNick">昵称</label>
          <input type="text" id="cNick" maxlength="30" placeholder="怎么称呼你" autocomplete="nickname" required>
          <span class="err" data-for="cNick"></span>
        </div>
        <div class="field">
          <label for="cEmail">邮箱</label>
          <input type="email" id="cEmail" placeholder="用于接收回复" autocomplete="email" required>
          <span class="err" data-for="cEmail"></span>
        </div>
      </div>
      <div class="field">
        <label for="cContent">想说的话</label>
        <textarea id="cContent" rows="6" maxlength="2000" placeholder="想聊什么，或者只是打个招呼都可以。" required></textarea>
        <span class="err" data-for="cContent"></span>
      </div>
      <div class="form-foot">
        <span class="counter"><b id="charCount">0</b> / 2000</span>
        <button type="submit" class="btn" id="submitBtn">
          <span class="btn-label">发送</span>
          <span class="btn-spinner" aria-hidden="true"></span>
        </button>
      </div>
    </form>`;

  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function renderBlock(b) {
    switch (b.type) {
      case "lead":
        return '<p class="lead">' + inline(b.text) + "</p>";
      case "p":
        return "<p>" + inline(b.text) + "</p>";
      case "h3":
        return '<h3 class="sub">' + escapeHtml(b.text) + "</h3>";
      case "quote":
        return "<blockquote>" + inline(b.text) + "</blockquote>";
      case "motto":
        return '<p class="motto">' + inline(b.text) + "</p>";
      case "creed":
        return '<blockquote class="creed">' + inline(b.text) +
          (b.cite ? "<cite>" + escapeHtml(b.cite) + "</cite>" : "") +
          "</blockquote>";
      case "timeline":
        return '<div class="timeline-preview">' +
          '<ol class="timeline" id="tlPreview"></ol>' +
          '<button class="journey-open" id="journeyOpen" type="button">' +
          '<span class="journey-cta">展开完整成长历程' + ARROW + "</span>" +
          "</button></div>";
      case "projects":
        return '<ul class="plist" id="projectList"></ul>' +
          '<p class="plist-foot"><a href="https://github.com/xfgken" target="_blank" rel="noopener">' +
          "前往 GitHub 查看全部项目</a></p>";
      case "form":
        return FORM_HTML;
      default:
        return "";
    }
  }

/* ============================================================
     极简 Markdown 渲染
     ----------------------------------------
     块级：
       空行分隔段落      普通文字
       # 文字            导语（大字）
       ## 文字           小标题
       > 文字            引用块
       > 文字 / — 出处   信条引用（带出处，出处以「—」开头）
       ! 文字            结束短句
       - 文字            列表项
       [[时间线]] [[项目列表]] [[留言表单]]   自动部件
     行内：
       **粗**  *斜*  `代码`  ==松绿==  <u>下划线</u>  <mark>底色</mark>  [文字](链接)
     ============================================================ */
  function inlineMd(text) {
    // <u> / <mark> 是行内 HTML，必须先摘出来占位，
    // 否则 escapeHtml 会把尖括号转义掉，标签就只能当纯文字显示。
    const tags = [];
    let out = String(text == null ? "" : text)
      .replace(/<(u|mark)>([^<]*)<\/\1>/g, (m, tag, inner) => {
        tags.push([tag, inner]);
        return "\u0000" + (tags.length - 1) + "\u0000";
      });

    out = escapeHtml(out);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    // 先粗后斜：** 必须比 * 先处理，否则会被拆开
    out = out.replace(/\*\*([^*]+)\*\*/g, '<span class="hl-bold">$1</span>');
    out = out.replace(/\*([^*]+)\*/g, '<span class="hl-i">$1</span>');
    out = out.replace(/==([^=]+)==/g, '<span class="hl">$1</span>');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 还原占位符
    out = out.replace(/\u0000(\d+)\u0000/g, (m, i) => {
      const item = tags[Number(i)];
      if (!item) return "";
      const cls = item[0] === "u" ? "hl-line" : "hl-bg";
      return '<span class="' + cls + '">' + escapeHtml(item[1]) + "</span>";
    });
    return out;
  }

  // 把一个区块的 Markdown 转成 HTML
  function mdToHtml(md) {
    const lines = String(md == null ? "" : md).replace(/\r/g, "").split("\n");
    const out = [];
    let items = null;   // 正在收集的列表项
    let quote = null;   // 正在收集的引用行

    function flushList() {
      if (items) { out.push("<ul>" + items.join("") + "</ul>"); items = null; }
    }
    function flushQuote() {
      if (!quote) return;
      const body = quote.join(" ");
      // 最后一行以「—」开头 → 信条引用（带出处）
      const m = body.match(/^(.*?)\s*—\s*([^—]+)$/);
      if (m && m[1].trim()) {
        out.push('<blockquote class="creed">' + inlineMd(m[1].trim()) +
          "<cite>" + escapeHtml(m[2].trim()) + "</cite></blockquote>");
      } else {
        out.push("<blockquote>" + inlineMd(body) + "</blockquote>");
      }
      quote = null;
    }
    function flushAll() { flushList(); flushQuote(); }

    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) { flushAll(); return; }

      // 自动部件
      if (line === "[[时间线]]") { flushAll(); out.push(renderBlock({ type: "timeline" })); return; }
      if (line === "[[项目列表]]") { flushAll(); out.push(renderBlock({ type: "projects" })); return; }
      if (line === "[[留言表单]]") { flushAll(); out.push(renderBlock({ type: "form" })); return; }

      let m;
      if ((m = line.match(/^##\s+(.*)$/))) {
        flushAll();
        out.push('<h3 class="sub">' + escapeHtml(m[1]) + "</h3>");
        return;
      }
      if ((m = line.match(/^#\s+(.*)$/))) {
        flushAll();
        out.push('<p class="lead">' + inlineMd(m[1]) + "</p>");
        return;
      }
      if ((m = line.match(/^!\s+(.*)$/))) {
        flushAll();
        out.push('<p class="motto">' + inlineMd(m[1]) + "</p>");
        return;
      }
      if ((m = line.match(/^~\s?(.*)$/))) {
        // 歌词式块：用 | 分行，奇数行靠左、偶数行靠右，整块铺满栏宽
        flushAll();
        const parts = m[1].split("|").map((t) => t.trim()).filter(Boolean);
        out.push('<div class="lyric">' + parts.map((t, i) =>
          '<span class="ly' + (i + 1) + '">' + inlineMd(t) + "</span>"
        ).join("") + "</div>");
        return;
      }
      if ((m = line.match(/^>\s?(.*)$/))) {
        flushList();
        (quote = quote || []).push(m[1]);
        return;
      }
      if ((m = line.match(/^[-*]\s+(.*)$/))) {
        flushQuote();
        (items = items || []).push("<li>" + inlineMd(m[1]) + "</li>");
        return;
      }

      flushAll();
      out.push("<p>" + inlineMd(line) + "</p>");
    });

    flushAll();
    return out.join("");
  }

  // 章节正文：优先用 md，没有则回退到旧的 blocks 结构
  function sectionBody(sec) {
    if (typeof sec.md === "string") return mdToHtml(sec.md);
    return (sec.blocks || []).map(renderBlock).join("");
  }

  function renderSections(list) {
    const box = $("#sections");
    box.innerHTML = (list || []).map((sec) => {
      const blocks = sectionBody(sec);
      return '<section class="chapter" id="' + escapeHtml(sec.id) + '">' +
        "<h2><span>" + escapeHtml(sec.num || "") + "</span>" + escapeHtml(sec.title || "") + "</h2>" +
        blocks +
        "</section>";
    }).join("");

    // 目录
    navItems = (list || []).map((s) => ({ id: s.id, num: s.num, nav: s.nav || s.title }));
    $("#toc").innerHTML = navItems.map((n) =>
      '<a href="#' + escapeHtml(n.id) + '" data-nav><i>' + escapeHtml(n.num || "") + "</i>" +
      escapeHtml(n.nav || "") + "</a>").join("");
  }

  function renderPanel(list) {
    const box = $("#gpanelBody");
    const tl = '<ol class="timeline" id="tlFull"></ol>';
    const secs = (list || []).map((sec) =>
      '<section class="chapter">' +
      '<h2 id="' + escapeHtml(sec.id) + '"><span>' + escapeHtml(sec.num || "") + "</span>" +
      escapeHtml(sec.title || "") + "</h2>" +
      sectionBody(sec) +
      "</section>").join("");
    box.innerHTML = tl + secs;
  }

  /* 四条原则：渲染到「关于我」章节末尾，排成一行、用斜杠隔开 */
  function renderValues(list) {
    const host = document.getElementById("about");
    if (!host) return;
    let el = host.querySelector(".values");
    if (!list || !list.length) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.className = "values";
      host.appendChild(el);
    }
    /* 短语与其后的斜杠包成一组：组内贴紧，组间的空白由 space-between 均分 */
    el.innerHTML = list.map((v, i) =>
      '<span class="val-group">' +
        '<span class="val-key">' + escapeHtml(v.key || v) + "</span>" +
        (i < list.length - 1 ? '<i class="val-sep" aria-hidden="true">/</i>' : "") +
      "</span>"
    ).join("");
  }

  function renderClosing(c) {
    const el = $("#closing");
    if (!el) return;
    if (!c || (!c.main && !c.sub)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML =
      '<span class="closing-mark" aria-hidden="true"></span>' +
      '<span class="closing-main">' + (c.main || "") + "</span>" +
      (c.sub ? '<span class="closing-sub">' + escapeHtml(c.sub) + "</span>" : "");
  }

  /* ------------------------------------------------------------
     滚动进度 + 回到顶部
     ------------------------------------------------------------ */
  const progress = $("#progress");
  const openingEl = $("#opening");
  const PARALLAX_MAX = 900;
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      progress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";

      if (openingEl && !reduceMotion) {
        const y = h.scrollTop;
        if (y < PARALLAX_MAX) {
          openingEl.style.transform = "translate3d(0, " + (y * 0.16).toFixed(1) + "px, 0)";
          openingEl.style.opacity = (1 - Math.min(1, y / 820) * 0.6).toFixed(3);
        }
      }
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ------------------------------------------------------------
     导航
     ------------------------------------------------------------ */
  const menuBtn = $("#menuBtn");

  function setNav(open) {
    body.classList.toggle("nav-open", open);
    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.setAttribute("aria-label", open ? "关闭目录" : "打开目录");
      menuBtn.setAttribute("title", open ? "关闭目录" : "打开目录");
    }
  }

  if (menuBtn) {
    menuBtn.addEventListener("click", () => setNav(!body.classList.contains("nav-open")));
  }
  document.addEventListener("click", (e) => {
    if (!body.classList.contains("nav-open")) return;
    const nav = $("#toc");
    if (nav && nav.contains(e.target)) return;
    if (menuBtn && menuBtn.contains(e.target)) return;
    setNav(false);
  });

  function setActive(id) {
    $$("#toc a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + id);
    });
  }

  function gotoSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    setNav(false);
    closeGrowth();
    closeDrawer();
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setActive(id);
    history.replaceState(null, "", "#" + id);
  }

  function bindNav() {
    $$("[data-nav]").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href") || "";
        if (href.charAt(0) !== "#") return;
        e.preventDefault();
        gotoSection(href.slice(1));
      });
    });
  }

  function initSpy() {
    if (!("IntersectionObserver" in window)) return;
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
      },
      { rootMargin: "-25% 0px -70% 0px", threshold: 0 }
    );
    navItems.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) spy.observe(el);
    });
  }

  /* ------------------------------------------------------------
     滚动显现
     ------------------------------------------------------------ */
  const REVEAL_SELECTOR = [
    ".content .opening h1",
    ".content .chapter h2",
    ".content .chapter > h3",
    ".content .chapter > p",
    ".content .chapter > blockquote",
    ".content .chapter > .lyric",
    ".content .plist li",
    ".content .plist-foot",
    ".content .tl-item",
    ".content .form .field",
    ".content .form-foot",
    ".content .closing",
    ".content .values",
    ".content .foot"
  ].join(",");

  const PANEL_REVEAL_SELECTOR = [
    ".gpanel-body .tl-item",
    ".gpanel-body .chapter h2",
    ".gpanel-body .chapter > p",
    ".gpanel-body .chapter > blockquote"
  ].join(",");

  const STAGGER = 50, STAGGER_MAX = 4;

  function prepareReveal(els) {
    els.forEach((el) => {
      const sibs = els.filter((x) => x.parentElement === el.parentElement);
      const idx = Math.max(0, sibs.indexOf(el));
      const isTl = el.classList.contains("tl-item");
      const step = isTl ? 40 : STAGGER;
      const cap = isTl ? 3 : STAGGER_MAX;
      el.style.setProperty("--rv-delay", Math.min(idx, cap) * step + "ms");
      el.classList.add("reveal");
    });
  }

  function initReveal() {
    const els = $$(REVEAL_SELECTOR);
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("reveal", "in"));
      return;
    }
    prepareReveal(els);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add("in");
          io.unobserve(en.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );

    els.forEach((el) => {
      if (el.getBoundingClientRect().bottom < 0) { el.classList.add("in"); return; }
      io.observe(el);
    });

    setTimeout(() => {
      els.forEach((el) => {
        if (el.classList.contains("in")) return;
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
      });
    }, 2500);
  }

  /* ------------------------------------------------------------
     成长轨迹时间线
     ------------------------------------------------------------ */
  const PREVIEW_COUNT = 3;

  function timelineHtml(items) {
    return (items || []).map((it) => `
      <li class="tl-item">
        <span class="tl-node" aria-hidden="true"></span>
        <a class="tl-link" href="#${escapeHtml(it.to)}">
          <span class="tl-head">
            <span class="tl-time">${escapeHtml(it.time)}</span>
            <span class="tl-tag">${escapeHtml(it.tag)}</span>
          </span>
          <span class="tl-title">${escapeHtml(it.title)}</span>
          <span class="tl-text">${escapeHtml(it.text)}</span>
          ${(it.tags && it.tags.length)
            ? '<span class="tl-tags">' + it.tags.map((t) => "<span>" + escapeHtml(t) + "</span>").join("") + "</span>"
            : ""}
        </a>
      </li>`).join("");
  }

  function renderTimeline(journey) {
    const preview = $("#tlPreview");
    if (preview) {
      preview.innerHTML = timelineHtml((journey || []).slice(0, PREVIEW_COUNT));
      preview.addEventListener("click", (e) => {
        const a = e.target.closest(".tl-link");
        if (!a) return;
        e.preventDefault();
        openGrowth(a.getAttribute("href").slice(1));
      });
    }
    const full = $("#tlFull");
    if (full) {
      full.innerHTML = timelineHtml(journey);
      full.addEventListener("click", (e) => {
        const a = e.target.closest(".tl-link");
        if (!a) return;
        e.preventDefault();
        scrollPanelTo(a.getAttribute("href").slice(1));
      });
    }
  }

  /* ------------------------------------------------------------
     成长历程面板
     ------------------------------------------------------------ */
  const gpanel = $("#gpanel");
  const gpanelBody = $("#gpanelBody");
  let growthAnimated = false;

  function lockScroll() { body.style.overflow = "hidden"; }
  function unlockScroll() {
    if (drawer && drawer.classList.contains("open")) return;
    if (gpanel && gpanel.classList.contains("open")) return;
    body.style.overflow = "";
  }

  function scrollPanelTo(id) {
    if (!gpanelBody) return;
    const el = document.getElementById(id);
    if (!el) return;
    const top = Math.max(0, el.offsetTop - gpanelBody.offsetTop - 18);
    gpanelBody.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function initPanelReveal() {
    const els = Array.prototype.slice.call($$(PANEL_REVEAL_SELECTOR));
    if (!els.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("reveal", "in"));
      return;
    }
    prepareReveal(els);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add("in");
          io.unobserve(en.target);
        });
      },
      { root: gpanelBody, rootMargin: "0px 0px -6% 0px", threshold: 0.04 }
    );
    els.forEach((el) => io.observe(el));
  }

  function openGrowth(targetId) {
    if (!gpanel || gpanel.classList.contains("open")) {
      if (targetId) scrollPanelTo(targetId);
      return;
    }
    gpanel.classList.add("open");
    gpanel.setAttribute("aria-hidden", "false");
    lockScroll();
    if (!growthAnimated) { growthAnimated = true; initPanelReveal(); }
    if (targetId) {
      gpanelBody.scrollTop = 0;
      setTimeout(() => scrollPanelTo(targetId), 120);
    }
  }

  function closeGrowth() {
    if (!gpanel || !gpanel.classList.contains("open")) return;
    gpanel.classList.remove("open");
    gpanel.setAttribute("aria-hidden", "true");
    unlockScroll();
  }

  /* ------------------------------------------------------------
     项目列表 + 详情抽屉
     ------------------------------------------------------------ */
  let PROJECTS = [];
  const drawer = $("#drawer");

  function renderProjects(list) {
    PROJECTS = list || [];
    const ul = $("#projectList");
    if (!ul) return;

    ul.innerHTML = PROJECTS.map((p) => `
      <li>
        <button class="pitem" type="button" data-id="${escapeHtml(p.id)}">
          <span class="pitem-top">
            <span class="pitem-name">${escapeHtml(p.name)}</span>
            <span class="pitem-lang"><i style="background:${escapeHtml(p.langColor || "#888")}"></i>${escapeHtml(p.lang || "")}</span>
          </span>
          <span class="pitem-desc">${escapeHtml(p.desc || "")}</span>
        </button>
      </li>`).join("");

    ul.addEventListener("click", (e) => {
      const btn = e.target.closest(".pitem");
      if (!btn) return;
      const p = PROJECTS.find((x) => x.id === btn.dataset.id);
      if (p) openProject(p);
    });
  }

  function openProject(p) {
    $("#pdLang").innerHTML =
      '<i style="background:' + escapeHtml(p.langColor || "#888") + '"></i>' + escapeHtml(p.lang || "");
    $("#pdTitle").textContent = p.name || "";

    const meta = '<div class="pd-meta">' + (p.meta || []).map((pair) =>
      '<div class="pd-meta-item"><dt>' + escapeHtml(pair[0]) + "</dt><dd>" +
      escapeHtml(pair[1]) + "</dd></div>").join("") + "</div>";

    const detail = (p.detail || []).map((sec) => {
      let inner = "";
      if (sec.p) inner += "<p>" + inline(sec.p) + "</p>";
      if (sec.list) inner += "<ul>" + sec.list.map((li) => "<li>" + inline(li) + "</li>").join("") + "</ul>";
      if (sec.code) inner += "<pre><code>" + escapeHtml(sec.code) + "</code></pre>";
      return '<section class="pd-section"><h4>' + escapeHtml(sec.h) + "</h4>" + inner + "</section>";
    }).join("");

    $("#pdBody").innerHTML = meta + detail;
    $("#pdBody").scrollTop = 0;
    $("#pdFoot").innerHTML =
      '<a class="btn" href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">在 GitHub 打开</a>';

    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    lockScroll();
  }

  function closeDrawer() {
    if (!drawer) return;
    if (!drawer.classList.contains("open")) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    unlockScroll();
  }

  if (drawer) {
    drawer.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", closeDrawer);
    });
  }

  /* ------------------------------------------------------------
     联系表单
     ------------------------------------------------------------ */
  function initForm() {
    const form = $("#contactForm");
    if (!form) return;

    const nickEl = $("#cNick"), mailEl = $("#cEmail"), contentEl = $("#cContent");
    const counter = $("#charCount"), submitBtn = $("#submitBtn");
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function setError(input, msg) {
      const holder = document.querySelector('.err[data-for="' + input.id + '"]');
      const field = input.closest(".field");
      if (holder) holder.textContent = msg || "";
      if (field) field.classList.toggle("invalid", !!msg);
    }

    contentEl.addEventListener("input", () => { counter.textContent = contentEl.value.length; });
    [nickEl, mailEl, contentEl].forEach((el) =>
      el.addEventListener("input", () => setError(el, "")));

    function validate() {
      let ok = true;
      if (!nickEl.value.trim()) { setError(nickEl, "请填写昵称"); ok = false; }
      else if (nickEl.value.trim().length > 30) { setError(nickEl, "昵称不能超过 30 个字"); ok = false; }
      if (!mailEl.value.trim()) { setError(mailEl, "请填写邮箱"); ok = false; }
      else if (!EMAIL_RE.test(mailEl.value.trim())) { setError(mailEl, "邮箱格式看起来不对"); ok = false; }
      if (!contentEl.value.trim()) { setError(contentEl, "请填写想说的话"); ok = false; }
      return ok;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validate()) { toast("请检查表单里的提示", "warn"); return; }

      submitBtn.classList.add("loading");
      submitBtn.disabled = true;
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nickname: nickEl.value.trim(),
            email: mailEl.value.trim(),
            content: contentEl.value.trim()
          })
        });
        const data = await res.json();
        if (data.ok) {
          toast(data.message || "已发送，感谢留言", "ok");
          form.reset();
          counter.textContent = "0";
          [nickEl, mailEl, contentEl].forEach((el) => setError(el, ""));
        } else {
          toast(data.error || "发送失败，请稍后再试", "warn");
        }
      } catch (err) {
        toast("本站是静态部署（GitHub Pages），没有后端接收留言——欢迎到 GitHub 找我", "warn");
      } finally {
        submitBtn.classList.remove("loading");
        submitBtn.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------
     快捷键
     ------------------------------------------------------------ */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { setNav(false); closeGrowth(); closeDrawer(); }
  });

  /* ------------------------------------------------------------
     启动
     ------------------------------------------------------------ */
  async function boot() {
    let content = null;
    try {
      /* 静态版：内容来自 js/content-data.js，不走后端 */
      content = window.__SITE_CONTENT__ || null;
    } catch (e) { /* 下面统一处理 */ }

    if (!content || !Object.keys(content).length) {
      $("#opening").innerHTML =
        '<p class="lead">内容加载失败 —— 请确认后端已启动（<code>python3 server.py</code>）。</p>';
      return;
    }

    CONTENT = content;

    renderSite(content.site || {});
    renderHero(content.hero || {});
    renderSections(content.sections || []);
    renderPanel(content.panel || []);
    renderClosing(content.closing);
    renderValues(content.values || []);
    renderTimeline(content.journey || []);
    renderProjects(content.projects || []);

    bindNav();
    initReveal();
    initSpy();
    initForm();
    initPoem();

    setActive((navItems[0] || {}).id || "home");
    onScroll();

    $$("#toc a").forEach((a) => a.addEventListener("click", () => setNav(false)));
    if (gpanel) {
      gpanel.querySelectorAll("[data-gclose]").forEach((el) =>
        el.addEventListener("click", () => closeGrowth()));
    }
    const jo = $("#journeyOpen");
    if (jo) jo.addEventListener("click", () => openGrowth());

    /* 诗句字号由 CSS 容器查询自动跟随，无需在 resize / 字体加载时干预 */
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
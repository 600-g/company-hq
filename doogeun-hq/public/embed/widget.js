/**
 * 두근컴퍼니 임베드 위젯 — 외부 사이트 (date-map, ai900 등) drop-in.
 *
 * 사용법: <script src="https://600g.net/embed/widget.js" data-team-id="date-map" defer></script>
 *
 * 흐름:
 *   1. 우하단 ⚙️ 버튼 항상 표시 (작게, 반투명)
 *   2. 클릭 → 자체 사이트 메뉴 (사이트별 옵션은 없음, 위젯은 "개발자모드"만 노출)
 *   3. 개발자모드 → 비번 프롬프트 (이미 인증 시 풀 모달 즉시)
 *   4. 풀 모달 3 탭: 💬 채팅 / 💻 터미널 / 📜 패치노트
 *
 * 인증:
 *   - .600g.net 도메인 HttpOnly 쿠키 (서브도메인 전부 공유)
 *   - GET /api/embed/me 로 인증 상태 확인
 *   - POST /api/embed/dev-auth 로 쿠키 발행
 */
(function () {
  "use strict";
  if (window.__doogeunEmbedLoaded) return;
  window.__doogeunEmbedLoaded = true;

  const SCRIPT = document.currentScript || (function () {
    const s = document.querySelectorAll("script");
    return s[s.length - 1];
  })();
  const TEAM_ID = SCRIPT?.getAttribute("data-team-id") || "";
  const API_BASE = SCRIPT?.getAttribute("data-api") || "https://api.600g.net";
  const HUB_BASE = SCRIPT?.getAttribute("data-hub") || "https://600g.net";
  // data-no-fab: 호스트 사이트에 자체 설정 메뉴가 있을 때 — FAB 안 띄우고 API 만 노출.
  //              호스트가 window.doogeunEmbed.open() 으로 트리거.
  const NO_FAB = SCRIPT?.hasAttribute("data-no-fab");

  if (!TEAM_ID) {
    console.warn("[doogeun-embed] data-team-id 누락 — 위젯 비활성화");
    return;
  }

  const ID_PREFIX = "doogeun-embed";
  const Z = 2147483600; // 사이트 z-index 위로

  // --- 상태
  let authed = false;
  let modalOpen = false;
  let activeTab = "chat";

  // --- 유틸
  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === "style" && typeof props[k] === "object") Object.assign(e.style, props[k]);
      else if (k.startsWith("on") && typeof props[k] === "function") e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    }
    for (const c of children) {
      if (c == null) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }

  async function apiFetch(path, init) {
    const opts = Object.assign({ credentials: "include" }, init || {});
    if (opts.body && !opts.headers) opts.headers = { "Content-Type": "application/json" };
    const r = await fetch(API_BASE + path, opts);
    return r;
  }

  async function checkAuth() {
    try {
      const r = await apiFetch("/api/embed/me");
      const j = await r.json();
      authed = !!j.authed;
    } catch {
      authed = false;
    }
    return authed;
  }

  // --- 스타일 (단일 <style> 주입)
  function injectStyle() {
    if (document.getElementById(ID_PREFIX + "-style")) return;
    const s = el("style", { id: ID_PREFIX + "-style" });
    s.textContent = `
      #${ID_PREFIX}-fab {
        position: fixed; right: 12px; bottom: 12px;
        width: 36px; height: 36px; border-radius: 50%;
        background: rgba(15,15,25,.72); color: #cbd5e1;
        border: 1px solid rgba(120,160,255,.35);
        font-size: 18px; cursor: pointer; z-index: ${Z};
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(6px); transition: opacity .15s, transform .15s;
        opacity: .35;
      }
      #${ID_PREFIX}-fab:hover { opacity: 1; transform: scale(1.06); }
      #${ID_PREFIX}-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,.55);
        z-index: ${Z + 1}; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(2px);
      }
      #${ID_PREFIX}-modal {
        width: min(960px, 95vw); height: min(700px, 92vh);
        background: #0b0b14; color: #e5e7eb;
        border: 1px solid #2a2a3e; border-radius: 14px;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,.6);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${ID_PREFIX}-modal header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px; border-bottom: 1px solid #1f1f2e; gap: 8px;
      }
      #${ID_PREFIX}-modal header .title { font-size: 13px; font-weight: 600; color: #93c5fd; }
      #${ID_PREFIX}-modal header button.close {
        background: transparent; color: #94a3b8; border: 0; cursor: pointer;
        font-size: 18px; padding: 2px 8px;
      }
      #${ID_PREFIX}-tabs {
        display: flex; gap: 4px; padding: 6px 10px; border-bottom: 1px solid #1f1f2e;
        background: #0a0a12;
      }
      #${ID_PREFIX}-tabs button {
        background: transparent; color: #94a3b8; border: 0; cursor: pointer;
        padding: 6px 12px; font-size: 12px; border-radius: 6px;
      }
      #${ID_PREFIX}-tabs button.active { background: rgba(99,102,241,.18); color: #c7d2fe; }
      #${ID_PREFIX}-body { flex: 1; overflow: hidden; display: flex; }
      #${ID_PREFIX}-body iframe { flex: 1; width: 100%; height: 100%; border: 0; background: #06060e; }
      #${ID_PREFIX}-login {
        padding: 32px; display: flex; flex-direction: column; gap: 12px;
        align-items: center; justify-content: center; flex: 1;
      }
      #${ID_PREFIX}-login h3 { margin: 0; color: #c7d2fe; font-size: 15px; }
      #${ID_PREFIX}-login p { margin: 0; color: #94a3b8; font-size: 12px; text-align: center; max-width: 340px; }
      #${ID_PREFIX}-login input {
        width: 280px; padding: 10px 12px; border: 1px solid #2a2a3e;
        border-radius: 8px; background: #0a0a12; color: #e5e7eb; font-size: 13px;
      }
      #${ID_PREFIX}-login button {
        padding: 8px 24px; background: #6366f1; color: white; border: 0;
        border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
      }
      #${ID_PREFIX}-login .err { color: #fca5a5; font-size: 12px; min-height: 16px; }
      #${ID_PREFIX}-patches {
        flex: 1; overflow-y: auto; padding: 12px;
      }
      #${ID_PREFIX}-update-bar {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; padding: 10px 12px; margin-bottom: 8px;
        background: rgba(99,102,241,.12); border: 1px solid rgba(99,102,241,.35);
        border-radius: 8px; font-size: 12px;
      }
      #${ID_PREFIX}-update-bar .lbl { color: #c7d2fe; }
      #${ID_PREFIX}-update-bar button {
        padding: 6px 14px; background: #6366f1; color: white;
        border: 0; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;
      }
      #${ID_PREFIX}-update-bar button:disabled { background: #475569; cursor: progress; }
      #${ID_PREFIX}-patches .commit {
        padding: 10px 12px; border-bottom: 1px solid #1f1f2e;
        display: flex; gap: 10px; align-items: baseline;
      }
      #${ID_PREFIX}-patches .sha { color: #93c5fd; font-family: ui-monospace, monospace; font-size: 11px; min-width: 60px; }
      #${ID_PREFIX}-patches .subj { color: #e5e7eb; font-size: 12px; flex: 1; }
      #${ID_PREFIX}-patches .ts { color: #64748b; font-size: 10px; }
      #${ID_PREFIX}-empty { color: #64748b; padding: 24px; text-align: center; font-size: 12px; }
    `;
    document.head.appendChild(s);
  }

  // --- FAB
  function mountFab() {
    if (document.getElementById(ID_PREFIX + "-fab")) return;
    const fab = el("button", {
      id: ID_PREFIX + "-fab",
      title: "두근컴퍼니 설정",
      "aria-label": "설정",
      onclick: openModal,
    }, "⚙");
    document.body.appendChild(fab);
  }

  // --- 모달
  // 모달 열 때 매번 로그인 화면을 먼저 보여줌 (사용자 의도 — 인증 단계 visible).
  // 쿠키가 살아있어 API 호출은 통과되지만 UI 게이트는 명시적.
  async function openModal() {
    if (modalOpen) return;
    modalOpen = true;
    authed = false;
    renderModal();
  }

  function closeModal() {
    const b = document.getElementById(ID_PREFIX + "-backdrop");
    if (b) b.remove();
    modalOpen = false;
  }

  function renderModal() {
    const old = document.getElementById(ID_PREFIX + "-backdrop");
    if (old) old.remove();

    const backdrop = el("div", {
      id: ID_PREFIX + "-backdrop",
      onclick: (e) => { if (e.target === backdrop) closeModal(); },
    });
    const modal = el("div", { id: ID_PREFIX + "-modal" });

    const header = el("header", {},
      el("span", { class: "title" }, `⚙️ ${TEAM_ID} 개발자 모드`),
      el("button", { class: "close", "aria-label": "닫기", onclick: closeModal }, "×"),
    );
    modal.appendChild(header);

    if (!authed) {
      modal.appendChild(renderLogin());
    } else {
      modal.appendChild(renderTabs());
      modal.appendChild(renderBody());
    }

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  function renderLogin() {
    const err = el("div", { class: "err" });
    const input = el("input", { type: "password", placeholder: "개발자 비밀번호", autocomplete: "current-password" });
    const submit = async () => {
      err.textContent = "";
      submitBtn.disabled = true;
      try {
        const r = await apiFetch("/api/embed/dev-auth", {
          method: "POST",
          body: JSON.stringify({ password: input.value }),
        });
        if (r.ok) {
          authed = true;
          renderModal();
        } else {
          const j = await r.json().catch(() => ({}));
          err.textContent = j.detail || "인증 실패";
        }
      } catch (e) {
        err.textContent = "네트워크 오류";
      } finally {
        submitBtn.disabled = false;
      }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    const submitBtn = el("button", { onclick: submit }, "확인");
    setTimeout(() => input.focus(), 50);

    return el("div", { id: ID_PREFIX + "-login" },
      el("h3", {}, "개발자 모드"),
      el("p", {}, "비밀번호로 채팅·터미널·패치 히스토리에 접근할 수 있어요."),
      input,
      submitBtn,
      err,
    );
  }

  function renderTabs() {
    const tabs = el("div", { id: ID_PREFIX + "-tabs" });
    const defs = [
      { id: "chat", label: "💬 채팅" },
      { id: "patches", label: "📜 패치노트" },
    ];
    for (const d of defs) {
      const b = el("button", {
        class: d.id === activeTab ? "active" : "",
        onclick: () => { activeTab = d.id; renderModal(); },
      }, d.label);
      tabs.appendChild(b);
    }
    return tabs;
  }

  function renderBody() {
    const body = el("div", { id: ID_PREFIX + "-body" });
    if (activeTab === "chat") {
      body.appendChild(el("iframe", {
        src: `${HUB_BASE}/embed/chat/?team=${encodeURIComponent(TEAM_ID)}`,
        sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals",
      }));
    } else if (activeTab === "patches") {
      const wrap = el("div", { id: ID_PREFIX + "-patches" });
      // 사이트 강제 새로고침 (SW + Cache Storage 클리어 + 리로드)
      const updBtn = el("button", { onclick: forceRefresh }, "🔄 지금 업데이트");
      const updBar = el("div", { id: ID_PREFIX + "-update-bar" },
        el("span", { class: "lbl" }, "캐시 비우고 최신 버전 받기"),
        updBtn,
      );
      wrap.appendChild(updBar);
      const list = el("div");
      list.appendChild(el("div", { id: ID_PREFIX + "-empty" }, "로딩 중..."));
      wrap.appendChild(list);
      body.appendChild(wrap);
      loadPatches(list);
    }
    return body;
  }

  // 호스트 사이트 강제 새로고침 — SW unregister + Cache Storage 클리어 + 캐시버스터 리로드.
  // 두근컴퍼니 본진 CacheBust 와 동일 패턴 (로컬스토리지는 유지).
  async function forceRefresh() {
    const btn = document.querySelector(`#${ID_PREFIX}-update-bar button`);
    if (btn) { btn.disabled = true; btn.textContent = "처리 중..."; }
    try {
      if ("caches" in window) {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
      }
    } catch {}
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}
    setTimeout(() => {
      const u = new URL(window.location.href);
      u.searchParams.set("_cb", String(Date.now()));
      window.location.replace(u.toString());
    }, 200);
  }

  async function loadPatches(wrap) {
    try {
      const r = await apiFetch(`/api/embed/patch-log?team_id=${encodeURIComponent(TEAM_ID)}&limit=30`);
      const j = await r.json();
      wrap.innerHTML = "";
      const commits = (j && j.commits) || [];
      if (commits.length === 0) {
        wrap.appendChild(el("div", { id: ID_PREFIX + "-empty" }, j.warn || "커밋 기록이 없어요"));
        return;
      }
      for (const c of commits) {
        const ts = new Date(c.ts * 1000);
        const tsStr = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,"0")}-${String(ts.getDate()).padStart(2,"0")} ${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}`;
        wrap.appendChild(el("div", { class: "commit" },
          el("span", { class: "sha" }, c.short_sha),
          el("span", { class: "subj" }, c.subject),
          el("span", { class: "ts" }, tsStr),
        ));
      }
    } catch (e) {
      wrap.innerHTML = "";
      wrap.appendChild(el("div", { id: ID_PREFIX + "-empty" }, "패치 로그 불러오기 실패"));
    }
  }

  // --- 공개 API (호스트 사이트가 자체 메뉴에서 호출)
  window.doogeunEmbed = Object.freeze({
    open: openModal,
    close: closeModal,
    isAuthed: () => authed,
    teamId: TEAM_ID,
  });

  // --- 부트
  function boot() {
    injectStyle();
    if (!NO_FAB) mountFab();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

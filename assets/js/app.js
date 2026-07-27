(function () {
  const STORAGE_KEY = "treino-lindeza-v1";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getTodayKey() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function suggestWorkout(state) {
    const order = window.ROTATION || ["a", "b", "c"];
    const last = state.lastCompleted;
    if (!last || !last.id) return order[0];
    const idx = order.indexOf(last.id);
    return order[(idx + 1) % order.length];
  }

  function mediaUrl(name) {
    return "media/" + String(name).split("/").map(encodeURIComponent).join("/");
  }

  function pickPhrase() {
    const list = window.PHRASES || [];
    if (!list.length) return "";
    const day = getTodayKey();
    let hash = 0;
    for (let i = 0; i < day.length; i++) hash = (hash + day.charCodeAt(i) * (i + 3)) % list.length;
    return list[hash];
  }

  /* ---------- HOME ---------- */
  function initHome() {
    const state = loadState();
    const suggested = suggestWorkout(state);
    const workout = window.WORKOUTS[suggested];
    const box = document.getElementById("suggest-box");
    const love = document.getElementById("love-note");
    if (love) love.textContent = pickPhrase();
    if (!box || !workout) return;

    const lastText = state.lastCompleted
      ? `Último feito: ${window.WORKOUTS[state.lastCompleted.id]?.title || "—"} (${state.lastCompleted.date || ""})`
      : "Ainda sem treino marcado nesta versão.";

    box.innerHTML = `
      <strong>Hoje: ${workout.title} · ${workout.subtitle}</strong>
      <p>${workout.focus}<br>${lastText}</p>
      <a class="btn" href="treino.html?dia=${workout.id}">Começar treino sugerido</a>
    `;

    document.querySelectorAll("[data-last]").forEach((el) => {
      const id = el.getAttribute("data-last");
      if (state.lastCompleted?.id === id) {
        el.textContent = `${el.textContent} · último feito`;
      }
    });
  }

  /* ---------- WORKOUT ---------- */
  let timerInterval = null;
  let timerLeft = 0;

  function workoutKey(id) {
    return `${getTodayKey()}:${id}`;
  }

  function getSession(state, id) {
    const key = workoutKey(id);
    state.sessions = state.sessions || {};
    if (!state.sessions[key]) {
      state.sessions[key] = { sets: {}, done: {}, loads: {} };
    }
    // migrate loads from persistent store
    state.loads = state.loads || {};
    return state.sessions[key];
  }

  function renderWorkout(id) {
    const workout = window.WORKOUTS[id];
    const root = document.getElementById("workout-root");
    if (!workout || !root) return;

    document.title = `${workout.title} · Treino da Lindeza`;
    document.body.dataset.day = id;

    const state = loadState();
    const session = getSession(state, id);
    const all = [...workout.exercises, ...(workout.extras || [])];
    const mainDone = workout.exercises.filter((e) => session.done[e.id]).length;
    const pct = Math.round((mainDone / workout.exercises.length) * 100);

    root.innerHTML = `
      <div class="workout-head">
        <a class="back-link" href="index.html">← Início</a>
        <h1>${workout.title}</h1>
        <p class="focus">${workout.subtitle} · ${workout.focus} · ${workout.duration}</p>
        <div class="progress-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <p class="progress-label">${mainDone} de ${workout.exercises.length} exercícios principais</p>
      </div>
      <p class="tip-banner">${workout.tip}</p>
      <div id="done-banner-slot"></div>
      <div id="exercise-list"></div>
      <button type="button" class="extras-toggle" id="extras-toggle">Mostrar opcionais (+ energia)</button>
      <div class="extras" id="extras-list" hidden></div>
    `;

    const list = root.querySelector("#exercise-list");
    const extrasList = root.querySelector("#extras-list");

    workout.exercises.forEach((ex, i) => {
      list.appendChild(buildExerciseCard(ex, i, session, state, id));
    });

    const toggle = root.querySelector("#extras-toggle");
    if (!workout.extras?.length) {
      toggle.hidden = true;
    } else {
      toggle.addEventListener("click", () => {
        const hidden = extrasList.hasAttribute("hidden");
        if (hidden) {
          if (!extrasList.dataset.built) {
            workout.extras.forEach((ex, i) => {
              extrasList.appendChild(
                buildExerciseCard(ex, workout.exercises.length + i, session, state, id, true)
              );
            });
            extrasList.dataset.built = "1";
          }
          extrasList.removeAttribute("hidden");
          toggle.textContent = "Ocultar opcionais";
        } else {
          extrasList.setAttribute("hidden", "");
          toggle.textContent = "Mostrar opcionais (+ energia)";
        }
      });
    }

    updateDoneBanner(workout, session);
    updateSticky(id, session, workout);
  }

  function buildExerciseCard(ex, index, session, state, workoutId, isExtra) {
    const card = document.createElement("article");
    card.className = "exercise" + (session.done[ex.id] ? " done" : "");
    card.style.animationDelay = `${Math.min(index * 0.04, 0.2)}s`;
    card.dataset.exerciseId = ex.id;

    const setsDone = session.sets[ex.id] || [];
    const loadVal = state.loads?.[ex.id] || "";

    card.innerHTML = `
      <div class="exercise-top">
        <div>
          <h2>${isExtra ? "Extra · " : ""}${ex.name}</h2>
          <p class="stats">${ex.sets} séries · ${ex.reps} reps · descanso ${ex.rest}s</p>
        </div>
        <button type="button" class="check" aria-checked="${!!session.done[ex.id]}" aria-label="Marcar exercício como feito"></button>
      </div>
      <div class="exercise-media">
        <img src="${mediaUrl(ex.photo || ex.gif)}" alt="${ex.name}" loading="${index < 2 ? "eager" : "lazy"}">
      </div>
      <p class="tip">${ex.tip}</p>
      <div class="sets" data-sets></div>
      <div class="load-row">
        <label for="load-${ex.id}">Carga</label>
        <input id="load-${ex.id}" type="text" inputmode="decimal" placeholder="ex: 10" value="${loadVal}">
        <span style="color:var(--muted);font-size:0.85rem">kg / pinos</span>
      </div>
      <div class="rest-row">
        <button type="button" class="btn btn-dark" data-rest="${ex.rest}">Descansar ${ex.rest}s</button>
      </div>
    `;

    const check = card.querySelector(".check");
    check.innerHTML = session.done[ex.id] ? "✓" : "";
    check.addEventListener("click", () => {
      const st = loadState();
      const sess = getSession(st, workoutId);
      sess.done[ex.id] = !sess.done[ex.id];
      if (sess.done[ex.id]) {
        sess.sets[ex.id] = Array.from({ length: ex.sets }, (_, i) => i);
      }
      saveState(st);
      renderWorkout(workoutId);
    });

    const setsEl = card.querySelector("[data-sets]");
    for (let i = 0; i < ex.sets; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "set-btn" + (setsDone.includes(i) ? " done" : "");
      btn.textContent = `S${i + 1}`;
      btn.addEventListener("click", () => {
        const st = loadState();
        const sess = getSession(st, workoutId);
        const arr = new Set(sess.sets[ex.id] || []);
        const markingDone = !arr.has(i);
        if (markingDone) arr.add(i);
        else arr.delete(i);
        sess.sets[ex.id] = [...arr].sort();
        sess.done[ex.id] = sess.sets[ex.id].length >= ex.sets;
        saveState(st);
        renderWorkout(workoutId);
        if (markingDone && sess.sets[ex.id].length < ex.sets) {
          openTimer(ex.rest);
        }
      });
      setsEl.appendChild(btn);
    }

    const loadInput = card.querySelector(`#load-${ex.id}`);
    loadInput.addEventListener("change", () => {
      const st = loadState();
      st.loads = st.loads || {};
      st.loads[ex.id] = loadInput.value.trim();
      saveState(st);
    });

    card.querySelector("[data-rest]").addEventListener("click", () => {
      openTimer(ex.rest);
    });

    return card;
  }

  function updateDoneBanner(workout, session) {
    const slot = document.getElementById("done-banner-slot");
    if (!slot) return;
    const allMain = workout.exercises.every((e) => session.done[e.id]);
    if (!allMain) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = `
      <div class="done-banner">
        <h3>Treino concluído ✨</h3>
        <p>${pickPhrase()}</p>
      </div>
    `;
  }

  function updateSticky(id, session, workout) {
    const bar = document.getElementById("sticky-bar");
    if (!bar) return;
    const allMain = workout.exercises.every((e) => session.done[e.id]);
    bar.innerHTML = allMain
      ? `<button type="button" class="btn btn-accent" id="finish-btn">Salvar e voltar ao início</button>`
      : `<button type="button" class="btn btn-dark" id="finish-btn">Marcar treino como feito</button>`;

    bar.querySelector("#finish-btn").addEventListener("click", () => {
      const st = loadState();
      const sess = getSession(st, id);
      workout.exercises.forEach((e) => {
        sess.done[e.id] = true;
        sess.sets[e.id] = Array.from({ length: e.sets }, (_, i) => i);
      });
      st.lastCompleted = { id, date: getTodayKey() };
      // cleanup old sessions lightly
      const keys = Object.keys(st.sessions || {});
      if (keys.length > 20) {
        keys.sort().slice(0, keys.length - 20).forEach((k) => delete st.sessions[k]);
      }
      saveState(st);
      window.location.href = "index.html";
    });
  }

  function openTimer(seconds) {
    const overlay = document.getElementById("timer-overlay");
    const digits = document.getElementById("timer-digits");
    if (!overlay || !digits) return;

    clearInterval(timerInterval);
    timerLeft = seconds;
    digits.textContent = formatTime(timerLeft);
    overlay.hidden = false;

    timerInterval = setInterval(() => {
      timerLeft -= 1;
      digits.textContent = formatTime(Math.max(timerLeft, 0));
      if (timerLeft <= 0) {
        clearInterval(timerInterval);
        digits.textContent = "0:00";
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        try {
          beep();
        } catch {
          /* ignore */
        }
      }
    }, 1000);
  }

  function closeTimer() {
    clearInterval(timerInterval);
    const overlay = document.getElementById("timer-overlay");
    if (overlay) overlay.hidden = true;
  }

  function formatTime(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function beep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 180);
  }

  function initWorkoutPage() {
    const params = new URLSearchParams(window.location.search);
    const id = (params.get("dia") || "a").toLowerCase();
    if (!window.WORKOUTS[id]) {
      window.location.replace("index.html");
      return;
    }
    renderWorkout(id);

    document.getElementById("timer-skip")?.addEventListener("click", closeTimer);
    document.getElementById("timer-close")?.addEventListener("click", closeTimer);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    if (page === "home") initHome();
    if (page === "workout") initWorkoutPage();
  });
})();

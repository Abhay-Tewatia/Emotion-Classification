(() => {
  "use strict";

  const MAX_CHARS = 200;
  const HISTORY_KEY = "emotion-lens-history";
  const MAX_HISTORY = 6;

  const EMOTIONS = {
    sadness:  { emoji: "😢", color: "var(--sadness)" },
    joy:      { emoji: "😄", color: "var(--joy)" },
    love:     { emoji: "❤️", color: "var(--love)" },
    anger:    { emoji: "😡", color: "var(--anger)" },
    fear:     { emoji: "😨", color: "var(--fear)" },
    surprise: { emoji: "😲", color: "var(--surprise)" },
  };

  const el = {
    form: document.getElementById("analyze-form"),
    input: document.getElementById("text-input"),
    counter: document.getElementById("counter"),
    submit: document.getElementById("submit-btn"),
    error: document.getElementById("error"),
    chips: document.getElementById("chips"),
    result: document.getElementById("result"),
    emoji: document.getElementById("result-emoji"),
    emotion: document.getElementById("result-emotion"),
    confidence: document.getElementById("result-confidence"),
    bars: document.getElementById("bars"),
    historySection: document.getElementById("history-section"),
    historyList: document.getElementById("history-list"),
    clearHistory: document.getElementById("clear-history"),
    statusDot: document.getElementById("status-dot"),
    statusText: document.getElementById("status-text"),
  };

  /* ---------- Helpers ---------- */

  const pct = (n) => `${Math.round(n * 100)}%`;

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
    el.form.classList.remove("shake");
    void el.form.offsetWidth; // restart animation
    el.form.classList.add("shake");
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = "";
  }

  function setLoading(isLoading) {
    el.submit.disabled = isLoading;
    el.submit.classList.toggle("loading", isLoading);
    el.submit.querySelector(".btn-label").textContent = isLoading ? "Reading…" : "Analyze";
  }

  function updateCounter() {
    const len = el.input.value.length;
    el.counter.textContent = `${len} / ${MAX_CHARS}`;
    el.counter.style.color = len > MAX_CHARS * 0.9 ? "var(--danger)" : "";
  }

  /* ---------- Rendering ---------- */

  function renderResult(data) {
    const meta = EMOTIONS[data.predicted_emotion] || { emoji: data.emoji, color: "var(--accent)" };

    el.result.hidden = false;
    el.emoji.textContent = meta.emoji;
    el.emoji.classList.remove("pop");
    void el.emoji.offsetWidth;
    el.emoji.classList.add("pop");

    el.emotion.textContent = data.predicted_emotion;
    el.emotion.style.color = meta.color;
    el.confidence.textContent = pct(data.confidence);
    el.result.style.setProperty("--accent-now", meta.color);

    // Sort probabilities high to low so the winner sits on top
    const entries = Object.entries(data.all_probabilities)
      .sort((a, b) => b[1] - a[1]);

    el.bars.innerHTML = "";
    entries.forEach(([label, value], i) => {
      const row = document.createElement("div");
      row.className = "bar-row" + (label === data.predicted_emotion ? " is-top" : "");
      row.style.animationDelay = `${i * 0.06}s`;
      row.style.setProperty("--c", EMOTIONS[label]?.color || "var(--accent)");

      row.innerHTML = `
        <span class="bar-name">${cap(label)}</span>
        <div class="bar-track"><div class="bar-fill"></div></div>
        <span class="bar-value">${pct(value)}</span>`;

      el.bars.appendChild(row);

      // Trigger the width transition on the next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          row.querySelector(".bar-fill").style.width = pct(value);
        });
      });
    });

    el.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- History ---------- */

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveHistory(items) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode): fail silently */
    }
  }

  function addToHistory(text, emotion, emoji) {
    const items = loadHistory().filter((h) => h.text !== text);
    items.unshift({ text, emotion, emoji });
    saveHistory(items.slice(0, MAX_HISTORY));
    renderHistory();
  }

  function renderHistory() {
    const items = loadHistory();
    el.historyList.innerHTML = "";
    el.historySection.hidden = items.length === 0;

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.tabIndex = 0;
      li.innerHTML = `
        <span class="h-emoji">${item.emoji}</span>
        <span class="h-text"></span>
        <span class="h-emotion">${cap(item.emotion)}</span>`;
      li.querySelector(".h-text").textContent = item.text;

      const restore = () => {
        el.input.value = item.text;
        updateCounter();
        el.input.focus();
      };
      li.addEventListener("click", restore);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          restore();
        }
      });
      el.historyList.appendChild(li);
    });
  }

  /* ---------- API ---------- */

  async function checkHealth() {
    el.statusDot.dataset.state = "checking";
    el.statusText.textContent = "Checking model…";
    try {
      const res = await fetch("/health");
      const data = await res.json();
      if (data.model_loaded) {
        el.statusDot.dataset.state = "ok";
        el.statusText.textContent = "Model ready";
      } else {
        el.statusDot.dataset.state = "bad";
        el.statusText.textContent = "Model is still warming up";
      }
    } catch {
      el.statusDot.dataset.state = "bad";
      el.statusText.textContent = "Can't reach the server";
    }
  }

  async function predict(text) {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      let detail = "Something went wrong. Please try again.";
      try {
        const body = await res.json();
        if (typeof body.detail === "string") detail = body.detail;
        else if (Array.isArray(body.detail)) detail = body.detail[0]?.msg || detail;
      } catch { /* non-JSON error body */ }

      if (res.status === 503) detail = "The model is still loading. Try again in a moment.";
      if (res.status === 422 && detail === "Please provide meaningful text") {
        detail = "Please type a sentence with some words in it.";
      }
      throw new Error(detail);
    }

    return res.json();
  }

  /* ---------- Events ---------- */

  el.input.addEventListener("input", () => {
    updateCounter();
    if (!el.error.hidden) clearError();
  });

  el.input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      el.form.requestSubmit();
    }
  });

  el.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    el.input.value = chip.dataset.text;
    updateCounter();
    el.form.requestSubmit();
  });

  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const text = el.input.value.trim();
    if (!text) {
      showError("Type something first, then hit Analyze.");
      el.input.focus();
      return;
    }

    setLoading(true);
    try {
      const data = await predict(text);
      renderResult(data);
      addToHistory(text, data.predicted_emotion, data.emoji);
    } catch (err) {
      showError(err.message || "Couldn't analyze that. Please try again.");
    } finally {
      setLoading(false);
    }
  });

  el.clearHistory.addEventListener("click", () => {
    saveHistory([]);
    renderHistory();
  });

  /* ---------- Init ---------- */

  updateCounter();
  renderHistory();
  checkHealth();
  setInterval(checkHealth, 30000);
})();
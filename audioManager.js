"use strict";

(() => {
  const audio = document.querySelector("#background-music");
  const toggle = document.querySelector("#music-toggle");
  const volume = document.querySelector("#music-volume");
  const state = {
    initialized: false,
    wanted: false,
    unavailable: false,
    volume: 0.3
  };

  audio.loop = true;
  audio.volume = state.volume;

  function updateControl() {
    if (state.unavailable) {
      toggle.textContent = "♫ 音乐未安装";
      toggle.setAttribute("aria-pressed", "false");
      return;
    }
    const playing = state.wanted && !audio.paused;
    toggle.textContent = playing ? "🔊 音乐" : "🔇 静音";
    toggle.setAttribute("aria-pressed", String(playing));
  }

  function ensureSource() {
    if (state.initialized) return;
    state.initialized = true;
    const source = audio.dataset.src;
    if (source) audio.src = source;
  }

  async function play() {
    if (state.unavailable) return false;
    state.wanted = true;
    ensureSource();
    try {
      await audio.play();
      updateControl();
      return true;
    } catch (_error) {
      state.wanted = false;
      state.unavailable = true;
      updateControl();
      return false;
    }
  }

  function pause() {
    state.wanted = false;
    audio.pause();
    updateControl();
  }

  function toggleMusic() {
    if (state.unavailable) return;
    if (state.wanted && !audio.paused) pause();
    else play();
  }

  function setVolume(percent) {
    const normalized = Math.min(100, Math.max(0, Number(percent) || 0));
    state.volume = normalized / 100;
    audio.volume = state.volume;
    volume.value = String(normalized);
    if (normalized === 0) pause();
  }

  toggle.addEventListener("click", toggleMusic);
  volume.addEventListener("input", () => setVolume(volume.value));
  audio.addEventListener("play", updateControl);
  audio.addEventListener("pause", updateControl);
  audio.addEventListener("error", () => {
    state.wanted = false;
    state.unavailable = true;
    updateControl();
  });

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start-game" && !state.initialized && !state.unavailable) play();
  });

  updateControl();
  window.audioManager = Object.freeze({
    play,
    pause,
    toggleMusic,
    setVolume,
    getState: () => ({ ...state, paused: audio.paused, loop: audio.loop })
  });
})();

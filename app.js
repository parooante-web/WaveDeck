const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/**
 * Demo player:
 * - nema pravog audio streama
 * - simulira trajanje + progress
 * - radi queue, shuffle, repeat, liked, search, shortcuts
 */

const BRAND = "WaveDeck";

const tracks = [
  { id:"t1", title:"Neon Drift", artist:"Kairo", album:"Afterglow", dur: 196 },
  { id:"t2", title:"Midnight Runner", artist:"Vexa", album:"Nightline", dur: 214 },
  { id:"t3", title:"Ocean Static", artist:"Lumi", album:"Blue Room", dur: 183 },
  { id:"t4", title:"Chrome Skies", artist:"Arden", album:"Silver Days", dur: 228 },
  { id:"t5", title:"Lowkey Signals", artist:"Mira", album:"Soft Focus", dur: 205 },
  { id:"t6", title:"City Bloom", artist:"Noa", album:"Afterglow", dur: 190 },
  { id:"t7", title:"Heatmap Heart", artist:"Riko", album:"Nightline", dur: 219 },
  { id:"t8", title:"Glasswave", artist:"Sana", album:"Blue Room", dur: 200 },
];

const albums = [
  { name:"Afterglow", sub:"Kairo • Noa", pick:["t1","t6"] },
  { name:"Nightline", sub:"Vexa • Riko", pick:["t2","t7"] },
  { name:"Blue Room", sub:"Lumi • Sana", pick:["t3","t8"] },
  { name:"Silver Days", sub:"Arden", pick:["t4"] },
  { name:"Soft Focus", sub:"Mira", pick:["t5"] },
];

const state = {
  view: "playlist",
  tab: "tracks",
  query: "",
  queue: [],
  liked: new Set(),
  currentId: null,
  isPlaying: false,
  shuffle: false,
  repeat: "off", // off | one | all
  volume: 70,
  curSec: 0,
  tick: null
};

function secToTime(s){
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2,"0")}`;
}

function getTrack(id){
  return tracks.find(t => t.id === id) || null;
}

function ensureQueue(){
  if (state.queue.length === 0){
    state.queue = tracks.map(t => t.id);
  }
}

function filteredTracks(){
  const q = state.query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter(t => {
    const hay = `${t.title} ${t.artist} ${t.album}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderTracks(){
  const list = $("#trackList");
  const items = filteredTracks();

  list.innerHTML = items.map((t, i) => {
    const active = t.id === state.currentId ? "active" : "";
    const liked = state.liked.has(t.id);
    return `
      <div class="track ${active}" data-id="${t.id}">
        <div class="idx">${i+1}</div>
        <div class="titleWrap">
          <div class="artDot" aria-hidden="true"></div>
          <div style="min-width:0">
            <div class="tTitle">${t.title}</div>
            <div class="tArtist">${t.artist}</div>
          </div>
        </div>
        <div class="album">${t.album}</div>
        <div class="duration">${secToTime(t.dur)}</div>
        <button class="more" data-like="${t.id}" title="Like (L)">${liked ? "♥" : "♡"}</button>
      </div>
    `;
  }).join("");

  // click track row -> play
  $$("#trackList .track").forEach(row => {
    row.addEventListener("click", (e) => {
      const id = row.dataset.id;
      // if clicked like button, ignore play trigger (handled below)
      if (e.target && e.target.matches("[data-like]")) return;
      playTrack(id, { fromList: true });
    });
  });

  // like buttons
  $$("#trackList [data-like]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleLike(btn.dataset.like);
    });
  });
}

function renderAlbums(){
  const grid = $("#albumGrid");
  grid.innerHTML = albums.map(a => `
    <div class="albumCard" data-album="${a.name}">
      <div class="albumArt" aria-hidden="true"></div>
      <div class="albumName">${a.name}</div>
      <div class="albumSub">${a.sub}</div>
    </div>
  `).join("");

  $$("#albumGrid .albumCard").forEach(card => {
    card.addEventListener("click", () => {
      const name = card.dataset.album;
      const a = albums.find(x => x.name === name);
      if (!a) return;
      state.queue = a.pick.slice();
      playTrack(state.queue[0], { fromQueue:true });
      toast(`Album: ${name}`);
      renderQueue();
    });
  });
}

function renderQueue(){
  const q = $("#queueList");
  const qm = $("#queueListMobile");
  const ids = state.queue.slice();

  const html = ids.map((id, idx) => {
    const t = getTrack(id);
    if (!t) return "";
    const active = id === state.currentId ? "active" : "";
    return `
      <div class="qItem ${active}" data-q="${idx}">
        <div class="qTitle">${t.title}</div>
        <div class="qSub">${t.artist} • ${t.album}</div>
      </div>
    `;
  }).join("") || `<div class="muted tiny">Queue je prazna.</div>`;

  q.innerHTML = html;
  qm.innerHTML = html;

  const bind = (root) => {
    root.querySelectorAll(".qItem[data-q]").forEach(el => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.q);
        const id = state.queue[idx];
        if (id) playTrack(id, { fromQueue:true });
      });
    });
  };
  bind(q);
  bind(qm);

  syncNowPlaying();
}

function toast(msg){
  // super simple: reuse title line quick feedback
  $("#npStatus").textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    $("#npStatus").textContent = state.isPlaying ? "Playing" : (state.currentId ? "Paused" : "Idle");
  }, 1200);
}

function setTab(tab){
  state.tab = tab;
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tabPage").forEach(p => p.classList.add("hidden"));
  $(`#tab-${tab}`).classList.remove("hidden");
}

function toggleLike(id){
  if (state.liked.has(id)) state.liked.delete(id);
  else state.liked.add(id);

  // update like button in player bar if current
  syncLikeUI();
  renderTracks();
  toast(state.liked.has(id) ? "Liked" : "Unliked");
}

function syncLikeUI(){
  const likeBtn = $("#likeBtn");
  const cur = state.currentId;
  const liked = cur && state.liked.has(cur);
  likeBtn.textContent = liked ? "♥" : "♡";
}

function pickNextId(){
  ensureQueue();
  const ids = state.queue;

  if (!state.currentId) return ids[0];

  const curIdx = ids.indexOf(state.currentId);
  if (curIdx === -1) return ids[0];

  if (state.shuffle){
    if (ids.length === 1) return ids[0];
    let nxt = state.currentId;
    while (nxt === state.currentId) nxt = ids[Math.floor(Math.random() * ids.length)];
    return nxt;
  }

  const nextIdx = curIdx + 1;
  if (nextIdx < ids.length) return ids[nextIdx];

  // end of queue
  if (state.repeat === "all") return ids[0];
  return null;
}

function pickPrevId(){
  ensureQueue();
  const ids = state.queue;

  if (!state.currentId) return ids[0];

  const curIdx = ids.indexOf(state.currentId);
  if (curIdx === -1) return ids[0];

  if (state.shuffle){
    return ids[Math.floor(Math.random() * ids.length)];
  }

  const prevIdx = curIdx - 1;
  if (prevIdx >= 0) return ids[prevIdx];

  if (state.repeat === "all") return ids[ids.length - 1];
  return ids[0];
}

function playTrack(id, opts = {}){
  const t = getTrack(id);
  if (!t) return;

  state.currentId = id;
  state.curSec = 0;
  state.isPlaying = true;

  // if starting from list and queue doesn't include it, set queue = filtered list order
  if (opts.fromList){
    const f = filteredTracks().map(x => x.id);
    state.queue = f.length ? f : tracks.map(x => x.id);
  }

  syncNowPlaying();
  renderTracks();
  renderQueue();
  startTick();
}

function pause(){
  state.isPlaying = false;
  stopTick();
  syncNowPlaying();
}

function resume(){
  if (!state.currentId){
    ensureQueue();
    playTrack(state.queue[0], { fromQueue:true });
    return;
  }
  state.isPlaying = true;
  syncNowPlaying();
  startTick();
}

function next(){
  const nxt = pickNextId();
  if (!nxt){
    // end
    state.isPlaying = false;
    stopTick();
    toast("Kraj queue-a");
    syncNowPlaying();
    return;
  }
  playTrack(nxt, { fromQueue:true });
}

function prev(){
  const p = pickPrevId();
  playTrack(p, { fromQueue:true });
}

function startTick(){
  stopTick();
  state.tick = setInterval(() => {
    if (!state.isPlaying) return;
    const t = getTrack(state.currentId);
    if (!t) return;

    state.curSec += 1;

    // end track
    if (state.curSec >= t.dur){
      if (state.repeat === "one"){
        state.curSec = 0;
        syncProgress();
        return;
      }
      next();
      return;
    }

    syncProgress();
  }, 1000);

  syncProgress();
}

function stopTick(){
  if (state.tick) clearInterval(state.tick);
  state.tick = null;
}

function syncProgress(){
  const t = getTrack(state.currentId);
  const dur = t ? t.dur : 0;
  const cur = t ? state.curSec : 0;
  const max = 1000;

  $("#curTime").textContent = secToTime(cur);
  $("#durTime").textContent = secToTime(dur);

  const val = dur ? Math.round((cur / dur) * max) : 0;
  const prog = $("#progress");
  prog.value = String(val);
}

function syncNowPlaying(){
  const t = getTrack(state.currentId);

  $("#miniTitle").textContent = t ? t.title : "Odaberi pjesmu";
  $("#miniArtist").textContent = t ? `${t.artist} • ${t.album}` : "—";

  $("#npTitle").textContent = t ? t.title : "—";
  $("#npArtist").textContent = t ? `${t.artist} • ${t.album}` : "—";

  $("#npMode").textContent =
    (state.shuffle ? "Shuffle " : "Normal ") +
    (state.repeat === "one" ? "• Repeat 1" : state.repeat === "all" ? "• Repeat All" : "");

  $("#npStatus").textContent = state.currentId
    ? (state.isPlaying ? "Playing" : "Paused")
    : "Idle";

  $("#playBtn").textContent = state.isPlaying ? "⏸" : "▶";

  $("#shuffleBtn").classList.toggle("active", state.shuffle);
  $("#repeatBtn").classList.toggle("active", state.repeat !== "off");

  syncLikeUI();
}

function bindUI(){
  // brand/year
  $("#appName").textContent = BRAND;
  $("#brandFoot").textContent = BRAND;
  $("#year").textContent = String(new Date().getFullYear());

  // tabs
  $$(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  setTab("tracks");

  // view pills (demo)
  $$(".pill").forEach(p => p.addEventListener("click", () => {
    $$(".pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    state.view = p.dataset.view;

    if (state.view === "liked"){
      state.queue = Array.from(state.liked);
      if (state.queue.length === 0) toast("Nema liked pjesama");
      renderQueue();
    } else if (state.view === "queue"){
      renderQueue();
    } else {
      ensureQueue();
      renderQueue();
    }
  }));

  // search
  $("#search").addEventListener("input", (e) => {
    state.query = e.target.value || "";
    renderTracks();
  });

  // focus mode
  $("#focusToggle").addEventListener("change", (e) => {
    document.body.classList.toggle("focus", e.target.checked);
  });

  // controls
  $("#playBtn").addEventListener("click", () => state.isPlaying ? pause() : resume());
  $("#nextBtn").addEventListener("click", next);
  $("#prevBtn").addEventListener("click", prev);

  $("#shuffleBtn").addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    syncNowPlaying();
    toast(state.shuffle ? "Shuffle ON" : "Shuffle OFF");
  });

  $("#repeatBtn").addEventListener("click", () => {
    state.repeat = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
    syncNowPlaying();
    toast(state.repeat === "off" ? "Repeat OFF" : state.repeat === "all" ? "Repeat ALL" : "Repeat ONE");
  });

  $("#likeBtn").addEventListener("click", () => {
    if (!state.currentId) return toast("Pusti pjesmu prvo");
    toggleLike(state.currentId);
  });

  // progress scrub
  $("#progress").addEventListener("input", (e) => {
    const t = getTrack(state.currentId);
    if (!t) return;
    const v = Number(e.target.value || 0) / 1000;
    state.curSec = Math.round(v * t.dur);
    syncProgress();
  });

  // volume (UI only)
  $("#volume").addEventListener("input", (e) => {
    state.volume = Number(e.target.value || 70);
  });

  // hero actions
  $("#playAll").addEventListener("click", () => {
    state.queue = tracks.map(t => t.id);
    playTrack(state.queue[0], { fromQueue:true });
    renderQueue();
  });
  $("#shuffleAll").addEventListener("click", () => {
    state.shuffle = true;
    state.queue = tracks.map(t => t.id);
    playTrack(state.queue[Math.floor(Math.random() * state.queue.length)], { fromQueue:true });
    syncNowPlaying();
    renderQueue();
  });

  $("#playDailyMix").addEventListener("click", () => {
    // fake mix: take 5 random unique
    const ids = tracks.map(t => t.id).sort(() => Math.random() - 0.5).slice(0,5);
    state.queue = ids;
    playTrack(ids[0], { fromQueue:true });
    renderQueue();
    toast("Daily Mix");
  });

  $("#clearQueue").addEventListener("click", () => {
    state.queue = [];
    stopTick();
    state.currentId = null;
    state.isPlaying = false;
    renderQueue();
    renderTracks();
    syncNowPlaying();
    $("#curTime").textContent = "0:00";
    $("#durTime").textContent = "0:00";
    $("#progress").value = "0";
    toast("Queue cleared");
  });

  // shortcuts modal
  const openModal = (v) => {
    const m = $("#shortcutsModal");
    m.classList.toggle("hidden", !v);
    m.setAttribute("aria-hidden", String(!v));
  };
  $("#openShortcuts").addEventListener("click", () => openModal(true));
  $("#closeShortcuts").addEventListener("click", () => openModal(false));
  $("#shortcutsModal").addEventListener("click", (e) => {
    if (e.target.id === "shortcutsModal") openModal(false);
  });

  // mobile queue drawer
  const openDrawer = (v) => {
    const d = $("#queueDrawer");
    d.classList.toggle("hidden", !v);
    d.setAttribute("aria-hidden", String(!v));
  };
  $("#openQueueOnMobile").addEventListener("click", () => openDrawer(true));
  $("#closeDrawer").addEventListener("click", () => openDrawer(false));
  $("#queueDrawer").addEventListener("click", (e) => {
    if (e.target.id === "queueDrawer") openDrawer(false);
  });

  // keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    const typing = tag === "input" || tag === "textarea";
    if (typing && e.key !== "Escape") return;

    if (e.key === "/"){
      e.preventDefault();
      $("#search").focus();
      return;
    }
    if (e.key === " "){
      e.preventDefault();
      state.isPlaying ? pause() : resume();
      return;
    }
    if (e.key.toLowerCase() === "k") return next();
    if (e.key.toLowerCase() === "j") return prev();
    if (e.key.toLowerCase() === "s"){
      state.shuffle = !state.shuffle;
      syncNowPlaying();
      toast(state.shuffle ? "Shuffle ON" : "Shuffle OFF");
      return;
    }
    if (e.key.toLowerCase() === "r"){
      state.repeat = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
      syncNowPlaying();
      toast(state.repeat === "off" ? "Repeat OFF" : state.repeat === "all" ? "Repeat ALL" : "Repeat ONE");
      return;
    }
    if (e.key.toLowerCase() === "l"){
      if (!state.currentId) return toast("Pusti pjesmu prvo");
      toggleLike(state.currentId);
      return;
    }
    if (e.key === "Escape"){
      openModal(false);
      openDrawer(false);
    }
  });
}

function init(){
  ensureQueue();
  renderTracks();
  renderAlbums();
  renderQueue();
  syncNowPlaying();
  syncProgress();
  bindUI();
}

init();

// =====================================================
//  Music is my life — music player with a doubly linked playlist
// =====================================================

// ---------- Model ----------
interface Track {
  id: number;
  title: string;
  artist: string;
  duration: number; // Seconds
  url: string;      // Temporary URL for a local file
}

class TrackNode {
  prev: TrackNode | null = null;
  next: TrackNode | null = null;
  constructor(public track: Track) {}
}

// ---------- Doubly linked playlist ----------
class Playlist {
  head: TrackNode | null = null;
  tail: TrackNode | null = null;
  size = 0;

  // Insert `node` immediately before `ref` (or at the end if `ref` is null).
  private insertBefore(ref: TrackNode | null, node: TrackNode): void {
    node.next = ref;
    node.prev = ref ? ref.prev : this.tail;
    if (node.prev) node.prev.next = node; else this.head = node;
    if (ref) ref.prev = node; else this.tail = node;
    this.size++;
  }

  // Unlink `node` and reconnect its neighbors.
  private unlink(node: TrackNode): void {
    if (node.prev) node.prev.next = node.next; else this.head = node.next;
    if (node.next) node.next.prev = node.prev; else this.tail = node.prev;
    node.prev = node.next = null;
    this.size--;
  }

  addFirst(track: Track): TrackNode {
    const node = new TrackNode(track);
    this.insertBefore(this.head, node);
    return node;
  }

  addLast(track: Track): TrackNode {
    const node = new TrackNode(track);
    this.insertBefore(null, node);
    return node;
  }

  // index: 0 = beginning, size = end
  addAt(index: number, track: Track): TrackNode | null {
    if (index < 0 || index > this.size) return null;
    const node = new TrackNode(track);
    this.insertBefore(index === this.size ? null : this.getNode(index), node);
    return node;
  }

  remove(node: TrackNode): void {
    this.unlink(node);
  }

  moveUp(node: TrackNode): void {
    const p = node.prev;
    if (!p) return;
    this.unlink(node);
    this.insertBefore(p, node);
  }

  moveDown(node: TrackNode): void {
    const n = node.next;
    if (!n) return;
    this.unlink(node);
    this.insertBefore(n.next, node);
  }

  // Traverse from the nearest end.
  getNode(index: number): TrackNode | null {
    if (index < 0 || index >= this.size) return null;
    let node: TrackNode | null;
    if (index < this.size / 2) {
      node = this.head;
      for (let i = 0; i < index; i++) node = node!.next;
    } else {
      node = this.tail;
      for (let i = this.size - 1; i > index; i--) node = node!.prev;
    }
    return node;
  }

  toArray(): TrackNode[] {
    const out: TrackNode[] = [];
    for (let n = this.head; n; n = n.next) out.push(n);
    return out;
  }

  shuffle(): void {
    const nodes = this.toArray();
    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    }
    this.head = this.tail = null;
    this.size = 0;
    nodes.forEach((n) => this.insertBefore(null, n));
  }

  clear(): void {
    this.head = this.tail = null;
    this.size = 0;
  }
}

// ---------- State ----------
type LoopMode = "off" | "all" | "one";

interface SeasonalTheme {
  id: string;
  icon: string;
  name: string;
  decorations: string[];
}

const list = new Playlist();
const audio = new Audio();
let current: TrackNode | null = null;
let loadedNode: TrackNode | null = null;
let loop: LoopMode = "off";
let nextId = 1;
let dragging = false;
let filter = "";
let appliedSeasonId: string | null | undefined;

// ---------- Utilities ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function getColombiaDate(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (![year, month, day].every(Number.isInteger)) throw new Error("Could not determine the current date in Colombia.");
  return new Date(Date.UTC(year, month - 1, day));
}

function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function daysFrom(date: Date, reference: Date): number {
  return Math.round((date.getTime() - reference.getTime()) / 86_400_000);
}

function seasonForColombiaDate(date: Date): SeasonalTheme | null {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const easter = getEasterSunday(year);
  const daysToEaster = daysFrom(date, easter);
  const theme = (id: string, icon: string, name: string, decorations: string[]): SeasonalTheme => ({ id, icon, name, decorations });

  if (month === 0 && day >= 2 && day <= 12) return theme("black-and-white-carnival", "🎭", "Manizales Fair & Black and White Carnival", ["🎭", "🎺", "🎉", "⚫", "⚪"]);
  if (daysToEaster >= -50 && daysToEaster <= -47) return theme("carnival", "🎉", "Carnival of Barranquilla", ["🎉", "🎭", "🥁", "🎺", "🪇"]);
  if (daysToEaster >= -7 && daysToEaster <= 0) return theme("holy-week", "🕊️", "Holy Week in Colombia", ["🕊️", "✨", "🌿", "🕯️"]);

  const firstMaySunday = 1 + ((7 - new Date(Date.UTC(year, 4, 1)).getUTCDay()) % 7);
  if (month === 4 && day >= firstMaySunday + 4 && day <= firstMaySunday + 10) {
    return theme("mothers-day", "🌷", "Mother's Day in Colombia", ["🌷", "💐", "💖", "🌸"]);
  }
  if (month === 5 && day >= 24 && day <= 30) return theme("san-pedro", "🎶", "San Juan & San Pedro Festival", ["🎶", "👒", "🎉", "🌼"]);
  if (month === 6 && day >= 14 && day <= 20) return theme("independence", "🇨🇴", "Colombian Independence Day", ["🇨🇴", "💛", "💙", "❤️"]);
  if (month === 7 && day >= 1 && day <= 10) return theme("flowers", "🌸", "Flower Festival of Medellin", ["🌸", "🌼", "🌺", "🌿"]);

  const firstSeptemberDay = new Date(Date.UTC(year, 8, 1)).getUTCDay();
  const thirdSaturday = 1 + ((6 - firstSeptemberDay + 7) % 7) + 14;
  if (month === 8 && day >= thirdSaturday - 6 && day <= thirdSaturday) {
    return theme("friendship", "💛", "Love and Friendship Day", ["💛", "🎁", "🌷", "💌"]);
  }
  if (month === 9) return theme("halloween", "🎃", "Halloween in Colombia", ["🎃", "👻", "🦇", "🕸️", "🕷️"]);
  if (month === 10 && day >= 7 && day <= 13) return theme("cartagena", "🏰", "Cartagena Independence Festivities", ["🏰", "🎉", "🇨🇴", "🎺"]);
  if (month === 11) return theme("christmas", "🎄", "Christmas in Colombia", ["🎄", "🎁", "❄️", "🔔", "✨"]);
  return null;
}

function applySeasonalTheme() {
  const season = seasonForColombiaDate(getColombiaDate());
  const seasonId = season?.id ?? null;
  if (appliedSeasonId === seasonId) return;
  appliedSeasonId = seasonId;
  const root = document.documentElement;
  const badge = $("season-badge");
  const decoration = $("season-decor");
  if (!season) {
    root.dataset.theme = "blue";
    badge.hidden = true;
    decoration.replaceChildren();
    decoration.hidden = true;
    return;
  }
  root.dataset.theme = season.id;
  $("season-icon").textContent = season.icon;
  $("season-name").textContent = season.name;
  badge.hidden = false;
  decoration.replaceChildren(...season.decorations.map((emoji, index) => {
    const ornament = document.createElement("span");
    ornament.className = "season-ornament";
    ornament.textContent = emoji;
    ornament.style.setProperty("--ornament-index", String(index));
    return ornament;
  }));
  decoration.hidden = false;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function say(text: string, error = false) {
  const el = $("msg");
  el.textContent = text;
  el.className = error ? "error" : "";
}

function coverStyle(title: string): string {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  const themeHues: Record<string, number> = {
    blue: 205,
    "black-and-white-carnival": 15,
    carnival: 12,
    "holy-week": 260,
    "mothers-day": 333,
    "san-pedro": 32,
    independence: 8,
    flowers: 325,
    friendship: 315,
    halloween: 25,
    cartagena: 22,
    christmas: 350,
  };
  h = (themeHues[document.documentElement.dataset.theme ?? "blue"] + (h % 35) - 17 + 360) % 360;
  return `linear-gradient(135deg, hsl(${h} 75% 58%), hsl(${(h + 28) % 360} 78% 27%))`;
}

function parseName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, "");
  const i = base.indexOf(" - ");
  if (i > 0) return { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() };
  return { title: base.trim(), artist: "Unknown artist" };
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    const finish = (duration: number) => {
      clearTimeout(timeout);
      a.onloadedmetadata = null;
      a.onerror = null;
      resolve(duration);
    };
    const timeout = window.setTimeout(() => finish(0), 10000);
    a.onloadedmetadata = () => finish(Number.isFinite(a.duration) ? Math.round(a.duration) : 0);
    a.onerror = () => finish(0);
    a.src = url;
  });
}

function setRange(input: HTMLInputElement, value: number, max: number) {
  input.value = String(value);
  input.style.setProperty("--p", max > 0 ? `${(value / max) * 100}%` : "0%");
}

// ---------- Playback ----------
function ensureLoaded() {
  if (current && loadedNode !== current) {
    audio.src = current.track.url;
    loadedNode = current;
  }
}

async function play() {
  if (!current) return;
  ensureLoaded();
  try { await audio.play(); } catch { say("This file could not be played.", true); }
}

const pause = () => audio.pause();
const toggle = () => (audio.paused ? play() : pause());

function selectNode(node: TrackNode, autoplay = true) {
  current = node;
  loadedNode = null;
  ensureLoaded();
  if (autoplay) play();
  render();
}

function next() {
  if (!current) return;
  const n = current.next ?? (loop !== "off" ? list.head : null);
  if (n) selectNode(n); else say("You're already at the last track.");
}

function prev() {
  if (!current) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const p = current.prev ?? (loop !== "off" ? list.tail : null);
  if (p) selectNode(p); else audio.currentTime = 0;
}

function removeNode(node: TrackNode) {
  const wasCurrent = node === current;
  const replacement = node.next ?? node.prev;
  list.remove(node);
  releaseTrackUrl(node.track.url);
  if (wasCurrent) {
    const wasPlaying = !audio.paused;
    audio.pause();
    current = replacement;
    loadedNode = null;
    if (current) { ensureLoaded(); if (wasPlaying) play(); }
    else { audio.removeAttribute("src"); audio.load(); }
  }
  say(`Removed "${node.track.title}".`);
  render();
}

function clearAll() {
  list.toArray().forEach((n) => releaseTrackUrl(n.track.url));
  list.clear();
  current = null;
  loadedNode = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  say("Playlist cleared.");
  render();
}

function releaseTrackUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

// ---------- Add files ----------
function addFiles(files: File[]) {
  const valid = files.filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(f.name));
  if (!valid.length) return say("Choose audio files (MP3, WAV, OGG, M4A, and more).", true);

  const where = $<HTMLSelectElement>("in-where").value;
  const pos = Number($<HTMLInputElement>("in-index").value) - 1;
  if (where === "index" && !(Number.isInteger(pos) && pos >= 0 && pos <= list.size)) {
    return say(`Choose a position between 1 and ${list.size + 1}.`, true);
  }

  say("Adding songs…");
  let added = 0;
  for (const file of valid) {
    const url = URL.createObjectURL(file);
    const track: Track = { id: nextId++, duration: 0, url, ...parseName(file.name) };
    let node: TrackNode | null;
    if (where === "start") node = list.addAt(added, track);        // Preserve the selected order.
    else if (where === "index") node = list.addAt(pos + added, track);
    else node = list.addLast(track);

    if (node && !current) { current = node; ensureLoaded(); }
    added++;
  }

  say(`Added ${added} song(s). Select a track to play it.`);
  $<HTMLInputElement>("in-file").value = "";
  render();
}

async function loadBundledSongs() {
  const songs = [
    { name: "Bacilos - Caraluna (Lyric Video).mp3", url: new URL("./SONG/Bacilos - Caraluna (Video con Letra).mp3", import.meta.url).href },
    { name: "Vicente Fernández - Sublime Mujer (Lyrics).mp3", url: new URL("./SONG/Vicente Fernández - Sublime Mujer (Letra).mp3", import.meta.url).href },
  ];
  let added = 0;
  for (const song of songs) {
    const duration = await readDuration(song.url);
    if (!duration) continue;
    const node = list.addLast({ id: nextId++, duration, url: song.url, ...parseName(song.name) });
    if (!current) {
      current = node;
      ensureLoaded();
    }
    added++;
  }
  if (added) say(`Ready to play: ${added} sample song(s) loaded.`);
  else say("The sample songs could not be loaded.", true);
  render();
}

// ---------- Rendering ----------
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function renderList() {
  const ol = $("list");
  ol.replaceChildren();
  const q = filter.trim().toLowerCase();

  list.toArray().forEach((node, i) => {
    const t = node.track;
    if (q && !`${t.title} ${t.artist}`.toLowerCase().includes(q)) return;

    const li = el("li", "row" + (node === current ? " playing" : ""));
    const mini = el("div", "mini", node === current && !audio.paused ? "▶" : String(i + 1));
    mini.style.background = coverStyle(t.title);

    const info = el("button", "info");
    info.append(el("b", "", t.title), el("span", "", t.artist));
    info.onclick = () => (node === current ? toggle() : selectNode(node));

    const dur = el("span", "dur", fmt(t.duration));

    const tools = el("div", "tools");
    const up = el("button", "", "↑"); up.title = "Move up";
    const down = el("button", "", "↓"); down.title = "Move down";
    const del = el("button", "danger", "✕"); del.title = "Remove";
    up.onclick = () => { list.moveUp(node); render(); };
    down.onclick = () => { list.moveDown(node); render(); };
    del.onclick = () => removeNode(node);
    tools.append(up, down, del);

    li.append(mini, info, dur, tools);
    ol.append(li);
  });

  const total = list.toArray().reduce((s, n) => s + n.track.duration, 0);
  $("summary").textContent = `${list.size} ${list.size === 1 ? "song" : "songs"} · ${fmt(total)}`;
  $("playlist-count").textContent = String(list.size);
  $("empty").style.display = list.size ? "none" : "block";
}

function renderNow() {
  const t = current?.track;
  $("now-title").textContent = t ? t.title : "Nothing playing";
  $("now-artist").textContent = t ? t.artist : "Add music to get started";
  const cover = $("cover");
  cover.style.background = t ? coverStyle(t.title) : "";
  $("t-dur").textContent = fmt(t?.duration ?? 0);
  const seek = $<HTMLInputElement>("seek");
  seek.max = String(t?.duration ?? 0);
  if (!dragging) { setRange(seek, audio.currentTime, t?.duration ?? 0); $("t-cur").textContent = fmt(audio.currentTime); }

  $("btn-play").textContent = audio.paused ? "▶" : "⏸";
  const labels: Record<LoopMode, string> = { off: "Repeat: off", all: "Repeat: playlist", one: "Repeat: track" };
  $("btn-loop").textContent = loop === "one" ? "🔂" : "🔁";
  $("btn-loop").classList.toggle("on", loop !== "off");
  $("loop-label").textContent = labels[loop];
  document.title = t && !audio.paused ? `${t.title} — Music is my life` : "Music is my life";
}

function render() { renderList(); renderNow(); }

// ---------- Audio events ----------
audio.onplay = audio.onpause = () => render();
audio.onloadedmetadata = () => {
  if (!current || !Number.isFinite(audio.duration)) return;
  current.track.duration = Math.round(audio.duration);
  render();
};
audio.onerror = () => {
  if (current) say(`Could not read "${current.track.title}". Try another audio file.`, true);
};
audio.ontimeupdate = () => {
  if (dragging || !current) return;
  setRange($<HTMLInputElement>("seek"), audio.currentTime, current.track.duration);
  $("t-cur").textContent = fmt(audio.currentTime);
};
audio.onended = () => {
  if (loop === "one") { audio.currentTime = 0; play(); return; }
  const n = current?.next ?? (loop === "all" ? list.head : null);
  if (n) selectNode(n);
  else { audio.currentTime = 0; render(); }
};

// ---------- Controls ----------
$("btn-play").onclick = toggle;
$("btn-next").onclick = next;
$("btn-prev").onclick = prev;
$("btn-shuffle").onclick = () => { list.shuffle(); say("Playlist shuffled."); render(); };
$("btn-loop").onclick = () => { loop = loop === "off" ? "all" : loop === "all" ? "one" : "off"; renderNow(); };
$("btn-clear").onclick = () => { if (list.size && confirm("Clear the entire playlist?")) clearAll(); };

const seek = $<HTMLInputElement>("seek");
seek.oninput = () => { dragging = true; $("t-cur").textContent = fmt(Number(seek.value)); setRange(seek, Number(seek.value), Number(seek.max)); };
seek.onchange = () => { audio.currentTime = Number(seek.value); dragging = false; };

const vol = $<HTMLInputElement>("vol");
try { const v = localStorage.getItem("music-is-my-life-volume"); if (v !== null) audio.volume = Number(v); } catch { /* Storage may be unavailable. */ }
setRange(vol, Math.round(audio.volume * 100), 100);
$("vol-value").textContent = `${Math.round(audio.volume * 100)}%`;
$("btn-mute").textContent = audio.volume === 0 ? "🔇" : "🔊";
vol.oninput = () => {
  audio.volume = Number(vol.value) / 100;
  audio.muted = false;
  setRange(vol, Number(vol.value), 100);
  $("vol-value").textContent = `${vol.value}%`;
  $("btn-mute").textContent = audio.volume === 0 ? "🔇" : "🔊";
  try { localStorage.setItem("music-is-my-life-volume", String(audio.volume)); } catch { /* Storage may be unavailable. */ }
};
$("btn-mute").onclick = () => { audio.muted = !audio.muted; $("btn-mute").textContent = audio.muted ? "🔇" : "🔊"; };

// ---------- Add / search ----------
$("btn-files").onclick = () => $<HTMLInputElement>("in-file").click();
$<HTMLInputElement>("in-file").onchange = (e) => addFiles(Array.from((e.target as HTMLInputElement).files ?? []));
$<HTMLSelectElement>("in-where").onchange = (e) => {
  $<HTMLInputElement>("in-index").disabled = (e.target as HTMLSelectElement).value !== "index";
};
$<HTMLInputElement>("in-search").oninput = (e) => { filter = (e.target as HTMLInputElement).value; renderList(); };
// Drag and drop
const library = $("library");
document.addEventListener("dragover", (e) => { e.preventDefault(); library.classList.add("dragover"); });
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) library.classList.remove("dragover"); });
document.addEventListener("drop", (e) => {
  e.preventDefault();
  library.classList.remove("dragover");
  addFiles(Array.from(e.dataTransfer?.files ?? []));
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); toggle(); }
  else if (e.key === "n" || e.key === "N") next();
  else if (e.key === "p" || e.key === "P") prev();
  else if (e.key === "m" || e.key === "M") $("btn-mute").click();
});

render();
applySeasonalTheme();
window.setInterval(applySeasonalTheme, 60_000);
void loadBundledSongs();

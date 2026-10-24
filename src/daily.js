import { geoCentroid, geoDistance } from "d3-geo";
import { matchesPlace } from "./fuzzy.js";

export const DAILY_TRIES = 6;
export const DAILY_KEY = "saan-daily-v1";

const EPOCH = Date.UTC(2026, 0, 1);
const DIRECTIONS = [
  ["N", "↑"],
  ["NE", "↗"],
  ["E", "→"],
  ["SE", "↘"],
  ["S", "↓"],
  ["SW", "↙"],
  ["W", "←"],
  ["NW", "↖"],
];

export function manilaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function puzzleNumber(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - EPOCH) / 86400000) + 1;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIds(ids) {
  const copy = ids.slice();
  const random = mulberry32(20260101);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function dailyProvince(provinces, now = new Date()) {
  const date = manilaDate(now);
  const deck = shuffledIds(provinces.map((province) => province.id));
  const index = ((puzzleNumber(date) - 1) % deck.length + deck.length) % deck.length;
  return {
    date,
    number: puzzleNumber(date),
    place: provinces.find((province) => province.id === deck[index]),
  };
}

export function placeBearing(fromFeature, toFeature) {
  const from = geoCentroid(fromFeature);
  const to = geoCentroid(toFeature);
  const km = Math.round(geoDistance(from, to) * 6371);
  const [lon1, lat1] = from.map((value) => (value * Math.PI) / 180);
  const [lon2, lat2] = to.map((value) => (value * Math.PI) / 180);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const [direction, arrow] = DIRECTIONS[Math.round(degrees / 45) % 8];
  return { km, direction, arrow };
}

export function resolveGuess(input, provinces) {
  return provinces.find((province) => matchesPlace(input, province, provinces)) || null;
}

export function loadDaily(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(DAILY_KEY) || "null");
    if (!parsed || typeof parsed.date !== "string" || !Array.isArray(parsed.guesses)) return null;
    return {
      date: parsed.date,
      guesses: parsed.guesses.filter((id) => typeof id === "string"),
      won: Boolean(parsed.won),
      done: Boolean(parsed.done),
      streak: Number.isInteger(parsed.streak) && parsed.streak > 0 ? parsed.streak : 0,
    };
  } catch {
    return null;
  }
}

export function saveDaily(board, storage = globalThis.localStorage) {
  if (!storage) return;
  try {
    storage.setItem(DAILY_KEY, JSON.stringify(board));
  } catch {
    // Private mode and full storage should not break the puzzle.
  }
}

function previousDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - 86400000).toISOString().slice(0, 10);
}

export function boardForToday(saved, today) {
  if (saved?.date === today) return { ...saved, guesses: saved.guesses.slice() };
  const streak = saved?.won && saved.date === previousDate(today) ? saved.streak : 0;
  return { date: today, guesses: [], won: false, done: false, streak };
}

export function applyGuess(board, provinceId, answerId) {
  if (board.done) return { board, note: "" };
  if (!provinceId) return { board, note: "That isn't a province." };
  if (board.guesses.includes(provinceId)) return { board, note: "You already tried that province." };
  const guesses = [...board.guesses, provinceId];
  const won = provinceId === answerId;
  const done = won || guesses.length >= DAILY_TRIES;
  const next = { ...board, guesses, won: done ? won : false, done };
  if (done) next.streak = won ? board.streak + 1 : 0;
  return { board: next, note: "" };
}

export function shareText(board, number) {
  const score = board.won ? `${board.guesses.length}/${DAILY_TRIES}` : `X/${DAILY_TRIES}`;
  const squares = board.guesses
    .map((_, index) => (board.won && index === board.guesses.length - 1 ? "🟩" : "⬛"))
    .join("");
  return `Saan? Daily #${number}\n${board.date} · ${score}\n${squares}`;
}

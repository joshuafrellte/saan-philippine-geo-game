import { describe, expect, it } from "vitest";
import { buildAtlas } from "./atlas.js";
import {
  applyGuess,
  boardForToday,
  countdownPhrase,
  dailyProvince,
  formatCountdown,
  formatEditionDate,
  manilaDate,
  msUntilNextDaily,
  placeBearing,
  puzzleNumber,
  resultMarks,
  shareText,
} from "./daily.js";
import places from "../data/places.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);

describe("daily puzzle", () => {
  it("uses the Manila calendar and a stable deck", () => {
    expect(manilaDate(new Date("2026-10-23T15:59:00Z"))).toBe("2026-10-23");
    expect(manilaDate(new Date("2026-10-23T16:00:00Z"))).toBe("2026-10-24");
    expect(puzzleNumber("2026-01-01")).toBe(1);

    const first = dailyProvince(atlas.provinces, new Date("2026-10-23T04:00:00Z"));
    const again = dailyProvince(atlas.provinces, new Date("2026-10-23T10:00:00Z"));
    const next = dailyProvince(atlas.provinces, new Date("2026-10-24T04:00:00Z"));
    expect(again.place.id).toBe(first.place.id);
    expect(next.place.id).not.toBe(first.place.id);

    const seen = new Set();
    for (let day = 0; day < atlas.provinces.length; day += 1) {
      const when = new Date(Date.UTC(2026, 0, 1 + day, 4));
      seen.add(dailyProvince(atlas.provinces, when).place.id);
    }
    expect(seen.size).toBe(atlas.provinces.length);
  });

  it("points from Sulu toward Batanes", () => {
    const sulu = atlas.provinces.find((province) => province.id === "sulu");
    const batanes = atlas.provinces.find((province) => province.id === "batanes");
    const bearing = placeBearing(sulu.feature, batanes.feature);
    expect(bearing.km).toBeGreaterThan(800);
    expect(["N", "NE"]).toContain(bearing.direction);
    expect(bearing.arrow).toMatch(/\S/);
  });

  it("keeps a streak only across consecutive wins", () => {
    const yesterday = { date: "2026-10-22", guesses: ["cebu"], won: true, done: true, streak: 4 };
    const today = boardForToday(yesterday, "2026-10-23");
    expect(today.streak).toBe(4);
    expect(today.guesses).toEqual([]);

    const won = applyGuess(today, "batanes", "batanes");
    expect(won.board.done).toBe(true);
    expect(won.board.streak).toBe(5);

    let lost = today;
    for (const id of ["cebu", "bohol", "albay", "aklan", "abra", "agusan-del-norte"]) {
      lost = applyGuess(lost, id, "batanes").board;
    }
    expect(lost.done).toBe(true);
    expect(lost.won).toBe(false);
    expect(lost.streak).toBe(0);
    expect(lost.guesses).toHaveLength(6);

    expect(boardForToday(yesterday, "2026-10-24").streak).toBe(0);
    expect(applyGuess(today, "cebu", "batanes").board.guesses).toEqual(["cebu"]);
    expect(applyGuess(won.board, "cebu", "batanes").board).toBe(won.board);
    expect(applyGuess(today, "", "batanes").note).toMatch(/isn't a province/);
    expect(applyGuess({ ...today, guesses: ["cebu"] }, "cebu", "batanes").note).toMatch(/already/);
  });

  it("shares one square per guess", () => {
    const board = { date: "2026-10-23", guesses: ["cebu", "bohol", "batanes"], won: true, done: true, streak: 1 };
    expect(shareText(board, 296)).toBe("Saan? Daily #296\n2026-10-23 · 3/6\n⬛⬛🟩");
    expect(resultMarks(board)).toEqual(["miss", "miss", "hit", "empty", "empty", "empty"]);
    expect(formatEditionDate("2026-10-24")).toBe("October 24");
  });

  it("counts down to the next midnight in Manila", () => {
    const oneMinute = new Date("2026-10-23T15:59:00Z");
    const nextDay = new Date("2026-10-23T16:00:00Z");
    expect(msUntilNextDaily(oneMinute)).toBe(60_000);
    expect(msUntilNextDaily(nextDay)).toBe(86_400_000);
    expect(formatCountdown(60_000)).toBe("00:01:00");
    expect(formatCountdown((8 * 3600 + 14 * 60 + 22) * 1000)).toBe("08:14:22");
    expect(formatCountdown(1_500)).toBe("00:00:02");
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(countdownPhrase((8 * 3600 + 14 * 60 + 22) * 1000)).toBe("Next province in 8 hours 14 minutes");
    expect(countdownPhrase(60 * 60 * 1000)).toBe("Next province in 1 hour");
    expect(countdownPhrase(60 * 1000)).toBe("Next province in 1 minute");
    expect(countdownPhrase(30 * 1000)).toBe("Next province in less than a minute");
  });
});

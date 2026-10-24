import { buildAtlas, validateAtlas } from "./atlas.js";
import { loadMisses, saveMisses } from "./memory.js";
import { MODES, catalogFor, checkAnswer, createQuestion, describePlace, hintSteps, regionWeights, settleScore } from "./quiz.js";
import { mountMap } from "./map.js";
import { DAILY_TRIES, applyGuess, boardForToday, countdownPhrase, dailyProvince, formatCountdown, formatEditionDate, loadDaily, manilaDate, msUntilNextDaily, placeBearing, resolveGuess, resultMarks, saveDaily, shareText } from "./daily.js";
import { suggestPlaces } from "./suggest.js";
import { loadCitySet, loadLocate, loadOutlines, majorCityIds, resolveCities, saveCitySet, saveLocate, saveOutlines } from "./settings.js";
import { studyCard } from "./study.js";
import places from "../data/places.json";
import studyLibrary from "../data/study.json";
import provincesGeo from "../data/provinces.geojson";
import regionsGeo from "../data/regions.geojson";
import citiesGeo from "../data/cities.geojson";

const atlas = buildAtlas(places, provincesGeo, regionsGeo, citiesGeo);
const errors = validateAtlas(atlas);
const app = document.querySelector("#app");

if (errors.length) {
  app.replaceChildren();
  const note = document.createElement("p");
  note.className = "boot-error";
  note.textContent = errors.join("\n");
  app.append(note);
} else {
  boot(atlas);
}

function boot(data) {
  const state = {
    mode: "region",
    misses: loadMisses(),
    question: null,
    answered: false,
    correct: false,
    wrongId: null,
    pickedName: "",
    session: { correct: 0, answered: 0, streak: 0 },
    previousKey: null,
    cityIds: loadCitySet(),
    outlines: loadOutlines(),
    locate: loadLocate(),
    hintStep: 0,
    assisted: false,
    daily: null,
    dailyNote: "",
    studying: false,
    studyLevel: "province",
    studyPlace: null,
  };

  const score = document.querySelector("#score");
  const modes = document.querySelector("#modes");
  const prompt = document.querySelector("#prompt");
  const hint = document.querySelector("#hint");
  const dock = document.querySelector("#dock");
  const svg = document.querySelector("#map");

  const hoverLabel = document.querySelector("#hover-label");
  const studyButton = document.querySelector("#study-open");
  const panel = document.querySelector("#study-panel");
  const shell = document.querySelector("#shell");
  const levels = document.createElement("div");
  levels.className = "study-levels";
  levels.setAttribute("role", "group");
  levels.setAttribute("aria-label", "What you can open");
  for (const [id, label] of [["region", "Regions"], ["province", "Provinces"], ["city", "Cities"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.level = id;
    button.textContent = label;
    button.addEventListener("click", () => {
      state.studyLevel = id;
      paintStudy();
    });
    levels.append(button);
  }
  prompt.parentElement.append(levels);

  const map = mountMap(svg, data, (properties) => {
    if (state.studying) {
      const place = findPlace(properties.id);
      if (place) openPlace(place);
      return;
    }
    if (state.mode === "daily" || state.mode === "type") return;
    if (state.answered || !state.question?.place) return;
    const response = properties.id;
    settle(response, response === state.question.targetId ? null : response, properties.name);
  }, (name, event) => {
    const touch = window.matchMedia("(hover: none)").matches;
    if (!state.studying || touch || !name || !event) {
      hoverLabel.hidden = true;
      return;
    }
    hoverLabel.hidden = false;
    hoverLabel.textContent = name;
    const box = hoverLabel.getBoundingClientRect();
    let x = event.clientX + 12;
    let y = event.clientY + 14;
    if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - 12;
    if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - 14;
    hoverLabel.style.left = `${x}px`;
    hoverLabel.style.top = `${y}px`;
  });

  function view() {
    return { ...data, cities: resolveCities(data.cities, state.cityIds) };
  }

  function cityCountLabel() {
    const active = view().cities.length;
    if (active === data.cities.length) return `${data.cities.length} cities`;
    return `${active} of ${data.cities.length}`;
  }

  function modeButton(mode) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode";
    button.dataset.mode = mode.id;
    button.textContent = mode.label;
    button.addEventListener("click", () => {
      if (state.studying) {
        leaveStudy();
        state.mode = mode.id;
        map.resetZoom();
        ask();
        return;
      }
      if (state.mode === mode.id && !state.answered) return;
      state.mode = mode.id;
      map.resetZoom();
      ask();
    });
    return button;
  }

  function modeGroup(label, list) {
    const group = document.createElement("div");
    group.className = "mode-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    const title = document.createElement("span");
    title.className = "mode-group-label";
    title.textContent = label;
    group.append(title);
    for (const mode of list) group.append(modeButton(mode));
    return group;
  }

  modes.append(
    modeGroup("Play", MODES.filter((mode) => mode.id === "daily")),
    modeGroup("Quiz", MODES.filter((mode) => mode.id !== "daily"))
  );

  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "settings-open";
  const settingsName = document.createElement("span");
  settingsName.className = "settings-name";
  const cityCount = document.createElement("span");
  cityCount.className = "settings-count";
  const settingsCopy = document.createElement("span");
  settingsCopy.className = "settings-copy";
  settingsCopy.append(settingsName, cityCount);
  settingsButton.append(filterIcon(), settingsCopy);
  settingsButton.addEventListener("click", openSettings);
  modes.append(settingsButton);

  function setCityCount() {
    settingsName.textContent = "Map settings";
    cityCount.textContent = cityCountLabel();
  }

  const dialog = document.createElement("dialog");
  dialog.className = "settings";
  app.append(dialog);

  studyButton.addEventListener("click", () => {
    if (state.studying) {
      leaveStudy();
      paint();
      return;
    }
    state.studying = true;
    closePanel(true);
    paintStudy();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.studying || dialog.open) return;
    if (!app.classList.contains("is-reading")) return;
    event.preventDefault();
    closePanel();
  });

  document.querySelector('[data-zoom="in"]').addEventListener("click", () => map.zoomBy(1.6));
  document.querySelector('[data-zoom="out"]').addEventListener("click", () => map.zoomBy(1 / 1.6));
  document.querySelector('[data-zoom="reset"]').addEventListener("click", () => map.resetZoom());

  let dailyClock = 0;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tickDailyClock();
  });

  ask();

  function focusField() {
    const field = dock.querySelector("input");
    if (!field) return;
    field.focus();
    field.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function dailyClockActive() {
    return state.mode === "daily" && state.daily?.done && !state.studying;
  }

  function stopDailyClock() {
    if (!dailyClock) return;
    window.clearInterval(dailyClock);
    dailyClock = 0;
  }

  function syncDailyClock() {
    if (!dailyClockActive()) {
      stopDailyClock();
      return;
    }
    tickDailyClock();
    if (!dailyClock && dailyClockActive()) dailyClock = window.setInterval(tickDailyClock, 1000);
  }

  function tickDailyClock() {
    if (!dailyClockActive()) {
      stopDailyClock();
      return;
    }
    if (state.daily.date !== manilaDate()) {
      stopDailyClock();
      startDaily();
      return;
    }
    const remaining = msUntilNextDaily();
    const time = dock.querySelector("[data-daily-clock]");
    const spoken = dock.querySelector("[data-daily-spoken]");
    if (time) time.textContent = formatCountdown(remaining);
    if (spoken) {
      const phrase = countdownPhrase(remaining);
      if (spoken.textContent !== phrase) spoken.textContent = phrase;
    }
  }

  function ask() {
    if (state.mode === "daily") {
      startDaily();
      return;
    }
    const question = createQuestion(view(), state.mode, state.misses, Math.random, state.previousKey);
    question.review = (state.misses[question.key] || 0) > 0;
    state.question = question;
    state.previousKey = question.key;
    state.answered = false;
    state.correct = false;
    state.wrongId = null;
    state.pickedName = "";
    state.hintStep = 0;
    state.assisted = false;
    paint();
    focusField();
  }

  function startDaily() {
    const puzzle = dailyProvince(data.provinces);
    state.daily = boardForToday(loadDaily(), puzzle.date);
    state.dailyNote = "";
    const done = state.daily.done;
    state.question = {
      mode: "daily",
      key: `daily:${puzzle.place.id}`,
      prompt: done ? puzzle.place.name : "Name this province",
      promptMark: done ? puzzle.place.name : "province",
      map: done ? "province" : "daily",
      highlightId: done ? puzzle.place.id : null,
      targetId: puzzle.place.id,
      answerId: puzzle.place.id,
      place: puzzle.place,
      choices: null,
      dailyNumber: puzzle.number,
    };
    state.previousKey = state.question.key;
    state.answered = done;
    state.correct = state.daily.won;
    state.wrongId = null;
    state.pickedName = "";
    paint();
    focusField();
  }

  function submitDaily(raw, place = null) {
    if (!state.daily || state.daily.done) return;
    const guess = place || resolveGuess(raw, data.provinces);
    const result = applyGuess(state.daily, guess?.id || "", state.question.place.id);
    state.daily = result.board;
    state.dailyNote = result.note;
    if (result.board.done) {
      state.answered = true;
      state.correct = result.board.won;
      state.question = {
        ...state.question,
        prompt: state.question.place.name,
        promptMark: state.question.place.name,
        map: "province",
        highlightId: state.question.place.id,
      };
      saveDaily(state.daily);
    } else if (!result.note) {
      saveDaily(state.daily);
    }
    paint();
    focusField();
  }

  function dailyBoard() {
    const wrap = document.createElement("div");
    wrap.className = "daily-board";
    if (state.daily.guesses.length) {
      const list = document.createElement("ol");
      list.className = "daily-guesses";
      for (const id of state.daily.guesses) {
        const province = data.provinces.find((item) => item.id === id);
        const item = document.createElement("li");
        item.className = "daily-guess";
        const name = document.createElement("span");
        name.textContent = province?.name || id;
        item.append(name);
        if (id === state.question.place.id) {
          item.classList.add("is-correct");
        } else if (province?.feature && state.question.place.feature) {
          const bearing = placeBearing(province.feature, state.question.place.feature);
          const meta = document.createElement("span");
          meta.textContent = `${bearing.km.toLocaleString()} km ${bearing.arrow} ${bearing.direction}`;
          item.append(meta);
        }
        list.append(item);
      }
      wrap.append(list);
    }
    if (!state.daily.done) {
      const form = document.createElement("form");
      form.className = "type-form";
      const input = document.createElement("input");
      input.type = "text";
      input.name = "guess";
      input.placeholder = "Province name";
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      input.enterKeyHint = "done";
      input.setAttribute("aria-label", "Province name");
      input.addEventListener("focus", () => input.scrollIntoView({ block: "nearest", inline: "nearest" }));
      const suggest = mountSuggestions(input, data.provinces, state.daily.guesses, (place) => {
        submitDaily(place.name, place);
      });
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "next";
      const submitLabel = document.createElement("span");
      submitLabel.textContent = "Guess";
      submit.append(submitLabel, enterMark());
      form.append(suggest.wrap, submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const picked = suggest.selected();
        if (picked) {
          submitDaily(picked.name, picked);
          return;
        }
        const guess = input.value.trim();
        if (!guess) {
          input.focus();
          return;
        }
        submitDaily(guess);
      });
      wrap.append(form);
      if (state.dailyNote) {
        const note = document.createElement("p");
        note.className = "daily-note";
        note.textContent = state.dailyNote;
        wrap.append(note);
      }
      return wrap;
    }
    const lead = state.daily.won ? "Correct. " : "That's six. ";
    const feedback = renderFeedback(state.daily.won, `${lead}${describePlace(state.question.place)}`);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "next copy-result";
    const copyLabel = document.createElement("span");
    copyLabel.textContent = "Copy result";
    copy.append(copyIcon(), copyLabel);
    copy.addEventListener("click", async () => {
      const text = shareText(state.daily, state.question.dailyNumber);
      try {
        await navigator.clipboard.writeText(text);
        copyLabel.textContent = "Copied";
      } catch {
        copyLabel.textContent = "Copy failed";
      }
    });
    const squares = document.createElement("div");
    squares.className = "daily-squares";
    squares.setAttribute("role", "img");
    const score = state.daily.won ? state.daily.guesses.length : 0;
    squares.setAttribute("aria-label", `Today's result, ${score} of ${DAILY_TRIES}`);
    for (const mark of resultMarks(state.daily)) {
      const cell = document.createElement("span");
      cell.className = mark === "empty" ? "daily-square" : `daily-square is-${mark}`;
      squares.append(cell);
    }
    const next = document.createElement("div");
    next.className = "daily-next";
    const label = document.createElement("p");
    label.className = "daily-next-kicker";
    label.textContent = "Next province";
    const time = document.createElement("p");
    time.className = "daily-next-time";
    time.dataset.dailyClock = "";
    time.setAttribute("aria-hidden", "true");
    time.textContent = formatCountdown(msUntilNextDaily());
    const spoken = document.createElement("p");
    spoken.className = "daily-next-spoken";
    spoken.dataset.dailySpoken = "";
    spoken.setAttribute("role", "status");
    spoken.textContent = countdownPhrase(msUntilNextDaily());
    const note = document.createElement("p");
    note.className = "daily-next-kicker";
    note.textContent = "Midnight in Manila";
    next.append(label, time, spoken, note);
    if (state.daily.streak > 0) {
      const streak = document.createElement("p");
      streak.className = "daily-next-streak";
      streak.textContent = `${state.daily.streak}-day streak`;
      next.append(streak);
    }
    wrap.append(feedback, squares, copy, next);
    return wrap;
  }

  function settle(response, wrongId, pickedName = "") {
    if (state.answered || !state.question?.place) return;
    const correct = checkAnswer(state.question, response, catalogFor(view(), state.question));
    const scored = settleScore(state.session, state.misses, state.question.key, correct, state.assisted);
    state.answered = true;
    state.correct = correct;
    state.wrongId = correct ? null : wrongId;
    state.pickedName = correct ? "" : pickedName;
    state.session = scored.session;
    if (scored.misses !== state.misses) {
      state.misses = scored.misses;
      saveMisses(state.misses);
    }
    state.hintStep = 0;
    state.assisted = false;
    paint();
    dock.querySelector(".next")?.focus();
  }

  function findPlace(id) {
    return data.regions.find((place) => place.id === id)
      || data.provinces.find((place) => place.id === id)
      || data.cities.find((place) => place.id === id);
  }

  function paintStudy() {
    app.classList.add("is-studying");
    studyButton.classList.add("is-active");
    studyButton.setAttribute("aria-pressed", "true");
    studyButton.textContent = "Quiz";
    setCityCount();
    for (const button of modes.querySelectorAll(".mode")) {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    }
    for (const button of levels.querySelectorAll("button")) {
      const active = button.dataset.level === state.studyLevel;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    const levelName = state.studyLevel === "region" ? "region" : state.studyLevel === "city" ? "city" : "province";
    renderPrompt(prompt, `Hover a ${levelName}, then open it.`, levelName);
    map.show(null, {
      study: {
        level: state.studyLevel,
        selectedId: state.studyPlace?.kind === state.studyLevel ? state.studyPlace.id : null,
      },
      cities: view().cities,
      outlines: state.outlines,
    });
  }

  function leaveStudy() {
    state.studying = false;
    state.studyPlace = null;
    closePanel(true);
    hoverLabel.hidden = true;
    app.classList.remove("is-studying");
    studyButton.classList.remove("is-active");
    studyButton.setAttribute("aria-pressed", "false");
    studyButton.textContent = "Study";
  }

  let slideToken = 0;

  function openPlace(place) {
    state.studyPlace = place;
    state.studyLevel = place.kind;
    renderPanel(place);
    paintStudy();
    hoverLabel.hidden = true;
    if (app.classList.contains("is-panel")) return;
    const token = ++slideToken;
    app.classList.add("is-reading");
    const finish = () => {
      if (token !== slideToken) return;
      slideToken += 1;
      app.classList.add("is-panel");
      panel.inert = false;
      panel.querySelector(".study-close")?.focus();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    const onEnd = (event) => {
      if (event.target !== shell) return;
      if (event.propertyName !== "margin-left" && event.propertyName !== "transform") return;
      shell.removeEventListener("transitionend", onEnd);
      finish();
    };
    shell.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, 700);
  }

  function closePanel(immediate = false) {
    const token = ++slideToken;
    state.studyPlace = null;
    panel.inert = true;
    const finish = () => {
      if (token !== slideToken) return;
      app.classList.remove("is-reading");
    };
    if (immediate || !app.classList.contains("is-panel")) {
      app.classList.remove("is-panel", "is-reading");
      if (state.studying) paintStudy();
      return;
    }
    app.classList.remove("is-panel");
    const onEnd = (event) => {
      if (event.target !== panel || event.propertyName !== "transform") return;
      panel.removeEventListener("transitionend", onEnd);
      finish();
    };
    panel.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, 700);
    if (state.studying) paintStudy();
  }

  function renderPanel(place) {
    const card = studyCard(data, studyLibrary, place);
    panel.replaceChildren();
    const head = document.createElement("div");
    head.className = "study-head";
    const titles = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = card.eyebrow;
    const title = document.createElement("h2");
    title.textContent = card.name;
    titles.append(eyebrow, title);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "study-close";
    close.textContent = "Close";
    close.addEventListener("click", () => closePanel());
    head.append(titles, close);
    const meta = document.createElement("dl");
    meta.className = "study-meta";
    for (const row of card.rows) {
      const wrap = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = row.label;
      const detail = document.createElement("dd");
      detail.textContent = row.text;
      wrap.append(term, detail);
      meta.append(wrap);
    }
    for (const link of card.links) {
      if (!link.place) continue;
      const wrap = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = link.label;
      const detail = document.createElement("dd");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "place-link";
      button.textContent = link.place.name;
      button.addEventListener("click", () => openPlace(link.place));
      detail.append(button);
      wrap.append(term, detail);
      meta.append(wrap);
    }
    const list = document.createElement("ul");
    list.className = "study-facts";
    for (const fact of card.facts) {
      const item = document.createElement("li");
      item.textContent = fact;
      list.append(item);
    }
    panel.append(head, meta, list);
    panel.setAttribute("aria-label", card.name);
  }

  function paint() {
    if (state.studying) {
      paintStudy();
      syncDailyClock();
      return;
    }
    const { question } = state;
    renderPrompt(prompt, question.prompt, question.promptMark);
    hint.textContent = hintFor(question, state);
    setCityCount();

    for (const button of modes.querySelectorAll(".mode")) {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      if (active) button.scrollIntoView({ inline: "nearest", block: "nearest" });
    }

    score.replaceChildren();
    if (state.mode === "daily" && state.daily) {
      const strong = document.createElement("strong");
      strong.textContent = String(state.daily.streak);
      const label = document.createElement("span");
      label.textContent = "daily streak";
      score.append(strong, label);
    } else {
    const ratio = document.createElement("strong");
    ratio.textContent = `${state.session.correct}/${state.session.answered}`;
    const streak = document.createElement("span");
    streak.textContent = `${state.session.streak} in a row`;
    score.append(ratio, streak);
    const saved = Object.keys(state.misses).length;
    if (saved > 0) {
      const review = document.createElement("span");
      review.textContent = `${saved} ${saved === 1 ? "place" : "places"} to review`;
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "text-button";
      clear.textContent = "Reset review list";
      clear.addEventListener("click", () => {
        const placeWord = saved === 1 ? "place" : "places";
        const ok = window.confirm(
          `Reset the review list? This forgets ${saved} ${placeWord} you missed. The score stays.`
        );
        if (!ok) return;
        state.misses = {};
        saveMisses(state.misses);
        paint();
      });
      score.append(review, clear);
    }
    }

    dock.replaceChildren();
    if (question.mode === "daily") {
      dock.append(dailyBoard());
    } else if (question.empty) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Every city is turned off. Open the city list and check at least one.";
      dock.append(note);
    } else if (!state.answered && question.choices) {
      const choices = document.createElement("div");
      choices.className = "choices";
      for (const choice of question.choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice";
        button.textContent = choice.label;
        button.addEventListener("click", () => settle(choice.id, null, choice.label));
        choices.append(button);
      }
      dock.append(choices, assistRow());
    } else if (!state.answered && question.mode === "type") {
      const form = document.createElement("form");
      form.className = "type-form";
      const input = document.createElement("input");
      input.type = "text";
      input.name = "guess";
      input.placeholder =
        question.place.kind === "region"
          ? "Region name"
          : question.place.kind === "city"
            ? "City name"
            : "Province name";
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      input.enterKeyHint = "done";
      input.setAttribute("aria-label", question.prompt);
      input.addEventListener("focus", () => input.scrollIntoView({ block: "nearest", inline: "nearest" }));
      const suggest = mountSuggestions(input, catalogFor(view(), question), [], (place) => {
        settle(place.id, null, place.label || place.name);
      });
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "next";
      const submitLabel = document.createElement("span");
      submitLabel.textContent = "Check";
      submit.append(submitLabel, enterMark());
      form.append(suggest.wrap, submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const picked = suggest.selected();
        if (picked) {
          settle(picked.id, null, picked.label || picked.name);
          return;
        }
        const guess = input.value.trim();
        if (!guess) {
          input.focus();
          return;
        }
        settle(guess, null, "");
      });
      dock.append(form, assistRow(true));
    } else if (!state.answered) {
      dock.append(assistRow());
    } else {
      const lead = state.correct ? "Correct. " : "Not quite. ";
      const named = state.pickedName ? `That's ${state.pickedName}. ` : "";
      const feedback = renderFeedback(state.correct, `${lead}${named}${describePlace(question.place)}`);
      const next = document.createElement("button");
      next.type = "button";
      next.className = "next";
      next.textContent = "Next";
      next.addEventListener("click", ask);
      dock.append(feedback);
      if (state.session.answered > 0 && state.session.answered % 10 === 0) dock.append(sessionSummary());
      dock.append(next);
    }

    map.show(question, {
      wrongId: state.wrongId,
      locked: state.answered,
      cities: view().cities,
      outlines: state.outlines,
      locate: state.locate !== false,
    });
    syncDailyClock();
  }

  function assistRow(withHint = false) {
    const row = document.createElement("div");
    row.className = "assist";
    if (withHint) {
      const steps = hintSteps(state.question?.place);
      if (state.hintStep < steps.length) {
        const hintButton = document.createElement("button");
        hintButton.type = "button";
        hintButton.className = "hint-button";
        hintButton.textContent = state.hintStep === 0 ? "Hint" : "Another hint";
        hintButton.addEventListener("click", () => {
          const typed = dock.querySelector("input")?.value || "";
          state.assisted = true;
          state.hintStep += 1;
          paint();
          const field = dock.querySelector("input");
          if (field) {
            field.value = typed;
            field.focus();
            field.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        });
        row.append(hintButton);
      }
    }
    row.append(giveUpButton());
    return row;
  }

  function giveUpButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "give-up";
    button.textContent = "I don't know";
    button.addEventListener("click", () => settle("__give_up__", null, ""));
    return button;
  }

  function sessionSummary() {
    const box = document.createElement("div");
    box.className = "summary";
    const accuracy = document.createElement("p");
    accuracy.textContent = `${state.session.correct} of ${state.session.answered} answers were correct.`;
    box.append(accuracy);
    const weak = regionWeights(data, state.misses).slice(0, 3);
    if (weak.length) {
      const line = document.createElement("p");
      line.textContent = `Most to review: ${weak.map((item) => item.name).join(", ")}.`;
      box.append(line);
    }
    return box;
  }

  function commitCities(ids) {
    state.cityIds = ids;
    saveCitySet(ids);
    const active = new Set(view().cities.map((city) => city.id));
    for (const input of dialog.querySelectorAll("[data-city]")) {
      input.checked = active.has(input.dataset.city);
    }
    for (const input of dialog.querySelectorAll("[data-region]")) {
      const inRegion = data.cities.filter((city) => city.region === input.dataset.region);
      const on = inRegion.filter((city) => active.has(city.id)).length;
      input.checked = inRegion.length > 0 && on === inRegion.length;
      input.indeterminate = on > 0 && on < inRegion.length;
    }
    setCityCount();
    const current = state.question?.place;
    if (current?.kind === "city" && !active.has(current.id)) ask();
    else paint();
  }

  function openSettings() {
    dialog.replaceChildren();
    const head = document.createElement("div");
    head.className = "settings-head";
    const title = document.createElement("h2");
    title.textContent = "Quiz settings";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "settings-close";
    close.textContent = "Done";
    close.addEventListener("click", () => dialog.close());
    head.append(title, close);

    const outlineTitle = document.createElement("h3");
    outlineTitle.textContent = "Outlines";
    const outlineNote = document.createElement("p");
    outlineNote.className = "hint";
    outlineNote.textContent = "Turn province borders off to learn each region as one shape. Turn them back on whenever you want the lines inside.";

    dialog.append(
      head,
      outlineTitle,
      outlineNote,
      outlineToggle("Province borders", "provinces"),
      outlineToggle("City borders", "cities"),
      locateToggle(),
      citySection()
    );
    if (!dialog.open) dialog.showModal();
  }

  function locateToggle() {
    const row = document.createElement("label");
    row.className = "check-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.locate !== false;
    input.addEventListener("change", () => {
      state.locate = input.checked;
      saveLocate(state.locate);
      paint();
    });
    row.append(input, document.createTextNode("Frame the area in Type it"));
    return row;
  }

  function outlineToggle(label, key) {
    const row = document.createElement("label");
    row.className = "check-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.outlines[key] !== false;
    input.addEventListener("change", () => {
      state.outlines = { ...state.outlines, [key]: input.checked };
      saveOutlines(state.outlines);
      paint();
    });
    row.append(input, document.createTextNode(label));
    return row;
  }

  function citySection() {
    const wrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = "Cities in this quiz";
    const actions = document.createElement("div");
    actions.className = "settings-actions";
    for (const [label, ids] of [
      ["All", null],
      ["Major cities", majorCityIds(data.cities)],
      ["None", []],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => commitCities(ids));
      actions.append(button);
    }
    wrap.append(title, actions);
    const selected = new Set(view().cities.map((city) => city.id));
    for (const region of data.regions) {
      const cities = data.cities.filter((city) => city.region === region.id);
      if (!cities.length) continue;
      const block = document.createElement("div");
      block.className = "region-block";
      const on = cities.filter((city) => selected.has(city.id)).length;
      const regionRow = document.createElement("label");
      regionRow.className = "check-row";
      const regionInput = document.createElement("input");
      regionInput.type = "checkbox";
      regionInput.dataset.region = region.id;
      regionInput.checked = on === cities.length;
      regionInput.indeterminate = on > 0 && on < cities.length;
      regionInput.addEventListener("change", () => {
        const next = new Set(view().cities.map((city) => city.id));
        for (const city of cities) {
          if (regionInput.checked) next.add(city.id);
          else next.delete(city.id);
        }
        commitCities(next.size === data.cities.length ? null : [...next]);
      });
      regionRow.append(regionInput, document.createTextNode(region.name));
      const cityRows = document.createElement("div");
      cityRows.className = "region-cities";
      for (const city of cities) {
        const row = document.createElement("label");
        row.className = "check-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.city = city.id;
        input.checked = selected.has(city.id);
        input.addEventListener("change", () => {
          const next = new Set(view().cities.map((item) => item.id));
          if (input.checked) next.add(city.id);
          else next.delete(city.id);
          commitCities(next.size === data.cities.length ? null : [...next]);
        });
        row.append(input, document.createTextNode(city.label || city.name));
        cityRows.append(row);
      }
      block.append(regionRow, cityRows);
      wrap.append(block);
    }
    return wrap;
  }
}

function mountSuggestions(input, catalog, exclude, onChoose) {
  const list = document.createElement("div");
  list.className = "suggest-list";
  list.hidden = true;
  list.id = "suggest-list";
  list.setAttribute("role", "listbox");
  const wrap = document.createElement("div");
  wrap.className = "suggest";
  wrap.append(input, list);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);

  let items = [];
  let active = 0;

  function close() {
    list.hidden = true;
    list.replaceChildren();
    items = [];
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function mark() {
    const options = [...list.children];
    options.forEach((option, index) => {
      const on = index === active;
      option.classList.toggle("is-active", on);
      option.setAttribute("aria-selected", on ? "true" : "false");
    });
    const current = options[active];
    if (current) {
      input.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView({ block: "nearest" });
    }
  }

  function open() {
    items = suggestPlaces(catalog, input.value, { exclude });
    list.replaceChildren();
    if (!items.length) {
      close();
      return;
    }
    active = Math.min(active, items.length - 1);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    items.forEach((place, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "suggest-option";
      option.id = `suggest-${place.id}`;
      option.setAttribute("role", "option");
      option.textContent = place.label || place.name;
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => onChoose(place));
      list.append(option);
    });
    mark();
  }

  input.addEventListener("input", () => {
    active = 0;
    open();
  });
  input.addEventListener("keydown", (event) => {
    if (list.hidden) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = (active + 1) % items.length;
      mark();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = (active - 1 + items.length) % items.length;
      mark();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && items[active]) {
      event.preventDefault();
      onChoose(items[active]);
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!wrap.isConnected || document.activeElement === input) return;
      close();
    }, 0);
  });

  return {
    wrap,
    selected() {
      return list.hidden ? null : items[active] || null;
    },
  };
}

function enterMark() {
  const mark = document.createElement("span");
  mark.className = "enter-hint";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "Enter";
  return mark;
}

function renderFeedback(correct, text) {
  const feedback = document.createElement("p");
  feedback.className = correct ? "feedback is-correct" : "feedback is-wrong";
  feedback.setAttribute("role", "status");
  const body = document.createElement("span");
  body.textContent = text;
  feedback.append(markIcon(correct), body);
  return feedback;
}

function markIcon(correct) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.classList.add("feedback-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("d", correct ? "M3.2 8.4 6.3 11.4 12.8 4.6" : "M4.2 4.2 11.8 11.8 M11.8 4.2 4.2 11.8");
  svg.append(path);
  return svg;
}

function copyIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  const back = document.createElementNS("http://www.w3.org/2000/svg", "path");
  back.setAttribute("stroke", "currentColor");
  back.setAttribute("stroke-width", "1.5");
  back.setAttribute("stroke-linecap", "round");
  back.setAttribute("stroke-linejoin", "round");
  back.setAttribute("d", "M2.75 10.25V3.5A1.25 1.25 0 0 1 4 2.25h5.75A1.25 1.25 0 0 1 11 3.5");
  const front = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  front.setAttribute("x", "4.75");
  front.setAttribute("y", "4.75");
  front.setAttribute("width", "9.25");
  front.setAttribute("height", "9.25");
  front.setAttribute("rx", "1.25");
  front.setAttribute("stroke", "currentColor");
  front.setAttribute("stroke-width", "1.5");
  svg.append(back, front);
  return svg;
}

function filterIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M1.25 2.4h13.5a.7.7 0 0 1 .54 1.15L10 8.7v4.15a.7.7 0 0 1-1.02.62l-2.3-1.15a.7.7 0 0 1-.38-.62V8.7L.71 3.55a.7.7 0 0 1 .54-1.15Z"
  );
  svg.append(path);
  return svg;
}

function renderPrompt(node, text, mark) {
  node.replaceChildren();
  const index = mark ? text.indexOf(mark) : -1;
  if (index < 0) {
    node.textContent = text;
    return;
  }
  const name = document.createElement("span");
  name.className = "prompt-target";
  name.textContent = mark;
  node.append(text.slice(0, index), name, text.slice(index + mark.length));
}

function hintFor(question, state) {
  if (question.mode === "daily" && state.daily) {
    const edition = `Daily #${question.dailyNumber} · ${formatEditionDate(state.daily.date)}`;
    if (state.answered) return edition;
    const left = DAILY_TRIES - (state.daily.guesses.length || 0);
    return `${edition} · ${left} ${left === 1 ? "try" : "tries"} left`;
  }
  if (state.answered) return "";
  if (question.empty) return "Choose which cities to practice.";
  if (question.review && question.mode !== "type") return "You've missed this before, so it will keep coming back.";
  if (question.mode === "city" && question.choices) return "The highlighted city stays gold until you answer.";
  if (question.mode === "city") return "Drag to move the map. Pinch or use + to reach a small city.";
  if (question.mode === "type") {
    const parts = [];
    if (state.hintStep > 0) parts.push(...hintSteps(question.place).slice(0, state.hintStep));
    if (question.review) parts.push("You've missed this before, so it will keep coming back.");
    parts.push("Close spellings count, and so do older names.");
    return parts.join(" ");
  }
  if (question.mode === "province") return "Drag to move the map. Pinch or use + to reach small islands.";
  if (question.mode === "which-region") return "The highlighted province stays gold until you answer.";
  return "Tap the matching shape. Drag if you need to move the map.";
}

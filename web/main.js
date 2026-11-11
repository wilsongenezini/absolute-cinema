/** Renderiza somente texto: títulos e informações vêm de fontes externas. */

const sessionsButton = document.getElementById("fetch-btn");
const historyButton = document.getElementById("history-btn");
const historyNote = document.getElementById("history-note");
const buttons = [sessionsButton, historyButton];
const subtitle = document.getElementById("subtitle");
const results = document.getElementById("results");

function setStatus(message, isError = false) {
  const status = document.createElement("p");
  status.className = isError ? "status error" : "status";
  status.textContent = message;
  results.replaceChildren(status);
}

function labeled(text) {
  const label = document.createElement("span");
  label.className = "badge";
  label.textContent = text;
  return label;
}

const HISTORY_TIME_ZONE = "America/Campo_Grande";

/**
 * Hora local de um fuso como "AAAA-MM-DDTHH:mm:ss". As sessões trazem a hora
 * local do cinema, então a comparação é feita pelo relógio de parede — o
 * offset anexado pelas fontes não é confiável.
 */
function wallClockNow(timeZone) {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      dateStyle: "short",
      timeStyle: "medium",
    })
      .format(new Date())
      .replace(" ", "T");
  } catch {
    return "";
  }
}

function movieCard(movie, timeZone) {
  const card = document.createElement("article");
  card.className = "movie-card";

  const heading = document.createElement("h2");
  heading.append(labeled("Legendado"), document.createTextNode(" "));
  heading.append(document.createTextNode(movie.title));
  if (movie.originalTitle && movie.originalTitle !== movie.title) {
    const original = document.createElement("span");
    original.className = "original";
    original.textContent = `(${movie.originalTitle})`;
    heading.append(original);
  }
  card.append(heading);

  if (movie.contentRating) {
    const rating = document.createElement("span");
    rating.className = "info";
    rating.textContent = `Classificação: ${movie.contentRating}`;
    card.append(rating);
  }

  const list = document.createElement("ul");
  const now = wallClockNow(timeZone);
  for (const session of movie.sessions) {
    const item = document.createElement("li");
    item.className = "session";

    const time = document.createElement("strong");
    time.textContent = `${session.dayAndMonth} (${session.dayOfWeek}) às ${session.time}`;

    const room = document.createElement("span");
    room.className = "room";
    room.textContent = `— ${session.room}`;

    if (now && session.fullDate.slice(0, 19) <= now) item.classList.add("ended");

    item.append(time, room);
    list.append(item);
  }
  card.append(list);
  return card;
}

function renderSessions(groups) {
  if (!Array.isArray(groups)) throw new Error("Resposta de formato inesperado.");

  const totalSessions = groups.reduce(
    (sum, group) =>
      sum + group.movies.reduce((count, movie) => count + movie.sessions.length, 0),
    0,
  );
  const totalMovies = groups.reduce((sum, group) => sum + group.movies.length, 0);

  if (totalSessions === 0) {
    subtitle.textContent = "Sessões legendadas dos cinemas monitorados";
    setStatus("Nenhuma sessão legendada encontrada nestes cinemas. 🍿");
    return;
  }

  subtitle.textContent = `${totalSessions} sessões legendadas em ${totalMovies} filme${totalMovies === 1 ? "" : "s"}`;

  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const theaterHeading = document.createElement("h2");
    theaterHeading.className = "theater";
    theaterHeading.textContent = group.theater.name;
    fragment.append(theaterHeading);

    if (group.error) {
      const warning = document.createElement("p");
      warning.className = "status error";
      warning.textContent = `Não foi possível consultar: ${group.error}`;
      fragment.append(warning);
      continue;
    }

    if (group.movies.length === 0) {
      const empty = document.createElement("p");
      empty.className = "status";
      empty.textContent = "Nenhuma sessão legendada neste cinema.";
      fragment.append(empty);
      continue;
    }

    for (const movie of group.movies) {
      fragment.append(movieCard(movie, group.theater.timeZone));
    }
  }
  results.replaceChildren(fragment);
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;

  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function historyPeriodNodes(period) {
  const monthHeading = document.createElement("h3");
  monthHeading.className = "history-month";
  monthHeading.textContent = monthLabel(period.month);

  return [
    monthHeading,
    ...period.movies.map((movie) => movieCard(movie, HISTORY_TIME_ZONE)),
  ];
}

/** Botão que carrega, sob demanda, o próximo mês mais antigo do histórico. */
function olderMonthButton(pendingMonths) {
  const [month, ...rest] = pendingMonths;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cinema-btn secondary load-more";
  const label = `Ver ${monthLabel(month)}`;
  button.textContent = label;

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Carregando…";
    button.nextElementSibling?.remove();

    try {
      const page = await requestJson(`/api/history?month=${month}`);
      const nodes = (page.periods ?? []).flatMap(historyPeriodNodes);
      if (rest.length > 0) nodes.push(olderMonthButton(rest));
      button.replaceWith(...nodes);
    } catch (error) {
      button.disabled = false;
      button.textContent = label;
      const warning = document.createElement("p");
      warning.className = "status error";
      warning.textContent =
        error instanceof Error ? error.message : "Erro inesperado.";
      button.after(warning);
    }
  });

  return button;
}

function renderHistory(page) {
  if (!Array.isArray(page?.months) || !Array.isArray(page?.periods)) {
    throw new Error("Resposta de formato inesperado.");
  }

  subtitle.textContent = "Retrospecto do Cinépolis Shopping Três Lagoas";
  if (page.periods.length === 0) {
    setStatus("Ainda não há sessões legendadas registradas. 🍿");
    return;
  }

  const fragment = document.createDocumentFragment();
  const theaterHeading = document.createElement("h2");
  theaterHeading.className = "theater";
  theaterHeading.textContent = "Cinépolis Shopping Três Lagoas";
  fragment.append(theaterHeading);

  for (const period of page.periods) fragment.append(...historyPeriodNodes(period));

  const loaded = new Set(page.periods.map((period) => period.month));
  const pending = page.months.filter((month) => !loaded.has(month));
  if (pending.length > 0) fragment.append(olderMonthButton(pending));

  results.replaceChildren(fragment);
}

async function requestJson(path) {
  const response = await fetch(path);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `A API respondeu ${response.status}.`);
  }
  return data;
}

async function load(path, button, loadingText, statusText, render) {
  const originalLabels = buttons.map((item) => item.textContent.trim());
  buttons.forEach((item) => (item.disabled = true));
  button.textContent = loadingText;
  setStatus(statusText);

  try {
    render(await requestJson(path));
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Erro inesperado.",
      true,
    );
  } finally {
    buttons.forEach((item, index) => {
      item.disabled = false;
      item.textContent = originalLabels[index];
    });
  }
}

sessionsButton.addEventListener("click", () => {
  historyNote.hidden = true;
  load(
    "/api/sessions",
    sessionsButton,
    "Carregando…",
    "Buscando as sessões legendadas dos cinemas monitorados…",
    renderSessions,
  );
});

historyButton.addEventListener("click", () => {
  historyNote.hidden = false;
  load(
    "/api/history",
    historyButton,
    "Carregando…",
    "Consultando o histórico de Três Lagoas…",
    renderHistory,
  );
});

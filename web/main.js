/** Renderiza somente texto (nunca innerHTML): os títulos e dados vêm de uma
 * API externa, então nada dela pode virar código executado no navegador. */

const btn = document.getElementById("fetch-btn");
const subtitle = document.getElementById("subtitle");
const results = document.getElementById("results");

function setStatus(message, isError = false) {
  const status = document.createElement("p");
  status.className = isError ? "status error" : "status";
  status.textContent = message;
  results.replaceChildren(status);
}

function movieCard(movie) {
  const card = document.createElement("article");
  card.className = "movie-card";

  const heading = document.createElement("h2");
  heading.textContent = movie.title;
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
  const now = new Date();
  for (const session of movie.sessions) {
    const item = document.createElement("li");
    item.className = "session";

    const time = document.createElement("strong");
    time.textContent = `${session.dayAndMonth} (${session.dayOfWeek}) às ${session.time}`;

    const room = document.createElement("span");
    room.className = "room";
    room.textContent = `— ${session.room}${session.price ? ` — R$ ${session.price.toFixed(2).replace(".", ",")}` : ""}`;

    if (new Date(session.fullDate) <= now) item.classList.add("ended");

    item.append(time, room);
    if (session.siteURL) {
      const link = document.createElement("a");
      link.textContent = "comprar";
      link.href = session.siteURL;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
    }

    list.append(item);
  }
  card.append(list);
  return card;
}

function labeled(text) {
  const label = document.createElement("span");
  label.className = "badge";
  label.textContent = text;
  return label;
}

async function fetchSubtitledMovies() {
  btn.disabled = true;
  btn.textContent = "Carregando…";
  setStatus("Buscando as sessões legendadas…");

  try {
    const response = await fetch("/api/sessions");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `A API respondeu ${response.status}.`);
    }
    if (!Array.isArray(data)) {
      throw new Error("Resposta de formato inesperado.");
    }

    const totalSessions = data.reduce(
      (sum, group) =>
        sum +
        group.movies.reduce((s, movie) => s + movie.sessions.length, 0),
      0,
    );
    const totalMovies = data.reduce(
      (sum, group) => sum + group.movies.length,
      0,
    );

    if (totalSessions === 0) {
      setStatus("Nenhuma sessão legendada hoje nestes cinemas. 🍿");
      return;
    }

    subtitle.textContent = `${totalSessions} sessões legendadas em ${totalMovies} filme${totalMovies === 1 ? "" : "s"}`;

    const fragment = document.createDocumentFragment();
    for (const group of data) {
      const theaterHeading = document.createElement("h2");
      theaterHeading.className = "theater";
      theaterHeading.textContent = group.theater.name;
      fragment.append(theaterHeading);

      if (group.error) {
        const warn = document.createElement("p");
        warn.className = "status error";
        warn.textContent = `Não foi possível consultar: ${group.error}`;
        fragment.append(warn);
        continue;
      }

      if (group.movies.length === 0) {
        const empty = document.createElement("p");
        empty.className = "status";
        empty.textContent = "Nenhuma sessão legendada neste cinema.";
        fragment.append(empty);
        continue;
      }

      const label = labeled("Legendado");
      for (const movie of group.movies) {
        const card = movieCard(movie);
        card.querySelector("h2").prepend(label.cloneNode(true), " ");
        fragment.append(card);
      }
    }
    results.replaceChildren(fragment);
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Erro inesperado.",
      true,
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Ver filmes legendados";
  }
}

btn.addEventListener("click", fetchSubtitledMovies);

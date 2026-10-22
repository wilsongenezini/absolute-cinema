/** Renderiza somente texto (nunca innerHTML): os títulos e dados vêm de uma
 * API externa, então nada dela pode virar código executado no navegador. */

const btn = document.getElementById("fetch-btn");
const jsonBtn = document.getElementById("json-btn");
const subtitle = document.getElementById("subtitle");
const results = document.getElementById("results");

function setStatus(message, isError = false) {
  results.replaceChildren();
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

    const ended = new Date(session.fullDate) <= now;
    if (ended) item.classList.add("ended");

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

    if (data.length === 0) {
      setStatus("Nenhuma sessão legendada hoje neste cinema. 🍿");
      return;
    }

    subtitle.textContent = `${data.reduce((s, m) => s + m.sessions.length, 0)} sessões legendadas em ${data.length} filme${data.length === 1 ? "" : "s"}`;

    const fragment = document.createDocumentFragment();
    const label = labeled("Legendado");
    for (const movie of data) {
      const card = movieCard(movie);
      card.querySelector("h2").prepend(label.cloneNode(true), " ");
      fragment.append(card);
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

async function showRawJsonInConsole() {
  try {
    const response = await fetch("/api/sessions");
    const data = await response.json();
    console.log("%cabsolute-cinema // sessões legendadas", "font-weight:bold");
    console.table(
      data.flatMap((movie) =>
        movie.sessions.map((session) => ({
          filme: movie.title,
          data: session.dayAndMonth,
          horario: session.time,
          sala: session.room,
        })),
      ),
    );
    setStatus("JSON no console (F12).");
  } catch (error) {
    setStatus("Não consegui montar o JSON no console.", true);
  }
}

btn.addEventListener("click", fetchSubtitledMovies);
jsonBtn.addEventListener("click", showRawJsonInConsole);

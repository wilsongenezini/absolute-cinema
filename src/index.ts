import {
  DEFAULT_CITY_ID,
  DEFAULT_THEATER_ID,
  extractSubtitledMovies,
  fetchSessions,
  isEnabled,
  isSubtitled,
} from "./ingresso.js";

const CITY_ID = process.env.INGRESSO_CITY_ID ?? DEFAULT_CITY_ID;
const THEATER_ID = process.env.INGRESSO_THEATER_ID ?? DEFAULT_THEATER_ID;
const args = process.argv.slice(2);
const wantsJson = args.includes("--json");
const wantsDebug = args.includes("--debug");

const response = await fetchSessions(CITY_ID, THEATER_ID);
const subtitled = extractSubtitledMovies(response);

const totalSubtitledSessions = subtitled.reduce(
  (sum, movie) => sum + movie.sessions.length,
  0,
);

if (wantsJson) {
  console.log(JSON.stringify(subtitled, null, 2));
  process.exit(0);
}

if (subtitled.length === 0) {
  console.log("Nenhuma sessão legendada encontrada hoje neste cinema. 🍿");
  if (wantsDebug) {
    debugCounts(response);
  }
  process.exit(0);
}

const plural = totalSubtitledSessions === 1;
console.log(
  `🎬 ${totalSubtitledSessions} ${plural ? "sessão" : "sessões"} legendada${plural ? "" : "s"} em ${subtitled.length} filme${subtitled.length === 1 ? "" : "s"}\n`,
);

for (const movie of subtitled) {
  console.log(`🍿 ${movie.title} (${movie.originalTitle})`);
  for (const session of movie.sessions) {
    const price = session.price
      ? ` — R$ ${session.price.toFixed(2).replace(".", ",")}`
      : "";
    console.log(
      `   🗓️  ${session.dayAndMonth} (${session.dayOfWeek}) às ${session.time} — ${session.room}${price}`,
    );
  }
  console.log('\n');
}

if (wantsDebug) {
  debugCounts(response);
}

function debugCounts(response: Awaited<ReturnType<typeof fetchSessions>>): void {
  let totalMovies = 0;
  let totalSessions = 0;
  let legendadas = 0;

  for (const day of response) {
    totalMovies += day.movies.length;
    for (const movie of day.movies) {
      for (const group of movie.sessionTypes) {
        for (const session of group.sessions) {
          totalSessions += 1;
          if (isSubtitled(session) && isEnabled(session)) legendadas += 1;
        }
      }
    }
  }

  console.log(
    `[debug] filmes no período: ${totalMovies} | sessões: ${totalSessions} | legendadas/exibíveis: ${legendadas}`,
  );
}

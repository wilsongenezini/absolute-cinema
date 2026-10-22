import {
  THEATERS,
  fetchAllTheaters,
  fetchSessions,
  isEnabled,
  isSubtitled,
  type TheaterConfig,
} from "./ingresso.js";

const args = process.argv.slice(2);
const wantsJson = args.includes("--json");
const wantsDebug = args.includes("--debug");

/** Env vars permitem focar em um cinema específico, como antes */
const theaters: TheaterConfig[] =
  process.env.INGRESSO_CITY_ID && process.env.INGRESSO_THEATER_ID
    ? [
        {
          cityId: process.env.INGRESSO_CITY_ID,
          theaterId: process.env.INGRESSO_THEATER_ID,
          name: "Cinema personalizado (env)",
        },
      ]
    : THEATERS;

const groups = await fetchAllTheaters(theaters);

const allMovies = groups.flatMap((group) => group.movies);
const totalSubtitledSessions = allMovies.reduce(
  (sum, movie) => sum + movie.sessions.length,
  0,
);

if (wantsJson) {
  console.log(JSON.stringify(groups, null, 2));
  process.exit(0);
}

if (allMovies.length === 0) {
  console.log("Nenhuma sessão legendada encontrada nos cinemas monitorados. 🍿");
  process.exit(0);
}

const plural = totalSubtitledSessions === 1;
console.log(
  `🎬 ${totalSubtitledSessions} ${plural ? "sessão" : "sessões"} legendada${plural ? "" : "s"} em ${allMovies.length} filme${allMovies.length === 1 ? "" : "s"}\n`,
);

for (const group of groups) {
  console.log(`🎥 ${group.theater.name}`);
  if (group.movies.length === 0) {
    console.log("   Nenhuma sessão legendada hoje neste cinema.\n");
    continue;
  }
  for (const movie of group.movies) {
    console.log(`   🍿 ${movie.title} (${movie.originalTitle})`);
    for (const session of movie.sessions) {
      const price = session.price
        ? ` — R$ ${session.price.toFixed(2).replace(".", ",")}`
        : "";
      console.log(
        `      🗓️  ${session.dayAndMonth} (${session.dayOfWeek}) às ${session.time} — ${session.room}${price}`,
      );
    }
    console.log("");
  }
}

if (wantsDebug) {
  for (let i = 0; i < theaters.length; i++) {
    const theater = theaters[i]!;
    const raw = await fetchSessions(theater.cityId, theater.theaterId);
    let totalMovies = 0;
    let totalSessions = 0;
    let legendadas = 0;

    for (const day of raw) {
      totalMovies += day.movies.length;
      for (const movie of day.movies) {
        for (const groupType of movie.sessionTypes) {
          for (const session of groupType.sessions) {
            totalSessions += 1;
            if (isSubtitled(session) && isEnabled(session)) legendadas += 1;
          }
        }
      }
    }

    console.log(
      `[debug] ${theater.name}: filmes no período: ${totalMovies} | sessões: ${totalSessions} | legendadas/exibíveis: ${legendadas}`,
    );
  }
}

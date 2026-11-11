import {
  THEATERS,
  fetchAllTheaters,
  isListed,
  type TheaterConfig,
} from "./ingresso.js";

const args = process.argv.slice(2);
const wantsJson = args.includes("--json");
const wantsDebug = args.includes("--debug");

/** Env vars permitem focar em um cinema da API do ingresso, como antes */
const theaters: TheaterConfig[] =
  process.env.INGRESSO_CITY_ID && process.env.INGRESSO_THEATER_ID
    ? [
        {
          id: "personalizado",
          name: "Cinema personalizado (env)",
          timeZone: "America/Sao_Paulo",
          source: {
            kind: "ingresso",
            cityId: process.env.INGRESSO_CITY_ID,
            theaterId: process.env.INGRESSO_THEATER_ID,
          },
        },
      ]
    : THEATERS;

/** Totais da resposta bruta, coletados na mesma requisição da listagem */
const debugLines: string[] = [];

const groups = await fetchAllTheaters(
  theaters,
  wantsDebug
    ? (theater, raw) => {
        const sessions = raw.flatMap((day) =>
          day.movies.flatMap((movie) =>
            movie.sessionTypes.flatMap((group) => group.sessions),
          ),
        );
        const totalMovies = raw.reduce((sum, day) => sum + day.movies.length, 0);
        debugLines.push(
          `[debug] ${theater.name}: filmes no período: ${totalMovies} | sessões: ${sessions.length} | legendadas/exibíveis: ${sessions.filter(isListed).length}`,
        );
      }
    : undefined,
);

const allMovies = groups.flatMap((group) => group.movies);
const totalSubtitledSessions = allMovies.reduce(
  (sum, movie) => sum + movie.sessions.length,
  0,
);

if (wantsJson) {
  console.log(JSON.stringify(groups, null, 2));
  process.exit(0);
}

if (totalSubtitledSessions === 0) {
  console.log("Nenhuma sessão legendada encontrada nos cinemas monitorados. 🍿");
  for (const group of groups) {
    if (group.error) console.log(`⚠️  ${group.theater.name}: ${group.error}`);
  }
  for (const line of debugLines) console.log(line);
  process.exit(0);
}

const plural = totalSubtitledSessions === 1;
console.log(
  `🎬 ${totalSubtitledSessions} ${plural ? "sessão" : "sessões"} legendada${plural ? "" : "s"} em ${allMovies.length} filme${allMovies.length === 1 ? "" : "s"}\n`,
);

for (const group of groups) {
  console.log(`🎥 ${group.theater.name}`);
  if (group.error) {
    console.log(`   ⚠️  Não foi possível consultar: ${group.error}\n`);
    continue;
  }
  if (group.movies.length === 0) {
    console.log("   Nenhuma sessão legendada neste cinema.\n");
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

for (const line of debugLines) console.log(line);

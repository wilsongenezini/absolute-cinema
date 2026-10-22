/**
 * Parser da programação do site do Cine Araújo (Grupo Cine), que não
 * expõe API: a informação vem no HTML de /{cidade}/programacao.
 *
 * Estrutura esperada (Wordpress/Bootstrap renderizado pelo site):
 *   <div class="filme-box">
 *     <h2 class="text-grey titulo-filme">Título</h2>
 *     <span class="classificacao-box classificacao-18">18</span>
 *     <div class="horarios-box">
 *       <div class="info-sessao">Sala 1 · Dublado · 2D</div>
 *       <a class="btn btn-horario" href="...">
 *         <span class="fw-bold">16:50</span>
 *         <span class="visually-hidden">...para Cara-De-Barro,
 *           em 22/10/2026, sala 1, Dublado, 2D</span>
 *       </a>
 */

import type { SubtitledMovie, SubtitledMovieSession } from "./types.js";

const SITE_BASE = "https://www.grupocine.com.br";

export async function fetchGrupocineHtml(programacaoUrl: string): Promise<string> {
  const response = await fetch(programacaoUrl, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      accept: "text/html",
      // o site é renderizado por template server-side; botão padrão basta
      "user-agent":
        "absolute-cinema/1.0 (+https://github.com/wilsongenezini/absolute-cinema)",
    },
  });
  if (!response.ok) {
    throw new Error(
      `O site do Grupo Cine respondeu ${response.status} (${response.statusText})`,
    );
  }
  return await response.text();
}

/** Extrai, do HTML bruto, somente os filmes com sessão legendada */
export function extractSubtitledMoviesGrupocine(
  html: string,
): SubtitledMovie[] {
  const movieBlocks = matchAll(html, /<div class="filme-box">[\S\s]*?(?=<div class="filme-box">|$)/g);
  const movies: SubtitledMovie[] = [];

  for (const [block = ""] of movieBlocks) {
    if (!block) continue;
    const title = firstCapture(block, /titulo-filme">\s*([\S\s]*?)<\/h2>/);
    if (!title) continue;

    const sessions: SubtitledMovieSession[] = [];

    for (const [button, buyUrl = "", content = ""] of matchAll(
      block,
      /<a href="([^"]+)"[^>]*class="btn btn-horario">([\S\s]*?)<\/a>/g,
    )) {
      void button;

      const time = firstCapture(content, /class="fw-bold">\s*(\d{1,2}:\d{2})/);
      const hidden = normalizeSpaces(
        firstCapture(content, /class="visually-hidden">([\S\s]*?)<\/span>/) ?? "",
      );

      const dateMatch = hidden.match(
        /,\s*em\s+(\d{2})\/(\d{2})\/(\d{4}),\s*(.*)$/,
      );
      if (!time || !dateMatch) continue;

      const [, day, month, year, rest = ""] = dateMatch;
      if (!day || !month || !year) continue;

      if (!/legendado/i.test(rest)) continue;

      const room = firstCapture(rest, /sala\s+([^,]+)/i) ?? "Não informada";
      const isoDate = `${year}-${month}-${day}T${time}:00-03:00`;
      sessions.push({
        id: buyUrl || `${title}-${isoDate}`,
        dayAndMonth: `${day}/${month}`,
        dayOfWeek: weekdayOf(isoDate),
        time,
        fullDate: isoDate,
        room: formatRoom(room),
        price: 0,
        siteURL: buyUrl || null,
      });
    }

    if (sessions.length === 0) continue;

    const infoUrl =
      firstCapture(
        block,
        /<a href="(https?:\/\/(?:www\.)?grupocine\.com\.br\/filme\/[^"]+)"/,
      ) ?? "";
    const contentRating =
      firstCapture(block, /classificacao-box[^>]*>\s*([^<]*?)\s*</) ?? "";

    const existing = movies.find((movie) => movie.title === title);
    if (existing) {
      existing.sessions.push(...sessions);
    } else {
      movies.push({
        id: infoUrl || title,
        title,
        originalTitle: title,
        contentRating,
        siteURL: infoUrl || SITE_BASE,
        sessions,
      });
    }
  }

  return movies
    .map((movie) => ({
      ...movie,
      sessions: [...movie.sessions].sort((a, b) => a.fullDate.localeCompare(b.fullDate)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

function matchAll(source: string, regex: RegExp): RegExpExecArray[] {
  return [...source.matchAll(regex)] as RegExpExecArray[];
}

/** Remove tags HTML e colapsa espaços que o template e o \t misturam */
function normalizeSpaces(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mantém só o que completa o texto do film block evitando tags */
function firstCapture(source: string, regex: RegExp): string | undefined {
  return normalizeSpaces(regex.exec(source)?.[1] ?? "");
}

/** Ex.: "1" → "Sala 1" */
function formatRoom(room: string): string {
  if (/^sala\s*\d+$/i.test(room)) return `Sala ${room.replace(/^sala\s*/i, "")}`;
  if (/^\d+$/.test(room)) return `Sala ${room}`;
  return room;
}

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  timeZone: "America/Sao_Paulo",
});

function weekdayOf(isoDate: string): string {
  const date = new Date(isoDate);
  return isNaN(date.valueOf()) ? "" : WEEKDAY.format(date);
}

/**
 * Barrel de queries del módulo Torneos (M1).
 * Consumido por los route handlers de `app/api/torneos/**`.
 */
export {
  archiveTournament,
  createTournament,
  getTournamentById,
  getTournamentDetail,
  listTournaments,
} from "./tournaments";

export { importTournament } from "./import";

import express from 'express';
import cors from 'cors';

import matchesRouter from './routes/matches.js';
import divisionsRouter, { updateDivision, deleteDivision } from './routes/divisions.js';
import stagesRouter, { updateStage, deleteStage } from './routes/stages.js';
import squadsRouter, {
  updateSquad,
  deleteSquad,
  getSquadQueue,
  autoAssign,
  batchMoveShooters,
  removeShooterFromSquad,
  addShooterToSquad,
} from './routes/squads.js';
import shootersRouter, {
  updateShooter,
  changeShooterSquad,
  deleteShooter,
} from './routes/shooters.js';
import scoresRouter, {
  getShooterScores,
  confirmScore,
  deleteScore,
} from './routes/scores.js';
import leaderboardRouter from './routes/leaderboard.js';

const app = express();
const PORT = process.env['PORT'] ? Number(process.env['PORT']) : 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
const api = express.Router();

// Matches
api.use('/matches', matchesRouter);

// Divisions (nested + top-level)
api.use('/matches/:matchId/divisions', divisionsRouter);
api.put('/divisions/:id', updateDivision);
api.delete('/divisions/:id', deleteDivision);

// Stages (nested + top-level)
api.use('/matches/:matchId/stages', stagesRouter);
api.put('/stages/:id', updateStage);
api.delete('/stages/:id', deleteStage);

// Squads (nested + top-level)
api.get('/matches/:matchId/squads/queue', getSquadQueue);
api.post('/matches/:matchId/squads/auto-assign', autoAssign);
api.use('/matches/:matchId/squads', squadsRouter);
api.put('/squads/:id', updateSquad);
api.delete('/squads/:id', deleteSquad);
api.put('/squads/:squadId/shooters/batch-move', batchMoveShooters);
api.delete('/squads/:squadId/shooters/:shooterId', removeShooterFromSquad);
api.post('/squads/:squadId/shooters', addShooterToSquad);

// Shooters (nested + top-level)
api.use('/matches/:matchId/shooters', shootersRouter);
api.put('/shooters/:id', updateShooter);
api.put('/shooters/:id/squad', changeShooterSquad);
api.delete('/shooters/:id', deleteShooter);

// Scores
api.use('/matches/:matchId/scores', scoresRouter);
api.get('/shooters/:shooterId/scores', getShooterScores);
api.put('/scores/:id/confirm', confirmScore);
api.delete('/scores/:id', deleteScore);

// Leaderboard
api.use('/matches/:matchId/leaderboard', leaderboardRouter);

app.use('/api/v1', api);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, error: String(err) });
});

app.listen(PORT, () => {
  console.log(`IPSC Backend running on http://localhost:${PORT}`);
});

export default app;

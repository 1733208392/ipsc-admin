import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from './auth.js';

import matchesRouter from './routes/matches.js';
import authRouter from './routes/auth.js';
import divisionsRouter, { updateDivision, deleteDivision } from './routes/divisions.js';
import subDivisionsRouter, { updateSubDivision, deleteSubDivision } from './routes/sub-divisions.js';
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
} from './routes/scores.js';
import leaderboardRouter from './routes/leaderboard.js';
import stageAttachmentsRouter from './routes/stage-attachments.js';
import drillReplaysRouter, { getDrillReplay, deleteDrillReplay } from './routes/drill-replays.js';
import drillsRouter from './routes/drills.js';
import myDrillsRouter from './routes/my-drills.js';
import myDrillRecordsRouter from './routes/my-drill-records.js';
import adminRouter from './routes/admin.js';
import { getUploadsDir } from './services/stage-files.js';
import otaRouter from './routes/ota.js';
import adminOtaRouter from './routes/admin-ota.js';
import { getOtaFilesDir } from './services/ota.js';

const app = express();
const PORT = process.env['PORT'] ? Number(process.env['PORT']) : 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '..', getUploadsDir());
const otaFilesDir = getOtaFilesDir();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/ota/files', (req, res, next) => {
  if (!req.path.toLowerCase().endsWith('.zip')) {
    res.status(403).json({ success: false, error: 'Only .zip files are accessible' });
    return;
  }
  next();
}, express.static(otaFilesDir, {
  index: false,
  setHeaders: (res, filePath) => {
    const fileName = path.basename(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// ── Routes ───────────────────────────────────────────────────────────────────
const api = express.Router();

// Auth
api.use('/auth', authRouter);

// Public OTA API for target devices
api.use('/ota', otaRouter);

// All routes below require authentication.
api.use(authMiddleware);

const requireSuperAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== 'super_admin') {
    res.status(403).json({ success: false, error: 'Forbidden: superadmin role required' });
    return;
  }
  next();
};

// Matches
api.use('/matches', matchesRouter);

// Divisions (nested + top-level)
api.use('/matches/:matchId/divisions', divisionsRouter);
api.put('/divisions/:id', updateDivision);
api.delete('/divisions/:id', deleteDivision);

// Categories (legacy alias: sub-divisions)
api.use('/matches/:matchId/categories', subDivisionsRouter);
api.put('/categories/:id', updateSubDivision);
api.delete('/categories/:id', deleteSubDivision);

// Legacy Sub Divisions routes (kept for backward compatibility)
api.use('/matches/:matchId/sub-divisions', subDivisionsRouter);
api.put('/sub-divisions/:id', updateSubDivision);
api.delete('/sub-divisions/:id', deleteSubDivision);

// Stages (nested + top-level)
api.use('/matches/:matchId/stages', stagesRouter);
api.use('/stages/:id/attachments', stageAttachmentsRouter);
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

// Leaderboard
api.use('/matches/:matchId/leaderboard', leaderboardRouter);
// Drill Replays (raw shot data uploaded from iOS)
api.use('/matches/:matchId/drill-replays', drillReplaysRouter);
api.get('/drill-replays/:id', getDrillReplay);
api.delete('/drill-replays/:id', deleteDrillReplay);

// Drill Templates
api.use(drillsRouter);
api.use('/my', myDrillsRouter);
api.use('/my', myDrillRecordsRouter);

// Admin (superadmin role required)
api.use('/admin/ota', adminOtaRouter);
api.use('/admin', requireSuperAdmin, adminRouter);


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

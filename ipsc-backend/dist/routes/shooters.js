import { Router } from 'express';
import db from '../db.js';
import { CreateShooterSchema, UpdateShooterSchema, ChangeSquadSchema, ok, fail, } from '../types.js';
const router = Router({ mergeParams: true });
// POST /matches/:matchId/shooters
router.post('/', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const parsed = CreateShooterSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    const match = db.prepare(`SELECT id, club_id FROM matches WHERE id = ?`).get(matchId);
    if (!match) {
        res.status(404).json(fail('Match not found'));
        return;
    }
    try {
        const { division_id, squad_id, shooter_uid, name, bib_number, category_code, age, gender, region, club } = parsed.data;
        let resolvedName = name;
        let resolvedAge = age;
        let resolvedGender = gender;
        let resolvedRegion = region;
        let resolvedClub = club;
        if (shooter_uid) {
            const globalShooter = db
                .prepare(`SELECT * FROM shooters_global WHERE uid = ?`)
                .get(shooter_uid);
            if (!globalShooter) {
                res.status(404).json(fail('Global shooter not found'));
                return;
            }
            const defaultClub = globalShooter.default_club_id
                ? db
                    .prepare(`SELECT short_name FROM clubs WHERE id = ?`)
                    .get(globalShooter.default_club_id)
                : undefined;
            resolvedName = resolvedName ?? globalShooter.name;
            resolvedAge = resolvedAge ?? (globalShooter.age ?? undefined);
            resolvedGender = resolvedGender ?? globalShooter.gender;
            resolvedRegion = resolvedRegion ?? (globalShooter.region ?? undefined);
            resolvedClub = resolvedClub ?? defaultClub?.short_name;
        }
        if (!resolvedName) {
            res.status(400).json(fail('Name is required when shooter_uid is not provided'));
            return;
        }
        const result = db
            .prepare(`INSERT INTO shooters (match_id, division_id, squad_id, shooter_uid, name, bib_number, category_code, age, gender, region, club, club_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(matchId, division_id, squad_id ?? null, shooter_uid ?? null, resolvedName, bib_number, category_code ?? null, resolvedAge ?? null, resolvedGender ?? null, resolvedRegion ?? null, resolvedClub ?? null, match.club_id);
        const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(result.lastInsertRowid);
        res.status(201).json(ok(shooter));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// GET /matches/:matchId/shooters?squad_id=
router.get('/', (req, res) => {
    const matchId = Number(req.params['matchId']);
    const squadId = req.query['squad_id'] ? Number(req.query['squad_id']) : null;
    try {
        let shooters;
        if (squadId !== null) {
            shooters = db
                .prepare(`SELECT sh.*, d.name AS division_name, sq.name AS squad_name
           FROM shooters sh
           JOIN divisions d ON sh.division_id = d.id
            LEFT JOIN squads sq ON sh.squad_id = sq.id
           WHERE sh.match_id = ? AND sh.squad_id = ?
           ORDER BY sh.bib_number`)
                .all(matchId, squadId);
        }
        else {
            shooters = db
                .prepare(`SELECT sh.*, d.name AS division_name, sq.name AS squad_name
           FROM shooters sh
           JOIN divisions d ON sh.division_id = d.id
            LEFT JOIN squads sq ON sh.squad_id = sq.id
           WHERE sh.match_id = ?
           ORDER BY sh.bib_number`)
                .all(matchId);
        }
        res.json(ok(shooters));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
});
// PUT /shooters/:id
export function updateShooter(req, res) {
    const id = Number(req.params['id']);
    const parsed = UpdateShooterSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
        if (!shooter) {
            res.status(404).json(fail('Shooter not found'));
            return;
        }
        const fields = [];
        const values = [];
        const { division_id, squad_id, shooter_uid, name, bib_number, category_code, age, gender, region, club } = parsed.data;
        if (division_id !== undefined) {
            fields.push('division_id = ?');
            values.push(division_id);
        }
        if (squad_id !== undefined) {
            fields.push('squad_id = ?');
            values.push(squad_id);
        }
        if (shooter_uid !== undefined) {
            fields.push('shooter_uid = ?');
            values.push(shooter_uid);
        }
        if (name !== undefined) {
            fields.push('name = ?');
            values.push(name);
        }
        if (bib_number !== undefined) {
            fields.push('bib_number = ?');
            values.push(bib_number);
        }
        if (category_code !== undefined) {
            fields.push('category_code = ?');
            values.push(category_code);
        }
        if (age !== undefined) {
            fields.push('age = ?');
            values.push(age);
        }
        if (gender !== undefined) {
            fields.push('gender = ?');
            values.push(gender);
        }
        if (region !== undefined) {
            fields.push('region = ?');
            values.push(region);
        }
        if (club !== undefined) {
            fields.push('club = ?');
            values.push(club);
        }
        if (fields.length === 0) {
            res.json(ok(shooter));
            return;
        }
        values.push(id);
        db.prepare(`UPDATE shooters SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
}
// PUT /shooters/:id/squad
export function changeShooterSquad(req, res) {
    const id = Number(req.params['id']);
    const parsed = ChangeSquadSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json(fail(parsed.error.message));
        return;
    }
    try {
        const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
        if (!shooter) {
            res.status(404).json(fail('Shooter not found'));
            return;
        }
        db.prepare(`UPDATE shooters SET squad_id = ? WHERE id = ?`).run(parsed.data.squad_id, id);
        const updated = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
        res.json(ok(updated));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
}
// DELETE /shooters/:id
export function deleteShooter(req, res) {
    const id = Number(req.params['id']);
    try {
        const shooter = db.prepare(`SELECT * FROM shooters WHERE id = ?`).get(id);
        if (!shooter) {
            res.status(404).json(fail('Shooter not found'));
            return;
        }
        db.prepare(`DELETE FROM shooters WHERE id = ?`).run(id);
        res.json(ok({ id }));
    }
    catch (err) {
        res.status(500).json(fail(String(err)));
    }
}
export default router;

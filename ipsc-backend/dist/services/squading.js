import db from '../db.js';
export function autoAssignSquads(options) {
    const { matchId, sort_by, group_size, strategy, clear_existing } = options;
    let shooters;
    if (clear_existing) {
        const hasScores = db.prepare(`SELECT COUNT(*) AS c FROM scores WHERE match_id = ?`).get(matchId);
        if (hasScores.c > 0) {
            throw new Error('Cannot clear squads: some shooters already have scores');
        }
        db.prepare(`UPDATE shooters SET squad_id = NULL WHERE match_id = ?`).run(matchId);
        db.prepare(`DELETE FROM squads WHERE match_id = ?`).run(matchId);
        shooters = db
            .prepare(`SELECT s.id, s.created_at, s.bib_number, s.region, s.club, d.code AS division_code
         FROM shooters s
         JOIN divisions d ON s.division_id = d.id
         WHERE s.match_id = ?`)
            .all(matchId);
    }
    else {
        shooters = db
            .prepare(`SELECT s.id, s.created_at, s.bib_number, s.region, s.club, d.code AS division_code
         FROM shooters s
         JOIN divisions d ON s.division_id = d.id
         WHERE s.match_id = ? AND s.squad_id IS NULL`)
            .all(matchId);
    }
    if (shooters.length === 0) {
        throw new Error('No shooters to assign');
    }
    const sorted = sortShooters(shooters, sort_by);
    const squadCount = Math.ceil(sorted.length / group_size);
    const assignments = new Map();
    if (strategy === 'sequential') {
        sorted.forEach((shooter, index) => {
            assignments.set(shooter.id, Math.floor(index / group_size));
        });
    }
    else if (strategy === 'snake') {
        sorted.forEach((shooter, index) => {
            const row = Math.floor(index / squadCount);
            const col = index % squadCount;
            const squadIndex = row % 2 === 0 ? col : squadCount - 1 - col;
            assignments.set(shooter.id, squadIndex);
        });
    }
    else {
        const buckets = new Map();
        for (const shooter of sorted) {
            const key = shooter.division_code;
            const bucket = buckets.get(key);
            if (bucket) {
                bucket.push(shooter);
            }
            else {
                buckets.set(key, [shooter]);
            }
        }
        let squadIndex = 0;
        let hasRemaining = true;
        while (hasRemaining) {
            hasRemaining = false;
            for (const bucket of buckets.values()) {
                const shooter = bucket.shift();
                if (!shooter) {
                    continue;
                }
                assignments.set(shooter.id, squadIndex % squadCount);
                squadIndex += 1;
                hasRemaining = true;
            }
        }
    }
    const maxSort = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM squads WHERE match_id = ?`).get(matchId);
    const assignTx = db.transaction(() => {
        const squadIds = [];
        const insertSquad = db.prepare(`INSERT INTO squads (match_id, name, sort_order) VALUES (?, ?, ?)`);
        for (let i = 0; i < squadCount; i += 1) {
            const sortOrder = maxSort.m + i + 1;
            const result = insertSquad.run(matchId, `Squad ${sortOrder}`, sortOrder);
            squadIds.push(Number(result.lastInsertRowid));
        }
        const updateShooter = db.prepare(`UPDATE shooters SET squad_id = ? WHERE id = ?`);
        for (const [shooterId, squadIndex] of assignments.entries()) {
            updateShooter.run(squadIds[squadIndex], shooterId);
        }
        return squadIds;
    });
    const squadIds = assignTx();
    const squads = squadIds.map((squadId, index) => {
        const members = db
            .prepare(`SELECT s.id, s.name, s.bib_number, d.code AS division_code
         FROM shooters s
         JOIN divisions d ON s.division_id = d.id
         WHERE s.squad_id = ?
         ORDER BY s.bib_number`)
            .all(squadId);
        return {
            id: squadId,
            name: `Squad ${maxSort.m + index + 1}`,
            shooter_count: members.length,
            shooters: members,
        };
    });
    const unassigned = db.prepare(`SELECT COUNT(*) AS c FROM shooters WHERE match_id = ? AND squad_id IS NULL`).get(matchId).c;
    return {
        squads_created: squadCount,
        shooters_assigned: sorted.length,
        unassigned,
        squads,
    };
}
function sortShooters(shooters, sort_by) {
    const copy = [...shooters];
    switch (sort_by) {
        case 'registration':
            return copy.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        case 'bib':
            return copy.sort((a, b) => a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true }));
        case 'division':
            return copy.sort((a, b) => {
                const divCmp = a.division_code.localeCompare(b.division_code);
                if (divCmp !== 0)
                    return divCmp;
                return a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true });
            });
        case 'random':
            for (let i = copy.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        case 'region':
            return copy.sort((a, b) => {
                const regionCmp = (a.region || '').localeCompare(b.region || '');
                if (regionCmp !== 0)
                    return regionCmp;
                return a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true });
            });
        case 'club':
            return copy.sort((a, b) => {
                const clubCmp = (a.club || '').localeCompare(b.club || '');
                if (clubCmp !== 0)
                    return clubCmp;
                return a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true });
            });
        default:
            return copy;
    }
}

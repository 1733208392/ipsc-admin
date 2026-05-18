const SCORING = {
    minor: { A: 5, C: 3, D: 1 },
    major: { A: 5, C: 4, D: 2 },
};
function round(value, decimals = 4) {
    return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
export function calculateScore(hits, penalties, totalTime, powerFactor, status = 'normal') {
    if (status === 'dnf' || status === 'dq') {
        return { totalPoints: 0, hitFactor: 0 };
    }
    const pf = SCORING[powerFactor];
    const points = hits.A * pf.A + hits.C * pf.C + hits.D * pf.D;
    const penaltyPoints = (hits.M + hits.N) * 10 + penalties.PE * 10;
    const totalPoints = Math.max(points - penaltyPoints, 0);
    const hitFactor = totalTime > 0 ? totalPoints / totalTime : 0;
    return { totalPoints: round(totalPoints), hitFactor: round(hitFactor) };
}

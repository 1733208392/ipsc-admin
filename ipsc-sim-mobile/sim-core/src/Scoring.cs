namespace IpscSim.Core;

/// <summary>
/// IPSC Comstock scoring: points per hit zone, depending on division power factor.
/// Misses and no-shoots = -10. Procedural / FTN = -10 (applied elsewhere).
/// </summary>
public static class Scoring
{
    public const int MissPenalty = -10;
    public const int NoShootPenalty = -10;
    public const int FtnPenalty = -10; // per missing required hit

    public static int PointsFor(HitZone zone, PowerFactor pf) => (zone, pf) switch
    {
        (HitZone.A, _) => 5,
        (HitZone.C, PowerFactor.Major) => 4,
        (HitZone.C, PowerFactor.Minor) => 3,
        (HitZone.D, PowerFactor.Major) => 2,
        (HitZone.D, PowerFactor.Minor) => 1,
        (HitZone.Miss, _) => MissPenalty,
        (HitZone.NoShoot, _) => NoShootPenalty,
        _ => 0
    };

    /// <summary>HF = points / time, clamped non-negative, 0 if time is 0.</summary>
    public static double HitFactor(int totalPoints, double totalTime)
    {
        if (totalTime <= 0) return 0;
        return Math.Max(0, totalPoints) / totalTime;
    }
}

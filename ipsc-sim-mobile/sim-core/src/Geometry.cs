namespace IpscSim.Core;

/// <summary>
/// IPSC target hit-zone resolution. All measurements in meters, in target-local
/// coordinates where (0,0) is the centre of the upper A zone.
///
/// Paper (IPSC Classic, simplified concentric rectangles centred on the upper A):
///   A: 0.15 × 0.30 m
///   C: 0.30 × 0.45 m
///   D: 0.45 × 0.75 m
/// Steel:
///   Full popper: radius 0.15 m
///   Mini popper / plate: radius 0.10 m
/// </summary>
public static class Geometry
{
    public const double PopperRadius = 0.15;
    public const double MiniPopperRadius = 0.10;
    public const double PlateRadius = 0.10;

    public static HitZone ResolvePaper(double dx, double dy)
    {
        double ax = Math.Abs(dx), ay = Math.Abs(dy);
        if (ax <= 0.075 && ay <= 0.150) return HitZone.A;
        if (ax <= 0.150 && ay <= 0.225) return HitZone.C;
        if (ax <= 0.225 && ay <= 0.375) return HitZone.D;
        return HitZone.Miss;
    }

    public static HitZone ResolveSteel(double dx, double dy, double radius)
    {
        return (dx * dx + dy * dy) <= radius * radius ? HitZone.A : HitZone.Miss;
    }
}

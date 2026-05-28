namespace IpscSim.Core;

/// <summary>
/// Stability model. Both effects scale with arrival speed (0..1 normalized):
///   1. Stabilization delay before the first shot at a position.
///   2. Per-shot Gaussian dispersion sigma, decaying from arrival.
/// All constants tunable; chosen for "reasonable" IPSC feel at v1.
/// </summary>
public static class Stability
{
    public const double VMin = 1.0;        // m/s slow walk
    public const double VMax = 4.5;        // m/s sprint

    public const double TStabBase = 0.25;  // base settle even from a stand
    public const double KStab = 0.50;      // extra seconds at full speed²
    public const double TSplitBase = 0.18; // base split between follow-ups

    public const double SigmaBase = 0.040; // m, baseline dispersion at 0 dist
    public const double KSpeed = 0.100;    // extra m at full speed * remaining
    public const double KDist = 0.006;     // extra m per meter distance
    public const double Tau = 0.45;        // decay time constant (s)

    public static double IntendedToSpeed(double intended)
    {
        double s = Math.Clamp(intended, 0.0, 1.0);
        return VMin + s * (VMax - VMin);
    }

    public static double StabDelay(double arrivalSpeedNorm)
    {
        double s = Math.Clamp(arrivalSpeedNorm, 0.0, 1.0);
        return TStabBase + KStab * s * s;
    }

    public static double RemainingUnstab(double tSinceArrival, double arrivalSpeedNorm)
    {
        double s = Math.Clamp(arrivalSpeedNorm, 0.0, 1.0);
        return s * Math.Exp(-Math.Max(0, tSinceArrival) / Tau);
    }

    public static double Sigma(double tSinceArrival, double arrivalSpeedNorm, double distance)
    {
        return SigmaBase
            + KSpeed * RemainingUnstab(tSinceArrival, arrivalSpeedNorm)
            + KDist * Math.Max(0, distance);
    }
}

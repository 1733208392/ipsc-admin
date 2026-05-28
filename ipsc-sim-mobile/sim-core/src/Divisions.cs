namespace IpscSim.Core;

/// <summary>USPSA / IPSC division presets (v1, read-only).</summary>
public static class Divisions
{
    public static readonly Division Open = new()
    {
        Code = "open", PowerFactor = PowerFactor.Major,
        MagCapacity = 28, ReloadTimeSeconds = 1.4,
    };
    public static readonly Division Limited = new()
    {
        Code = "limited", PowerFactor = PowerFactor.Major,
        MagCapacity = 21, ReloadTimeSeconds = 1.7,
    };
    public static readonly Division Production = new()
    {
        Code = "production", PowerFactor = PowerFactor.Minor,
        MagCapacity = 15, ReloadTimeSeconds = 1.9,
    };
    public static readonly Division CarryOptics = new()
    {
        Code = "co", PowerFactor = PowerFactor.Minor,
        MagCapacity = 15, ReloadTimeSeconds = 1.9,
    };
    public static readonly Division Pcc = new()
    {
        Code = "pcc", PowerFactor = PowerFactor.Minor,
        MagCapacity = 30, ReloadTimeSeconds = 2.1,
    };
    public static readonly Division Revolver = new()
    {
        Code = "revolver", PowerFactor = PowerFactor.Major,
        MagCapacity = 6, ReloadTimeSeconds = 3.5,
    };

    public static readonly IReadOnlyList<Division> All = new[]
    {
        Open, Limited, Production, CarryOptics, Pcc, Revolver,
    };

    public static Division ByCode(string code)
    {
        foreach (var d in All)
            if (string.Equals(d.Code, code, StringComparison.OrdinalIgnoreCase))
                return d;
        throw new ArgumentException($"unknown division code '{code}'", nameof(code));
    }
}

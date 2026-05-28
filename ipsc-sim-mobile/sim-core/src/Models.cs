using System.Text.Json;
using System.Text.Json.Serialization;

namespace IpscSim.Core;

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

public enum TargetKind { PaperIpsc, Popper, MiniPopper, Plate, NoShoot }
public enum PowerFactor { Major, Minor }
public enum HitZone { A, C, D, Miss, NoShoot }
public enum PlanStepKind { Move, Engage, Reload }

// ────────────────────────────────────────────────────────────────────────────
// Geometry primitives
// ────────────────────────────────────────────────────────────────────────────

public sealed class Vec2
{
    public double X { get; init; }
    public double Y { get; init; }
    public Vec2() { }
    public Vec2(double x, double y) { X = x; Y = y; }
}

public sealed class Pose
{
    public double X { get; init; }
    public double Y { get; init; }
    public double FacingDeg { get; init; }
}

// ────────────────────────────────────────────────────────────────────────────
// Stage / Target / Division
// ────────────────────────────────────────────────────────────────────────────

public sealed class Target
{
    public int Id { get; init; }
    public TargetKind Kind { get; init; } = TargetKind.PaperIpsc;
    public Pose Pose { get; init; } = new();
    public int RequiredHits { get; init; } = 2;
    public int? ActivatorId { get; init; }
    public double ActivationDelay { get; init; }
}

public sealed class Stage
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public double BoundsW { get; init; }
    public double BoundsH { get; init; }
    public Pose StartPose { get; init; } = new();
    public Target[] Targets { get; init; } = Array.Empty<Target>();
    public int MinRounds { get; init; }
}

public sealed class Division
{
    public string Code { get; init; } = "";
    public PowerFactor PowerFactor { get; init; } = PowerFactor.Minor;
    public int MagCapacity { get; init; } = 15;
    public bool StartLoaded { get; init; } = true;
    public double ReloadTimeSeconds { get; init; } = 2.0;
}

// ────────────────────────────────────────────────────────────────────────────
// Plan (input from user)
// ────────────────────────────────────────────────────────────────────────────

public sealed class Engagement
{
    public int TargetId { get; set; }
    public int ShotCount { get; set; } = 1;
    public HitZone Aim { get; set; } = HitZone.A;
}

/// <summary>
/// Single discriminated step type. Fields populated depend on Kind.
/// Move:   From, To, IntendedSpeed
/// Engage: Position, Engagements
/// Reload: AtPosition (optional)
/// </summary>
public sealed class PlanStep
{
    public int Id { get; set; }
    public PlanStepKind Kind { get; set; }

    // Move
    public Vec2? From { get; set; }
    public Vec2? To { get; set; }
    public double IntendedSpeed { get; set; }

    // Engage / Reload
    public Vec2? Position { get; set; }
    public Engagement[]? Engagements { get; set; }
    public Vec2? AtPosition { get; set; }
}

public sealed class Plan
{
    public string StageId { get; init; } = "";
    public string DivisionCode { get; init; } = "";
    public ulong Seed { get; init; }
    public PlanStep[] Steps { get; init; } = Array.Empty<PlanStep>();
}

// ────────────────────────────────────────────────────────────────────────────
// Result (output of SimEngine)
// ────────────────────────────────────────────────────────────────────────────

public sealed class Shot
{
    public double T { get; init; }
    public int TargetId { get; init; }
    public HitZone Zone { get; init; }
    public double ImpactX { get; init; }
    public double ImpactY { get; init; }
    public int Points { get; init; }
    public bool Forced { get; init; }
}

public sealed class RunResult
{
    public Shot[] Shots { get; init; } = Array.Empty<Shot>();
    public double TotalTime { get; init; }
    public int TotalPoints { get; init; }
    public double HitFactor { get; init; }
    public int[] ForcedReloadStepIds { get; init; } = Array.Empty<int>();
    public string[] PlanningErrors { get; init; } = Array.Empty<string>();
    public string EngineVersion { get; init; } = "";
}

// ────────────────────────────────────────────────────────────────────────────
// JSON options
// ────────────────────────────────────────────────────────────────────────────

public static class SimJson
{
    public static JsonSerializerOptions Pretty { get; } = Build(indent: true);
    public static JsonSerializerOptions Compact { get; } = Build(indent: false);

    private static JsonSerializerOptions Build(bool indent) => new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = indent,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Compact) ?? throw new InvalidOperationException("null deserialize");

    public static string SerializePretty<T>(T value) => JsonSerializer.Serialize(value, Pretty);
    public static string SerializeCompact<T>(T value) => JsonSerializer.Serialize(value, Compact);
}

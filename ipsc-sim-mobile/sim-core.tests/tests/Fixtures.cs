using IpscSim.Core;

namespace IpscSim.Core.Tests;

/// <summary>Hand-rolled fixtures used by the unit tests.</summary>
internal static class Fixtures
{
    public static Stage ElPresidente() => new()
    {
        Id = "el-presidente",
        Name = "El Presidente",
        BoundsW = 10, BoundsH = 14,
        StartPose = new Pose { X = 5, Y = 1, FacingDeg = 0 },
        MinRounds = 12,
        Targets = new Target[]
        {
            new() { Id = 1, Kind = TargetKind.PaperIpsc, RequiredHits = 2,
                Pose = new Pose { X = 3, Y = 11 } },
            new() { Id = 2, Kind = TargetKind.PaperIpsc, RequiredHits = 2,
                Pose = new Pose { X = 5, Y = 11 } },
            new() { Id = 3, Kind = TargetKind.PaperIpsc, RequiredHits = 2,
                Pose = new Pose { X = 7, Y = 11 } },
        },
    };

    public static Plan ElPresidentePlan(ulong seed) => new()
    {
        StageId = "el-presidente",
        DivisionCode = Divisions.Production.Code,
        Seed = seed,
        Steps = new PlanStep[]
        {
            new() { Id = 1, Kind = PlanStepKind.Engage,
                Position = new Vec2(5, 1),
                Engagements = new[]
                {
                    new Engagement { TargetId = 1, ShotCount = 2 },
                    new Engagement { TargetId = 2, ShotCount = 2 },
                    new Engagement { TargetId = 3, ShotCount = 2 },
                } },
            new() { Id = 2, Kind = PlanStepKind.Reload },
            new() { Id = 3, Kind = PlanStepKind.Engage,
                Position = new Vec2(5, 1),
                Engagements = new[]
                {
                    new Engagement { TargetId = 3, ShotCount = 2 },
                    new Engagement { TargetId = 2, ShotCount = 2 },
                    new Engagement { TargetId = 1, ShotCount = 2 },
                } },
        },
    };

    /// <summary>Single distant target — useful for stability monotonicity testing.</summary>
    public static Stage LongShotStage() => new()
    {
        Id = "long-shot",
        Name = "Long Shot",
        BoundsW = 10, BoundsH = 30,
        StartPose = new Pose { X = 5, Y = 1, FacingDeg = 0 },
        MinRounds = 6,
        Targets = new Target[]
        {
            new() { Id = 1, Kind = TargetKind.PaperIpsc, RequiredHits = 6,
                Pose = new Pose { X = 5, Y = 25 } },
        },
    };

    public static Plan LongShotPlan(ulong seed, double intendedSpeed) => new()
    {
        StageId = "long-shot",
        DivisionCode = Divisions.Production.Code,
        Seed = seed,
        Steps = new PlanStep[]
        {
            new() { Id = 1, Kind = PlanStepKind.Move,
                From = new Vec2(5, 1), To = new Vec2(5, 5), IntendedSpeed = intendedSpeed },
            new() { Id = 2, Kind = PlanStepKind.Engage,
                Position = new Vec2(5, 5),
                Engagements = new[] { new Engagement { TargetId = 1, ShotCount = 6 } } },
        },
    };
}

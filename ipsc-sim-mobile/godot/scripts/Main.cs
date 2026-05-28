using Godot;
using IpscSim.Core;

namespace IpscSim.Mobile;

/// <summary>
/// Placeholder main scene. Verifies the Godot project links against the
/// shared sim-core library by running a tiny smoke simulation at startup
/// and printing the result. Replaced by the real menu in Phase 3.
/// </summary>
public partial class Main : Control
{
    public override void _Ready()
    {
        var stage = new Stage
        {
            Id = "smoke",
            Name = "Smoke Test",
            BoundsW = 10, BoundsH = 14,
            StartPose = new Pose { X = 5, Y = 1 },
            MinRounds = 2,
            Targets = new Target[]
            {
                new() { Id = 1, Kind = TargetKind.PaperIpsc, RequiredHits = 2,
                    Pose = new Pose { X = 5, Y = 11 } },
            },
        };
        var plan = new Plan
        {
            StageId = "smoke",
            DivisionCode = Divisions.Production.Code,
            Seed = 42,
            Steps = new[]
            {
                new PlanStep
                {
                    Id = 1, Kind = PlanStepKind.Engage,
                    Position = new Vec2(5, 1),
                    Engagements = new[] { new Engagement { TargetId = 1, ShotCount = 2 } },
                },
            },
        };

        var result = SimEngine.Run(stage, plan, Divisions.Production);
        GD.Print($"[IpscSim] sim-core OK: HF={result.HitFactor}, " +
                 $"time={result.TotalTime}s, points={result.TotalPoints}, " +
                 $"engine={result.EngineVersion}");
    }
}

using IpscSim.Core;

namespace IpscSim.Core.Tests;

public class PlanExecutionTests
{
    [Fact]
    public void EmptyMag_TriggersForcedReload()
    {
        // Production = 15 round mag. Plan 17 shots in one engagement, no reload.
        var stage = Fixtures.ElPresidente();
        var plan = new Plan
        {
            StageId = stage.Id,
            DivisionCode = Divisions.Production.Code,
            Seed = 42,
            Steps = new[]
            {
                new PlanStep
                {
                    Id = 1, Kind = PlanStepKind.Engage,
                    Position = new Vec2(5, 1),
                    Engagements = new[]
                    {
                        new Engagement { TargetId = 1, ShotCount = 17 },
                    },
                },
            },
        };
        var result = SimEngine.Run(stage, plan, Divisions.Production);

        Assert.NotEmpty(result.ForcedReloadStepIds);
        Assert.Contains(1, result.ForcedReloadStepIds);
        Assert.Contains(result.PlanningErrors, s => s.Contains("forced reload"));
    }

    [Fact]
    public void PlannedReload_DoesNotTriggerForced()
    {
        var stage = Fixtures.ElPresidente();
        var plan = new Plan
        {
            StageId = stage.Id,
            DivisionCode = Divisions.Production.Code,
            Seed = 1,
            Steps = new PlanStep[]
            {
                new() { Id = 1, Kind = PlanStepKind.Engage,
                    Position = new Vec2(5, 1),
                    Engagements = new[] { new Engagement { TargetId = 1, ShotCount = 6 } } },
                new() { Id = 2, Kind = PlanStepKind.Reload },
                new() { Id = 3, Kind = PlanStepKind.Engage,
                    Position = new Vec2(5, 1),
                    Engagements = new[] { new Engagement { TargetId = 2, ShotCount = 6 } } },
            },
        };
        var result = SimEngine.Run(stage, plan, Divisions.Production);
        Assert.Empty(result.ForcedReloadStepIds);
    }

    [Fact]
    public void FasterMove_DoesNotProduceFewerMisses_OnAverage()
    {
        // Probabilistic monotonicity: averaged across many seeds, a faster
        // approach should yield miss_rate(fast) >= miss_rate(slow).
        var stage = Fixtures.LongShotStage();

        int slowMiss = 0, fastMiss = 0;
        const int trials = 200;
        for (int seed = 1; seed <= trials; seed++)
        {
            slowMiss += CountMisses(stage, Fixtures.LongShotPlan((ulong)seed, intendedSpeed: 0.0));
            fastMiss += CountMisses(stage, Fixtures.LongShotPlan((ulong)seed, intendedSpeed: 1.0));
        }
        Assert.True(fastMiss >= slowMiss,
            $"expected fast >= slow misses; got slow={slowMiss}, fast={fastMiss}");
    }

    private static int CountMisses(Stage stage, Plan plan)
    {
        var r = SimEngine.Run(stage, plan, Divisions.Production);
        int n = 0;
        foreach (var s in r.Shots) if (s.Zone == HitZone.Miss) n++;
        return n;
    }

    [Fact]
    public void RunResult_Time_IsPositive_WithMoves()
    {
        var stage = Fixtures.ElPresidente();
        var plan = Fixtures.ElPresidentePlan(42);
        var r = SimEngine.Run(stage, plan, Divisions.Production);
        Assert.True(r.TotalTime > 0);
        Assert.True(r.Shots.Length > 0);
    }
}

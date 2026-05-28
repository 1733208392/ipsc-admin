using System.Collections.Generic;
using Godot;
using IpscSim.Core;

namespace IpscSim.Mobile;

/// <summary>
/// Singleton autoload holding the in-progress plan + selected stage/division.
/// Phase 3 keeps everything in-memory; persistence to user://drafts.json
/// happens in Phase 6.
/// </summary>
public partial class GameState : Node
{
    public static GameState Instance { get; private set; } = null!;

    public Stage CurrentStage { get; private set; } = null!;
    public Division CurrentDivision { get; set; } = Divisions.Production;
    public List<PlanStep> Steps { get; } = new();
    public ulong PreviewSeed { get; set; } = 1;

    [Signal] public delegate void PlanChangedEventHandler();
    [Signal] public delegate void StageChangedEventHandler();

    public override void _EnterTree()
    {
        Instance = this;
        // Default to El Presidente on boot so the planner has something to show.
        SetStage("el-presidente");
    }

    public void SetStage(string id)
    {
        CurrentStage = StageLoader.LoadBuiltin(id);
        Steps.Clear();
        EmitSignal(SignalName.StageChanged);
        EmitSignal(SignalName.PlanChanged);
    }

    public void AddStep(PlanStep step)
    {
        Steps.Add(step);
        EmitSignal(SignalName.PlanChanged);
    }

    public void RemoveLastStep()
    {
        if (Steps.Count == 0) return;
        Steps.RemoveAt(Steps.Count - 1);
        EmitSignal(SignalName.PlanChanged);
    }

    public void ClearSteps()
    {
        Steps.Clear();
        EmitSignal(SignalName.PlanChanged);
    }

    public Plan BuildPlan(ulong seed)
    {
        // Re-id steps sequentially so feedback ("step 3 forced reload") is stable.
        var arr = new PlanStep[Steps.Count];
        for (int i = 0; i < Steps.Count; i++)
        {
            var s = Steps[i];
            arr[i] = new PlanStep
            {
                Id = i + 1,
                Kind = s.Kind,
                From = s.From,
                To = s.To,
                IntendedSpeed = s.IntendedSpeed,
                Position = s.Position,
                Engagements = s.Engagements,
            };
        }
        return new Plan
        {
            StageId = CurrentStage.Id,
            DivisionCode = CurrentDivision.Code,
            Seed = seed,
            Steps = arr,
        };
    }

    /// <summary>Last EngageStep in the plan, or null if none.</summary>
    public PlanStep? LastEngage()
    {
        for (int i = Steps.Count - 1; i >= 0; i--)
            if (Steps[i].Kind == PlanStepKind.Engage) return Steps[i];
        return null;
    }

    /// <summary>Last position the shooter is at (start pose if none yet).</summary>
    public Vec2 LastPosition()
    {
        for (int i = Steps.Count - 1; i >= 0; i--)
        {
            var s = Steps[i];
            if (s.Kind == PlanStepKind.Engage && s.Position is not null) return s.Position;
            if (s.Kind == PlanStepKind.Move && s.To is not null) return s.To;
        }
        return new Vec2(CurrentStage.StartPose.X, CurrentStage.StartPose.Y);
    }
}

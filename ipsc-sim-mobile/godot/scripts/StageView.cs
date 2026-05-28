using Godot;
using IpscSim.Core;

namespace IpscSim.Mobile;

/// <summary>
/// Top-down stage renderer. Coordinates are in meters; this Node2D's
/// transform converts meters → pixels for screen output. The parent
/// <see cref="Planner"/> drives pan/zoom by setting Position and Scale.
///
/// Draws:
///   - stage bounds rectangle
///   - shooter start pose (green dot + facing arrow)
///   - targets (red rectangles for paper, circles for steel, yellow for no-shoot)
///   - plan: engage positions (cyan), move paths (white lines), reload markers (orange)
///
/// Exposes <see cref="ScreenToWorld"/> so input handlers can convert touch
/// pixels into meters.
/// </summary>
public partial class StageView : Node2D
{
    public const float PixelsPerMeter = 60f;   // default zoom; Planner overrides via Scale

    private GameState _state = null!;

    public override void _Ready()
    {
        _state = GameState.Instance;
        _state.StageChanged += QueueRedraw;
        _state.PlanChanged += QueueRedraw;
        // Coordinates stay in meters; the parent World node provides the
        // meters→pixels scale.
    }

    public override void _ExitTree()
    {
        if (_state is not null)
        {
            _state.StageChanged -= QueueRedraw;
            _state.PlanChanged -= QueueRedraw;
        }
    }

    public override void _Draw()
    {
        var stage = _state.CurrentStage;
        if (stage is null) return;

        // Bounds (in meters — local-space coordinates are meters).
        var bounds = new Rect2(0, 0, (float)stage.BoundsW, (float)stage.BoundsH);
        DrawRect(bounds, new Color(0.05f, 0.10f, 0.14f), filled: true);
        DrawRect(bounds, new Color(0.30f, 0.40f, 0.50f), filled: false, width: 0.04f);

        // Grid every 1 m.
        var grid = new Color(0.15f, 0.20f, 0.26f);
        for (int x = 1; x < stage.BoundsW; x++)
            DrawLine(new Vector2(x, 0), new Vector2(x, (float)stage.BoundsH), grid, 0.015f);
        for (int y = 1; y < stage.BoundsH; y++)
            DrawLine(new Vector2(0, y), new Vector2((float)stage.BoundsW, y), grid, 0.015f);

        // Targets.
        foreach (var t in stage.Targets) DrawTarget(t);

        // Start pose.
        var start = new Vector2((float)stage.StartPose.X, (float)stage.StartPose.Y);
        DrawCircle(start, 0.22f, new Color(0.20f, 0.85f, 0.30f));
        DrawCircle(start, 0.22f, new Color(0.05f, 0.40f, 0.10f), filled: false);
        DrawString(ThemeDB.FallbackFont, start + new Vector2(0.25f, -0.20f),
            "START", HorizontalAlignment.Left, -1, fontSize: 1);

        // Plan.
        DrawPlan();
    }

    private void DrawTarget(Target t)
    {
        var p = new Vector2((float)t.Pose.X, (float)t.Pose.Y);
        switch (t.Kind)
        {
            case TargetKind.PaperIpsc:
            case TargetKind.NoShoot:
            {
                bool ns = t.Kind == TargetKind.NoShoot;
                var fill = ns ? new Color(0.85f, 0.80f, 0.20f)
                              : new Color(0.78f, 0.20f, 0.18f);
                var dRect = new Rect2(p - new Vector2(0.225f, 0.375f),
                                       new Vector2(0.450f, 0.750f));
                DrawRect(dRect, fill);
                // A zone marker.
                DrawRect(new Rect2(p - new Vector2(0.075f, 0.150f),
                                    new Vector2(0.150f, 0.300f)),
                         new Color(0.10f, 0.10f, 0.10f), filled: false, width: 0.02f);
                DrawString(ThemeDB.FallbackFont, p + new Vector2(-0.15f, -0.45f),
                    (ns ? "NS#" : "T") + t.Id,
                    HorizontalAlignment.Left, -1, fontSize: 1);
                break;
            }
            case TargetKind.Popper:
                DrawCircle(p, (float)Geometry.PopperRadius, new Color(0.70f, 0.70f, 0.75f));
                DrawString(ThemeDB.FallbackFont, p + new Vector2(0.20f, 0),
                    "P" + t.Id, HorizontalAlignment.Left, -1, fontSize: 1);
                break;
            case TargetKind.MiniPopper:
            case TargetKind.Plate:
                DrawCircle(p, (float)Geometry.PlateRadius, new Color(0.70f, 0.70f, 0.75f));
                DrawString(ThemeDB.FallbackFont, p + new Vector2(0.15f, 0),
                    "S" + t.Id, HorizontalAlignment.Left, -1, fontSize: 1);
                break;
        }
    }

    private void DrawPlan()
    {
        var stage = _state.CurrentStage;
        // Build the timeline of shooter positions for path drawing.
        Vector2 cursor = new((float)stage.StartPose.X, (float)stage.StartPose.Y);

        var engageColor = new Color(0.20f, 0.80f, 0.95f);
        var moveColor   = new Color(0.95f, 0.95f, 0.95f);
        var reloadColor = new Color(0.95f, 0.55f, 0.10f);
        var engageLineColor = new Color(0.50f, 0.85f, 0.95f, 0.4f);

        int stepIdx = 0;
        foreach (var step in _state.Steps)
        {
            stepIdx++;
            switch (step.Kind)
            {
                case PlanStepKind.Move when step.From is not null && step.To is not null:
                {
                    var a = new Vector2((float)step.From.X, (float)step.From.Y);
                    var b = new Vector2((float)step.To.X, (float)step.To.Y);
                    DrawDashedLine(a, b, moveColor, 0.04f, dash: 0.20f);
                    DrawArrowhead(a, b, moveColor);
                    cursor = b;
                    break;
                }
                case PlanStepKind.Engage when step.Position is not null:
                {
                    var p = new Vector2((float)step.Position.X, (float)step.Position.Y);
                    // implicit transition line from cursor (faint)
                    if ((p - cursor).LengthSquared() > 0.0001f)
                        DrawLine(cursor, p, new Color(1, 1, 1, 0.25f), 0.02f);
                    DrawCircle(p, 0.18f, engageColor);
                    DrawString(ThemeDB.FallbackFont, p + new Vector2(0.22f, -0.05f),
                        $"#{stepIdx}", HorizontalAlignment.Left, -1, fontSize: 1);
                    // engagement rays
                    if (step.Engagements is not null)
                    {
                        foreach (var eng in step.Engagements)
                        {
                            foreach (var t in stage.Targets)
                                if (t.Id == eng.TargetId)
                                {
                                    var tp = new Vector2((float)t.Pose.X, (float)t.Pose.Y);
                                    DrawLine(p, tp, engageLineColor, 0.025f);
                                    var mid = p + (tp - p) * 0.55f;
                                    DrawString(ThemeDB.FallbackFont, mid,
                                        $"x{eng.ShotCount}",
                                        HorizontalAlignment.Center, -1, fontSize: 1);
                                }
                        }
                    }
                    cursor = p;
                    break;
                }
                case PlanStepKind.Reload:
                {
                    // Marker at the current cursor position.
                    DrawCircle(cursor, 0.14f, reloadColor);
                    DrawString(ThemeDB.FallbackFont, cursor + new Vector2(0.18f, 0.32f),
                        "RELOAD", HorizontalAlignment.Left, -1, fontSize: 1);
                    break;
                }
            }
        }
    }

    private void DrawArrowhead(Vector2 a, Vector2 b, Color c)
    {
        var dir = (b - a).Normalized();
        var perp = new Vector2(-dir.Y, dir.X);
        var tip = b;
        var back = b - dir * 0.20f;
        DrawLine(tip, back + perp * 0.10f, c, 0.04f);
        DrawLine(tip, back - perp * 0.10f, c, 0.04f);
    }

    // ── Hit-testing helpers ─────────────────────────────────────────────────

    /// <summary>Convert a position in this Node2D's parent space to world meters.</summary>
    public Vector2 LocalToWorld(Vector2 localToParent) =>
        (localToParent - Position) / Scale;

    public int? HitTestTarget(Vector2 worldMeters, float tolerance = 0.35f)
    {
        Target? closest = null;
        float bestDist = tolerance;
        foreach (var t in _state.CurrentStage.Targets)
        {
            var tp = new Vector2((float)t.Pose.X, (float)t.Pose.Y);
            float d = tp.DistanceTo(worldMeters);
            if (d < bestDist) { bestDist = d; closest = t; }
        }
        return closest?.Id;
    }
}

using System;
using System.Linq;
using System.Text;
using Godot;
using IpscSim.Core;

namespace IpscSim.Mobile;

/// <summary>
/// Phase 3 top-down planner. Lets the user place engage / move / reload
/// steps on a stage, edit transition speed, and watch a live HF estimate
/// computed off the UI thread.
///
/// Input model:
///   ▸ Single tap on the world  → apply the currently selected tool
///   ▸ Mouse-right/middle drag  → pan
///   ▸ Two-finger touch drag    → pan
///   ▸ Pinch                    → zoom
///   ▸ Mouse wheel              → zoom about pointer
/// </summary>
public partial class Planner : Control
{
    public enum Tool { Engage, EngageTarget, Move, Reload, Erase }

    // World (Node2D) sub-tree.
    private Node2D _world = null!;
    private StageView _view = null!;

    // UI nodes (assigned via NodePath exports so the .tscn can wire them).
    [Export] public NodePath? StageDropdownPath;
    [Export] public NodePath? DivisionDropdownPath;
    [Export] public NodePath? StepsListPath;
    [Export] public NodePath? HfLabelPath;
    [Export] public NodePath? WarningsLabelPath;
    [Export] public NodePath? SpeedSliderPath;
    [Export] public NodePath? SpeedValueLabelPath;
    [Export] public NodePath? ToolOptionPath;
    [Export] public NodePath? UndoButtonPath;
    [Export] public NodePath? ClearButtonPath;
    [Export] public NodePath? RunButtonPath;

    private OptionButton _stageDropdown = null!;
    private OptionButton _divDropdown = null!;
    private ItemList _stepsList = null!;
    private Label _hfLabel = null!;
    private Label _warningsLabel = null!;
    private HSlider _speedSlider = null!;
    private Label _speedValueLabel = null!;
    private OptionButton _toolOption = null!;

    private Tool _tool = Tool.Engage;
    private float _intendedSpeed = 0.5f;

    // Pan/zoom state.
    private bool _panning;
    private Vector2 _panStartMouse;
    private Vector2 _panStartWorldPos;
    private Vector2 _downPos;
    private bool _possibleTap;

    // Pinch state.
    private readonly System.Collections.Generic.Dictionary<int, Vector2> _touches = new();
    private float? _pinchStartDist;
    private float _pinchStartScale;

    private readonly HfEstimator _hf = new();
    private bool _estimating;
    private bool _estimateDirty;

    public override void _Ready()
    {
        _world = GetNode<Node2D>("World");
        _view  = _world.GetNode<StageView>("StageView");

        _stageDropdown   = GetNode<OptionButton>(StageDropdownPath);
        _divDropdown     = GetNode<OptionButton>(DivisionDropdownPath);
        _stepsList       = GetNode<ItemList>(StepsListPath);
        _hfLabel         = GetNode<Label>(HfLabelPath);
        _warningsLabel   = GetNode<Label>(WarningsLabelPath);
        _speedSlider     = GetNode<HSlider>(SpeedSliderPath);
        _speedValueLabel = GetNode<Label>(SpeedValueLabelPath);
        _toolOption      = GetNode<OptionButton>(ToolOptionPath);

        PopulateDropdowns();
        PopulateToolOption();

        _stageDropdown.ItemSelected += OnStageSelected;
        _divDropdown.ItemSelected   += OnDivisionSelected;
        _toolOption.ItemSelected    += i => _tool = (Tool)(int)i;
        _speedSlider.ValueChanged   += OnSpeedChanged;
        GetNode<Button>(UndoButtonPath).Pressed += OnUndo;
        GetNode<Button>(ClearButtonPath).Pressed += OnClear;
        GetNode<Button>(RunButtonPath).Pressed   += OnRun;

        GameState.Instance.PlanChanged  += OnPlanChanged;
        GameState.Instance.StageChanged += CenterStage;

        _speedSlider.MinValue = 0.0; _speedSlider.MaxValue = 1.0; _speedSlider.Step = 0.05;
        _speedSlider.Value = _intendedSpeed;
        OnSpeedChanged(_intendedSpeed);

        CallDeferred(nameof(CenterStage));
        CallDeferred(nameof(OnPlanChanged));
    }

    private void PopulateDropdowns()
    {
        _stageDropdown.Clear();
        foreach (var id in StageLoader.BuiltinIds) _stageDropdown.AddItem(id);

        _divDropdown.Clear();
        foreach (var d in Divisions.All) _divDropdown.AddItem(d.Code);
        // Default selection = current.
        var idx = Divisions.All.ToList().FindIndex(d => d.Code == GameState.Instance.CurrentDivision.Code);
        if (idx >= 0) _divDropdown.Selected = idx;
    }

    private void PopulateToolOption()
    {
        _toolOption.Clear();
        _toolOption.AddItem("Engage (drop position)");
        _toolOption.AddItem("Add shots to target");
        _toolOption.AddItem("Move (path to position)");
        _toolOption.AddItem("Reload");
        _toolOption.AddItem("Erase last step");
    }

    // ── Input ───────────────────────────────────────────────────────────────

    public override void _GuiInput(InputEvent ev)
    {
        switch (ev)
        {
            case InputEventMouseButton mb when mb.ButtonIndex == MouseButton.Left:
                if (mb.Pressed) StartDown(mb.Position);
                else EndUp(mb.Position);
                AcceptEvent(); break;

            case InputEventMouseButton mb when mb.ButtonIndex is MouseButton.Right or MouseButton.Middle:
                if (mb.Pressed) { _panning = true; _panStartMouse = mb.Position; _panStartWorldPos = _world.Position; }
                else _panning = false;
                AcceptEvent(); break;

            case InputEventMouseButton mb when mb.ButtonIndex is MouseButton.WheelUp or MouseButton.WheelDown:
                if (mb.Pressed)
                {
                    float factor = mb.ButtonIndex == MouseButton.WheelUp ? 1.15f : 1f / 1.15f;
                    ZoomAround(mb.Position, factor);
                    AcceptEvent();
                }
                break;

            case InputEventMouseMotion mm:
                if (_panning) _world.Position = _panStartWorldPos + (mm.Position - _panStartMouse);
                else if (_possibleTap && (mm.Position - _downPos).Length() > 8f) _possibleTap = false;
                break;

            case InputEventScreenTouch st:
                HandleTouch(st); AcceptEvent(); break;

            case InputEventScreenDrag sd:
                HandleDrag(sd); AcceptEvent(); break;
        }
    }

    private void StartDown(Vector2 pos)
    {
        _downPos = pos;
        _possibleTap = true;
    }

    private void EndUp(Vector2 pos)
    {
        if (_possibleTap) HandleTap(pos);
        _possibleTap = false;
    }

    private void HandleTouch(InputEventScreenTouch st)
    {
        if (st.Pressed)
        {
            _touches[st.Index] = st.Position;
            if (_touches.Count == 1) StartDown(st.Position);
            else if (_touches.Count == 2)
            {
                _possibleTap = false;
                var pts = _touches.Values.ToArray();
                _pinchStartDist  = pts[0].DistanceTo(pts[1]);
                _pinchStartScale = _world.Scale.X;
                _panStartMouse   = (pts[0] + pts[1]) * 0.5f;
                _panStartWorldPos = _world.Position;
            }
        }
        else
        {
            _touches.Remove(st.Index);
            if (_touches.Count == 0) EndUp(st.Position);
            if (_touches.Count < 2) _pinchStartDist = null;
        }
    }

    private void HandleDrag(InputEventScreenDrag sd)
    {
        _touches[sd.Index] = sd.Position;
        if (_touches.Count == 1)
        {
            // Treat as pan only after a small threshold (handled in _possibleTap).
            if (!_possibleTap)
                _world.Position += sd.Relative;
        }
        else if (_touches.Count == 2 && _pinchStartDist is float startDist)
        {
            var pts = _touches.Values.ToArray();
            float dist = pts[0].DistanceTo(pts[1]);
            float factor = dist / Mathf.Max(1f, startDist);
            float newScale = Mathf.Clamp(_pinchStartScale * factor, 10f, 300f);
            var center = (pts[0] + pts[1]) * 0.5f;
            ScaleAround(center, newScale);
            // Update so progressive pinch works.
            _pinchStartDist  = dist;
            _pinchStartScale = newScale;
        }
    }

    private void ZoomAround(Vector2 screenPos, float factor)
    {
        float newScale = Mathf.Clamp(_world.Scale.X * factor, 10f, 300f);
        ScaleAround(screenPos, newScale);
    }

    private void ScaleAround(Vector2 screenPos, float newScale)
    {
        // Keep the point under screenPos stationary in world-space.
        var worldPt = (screenPos - _world.Position) / _world.Scale.X;
        _world.Scale = new Vector2(newScale, newScale);
        _world.Position = screenPos - worldPt * newScale;
    }

    private void HandleTap(Vector2 screenPos)
    {
        // Convert screen → world (meters). Planner is the parent of World.
        var worldMeters = (screenPos - _world.Position) / _world.Scale.X;
        ApplyTool(worldMeters);
    }

    // ── Tool application ────────────────────────────────────────────────────

    private void ApplyTool(Vector2 worldMeters)
    {
        var gs = GameState.Instance;
        switch (_tool)
        {
            case Tool.Engage:
            {
                var step = new PlanStep
                {
                    Id = gs.Steps.Count + 1,
                    Kind = PlanStepKind.Engage,
                    Position = new Vec2(worldMeters.X, worldMeters.Y),
                    Engagements = Array.Empty<Engagement>(),
                };
                gs.AddStep(step);
                break;
            }
            case Tool.EngageTarget:
            {
                int? tid = _view.HitTestTarget(worldMeters);
                if (tid is null) { Flash("Tap a target to add shots."); return; }
                var last = gs.LastEngage();
                if (last is null) { Flash("Drop an engage position first."); return; }
                var list = (last.Engagements ?? Array.Empty<Engagement>()).ToList();
                // If we already have this target, +1 shot; else add new with 2.
                int idx = list.FindIndex(e => e.TargetId == tid);
                if (idx >= 0)
                    list[idx].ShotCount += 1;
                else
                    list.Add(new Engagement { TargetId = tid.Value, ShotCount = 2, Aim = HitZone.A });
                last.Engagements = list.ToArray();
                gs.EmitSignal(GameState.SignalName.PlanChanged);
                break;
            }
            case Tool.Move:
            {
                var from = gs.LastPosition();
                var step = new PlanStep
                {
                    Id = gs.Steps.Count + 1,
                    Kind = PlanStepKind.Move,
                    From = from,
                    To   = new Vec2(worldMeters.X, worldMeters.Y),
                    IntendedSpeed = _intendedSpeed,
                };
                gs.AddStep(step);
                break;
            }
            case Tool.Reload:
            {
                gs.AddStep(new PlanStep
                {
                    Id = gs.Steps.Count + 1,
                    Kind = PlanStepKind.Reload,
                    AtPosition = gs.LastPosition(),
                });
                break;
            }
            case Tool.Erase:
                gs.RemoveLastStep();
                break;
        }
    }

    private void Flash(string msg) => _warningsLabel.Text = msg;

    // ── Side-panel callbacks ───────────────────────────────────────────────

    private void OnStageSelected(long idx)
    {
        var id = StageLoader.BuiltinIds[(int)idx];
        GameState.Instance.SetStage(id);
    }

    private void OnDivisionSelected(long idx)
    {
        GameState.Instance.CurrentDivision = Divisions.All[(int)idx];
        ScheduleEstimate();
    }

    private void OnSpeedChanged(double v)
    {
        _intendedSpeed = (float)v;
        _speedValueLabel.Text = $"Speed: {v:F2}";
        // Update the most-recent Move step in-place so the slider feels live.
        var gs = GameState.Instance;
        for (int i = gs.Steps.Count - 1; i >= 0; i--)
            if (gs.Steps[i].Kind == PlanStepKind.Move)
            { gs.Steps[i].IntendedSpeed = _intendedSpeed; gs.EmitSignal(GameState.SignalName.PlanChanged); break; }
    }

    private void OnUndo()  => GameState.Instance.RemoveLastStep();
    private void OnClear() => GameState.Instance.ClearSteps();
    private void OnRun()   => ScheduleEstimate(force: true);

    // ── Live HF ────────────────────────────────────────────────────────────

    private void OnPlanChanged()
    {
        RefreshStepsList();
        ScheduleEstimate();
    }

    private void RefreshStepsList()
    {
        _stepsList.Clear();
        int i = 0;
        foreach (var s in GameState.Instance.Steps)
        {
            i++;
            string label = s.Kind switch
            {
                PlanStepKind.Move    => $"{i:D2} MOVE  {Fmt(s.From)} → {Fmt(s.To)}  s={s.IntendedSpeed:F2}",
                PlanStepKind.Engage  => $"{i:D2} ENGAGE @ {Fmt(s.Position)}  [{EngStr(s.Engagements)}]",
                PlanStepKind.Reload  => $"{i:D2} RELOAD @ {Fmt(s.AtPosition)}",
                _ => $"{i:D2} ?"
            };
            _stepsList.AddItem(label);
        }
    }
    private static string Fmt(Vec2? p) => p is null ? "—" : $"({p.X:F1},{p.Y:F1})";
    private static string EngStr(Engagement[]? e) =>
        e is null || e.Length == 0 ? "no shots"
        : string.Join(",", e.Select(x => $"T{x.TargetId}x{x.ShotCount}"));

    private void ScheduleEstimate(bool force = false)
    {
        if (_estimating) { _estimateDirty = true; return; }
        if (!force && GameState.Instance.Steps.Count == 0)
        {
            _hfLabel.Text = "HF: —";
            _warningsLabel.Text = "Drop an engage position to start.";
            return;
        }
        _ = RunEstimate();
    }

    private async System.Threading.Tasks.Task RunEstimate()
    {
        _estimating = true;
        _estimateDirty = false;
        _hfLabel.Text = "HF: …";
        var gs = GameState.Instance;
        var plan = gs.BuildPlan(gs.PreviewSeed);
        try
        {
            var r = await _hf.EstimateAsync(gs.CurrentStage, plan, gs.CurrentDivision, seeds: 10);
            _hfLabel.Text = $"HF {r.MeanHf:F2}  ({r.Worst:F2}–{r.Best:F2})";
            var sb = new StringBuilder();
            sb.AppendLine($"Miss rate: {r.MissRate * 100:F1}%   Forced reloads: {r.ForcedReloads}");
            foreach (var e in r.FirstErrors.Take(3)) sb.AppendLine("• " + e);
            _warningsLabel.Text = sb.ToString();
        }
        catch (OperationCanceledException) { /* ignore */ }
        catch (Exception ex) { _warningsLabel.Text = "Sim error: " + ex.Message; }
        finally
        {
            _estimating = false;
            if (_estimateDirty) _ = RunEstimate();
        }
    }

    // ── View helpers ───────────────────────────────────────────────────────

    private void CenterStage()
    {
        var stage = GameState.Instance.CurrentStage;
        if (stage is null) return;
        var size = GetRect().Size;
        // Fit stage into the viewport (with the right panel ~ 340 px reserved).
        float availW = Mathf.Max(100f, size.X - 360f);
        float availH = Mathf.Max(100f, size.Y - 60f);
        float scale = Mathf.Min(availW / (float)stage.BoundsW, availH / (float)stage.BoundsH);
        scale = Mathf.Clamp(scale, 15f, 200f);
        _world.Scale = new Vector2(scale, scale);
        _world.Position = new Vector2(
            (availW - (float)stage.BoundsW * scale) * 0.5f + 10f,
            (availH - (float)stage.BoundsH * scale) * 0.5f + 50f);
    }
}

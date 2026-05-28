namespace IpscSim.Core;

/// <summary>
/// Deterministic event-driven simulator.
///
/// Walks the plan in order, updating clock and mag state. Auto-inserts a
/// forced reload event whenever a fire would occur with rounds=0 and no
/// planned ReloadStep is queued. Emits a Shot per round fired, then applies
/// FTN penalties for any target that did not receive its required number of
/// scoring hits.
///
/// Determinism: all randomness flows through <see cref="Prng"/> seeded by
/// <see cref="Plan.Seed"/>. Same inputs ⇒ byte-equal RunResult across
/// platforms.
/// </summary>
public static class SimEngine
{
    public const string Version = "1.0.0";

    public static RunResult Run(Stage stage, Plan plan, Division division)
    {
        var shots = new List<Shot>();
        var forcedReloads = new List<int>();
        var planningErrors = new List<string>();
        var prng = new Prng(plan.Seed);

        double t = 0;
        int rounds = division.StartLoaded ? division.MagCapacity : 0;
        double arrivalSpeedNorm = 0; // last move's intended speed (0..1)
        double tArrival = 0;
        Vec2? lastEngagePos = null;

        var targets = stage.Targets.ToDictionary(x => x.Id);
        var hitsByTarget = new Dictionary<int, int>();

        foreach (var step in plan.Steps)
        {
            switch (step.Kind)
            {
                case PlanStepKind.Move:
                {
                    if (step.From is null || step.To is null)
                    {
                        planningErrors.Add($"step {step.Id}: move missing endpoints");
                        continue;
                    }
                    double dx = step.To.X - step.From.X;
                    double dy = step.To.Y - step.From.Y;
                    double dist = Math.Sqrt(dx * dx + dy * dy);
                    double speed = Stability.IntendedToSpeed(step.IntendedSpeed);
                    t += dist / Math.Max(speed, 0.01);
                    arrivalSpeedNorm = Math.Clamp(step.IntendedSpeed, 0, 1);
                    tArrival = t;
                    break;
                }

                case PlanStepKind.Reload:
                {
                    t += division.ReloadTimeSeconds;
                    rounds = division.MagCapacity;
                    // A static reload re-grounds the shooter; next engage = first shot.
                    tArrival = t;
                    break;
                }

                case PlanStepKind.Engage:
                {
                    if (step.Position is null || step.Engagements is null)
                    {
                        planningErrors.Add($"step {step.Id}: engage missing data");
                        continue;
                    }

                    // First shot at this position triggers the stabilization delay.
                    // Re-engaging the same position back-to-back keeps the carryover.
                    bool firstShotAtPos = !ReferenceEquals(lastEngagePos, step.Position)
                                          && !PoseEqual(lastEngagePos, step.Position);
                    lastEngagePos = step.Position;

                    foreach (var eng in step.Engagements)
                    {
                        if (!targets.TryGetValue(eng.TargetId, out var tgt))
                        {
                            planningErrors.Add($"step {step.Id}: unknown target {eng.TargetId}");
                            continue;
                        }
                        double tdx = tgt.Pose.X - step.Position.X;
                        double tdy = tgt.Pose.Y - step.Position.Y;
                        double dist = Math.Sqrt(tdx * tdx + tdy * tdy);

                        for (int i = 0; i < eng.ShotCount; i++)
                        {
                            bool forcedShot = false;
                            if (rounds <= 0)
                            {
                                // Forced reload: planning error.
                                t += division.ReloadTimeSeconds;
                                rounds = division.MagCapacity;
                                forcedReloads.Add(step.Id);
                                planningErrors.Add(
                                    $"step {step.Id}: forced reload (planned reload missing)");
                                tArrival = t;       // re-ground after reload
                                firstShotAtPos = true;
                                forcedShot = true;
                            }

                            // Timing
                            if (firstShotAtPos)
                            {
                                t += Stability.StabDelay(arrivalSpeedNorm);
                                firstShotAtPos = false;
                            }
                            else
                            {
                                t += Stability.TSplitBase;
                            }

                            double sinceArrival = t - tArrival;
                            double sigma = Stability.Sigma(sinceArrival, arrivalSpeedNorm, dist);

                            double ex = prng.NextGaussian() * sigma;
                            double ey = prng.NextGaussian() * sigma;

                            HitZone zone = tgt.Kind switch
                            {
                                TargetKind.PaperIpsc => Geometry.ResolvePaper(ex, ey),
                                TargetKind.NoShoot =>
                                    Geometry.ResolvePaper(ex, ey) == HitZone.Miss
                                        ? HitZone.Miss
                                        : HitZone.NoShoot,
                                TargetKind.Popper =>
                                    Geometry.ResolveSteel(ex, ey, Geometry.PopperRadius),
                                TargetKind.MiniPopper =>
                                    Geometry.ResolveSteel(ex, ey, Geometry.MiniPopperRadius),
                                TargetKind.Plate =>
                                    Geometry.ResolveSteel(ex, ey, Geometry.PlateRadius),
                                _ => HitZone.Miss,
                            };
                            int pts = Scoring.PointsFor(zone, division.PowerFactor);

                            shots.Add(new Shot
                            {
                                T = Math.Round(t, 4),
                                TargetId = tgt.Id,
                                Zone = zone,
                                ImpactX = Math.Round(ex, 5),
                                ImpactY = Math.Round(ey, 5),
                                Points = pts,
                                Forced = forcedShot,
                            });

                            rounds--;

                            if (zone == HitZone.A || zone == HitZone.C || zone == HitZone.D)
                            {
                                hitsByTarget[tgt.Id] = hitsByTarget.GetValueOrDefault(tgt.Id) + 1;
                            }
                        }
                    }
                    break;
                }
            }
        }

        // FTN: shots that should have been fired but weren't (per-target shortfall).
        int ftnPenalty = 0;
        foreach (var tgt in stage.Targets)
        {
            if (tgt.Kind == TargetKind.NoShoot) continue;
            int got = hitsByTarget.GetValueOrDefault(tgt.Id);
            if (got < tgt.RequiredHits)
            {
                int missing = tgt.RequiredHits - got;
                ftnPenalty += missing * Scoring.FtnPenalty;
                planningErrors.Add($"target {tgt.Id}: only {got}/{tgt.RequiredHits} scoring hits");
            }
        }

        int rawPoints = 0;
        foreach (var s in shots) rawPoints += s.Points;
        int totalPoints = Math.Max(0, rawPoints + ftnPenalty);
        double hf = Scoring.HitFactor(totalPoints, t);

        return new RunResult
        {
            Shots = shots.ToArray(),
            TotalTime = Math.Round(t, 4),
            TotalPoints = totalPoints,
            HitFactor = Math.Round(hf, 4),
            ForcedReloadStepIds = forcedReloads.ToArray(),
            PlanningErrors = planningErrors.ToArray(),
            EngineVersion = Version,
        };
    }

    private static bool PoseEqual(Vec2? a, Vec2? b)
    {
        if (a is null || b is null) return false;
        return a.X == b.X && a.Y == b.Y;
    }
}

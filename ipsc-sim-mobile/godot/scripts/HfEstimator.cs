using System.Threading;
using System.Threading.Tasks;
using IpscSim.Core;

namespace IpscSim.Mobile;

/// <summary>
/// Runs the sim N times with different seeds on a background task so the
/// UI thread stays responsive. Returns mean HF + miss rate. Cancels any
/// in-flight estimate when a new request comes in.
/// </summary>
public sealed class HfEstimator
{
    private CancellationTokenSource? _cts;

    public sealed record EstimateResult(
        double MeanHf, double Best, double Worst,
        double MissRate, int ForcedReloads, string[] FirstErrors);

    public async Task<EstimateResult> EstimateAsync(
        Stage stage, Plan basePlan, Division division, int seeds = 12)
    {
        _cts?.Cancel();
        _cts = new CancellationTokenSource();
        var ct = _cts.Token;
        return await Task.Run(() =>
        {
            double sum = 0, best = 0, worst = double.MaxValue;
            int totalShots = 0, totalMisses = 0, totalForced = 0;
            string[]? firstErrs = null;

            for (int i = 0; i < seeds; i++)
            {
                ct.ThrowIfCancellationRequested();
                var plan = new Plan
                {
                    StageId = basePlan.StageId,
                    DivisionCode = basePlan.DivisionCode,
                    Seed = basePlan.Seed ^ (ulong)(0x9E3779B97F4A7C15ul * (ulong)(i + 1)),
                    Steps = basePlan.Steps,
                };
                var r = SimEngine.Run(stage, plan, division);
                sum += r.HitFactor;
                if (r.HitFactor > best) best = r.HitFactor;
                if (r.HitFactor < worst) worst = r.HitFactor;
                foreach (var s in r.Shots)
                {
                    totalShots++;
                    if (s.Zone == HitZone.Miss) totalMisses++;
                }
                totalForced += r.ForcedReloadStepIds.Length;
                if (i == 0) firstErrs = r.PlanningErrors;
            }
            return new EstimateResult(
                MeanHf: seeds > 0 ? sum / seeds : 0,
                Best: best,
                Worst: worst == double.MaxValue ? 0 : worst,
                MissRate: totalShots > 0 ? (double)totalMisses / totalShots : 0,
                ForcedReloads: totalForced,
                FirstErrors: firstErrs ?? System.Array.Empty<string>());
        }, ct);
    }
}

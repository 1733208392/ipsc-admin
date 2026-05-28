using IpscSim.Core;

namespace IpscSim.Core.Tests;

public class StabilityTests
{
    [Fact]
    public void StabDelay_IsMonotonicInSpeed()
    {
        double prev = -1;
        for (double s = 0; s <= 1.0; s += 0.1)
        {
            double d = Stability.StabDelay(s);
            Assert.True(d >= prev, $"stab delay must be non-decreasing in speed (s={s})");
            prev = d;
        }
    }

    [Fact]
    public void Sigma_IsMonotonicInSpeedAtArrival()
    {
        double prev = -1;
        for (double s = 0; s <= 1.0; s += 0.1)
        {
            double sigma = Stability.Sigma(tSinceArrival: 0, arrivalSpeedNorm: s, distance: 10);
            Assert.True(sigma >= prev, $"sigma must be non-decreasing in arrival speed (s={s})");
            prev = sigma;
        }
    }

    [Fact]
    public void Sigma_DecaysAfterArrival()
    {
        double early = Stability.Sigma(tSinceArrival: 0.0, arrivalSpeedNorm: 1.0, distance: 10);
        double later = Stability.Sigma(tSinceArrival: 2.0, arrivalSpeedNorm: 1.0, distance: 10);
        Assert.True(later < early);
    }

    [Fact]
    public void IntendedToSpeed_MapsExtremes()
    {
        Assert.Equal(Stability.VMin, Stability.IntendedToSpeed(0));
        Assert.Equal(Stability.VMax, Stability.IntendedToSpeed(1));
    }
}

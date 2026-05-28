using IpscSim.Core;

namespace IpscSim.Core.Tests;

public class ScoringTests
{
    [Theory]
    [InlineData(HitZone.A, PowerFactor.Major, 5)]
    [InlineData(HitZone.A, PowerFactor.Minor, 5)]
    [InlineData(HitZone.C, PowerFactor.Major, 4)]
    [InlineData(HitZone.C, PowerFactor.Minor, 3)]
    [InlineData(HitZone.D, PowerFactor.Major, 2)]
    [InlineData(HitZone.D, PowerFactor.Minor, 1)]
    [InlineData(HitZone.Miss, PowerFactor.Major, -10)]
    [InlineData(HitZone.NoShoot, PowerFactor.Minor, -10)]
    public void Points_TableMatchesIpsc(HitZone z, PowerFactor pf, int expected)
    {
        Assert.Equal(expected, Scoring.PointsFor(z, pf));
    }

    [Fact]
    public void HitFactor_ZeroTime_ReturnsZero()
    {
        Assert.Equal(0, Scoring.HitFactor(60, 0));
    }

    [Fact]
    public void HitFactor_NegativePoints_ClampedToZero()
    {
        Assert.Equal(0, Scoring.HitFactor(-30, 5.0));
    }

    [Fact]
    public void HitFactor_KnownValue()
    {
        // 60 points over 12 seconds = 5.0 HF
        Assert.Equal(5.0, Scoring.HitFactor(60, 12.0), precision: 4);
    }

    [Fact]
    public void Geometry_PaperZones_BoundariesCorrect()
    {
        Assert.Equal(HitZone.A, Geometry.ResolvePaper(0, 0));
        Assert.Equal(HitZone.A, Geometry.ResolvePaper(0.07, 0.10));
        Assert.Equal(HitZone.C, Geometry.ResolvePaper(0.10, 0.20));
        Assert.Equal(HitZone.D, Geometry.ResolvePaper(0.20, 0.35));
        Assert.Equal(HitZone.Miss, Geometry.ResolvePaper(0.30, 0.50));
    }
}

namespace IpscSim.Core;

/// <summary>
/// Mulberry32 deterministic PRNG. 32-bit state, identical output across
/// platforms — required for server-side re-simulation parity.
/// </summary>
public sealed class Prng
{
    private uint _state;

    public Prng(ulong seed)
    {
        unchecked
        {
            _state = (uint)(seed ^ (seed >> 32));
            if (_state == 0) _state = 0x9E3779B9u;
        }
    }

    public uint NextU32()
    {
        unchecked
        {
            _state += 0x6D2B79F5u;
            uint t = _state;
            t = (t ^ (t >> 15)) * (t | 1u);
            t ^= t + ((t ^ (t >> 7)) * (t | 61u));
            return t ^ (t >> 14);
        }
    }

    /// <summary>Uniform double in [0, 1).</summary>
    public double NextDouble() => (NextU32() >> 8) * (1.0 / (1u << 24));

    /// <summary>Standard normal sample via Box–Muller.</summary>
    public double NextGaussian()
    {
        double u1 = Math.Max(NextDouble(), 1e-12);
        double u2 = NextDouble();
        return Math.Sqrt(-2.0 * Math.Log(u1)) * Math.Cos(2.0 * Math.PI * u2);
    }
}

using System.Text.Json;
using IpscSim.Core;

namespace IpscSim.Runner;

/// <summary>
/// Long-running stdio bridge. Reads one JSON request per line on stdin,
/// writes one JSON response per line on stdout. Used by the Node server
/// (see ../sim-bridge.ts) for server-side re-simulation / anti-cheat.
///
/// Request:  { "stage": {...}, "plan": {...}, "division": {...} }
/// Response: { "ok": true,  "result": {...RunResult...} }
///        or { "ok": false, "error":  "message" }
/// </summary>
public sealed class Program
{
    public sealed class SimRequest
    {
        public Stage Stage { get; set; } = new();
        public Plan Plan { get; set; } = new();
        public Division Division { get; set; } = new();
    }

    public static int Main(string[] args)
    {
        // One-shot mode: `ipsc-sim-runner --once < req.json`
        if (args.Length > 0 && args[0] == "--once")
        {
            string body = Console.In.ReadToEnd();
            HandleAndWrite(body);
            return 0;
        }

        // Long-running JSON-line mode.
        string? line;
        while ((line = Console.In.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            HandleAndWrite(line);
        }
        return 0;
    }

    private static void HandleAndWrite(string json)
    {
        try
        {
            var req = JsonSerializer.Deserialize<SimRequest>(json, SimJson.Compact)
                      ?? throw new InvalidOperationException("null request");
            var result = SimEngine.Run(req.Stage, req.Plan, req.Division);
            var resp = new { ok = true, result };
            Console.Out.WriteLine(JsonSerializer.Serialize(resp, SimJson.Compact));
        }
        catch (Exception ex)
        {
            var resp = new { ok = false, error = ex.Message };
            Console.Out.WriteLine(JsonSerializer.Serialize(resp, SimJson.Compact));
        }
        Console.Out.Flush();
    }
}

using Godot;
using IpscSim.Core;

namespace IpscSim.Mobile;

/// <summary>
/// Loads builtin stage JSON files shipped under res://stages/.
/// </summary>
public static class StageLoader
{
    public static Stage LoadBuiltin(string id)
    {
        string path = $"res://stages/{id}.json";
        using var f = Godot.FileAccess.Open(path, Godot.FileAccess.ModeFlags.Read);
        if (f is null) throw new System.IO.FileNotFoundException(path);
        string json = f.GetAsText();
        return SimJson.Deserialize<Stage>(json);
    }

    public static readonly string[] BuiltinIds = new[]
    {
        "el-presidente", "smoke-and-hope", "field-course-24",
    };
}

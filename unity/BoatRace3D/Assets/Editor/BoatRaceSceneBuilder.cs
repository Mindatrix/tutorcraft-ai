#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

// Menu: TutorCraft > Build Boat Race Scene   (runs automatically once on first open)
//       TutorCraft > Build WebGL (to web app public/unity/boatrace)
public static class BoatRaceSceneBuilder
{
    const string ScenePath = "Assets/Scenes/BoatRace.unity";

    [InitializeOnLoadMethod]
    static void AutoBuild()
    {
        EditorApplication.delayCall += () =>
        {
            if (!File.Exists(ScenePath) && !EditorApplication.isPlayingOrWillChangePlaymode) BuildScene();
        };
    }

    static Material Mat(string name, Color c, float smooth = 0.25f)
    {
        Directory.CreateDirectory("Assets/Materials");
        string path = "Assets/Materials/" + name + ".mat";
        var m = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (m == null)
        {
            m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            AssetDatabase.CreateAsset(m, path);
        }
        m.SetColor("_BaseColor", c);
        m.SetFloat("_Smoothness", smooth);
        EditorUtility.SetDirty(m);
        return m;
    }

    static GameObject Prim(PrimitiveType t, string name, Transform parent, Vector3 pos, Vector3 scale, Material m)
    {
        var go = GameObject.CreatePrimitive(t);
        go.name = name;
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = m;
        Object.DestroyImmediate(go.GetComponent<Collider>());
        return go;
    }

    static Transform MakeBoat(string name, Vector3 pos, Material hull, Material trim, Material seat, Material skin, Material hair, Material shirt, bool robot, out Transform rower)
    {
        var boat = new GameObject(name).transform;
        boat.position = pos;
        Prim(PrimitiveType.Cube, "Hull", boat, new Vector3(0, 0.1f, 0), new Vector3(2.4f, 0.35f, 0.9f), hull);
        Prim(PrimitiveType.Cube, "Trim", boat, new Vector3(0, 0.3f, 0), new Vector3(2.42f, 0.08f, 0.92f), trim);
        var bow = Prim(PrimitiveType.Cube, "Bow", boat, new Vector3(1.35f, 0.14f, 0), new Vector3(0.7f, 0.3f, 0.6f), hull);
        bow.transform.localRotation = Quaternion.Euler(0, 45f, 0);
        Prim(PrimitiveType.Cube, "Seat", boat, new Vector3(-0.1f, 0.34f, 0), new Vector3(0.5f, 0.06f, 0.8f), seat);

        rower = new GameObject("Rower").transform;
        rower.SetParent(boat, false);
        rower.localPosition = new Vector3(-0.1f, 0.4f, 0);
        Prim(PrimitiveType.Capsule, "Body", rower, new Vector3(0, 0.45f, 0), new Vector3(0.5f, 0.45f, 0.5f), shirt);
        var head = Prim(PrimitiveType.Sphere, "Head", rower, new Vector3(0.04f, 1.1f, 0), robot ? new Vector3(0.5f, 0.5f, 0.5f) : new Vector3(0.45f, 0.48f, 0.45f), skin);
        if (!robot) Prim(PrimitiveType.Sphere, "Hair", rower, new Vector3(0f, 1.2f, 0), new Vector3(0.5f, 0.35f, 0.5f), hair);
        else Prim(PrimitiveType.Cylinder, "Antenna", rower, new Vector3(0, 1.45f, 0), new Vector3(0.04f, 0.15f, 0.04f), hair);
        Prim(PrimitiveType.Cube, "ArmL", rower, new Vector3(0.28f, 0.55f, 0.3f), new Vector3(0.5f, 0.1f, 0.1f), shirt);
        Prim(PrimitiveType.Cube, "ArmR", rower, new Vector3(0.28f, 0.55f, -0.3f), new Vector3(0.5f, 0.1f, 0.1f), shirt);
        // Oars
        var oarMat = seat;
        var oarL = Prim(PrimitiveType.Cube, "OarL", boat, new Vector3(0.1f, 0.5f, 0.85f), new Vector3(0.08f, 0.04f, 1.5f), oarMat);
        oarL.transform.localRotation = Quaternion.Euler(0, 15f, 0);
        var oarR = Prim(PrimitiveType.Cube, "OarR", boat, new Vector3(0.1f, 0.5f, -0.85f), new Vector3(0.08f, 0.04f, 1.5f), oarMat);
        oarR.transform.localRotation = Quaternion.Euler(0, -15f, 0);
        return boat;
    }

    static Mesh WaterGrid(int nx, int nz, float w, float d)
    {
        var verts = new Vector3[(nx + 1) * (nz + 1)];
        var tris = new int[nx * nz * 6];
        for (int z = 0, i = 0; z <= nz; z++)
            for (int x = 0; x <= nx; x++, i++)
                verts[i] = new Vector3((x / (float)nx - 0.5f) * w, 0, (z / (float)nz - 0.5f) * d);
        for (int z = 0, ti = 0, vi = 0; z < nz; z++, vi++)
            for (int x = 0; x < nx; x++, ti += 6, vi++)
            {
                tris[ti] = vi; tris[ti + 1] = vi + nx + 1; tris[ti + 2] = vi + 1;
                tris[ti + 3] = vi + 1; tris[ti + 4] = vi + nx + 1; tris[ti + 5] = vi + nx + 2;
            }
        var m = new Mesh { name = "WaterGrid", vertices = verts, triangles = tris };
        m.RecalculateNormals();
        return m;
    }

    [MenuItem("TutorCraft/Build Boat Race Scene")]
    public static void BuildScene()
    {
        Directory.CreateDirectory("Assets/Scenes");
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        RenderSettings.skybox = null;
        RenderSettings.ambientMode = AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.62f, 0.74f, 0.86f);
        RenderSettings.fog = true;
        RenderSettings.fogColor = new Color(0.56f, 0.80f, 0.96f);
        RenderSettings.fogMode = FogMode.Linear;
        RenderSettings.fogStartDistance = 24;
        RenderSettings.fogEndDistance = 46;

        var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
        var cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.56f, 0.80f, 0.96f);
        cam.fieldOfView = 42;
        camGo.transform.position = new Vector3(0, 4.2f, -11.5f);
        camGo.transform.LookAt(new Vector3(0, 0.8f, 0));
        camGo.AddComponent<AudioListener>();

        var sunGo = new GameObject("Sun");
        var sun = sunGo.AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.color = new Color(1f, 0.95f, 0.82f);
        sun.intensity = 1.4f;
        sunGo.transform.rotation = Quaternion.Euler(50, 150, 0);

        var water = new GameObject("Water");
        var mf = water.AddComponent<MeshFilter>();
        mf.sharedMesh = WaterGrid(40, 8, 40, 7);
        water.AddComponent<MeshRenderer>().sharedMaterial = Mat("Water", new Color(0.12f, 0.50f, 0.76f), 0.6f);

        var grass = Mat("Grass", new Color(0.31f, 0.54f, 0.23f), 0.05f);
        foreach (float z in new[] { 4.2f, -4.2f })
            Prim(PrimitiveType.Cube, "Bank", null, new Vector3(0, 0.05f, z), new Vector3(40, 0.5f, 1.6f), grass);

        // Finish gate
        var white = Mat("White", Color.white, 0.2f);
        float fx = -8f + 16f + 1.6f;
        foreach (float z in new[] { -2.6f, 2.6f })
            Prim(PrimitiveType.Cylinder, "Pole", null, new Vector3(fx, 1.1f, z), new Vector3(0.12f, 1.1f, 0.12f), white);
        var flag = Prim(PrimitiveType.Cube, "FinishFlag", null, new Vector3(fx, 2.0f, 0), new Vector3(0.1f, 0.5f, 5.2f), Mat("Gold", new Color(0.98f, 0.8f, 0.08f), 0.3f));

        Transform pr, br;
        var player = MakeBoat("PlayerBoat", new Vector3(-8, 0, -1.5f), Mat("HullBlue", new Color(0.23f, 0.51f, 0.96f)), white, Mat("Wood", new Color(0.42f, 0.29f, 0.17f), 0.1f),
            Mat("Skin", new Color(0.88f, 0.71f, 0.54f)), Mat("HairDark", new Color(0.23f, 0.16f, 0.11f)), Mat("ShirtBlue", new Color(0.23f, 0.51f, 0.96f)), false, out pr);
        var bot = MakeBoat("BotBoat", new Vector3(-8, 0, 1.5f), Mat("HullOrange", new Color(0.92f, 0.35f, 0.05f)), Mat("TrimDark", new Color(0.12f, 0.16f, 0.22f)), Mat("Wood", new Color(0.42f, 0.29f, 0.17f), 0.1f),
            Mat("Metal", new Color(0.6f, 0.64f, 0.7f), 0.7f), Mat("Cyan", new Color(0.13f, 0.83f, 0.93f)), Mat("ShirtOrange", new Color(0.92f, 0.35f, 0.05f)), true, out br);

        var ctrl = new GameObject("RaceController").AddComponent<RaceController>();
        ctrl.playerBoat = player; ctrl.botBoat = bot; ctrl.playerRower = pr; ctrl.botRower = br;
        ctrl.water = mf; ctrl.finishFlag = flag.transform;

        EditorSceneManager.SaveScene(scene, ScenePath);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        AssetDatabase.SaveAssets();
        Debug.Log("TutorCraft: Boat Race scene built at " + ScenePath);
    }

    [MenuItem("TutorCraft/Build WebGL and Run (preview)")]
    public static void BuildWebGLAndRun() { BuildWebGLInternal(BuildOptions.AutoRunPlayer); }

    [MenuItem("TutorCraft/Build WebGL (to web app)")]
    public static void BuildWebGL() { BuildWebGLInternal(BuildOptions.None); }

    static void BuildWebGLInternal(BuildOptions opts)
    {
        if (!File.Exists(ScenePath)) BuildScene();
        string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../public/unity/boatrace"));
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled; // plain files: works on any static host
        PlayerSettings.WebGL.decompressionFallback = false;
        var report = BuildPipeline.BuildPlayer(new[] { ScenePath }, outDir, BuildTarget.WebGL, opts);
        Debug.Log("TutorCraft WebGL build: " + report.summary.result + " -> " + outDir);
    }
}
#endif

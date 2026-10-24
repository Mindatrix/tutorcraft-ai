using UnityEngine;

// Boat Race 3D. The web app decides the race (server-authoritative); this scene only draws it.
// From the page:  unityInstance.SendMessage("RaceController", "SetPositions", "0.4,0.3");   // player,bot in 0..1
//                 unityInstance.SendMessage("RaceController", "SetResult", "win|lose|draw");
public class RaceController : MonoBehaviour
{
    public Transform playerBoat;
    public Transform botBoat;
    public Transform playerRower;
    public Transform botRower;
    public MeshFilter water;
    public Transform finishFlag;
    public float trackStart = -8f;
    public float trackLength = 16f;
    public bool demoWhenIdle = true;

    float playerTarget, botTarget, playerNow, botNow, lastMessage = -100f;
    string result = "";
    Vector3[] baseVerts;
    Mesh waterMesh;
    float celebrate;

    void Awake()
    {
        if (water != null)
        {
            waterMesh = water.mesh;
            baseVerts = waterMesh.vertices;
        }
    }

    public void SetPositions(string csv)
    {
        var p = csv.Split(',');
        if (p.Length < 2) return;
        float a, b;
        if (float.TryParse(p[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out a)) playerTarget = Mathf.Clamp01(a);
        if (float.TryParse(p[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out b)) botTarget = Mathf.Clamp01(b);
        lastMessage = Time.time;
    }

    public void SetResult(string r) { result = r; celebrate = 0f; }

    void Update()
    {
        float t = Time.time;
        if (demoWhenIdle && t - lastMessage > 3f && result == "")
        {
            // Idle preview: two boats racing so the scene is never static.
            float loop = Mathf.Repeat(t * 0.06f, 1.2f);
            playerTarget = Mathf.Clamp01(loop * 0.95f);
            botTarget = Mathf.Clamp01(loop * 0.85f);
        }

        playerNow = Mathf.Lerp(playerNow, playerTarget, 1f - Mathf.Exp(-3f * Time.deltaTime));
        botNow = Mathf.Lerp(botNow, botTarget, 1f - Mathf.Exp(-3f * Time.deltaTime));

        Place(playerBoat, playerNow, 0f);
        Place(botBoat, botNow, 1.3f);

        Lean(playerRower, 0f);
        Lean(botRower, 1f);

        if (result == "win" && playerBoat != null)
        {
            celebrate += Time.deltaTime;
            playerBoat.position += Vector3.up * Mathf.Abs(Mathf.Sin(celebrate * 6f)) * 0.15f;
        }

        if (finishFlag != null) finishFlag.rotation = Quaternion.Euler(0f, Mathf.Sin(t * 2f) * 8f, 0f);

        if (waterMesh != null)
        {
            var v = new Vector3[baseVerts.Length];
            for (int i = 0; i < v.Length; i++)
            {
                var b = baseVerts[i];
                b.y = Mathf.Sin(t * 1.4f + b.x * 0.8f + b.z * 1.3f) * 0.06f;
                v[i] = b;
            }
            waterMesh.vertices = v;
            waterMesh.RecalculateNormals();
        }
    }

    void Place(Transform boat, float pos, float phase)
    {
        if (boat == null) return;
        float t = Time.time;
        var p = boat.position;
        p.x = trackStart + pos * trackLength;
        p.y = Mathf.Sin(t * 2.2f + phase) * 0.05f;
        boat.position = p;
        boat.rotation = Quaternion.Euler(0f, 0f, Mathf.Sin(t * 2.2f + phase + 0.4f) * 1.8f);
    }

    void Lean(Transform rower, float phase)
    {
        if (rower == null) return;
        rower.localRotation = Quaternion.Euler(0f, 0f, Mathf.Sin(Time.time * 5f + phase) * 7f);
    }
}

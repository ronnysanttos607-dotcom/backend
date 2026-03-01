    public static IEnumerator AuthenticateUser()
    {

        string text = string.Concat(new string[]
        {
            "{\"deviceId\":\"",
             King.deviceId,
            "\",\"country\":\"",
             King.country,
            "\",\"hash\":\"",
             King.hash,
            "\"}"
        });
        UnityWebRequest www = new UnityWebRequest(BackendUrl + "/user/login/", "POST");
        byte[] bytes = Encoding.UTF8.GetBytes(text);
        www.uploadHandler = new UploadHandlerRaw(bytes);
        www.downloadHandler = new DownloadHandlerBuffer();
        www.SetRequestHeader("Content-Type", "application/json");
        yield return www.SendWebRequest();
        JObject jobject = JObject.Parse(www.downloadHandler.text);
        if (jobject["banned"] != null && (bool)jobject["banned"])
        {
            MonoSingleton<PopupManager>.Instance.OpenPopup("BannedPopup", 0f);
            yield break;
        }
        User.Me.Username = (string)jobject["username"];
        User.Me.Country = (string)jobject["country"];
        User.Me.SkillRating = (int)jobject["trophys"];
        User.Me.Crowns = (int)jobject["crowns"];
        User.Me.Id = (int)jobject["id"];
        User.Me.Experience = (int)jobject["experience"];
        User.Me.Balances.Clear();
        User.Me.Balances.Add(new BackendBalance
        {
            Name = "gems",
            Amount = (int)(jobject["gems"] ?? 0)
        });
        User.Me.Balances.Add(new BackendBalance
        {
            Name = "coins",
            Amount = (int)(jobject["coins"] ?? 0)
        });
        PlayerPrefs.SetInt("USER_ID", User.Me.Id);
        yield break;
    }

    static King()
    {
    }

    [HarmonyPatch(typeof(Il2CppStumble.Initializer), "Awake")]
    public class Patch_Initializer_Awake
    {

        public static void Prefix(ref Il2CppStumble.Initializer __instance)
        {
            try
            {
                var env = __instance._runtimeConfiguration._environmentRuntimeConfiguration;
                env._backendHost = "https://backendtestexx.squareweb.app/";
                env._environmentId = "Stumble King";
                env._displayEnvironment = true;
            }
            catch (Exception) { }
        }
    }

    public static int userId;

    public static string BackendUrl = "https://backendtestexx.squareweb.app/";

    public static string hash = "VinAW5ATPxIZS3fe9OEqirN35SyOil4zMTgiHFAOfKkkamiTV0EqKjXroTSX96DWJFrT2DxVdKoQsgogE1kwRMrn-6aMBLYLbQv6i5N5y7bC5SajqSjHPzt8UJUqbZ8a";

    public static string deviceId = SystemInfo.deviceUniqueIdentifier;

    public static string country = new RegionInfo(CultureInfo.CurrentCulture.Name).TwoLetterISORegionName;

    public static int TourX;

    public static string username;

    public static bool authorized = false;

    public static float lastAuthTime = 0f;

    public static string CurrentMap = "";

}

-- Установите файл в garrysmod/addons/discord_bridge/lua/autorun/server/
-- Значения задаются в server.cfg; не храните секрет в публичном репозитории.

local apiUrl = CreateConVar("discord_bridge_url", "http://127.0.0.1:3000/api/v1/stats", FCVAR_PROTECTED, "Discord bot stats endpoint")
local apiSecret = CreateConVar("discord_bridge_secret", "", FCVAR_PROTECTED, "Discord bot API secret")
local serverId = CreateConVar("discord_bridge_server_id", "darkrp-1", FCVAR_PROTECTED, "Stable server identifier")
local serverName = CreateConVar("discord_bridge_server_name", "DarkRP #1", FCVAR_PROTECTED, "Displayed server name")
local interval = CreateConVar("discord_bridge_interval", "60", FCVAR_PROTECTED, "Upload interval in seconds", 15, 3600)

local function collectPlayer(ply)
    local money = 0
    if ply.getDarkRPVar then money = tonumber(ply:getDarkRPVar("money")) or 0 end

    -- UTime обычно хранит секунды в NWInt TotalUTime. Если у вас другая система,
    -- переопределите поля через hook DiscordBotCollectPlayerStats.
    local playtimeMinutes = math.floor((tonumber(ply:GetNWInt("TotalUTime", 0)) or 0) / 60)
    local row = {
        steamId64 = ply:SteamID64(),
        name = ply:Nick(),
        money = money,
        playtimeMinutes = playtimeMinutes,
        kills = math.max(0, ply:Frags())
    }
    hook.Run("DiscordBotCollectPlayerStats", ply, row)
    return row
end

local function upload()
    local secret = apiSecret:GetString()
    if secret == "" then
        print("[DiscordBridge] discord_bridge_secret is empty; upload skipped")
        return
    end

    local players = {}
    for _, ply in ipairs(player.GetHumans()) do
        if IsValid(ply) and ply:SteamID64() ~= "0" then table.insert(players, collectPlayer(ply)) end
    end

    local payload = util.TableToJSON({
        serverId = serverId:GetString(),
        serverName = serverName:GetString(),
        online = #players,
        maxPlayers = game.MaxPlayers(),
        players = players
    })

    HTTP({
        url = apiUrl:GetString(),
        method = "POST",
        headers = { ["Authorization"] = "Bearer " .. secret, ["Content-Type"] = "application/json" },
        type = "application/json; charset=utf-8",
        body = payload,
        success = function(code, body)
            if code < 200 or code >= 300 then print("[DiscordBridge] HTTP " .. code .. ": " .. tostring(body)) end
        end,
        failed = function(reason) print("[DiscordBridge] request failed: " .. tostring(reason)) end
    })
end

timer.Create("DiscordBridge.Upload", math.max(15, interval:GetInt()), 0, upload)
timer.Simple(5, upload)

cvars.AddChangeCallback("discord_bridge_interval", function(_, _, value)
    timer.Adjust("DiscordBridge.Upload", math.max(15, tonumber(value) or 60), 0, upload)
end, "DiscordBridge.Interval")

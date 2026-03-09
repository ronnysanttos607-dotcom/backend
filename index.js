require("dotenv").config();
const express = require("express");
const Console = require("./ConsoleUtils");
const CryptoUtils = require("./CryptoUtils");
const SharedUtils = require("./SharedUtils");
const dns = require("dns");
const { exec } = require("child_process");

const {
  BackendUtils,
  UserModel,
  UserController,
  RoundController,
  BattlePassController,
  EconomyController,
  AnalyticsController,
  FriendsController,
  NewsController,
  MissionsController,
  TournamentXController,
  MatchmakingController,
  TournamentController,
  SocialController,
  EventsController,
  authenticate,
  errorControll,
  sendShared,
  OnlineCheck,
  VerifyPhoton
} = require("./BackendUtils");

const app = express();
const Title = "Stumble Ranked Backend " + process.env.version;
const PORT = process.env.PORT || 3009;

//
// ✅ CONFIGURAÇÃO DNS ROBUSTA PARA MONGODB ATLAS
//
function setupDNS() {
  Console.log("DNS", "🔄 Configurando servidores DNS confiáveis...");
  
  // Configurar múltiplos servidores DNS confiáveis
  dns.setServers([
    "8.8.8.8",        // Google Primary
    "8.8.4.4",        // Google Secondary
    "1.1.1.1",        // Cloudflare Primary
    "1.0.0.1",        // Cloudflare Secondary
    "208.67.222.222", // OpenDNS Primary
    "208.67.220.220"  // OpenDNS Secondary
  ]);
  
  Console.log("DNS", "✅ Servidores DNS configurados");
}

//
// ✅ LIMPAR CACHE DNS COM RETRY E FEEDBACK
//
function clearDNSCache() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      Console.log("DNS", "🔄 Limpando cache DNS do Windows...");
      exec("ipconfig /flushdns", (error, stdout, stderr) => {
        if (error) {
          Console.warn("DNS", "⚠️ Não foi possível limpar cache DNS automaticamente");
          Console.warn("DNS", "Execute manualmente: ipconfig /flushdns");
        } else {
          Console.log("DNS", "✅ Cache DNS limpo com sucesso");
        }
        resolve();
      });
    } else {
      Console.log("DNS", "ℹ️ Limpeza de cache DNS não necessária neste SO");
      resolve();
    }
  });
}

//
// ✅ INICIALIZAÇÃO ROBUSTA DO SISTEMA
//
async function initializeSystem() {
  try {
    Console.log("System", "🚀 Iniciando sistema Stumble Ranked Backend...");
    
    // 1. Configurar DNS
    setupDNS();
    
    // 2. Limpar cache DNS
    await clearDNSCache();
    
    // 3. Aguardar um momento para DNS se estabilizar
    Console.log("System", "⏳ Aguardando estabilização do DNS...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    Console.log("System", "✅ Sistema inicializado com sucesso");
    
  } catch (error) {
    Console.error("System", "❌ Erro na inicialização:", error.message);
    throw error;
  }
}

app.use(express.json());
app.use(authenticate);

class CrownController {
  static async updateScore(req, res) {
    try {
      const { deviceid, username } = req.body;
      if (!deviceid || !username) {
        return res.status(400).json({ error: "Missing fields" });
      }

      let user = await UserModel.findByDeviceId(deviceid);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const newCrowns = (user.crowns || 0) + 1;
      await UserModel.update(user.stumbleId, { crowns: newCrowns });

      res.json({ success: true, crowns: newCrowns });
    } catch (err) {
      console.error("Error updating crowns:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async list(req, res) {
    try {
      const { country, start, count } = req.query;

      const data = await UserModel.GetHighscore(
        "crowns",
        country || "",
        start || 0,
        count || 50
      );

      res.json(data);
    } catch (err) {
      console.error("Error fetching crown highscores:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

app.post("/photon/auth", VerifyPhoton);
app.get("/onlinecheck", OnlineCheck);
app.get("/matchmaking/filter", MatchmakingController.getMatchmakingFilter);

app.post('/user/login', UserController.login);
app.get('/user/config', sendShared);
app.get('/usersettings', UserController.getSettings);
app.post('/user/updateusername', UserController.updateUsername);
app.get('/user/deleteaccount', UserController.deleteAccount);
app.post('/user/linkplatform', UserController.linkPlatform);
app.post('/user/unlinkplatform', UserController.unlinkPlatform);
app.get("/shared/:version/:type", sendShared);
app.post('/user/profile', UserController.getProfile);
app.post('/user-equipped-cosmetics/update', UserController.updateCosmetics);
app.post('/user/cosmetics/addskin', UserController.addSkin);
app.post('/user/cosmetics/setequipped', UserController.setEquippedCosmetic);

app.get('/round/finish/:round', RoundController.finishRound);
app.get('/round/finishv2/:round', RoundController.finishRound);
app.post('/round/finish/v4/:round', RoundController.finishRoundV4);
app.post('/round/eventfinish/v4/:round', RoundController.finishRoundV4);

app.get('/battlepass', BattlePassController.getBattlePass);
app.post('/battlepass/claimv3', BattlePassController.claimReward);
app.post('/battlepass/purchase', BattlePassController.purchaseBattlePass);
app.post('/battlepass/complete', BattlePassController.completeBattlePass);

app.get('/economy/purchase/:item', EconomyController.purchase); 
app.get('/economy/purchasegasha/:itemId/:count', EconomyController.purchaseGasha); 
app.get('/economy/purchaseluckyspin', EconomyController.purchaseLuckySpin); 
app.get('/economy/purchasedrop/:itemId/:count', EconomyController.purchaseLuckySpin); 
app.post('/economy/:currencyType/give/:amount', EconomyController.giveCurrency); 

app.get('/missions', MissionsController.getMissions);
app.post('/missions/:missionId/rewards/claim/v2', MissionsController.claimMissionReward);
app.post('/missions/objective/:objectiveId/:milestoneId/rewards/claim/v2', MissionsController.claimMilestoneReward);

app.post('/friends/request/accept', FriendsController.add);
app.delete('/friends/:UserId', FriendsController.remove);
app.get('/friends', FriendsController.list);
app.post('/friends/search', FriendsController.search);
app.post('/friends/request', FriendsController.request);
app.post('/friends/accept', FriendsController.accept);
app.post('/friends/request/decline', FriendsController.reject);
app.post('/friends/cancel', FriendsController.cancel);
app.get('/friends/request', FriendsController.pending);

app.get("/game-events/me", EventsController.getActive);
app.get("/news/getall", NewsController.GetNews);
app.post('/analytics', AnalyticsController.analytic);

app.post("/update-crown-score", CrownController.updateScore);
app.get("/highscore/crowns/list", CrownController.list);

// ✅ Endpoint para verificar se uma chave existe
app.get("/discord/verify-key/:key", async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({ error: "Chave é obrigatória" });
    }

    const upperKey = key.toUpperCase();
    global.linkingKeys = global.linkingKeys || new Map();
    const keyData = global.linkingKeys.get(upperKey);
    
    if (!keyData) {
      return res.json({
        success: false,
        message: "Chave não encontrada"
      });
    }
    
    // Verificar se expirou
    if (keyData.createdAt && (Date.now() - keyData.createdAt) > 10 * 60 * 1000) {
      global.linkingKeys.delete(upperKey);
      return res.json({
        success: false,
        message: "Chave expirada"
      });
    }
    
    res.json({
      success: true,
      userId: keyData.userId,
      createdAt: keyData.createdAt
    });
  } catch (error) {
    Console.error("Discord", "Erro ao verificar chave:", error);
    res.status(500).json({ error: "Erro ao verificar chave" });
  }
});

// ✅ Endpoint para remover uma chave
app.delete("/discord/remove-key/:key", async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({ error: "Chave é obrigatória" });
    }

    const upperKey = key.toUpperCase();
    global.linkingKeys = global.linkingKeys || new Map();
    const existed = global.linkingKeys.has(upperKey);
    global.linkingKeys.delete(upperKey);
    
    res.json({
      success: true,
      message: existed ? "Chave removida" : "Chave não existia",
      existed: existed
    });
  } catch (error) {
    Console.error("Discord", "Erro ao remover chave:", error);
    res.status(500).json({ error: "Erro ao remover chave" });
  }
});

// ✅ Endpoint para listar chaves ativas (debug)
app.get("/discord/list-keys", async (req, res) => {
  try {
    global.linkingKeys = global.linkingKeys || new Map();
    
    const keys = [];
    for (const [key, data] of global.linkingKeys.entries()) {
      const age = Date.now() - data.createdAt;
      const expired = age > 10 * 60 * 1000;
      
      keys.push({
        key: key,
        userId: data.userId,
        ageSeconds: Math.floor(age / 1000),
        expired: expired
      });
    }
    
    res.json({
      success: true,
      totalKeys: keys.length,
      keys: keys
    });
  } catch (error) {
    Console.error("Discord", "Erro ao listar chaves:", error);
    res.status(500).json({ error: "Erro ao listar chaves" });
  }
});

// ✅ Endpoints para o sistema MongoDB do SG PULSE
app.get("/health", async (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.post("/user/find", async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: "deviceId é obrigatório" });
    }
    
    const user = await UserModel.findByDeviceId(deviceId);
    
    if (user) {
      res.json({
        found: true,
        user: {
          id: user.id,
          username: user.username,
          deviceId: user.deviceId,
          country: user.country,
          gems: user.gems || 0,
          coins: user.coins || 0,
          crowns: user.crowns || 0,
          trophys: user.trophys || 0,
          experience: user.experience || 0,
          banned: user.banned || false,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    Console.error("User", "Erro ao buscar usuário:", error);
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

app.post("/user/create", async (req, res) => {
  try {
    const { deviceId, username, country, gems, coins, crowns, trophys, experience, banned } = req.body;
    
    if (!deviceId || !username) {
      return res.status(400).json({ error: "deviceId e username são obrigatórios" });
    }
    
    // Verificar se já existe
    const existingUser = await UserModel.findByDeviceId(deviceId);
    if (existingUser) {
      return res.status(400).json({ error: "Usuário já existe" });
    }
    
    // Criar novo usuário
    const newUser = await UserModel.create({
      username: username,
      deviceId: deviceId,
      country: country || "Unknown",
      gems: gems || 50000,
      coins: coins || 1000,
      crowns: crowns || 0,
      trophys: trophys || 0,
      experience: experience || 0,
      banned: banned || false
    });
    
    res.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        deviceId: newUser.deviceId,
        country: newUser.country,
        gems: newUser.gems,
        coins: newUser.coins,
        crowns: newUser.crowns,
        trophys: newUser.trophys,
        experience: newUser.experience,
        banned: newUser.banned,
        createdAt: newUser.createdAt,
        lastLogin: newUser.lastLogin
      }
    });
    
    Console.log("User", `Novo usuário criado: ${newUser.username} (ID: ${newUser.id})`);
  } catch (error) {
    Console.error("User", "Erro ao criar usuário:", error);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

app.post("/user/update-username", async (req, res) => {
  try {
    const { id, username } = req.body;
    
    if (!id || !username) {
      return res.status(400).json({ error: "id e username são obrigatórios" });
    }
    
    // Validação do formato do username
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(username)) {
      return res.status(422).json({ error: 'Username pode conter apenas letras, números, espaços, _ e -' });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.status(422).json({ error: 'Username deve ter entre 3 e 20 caracteres' });
    }
    
    // Buscar usuário por ID
    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    
    // Verificar se o username já existe (exceto para o próprio usuário)
    const existingUser = await UserModel.findOne({ username: username });
    if (existingUser && existingUser.id !== parseInt(id)) {
      return res.status(409).json({ error: 'Username já está em uso' });
    }
    
    // Atualizar username usando stumbleId
    const result = await UserModel.update(user.stumbleId, { username: username });
    
    if (result) {
      res.json({ success: true, message: "Username atualizado", username: username });
      Console.log("User", `Username atualizado: ID ${id} (${user.stumbleId}) -> ${username}`);
    } else {
      res.json({ success: false, message: "Falha ao atualizar username" });
    }
  } catch (error) {
    Console.error("User", "Erro ao atualizar username:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// ✅ Endpoint alternativo para SG PULSE (usando deviceId)
app.post("/sgpulse/update-username", async (req, res) => {
  try {
    const { userId, username } = req.body;
    
    if (!userId || !username) {
      return res.status(400).json({ error: "userId e username são obrigatórios" });
    }
    
    // Validação do formato do username
    if (username.length < 3 || username.length > 20) {
      return res.status(422).json({ error: 'Username deve ter entre 3 e 20 caracteres' });
    }
    
    // Buscar usuário por ID
    const user = await UserModel.findById(parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    
    // Atualizar diretamente no banco usando stumbleId
    const result = await UserModel.update(user.stumbleId, { 
      username: username,
      'userProfile.userName': username
    });
    
    if (result) {
      res.json({ success: true, message: "Username atualizado", username: username });
      Console.log("SGPulse", `Username atualizado: ID ${userId} -> ${username}`);
    } else {
      res.json({ success: false, message: "Falha ao atualizar username" });
    }
  } catch (error) {
    Console.error("SGPulse", "Erro ao atualizar username:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// ✅ Endpoint específico para StumbleRanked - Atualizar username por ID
app.post("/stumbleranked/update-username", async (req, res) => {
  try {
    const { userId, username } = req.body;
    
    Console.log("StumbleRanked", `📥 Recebido pedido de atualização: userId=${userId}, username=${username}`);
    
    if (!userId || !username) {
      Console.error("StumbleRanked", "❌ Parâmetros faltando");
      return res.status(400).json({ error: "userId e username são obrigatórios" });
    }
    
    // Validação do formato do username
    if (username.length < 3 || username.length > 20) {
      Console.error("StumbleRanked", "❌ Username com tamanho inválido");
      return res.status(422).json({ error: 'Username deve ter entre 3 e 20 caracteres' });
    }
    
    // Buscar usuário por ID no banco StumbleRanked
    Console.log("StumbleRanked", `🔍 Buscando usuário ID: ${userId}`);
    const user = await UserModel.findById(parseInt(userId));
    if (!user) {
      Console.error("StumbleRanked", `❌ Usuário não encontrado: ${userId}`);
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    
    Console.log("StumbleRanked", `✅ Usuário encontrado: stumbleId=${user.stumbleId}, username atual=${user.username}, gems=${user.gems}`);
    
    // IDs de admin que não pagam
    const ADMIN_IDS = [1, 7];
    const isAdmin = ADMIN_IDS.includes(parseInt(userId));
    
    // Sistema de tags - Preservar tag do nome antigo
    let finalUsername = username;
    
    // Extrair nome base e tags do nome atual
    let baseUsername = '';
    let currentTags = '';
    
    if (user.username) {
      Console.log("StumbleRanked", `🔍 Analisando nome antigo: "${user.username}"`);
      
      // Remover TODAS as tags HTML do nome para extrair o nome base
      // Tags HTML começam com < e terminam com >
      baseUsername = user.username.replace(/<[^>]+>/g, '');
      baseUsername = baseUsername.trim();
      
      // Extrair todas as tags (tudo que não é o nome base)
      if (baseUsername) {
        // Encontrar onde está o nome base no username original
        const baseIndex = user.username.indexOf(baseUsername);
        
        if (baseIndex === 0) {
          // Nome base está no começo, tags estão no final
          currentTags = user.username.substring(baseUsername.length);
          Console.log("StumbleRanked", `🏷️ Tags no final: "${currentTags}"`);
        } else if (baseIndex > 0) {
          // Nome base está no meio/final, tags estão no começo
          currentTags = user.username.substring(0, baseIndex);
          Console.log("StumbleRanked", `🏷️ Tags no começo: "${currentTags}"`);
        }
      }
      
      Console.log("StumbleRanked", `📝 Nome base extraído: "${baseUsername}"`);
    }
    
    // Verificar se o usuário digitou tags no nome novo
    const hasTagsInNewName = /<[^>]+>/.test(username);
    
    // Se não digitou tags E tinha tags no nome antigo, aplicar as tags antigas
    if (!hasTagsInNewName && currentTags) {
      // Descobrir se as tags estavam no começo ou no final
      const baseIndex = user.username.indexOf(baseUsername);
      if (baseIndex === 0) {
        // Tags no final
        finalUsername = username + currentTags;
      } else {
        // Tags no começo
        finalUsername = currentTags + username;
      }
      Console.log("StumbleRanked", `🏷️ Tags preservadas: "${username}" -> "${finalUsername}"`);
    } else if (hasTagsInNewName) {
      Console.log("StumbleRanked", `🏷️ Usuário digitou tags manualmente: "${username}"`);
    } else {
      Console.log("StumbleRanked", `ℹ️ Nenhuma tag para preservar`);
    }
    
    // Verificar se tem gemas suficientes (DESABILITADO - troca de nome grátis)
    const CHANGE_NAME_COST = 0;
    /*
    if (!isAdmin && (user.gems || 0) < CHANGE_NAME_COST) {
      Console.error("StumbleRanked", `❌ Gemas insuficientes: ${user.gems}/${CHANGE_NAME_COST}`);
      return res.status(400).json({ 
        error: `Você precisa de ${CHANGE_NAME_COST} gemas para trocar o nome. Você tem apenas ${user.gems || 0} gemas.`,
        gemsRequired: CHANGE_NAME_COST,
        gemsAvailable: user.gems || 0
      });
    }
    */
    
    Console.log("StumbleRanked", `🔄 Atualizando username: ${user.username} -> ${finalUsername}`);
    
    // Preparar atualização
    const updateData = { 
      username: finalUsername,
      'userProfile.userName': finalUsername,
      updatedAt: new Date()
    };
    
    // Desconto de gemas DESABILITADO
    /*
    if (!isAdmin) {
      updateData.gems = (user.gems || 0) - CHANGE_NAME_COST;
      Console.log("StumbleRanked", `💎 Descontando ${CHANGE_NAME_COST} gemas: ${user.gems} -> ${updateData.gems}`);
    }
    */
    
    // Usar UserModel.update que já funciona
    const result = await UserModel.update(user.stumbleId, updateData);
    
    Console.log("StumbleRanked", `📊 Resultado da atualização:`, result);
    
    if (result) {
      res.json({ 
        success: true, 
        message: "Username atualizado", 
        username: finalUsername,
        gemsSpent: isAdmin ? 0 : CHANGE_NAME_COST,
        gemsRemaining: isAdmin ? user.gems : updateData.gems,
        isAdmin: isAdmin
      });
      Console.log("StumbleRanked", `✅ Username atualizado com sucesso: ${finalUsername}${isAdmin ? ' [ADMIN]' : ` (-${CHANGE_NAME_COST} gemas)`}`);
    } else {
      res.json({ success: false, message: "Falha ao atualizar username" });
      Console.error("StumbleRanked", `❌ Falha ao atualizar username para ID ${userId}`);
    }
  } catch (error) {
    Console.error("StumbleRanked", "💥 Erro ao atualizar username:", error);
    res.status(500).json({ error: "Erro interno do servidor", details: error.message });
  }
});

// ✅ Endpoint alternativo usando deviceId
app.post("/stumbleranked/update-username-by-device", async (req, res) => {
  try {
    const { deviceId, username } = req.body;
    
    if (!deviceId || !username) {
      return res.status(400).json({ error: "deviceId e username são obrigatórios" });
    }
    
    // Validação do formato do username
    if (username.length < 3 || username.length > 20) {
      return res.status(422).json({ error: 'Username deve ter entre 3 e 20 caracteres' });
    }
    
    // Buscar usuário por deviceId
    const user = await UserModel.findByDeviceId(deviceId);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    
    Console.log("StumbleRanked", `Atualizando username por deviceId: ${deviceId} -> ${username}`);
    
    // Atualizar usando stumbleId
    const result = await UserModel.update(user.stumbleId, { 
      username: username,
      'userProfile.userName': username
    });
    
    if (result) {
      res.json({ success: true, message: "Username atualizado", username: username, userId: user.id });
      Console.log("StumbleRanked", `✅ Username atualizado: ${user.stumbleId} -> ${username}`);
    } else {
      res.json({ success: false, message: "Falha ao atualizar username" });
    }
  } catch (error) {
    Console.error("StumbleRanked", "Erro ao atualizar username por deviceId:", error);
    res.status(500).json({ error: "Erro interno do servidor", details: error.message });
  }
});

// ✅ Endpoint SIMPLES para teste - Atualizar username diretamente
app.post("/simple/update-username", async (req, res) => {
  try {
    const { userId, username } = req.body;
    
    Console.log("SimpleUpdate", `Recebido: userId=${userId}, username=${username}`);
    
    if (!userId || !username) {
      Console.error("SimpleUpdate", "Parâmetros faltando");
      return res.status(400).json({ error: "userId e username são obrigatórios" });
    }
    
    // Buscar usuário diretamente no banco
    Console.log("SimpleUpdate", `Buscando usuário ID: ${userId}`);
    const user = await UserModel.findById(parseInt(userId));
    
    if (!user) {
      Console.error("SimpleUpdate", `Usuário não encontrado: ${userId}`);
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    
    Console.log("SimpleUpdate", `Usuário encontrado: ${user.stumbleId}, nome atual: ${user.username}`);
    
    // Atualizar diretamente
    Console.log("SimpleUpdate", `Atualizando para: ${username}`);
    const updateResult = await UserModel.update(user.stumbleId, { username: username });
    
    Console.log("SimpleUpdate", `Resultado da atualização:`, updateResult);
    
    res.json({ 
      success: true, 
      message: "Username atualizado com sucesso",
      oldUsername: user.username,
      newUsername: username,
      userId: userId,
      stumbleId: user.stumbleId
    });
    
  } catch (error) {
    Console.error("SimpleUpdate", "Erro:", error);
    res.status(500).json({ error: "Erro interno", details: error.message });
  }
});

// ✅ Endpoints de Vinculação Discord
app.post("/discord/register-key", async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const linkingKey = req.body.linkingKey || req.query.linkingKey;
    
    if (!userId || !linkingKey) {
      return res.status(400).json({ error: "userId e linkingKey são obrigatórios" });
    }

    // Armazenar chave temporariamente (válida por 10 minutos)
    const key = linkingKey.toUpperCase();
    global.linkingKeys = global.linkingKeys || new Map();
    global.linkingKeys.set(key, { userId, createdAt: Date.now() });
    
    // Limpar chaves expiradas
    setTimeout(() => {
      global.linkingKeys.delete(key);
    }, 10 * 60 * 1000);

    res.json({ 
      success: true, 
      message: "Chave de vinculação registrada",
      linkingKey: key
    });
  } catch (error) {
    Console.error("Discord", "Erro ao registrar chave:", error);
    res.status(500).json({ error: "Erro ao registrar chave" });
  }
});

app.get("/discord/register-key", async (req, res) => {
  try {
    const { userId, linkingKey } = req.query;
    
    if (!userId || !linkingKey) {
      return res.status(400).json({ error: "userId e linkingKey são obrigatórios" });
    }

    // Armazenar chave temporariamente (válida por 10 minutos)
    const key = linkingKey.toUpperCase();
    global.linkingKeys = global.linkingKeys || new Map();
    global.linkingKeys.set(key, { userId, createdAt: Date.now() });
    
    // Limpar chaves expiradas
    setTimeout(() => {
      global.linkingKeys.delete(key);
    }, 10 * 60 * 1000);

    res.json({ 
      success: true, 
      message: "Chave de vinculação registrada",
      linkingKey: key
    });
  } catch (error) {
    Console.error("Discord", "Erro ao registrar chave:", error);
    res.status(500).json({ error: "Erro ao registrar chave" });
  }
});

app.get("/discord/verify/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({
      authorized: user.authorized || false,
      discordId: user.discordId || null,
      username: user.username
    });
  } catch (error) {
    Console.error("Discord", "Erro ao verificar vinculação:", error);
    res.status(500).json({ error: "Erro ao verificar vinculação" });
  }
});

// ✅ Endpoint para obter secretKey do usuário
app.get("/discord/get-secret-key/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }
    
    const user = await UserModel.findById(parseInt(userId));
    
    if (!user) {
      return res.json({
        success: false,
        message: "Usuário não encontrado"
      });
    }
    
    if (!user.secretKey) {
      return res.json({
        success: false,
        message: "SecretKey não gerada"
      });
    }
    
    res.json({
      success: true,
      secretKey: user.secretKey,
      username: user.username
    });
  } catch (error) {
    Console.error("Discord", "Erro ao obter secretKey:", error);
    res.status(500).json({ error: "Erro ao obter secretKey" });
  }
});

// ✅ Endpoint para buscar usuário pelo deviceId
app.post("/user/find-by-deviceid", async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: "deviceId é obrigatório" });
    }
    
    const user = await UserModel.findByDeviceId(deviceId);
    
    if (!user) {
      return res.json({
        success: false,
        message: "Usuário não encontrado"
      });
    }
    
    res.json({
      success: true,
      id: user.id,
      username: user.username,
      secretKey: user.secretKey
    });
  } catch (error) {
    Console.error("User", "Erro ao buscar usuário:", error);
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

// ✅ Endpoint para gerar próximo ID sequencial
app.get("/discord/next-id", async (req, res) => {
  try {
    // Encontrar o maior ID existente
    const lastUser = await UserModel.findOne().sort({ id: -1 }).limit(1);
    const nextId = (lastUser?.id || 0) + 1;
    
    res.json({
      success: true,
      nextId: nextId
    });
  } catch (error) {
    Console.error("Discord", "Erro ao gerar próximo ID:", error);
    res.status(500).json({ error: "Erro ao gerar próximo ID" });
  }
});

// ✅ Endpoint para o jogo consultar solicitação de vinculação pendente
app.get("/discord/pending-linking/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    
    global.pendingLinkingRequests = global.pendingLinkingRequests || new Map();
    const request = global.pendingLinkingRequests.get(parseInt(gameId));
    
    if (!request) {
      return res.json({
        success: false,
        message: "Nenhuma solicitação pendente"
      });
    }
    
    // Verificar se expirou
    if (request.expiresAt < Date.now()) {
      global.pendingLinkingRequests.delete(parseInt(gameId));
      return res.json({
        success: false,
        message: "Solicitação expirada"
      });
    }
    
    res.json({
      success: true,
      gameId: request.gameId,
      discordUsername: request.discordUsername,
      discordId: request.discordId
    });
  } catch (error) {
    Console.error("Discord", "Erro ao consultar solicitação:", error);
    res.status(500).json({ error: "Erro ao consultar solicitação" });
  }
});

// ✅ Endpoint para confirmar vinculação
app.post("/discord/confirm-linking", async (req, res) => {
  try {
    const { gameId, discordId, discordUsername } = req.body;
    
    if (!gameId || !discordId || !discordUsername) {
      return res.status(400).json({ error: "Parâmetros obrigatórios faltando" });
    }
    
    // Vincular conta no banco de dados
    const result = await UserModel.updateOne(
      { id: parseInt(gameId) },
      { 
        $set: { 
          discordId: discordId,
          discordUsername: discordUsername,
          authorized: true,
          linkedAt: new Date()
        } 
      }
    );
    
    // Remover solicitação pendente
    global.pendingLinkingRequests = global.pendingLinkingRequests || new Map();
    global.pendingLinkingRequests.delete(parseInt(gameId));
    
    res.json({
      success: true,
      message: "Conta vinculada com sucesso"
    });
    
    console.log(`✅ Conta vinculada: ID ${gameId} -> Discord ${discordUsername}`);
  } catch (error) {
    Console.error("Discord", "Erro ao confirmar vinculação:", error);
    res.status(500).json({ error: "Erro ao confirmar vinculação" });
  }
});

// ✅ Endpoint para rejeitar vinculação
app.post("/discord/reject-linking", async (req, res) => {
  try {
    const { gameId } = req.body;
    
    if (!gameId) {
      return res.status(400).json({ error: "gameId obrigatório" });
    }
    
    // Remover solicitação pendente
    global.pendingLinkingRequests = global.pendingLinkingRequests || new Map();
    global.pendingLinkingRequests.delete(parseInt(gameId));
    
    res.json({
      success: true,
      message: "Solicitação rejeitada"
    });
    
    console.log(`❌ Solicitação rejeitada: ID ${gameId}`);
  } catch (error) {
    Console.error("Discord", "Erro ao rejeitar vinculação:", error);
    res.status(500).json({ error: "Erro ao rejeitar vinculação" });
  }
});

app.get("/api/v1/ping", async (req, res) => res.status(200).send("OK"));
app.post("/api/v1/userLoginExternal", TournamentController.login);
app.get("/api/v1/tournaments", TournamentController.getActive);

app.use(errorControll);

//
// ✅ TRATAMENTO DE ERROS GLOBAL
//
process.on('unhandledRejection', (reason, promise) => {
  Console.error("System", "❌ Unhandled Rejection:", reason);
  Console.error("System", "Promise:", promise);
});

process.on('uncaughtException', (error) => {
  Console.error("System", "❌ Uncaught Exception:", error.message);
  Console.error("System", "Stack:", error.stack);
  process.exit(1);
});

process.on('SIGINT', () => {
  Console.log("System", "👋 Recebido SIGINT, encerrando servidor graciosamente...");
  process.exit(0);
});

process.on('SIGTERM', () => {
  Console.log("System", "👋 Recebido SIGTERM, encerrando servidor graciosamente...");
  process.exit(0);
});

//
// ✅ INICIALIZAÇÃO PRINCIPAL DO SERVIDOR
//
async function startServer() {
  try {
    // Inicializar sistema (DNS, cache, etc.)
    await initializeSystem();
    
    // Aguardar conexão do MongoDB (que está no BackendUtils)
    Console.log("Database", "⏳ Aguardando conexão com MongoDB...");
    
    // Dar tempo para o MongoDB conectar
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Iniciar servidor Express
    app.listen(PORT, '0.0.0.0', () => {
      const currentDate = new Date().toLocaleString().replace(",", " |");
      console.clear();
      
      Console.log("Server", `🎮 [${Title}] | ${currentDate} | ${CryptoUtils.SessionToken()}`);
      Console.log("Server", `🚀 Servidor rodando na porta ${PORT}`);
      Console.log("Server", `🌐 Acesse: http://localhost:${PORT}`);
      Console.log("Server", `📊 Health Check: http://localhost:${PORT}/api/v1/ping`);
      Console.log("Server", "✅ Sistema totalmente operacional!");
      
      // Mostrar estatísticas de inicialização
      Console.log("Stats", `⏱️ Tempo de inicialização: ${process.uptime().toFixed(2)}s`);
      Console.log("Stats", `💾 Uso de memória: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    });
    
  } catch (error) {
    Console.error("Server", "❌ Falha crítica na inicialização:", error.message);
    Console.error("Server", "🔧 Soluções possíveis:");
    Console.error("Server", "   1. Verificar conexão com internet");
    Console.error("Server", "   2. Verificar configurações do MongoDB");
    Console.error("Server", "   3. Verificar variáveis de ambiente (.env)");
    Console.error("Server", "   4. Executar: ipconfig /flushdns (Windows)");
    Console.error("Server", "   5. Tentar usar VPN se houver bloqueios de rede");
    
    process.exit(1);
  }
} 

// Iniciar o servidor
startServer().catch((error) => {
  Console.error("Server", "❌ Erro fatal durante inicialização:", error);
  process.exit(1);
});

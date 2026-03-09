# 🚀 Guia: Hospedar o Backend SG PULSE no Render

Este guia explica como fazer deploy do backend Node.js no [Render.com](https://render.com) para substituir o servidor atual (`141.11.128.91:3009`).

---

## ✅ Pré-requisitos

1. **Conta no Render** – [Crie grátis](https://dashboard.render.com/register)
2. **Repositório Git** – O projeto precisa estar no GitHub/GitLab
3. **MongoDB Atlas** – Connection string do banco (já configurado no seu `.env`)
4. **Variáveis de ambiente** – Tenha à mão os valores do seu `.env`

---

## 📋 Passo a passo

### 1. Subir o projeto para o GitHub

Se ainda não fez:

```bash
cd "c:\Users\ronny\Downloads\0.56\SG PULSE\SG PULSE"
git init
git add BackEnd/
git commit -m "Backend SG PULSE"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

> ⚠️ **Importante:** O Render precisa apenas da pasta `BackEnd`.  
> Se o repositório tiver mais pastas (ex: Nioxi), defina **Root Directory** como `BackEnd`.

---

### 2. Criar o Web Service no Render

1. Acesse [dashboard.render.com](https://dashboard.render.com)
2. Clique em **New +** → **Web Service**
3. Conecte o repositório GitHub
4. Selecione o repositório do SG PULSE
5. Configure:
   - **Name:** `sg-pulse-backend` (ou outro nome)
   - **Region:** escolha a mais próxima (ex: Oregon para América do Sul)
   - **Root Directory:** `BackEnd` (se o backend está dentro dessa pasta)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

---

### 3. Variáveis de ambiente (OBRIGATÓRIO)

No Render, vá em **Environment** e adicione:

| Chave | Valor | Descrição |
|-------|-------|-----------|
| `mongoUri` | `mongodb+srv://usuario:senha@cluster.mongodb.net/...` | Connection string do MongoDB Atlas |
| `Salt` | (do seu .env) | Salt de criptografia |
| `LeagueSalt` | (do seu .env) | League salt |
| `LeagueLoginSalt` | (do seu .env) | League login salt |
| `LoginSalt` | (do seu .env) | Login salt |
| `NODE_ENV` | `production` | Ambiente de produção |

Para importar de uma vez:
- Clique em **Add from .env**
- Cole o conteúdo do seu `.env` (sem valores sensíveis, se preferir editar depois)
- O Render ignora linhas vazias e comentários

> ⚠️ **Segurança:** Não inclua `BOT_TOKEN` ou `ADMIN_ROLE_ID` se o backend não rodar o Discord bot junto. O bot precisa de outro serviço ou máquina.

---

### 4. MongoDB Atlas – liberar IP do Render

O Render usa IPs dinâmicos. No MongoDB Atlas:

1. Entre em **Network Access**
2. Clique em **Add IP Address**
3. Selecione **Allow Access from Anywhere** (`0.0.0.0/0`) para testes
4. Ou use os IPs do Render (consulte a [documentação do Render](https://render.com/docs/outbound-ip-addresses))

---

### 5. Deploy

1. Clique em **Create Web Service**
2. Aguarde o build e o deploy
3. A URL ficará no formato: `https://sg-pulse-backend.onrender.com`

---

### 6. Atualizar o cliente (Nioxi)

Depois que o deploy funcionar, altere no seu projeto Nioxi:

**Arquivo:** `Nioxi/MongoUserManager.cs`  
**Linha 14:**
```csharp
private const string MONGO_API_URL = "https://sg-pulse-backend.onrender.com";
```
(substitua pela URL real que o Render gerou)

**Arquivo:** `Nioxi/DiscordLinking.cs`  
**Linha 16:**
```csharp
private const string BACKEND_URL = "https://sg-pulse-backend.onrender.com";
```

**Arquivo:** `Nioxi/Backend.cs`  
**Linhas 201 e 285:**
```csharp
env._backendHost = "https://sg-pulse-backend.onrender.com/";
// e
public static string BackendUrl = "https://sg-pulse-backend.onrender.com/";
```

Use sempre `https://` para evitar bloqueio de mixed content no jogo.

---

## 🔧 Solução de problemas

### Serviço “dorme” após 15 minutos (plano gratuito)

- O plano gratuito desliga o serviço após inatividade.
- A primeira requisição após isso pode levar até ~30s para “acordar”.
- Para produção, considere um plano pago (ex: Starter) ou um keep-alive (cron externo chamando `/health`).

### Erro de conexão com MongoDB

- Confirme `mongoUri` correta.
- Verifique se o IP do Render está liberado no Atlas.
- Veja os logs no Render em **Logs**.

### Timeout na inicialização

- O backend espera alguns segundos para conectar ao MongoDB.
- Se o tempo de boot do Render não for suficiente, talvez precise ajustar o `startServer()` no `index.js`.

---

## 📚 Referências

- [Deploy Node Express no Render](https://render.com/docs/deploy-node-express-app)
- [Variáveis de ambiente no Render](https://render.com/docs/configure-environment-variables)
- [IPs de saída do Render](https://render.com/docs/outbound-ip-addresses)

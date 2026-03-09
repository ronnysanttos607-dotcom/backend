require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require('mongodb');
const dns = require('dns');
const crypto = require('crypto');
const http = require('http');

// ✅ Configurar DNS para MongoDB
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);

// ✅ Função auxiliar para fazer requisições HTTP
function makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        
        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: () => jsonData });
                } catch (e) {
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, text: () => data });
                }
            });
        });
        
        req.on('error', reject);
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

class StumbleRankedBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds
                // Removidos intents que precisam de aprovação especial
            ]
        });

        this.mongoClient = null;
        this.db = null;
        this.usersCollection = null;
        this.tagsCollection = null;
        this.linkingKeys = new Map(); // Armazenar chaves temporariamente
        
        // Configurações do bot
        this.BOT_TOKEN = process.env.BOT_TOKEN;
        this.MONGO_URI = process.env.mongoUri;
        this.DATABASE_NAME = 'StumbleRanked';
        this.ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || null; // ID do cargo de admin (opcional)
        
        // Tags disponíveis com suas formatações
        this.availableTags = {
            'StarFall': '<sup><#001a00><#003300><#006600><#00aa00><#00ff00><#66ff33>[<#e6ffe6>S<#b3ffb3>T <#ccffcc>W<#99ff99>I<#66ff66>N<#33ff33>N<#00ff00>E<#00cc00>R]',
            'Iron': '<sup><#bfff00><#00fff0><#00fff0><#00fff0><#00fff0><#b200ff><#c0c0c0>[<#d4d4d4>I<#e6e6e6>R<#f0f0f0>O<#f9f9f9>N <#d4d4d4>W<#c0c0c0>I<#a6a6a6>N<#8c8c8c>N<#737373>E<#595959>R]',
            'Hyper': '<sup><#e6f7ff><#cceeff><#b3e6ff><#80d4ff><#4dc2ff><#1ab2ff>[<#ffffff>H<#f2fbff>C <#e6f7ff>W<#cceeff>I<#b3e6ff>N<#80d4ff>N<#4dc2ff>E<#1ab2ff>R]',
            'SerieA': '<#00eaff><sup>[<#1ad1ff>S<#33b8ff>É<#4f9fff>R<#667fff>I<#4f9fff>E <#33b8ff><#1ad1ff>A<#00eaff>]',
            'SerieS': '<sup><#ff0000>[<#e60000>S<#cc0000>É<#b30000>R<#990000>I<#800000>E S<#ff0000>]<#330000>',
            'Star': '<sup><#bfff00><#00fff0><#00fff0><#00fff0><#00fff0><#b200ff>[<#c04dff>S<#d066ff>T<#e680ff>A<#f19cff>R<#e680ff>]'
        };
        
        this.setupEventListeners();
        this.setupCommands();
    }

    // ✅ Conectar ao MongoDB
    async connectMongoDB() {
        try {
            console.log('🔄 Conectando ao MongoDB...');
            
            const mongoOptions = {
                serverSelectionTimeoutMS: 15000,
                connectTimeoutMS: 15000,
                socketTimeoutMS: 15000,
                family: 4,
                maxPoolSize: 10,
                retryWrites: true,
                w: 'majority'
            };

            this.mongoClient = new MongoClient(this.MONGO_URI, mongoOptions);
            await this.mongoClient.connect();
            
            // Testar conexão
            await this.mongoClient.db('admin').command({ ping: 1 });
            
            this.db = this.mongoClient.db(this.DATABASE_NAME);
            this.usersCollection = this.db.collection('Users');
            this.tagsCollection = this.db.collection('Tags');
            
            console.log('✅ MongoDB conectado com sucesso!');
            return true;
        } catch (error) {
            console.error('❌ Erro ao conectar MongoDB:', error.message);
            return false;
        }
    }

    // ✅ Verificar se usuário tem permissão
    hasPermission(interaction) {
        // Se não há cargo de admin definido, qualquer um pode usar
        if (!this.ADMIN_ROLE_ID) return true;
        
        // Verificar se tem o cargo de admin
        return interaction.member.roles.cache.has(this.ADMIN_ROLE_ID) || 
               interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    }

    // ✅ Buscar usuário por StumbleId
    async findUserByStumbleId(stumbleId) {
        try {
            const user = await this.usersCollection.findOne({ 
                stumbleId: { $regex: new RegExp(`^${stumbleId}`, 'i') } 
            });
            return user;
        } catch (error) {
            console.error('Erro ao buscar usuário:', error);
            return null;
        }
    }

    // ✅ Atualizar username
    async updateUsername(stumbleId, newUsername) {
        try {
            const result = await this.usersCollection.updateOne(
                { stumbleId: { $regex: new RegExp(`^${stumbleId}`, 'i') } },
                { 
                    $set: { 
                        username: newUsername,
                        'userProfile.userName': newUsername,
                        updatedAt: new Date()
                    } 
                }
            );
            
            return result.matchedCount > 0;
        } catch (error) {
            console.error('Erro ao atualizar username:', error);
            return false;
        }
    }

    // ✅ Validar username
    validateUsername(username) {
        if (username.length < 0 || username.length > 12000) {
            return { valid: false, error: 'Username deve ter entre 3 e 20 caracteres' };
        }
        return { valid: true };
    }

    // ✅ Remover tag específica do username
    removeSpecificTagFromUsername(username, tagToRemove) {
        const tagFormat = this.availableTags[tagToRemove];
        if (!tagFormat) return username;
        
        // Escapar caracteres especiais da tag para regex
        const escapedTag = tagFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tagRegex = new RegExp(escapedTag, 'gi');
        
        return username.replace(tagRegex, '').trim();
    }

    // ✅ Extrair apenas o nome base (sem tags) do username
    extractBaseUsername(username) {
        let baseUsername = username;
        
        // Remover todas as tags conhecidas
        Object.values(this.availableTags).forEach(tagFormat => {
            const escapedTag = tagFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tagRegex = new RegExp(escapedTag, 'gi');
            baseUsername = baseUsername.replace(tagRegex, '');
        });
        
        // Limpar espaços extras
        return baseUsername.trim();
    }

    // ✅ Extrair todas as tags do username
    extractTagsFromUsername(username) {
        const tags = [];
        
        Object.entries(this.availableTags).forEach(([tagName, tagFormat]) => {
            if (username.includes(tagFormat)) {
                tags.push(tagFormat);
            }
        });
        
        return tags;
    }

    // ✅ Verificar se username possui tag específica
    hasSpecificTag(username, tagName) {
        const tagFormat = this.availableTags[tagName];
        if (!tagFormat) return false;
        
        return username.includes(tagFormat);
    }

    // ✅ Configurar comandos
    setupCommands() {
        this.commands = [
            // Comando para alterar username (com limite semanal)
            new SlashCommandBuilder()
                .setName('changeusername')
                .setDescription('Alterar username (3 vezes por semana)')
                .addStringOption(option =>
                    option.setName('newname')
                        .setDescription('Novo username')
                        .setRequired(true)
                ),

            // Comando para resetar contador de mudanças
            new SlashCommandBuilder()
                .setName('resetc')
                .setDescription('Resetar contador de mudanças de username (Admin)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Usuário para resetar')
                        .setRequired(true)
                ),

            // Comando para pesquisar jogador por nome ou ID
            new SlashCommandBuilder()
                .setName('search')
                .setDescription('Pesquisar jogador por nome ou ID')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Nome do jogador ou ID (StumbleId/UserId)')
                        .setRequired(true)
                ),

            // Comando para gerenciar gems (apenas add e rem)
            new SlashCommandBuilder()
                .setName('gems')
                .setDescription('Gerenciar gems de um usuário (Admin)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Adicionar gems')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('Usuário')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName('amount')
                                .setDescription('Quantidade de gems')
                                .setRequired(true)
                                .setMinValue(1)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('rem')
                        .setDescription('Remover gems')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('Usuário')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName('amount')
                                .setDescription('Quantidade de gems')
                                .setRequired(true)
                                .setMinValue(1)
                        )
                ),

            // Comando de estatísticas
            new SlashCommandBuilder()
                .setName('stats')
                .setDescription('Mostrar estatísticas do servidor'),

            // Comando para listar usuários (apenas um)
            new SlashCommandBuilder()
                .setName('list')
                .setDescription('Listar todos os usuários')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Página da lista (padrão: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Usuários por página (padrão: 20, máx: 50)')
                        .setRequired(false)
                        .setMinValue(5)
                        .setMaxValue(50)
                )
                .addBooleanOption(option =>
                    option.setName('compact')
                        .setDescription('Formato compacto (padrão: false)')
                        .setRequired(false)
                ),

            // Comando para registrar ID de jogo
            new SlashCommandBuilder()
                .setName('register')
                .setDescription('Registrar sua conta com a secretKey do jogo')
                .addStringOption(option =>
                    option.setName('secretkey')
                        .setDescription('Sua secretKey do jogo')
                        .setRequired(true)
                ),

            // Comando para alterar nome por StumbleId (Admin)
            new SlashCommandBuilder()
                .setName('changename')
                .setDescription('Alterar username por StumbleId (Admin)')
                .addStringOption(option =>
                    option.setName('stumbleid')
                        .setDescription('StumbleId do jogador')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('newname')
                        .setDescription('Novo username')
                        .setRequired(true)
                ),

            // Comando para adicionar gems por StumbleId (Admin)
            new SlashCommandBuilder()
                .setName('addgems')
                .setDescription('Adicionar gems por StumbleId (Admin)')
                .addStringOption(option =>
                    option.setName('stumbleid')
                        .setDescription('StumbleId do jogador')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Quantidade de gems')
                        .setRequired(true)
                        .setMinValue(1)
                ),

            // Comando para remover gems por StumbleId (Admin)
            new SlashCommandBuilder()
                .setName('remgems')
                .setDescription('Remover gems por StumbleId (Admin)')
                .addStringOption(option =>
                    option.setName('stumbleid')
                        .setDescription('StumbleId do jogador')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Quantidade de gems')
                        .setRequired(true)
                        .setMinValue(1)
                ),

            // Comando para banir/desbanir por StumbleId (Admin)
            new SlashCommandBuilder()
                .setName('ban')
                .setDescription('Banir/Desbanir jogador por StumbleId (Admin)')
                .addStringOption(option =>
                    option.setName('stumbleid')
                        .setDescription('StumbleId do jogador')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option.setName('banned')
                        .setDescription('true = banir, false = desbanir')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Motivo do ban/unban')
                        .setRequired(false)
                ),

            // Sistema completo de tags em um único comando
            new SlashCommandBuilder()
                .setName('tag')
                .setDescription('Sistema de gerenciamento de tags (Admin)')
                .addStringOption(option =>
                    option.setName('stumbleid')
                        .setDescription('StumbleId do jogador')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Ação a realizar')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Adicionar Tag', value: 'add' },
                            { name: 'Remover Tag', value: 'remove' },
                            { name: 'Listar Tags', value: 'list' },
                            { name: 'Criar Tag', value: 'create' }
                        )
                )
                .addStringOption(option =>
                    option.setName('tagname')
                        .setDescription('Nome da tag (obrigatório para add/remove)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'StarFall', value: 'StarFall' },
                            { name: 'Iron', value: 'Iron' },
                            { name: 'Hyper', value: 'Hyper' },
                            { name: 'Série A', value: 'SerieA' },
                            { name: 'Série S', value: 'SerieS' },
                            { name: 'sStar', value: 'sStar' }
                        )
                )
                .addStringOption(option =>
                    option.setName('newtagname')
                        .setDescription('Nome da nova tag (para criar)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('format')
                        .setDescription('Formato da nova tag (para criar)')
                        .setRequired(false)
                ),

            // Comando para gerenciar admins
            new SlashCommandBuilder()
                .setName('admin')
                .setDescription('Gerenciar lista de administradores (Super Admin)')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Ação a realizar')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Adicionar Admin', value: 'add' },
                            { name: 'Remover Admin', value: 'remove' },
                            { name: 'Listar Admins', value: 'list' }
                        )
                )
                .addIntegerOption(option =>
                    option.setName('userid')
                        .setDescription('ID do usuário (obrigatório para add/remove)')
                        .setRequired(false)
                        .setMinValue(1)
                ),

            // Comando de ajuda
            new SlashCommandBuilder()
                .setName('help')
                .setDescription('Mostrar comandos disponíveis')
        ];
    }

    // ✅ Configurar event listeners
    setupEventListeners() {
        this.client.once('ready', async () => {
            console.log(`🤖 Bot ${this.client.user.tag} está online!`);
            
            // Conectar ao MongoDB
            const mongoConnected = await this.connectMongoDB();
            if (!mongoConnected) {
                console.error('❌ Falha ao conectar MongoDB. Bot será encerrado.');
                process.exit(1);
            }

            // Registrar comandos slash
            await this.registerSlashCommands();
            
            // Definir status
            this.client.user.setActivity('Stumble Born Backend', { type: 'WATCHING' });
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            try {
                await this.handleSlashCommand(interaction);
            } catch (error) {
                console.error('Erro ao processar comando:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('Ocorreu um erro ao processar o comando.')
                    .setTimestamp();

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            }
        });
    }

    // ✅ Registrar comandos slash
    async registerSlashCommands() {
        try {
            console.log('🔄 Registrando comandos slash...');
            
            await this.client.application.commands.set(this.commands);
            
            console.log('✅ Comandos slash registrados com sucesso!');
        } catch (error) {
            console.error('❌ Erro ao registrar comandos:', error);
        }
    }

    // ✅ Processar comandos slash
    async handleSlashCommand(interaction) {
        const { commandName } = interaction;

        switch (commandName) {
            case 'changeusername':
                await this.handleChangeUsernameCommand(interaction);
                break;
            case 'resetc':
                await this.handleResetCounterCommand(interaction);
                break;
            case 'search':
                await this.handleSearchCommand(interaction);
                break;
            case 'gems':
                await this.handleGemsCommand(interaction);
                break;
            case 'stats':
                await this.handleStatsCommand(interaction);
                break;
            case 'list':
                await this.handleListCommand(interaction);
                break;
            case 'register':
                await this.handleRegisterCommand(interaction);
                break;
            case 'changename':
                await this.handleChangeNameByStumbleIdCommand(interaction);
                break;
            case 'addgems':
                await this.handleAddGemsCommand(interaction);
                break;
            case 'remgems':
                await this.handleRemGemsCommand(interaction);
                break;
            case 'ban':
                await this.handleBanCommand(interaction);
                break;
            case 'tag':
                await this.handleTagCommand(interaction);
                break;
            case 'admin':
                await this.handleAdminCommand(interaction);
                break;
            case 'help':
                await this.handleHelpCommand(interaction);
                break;
            default:
                await interaction.reply({ 
                    content: '❌ Comando não reconhecido.', 
                    ephemeral: true 
                });
        }
    }

    // ✅ Comando changeusername (com limite semanal)
    async handleChangeUsernameCommand(interaction) {
        await interaction.deferReply();

        const newUsername = interaction.options.getString('newname');
        const userId = interaction.user.id;

        try {
            // Buscar usuário por Discord ID
            const user = await this.usersCollection.findOne({ discordId: userId });
            
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Conta Não Vinculada')
                    .setDescription('Você precisa vincular sua conta Discord primeiro usando `/r <chave>`')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar limite semanal de mudanças
            const usernameChanges = user.usernameChanges || [];
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const changesThisWeek = usernameChanges.filter(date => new Date(date) > oneWeekAgo).length;

            if (changesThisWeek >= 3) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Limite Atingido')
                    .setDescription(`Você já mudou seu nome 3 vezes esta semana. Tente novamente em ${Math.ceil((new Date(usernameChanges[usernameChanges.length - 3]).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (60 * 60 * 1000))} horas.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Validar username
            const validation = this.validateUsername(newUsername);
            if (!validation.valid) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Username Inválido')
                    .setDescription(validation.error)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Atualizar username
            usernameChanges.push(new Date());
            await this.usersCollection.updateOne(
                { discordId: userId },
                { 
                    $set: { 
                        username: newUsername,
                        usernameChanges: usernameChanges,
                        updatedAt: new Date()
                    } 
                }
            );

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Username Alterado')
                .addFields(
                    { name: '👤 Novo Username', value: `\`${newUsername}\``, inline: true },
                    { name: '📊 Mudanças Restantes', value: `\`${3 - changesThisWeek - 1}/3\``, inline: true },
                    { name: '⏰ Próxima Semana', value: `<t:${Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)}:R>`, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Username alterado: ${user.username} -> ${newUsername} (Discord: ${userId})`);

        } catch (error) {
            console.error('Erro ao alterar username:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao alterar o username.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /r - Registrar chave de vinculação
    async handleRegisterKeyCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const key = interaction.options.getString('key').toUpperCase();
        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;

        try {
            // Consultar chave no servidor Node.js via HTTP
            let keyData = null;
            try {
                const response = await makeHttpRequest(`http://localhost:3009/discord/verify-key/${key}`);
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        keyData = { userId: result.userId };
                    }
                }
            } catch (httpError) {
                console.error('Erro ao consultar chave no servidor:', httpError);
            }

            if (!keyData) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Chave Inválida')
                    .setDescription('A chave de vinculação não foi encontrada. Verifique se digitou corretamente ou gere uma nova chave no jogo.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Buscar usuário pelo userId
            const user = await this.usersCollection.findOne({ id: parseInt(keyData.userId) });

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription('O usuário associado à chave não foi encontrado no banco de dados.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar se já está vinculada
            if (user.discordId) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Já Vinculada')
                    .setDescription(`Esta conta já está vinculada ao Discord: <@${user.discordId}>`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Vincular conta
            await this.usersCollection.updateOne(
                { id: parseInt(keyData.userId) },
                { 
                    $set: { 
                        discordId: discordId,
                        discordUsername: discordUsername,
                        authorized: true,
                        linkedAt: new Date(),
                        linkingKey: null
                    } 
                }
            );

            // Remover chave do servidor via HTTP
            try {
                await makeHttpRequest(`http://localhost:3009/discord/remove-key/${key}`, { method: 'DELETE' });
            } catch (httpError) {
                console.error('Erro ao remover chave do servidor:', httpError);
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Conta Vinculada com Sucesso!')
                .addFields(
                    { name: '👤 Jogador', value: `\`${user.username}\``, inline: true },
                    { name: '🎮 Discord', value: `${interaction.user}`, inline: true },
                    { name: '⏰ Vinculado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setDescription('Sua conta foi vinculada com sucesso! Agora você pode usar todos os comandos.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Conta vinculada: ${user.username} (ID: ${user.id}) -> Discord: ${discordUsername} (${discordId})`);

        } catch (error) {
            console.error('Erro ao registrar chave:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao vincular a conta.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /resetc - Resetar contador de mudanças
    async handleResetCounterCommand(interaction) {
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user');

        try {
            const user = await this.usersCollection.findOne({ discordId: targetUser.id });

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhuma conta vinculada encontrada para ${targetUser}`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Resetar contador
            await this.usersCollection.updateOne(
                { discordId: targetUser.id },
                { $set: { usernameChanges: [] } }
            );

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Contador Resetado')
                .addFields(
                    { name: '👤 Jogador', value: `${targetUser}`, inline: true },
                    { name: '📊 Mudanças Disponíveis', value: '`3/3`', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Contador resetado para ${user.username}`);

        } catch (error) {
            console.error('Erro ao resetar contador:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao resetar o contador.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /search - Pesquisar jogador por nome ou ID
    async handleSearchCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const query = interaction.options.getString('query');

        try {
            let user = null;
            
            // Tentar buscar por ID numérico primeiro
            const numericId = parseInt(query);
            if (!isNaN(numericId)) {
                user = await this.usersCollection.findOne({ 
                    $or: [
                        { id: numericId },
                        { stumbleId: numericId.toString() },
                        { stumbleId: numericId }
                    ]
                });
            }
            
            // Se não encontrou por ID, buscar por username
            if (!user) {
                user = await this.usersCollection.findOne({ 
                    username: { $regex: new RegExp(query, 'i') }
                });
            }
            
            // Se ainda não encontrou, buscar por StumbleId como string (IDs antigos)
            if (!user) {
                user = await this.usersCollection.findOne({ 
                    stumbleId: { $regex: new RegExp(`^${query}`, 'i') }
                });
            }

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Jogador Não Encontrado')
                    .setDescription(`Nenhum jogador encontrado com: \`${query}\`\n\nTente buscar por:\n• Nome do jogador\n• ID numérico\n• StumbleId`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Obter informações detalhadas
            const gems = user.balances?.find(b => b.name === 'gems')?.amount || 0;
            const coins = user.balances?.find(b => b.name === 'coins')?.amount || 0;
            const discordUser = user.discordId ? `<@${user.discordId}>` : 'Não vinculado';
            const banStatus = user.isBanned ? '🚫 BANIDO' : '✅ ATIVO';
            const banReason = user.isBanned && user.banReason ? user.banReason : 'N/A';

            const embed = new EmbedBuilder()
                .setColor(user.isBanned ? '#FF0000' : '#0099FF')
                .setTitle('🔍 Informações Completas do Jogador')
                .addFields(
                    { name: '👤 Username', value: `\`${user.username}\``, inline: true },
                    { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
                    { name: '🎮 StumbleId', value: `\`${user.stumbleId}\``, inline: true },
                    { name: '📱 DeviceId', value: `\`${user.deviceId || 'N/A'}\``, inline: true },
                    { name: '🔑 SecretKey', value: `\`${user.secretKey || 'N/A'}\``, inline: true },
                    { name: '🌍 País', value: `\`${user.country || 'N/A'}\``, inline: true },
                    { name: '👑 Coroas', value: `\`${user.crowns || 0}\``, inline: true },
                    { name: '💎 Gems', value: `\`${gems.toLocaleString()}\``, inline: true },
                    { name: '🪙 Coins', value: `\`${coins.toLocaleString()}\``, inline: true },
                    { name: '⭐ Experiência', value: `\`${user.experience || 0}\``, inline: true },
                    { name: '🏆 Rating', value: `\`${user.skillRating || 0}\``, inline: true },
                    { name: '📊 Status', value: `\`${banStatus}\``, inline: true },
                    { name: '🎮 Discord', value: discordUser, inline: true },
                    { name: '✅ Autorizado', value: user.authorized ? '`Sim`' : '`Não`', inline: true },
                    { name: '📅 Criado em', value: user.createdAt ? `<t:${Math.floor(new Date(user.createdAt).getTime() / 1000)}:F>` : 'N/A', inline: true },
                    { name: '🕐 Último Login', value: user.lastLogin ? `<t:${Math.floor(new Date(user.lastLogin).getTime() / 1000)}:R>` : 'N/A', inline: false }
                )
                .setTimestamp();

            // Adicionar informações de ban se aplicável
            if (user.isBanned) {
                embed.addFields(
                    { name: '📋 Motivo do Ban', value: `\`${banReason}\``, inline: true },
                    { name: '📅 Banido em', value: user.banDate ? `<t:${Math.floor(new Date(user.banDate).getTime() / 1000)}:F>` : 'N/A', inline: true }
                );
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao pesquisar jogador:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao pesquisar o jogador.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /gems - Gerenciar gems (apenas add e rem)
    async handleGemsCommand(interaction) {
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        try {
            const user = await this.usersCollection.findOne({ discordId: targetUser.id });

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhuma conta vinculada encontrada para ${targetUser}`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Obter gems do array balances
            const currentGems = user.balances?.find(b => b.name === 'gems')?.amount || 0;
            let newGems = currentGems;
            let action = '';

            switch (subcommand) {
                case 'add':
                    newGems += amount;
                    action = `Adicionado ${amount} gems`;
                    break;
                case 'rem':
                    newGems = Math.max(0, newGems - amount);
                    action = `Removido ${amount} gems`;
                    break;
            }

            // Atualizar gems no array balances
            await this.usersCollection.updateOne(
                { discordId: targetUser.id },
                { 
                    $set: { 
                        'balances.$[elem].amount': newGems,
                        updatedAt: new Date()
                    } 
                },
                { 
                    arrayFilters: [{ 'elem.name': 'gems' }] 
                }
            );

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Gems Atualizadas')
                .addFields(
                    { name: '👤 Jogador', value: `${targetUser}`, inline: true },
                    { name: '💎 Gems Anteriores', value: `\`${currentGems.toLocaleString()}\``, inline: true },
                    { name: '💎 Gems Atuais', value: `\`${newGems.toLocaleString()}\``, inline: true },
                    { name: '📝 Ação', value: `\`${action}\``, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Gems atualizadas para ${user.username}: ${currentGems} -> ${newGems}`);

        } catch (error) {
            console.error('Erro ao gerenciar gems:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao atualizar as gems.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando findplayer
    async handleFindPlayerCommand(interaction) {
        await interaction.deferReply();

        const stumbleId = interaction.options.getString('stumbleid').toUpperCase();
        const user = await this.findUserByStumbleId(stumbleId);

        if (!user) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Usuário Não Encontrado')
                .setDescription(`Nenhum usuário encontrado com StumbleId: \`${stumbleId}\``)
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('👤 Informações do Jogador')
            .addFields(
                { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
                { name: '🎮 StumbleId', value: `\`${user.stumbleId}\``, inline: true },
                { name: '📱 DeviceId', value: `\`${user.deviceId}\``, inline: true },
                { name: '👤 Username', value: `\`${user.username}\``, inline: true },
                { name: '🌍 País', value: `\`${user.country || 'N/A'}\``, inline: true },
                { name: '👑 Coroas', value: `\`${user.crowns || 0}\``, inline: true },
                { name: '💎 Gems', value: `\`${user.balances?.find(b => b.name === 'gems')?.amount || 0}\``, inline: true },
                { name: '🪙 Coins', value: `\`${user.balances?.find(b => b.name === 'coins')?.amount || 0}\``, inline: true },
                { name: '⭐ Experiência', value: `\`${user.experience || 0}\``, inline: true },
                { name: '📅 Criado em', value: user.createdAt ? `<t:${Math.floor(new Date(user.createdAt).getTime() / 1000)}:F>` : 'N/A', inline: false },
                { name: '🕐 Último Login', value: user.lastLogin ? `<t:${Math.floor(new Date(user.lastLogin).getTime() / 1000)}:R>` : 'N/A', inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    // ✅ Comando stats
    async handleStatsCommand(interaction) {
        await interaction.deferReply();

        try {
            const totalUsers = await this.usersCollection.countDocuments();
            const bannedUsers = await this.usersCollection.countDocuments({ isBanned: true });
            const recentUsers = await this.usersCollection.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📊 Estatísticas do Servidor')
                .addFields(
                    { name: '👥 Total de Usuários', value: `\`${totalUsers.toLocaleString()}\``, inline: true },
                    { name: '🚫 Usuários Banidos', value: `\`${bannedUsers.toLocaleString()}\``, inline: true },
                    { name: '✅ Usuários Ativos', value: `\`${(totalUsers - bannedUsers).toLocaleString()}\``, inline: true },
                    { name: '🆕 Novos (24h)', value: `\`${recentUsers.toLocaleString()}\``, inline: true },
                    { name: '🤖 Bot Uptime', value: `\`${Math.floor(process.uptime() / 60)} minutos\``, inline: true },
                    { name: '💾 Uso de Memória', value: `\`${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\``, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível obter as estatísticas.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando list (com opção compacta)
    async handleListCommand(interaction) {
        // Verificar permissão
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const page = interaction.options.getInteger('page') || 1;
            const limit = interaction.options.getInteger('limit') || 20;
            const compact = interaction.options.getBoolean('compact') || false;
            const skip = (page - 1) * limit;

            // Buscar usuários com paginação
            const users = await this.usersCollection
                .find({})
                .sort(compact ? { username: 1 } : { createdAt: -1 }) // Alfabética se compacto, recentes se normal
                .skip(skip)
                .limit(limit)
                .project({ 
                    username: 1, 
                    stumbleId: 1, 
                    createdAt: 1,
                    country: 1,
                    crowns: 1,
                    isBanned: 1
                })
                .toArray();

            // Contar total de usuários
            const totalUsers = await this.usersCollection.countDocuments();
            const totalPages = Math.ceil(totalUsers / limit);

            if (users.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Nenhum Usuário Encontrado')
                    .setDescription('Não há usuários para exibir nesta página.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            let userList = '';
            let counter = skip + 1;

            if (compact) {
                // Formato compacto
                userList = '```\n';
                userList += 'NUM  STATUS  USERNAME                 STUMBLEID\n';
                userList += '─'.repeat(60) + '\n';
                
                for (const user of users) {
                    const status = user.isBanned ? '🚫' : '✅';
                    const num = counter.toString().padStart(3, '0');
                    const username = user.username.padEnd(20, ' ').substring(0, 20);
                    const stumbleId = user.stumbleId;
                    
                    userList += `${num}  ${status}     ${username} ${stumbleId}\n`;
                    counter++;
                    
                    // Limitar tamanho (Discord tem limite)
                    if (userList.length > 1800) {
                        userList += `... e mais ${users.length - (counter - skip - 1)} usuários\n`;
                        break;
                    }
                }
                
                userList += '```';
            } else {
                // Formato normal
                for (const user of users) {
                    const status = user.isBanned ? '🚫' : '✅';
                    const crowns = user.crowns || 0;
                    const country = user.country || '🌍';
                    
                    userList += `\`${counter.toString().padStart(3, '0')}\` ${status} **${user.username}**\n`;
                    userList += `     🆔 \`${user.stumbleId}\` | ${country} | 👑 ${crowns}\n\n`;
                    
                    counter++;
                    
                    // Limitar tamanho do embed (Discord tem limite de 4096 caracteres)
                    if (userList.length > 3500) {
                        userList += `... e mais ${users.length - (counter - skip - 1)} usuários\n`;
                        break;
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(compact ? '👥 Lista Compacta de Usuários' : '👥 Lista de Usuários')
                .setDescription(userList || 'Nenhum usuário encontrado')
                .addFields(
                    { 
                        name: '📊 Info', 
                        value: `**Total:** ${totalUsers.toLocaleString()}\n**Página:** ${page}/${totalPages}\n**Exibindo:** ${users.length}`, 
                        inline: true 
                    },
                    { 
                        name: '🔍 Legenda', 
                        value: compact ? '✅ = Ativo\n🚫 = Banido' : '✅ Ativo\n🚫 Banido\n👑 Coroas\n🌍 País', 
                        inline: true 
                    }
                )
                .setFooter({ 
                    text: `Página ${page}/${totalPages} • Use /list page:${page + 1} para próxima página` 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao listar usuários:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível obter a lista de usuários.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando listcompact
    async handleListCompactCommand(interaction) {
        // Verificar permissão
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const page = interaction.options.getInteger('page') || 1;
            const limit = interaction.options.getInteger('limit') || 30;
            const skip = (page - 1) * limit;

            // Buscar usuários com paginação
            const users = await this.usersCollection
                .find({})
                .sort({ username: 1 }) // Ordem alfabética
                .skip(skip)
                .limit(limit)
                .project({ 
                    username: 1, 
                    stumbleId: 1,
                    isBanned: 1
                })
                .toArray();

            // Contar total de usuários
            const totalUsers = await this.usersCollection.countDocuments();
            const totalPages = Math.ceil(totalUsers / limit);

            if (users.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Nenhum Usuário Encontrado')
                    .setDescription('Não há usuários para exibir nesta página.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Criar lista compacta
            let userList = '```\n';
            userList += 'NUM  STATUS  USERNAME                 STUMBLEID\n';
            userList += '─'.repeat(60) + '\n';
            
            let counter = skip + 1;

            for (const user of users) {
                const status = user.isBanned ? '🚫' : '✅';
                const num = counter.toString().padStart(3, '0');
                const username = user.username.padEnd(20, ' ').substring(0, 20);
                const stumbleId = user.stumbleId;
                
                userList += `${num}  ${status}     ${username} ${stumbleId}\n`;
                counter++;
                
                // Limitar tamanho (Discord tem limite)
                if (userList.length > 1800) {
                    userList += `... e mais ${users.length - (counter - skip - 1)} usuários\n`;
                    break;
                }
            }
            
            userList += '```';

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('👥 Lista Compacta de Usuários')
                .setDescription(userList)
                .addFields(
                    { 
                        name: '📊 Info', 
                        value: `**Total:** ${totalUsers.toLocaleString()}\n**Página:** ${page}/${totalPages}\n**Exibindo:** ${users.length}`, 
                        inline: true 
                    },
                    { 
                        name: '🔍 Legenda', 
                        value: '✅ = Ativo\n🚫 = Banido', 
                        inline: true 
                    }
                )
                .setFooter({ 
                    text: `Página ${page}/${totalPages} • /listcompact page:${page + 1} para próxima` 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao listar usuários (compacto):', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Não foi possível obter a lista de usuários.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /register - Registrar com secretKey
    async handleRegisterCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const secretKey = interaction.options.getString('secretkey').toUpperCase();
        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;

        try {
            // Buscar usuário pela secretKey
            const user = await this.usersCollection.findOne({ secretKey: secretKey });

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ SecretKey Inválida')
                    .setDescription(`A secretKey **${secretKey}** não foi encontrada.\n\nCertifique-se de que digitou corretamente.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar se já está vinculado a outro Discord
            if (user.discordId && user.discordId !== discordId) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Já Vinculado')
                    .setDescription(`Esta conta já está vinculada a outro Discord: <@${user.discordId}>`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar se este Discord já tem outra conta vinculada
            const otherAccount = await this.usersCollection.findOne({ 
                discordId: discordId,
                id: { $ne: user.id }
            });

            if (otherAccount) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Múltiplas Contas')
                    .setDescription(`Seu Discord já está vinculado ao ID **${otherAccount.id}** (${otherAccount.username})\n\nCada Discord pode ter apenas uma conta vinculada.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Vincular conta
            await this.usersCollection.updateOne(
                { id: user.id },
                { 
                    $set: { 
                        discordId: discordId,
                        discordUsername: discordUsername,
                        authorized: true,
                        linkedAt: new Date()
                    } 
                }
            );

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Conta Vinculada com Sucesso!')
                .addFields(
                    { name: '👤 Jogador', value: `\`${user.username}\``, inline: true },
                    { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
                    { name: '🎮 Discord', value: `${interaction.user}`, inline: true },
                    { name: '⏰ Vinculado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setDescription('Sua conta foi vinculada com sucesso! Agora você pode usar todos os comandos.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Conta vinculada: ${user.username} (ID: ${user.id}) -> Discord: ${discordUsername} (${discordId})`);

        } catch (error) {
            console.error('Erro ao registrar:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao vincular a conta.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /changename - Alterar nome por StumbleId (Admin) - PRESERVA TAGS
    async handleChangeNameByStumbleIdCommand(interaction) {
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        const stumbleId = interaction.options.getString('stumbleid').toUpperCase();
        const newBaseName = interaction.options.getString('newname');

        try {
            // Buscar usuário por StumbleId
            const user = await this.findUserByStumbleId(stumbleId);

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhum usuário encontrado com StumbleId: \`${stumbleId}\``)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Validar novo nome base
            const validation = this.validateUsername(newBaseName);
            if (!validation.valid) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Username Inválido')
                    .setDescription(validation.error)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Extrair nome base atual (sem tags) e tags existentes
            const currentBaseName = this.extractBaseUsername(user.username);
            const existingTags = this.extractTagsFromUsername(user.username);

            // Construir novo username: novo nome base + tags existentes
            let newFullUsername = newBaseName;
            existingTags.forEach(tag => {
                newFullUsername += tag;
            });

            // Validar se o novo username completo não excede limites
            if (newFullUsername.length > 12000) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Username Muito Longo')
                    .setDescription('O novo username com as tags existentes excede o limite de caracteres.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Atualizar username preservando as tags
            const success = await this.updateUsername(stumbleId, newFullUsername);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Username Alterado (Tags Preservadas)')
                    .addFields(
                        { name: '🆔 StumbleId', value: `\`${stumbleId}\``, inline: true },
                        { name: '👤 Nome Base Anterior', value: `\`${currentBaseName}\``, inline: true },
                        { name: '👤 Nome Base Novo', value: `\`${newBaseName}\``, inline: true },
                        { name: '🏷️ Tags Preservadas', value: existingTags.length > 0 ? `\`${existingTags.length} tag(s)\`` : '`Nenhuma tag`', inline: true },
                        { name: '👤 Username Completo', value: `\`${newFullUsername}\``, inline: false },
                        { name: '👮 Admin', value: `${interaction.user}`, inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                console.log(`✅ Username alterado preservando tags: ${user.username} -> ${newFullUsername} (Nome base: ${currentBaseName} -> ${newBaseName}, StumbleId: ${stumbleId})`);
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('Falha ao atualizar o username.')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Erro ao alterar username por StumbleId:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao alterar o username.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /addgems - Adicionar gems por StumbleId (Admin)
    async handleAddGemsCommand(interaction) {
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        const stumbleId = interaction.options.getString('stumbleid').toUpperCase();
        const amount = interaction.options.getInteger('amount');

        try {
            // Buscar usuário por StumbleId
            const user = await this.findUserByStumbleId(stumbleId);

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhum usuário encontrado com StumbleId: \`${stumbleId}\``)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Obter gems atuais
            const currentGems = user.balances?.find(b => b.name === 'gems')?.amount || 0;
            const newGems = currentGems + amount;

            // Atualizar gems
            await this.usersCollection.updateOne(
                { stumbleId: { $regex: new RegExp(`^${stumbleId}`, 'i') } },
                { 
                    $set: { 
                        'balances.$[elem].amount': newGems,
                        updatedAt: new Date()
                    } 
                },
                { 
                    arrayFilters: [{ 'elem.name': 'gems' }] 
                }
            );

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Gems Adicionadas')
                .addFields(
                    { name: '🆔 StumbleId', value: `\`${stumbleId}\``, inline: true },
                    { name: '👤 Jogador', value: `\`${user.username}\``, inline: true },
                    { name: '💎 Gems Anteriores', value: `\`${currentGems.toLocaleString()}\``, inline: true },
                    { name: '➕ Adicionado', value: `\`+${amount.toLocaleString()}\``, inline: true },
                    { name: '💎 Gems Atuais', value: `\`${newGems.toLocaleString()}\``, inline: true },
                    { name: '👮 Admin', value: `${interaction.user}`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Gems adicionadas: ${user.username} (${stumbleId}) +${amount} gems (${currentGems} -> ${newGems})`);

        } catch (error) {
            console.error('Erro ao adicionar gems:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao adicionar gems.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /remgems - Remover gems por StumbleId (Admin)
    async handleRemGemsCommand(interaction) {
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        const stumbleId = interaction.options.getString('stumbleid').toUpperCase();
        const amount = interaction.options.getInteger('amount');

        try {
            // Buscar usuário por StumbleId
            const user = await this.findUserByStumbleId(stumbleId);

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhum usuário encontrado com StumbleId: \`${stumbleId}\``)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Obter gems atuais
            const currentGems = user.balances?.find(b => b.name === 'gems')?.amount || 0;
            const newGems = Math.max(0, currentGems - amount);

            // Atualizar gems
            await this.usersCollection.updateOne(
                { stumbleId: { $regex: new RegExp(`^${stumbleId}`, 'i') } },
                { 
                    $set: { 
                        'balances.$[elem].amount': newGems,
                        updatedAt: new Date()
                    } 
                },
                { 
                    arrayFilters: [{ 'elem.name': 'gems' }] 
                }
            );

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('✅ Gems Removidas')
                .addFields(
                    { name: '🆔 StumbleId', value: `\`${stumbleId}\``, inline: true },
                    { name: '👤 Jogador', value: `\`${user.username}\``, inline: true },
                    { name: '💎 Gems Anteriores', value: `\`${currentGems.toLocaleString()}\``, inline: true },
                    { name: '➖ Removido', value: `\`-${amount.toLocaleString()}\``, inline: true },
                    { name: '💎 Gems Atuais', value: `\`${newGems.toLocaleString()}\``, inline: true },
                    { name: '👮 Admin', value: `${interaction.user}`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Gems removidas: ${user.username} (${stumbleId}) -${amount} gems (${currentGems} -> ${newGems})`);

        } catch (error) {
            console.error('Erro ao remover gems:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao remover gems.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando /ban - Banir/Desbanir por StumbleId (Admin)
    async handleBanCommand(interaction) {
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply();

        const stumbleId = interaction.options.getString('stumbleid').toUpperCase();
        const banned = interaction.options.getBoolean('banned');
        const reason = interaction.options.getString('reason') || 'Não especificado';

        try {
            // Buscar usuário por StumbleId
            const user = await this.findUserByStumbleId(stumbleId);

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhum usuário encontrado com StumbleId: \`${stumbleId}\``)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar se já está no estado desejado
            if (user.isBanned === banned) {
                const status = banned ? 'já está banido' : 'não está banido';
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Status Inalterado')
                    .setDescription(`O jogador **${user.username}** ${status}.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Atualizar status de ban
            await this.usersCollection.updateOne(
                { stumbleId: { $regex: new RegExp(`^${stumbleId}`, 'i') } },
                { 
                    $set: { 
                        isBanned: banned,
                        banReason: banned ? reason : null,
                        banDate: banned ? new Date() : null,
                        bannedBy: banned ? interaction.user.id : null,
                        unbannedBy: !banned ? interaction.user.id : null,
                        unbanDate: !banned ? new Date() : null,
                        updatedAt: new Date()
                    } 
                }
            );

            const action = banned ? 'Banido' : 'Desbanido';
            const color = banned ? '#FF0000' : '#00FF00';
            const emoji = banned ? '🔨' : '✅';

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${emoji} Jogador ${action}`)
                .addFields(
                    { name: '🆔 StumbleId', value: `\`${stumbleId}\``, inline: true },
                    { name: '👤 Jogador', value: `\`${user.username}\``, inline: true },
                    { name: '📝 Status', value: banned ? '`🚫 BANIDO`' : '`✅ ATIVO`', inline: true },
                    { name: '📋 Motivo', value: `\`${reason}\``, inline: false },
                    { name: '👮 Admin', value: `${interaction.user}`, inline: true },
                    { name: '⏰ Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Jogador ${action.toLowerCase()}: ${user.username} (${stumbleId}) - Motivo: ${reason}`);

        } catch (error) {
            console.error('Erro ao banir/desbanir:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao alterar o status de ban.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Sistema de tags unificado
    async handleTagCommand(interaction) {
        if (!this.hasPermission(interaction)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Você não tem permissão para usar este comando.')
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const stumbleId = interaction.options.getString('stumbleid');
        const action = interaction.options.getString('action');
        const tagName = interaction.options.getString('tagname');
        const newTagName = interaction.options.getString('newtagname');
        const format = interaction.options.getString('format');

        // Validar parâmetros baseado na ação
        if (action === 'add' || action === 'remove') {
            if (!tagName) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Parâmetro Obrigatório')
                    .setDescription(`Para ${action === 'add' ? 'adicionar' : 'remover'} uma tag, você deve especificar o parâmetro \`tagname\`.`)
                    .setTimestamp();

                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        if (action === 'create') {
            if (!newTagName || !format) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Parâmetros Obrigatórios')
                    .setDescription('Para criar uma tag, você deve especificar \`newtagname\` e \`format\`.')
                    .setTimestamp();

                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        switch (action) {
            case 'add':
                await this.handleTagAdd(interaction, stumbleId, tagName);
                break;
            case 'remove':
                await this.handleTagRemove(interaction, stumbleId, tagName);
                break;
            case 'create':
                await this.handleTagCreate(interaction, newTagName, format);
                break;
            case 'list':
                await this.handleTagList(interaction);
                break;
        }
    }

    // ✅ Adicionar tag ao final do nickname
    async handleTagAdd(interaction, stumbleId, tagName) {
        await interaction.deferReply();

        try {
            // Buscar usuário por StumbleId
            const user = await this.findUserByStumbleId(stumbleId.toUpperCase());

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhum usuário encontrado com StumbleId: \`${stumbleId}\``)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar se a tag existe
            const tagFormat = this.availableTags[tagName];
            if (!tagFormat) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Tag Não Encontrada')
                    .setDescription(`Tag \`${tagName}\` não existe.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar se já possui a tag
            if (this.hasSpecificTag(user.username, tagName)) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Tag Já Existe')
                    .setDescription(`O jogador \`${user.username}\` já possui a tag \`${tagName}\`.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Adicionar tag ao FINAL do username
            const newUsername = user.username + tagFormat;

            // Validar se o novo username não excede limites
            if (newUsername.length > 12000) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Username Muito Longo')
                    .setDescription('O username com a tag excede o limite de caracteres.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Atualizar username no banco de dados
            const success = await this.updateUsername(stumbleId.toUpperCase(), newUsername);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Tag Adicionada')
                    .addFields(
                        { name: '🆔 StumbleId', value: `\`${stumbleId}\``, inline: true },
                        { name: '👤 Username Anterior', value: `\`${user.username}\``, inline: true },
                        { name: '🏷️ Tag Aplicada', value: `\`${tagName}\``, inline: true },
                        { name: '👤 Novo Username', value: `\`${newUsername}\``, inline: false },
                        { name: '👮 Admin', value: `${interaction.user}`, inline: true },
                        { name: '⏰ Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                console.log(`✅ Tag adicionada: ${user.username} -> ${newUsername} (Tag: ${tagName}, StumbleId: ${stumbleId})`);
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('Falha ao atualizar o username.')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Erro ao adicionar tag:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao adicionar a tag.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Remover tag específica do nickname
    async handleTagRemove(interaction, stumbleId, tagName) {
        await interaction.deferReply();

        try {
            // Buscar usuário por StumbleId
            const user = await this.findUserByStumbleId(stumbleId.toUpperCase());

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Usuário Não Encontrado')
                    .setDescription(`Nenhum usuário encontrado com StumbleId: \`${stumbleId}\``)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Verificar se possui a tag específica
            if (!this.hasSpecificTag(user.username, tagName)) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Tag Não Encontrada')
                    .setDescription(`O jogador \`${user.username}\` não possui a tag \`${tagName}\`.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Remover apenas a tag específica
            const newUsername = this.removeSpecificTagFromUsername(user.username, tagName);

            // Atualizar username no banco de dados
            const success = await this.updateUsername(stumbleId.toUpperCase(), newUsername);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Tag Removida')
                    .addFields(
                        { name: '🆔 StumbleId', value: `\`${stumbleId}\``, inline: true },
                        { name: '👤 Username Anterior', value: `\`${user.username}\``, inline: true },
                        { name: '🏷️ Tag Removida', value: `\`${tagName}\``, inline: true },
                        { name: '👤 Novo Username', value: `\`${newUsername}\``, inline: false },
                        { name: '👮 Admin', value: `${interaction.user}`, inline: true },
                        { name: '⏰ Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                console.log(`✅ Tag removida: ${user.username} -> ${newUsername} (Tag: ${tagName}, StumbleId: ${stumbleId})`);
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro')
                    .setDescription('Falha ao atualizar o username.')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Erro ao remover tag:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao remover a tag.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Criar nova tag personalizada
    async handleTagCreate(interaction, tagName, tagFormat) {
        await interaction.deferReply();

        try {
            // Verificar se a tag já existe
            if (this.availableTags[tagName]) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Tag Já Existe')
                    .setDescription(`A tag \`${tagName}\` já existe.`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Validar nome da tag
            if (tagName.length < 2 || tagName.length > 20) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Nome Inválido')
                    .setDescription('O nome da tag deve ter entre 2 e 20 caracteres.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Validar formato da tag
            if (tagFormat.length > 500) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Formato Muito Longo')
                    .setDescription('O formato da tag não pode exceder 500 caracteres.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Adicionar nova tag ao objeto availableTags
            this.availableTags[tagName] = tagFormat;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Tag Criada')
                .addFields(
                    { name: '🏷️ Nome', value: `\`${tagName}\``, inline: true },
                    { name: '🎨 Formato', value: `\`${tagFormat}\``, inline: false },
                    { name: '👮 Criado por', value: `${interaction.user}`, inline: true },
                    { name: '⏰ Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setDescription('Tag criada com sucesso! Agora pode ser usada.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Tag criada: ${tagName} por ${interaction.user.username}`);

        } catch (error) {
            console.error('Erro ao criar tag:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao criar a tag.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Listar todas as tags disponíveis
    async handleTagList(interaction) {
        await interaction.deferReply();

        try {
            const tagNames = Object.keys(this.availableTags);

            if (tagNames.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('📋 Nenhuma Tag Encontrada')
                    .setDescription('Não há tags disponíveis no momento.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            let description = '**🏷️ Tags Disponíveis:**\n\n';
            tagNames.forEach(tagName => {
                description += `• \`${tagName}\`\n`;
            });

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📋 Tags Disponíveis')
                .setDescription(description)
                .addFields(
                    { name: '📊 Total', value: `\`${tagNames.length}\` tags`, inline: true },
                    { name: '💡 Como usar', value: '`/tag <id> add <tag>`\n`/tag <id> remove <tag>`', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao listar tags:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao listar as tags.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando admin - Gerenciar lista de administradores
    async handleAdminCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // Lista de super admins que podem gerenciar a lista de admins
        const SUPER_ADMINS = ['YOUR_DISCORD_ID_HERE']; // Substitua pelo seu Discord ID
        
        if (!SUPER_ADMINS.includes(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Sem Permissão')
                .setDescription('Apenas super administradores podem gerenciar a lista de admins.')
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed] });
        }

        const action = interaction.options.getString('action');
        const userId = interaction.options.getInteger('userid');

        try {
            // Arquivo onde a lista de admins está armazenada
            const fs = require('fs');
            const path = require('path');
            const adminFilePath = path.join(__dirname, 'admin-list.json');
            
            // Carregar lista atual de admins
            let adminList = { admins: [1, 7] }; // IDs padrão
            if (fs.existsSync(adminFilePath)) {
                adminList = JSON.parse(fs.readFileSync(adminFilePath, 'utf8'));
            }

            if (action === 'add') {
                if (!userId) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Erro')
                        .setDescription('Você precisa especificar o ID do usuário.')
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                if (adminList.admins.includes(userId)) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Já é Admin')
                        .setDescription(`O usuário ID ${userId} já está na lista de administradores.`)
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                adminList.admins.push(userId);
                fs.writeFileSync(adminFilePath, JSON.stringify(adminList, null, 2));

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Admin Adicionado')
                    .setDescription(`Usuário ID ${userId} foi adicionado à lista de administradores.`)
                    .addFields(
                        { name: '📋 Lista Atual', value: adminList.admins.join(', '), inline: false }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                console.log(`✅ Admin adicionado: ID ${userId}`);

            } else if (action === 'remove') {
                if (!userId) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Erro')
                        .setDescription('Você precisa especificar o ID do usuário.')
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                const index = adminList.admins.indexOf(userId);
                if (index === -1) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Não é Admin')
                        .setDescription(`O usuário ID ${userId} não está na lista de administradores.`)
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                adminList.admins.splice(index, 1);
                fs.writeFileSync(adminFilePath, JSON.stringify(adminList, null, 2));

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Admin Removido')
                    .setDescription(`Usuário ID ${userId} foi removido da lista de administradores.`)
                    .addFields(
                        { name: '📋 Lista Atual', value: adminList.admins.length > 0 ? adminList.admins.join(', ') : 'Nenhum admin', inline: false }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                console.log(`✅ Admin removido: ID ${userId}`);

            } else if (action === 'list') {
                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('📋 Lista de Administradores')
                    .setDescription(adminList.admins.length > 0 ? `IDs: ${adminList.admins.join(', ')}` : 'Nenhum administrador cadastrado')
                    .addFields(
                        { name: '👥 Total', value: `${adminList.admins.length} admin(s)`, inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Erro ao gerenciar admins:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao gerenciar a lista de administradores.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ✅ Comando help
    async handleHelpCommand(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🤖 Comandos Disponíveis - Stumble Ranked')
            .setDescription('Lista de comandos do bot')
            .addFields(
                { 
                    name: '🔗 Vinculação Discord', 
                    value: '`/register <secretkey>` - Registrar sua conta com a secretKey do jogo\n`/r <chave>` - Registrar chave de vinculação (legado)\n`/search <nome_ou_id>` - Pesquisar jogador por nome ou ID', 
                    inline: false 
                },
                { 
                    name: '�  Perfil', 
                    value: '`/changeusername <nome>` - Alterar username (3x/semana)\n`/resetc <user>` - Resetar contador (Admin)', 
                    inline: false 
                },
                { 
                    name: '⚡ Comandos Admin por StumbleId', 
                    value: '`/changename <stumbleid> <nome>` - Alterar nome\n`/addgems <stumbleid> <qtd>` - Adicionar gems\n`/remgems <stumbleid> <qtd>` - Remover gems\n`/ban <stumbleid> <true/false> [motivo]` - Banir/Desbanir', 
                    inline: false 
                },
                { 
                    name: '🏷️ Sistema de Tags', 
                    value: '`/tag add <stumbleid> <tag>` - Adicionar tag ao final do nickname\n`/tag remove <stumbleid> <tag>` - Remover tag específica\n`/tag create <nome> <formato>` - Criar tag personalizada\n`/tag list` - Listar tags disponíveis', 
                    inline: false 
                },
                { 
                    name: '💎 Economia (Legado)', 
                    value: '`/gems add <user> <qtd>` - Adicionar gems\n`/gems rem <user> <qtd>` - Remover gems\n`/gems set <user> <qtd>` - Definir gems', 
                    inline: false 
                },
                { 
                    name: '🔍 Informações', 
                    value: '`/findplayer <id>` - Buscar jogador\n`/list [page] [limit]` - Listar usuários\n`/listcompact [page] [limit]` - Lista compacta\n`/stats` - Estatísticas', 
                    inline: false 
                },
                { 
                    name: '📋 Tags Padrão', 
                    value: '• StarFall - Tag de vencedor verde\n• Iron - Tag de vencedor ferro/prata\n• Hyper - Tag de vencedor azul/ciano\n• Série A - Tag azul da Série A\n• Série S - Tag vermelha da Série S\n• sStar - Tag roxa de estrela', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Stumble Ranked Backend Bot' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ✅ Iniciar bot
    async start() {
        try {
            if (!this.BOT_TOKEN) {
                throw new Error('BOT_TOKEN não encontrado no arquivo .env');
            }

            if (!this.MONGO_URI) {
                throw new Error('mongoUri não encontrado no arquivo .env');
            }

            console.log('🚀 Iniciando bot Discord...');
            await this.client.login(this.BOT_TOKEN);
        } catch (error) {
            console.error('❌ Erro ao iniciar bot:', error.message);
            process.exit(1);
        }
    }

    // ✅ Encerrar bot graciosamente
    async shutdown() {
        console.log('👋 Encerrando bot...');
        
        if (this.mongoClient) {
            await this.mongoClient.close();
            console.log('✅ MongoDB desconectado');
        }
        
        this.client.destroy();
        console.log('✅ Bot encerrado');
    }
}

// ✅ Tratamento de erros
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// ✅ Encerramento gracioso
process.on('SIGINT', async () => {
    if (bot) {
        await bot.shutdown();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (bot) {
        await bot.shutdown();
    }
    process.exit(0);
});

// ✅ Inicializar bot
const bot = new StumbleRankedBot();
bot.start();

module.exports = StumbleRankedBot;
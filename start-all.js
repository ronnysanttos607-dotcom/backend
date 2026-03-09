const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando Stumble Born Backend + Discord Bot...\n');

// Função para criar processo com logs coloridos
function createProcess(name, script, color) {
    const process = spawn('node', [script], {
        stdio: 'pipe',
        cwd: __dirname
    });

    // Função para adicionar cor aos logs
    const colorize = (text, colorCode) => `\x1b[${colorCode}m${text}\x1b[0m`;
    
    const colors = {
        backend: '36', // Cyan
        bot: '35',     // Magenta
        error: '31'    // Red
    };

    process.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
            console.log(colorize(`[${name.toUpperCase()}]`, colors[color] || '37'), line);
        });
    });

    process.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
            console.log(colorize(`[${name.toUpperCase()} ERROR]`, colors.error), line);
        });
    });

    process.on('close', (code) => {
        console.log(colorize(`[${name.toUpperCase()}]`, colors[color] || '37'), `Processo encerrado com código ${code}`);
    });

    return process;
}

// Iniciar Backend
console.log('🎮 Iniciando Backend...');
const backendProcess = createProcess('backend', 'index.js', 'backend');

// Aguardar um pouco antes de iniciar o bot
setTimeout(() => {
    console.log('🤖 Iniciando Discord Bot...');
    const botProcess = createProcess('bot', 'discord-bot.js', 'bot');
    
    // Tratamento de encerramento gracioso
    process.on('SIGINT', () => {
        console.log('\n👋 Encerrando todos os processos...');
        
        backendProcess.kill('SIGINT');
        botProcess.kill('SIGINT');
        
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n👋 Encerrando todos os processos...');
        
        backendProcess.kill('SIGTERM');
        botProcess.kill('SIGTERM');
        
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    });
    
}, 3000);

console.log('\n📋 Comandos úteis:');
console.log('   Ctrl+C - Encerrar todos os processos');
console.log('   Backend: http://localhost:3009');
console.log('   Bot: Verifique logs acima\n');
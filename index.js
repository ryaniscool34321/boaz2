const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// --- CONFIGURATION ---
const CHANNEL_ID = '1480419147019063366'; // Replace with your Discord Channel ID
const PORT = 3000;

// --- INITIALIZATION ---
const db = new Database('database.db');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

// Setup Database Tables
db.prepare("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, rank INTEGER DEFAULT 1)").run();

let chatClosed = false;

// --- WEB SERVER LOGIC ---
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('A user connected to the web chat');

    socket.on('chat message', async (msg) => {
        // Fetch rank from DB based on a simulated ID or username
        const userAccount = db.prepare("SELECT * FROM accounts WHERE id = ?").get(msg.userId);
        const rank = userAccount ? userAccount.rank : 1;

        // Block Rank 1 if chat is closed
        if (chatClosed && rank === 1) {
            socket.emit('error', 'Chat is currently closed for normal accounts.');
            return;
        }

        // Send message to Discord
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (channel) {
            channel.send(`**[Web] ${msg.user}**: ${msg.text}`);
        }
    });
});

// --- DISCORD BOT LOGIC ---
client.once('ready', () => {
    console.log(`Bot online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userAccount = db.prepare("SELECT * FROM accounts WHERE id = ?").get(message.author.id);

    // 1. Account Management
    if (command === '!makeaccount') {
        db.prepare("INSERT OR IGNORE INTO accounts (id, rank) VALUES (?, 1)").run(message.author.id);
        return message.reply("Account created! Rank: 1 (Normal)");
    }

    if (command === '!deleteaccount') {
        db.prepare("DELETE FROM accounts WHERE id = ?").run(message.author.id);
        return message.reply("Account deleted.");
    }

    // 2. Rank Management (Admin only)
    if (command === '!setadmin' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const target = message.mentions.users.first();
        if (!target) return message.reply("Mention a user.");
        db.prepare("INSERT OR REPLACE INTO accounts (id, rank) VALUES (?, 2)").run(target.id);
        return message.reply(`${target.username} is now Rank 2 (Admin).`);
    }

    // 3. Chat Control
    if (command === '!closechat' && userAccount?.rank === 2) {
        chatClosed = true;
        io.emit('status', 'Chat has been closed by an Admin.');
        return message.reply("Chat is now CLOSED to Rank 1.");
    }

    if (command === '!openchat' && userAccount?.rank === 2) {
        chatClosed = false;
        io.emit('status', 'Chat is now open!');
        return message.reply("Chat is now OPEN.");
    }

    // 4. Sync Discord message to Web Chat
    io.emit('chat message', { user: message.author.username, text: message.content });

    // 5. Enforcement for Discord Chat
    if (chatClosed && (!userAccount || userAccount.rank === 1)) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await message.delete();
        }
    }
});

server.listen(PORT, () => {
    console.log(`Web server active at http://localhost:${PORT}`);
});

client.login(process.env.TOKEN);

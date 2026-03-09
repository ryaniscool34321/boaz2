const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// --- CONFIGURATION ---
const CHANNEL_ID = '1480419147019063366'; // Your Channel ID
const PORT = process.env.PORT || 3000;

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

// Setup Database
db.prepare("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, rank INTEGER DEFAULT 1)").run();
let chatClosed = false;

// --- WEB SERVER ---
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/ping', (req, res) => res.send("Bot is online!"));

io.on('connection', (socket) => {
    socket.on('chat message', async (msg) => {
        // Find user rank in DB (assuming msg.userId is passed from the web)
        const userAccount = db.prepare("SELECT * FROM accounts WHERE id = ?").get(msg.userId);
        const rank = userAccount ? userAccount.rank : 1;

        if (chatClosed && rank === 1) {
            return socket.emit('error', 'Chat is currently closed for your rank.');
        }

        const channel = await client.channels.fetch(CHANNEL_ID);
        if (channel) {
            channel.send(`**[Web] ${msg.user}**: ${msg.text}`);
        }
    });
});

// --- DISCORD LOGIC ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userAccount = db.prepare("SELECT * FROM accounts WHERE id = ?").get(message.author.id);

    // 1. Account Management
    if (message.content === '!makeaccount') {
        db.prepare("INSERT OR IGNORE INTO accounts (id, rank) VALUES (?, 1)").run(message.author.id);
        return message.reply("Account created! You are Rank 1 (Normal).");
    }

    // 2. Admin Controls (Only Rank 2 can close/open)
    if (message.content === '!closechat' && userAccount?.rank === 2) {
        chatClosed = true;
        io.emit('chat message', { user: "SYSTEM", text: "The chat has been CLOSED by an Admin." });
        return message.reply("Chat is now CLOSED to Rank 1 users.");
    }
    
    if (message.content === '!openchat' && userAccount?.rank === 2) {
        chatClosed = false;
        io.emit('chat message', { user: "SYSTEM", text: "The chat is now OPEN." });
        return message.reply("Chat is now OPEN for everyone.");
    }

    // 3. Sync Discord messages to Web Chat
    io.emit('chat message', { user: message.author.username, text: message.content });
});

server.listen(PORT, () => console.log(`Server live on port ${PORT}`));

// --- LOGIN USING T0KEN ---
// Matches your Environment Variable name exactly
client.login(process.env.T0KEN); 

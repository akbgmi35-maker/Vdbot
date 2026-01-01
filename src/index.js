const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { videoQueue } = require('./queue');

// --- Configuration ---
const BOT_TOKEN = process.env.BOT_TOKEN;
// Default to the container name defined in docker-compose
const API_ROOT = process.env.TELEGRAM_API_ROOT || 'http://telegram-api-server:8081';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

console.log('--- Bot Configuration ---');
console.log(`Target API: ${API_ROOT}`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    apiRoot: API_ROOT
  }
});

const app = express();
app.use(cors());
app.use('/stream', express.static(path.join(__dirname, '../media_output')));
app.get('/', (req, res) => res.send('Transcoder Bot is Running'));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`File server running on port ${PORT}`);
});

// --- Connection Retry Logic ---
async function startBot() {
    let retries = 20; // Try for 40 seconds (20 * 2s)
    
    while (retries > 0) {
        try {
            console.log(`Attempting to connect to Telegram API (${retries} retries left)...`);
            // We use getMe to test the connection explicitly before launching
            const me = await bot.telegram.getMe();
            console.log(`✅ Connected! Logged in as ${me.username}`);
            
            // If we get here, connection works. Launch the bot.
            bot.launch();
            console.log('🚀 Bot started polling.');
            return; // Exit loop
            
        } catch (err) {
            const msg = err.message || err.toString();
            console.log(`⚠️ Connection failed: ${msg}`);
            
            // Check for specific errors
            if (msg.includes('EAI_AGAIN')) {
                console.log('   (DNS lookup failed - Container starting up?)');
            } else if (msg.includes('401') || msg.includes('Unauthorized')) {
                console.error('❌ ERROR 401: You must log out your bot from the official cloud server first!');
                console.error(`   Run this in browser: https://api.telegram.org/bot${BOT_TOKEN}/logOut`);
                return; // Stop retrying if it's an auth error
            }

            retries--;
            await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
        }
    }
    console.error('❌ Could not connect to API server after multiple attempts. Exiting.');
    process.exit(1);
}

// --- Bot Events ---
bot.start((ctx) => ctx.reply('Send me a video file. I will convert it to HLS (m3u8).'));

bot.on('video', async (ctx) => {
  console.log(`Video received: ${ctx.message.video.file_name}`);
  const fileId = ctx.message.video.file_id;
  const fileName = ctx.message.video.file_name || `video_${Date.now()}.mp4`;
  const fileSize = ctx.message.video.file_size;

  try {
      const statusMsg = await ctx.reply(`🎥 Video received. Added to queue... (Position: ${videoQueue.getStats().total})`);
      videoQueue.push({
        ctx: ctx,
        fileId: fileId,
        fileName: fileName,
        fileSize: fileSize,
        chatId: ctx.chat.id,
        messageId: statusMsg.message_id
      });
  } catch (err) {
      console.error('Error in video handler:', err);
  }
});

// Start the sequence
startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
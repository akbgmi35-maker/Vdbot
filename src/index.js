const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { videoQueue } = require('./queue');

// --- Configuration ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_ROOT = process.env.TELEGRAM_API_ROOT || 'http://telegram-bot-api:8081';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

// --- Supabase Setup ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Bot Setup with Local API ---
const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    apiRoot: API_ROOT
  }
});

// --- Express Server for HLS Files ---
const app = express();
app.use(cors());

// Serve the media_output folder statically so .m3u8 files are accessible
app.use('/stream', express.static(path.join(__dirname, '../media_output')));

app.get('/', (req, res) => res.send('Transcoder Bot is Running'));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`File server running on port ${PORT}`);
});

// --- Bot Logic ---

bot.start((ctx) => ctx.reply('Send me a video file (even >2GB). I will convert it to HLS (m3u8).'));

bot.on('video', async (ctx) => {
  const fileId = ctx.message.video.file_id;
  const fileName = ctx.message.video.file_name || `video_${Date.now()}.mp4`;
  const fileSize = ctx.message.video.file_size;

  // Initial reply
  const statusMsg = await ctx.reply(`🎥 Video received. Added to queue... (Position: ${videoQueue.getStats().total})`);

  // Add to Queue
  videoQueue.push({
    ctx: ctx, // Pass context to reply later
    fileId: fileId,
    fileName: fileName,
    fileSize: fileSize,
    chatId: ctx.chat.id,
    messageId: statusMsg.message_id
  });
});

// Handle launch errors gracefully
bot.launch().catch(err => {
  console.error('Bot launch failed:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
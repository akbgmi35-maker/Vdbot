Telegram Video Transcoder Bot (VPS + Coolify)
This bot bypasses the Telegram 20MB download limit by using a Local Telegram Bot API Server. It downloads videos, transcodes them to HLS (240p-1080p), and serves a .m3u8 link.
Prerequisites
 * Telegram API ID & Hash: Get these from my.telegram.org.
 * Bot Token: Get from @BotFather.
 * Supabase: A project with a table named videos.
 * Coolify/VPS: Docker and Docker Compose installed.
Supabase Table Setup
Run this SQL in your Supabase SQL Editor:
create table videos (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  telegram_file_id text,
  original_name text,
  hls_url text,
  status text
);

Deployment on Coolify (or standard Docker)
 * Environment Variables:
   Add the following variables to your .env file or Coolify Environment Variables section:
   TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_api_hash_here
BOT_TOKEN=123456:ABC-DefGhIjkLmNoPqrStUvWxYz
# The URL where your VPS is accessible (Bot port 3000)
PUBLIC_URL=[https://your-bot-domain.com](https://your-bot-domain.com)
SUPABASE_URL=[https://xyz.supabase.co](https://xyz.supabase.co)
SUPABASE_KEY=your_service_role_key

 * Deploy:
   * Coolify: Create a new Service -> Docker Compose. Paste the contents of docker-compose.yml. Add the Environment Variables. Deploy.
   * Manual: Run docker-compose up -d --build.
How it Works (The Bypass)
 * We run aiogram/telegram-bot-api as a sidecar container.
 * The Bot connects to this local server instead of api.telegram.org.
 * When you send a large file, the local server handles the download to a volume (telegram-data).
 * The Bot container mounts this same volume, allowing it to read the file directly from the disk using ffmpeg without downloading it over HTTP again.
Usage
 * Start the bot: /start.
 * Send a video file (any size up to 2GB).
 * The bot will update the status message as it queues, transcodes, and finishes.
 * You will get a link like https://your-domain.com/stream/uuid/master.m3u8.

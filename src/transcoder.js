const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

// The path where the Local Bot API server stores files (mapped volume)
// In aiogram/telegram-bot-api, default is /var/lib/telegram-bot-api
const LOCAL_API_DIR = '/var/lib/telegram-bot-api';

async function processVideo(task, updateProgress) {
  const { ctx, fileId, fileName, messageId, chatId } = task;
  const jobId = uuidv4();
  const outputDir = path.join(__dirname, '../media_output', jobId);

  // 1. Get File Path from API
  await updateProgress(chatId, messageId, ctx, '📥 Locating file on local server...');
  
  // We use getFile to get the path relative to the bot api root
  const fileInfo = await ctx.telegram.getFile(fileId);
  // fileInfo.file_path usually looks like "videos/file_123.mp4"
  // The absolute path on the shared volume is LOCAL_API_DIR + / + BOT_TOKEN + / + fileInfo.file_path
  const token = process.env.BOT_TOKEN;
  const sourcePath = path.join(LOCAL_API_DIR, token, fileInfo.file_path);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`File not found on local volume at ${sourcePath}. Ensure volumes are mapped correctly.`);
  }

  // 2. Prepare Output Directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 3. Transcode
  await updateProgress(chatId, messageId, ctx, '⚙️ Transcoding started... (This may take a while)');

  return new Promise((resolve, reject) => {
    // Define qualities
    const renditions = [
      { w: 426, h: 240, bitrate: '400k' },
      { w: 640, h: 360, bitrate: '800k' },
      { w: 854, h: 480, bitrate: '1400k' },
      { w: 1280, h: 720, bitrate: '2800k' },
      { w: 1920, h: 1080, bitrate: '5000k' }
    ];

    let command = ffmpeg(sourcePath).native();

    // Map all audio streams found in input (0:a) to output
    // We will use a complex filter to generate the video scalings
    // and map the audio to every variant.
    
    // Create master playlist logic manually via fluent-ffmpeg is complex, 
    // so we will loop to create variants and then write master manually.
    // However, to keep it simple and robust, we use the "master playlist" feature of HLS muxer.

    // Using var_stream_map is the standard way for multi-variant HLS in one pass.
    
    // Construct filter_complex
    let filterComplex = '';
    let mapCmds = [];
    let varStreamMap = '';

    renditions.forEach((r, index) => {
      // Scaling
      filterComplex += `[0:v:0]scale=w=${r.w}:h=${r.h}:force_original_aspect_ratio=decrease[v${index}];`;
      // Mapping
      mapCmds.push(`-map`, `[v${index}]`, `-map`, `0:a:0`); // Mapping first audio track to all. 
      // Note: Mapping MULTIPLE audio tracks to HLS variants dynamically is extremely prone to breaking 
      // if the input doesn't have them. We map the primary audio (0:a:0) to all variants for safety.
      
      // Stream Map string
      // "v:0,a:0 v:1,a:1 ..."
      varStreamMap += `v:${index},a:${index} `;
    });

    // Remove trailing semicolon and space
    filterComplex = filterComplex.slice(0, -1);
    varStreamMap = varStreamMap.trim();

    command
      .complexFilter(filterComplex)
      .outputOptions(mapCmds)
      .outputOptions([
        '-c:v libx264',
        '-crf 23',
        '-preset veryfast',
        '-g 48', // Keyframe interval (GOP)
        '-sc_threshold 0',
        '-c:a aac',
        '-b:a 128k',
        '-ac 2',
        '-f hls',
        '-hls_time 4',
        '-hls_playlist_type vod',
        '-hls_flags independent_segments',
        `-var_stream_map ${varStreamMap}`,
        `-master_pl_name master.m3u8`
      ]);
      
      // Set bitrate options for each stream
      renditions.forEach((r, index) => {
         command.outputOptions([`-b:v:${index} ${r.bitrate}`, `-maxrate:v:${index} ${r.bitrate}`, `-bufsize:v:${index} ${r.bitrate}`]);
      });

    command
      .on('start', (cmdLine) => {
        console.log('FFmpeg started:', cmdLine);
      })
      .on('progress', (progress) => {
        // Only update telegram every 10% to avoid flooding API
        if (progress.percent && Math.floor(progress.percent) % 10 === 0) {
           updateProgress(chatId, messageId, ctx, `⚙️ Transcoding: ${Math.floor(progress.percent)}% done`);
        }
      })
      .on('error', (err) => {
        console.error('FFmpeg Error:', err);
        reject(err);
      })
      .on('end', async () => {
        console.log('Transcoding finished!');
        
        const resultLink = `${PUBLIC_URL}/stream/${jobId}/master.m3u8`;

        // 4. Update Supabase
        try {
          await supabase.from('videos').insert({
            telegram_file_id: fileId,
            original_name: fileName,
            hls_url: resultLink,
            status: 'completed'
          });
        } catch (dbErr) {
          console.error('Supabase error', dbErr);
        }

        // 5. Final Reply
        await updateProgress(chatId, messageId, ctx, `✅ **Processing Complete!**\n\n🔗 **HLS Link:**\n${resultLink}`);
        resolve();
      })
      .save(path.join(outputDir, 'stream_%v.m3u8')); // The %v creates stream_0.m3u8, stream_1.m3u8...
  });
}

module.exports = { processVideo };
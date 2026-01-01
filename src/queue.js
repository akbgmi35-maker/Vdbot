const Queue = require('better-queue');
const { processVideo } = require('./transcoder');

// Initialize Queue
// concurrent: 1 ensures videos are processed one by one
const videoQueue = new Queue(async (task, cb) => {
  const { ctx, fileId, fileName, messageId, chatId } = task;

  try {
    await processVideo(task, updateProgress);
    cb(null, 'Done');
  } catch (error) {
    console.error('Job failed:', error);
    try {
        await ctx.telegram.editMessageText(chatId, messageId, null, `❌ Error processing video: ${error.message}`);
    } catch (e) { /* ignore edit error */ }
    cb(error);
  }
}, { concurrent: 1 });

// Helper to update Telegram message
const updateProgress = async (chatId, messageId, ctx, text) => {
  try {
    // Telegraf's editMessageText helper
    await ctx.telegram.editMessageText(chatId, messageId, null, text);
  } catch (err) {
    // Ignore "message is not modified" errors that happen if we update too fast
    if (!err.description.includes('message is not modified')) {
      console.error('Update progress error:', err.message);
    }
  }
};

module.exports = { videoQueue };
const mongoose = require('mongoose');

const promptSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  promptText: { type: String, required: true },
  negativePrompt: { type: String, default: '' },
  aiModel: { type: String, required: true },
  industry: { type: String, required: true },
  topic: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  isTrending: { type: Boolean, default: false },
  isPromptOfDay: { type: Boolean, default: false }, // ✅ ADDED - For Prompt of the Day feature
  copyCount: { type: Number, default: 0 },
  mediaUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Prompt', promptSchema);
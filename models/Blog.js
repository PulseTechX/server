const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  excerpt: { type: String, required: true },
  content: { type: String, required: true },
  coverImage: { type: String, required: true },
  author: { type: String, default: 'Admin' },
  category: { type: String, required: true },
  tags: [{ type: String }],
  isPublished: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ Remove the pre hook entirely - updatedAt will update on save automatically
// Or use this simpler version:
blogSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Blog', blogSchema);
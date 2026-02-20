const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Collection title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  slug: { 
    type: String, 
    required: [true, 'Slug is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  description: { 
    type: String, 
    required: [true, 'Description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  coverImage: { 
    type: String, 
    required: [true, 'Cover image is required'],
    trim: true
  },
  prompts: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Prompt'
  }],
  category: { 
    type: String, 
    required: [true, 'Category is required'],
    trim: true
  },
  isPublished: { 
    type: Boolean, 
    default: false 
  },
  views: { 
    type: Number, 
    default: 0,
    min: 0
  },
  downloads: { 
    type: Number, 
    default: 0,
    min: 0
  }
}, {
  timestamps: true  // ✅ This adds createdAt and updatedAt automatically
});

// ============================================
// 📝 INDEXES FOR BETTER PERFORMANCE
// ============================================

// ❌ REMOVE: collectionSchema.index({ slug: 1 }); - duplicate with unique: true
collectionSchema.index({ category: 1 });
collectionSchema.index({ isPublished: 1 });
collectionSchema.index({ isPublished: 1, createdAt: -1 });

// ============================================
// 🔧 PRE-SAVE MIDDLEWARE (FIXED - NO next() in async)
// ============================================

collectionSchema.pre('save', async function() {
  // Update timestamp
  this.updatedAt = Date.now();
  
  // Generate slug from title if not provided or if title changed
  if (!this.slug || this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    
    // Ensure unique slug (only for new documents)
    if (this.isNew) {
      const existingCollection = await this.constructor.findOne({ slug: this.slug });
      if (existingCollection) {
        // Add timestamp to make slug unique
        this.slug = `${this.slug}-${Date.now()}`;
      }
    }
  }
  
  // ✅ NO next() call - async functions handle completion automatically
});

// ============================================
// 🛠️ INSTANCE METHODS
// ============================================

collectionSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

collectionSchema.methods.incrementDownloads = function() {
  this.downloads += 1;
  return this.save();
};

// ============================================
// 📈 STATIC METHODS
// ============================================

collectionSchema.statics.findPublished = function() {
  return this.find({ isPublished: true }).sort({ createdAt: -1 });
};

collectionSchema.statics.findByCategory = function(category) {
  return this.find({ category, isPublished: true }).sort({ createdAt: -1 });
};

// ============================================
// 🚀 EXPORT MODEL
// ============================================

module.exports = mongoose.model('Collection', collectionSchema);
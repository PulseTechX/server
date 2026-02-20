require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('mongo-sanitize');
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');
const Prompt = require('./models/Prompt');
const Blog = require('./models/Blog');
const Collection = require('./models/Collection');

const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ============================================
// 🔒 SECURITY MIDDLEWARE
// ============================================

// Helmet - Secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// ✅ NEW (Flexible CORS - handles trailing slash issues)
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Define allowed origins (with and without trailing slash)
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL + '/',
      'http://localhost:3000',
      'http://localhost:3000/'
    ].filter(Boolean);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
}));

// Rate Limiting - 5x INCREASED FOR STARTING PHASE
const isDevelopment = process.env.NODE_ENV !== 'production';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 500 : 100,
  message: '❌ Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 100 : 20,
  message: '❌ Too many admin requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/prompts', adminLimiter);
app.use('/api/blogs', adminLimiter);
app.use('/api/collections', adminLimiter);

// Body Parser - Limit request size
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB Sanitization - Prevent NoSQL injection
app.use((req, res, next) => {
  if (req.body) {
    req.body = mongoSanitize(req.body);
  }
  if (req.query) {
    req.query = mongoSanitize(req.query);
  }
  next();
});

// ============================================
// ☁️ CLOUDINARY CONFIGURATION
// ============================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('☁️ Cloudinary Config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing',
  api_key: process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing',
  api_secret: process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing'
});

// ============================================
// 📦 FILE UPLOAD CONFIGURATION (Manual Upload)
// ============================================

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// Configure multer for local storage (temporary)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('❌ Only image and video files are allowed'));
  }
});

// Helper function to upload to Cloudinary manually
const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(file.path, {
      folder: 'prompt-app',
      resource_type: 'auto',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    }, (error, result) => {
      if (error) {
        reject(error);
      } else {
        fs.unlink(file.path, (err) => {
          if (err) console.error('⚠️ Error deleting local file:', err);
        });
        resolve(result);
      }
    });
  });
};

// ============================================
// 🗄️ DATABASE CONNECTION (Secured)
// ============================================
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ MongoDB Error:", err.message);
    process.exit(1);
  });

// ============================================
// 🛡️ SECURITY HELPER FUNCTIONS
// ============================================

const verifyAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  
  const isValid = adminKey && 
    adminKey.length === process.env.ADMIN_SECRET?.length && 
    adminKey === process.env.ADMIN_SECRET;
  
  if (!isValid) {
    console.warn(`⚠️ Unauthorized access attempt from IP: ${req.ip}`);
    return res.status(403).json({ message: '❌ Unauthorized' });
  }
  
  next();
};

const validateInput = (data, requiredFields) => {
  const errors = [];
  
  requiredFields.forEach(field => {
    if (!data[field] || data[field].trim() === '') {
      errors.push(`${field} is required`);
    }
  });
  
  return errors;
};

// ============================================
// 📡 API ROUTES (Secured)
// ============================================

// Health Check (Public)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: '✅ OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Get All Prompts (Public)
app.get('/api/prompts', async (req, res) => {
  try {
    const { model, industry, topic, trending } = req.query;
    let query = {};

    if (model && model !== 'All') query.aiModel = model;
    if (industry && industry !== 'All') query.industry = industry;
    if (topic && topic !== 'All') query.topic = topic;
    if (trending === 'true') query.isTrending = true;

    const prompts = await Prompt.find(query).sort({ createdAt: -1 });
    res.json(prompts);
  } catch (error) {
    console.error('❌ Get Prompts Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Prompt of the Day (Public)
app.get('/api/prompts/prompt-of-the-day', async (req, res) => {
  try {
    let prompt = await Prompt.findOne({ isPromptOfDay: true });
    
    if (!prompt) {
      prompt = await Prompt.findOne({ isTrending: true }).sort({ createdAt: -1 });
    }
    
    if (!prompt) {
      prompt = await Prompt.findOne().sort({ createdAt: -1 });
    }
    
    res.json(prompt || { message: 'No prompts available' });
  } catch (error) {
    console.error('❌ Get Prompt of the Day Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Single Prompt (Public)
app.get('/api/prompts/:id', async (req, res) => {
  try {
    const prompt = await Prompt.findById(req.params.id);
    if (!prompt) {
      return res.status(404).json({ message: '❌ Prompt not found' });
    }
    res.json(prompt);
  } catch (error) {
    console.error('❌ Get Single Prompt Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Increment Copy Count (Public) - FIXED: No deprecation warning
app.post('/api/prompts/:id/copy', async (req, res) => {
  try {
    const result = await Prompt.findByIdAndUpdate(
      req.params.id,
      { $inc: { copyCount: 1 } },
      { returnDocument: 'after' }  // ✅ Updated from 'new: true'
    );
    
    res.json({ message: '✅ Copy count incremented', newCount: result.copyCount });
  } catch (error) {
    console.error('❌ Increment Copy Count Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create Prompt (Admin Only - SECURED)
app.post('/api/prompts', verifyAdmin, upload.single('media'), async (req, res) => {
  try {
    const { title, promptText, aiModel, industry, topic } = req.body;
    const errors = validateInput(req.body, ['title', 'promptText', 'aiModel', 'industry', 'topic']);
    
    if (errors.length > 0) {
      return res.status(400).json({ message: '❌ Validation failed', errors });
    }

    if (!req.file) {
      return res.status(400).json({ message: '❌ No file uploaded' });
    }

    const uploadResult = await uploadToCloudinary(req.file);
    const mediaUrl = uploadResult.secure_url;

    const sanitizedData = {
      title: title.trim(),
      description: req.body.description?.trim() || '',
      promptText: promptText.trim(),
      negativePrompt: req.body.negativePrompt?.trim() || '',
      aiModel: aiModel.trim(),
      industry: industry.trim(),
      topic: topic.trim(),
      mediaType: req.body.mediaType || 'image',
      isTrending: req.body.isTrending === 'true',
      isPromptOfDay: req.body.isPromptOfDay === 'true',
      mediaUrl: mediaUrl
    };

    if (sanitizedData.isPromptOfDay) {
      await Prompt.updateMany({}, { $set: { isPromptOfDay: false } });
    }
    
    const newPrompt = new Prompt(sanitizedData);
    await newPrompt.save();
    
    console.log(`✅ Prompt created by admin: ${sanitizedData.title}`);
    res.status(201).json({ message: '✅ Prompt created successfully!', prompt: newPrompt });
  } catch (error) {
    console.error('❌ Create Prompt Error:', error.message);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// Delete Prompt (Admin Only - SECURED)
app.delete('/api/prompts/:id', verifyAdmin, async (req, res) => {
  try {
    const prompt = await Prompt.findById(req.params.id);
    
    if (!prompt) {
      return res.status(404).json({ message: '❌ Prompt not found' });
    }
    
    await Prompt.findByIdAndDelete(req.params.id);
    console.log(`✅ Prompt deleted by admin: ${prompt.title}`);
    res.json({ message: '✅ Deleted successfully' });
  } catch (error) {
    console.error('❌ Delete Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 📝 BLOG ROUTES (Secured)
// ============================================

app.get('/api/blogs', async (req, res) => {
  try {
    const blogs = await Blog.find({ isPublished: true }).sort({ createdAt: -1 });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/blogs/:slug', async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug });
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    // ✅ FIXED: No deprecation warning
    await Blog.findByIdAndUpdate(
      blog._id,
      { $inc: { views: 1 } },
      { returnDocument: 'after' }
    );
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/blogs', verifyAdmin, upload.single('coverImage'), async (req, res) => {
  try {
    const errors = validateInput(req.body, ['title', 'excerpt', 'content', 'category']);
    if (errors.length > 0) {
      return res.status(400).json({ message: '❌ Validation failed', errors });
    }

    if (!req.file) {
      return res.status(400).json({ message: '❌ Cover image required' });
    }

    const uploadResult = await uploadToCloudinary(req.file);
    const coverImageUrl = uploadResult.secure_url;

    const newBlog = new Blog({
      title: req.body.title.trim(),
      slug: req.body.slug?.trim() || req.body.title.toLowerCase().replace(/\s+/g, '-'),
      excerpt: req.body.excerpt.trim(),
      content: req.body.content.trim(),
      author: req.body.author?.trim() || 'Admin',
      category: req.body.category.trim(),
      tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [],
      isPublished: req.body.isPublished === 'true',
      coverImage: coverImageUrl
    });
    
    await newBlog.save();
    res.status(201).json({ message: '✅ Blog created successfully!', blog: newBlog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/blogs/:id', verifyAdmin, async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: '✅ Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 📦 COLLECTION ROUTES (Secured)
// ============================================

app.get('/api/collections', async (req, res) => {
  try {
    const collections = await Collection.find({ isPublished: true })
      .populate('prompts')
      .sort({ createdAt: -1 });
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/collections/:slug', async (req, res) => {
  try {
    const collection = await Collection.findOne({ slug: req.params.slug }).populate('prompts');
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }
    // ✅ FIXED: No deprecation warning
    await Collection.findByIdAndUpdate(
      collection._id,
      { $inc: { views: 1 } },
      { returnDocument: 'after' }
    );
    res.json(collection);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE COLLECTION - FIXED WITH DETAILED ERROR LOGGING
app.post('/api/collections', verifyAdmin, upload.single('coverImage'), async (req, res) => {
  try {
    console.log('📦 Creating collection...');
    console.log('📝 Request body:', req.body);
    console.log('📁 File uploaded:', req.file ? 'Yes' : 'No');

    // Validate required fields
    const errors = validateInput(req.body, ['title', 'description', 'category']);
    if (errors.length > 0) {
      console.error('❌ Validation errors:', errors);
      return res.status(400).json({ message: '❌ Validation failed', errors });
    }

    // Check if file was uploaded
    if (!req.file) {
      console.error('❌ No cover image uploaded');
      return res.status(400).json({ message: '❌ Cover image required' });
    }

    console.log('☁️ Uploading to Cloudinary...');
    
    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file);
    const coverImageUrl = uploadResult.secure_url;
    
    console.log('✅ Cloudinary upload successful:', coverImageUrl);

    // Parse prompts array safely
    let promptsArray = [];
    if (req.body.prompts) {
      try {
        promptsArray = typeof req.body.prompts === 'string' 
          ? JSON.parse(req.body.prompts) 
          : req.body.prompts;
        console.log('📋 Prompts parsed:', promptsArray.length, 'prompts');
      } catch (parseError) {
        console.error('⚠️ JSON parse error:', parseError.message);
        promptsArray = [];
      }
    }

    console.log('📝 Creating collection with:', {
      title: req.body.title,
      slug: req.body.slug,
      category: req.body.category,
      promptsCount: promptsArray.length
    });

    const newCollection = new Collection({
      title: req.body.title.trim(),
      slug: req.body.slug?.trim() || req.body.title.toLowerCase().replace(/\s+/g, '-'),
      description: req.body.description.trim(),
      coverImage: coverImageUrl,
      category: req.body.category.trim(),
      prompts: promptsArray,
      isPublished: req.body.isPublished === 'true'
    });
    
    await newCollection.save();
    console.log('✅ Collection created:', newCollection._id);
    
    res.status(201).json({ 
      message: '✅ Collection created!', 
      collection: newCollection 
    });
  } catch (error) {
    console.error('❌ Create Collection Error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
    res.status(500).json({ 
      message: '❌ Server error', 
      error: error.message,
      stack: isDevelopment ? error.stack : undefined
    });
  }
});

app.delete('/api/collections/:id', verifyAdmin, async (req, res) => {
  try {
    await Collection.findByIdAndDelete(req.params.id);
    res.json({ message: '✅ Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// 🚀 START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('============================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔒 Security: Helmet + Rate Limit (5x) + MongoDB Sanitize + CORS`);
  console.log(`📊 Rate Limits: ${isDevelopment ? '500 req/15min (Dev)' : '100 req/15min (Prod)'}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`📁 Uploads: ${uploadsDir}`);
  console.log('============================================');
});

// ============================================
// 🛑 GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Global Error:', err.stack);
  
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(err.status || 500).json({
    error: message
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: '❌ Route not found' });
});

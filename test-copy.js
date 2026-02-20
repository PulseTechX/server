require('dotenv').config();
const mongoose = require('mongoose');
const Prompt = require('./models/Prompt');

// Replace with an actual prompt ID from your database
const TEST_PROMPT_ID = 'YOUR_PROMPT_ID_HERE'; // ⚠️ CHANGE THIS!

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Get prompt before
    const before = await Prompt.findById(TEST_PROMPT_ID);
    console.log('📊 Before copy:', { copyCount: before?.copyCount });
    
    // Increment copy count
    const result = await Prompt.findByIdAndUpdate(
      TEST_PROMPT_ID,
      { $inc: { copyCount: 1 } },
      { new: true }
    );
    
    console.log('📊 After copy:', { copyCount: result?.copyCount });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
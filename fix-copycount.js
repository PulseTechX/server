require('dotenv').config();
const mongoose = require('mongoose');
const Prompt = require('./models/Prompt');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Step 1: Count total prompts
    const totalPrompts = await Prompt.countDocuments();
    console.log(`📊 Total prompts in database: ${totalPrompts}`);
    
    if (totalPrompts === 0) {
      console.log('⚠️ No prompts found in database. Create some prompts first!');
      process.exit(0);
    }
    
    // Step 2: Check how many have copyCount field
    const withCopyCount = await Prompt.countDocuments({ copyCount: { $exists: true } });
    console.log(`📊 Prompts with copyCount field: ${withCopyCount}`);
    
    // Step 3: Check how many DON'T have copyCount field
    const withoutCopyCount = await Prompt.countDocuments({ copyCount: { $exists: false } });
    console.log(`📊 Prompts WITHOUT copyCount field: ${withoutCopyCount}`);
    
    // Step 4: Update prompts that don't have copyCount
    if (withoutCopyCount > 0) {
      const result = await Prompt.updateMany(
        { copyCount: { $exists: false } },
        { $set: { copyCount: 0 } }
      );
      
      console.log(`✅ Updated ${result.modifiedCount} prompts with copyCount: 0`);
    } else {
      console.log('✅ All prompts already have copyCount field');
    }
    
    // Step 5: Verify all prompts now have copyCount
    const afterUpdate = await Prompt.countDocuments({ copyCount: { $exists: true } });
    console.log(`📊 After update - Prompts with copyCount: ${afterUpdate}`);
    
    // Step 6: Show sample prompts to verify
    console.log('\n📋 Sample Prompts (first 3):');
    const samples = await Prompt.find().limit(3);
    samples.forEach((prompt, index) => {
      console.log(`  ${index + 1}. "${prompt.title}" - copyCount: ${prompt.copyCount}`);
    });
    
    // Step 7: Show total copy count across all prompts
    const allPrompts = await Prompt.find();
    const totalCopies = allPrompts.reduce((sum, p) => sum + (p.copyCount || 0), 0);
    console.log(`\n📊 Total copies across all prompts: ${totalCopies}`);
    
    console.log('\n✅ Fix complete! Restart your server and test copy function.');
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
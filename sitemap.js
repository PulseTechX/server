const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Prompt = require('./models/Prompt');

// ⚠️ CHANGE THIS TO YOUR LIVE DOMAIN
const BASE_URL = 'https://yourwebsite.com';

const generateSitemap = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database');

    // Get all prompts
    const prompts = await Prompt.find({}, '_id createdAt');
    console.log(`📄 Found ${prompts.length} prompts`);

    // Build sitemap XML
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Admin Page (noindex recommended) -->
  <url>
    <loc>${BASE_URL}/admin</loc>
    <changefreq>monthly</changefreq>
    <priority>0.1</priority>
  </url>
  
  <!-- Prompt Detail Pages -->
`;

    prompts.forEach(prompt => {
      const lastMod = new Date(prompt.createdAt).toISOString().split('T')[0];
      sitemap += `  <url>
    <loc>${BASE_URL}/prompt/${prompt._id}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    });

    sitemap += `</urlset>`;

    // Save to public folder
    const sitemapPath = path.join(__dirname, '../client/public/sitemap.xml');
    fs.writeFileSync(sitemapPath, sitemap);
    console.log('✅ Sitemap generated:', sitemapPath);

    // Also save to server folder for easy access
    const serverSitemapPath = path.join(__dirname, 'sitemap.xml');
    fs.writeFileSync(serverSitemapPath, sitemap);
    console.log('✅ Sitemap saved to server:', serverSitemapPath);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
  }
};

generateSitemap();
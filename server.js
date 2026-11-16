import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { registerApiRoutes } from './api-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Register central API endpoints (/api/login, /api/claim, /api/admin/users)
registerApiRoutes(app);

// Default app port is 3000 (proxied by Nginx on port 8080)
const PORT = process.env.APP_PORT || 3000;
const distPath = path.join(__dirname, 'dist');

// Serve static assets from built Vite bundle
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// All SPA navigation routes serve index.html
app.get('*', (_req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Application build in progress. Please refresh in a moment.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lagos Life production server listening on 0.0.0.0:${PORT}`);
});

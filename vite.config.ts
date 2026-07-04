import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Custom Vite plugin to handle saving, listing and deleting templates locally on disk
function localTemplateSaverPlugin() {
  return {
    name: 'local-template-saver',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;

        if (pathname === '/api/save-template' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const { name, category, backgroundStyle, borderColor, backgroundImageUrl, elements } = data;
              
              if (!name) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Template name is required' }));
                return;
              }

              // Create folder name based on template name
              const safeName = name.trim().replace(/[^a-zA-Z0-9\u0600-\u06FF\s_-]/g, '').replace(/\s+/g, '_');
              const templateDir = path.join(process.cwd(), 'public', 'saved_templates', safeName);
              
              // Create directories recursively
              fs.mkdirSync(templateDir, { recursive: true });

              let resolvedBgUrl = backgroundImageUrl || '';
              
              // If backgroundImageUrl is a Base64 string, save it as a separate image file!
              if (backgroundImageUrl && backgroundImageUrl.startsWith('data:')) {
                const matchMime = backgroundImageUrl.match(/data:(.*?);base64,/);
                let ext = 'png';
                if (matchMime) {
                  const mime = matchMime[1];
                  ext = mime.split('/')[1] || 'png';
                }
                const base64Data = backgroundImageUrl.split(',')[1];
                const bgFilename = `background.${ext}`;
                const bgFilePath = path.join(templateDir, bgFilename);
                
                fs.writeFileSync(bgFilePath, Buffer.from(base64Data, 'base64'));
                
                // Update backgroundImageUrl in the JSON to point to the saved file relatively!
                resolvedBgUrl = `/saved_templates/${safeName}/${bgFilename}`;
              }

              const templateConfig = {
                version: "1.0",
                id: data.id || `custom_${Date.now()}`,
                name: name.trim(),
                category: category ? category.trim() : undefined,
                backgroundStyle,
                borderColor,
                backgroundImageUrl: resolvedBgUrl || undefined,
                elements
              };

              const configPath = path.join(templateDir, 'template.json');
              fs.writeFileSync(configPath, JSON.stringify(templateConfig, null, 2));

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                success: true, 
                message: 'Template saved successfully',
                id: templateConfig.id,
                path: `/saved_templates/${safeName}/`
              }));
            } catch (err: any) {
              console.error('Error saving template:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else if (pathname === '/api/list-templates' && req.method === 'GET') {
          try {
            const savedTemplatesDir = path.join(process.cwd(), 'public', 'saved_templates');
            const list: any[] = [];
            
            if (fs.existsSync(savedTemplatesDir)) {
              const folders = fs.readdirSync(savedTemplatesDir);
              for (const folder of folders) {
                const configPath = path.join(savedTemplatesDir, folder, 'template.json');
                if (fs.existsSync(configPath)) {
                  try {
                    const content = fs.readFileSync(configPath, 'utf8');
                    const parsed = JSON.parse(content);
                    list.push(parsed);
                  } catch (e) {
                    console.error(`Failed to parse config in folder ${folder}:`, e);
                  }
                }
              }
            }
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(list));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        } else if (pathname === '/api/delete-template' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              console.log('API /api/delete-template called with body:', body);
              const { id } = JSON.parse(body);
              if (!id) {
                console.warn('Delete template called without ID');
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Template ID is required' }));
                return;
              }
              
              let deleted = false;
              const savedTemplatesDir = path.join(process.cwd(), 'public', 'saved_templates');
              console.log('Saved templates directory:', savedTemplatesDir);
              if (fs.existsSync(savedTemplatesDir)) {
                const folders = fs.readdirSync(savedTemplatesDir);
                for (const folder of folders) {
                  const configPath = path.join(savedTemplatesDir, folder, 'template.json');
                  console.log('Checking config path:', configPath);
                  if (fs.existsSync(configPath)) {
                    const content = fs.readFileSync(configPath, 'utf8');
                    const parsed = JSON.parse(content);
                    console.log(`Checking template folder "${folder}" with id "${parsed.id}" against target id "${id}"`);
                    if (parsed.id === id) {
                      console.log('Match found! Deleting folder:', path.join(savedTemplatesDir, folder));
                      // Delete folder recursively
                      fs.rmSync(path.join(savedTemplatesDir, folder), { recursive: true, force: true });
                      deleted = true;
                      break;
                    }
                  }
                }
              }
              
              if (!deleted) {
                console.warn(`Template with ID "${id}" was not found on disk for deletion`);
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, deleted }));
            } catch (err: any) {
              console.error('Error in /api/delete-template:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}
// Auto-compile templates from public/saved_templates into public/templates.json
function buildTemplatesJson() {
  try {
    const savedTemplatesDir = path.join(process.cwd(), 'public', 'saved_templates');
    const list: any[] = [];
    
    if (fs.existsSync(savedTemplatesDir)) {
      const folders = fs.readdirSync(savedTemplatesDir);
      for (const folder of folders) {
        const configPath = path.join(savedTemplatesDir, folder, 'template.json');
        if (fs.existsSync(configPath)) {
          try {
            const content = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(content);
            list.push(parsed);
          } catch (e) {
            console.error(`Failed to parse config in folder ${folder}:`, e);
          }
        }
      }
    }
    
    const outputPath = path.join(process.cwd(), 'public', 'templates.json');
    fs.writeFileSync(outputPath, JSON.stringify(list, null, 2));
    console.log(`Successfully generated public/templates.json with ${list.length} templates.`);
  } catch (err) {
    console.error('Error generating templates.json:', err);
  }
}

export default defineConfig(() => {
  buildTemplatesJson();
  return {
    plugins: [
      react(), 
      tailwindcss(), 
      localTemplateSaverPlugin(),
      viteStaticCopy({
        targets: [
          {
            src: 'public/saved_templates',
            dest: ''
          }
        ]
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

const express = require('express');
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const app = express();
const PORT = process.env.PORT || 3000;


const obfuscationCache = new Map();


async function obfuscateJS(code) {
  try {
    const result = await minify(code, {
      compress: {
        passes: 2,               
        drop_console: true,      
      },
      mangle: {
        toplevel: true,          
        properties: true,        
      },
      output: {
        beautify: false,         
      },
    });

    if (result.error) {
      console.error('[OBFUSCATE] Error:', result.error);
      return code; 
    }

    return result.code;
  } catch (error) {
    console.error('[OBFUSCATE] Exception:', error);
    return code;
  }
}


function obfuscateHTML(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')           
    .replace(/>\s+</g, '><')                   
    .replace(/\s+/g, ' ')                      
    .trim();
}


app.use(express.static(path.join(__dirname, 'public'), {
  
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.type('application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.html')) {
      res.type('text/html; charset=utf-8');
    }
  }
}));


app.get('*.js', async (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path);

  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }

  
  if (obfuscationCache.has(filePath)) {
    console.log(`[CACHE] ${req.path}`);
    return res.type('application/javascript').send(obfuscationCache.get(filePath));
  }

  try {
    
    let code = fs.readFileSync(filePath, 'utf-8');

    
    console.log(`[OBFUSCATE] ${req.path}`);
    code = await obfuscateJS(code);

    
    obfuscationCache.set(filePath, code);

    
    res.type('application/javascript').send(code);
  } catch (error) {
    console.error(`[ERROR] ${req.path}:`, error);
    res.status(500).send('Error processing file');
  }
});


app.get('*.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }

  if (obfuscationCache.has(filePath)) {
    console.log(`[CACHE] ${req.path}`);
    return res.type('text/html').send(obfuscationCache.get(filePath));
  }

  try {
    let html = fs.readFileSync(filePath, 'utf-8');

    console.log(`[MINIFY] ${req.path}`);
    html = obfuscateHTML(html);

    obfuscationCache.set(filePath, html);

    res.type('text/html').send(html);
  } catch (error) {
    console.error(`[ERROR] ${req.path}:`, error);
    res.status(500).send('Error processing file');
  }
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════════╗
║   CLIENT P2P SERVER (OBFUSCATED)        ║
║   🌐 HTTP: http://localhost:${PORT}      ║
║   🔒 Code obfusqué et minifié           ║
║                                         ║
║   ✅ Les fichiers JS seront optimisés   ║
║   ✅ Les variables seront renommées     ║
║   ✅ Les espaces enlévés                ║
║   ✅ Cache activé pour performance      ║
╚═════════════════════════════════════════╝
  `);
});
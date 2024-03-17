const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const axios = require('axios');
const archiver = require('archiver');
const path = require('path');
const GitHubRepoParser = require('github-repo-parser');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const port = 3000;
const YOUR_GITHUB_API_KEY = '<YOUR_GITHUB_API_KEY>';
const overviewFilesDir = 'overview_files';

app.use(express.json());

app.post('/parse-repo', async (req, res) => {
  const { githubUrl } = req.body;

  if (!githubUrl) {
    return res.status(400).json({ error: 'GitHub URL is required' });
  }
  
  try {
    const parser = new GitHubRepoParser(YOUR_GITHUB_API_KEY);
    
    const data = await parser.collectData(githubUrl);

    await fsp.writeFile('overview.json', JSON.stringify(data, null, 2), 'utf-8');

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/download-files', async (req, res) => {
  const downloadAll = req.query.downloadAll === 'true';

  try {
    await fsp.mkdir(overviewFilesDir, { recursive: true });

    const overviewJson = await fsp.readFile('overview.json', 'utf-8');
    const filesObject = JSON.parse(overviewJson);

    const ignoreExtensions = ['env', 'lock', 'pyc', 'ipynb', 'txt', 'md', 'gitignore', 'json', 'pdf', 'csv'];
    const ignoreFileNames = ['__init__.py', 'Pipfile.lock'];
    const ignoreDirectories = ['env', 'venv', '.venv'];

    const fileUrls = Object.entries(filesObject)
      .filter(([extension]) => downloadAll || !ignoreExtensions.includes(extension))
      .flatMap(([_, urls]) => urls);

    for (const fileUrl of fileUrls) {
      const urlObj = new URL(fileUrl);
      let fileName = urlObj.pathname.split('/').pop();
      fileName = decodeURIComponent(fileName);

      const cleanFileName = fileName.replace(/\?.*$/, '');
      const fileExtension = cleanFileName.split('.').pop();
      const filePathSegments = urlObj.pathname.split('/').map(segment => decodeURIComponent(segment));

      // Check if the file extension, full filename, or any directory in the path should be ignored
      if (!ignoreExtensions.includes(fileExtension) && 
          !ignoreFileNames.includes(cleanFileName) &&
          !filePathSegments.some(segment => ignoreDirectories.includes(segment))) {
        const response = await axios.get(fileUrl, {
          responseType: 'arraybuffer'
        });

        await fsp.writeFile(`${overviewFilesDir}/${cleanFileName}`, response.data, { flag: 'w' });
      }
    }

    const zipFilePath = 'overview_files.zip';
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => { throw err; });
    archive.pipe(output);

    archive.directory(overviewFilesDir, false);
    await archive.finalize();

    res.json({ message: 'Files downloaded and zipped successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/combine-and-send', async (req, res) => {
  const folderPath = path.resolve(__dirname, 'overview_files');
  let filesText = [];

  try {
    const files = await fsp.readdir(folderPath);

    for (const filename of files) {
      if (filename !== 'get-pip.py') {
        const filePath = path.join(folderPath, filename);
        const fileStats = await fsp.stat(filePath);
        if (fileStats.isFile()) {
          const fileContent = await fsp.readFile(filePath, 'utf-8');
          filesText.push(`Filename: ${filename}\n${fileContent}`);
        }
      }
    }

    const combinedText = filesText.join('\n\n');
    await fsp.writeFile('combined_code.txt', combinedText, 'utf-8');

    const anthropic = new Anthropic({
      apiKey: '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',
    });

    try {
      const msg = await anthropic.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 1024,
        system: "", 
        messages: [{ role: "user", content: "Hello, Claude" }],
      });
      console.log(msg);
      res.json(msg);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: error.message });
    }
  } catch (err) {
    console.error('Error combining files:', err);
    res.status(500).json({ error: `Error combining files: ${err}` });
  }
});

app.post('/send', async (req, res) => {
  const anthropic = new Anthropic({
    apiKey: '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',
  });
  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1024,
      system:"",
      messages: [{ role: "user", content: "Hello, Claude" }],
    });
    console.log(msg);
    res.json(msg);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
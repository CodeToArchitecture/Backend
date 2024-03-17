const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const axios = require('axios');
const archiver = require('archiver');
const path = require('path');
const GitHubRepoParser = require('github-repo-parser');
const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');

const app = express();
const port = 3000;
const YOUR_GITHUB_API_KEY = '';
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
    await fsp.access(overviewFilesDir, fs.constants.F_OK);
    await fsp.rm(overviewFilesDir, { recursive: true, force: true });
  } catch (err) {}
  await fsp.mkdir(overviewFilesDir, { recursive: true });

  try {
    await fsp.mkdir(overviewFilesDir, { recursive: true });

    const overviewJson = await fsp.readFile('overview.json', 'utf-8');
    const filesObject = JSON.parse(overviewJson);

    const ignoreExtensions = ['png', 'env', 'lock', 'pyc', 'ipynb', 'txt', 'md', 'gitignore', 'json', 'pdf', 'csv'];
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

app.post('/process-repo', async (req, res) => {
  const { githubUrl } = req.body;

  if (!githubUrl) {
    return res.status(400).json({ error: 'GitHub URL is required' });
  }
  
  try {
    const parser = new GitHubRepoParser(YOUR_GITHUB_API_KEY);
    
    const data = await parser.collectData(githubUrl);

    await fsp.writeFile('overview.json', JSON.stringify(data, null, 2), 'utf-8');

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

  const downloadAll = req.query.downloadAll === 'true';

  try {
    await fsp.access(overviewFilesDir, fs.constants.F_OK);
    await fsp.rm(overviewFilesDir, { recursive: true, force: true });
  } catch (err) {}
  await fsp.mkdir(overviewFilesDir, { recursive: true });

  try {
    await fsp.mkdir(overviewFilesDir, { recursive: true });

    const overviewJson = await fsp.readFile('overview.json', 'utf-8');
    const filesObject = JSON.parse(overviewJson);

    const ignoreExtensions = ['gitignore', 'png', 'env', 'lock', 'pyc', 'ipynb', 'txt', 'md', 'gitignore', 'json', 'pdf', 'csv'];
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
    const fileContent = await fsp.readFile('combined_code.txt', 'utf8');
    const f2 = await fsp.readFile(path.join(__dirname, 'prompt.txt'), 'utf-8');

    const anthropic = new Anthropic({
      apiKey: '',
    });
    try {
      const msg = await anthropic.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 4096,
        system: f2,
        messages: [{ role: "user", content: fileContent }],
      });
      console.log(msg);
      await fsp.writeFile('claudeoutput.json', JSON.stringify(msg, null, 2), 'utf8');
      res.json(msg);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
    } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/parse-diagram', async (req, res) => {
  try {
    const data = await fsp.readFile('claudeoutput.json', 'utf8');
    const json = JSON.parse(data);

    const textContent = json.content.find(item => item.type === 'text').text;

    const delimiter = "----------\n";
    const startIndex = textContent.indexOf(delimiter);

    if (startIndex !== -1) {
      const resultText = textContent.substring(startIndex + delimiter.length);

      const xmlFilename = 'diagram.drawio';
      const pdfFilename = 'diagram.pdf';

      await fsp.writeFile(xmlFilename, resultText, 'utf8');

      exec(`drawio ${xmlFilename} -o ${pdfFilename}`, async (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return res.status(500).json({ error: error.message });
        }
        if (stderr) {
          console.error(`Stderr: ${stderr}`);
          return res.status(500).json({ error: stderr });
        }

        res.send(path.join(__dirname, pdfFilename));
      });
    } else {
      res.status(404).send('Delimiter not found in the text content.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
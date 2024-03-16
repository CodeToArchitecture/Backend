const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const axios = require('axios');
const archiver = require('archiver');
const GitHubRepoParser = require('github-repo-parser');

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

    const ignoreList = downloadAll ? [] : ['txt', 'md', 'gitignore', 'git', 'json'];

    const fileUrls = Object.entries(filesObject)
      .filter(([extension]) => downloadAll || !ignoreList.includes(extension))
      .flatMap(([_, urls]) => urls);

    for (const fileUrl of fileUrls) {
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer'
      });

      const fileName = fileUrl.split('/').pop();

      await fsp.writeFile(`${overviewFilesDir}/${fileName}`, response.data, { flag: 'w' });
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
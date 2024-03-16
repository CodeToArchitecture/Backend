const express = require('express');
const fs = require('fs').promises;
const axios = require('axios');
const GitHubRepoParser = require('github-repo-parser');

const app = express();
const port = 3000;

const YOUR_GITHUB_API_KEY = await fs.readFile('login.txt', 'utf-8').trim();
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

    await fs.writeFile('overview.json', JSON.stringify(data, null, 2), 'utf-8');

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/download-files', async (req, res) => {
  const downloadAll = req.query.downloadAll === 'true';

  try {
    await fs.mkdir(overviewFilesDir, { recursive: true });

    const overviewJson = await fs.readFile('overview.json', 'utf-8');
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

      await fs.writeFile(`${overviewFilesDir}/${fileName}`, response.data, { flag: 'w' });
    }

    res.json({ message: 'Files downloaded successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
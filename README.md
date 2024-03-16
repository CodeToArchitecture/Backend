Setup:

```
chmod 755 setup.sh
./setup.sh
```

Sample usage:

Terminal 1: `node server.js`

Parse repo:

Terminal 2: `curl -X POST -H "Content-Type: application/json" -d '{"githubUrl": "https://github.com/saarthdeshpande/github-repo-parser"}' http://localhost:3000/parse-repo`

Download repo files from parsed repo schema (ignores txt, md, git files, json):

Terminal 2: `curl -X POST -H "Content-Type: application/json" -d '{"githubUrl": "https://github.com/saarthdeshpande/github-repo-parser"}' http://localhost:3000/download-files`

Download all files

Terminal 2: `curl -X POST -H "Content-Type: application/json" -d '{"githubUrl": "https://github.com/saarthdeshpande/github-repo-parser"}' http://localhost:3000/download-files?downloadAll=true`
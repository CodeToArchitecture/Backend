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
const YOUR_GITHUB_API_KEY = 't';
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
      apiKey: '',
    });
    try {
      const fileContent = await fsp.readFile('combined_code.txt', 'utf8');
      const msg = await anthropic.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 1024,
        system:"Your job is to help visualize software architectures defined by Terraform code. You will do this by converting the Terraform code into a draw.io XML file; the draw.io XML has all the information required to generate a flowchart in draw.io.\n\n\nExample 1\n-----------------\nTerraform Code:\n\nmain.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\nprovider \"aws\" {\n  region = var.region\n}\n\ndata \"aws_ami\" \"ubuntu\" {\n  most_recent = true\n\n  filter {\n    name   = \"name\"\n    values = [\"ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*\"]\n  }\n\n  filter {\n    name   = \"virtualization-type\"\n    values = [\"hvm\"]\n  }\n\n  owners = [\"099720109477\"] # Canonical\n}\n\nresource \"aws_instance\" \"ubuntu\" {\n  ami           = data.aws_ami.ubuntu.id\n  instance_type = var.instance_type\n\n  tags = {\n    Name = var.instance_name\n  }\n}\n\noutputs.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\noutput \"instance_ami\" {\n  value = aws_instance.ubuntu.ami\n}\n\noutput \"instance_arn\" {\n  value = aws_instance.ubuntu.arn\n}\n\nvariables.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\nvariable \"region\" {\n  description = \"AWS region\"\n  default     = \"us-west-1\"\n}\n\nvariable \"instance_type\" {\n  description = \"Type of EC2 instance to provision\"\n  default     = \"t2.micro\"\n}\n\nvariable \"instance_name\" {\n  description = \"EC2 instance name\"\n  default     = \"Provisioned by Terraform\"\n}\n\nversions.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\nterraform {\n  required_providers {\n    aws = {\n      source  = \"hashicorp/aws\"\n      version = \"~> 3.28.0\"\n    }\n\n    random = {\n      source  = \"hashicorp/random\"\n      version = \"3.0.0\"\n    }\n  }\n\n  required_version = \">= 0.14.0\"\n}\n\nDraw.io XML Output:\n<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mxfile host=\"app.diagrams.net\" modified=\"2024-03-17T00:08:55.701Z\" agent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Config/91.2.2369.16\" etag=\"xl9hkLhMG_GsGmnvX0b1\" version=\"24.0.7\">\n  <diagram name=\"Page-1\" id=\"N24DRFSZ5Lsl6es_FXGU\">\n    <mxGraphModel dx=\"1050\" dy=\"522\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"850\" pageHeight=\"1100\" math=\"0\" shadow=\"0\">\n      <root>\n        <mxCell id=\"0\" />\n        <mxCell id=\"1\" parent=\"0\" />\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-3\" value=\"AWS&lt;div&gt;aws&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"280\" y=\"120\" width=\"280\" height=\"320\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-5\" value=\"us-west-1&lt;div&gt;region&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"320\" y=\"140\" width=\"220\" height=\"280\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-6\" value=\"ubuntu&lt;div&gt;aws_ami&lt;/div&gt;\" style=\"whiteSpace=wrap;html=1;aspect=fixed;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"400\" y=\"180\" width=\"80\" height=\"80\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-7\" value=\"ubuntu&lt;div&gt;aws_instance&lt;/div&gt;\" style=\"whiteSpace=wrap;html=1;aspect=fixed;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"400\" y=\"290\" width=\"80\" height=\"80\" as=\"geometry\" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n\n\nExample 2\n------------------\nTerraform Code:\n\nmain.tf\n# VPC > User scenario > Scenario 1. Single Public Subnet\n# https://docs.ncloud.com/ko/networking/vpc/vpc_userscenario1.html\n\nprovider \"ncloud\" {\n  support_vpc = true\n  region      = \"KR\"\n  access_key  = var.access_key\n  secret_key  = var.secret_key\n}\n\nresource \"ncloud_login_key\" \"key_scn_01\" {\n  key_name = var.name_scn01\n}\n\nresource \"ncloud_vpc\" \"vpc_scn_01\" {\n  name            = var.name_scn01\n  ipv4_cidr_block = \"10.0.0.0/16\"\n}\n\nresource \"ncloud_subnet\" \"subnet_scn_01\" {\n  name           = var.name_scn01\n  vpc_no         = ncloud_vpc.vpc_scn_01.id\n  subnet         = cidrsubnet(ncloud_vpc.vpc_scn_01.ipv4_cidr_block, 8, 1)\n  // 10.0.1.0/24\n  zone           = \"KR-2\"\n  network_acl_no = ncloud_vpc.vpc_scn_01.default_network_acl_no\n  subnet_type    = \"PUBLIC\"\n  // PUBLIC(Public) | PRIVATE(Private)\n}\n\nresource \"ncloud_server\" \"server_scn_01\" {\n  subnet_no                 = ncloud_subnet.subnet_scn_01.id\n  name                      = var.name_scn01\n  server_image_product_code = \"SW.VSVR.OS.LNX64.CNTOS.0703.B050\"\n  login_key_name            = ncloud_login_key.key_scn_01.key_name\n}\n\nresource \"ncloud_public_ip\" \"public_ip_scn_01\" {\n  server_instance_no = ncloud_server.server_scn_01.id\n  description        = \"for ${var.name_scn01}\"\n}\n\nlocals {\n  scn01_inbound = [\n    [1, \"TCP\", \"0.0.0.0/0\", \"80\", \"ALLOW\"],\n    [2, \"TCP\", \"0.0.0.0/0\", \"443\", \"ALLOW\"],\n    [3, \"TCP\", \"${var.client_ip}/32\", \"22\", \"ALLOW\"],\n    [4, \"TCP\", \"${var.client_ip}/32\", \"3389\", \"ALLOW\"],\n    [5, \"TCP\", \"0.0.0.0/0\", \"32768-65535\", \"ALLOW\"],\n    [197, \"TCP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [198, \"UDP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [199, \"ICMP\", \"0.0.0.0/0\", null, \"DROP\"],\n  ]\n\n  scn01_outbound = [\n    [1, \"TCP\", \"0.0.0.0/0\", \"80\", \"ALLOW\"],\n    [2, \"TCP\", \"0.0.0.0/0\", \"443\", \"ALLOW\"],\n    [3, \"TCP\", \"${var.client_ip}/32\", \"1000-65535\", \"ALLOW\"],\n    [197, \"TCP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [198, \"UDP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [199, \"ICMP\", \"0.0.0.0/0\", null, \"DROP\"]\n  ]\n}\n\nresource \"ncloud_network_acl_rule\" \"network_acl_01_rule\" {\n  network_acl_no = ncloud_vpc.vpc_scn_01.default_network_acl_no\n  dynamic \"inbound\" {\n    for_each = local.scn01_inbound\n    content {\n      priority    = inbound.value[0]\n      protocol    = inbound.value[1]\n      ip_block    = inbound.value[2]\n      port_range  = inbound.value[3]\n      rule_action = inbound.value[4]\n      description = \"for ${var.name_scn01}\"\n    }\n  }\n\n  dynamic \"outbound\" {\n    for_each = local.scn01_outbound\n    content {\n      priority    = outbound.value[0]\n      protocol    = outbound.value[1]\n      ip_block    = outbound.value[2]\n      port_range  = outbound.value[3]\n      rule_action = outbound.value[4]\n      description = \"for ${var.name_scn01}\"\n    }\n  }\n}\n\nDraw.io XML Output:\n<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mxfile host=\"app.diagrams.net\" modified=\"2024-03-17T00:45:03.379Z\" agent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Config/91.2.2369.16\" etag=\"YxoIgZq-FgMHVcFHly7_\" version=\"24.0.7\">\n  <diagram name=\"Page-1\" id=\"N24DRFSZ5Lsl6es_FXGU\">\n    <mxGraphModel dx=\"1050\" dy=\"522\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"850\" pageHeight=\"1100\" math=\"0\" shadow=\"0\">\n      <root>\n        <mxCell id=\"0\" />\n        <mxCell id=\"1\" parent=\"0\" />\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-3\" value=\"ncloud&lt;div&gt;ncloud&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"280\" y=\"120\" width=\"440\" height=\"320\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-5\" value=\"KR&lt;div&gt;region&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"327\" y=\"140\" width=\"380\" height=\"280\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-8\" value=\"vpn_scn_01&lt;div&gt;ncloud_vpc&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"370\" y=\"160\" width=\"320\" height=\"140\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-9\" value=\"subnet_scn_01&lt;div&gt;ncloud_subnet&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"440\" y=\"180\" width=\"230\" height=\"100\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-10\" value=\"&lt;div&gt;server_scn_01&lt;/div&gt;&lt;div&gt;ncloud_server&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"530\" y=\"200\" width=\"120\" height=\"60\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-11\" value=\"public_ip_scn_01&#xa;ncloud_public_ip\" style=\"rounded=0;whiteSpace=wrap;html=1;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"470\" y=\"330\" width=\"120\" height=\"60\" as=\"geometry\" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n",
        messages: [{ role: "user", content: {fileContent} }],
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

app.post('/send', async (req, res) => {
  const anthropic = new Anthropic({
    apiKey: '',
  });
  try {
    const fileContent = await fsp.readFile('combined_code.txt', 'utf8');
    const msg = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1024,
      system:"Your job is to help visualize software architectures defined by Terraform code. You will do this by converting the Terraform code into a draw.io XML file; the draw.io XML has all the information required to generate a flowchart in draw.io.\n\n\nExample 1\n-----------------\nTerraform Code:\n\nmain.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\nprovider \"aws\" {\n  region = var.region\n}\n\ndata \"aws_ami\" \"ubuntu\" {\n  most_recent = true\n\n  filter {\n    name   = \"name\"\n    values = [\"ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*\"]\n  }\n\n  filter {\n    name   = \"virtualization-type\"\n    values = [\"hvm\"]\n  }\n\n  owners = [\"099720109477\"] # Canonical\n}\n\nresource \"aws_instance\" \"ubuntu\" {\n  ami           = data.aws_ami.ubuntu.id\n  instance_type = var.instance_type\n\n  tags = {\n    Name = var.instance_name\n  }\n}\n\noutputs.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\noutput \"instance_ami\" {\n  value = aws_instance.ubuntu.ami\n}\n\noutput \"instance_arn\" {\n  value = aws_instance.ubuntu.arn\n}\n\nvariables.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\nvariable \"region\" {\n  description = \"AWS region\"\n  default     = \"us-west-1\"\n}\n\nvariable \"instance_type\" {\n  description = \"Type of EC2 instance to provision\"\n  default     = \"t2.micro\"\n}\n\nvariable \"instance_name\" {\n  description = \"EC2 instance name\"\n  default     = \"Provisioned by Terraform\"\n}\n\nversions.tf\n# Copyright (c) HashiCorp, Inc.\n# SPDX-License-Identifier: MPL-2.0\n\nterraform {\n  required_providers {\n    aws = {\n      source  = \"hashicorp/aws\"\n      version = \"~> 3.28.0\"\n    }\n\n    random = {\n      source  = \"hashicorp/random\"\n      version = \"3.0.0\"\n    }\n  }\n\n  required_version = \">= 0.14.0\"\n}\n\nDraw.io XML Output:\n<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mxfile host=\"app.diagrams.net\" modified=\"2024-03-17T00:08:55.701Z\" agent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Config/91.2.2369.16\" etag=\"xl9hkLhMG_GsGmnvX0b1\" version=\"24.0.7\">\n  <diagram name=\"Page-1\" id=\"N24DRFSZ5Lsl6es_FXGU\">\n    <mxGraphModel dx=\"1050\" dy=\"522\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"850\" pageHeight=\"1100\" math=\"0\" shadow=\"0\">\n      <root>\n        <mxCell id=\"0\" />\n        <mxCell id=\"1\" parent=\"0\" />\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-3\" value=\"AWS&lt;div&gt;aws&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"280\" y=\"120\" width=\"280\" height=\"320\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-5\" value=\"us-west-1&lt;div&gt;region&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"320\" y=\"140\" width=\"220\" height=\"280\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-6\" value=\"ubuntu&lt;div&gt;aws_ami&lt;/div&gt;\" style=\"whiteSpace=wrap;html=1;aspect=fixed;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"400\" y=\"180\" width=\"80\" height=\"80\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-7\" value=\"ubuntu&lt;div&gt;aws_instance&lt;/div&gt;\" style=\"whiteSpace=wrap;html=1;aspect=fixed;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"400\" y=\"290\" width=\"80\" height=\"80\" as=\"geometry\" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n\n\nExample 2\n------------------\nTerraform Code:\n\nmain.tf\n# VPC > User scenario > Scenario 1. Single Public Subnet\n# https://docs.ncloud.com/ko/networking/vpc/vpc_userscenario1.html\n\nprovider \"ncloud\" {\n  support_vpc = true\n  region      = \"KR\"\n  access_key  = var.access_key\n  secret_key  = var.secret_key\n}\n\nresource \"ncloud_login_key\" \"key_scn_01\" {\n  key_name = var.name_scn01\n}\n\nresource \"ncloud_vpc\" \"vpc_scn_01\" {\n  name            = var.name_scn01\n  ipv4_cidr_block = \"10.0.0.0/16\"\n}\n\nresource \"ncloud_subnet\" \"subnet_scn_01\" {\n  name           = var.name_scn01\n  vpc_no         = ncloud_vpc.vpc_scn_01.id\n  subnet         = cidrsubnet(ncloud_vpc.vpc_scn_01.ipv4_cidr_block, 8, 1)\n  // 10.0.1.0/24\n  zone           = \"KR-2\"\n  network_acl_no = ncloud_vpc.vpc_scn_01.default_network_acl_no\n  subnet_type    = \"PUBLIC\"\n  // PUBLIC(Public) | PRIVATE(Private)\n}\n\nresource \"ncloud_server\" \"server_scn_01\" {\n  subnet_no                 = ncloud_subnet.subnet_scn_01.id\n  name                      = var.name_scn01\n  server_image_product_code = \"SW.VSVR.OS.LNX64.CNTOS.0703.B050\"\n  login_key_name            = ncloud_login_key.key_scn_01.key_name\n}\n\nresource \"ncloud_public_ip\" \"public_ip_scn_01\" {\n  server_instance_no = ncloud_server.server_scn_01.id\n  description        = \"for ${var.name_scn01}\"\n}\n\nlocals {\n  scn01_inbound = [\n    [1, \"TCP\", \"0.0.0.0/0\", \"80\", \"ALLOW\"],\n    [2, \"TCP\", \"0.0.0.0/0\", \"443\", \"ALLOW\"],\n    [3, \"TCP\", \"${var.client_ip}/32\", \"22\", \"ALLOW\"],\n    [4, \"TCP\", \"${var.client_ip}/32\", \"3389\", \"ALLOW\"],\n    [5, \"TCP\", \"0.0.0.0/0\", \"32768-65535\", \"ALLOW\"],\n    [197, \"TCP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [198, \"UDP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [199, \"ICMP\", \"0.0.0.0/0\", null, \"DROP\"],\n  ]\n\n  scn01_outbound = [\n    [1, \"TCP\", \"0.0.0.0/0\", \"80\", \"ALLOW\"],\n    [2, \"TCP\", \"0.0.0.0/0\", \"443\", \"ALLOW\"],\n    [3, \"TCP\", \"${var.client_ip}/32\", \"1000-65535\", \"ALLOW\"],\n    [197, \"TCP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [198, \"UDP\", \"0.0.0.0/0\", \"1-65535\", \"DROP\"],\n    [199, \"ICMP\", \"0.0.0.0/0\", null, \"DROP\"]\n  ]\n}\n\nresource \"ncloud_network_acl_rule\" \"network_acl_01_rule\" {\n  network_acl_no = ncloud_vpc.vpc_scn_01.default_network_acl_no\n  dynamic \"inbound\" {\n    for_each = local.scn01_inbound\n    content {\n      priority    = inbound.value[0]\n      protocol    = inbound.value[1]\n      ip_block    = inbound.value[2]\n      port_range  = inbound.value[3]\n      rule_action = inbound.value[4]\n      description = \"for ${var.name_scn01}\"\n    }\n  }\n\n  dynamic \"outbound\" {\n    for_each = local.scn01_outbound\n    content {\n      priority    = outbound.value[0]\n      protocol    = outbound.value[1]\n      ip_block    = outbound.value[2]\n      port_range  = outbound.value[3]\n      rule_action = outbound.value[4]\n      description = \"for ${var.name_scn01}\"\n    }\n  }\n}\n\nDraw.io XML Output:\n<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mxfile host=\"app.diagrams.net\" modified=\"2024-03-17T00:45:03.379Z\" agent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Config/91.2.2369.16\" etag=\"YxoIgZq-FgMHVcFHly7_\" version=\"24.0.7\">\n  <diagram name=\"Page-1\" id=\"N24DRFSZ5Lsl6es_FXGU\">\n    <mxGraphModel dx=\"1050\" dy=\"522\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"850\" pageHeight=\"1100\" math=\"0\" shadow=\"0\">\n      <root>\n        <mxCell id=\"0\" />\n        <mxCell id=\"1\" parent=\"0\" />\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-3\" value=\"ncloud&lt;div&gt;ncloud&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"280\" y=\"120\" width=\"440\" height=\"320\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-5\" value=\"KR&lt;div&gt;region&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"327\" y=\"140\" width=\"380\" height=\"280\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-8\" value=\"vpn_scn_01&lt;div&gt;ncloud_vpc&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"370\" y=\"160\" width=\"320\" height=\"140\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-9\" value=\"subnet_scn_01&lt;div&gt;ncloud_subnet&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;align=left;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"440\" y=\"180\" width=\"230\" height=\"100\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-10\" value=\"&lt;div&gt;server_scn_01&lt;/div&gt;&lt;div&gt;ncloud_server&lt;/div&gt;\" style=\"rounded=0;whiteSpace=wrap;html=1;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"530\" y=\"200\" width=\"120\" height=\"60\" as=\"geometry\" />\n        </mxCell>\n        <mxCell id=\"IuqwMyJZ7nG7O8QP6tzy-11\" value=\"public_ip_scn_01&#xa;ncloud_public_ip\" style=\"rounded=0;whiteSpace=wrap;html=1;\" vertex=\"1\" parent=\"1\">\n          <mxGeometry x=\"470\" y=\"330\" width=\"120\" height=\"60\" as=\"geometry\" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n",
      messages: [{ role: "user", content: {fileContent} }],
    });
    console.log(msg);
    await fsp.writeFile('claudeoutput.json', JSON.stringify(msg, null, 2), 'utf8');
    res.json(msg);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/xml-to-image', async (req, res) => {});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
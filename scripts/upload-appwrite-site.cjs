const { stat } = require('node:fs/promises');
const { Client, Sites } = require('node-appwrite');
const { InputFile } = require('node-appwrite/file');

async function main() {
  const required = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_SITE_ID', 'APPWRITE_API_KEY'];
  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`Missing GitHub Actions secret: ${name}`);
    }
  }

  const archivePath = 'code.tar.gz';
  const archive = await stat(archivePath);
  if (!archive.isFile() || archive.size === 0) {
    throw new Error(`${archivePath} must be a nonempty file`);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT.replace(/\/$/, ''))
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const deployment = await new Sites(client).createDeployment({
    siteId: process.env.APPWRITE_SITE_ID,
    code: InputFile.fromPath(archivePath, archivePath),
    activate: true,
    onProgress: ({ chunksUploaded, chunksTotal }) => {
      process.stderr.write(`Appwrite upload: ${chunksUploaded}/${chunksTotal} chunks\n`);
    },
  });

  if (!deployment.$id) {
    throw new Error('Appwrite accepted no deployment ID');
  }
  process.stdout.write(`${deployment.$id}\n`);
}

main().catch((error) => {
  process.stderr.write(`Appwrite upload failed: ${error.message}\n`);
  process.exitCode = 1;
});

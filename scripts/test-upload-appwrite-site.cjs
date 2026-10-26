const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const http = require('node:http');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');

async function main() {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'keepflip-appwrite-upload-'));
  const requests = [];
  const server = http.createServer((request, response) => {
    let bodyLength = 0;
    request.on('data', (chunk) => { bodyLength += chunk.length; });
    request.on('end', () => {
      requests.push({
        range: request.headers['content-range'],
        uploadId: request.headers['x-appwrite-id'],
        bodyLength,
      });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ $id: 'test-deployment', chunksUploaded: requests.length, chunksTotal: 2 }));
    });
  });

  try {
    await writeFile(join(workingDirectory, 'code.tar.gz'), Buffer.alloc(5 * 1024 * 1024 + 100));
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
    const uploadScript = join(__dirname, 'upload-appwrite-site.cjs');
    const result = await new Promise((resolveChild, rejectChild) => {
      const child = spawn(process.execPath, [uploadScript], {
        cwd: workingDirectory,
        env: {
          ...process.env,
          APPWRITE_ENDPOINT: endpoint,
          APPWRITE_PROJECT_ID: 'test-project',
          APPWRITE_SITE_ID: 'test-site',
          APPWRITE_API_KEY: 'test-key',
        },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', rejectChild);
      child.on('close', (code) => resolveChild({ code, stdout, stderr }));
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'test-deployment');
    assert.deepEqual(requests.map(({ range }) => range), [
      `bytes 0-${5 * 1024 * 1024 - 1}/${5 * 1024 * 1024 + 100}`,
      `bytes ${5 * 1024 * 1024}-${5 * 1024 * 1024 + 99}/${5 * 1024 * 1024 + 100}`,
    ]);
    assert.equal(requests[1].uploadId, 'test-deployment');
    assert.ok(requests[0].bodyLength < 6 * 1024 * 1024);
    process.stdout.write('Appwrite upload split into two deployment chunks.\n');
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    const resolved = resolve(workingDirectory);
    if (!resolved.startsWith(`${resolve(tmpdir())}${sep}`)) {
      throw new Error('Refusing to remove test files outside the temporary directory');
    }
    await rm(resolved, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

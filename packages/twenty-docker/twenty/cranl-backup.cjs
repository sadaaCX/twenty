// Daily encrypted database snapshots, including Twenty's irreplaceable encryption keys.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt(ciphertext, key) {
  const cipher = createDecipheriv('aes-256-gcm', key, ciphertext.subarray(0, 12));
  cipher.setAuthTag(ciphertext.subarray(12, 28));
  return Buffer.concat([cipher.update(ciphertext.subarray(28)), cipher.final()]);
}

async function main() {
  if (process.argv[2] === '--self-test') {
    const key = randomBytes(32);
    const original = Buffer.from('database and encryption-key recovery');
    const encrypted = encrypt(original, key);
    assert.deepEqual(decrypt(encrypted, key), original);
    encrypted[28] ^= 1;
    assert.throws(() => decrypt(encrypted, key));
    assert.throws(() => decrypt(encrypt(original, key), randomBytes(32)));
    console.log('Encryption round-trip and tamper checks passed');
    return;
  }

  for (const name of ['PG_DATABASE_URL', 'APP_SECRET', 'ENCRYPTION_KEY',
    'BACKUP_ENCRYPTION_KEY', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY',
    'STORAGE_S3_ENDPOINT']) {
    assert(process.env[name], `Missing ${name}`);
  }
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'base64');
  assert.equal(key.length, 32, 'Backup encryption key must contain 32 bytes');
  console.log('Database version:', execFileSync('psql', [process.env.PG_DATABASE_URL,
    '-Atc', 'SHOW server_version']).toString().trim());
  const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
  const storage = new S3Client({
    region: 'auto', endpoint: process.env.STORAGE_S3_ENDPOINT,
    credentials: { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY },
  });
  // ponytail: 128 MiB dump ceiling; stream to multipart storage when exceeded.
  const dump = execFileSync('pg_dump', ['--format=custom', '--dbname',
    process.env.PG_DATABASE_URL], { maxBuffer: 128 * 1024 * 1024 });
  const body = Buffer.from(JSON.stringify({ version: 1, dump: dump.toString('base64'),
    APP_SECRET: process.env.APP_SECRET, ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    FALLBACK_ENCRYPTION_KEY: process.env.FALLBACK_ENCRYPTION_KEY || null }));
  const objectKey = `database/${new Date().toISOString()}.json.aesgcm`;
  const bucket = 'sadaa-twenty-backups';
  await storage.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey,
    Body: encrypt(body, key), ContentType: 'application/octet-stream' }));
  const downloaded = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  const recovered = decrypt(Buffer.from(await downloaded.Body.transformToByteArray()), key);
  assert.deepEqual(recovered, body, 'Stored backup differs from original');
  console.log(`Encrypted backup uploaded and download verified: ${objectKey}`);

  if (process.argv[2] === '--restore-check') {
    const folder = mkdtempSync(join(tmpdir(), 'twenty-restore-'));
    const name = `twenty_restore_${randomBytes(8).toString('hex')}`;
    const target = new URL(process.env.PG_DATABASE_URL);
    target.pathname = `/${name}`;
    let created = false;
    try {
      const file = join(folder, 'database.dump');
      writeFileSync(file, Buffer.from(JSON.parse(recovered).dump, 'base64'), { mode: 0o600 });
      execFileSync('psql', [process.env.PG_DATABASE_URL, '-v', 'ON_ERROR_STOP=1',
        '-c', `CREATE DATABASE ${name}`]);
      created = true;
      execFileSync('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl',
        '--dbname', target.toString(), file]);
      const restored = execFileSync('psql', [target.toString(), '-Atc',
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='core'"]).toString().trim();
      assert(Number(restored) > 0, 'Restored core schema is empty');
      console.log(`Restore into isolated database passed: ${restored} core tables`);
    } finally {
      try {
        if (created) execFileSync('psql', [process.env.PG_DATABASE_URL, '-v',
          'ON_ERROR_STOP=1', '-c', `DROP DATABASE ${name}`]);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }
  }
}

main().catch((error) => {
  // Avoid dumping child-process arguments containing connection credentials.
  console.error('Backup failed:', error.code || error.name);
  process.exitCode = 1;
});

import { createHash, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Where photos and receipts are kept. Only signed links ever leave the server. */
export type MediaStore = {
  /** A link the phone can use directly, for a limited time, without any login. */
  signedUrl(
    method: 'GET' | 'PUT' | 'DELETE',
    objectKey: string,
    options: { expiresSeconds: number; headers?: Record<string, string> }
  ): string;
  /** Removes a file (already gone counts as success). */
  deleteObject(objectKey: string): Promise<void>;
};

type ServiceAccountKey = { client_email: string; private_key: string };

// RFC 3986 encoding, as Google's V4 signing expects.
function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Google Cloud Storage via V4 signed URLs, signed locally with the storage
 * service account's key — no Google SDK and no network call to sign. The
 * phone uploads and downloads straight to Google, so photos never pass
 * through this server (whose free tier allows only 1 GB of outbound traffic
 * a month; Cloud Storage's allows 100 GB).
 * https://cloud.google.com/storage/docs/access-control/signing-urls-manually
 */
export function createGcsStore(bucket: string, key: ServiceAccountKey): MediaStore {
  const host = 'storage.googleapis.com';

  const signedUrl: MediaStore['signedUrl'] = (method, objectKey, { expiresSeconds, headers = {} }) => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261002T040000Z
    const datestamp = timestamp.slice(0, 8);
    const scope = `${datestamp}/auto/storage/goog4_request`;
    const path = `/${bucket}/${objectKey.split('/').map(encode).join('/')}`;

    const allHeaders: Record<string, string> = { host };
    for (const [name, value] of Object.entries(headers)) allHeaders[name.toLowerCase()] = value.trim();
    const headerNames = Object.keys(allHeaders).sort();
    const signedHeaders = headerNames.join(';');
    const canonicalHeaders = headerNames.map((name) => `${name}:${allHeaders[name]}\n`).join('');

    const params: Record<string, string> = {
      'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
      'X-Goog-Credential': `${key.client_email}/${scope}`,
      'X-Goog-Date': timestamp,
      'X-Goog-Expires': String(expiresSeconds),
      'X-Goog-SignedHeaders': signedHeaders,
    };
    const query = Object.keys(params)
      .sort()
      .map((name) => `${encode(name)}=${encode(params[name]!)}`)
      .join('&');

    const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = [
      'GOOG4-RSA-SHA256',
      timestamp,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signature = createSign('RSA-SHA256').update(stringToSign).sign(key.private_key, 'hex');
    return `https://${host}${path}?${query}&X-Goog-Signature=${signature}`;
  };

  return {
    signedUrl,
    async deleteObject(objectKey) {
      const response = await fetch(signedUrl('DELETE', objectKey, { expiresSeconds: 60 }), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Cloud Storage delete failed (${response.status})`);
      }
    },
  };
}

/** The bucket from the environment, or null when photo backup isn't set up. */
export function mediaStoreFromEnv(): MediaStore | null {
  const bucket = process.env.GCS_BUCKET;
  const keyFile = process.env.GCS_KEY_FILE;
  if (!bucket || !keyFile) return null;
  const key = JSON.parse(readFileSync(keyFile, 'utf8')) as ServiceAccountKey;
  if (!key.client_email || !key.private_key) throw new Error(`${keyFile} isn't a service account key`);
  return createGcsStore(bucket, key);
}

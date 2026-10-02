import { Directory, File, Paths } from 'expo-file-system';

import { shrinkImage } from './shrinkImage';

export type AttachmentKind = 'image' | 'pdf';

// Unlike localPhotoStorage's one-file-per-entity convention, a maintenance
// record can have several attachments, so each gets its own generated id
// rather than being named after the record itself.
function attachmentsDir(): Directory {
  const dir = new Directory(Paths.document, 'attachments', 'maintenance');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function saveAttachment(
  attachmentId: string,
  sourceUri: string,
  kind: AttachmentKind
): Promise<string> {
  const filename = `${attachmentId}.${kind === 'pdf' ? 'pdf' : 'jpg'}`;
  const destination = new File(attachmentsDir(), filename);
  const source = kind === 'image' ? await shrinkImage(sourceUri) : sourceUri;
  await new File(source).copy(destination, { overwrite: true });
  return filename;
}

export function deleteAttachment(filename: string): void {
  const file = new File(attachmentsDir(), filename);
  if (file.exists) file.delete();
}

/** Pure path build, no I/O — pass straight to <Image source={{ uri }} /> or Linking.openURL. */
export function getAttachmentUri(filename: string): string {
  return new File(attachmentsDir(), filename).uri;
}

import { Directory, File, Paths } from 'expo-file-system';

import { shrinkImage } from './shrinkImage';

export type PhotoCategory = 'avatar' | 'bikes' | 'maintenance';

function categoryDir(category: PhotoCategory): Directory {
  const dir = new Directory(Paths.document, 'photos', category);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// Filename is always `<entityId>.jpg` — a collision-free, lookup-free
// mapping from a DB row's id to its file, no separate photo-id bookkeeping.
function photoFile(category: PhotoCategory, entityId: string): File {
  return new File(categoryDir(category), `${entityId}.jpg`);
}

/**
 * Copies a picked image (e.g. from expo-image-picker) into permanent local
 * storage, replacing any previous photo for that entity. Returns the
 * filename to store in the owning DB row.
 */
export async function savePhoto(
  category: PhotoCategory,
  entityId: string,
  sourceUri: string
): Promise<string> {
  const destination = photoFile(category, entityId);
  await new File(await shrinkImage(sourceUri)).copy(destination, { overwrite: true });
  return destination.name;
}

export function deletePhoto(category: PhotoCategory, entityId: string): void {
  const file = photoFile(category, entityId);
  if (file.exists) file.delete();
}

/**
 * For <Image source={{ uri }} /> only. A replaced or restored photo keeps its
 * file name, so the URI carries the file's save time: with the bare path the
 * image cache keeps showing the old picture (e.g. after signing out and back
 * in, the restored avatar showed the photo from before it was changed).
 */
export function getPhotoUri(category: PhotoCategory, entityId: string): string {
  const file = photoFile(category, entityId);
  const { exists, modificationTime } = file.info();
  return exists && modificationTime ? `${file.uri}?v=${modificationTime}` : file.uri;
}

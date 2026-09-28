import { Directory, File, Paths } from 'expo-file-system';

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
  await new File(sourceUri).copy(destination, { overwrite: true });
  return destination.name;
}

export function deletePhoto(category: PhotoCategory, entityId: string): void {
  const file = photoFile(category, entityId);
  if (file.exists) file.delete();
}

/** Pure path build, no I/O — pass straight to <Image source={{ uri }} />. */
export function getPhotoUri(category: PhotoCategory, entityId: string): string {
  return photoFile(category, entityId).uri;
}

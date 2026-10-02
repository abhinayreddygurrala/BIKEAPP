// Loaded via require() in try/catch per this project's native-module
// convention: if the module is missing, photos are just saved full-size.
let ImageManipulator: typeof import('expo-image-manipulator') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImageManipulator = require('expo-image-manipulator');
} catch (e) {
  console.error('[shrinkImage] expo-image-manipulator native module unavailable', e);
}

const MAX_EDGE = 1600;
const QUALITY = 0.7;

/**
 * A phone-camera photo (3–5 MB) shrunk to at most 1600 px on its long edge
 * as a 0.7 JPEG — usually 200–400 KB, still sharp on any phone screen. Keeps
 * the app's storage small and makes backup uploads and restores quick.
 * Returns the original URI if shrinking isn't possible.
 */
export async function shrinkImage(uri: string): Promise<string> {
  if (!ImageManipulator) return uri;
  try {
    const { ImageManipulator: manipulator, SaveFormat } = ImageManipulator;
    const original = await manipulator.manipulate(uri).renderAsync();
    const longEdge = Math.max(original.width, original.height);
    const image =
      longEdge > MAX_EDGE
        ? await manipulator
            .manipulate(uri)
            .resize(original.width >= original.height ? { width: MAX_EDGE } : { height: MAX_EDGE })
            .renderAsync()
        : original;
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });
    return saved.uri;
  } catch (e) {
    console.warn('[shrinkImage] keeping the full-size photo', e);
    return uri;
  }
}

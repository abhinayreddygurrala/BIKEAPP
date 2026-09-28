import {
  createLocalBike,
  deleteLocalBike,
  getAllLocalBikes,
  getLocalBike,
  updateLocalBike,
  type LocalBike,
  type LocalBikeUpdate,
} from '@/features/bikes/bikesLocalDb';
import { deletePhoto, getPhotoUri, savePhoto } from '@/lib/localPhotoStorage';
import { uuidv4 } from '@/lib/uuid';

// Screens don't need to know about the filename/path convention behind a
// bike's photo — `photo_url` is computed here from `photo_filename` and is
// ready to hand straight to <Image source={{ uri }} />.
export type Bike = LocalBike & { photo_url: string | null };

function withPhotoUrl(bike: LocalBike): Bike {
  return {
    ...bike,
    photo_url: bike.photo_filename ? getPhotoUri('bikes', bike.id) : null,
  };
}

export async function listBikes(): Promise<Bike[]> {
  const rows = await getAllLocalBikes();
  return rows.map(withPhotoUrl);
}

export async function getBike(bikeId: string): Promise<Bike | null> {
  const row = await getLocalBike(bikeId);
  return row ? withPhotoUrl(row) : null;
}

export async function createBike(input: {
  name: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): Promise<Bike> {
  const id = uuidv4();
  await createLocalBike({
    id,
    name: input.name,
    make: input.make ?? null,
    model: input.model ?? null,
    year: input.year ?? null,
  });
  const row = await getLocalBike(id);
  if (!row) throw new Error('Failed to create bike');
  return withPhotoUrl(row);
}

export async function updateBike(
  bikeId: string,
  updates: Partial<Pick<LocalBike, 'name' | 'make' | 'model' | 'year' | 'current_odometer_km' | 'vin'>>
): Promise<Bike> {
  await updateLocalBike(bikeId, updates as LocalBikeUpdate);
  const row = await getLocalBike(bikeId);
  if (!row) throw new Error('Bike not found');
  return withPhotoUrl(row);
}

/** Copies `localUri` into permanent storage as this bike's photo and records it on the row. */
export async function setBikePhoto(bikeId: string, localUri: string): Promise<void> {
  const filename = await savePhoto('bikes', bikeId, localUri);
  await updateLocalBike(bikeId, { photo_filename: filename });
}

export async function deleteBike(bikeId: string): Promise<void> {
  const bike = await getLocalBike(bikeId);
  if (bike?.photo_filename) {
    deletePhoto('bikes', bikeId);
  }
  await deleteLocalBike(bikeId);
}

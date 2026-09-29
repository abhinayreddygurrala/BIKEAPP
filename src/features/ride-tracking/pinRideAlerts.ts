import { Alert } from 'react-native';

import { MAX_PINNED_RIDES } from '@/services/ridesService';

/** Tapping the ⋯ menu on a ride asks whether to pin/unpin it. */
export function promptTogglePin(pinned: boolean, onConfirm: () => void) {
  Alert.alert(
    pinned ? 'Unpin this ride?' : 'Pin this ride?',
    pinned
      ? 'It will no longer be kept at the top of your ride list.'
      : 'It will be kept at the top of your ride list.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: pinned ? 'Unpin' : 'Pin', style: pinned ? 'destructive' : 'default', onPress: onConfirm },
    ]
  );
}

export function showPinLimitAlert() {
  Alert.alert('Pin limit reached', `You can only pin up to ${MAX_PINNED_RIDES} rides. Unpin one first.`);
}

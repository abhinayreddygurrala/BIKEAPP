import { useEffect, useRef, useState } from 'react';

import {
  GoogleUnavailableError,
  newSearchSession,
  resolvePlace,
  searchPlaces,
  type LatLng,
  type MapsSource,
  type Place,
  type PlaceSuggestion,
} from '@/services/routePlannerService';

// Long enough that dictated or typed words arrive before searching, short
// enough to feel live. Every Google search counts toward the free allowance.
const SEARCH_DELAY_MS = 400;
const MIN_QUERY_LENGTH = 2;

/**
 * One place field (From or To): suggestions while typing, then the picked
 * place. Editing the text again drops the pick and searches anew.
 */
export function usePlaceSearch(source: MapsSource | null, near: LatLng | null, onGoogleUnavailable: () => void) {
  const [query, setQueryState] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(newSearchSession());
  const latestRequest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  /** Searches `text` after a short pause; any newer call or pick cancels it. */
  const scheduleSearch = (text: string, searchWith: MapsSource | null) => {
    if (timer.current) clearTimeout(timer.current);
    const request = ++latestRequest.current;
    const trimmed = text.trim();
    if (!searchWith || trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const found = await searchPlaces(searchWith, trimmed, near, session.current);
        if (request !== latestRequest.current) return;
        setSuggestions(found.slice(0, 5));
        setError(found.length === 0 ? 'No places found. Try adding a city or state.' : null);
      } catch (e) {
        if (request !== latestRequest.current) return;
        if (e instanceof GoogleUnavailableError) onGoogleUnavailable();
        else setError(e instanceof Error ? e.message : 'Search failed. Try again.');
      } finally {
        if (request === latestRequest.current) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
  };

  const setQuery = (text: string) => {
    setQueryState(text);
    setPlace(null);
    setError(null);
    scheduleSearch(text, source);
  };

  /** Looks up a suggestion's location. Returns the place, or null if that failed. */
  const pick = async (suggestion: PlaceSuggestion): Promise<Place | null> => {
    if (!source) return null;
    if (timer.current) clearTimeout(timer.current);
    latestRequest.current += 1;
    setSuggestions([]);
    setSearching(true);
    try {
      const picked = await resolvePlace(source, suggestion, session.current);
      setPlace(picked);
      const { title, subtitle } = suggestion;
      setQueryState(!subtitle ? title : subtitle.startsWith(title) ? subtitle : `${title}, ${subtitle}`);
      setError(null);
      return picked;
    } catch (e) {
      if (e instanceof GoogleUnavailableError) onGoogleUnavailable();
      else setError(e instanceof Error ? e.message : 'Couldn’t open that place. Try again.');
      return null;
    } finally {
      // Picking ends the Google session; the next search starts a new one.
      session.current = newSearchSession();
      setSearching(false);
    }
  };

  /**
   * Forget the pick but keep the text and search it again with `searchWith`,
   * e.g. after switching from Google to Apple.
   */
  const researchWith = (searchWith: MapsSource | null) => {
    setPlace(null);
    session.current = newSearchSession();
    scheduleSearch(query, searchWith);
  };

  return { query, setQuery, place, suggestions, searching, error, pick, researchWith };
}

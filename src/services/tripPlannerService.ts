import { FoundationModels } from 'expo-foundation-models';

// Keep this framed around riding, not generic tourism — the whole app is
// for motorcyclists, so "best places to visit" means "worth the detour on
// two wheels," not a general city guide. Unlike the old Gemini-backed
// version, this runs fully on-device (Apple's Foundation Models framework)
// with no network call and no API key — the trade-off, made explicitly by
// the user, is that it can't search the live web, so it answers from what
// the model already knows rather than current conditions.
const SYSTEM_PROMPT = `You are the trip-planning assistant inside Odomap, a motorcycle ride-tracking app. Every answer is for someone riding a motorcycle, not driving a car or walking — prioritize twisty/scenic roads, good pavement, and viewpoints or stops a rider would actually detour for. You do not have access to the live internet, so answer from general knowledge rather than claiming to check current conditions. Keep answers organized and concise, since this is read on a phone screen: a short list of recommended roads/routes (each with a one-line reason it's good for riding), then a short list of nearby places worth visiting. If a from/to trip is given, favor the curviest, most scenic way to connect them over the fastest highway, and if it spans multiple days, break the suggestion into a short day-by-day plan. If a date or season is mentioned, note anything seasonally relevant (e.g. fall foliage, road closures typical for that time of year) from general knowledge. If the location given is ambiguous or you're not confident, say so rather than guessing.`;

export async function isTripPlannerAvailable(): Promise<boolean> {
  return FoundationModels.isAvailable();
}

export async function askTripPlanner(query: string): Promise<string> {
  if (!FoundationModels.isAvailable()) {
    throw new Error('On-device AI isn’t available on this phone (needs Apple Intelligence turned on).');
  }
  const sessionId = await FoundationModels.createSession(SYSTEM_PROMPT);
  try {
    const answer = await FoundationModels.respond(sessionId, query);
    if (!answer.trim()) throw new Error('No answer generated');
    return answer;
  } finally {
    await FoundationModels.closeSession(sessionId).catch(() => {});
  }
}

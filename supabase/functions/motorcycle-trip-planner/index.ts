import { withSupabase } from '@supabase/server';
import { GoogleGenAI } from '@google/genai';

// Keep this framed around riding, not generic tourism — the whole app is
// for motorcyclists, so "best places to visit" means "worth the detour on
// two wheels," not a general city guide.
const SYSTEM_PROMPT = `You are the trip-planning assistant inside BikeApp, a motorcycle ride-tracking app. Every answer is for someone riding a motorcycle, not driving a car or walking — prioritize twisty/scenic roads, good pavement, and viewpoints or stops a rider would actually detour for. Use Google Search to ground your answer in current, real information rather than relying on memory alone. Keep answers organized and concise, since this is read on a phone screen: a short list of recommended roads/routes (each with a one-line reason it's good for riding), then a short list of nearby places worth visiting. If the location given is ambiguous or you're not confident, say so rather than guessing.`;

// Gemini 2.5 Flash: free-tier eligible with Google Search grounding
// included (rate-limited before any billing kicks in) — see
// https://ai.google.dev/gemini-api/docs/pricing.
const MODEL = 'gemini-2.5-flash';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let query: unknown;
    try {
      ({ query } = await req.json());
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (typeof query !== 'string' || !query.trim()) {
      return Response.json({ error: 'Missing "query" string' }, { status: 400 });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Server not configured (missing GEMINI_API_KEY)' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: query.trim(),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
      },
    });

    const answer = response.text;
    if (!answer) {
      return Response.json({ error: 'No answer generated' }, { status: 502 });
    }

    return Response.json({ answer });
  }),
};

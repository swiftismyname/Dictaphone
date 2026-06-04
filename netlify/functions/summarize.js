// netlify/functions/summarize.js  (Gemini free-tier version)
// Proxies the transcript to Google's Gemini API. Front end is unchanged.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let transcript = "";
  try {
    transcript = (JSON.parse(event.body || "{}").transcript || "").trim();
  } catch (_) {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad request body" }) };
  }
  if (transcript.length < 3) {
    return { statusCode: 400, body: JSON.stringify({ error: "Transcript too short" }) };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not set" }) };
  }

  const prompt =
    "You process raw voice-note transcripts into structured notes. The transcript may be messy, with filler words and run-on phrasing.\n\n" +
    "Return ONLY a JSON object with EXACTLY this shape:\n" +
    "{\n" +
    '  "title": "3-6 word title capturing the note",\n' +
    '  "summary": "2-4 sentence plain summary of what was said",\n' +
    '  "keyPoints": ["concise point", "..."],\n' +
    '  "nextSteps": [{"text":"clear action item","owner":"name or empty string","due":"timeframe or empty string","priority":"high"}]\n' +
    "}\n\n" +
    'Rules: priority is one of "high","medium","low". If there are no real action items, return an empty nextSteps array. ' +
    "Keep keyPoints to the 3-6 most important. Infer owners/due dates only if clearly stated; otherwise use empty strings.\n\n" +
    'TRANSCRIPT:\n"""\n' + transcript + '\n"""';

  const MODEL = "gemini-2.5-flash"; // free-tier workhorse; "gemini-2.5-flash-lite" allows more requests/min

  try {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json", // JSON mode: forces valid JSON output
            maxOutputTokens: 1024,
            temperature: 0.3
          }
        })
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      const msg = (data.error && data.error.message) || "Gemini API error";
      return { statusCode: resp.status, body: JSON.stringify({ error: msg }) };
    }

    const raw = (((data.candidates || [])[0] || {}).content || {}).parts
      ? data.candidates[0].content.parts.map((p) => p.text || "").join("\n")
      : "";

    if (!raw) {
      return { statusCode: 502, body: JSON.stringify({ error: "Empty response from Gemini" }) };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};

// netlify/functions/summarize.js  (Gemini free-tier version)
// Two modes, one endpoint:
//   • text  : { transcript }            -> summarize an existing transcript
//   • audio : { audio (base64), mimeType } -> transcribe an uploaded recording, THEN summarize
// Both return { raw: "<JSON string>" }. In audio mode the JSON also carries a "transcript" field
// so the front end can drop the transcription into the editor.

const MODEL = "gemini-2.5-flash"; // free-tier workhorse; "gemini-2.5-flash-lite" allows more req/min

// Netlify synchronous functions cap the request body around 6 MB. Base64 inflates ~33%,
// so we keep the encoded audio under ~5.8M chars (~4.3 MB of raw audio) to stay safely inside.
const MAX_AUDIO_B64 = 5800000;

// Shared instructions. Michael is the app's primary user; unowned actions default to him.
function instructions() {
  return (
    "You turn raw voice notes into structured, actionable notes for the app's primary user, MICHAEL.\n" +
    "The source may be messy, with filler words and run-on phrasing.\n\n" +
    "Return ONLY a JSON object with EXACTLY this shape:\n" +
    "{\n" +
    '  "title": "3-6 word title capturing the note",\n' +
    '  "summary": "2-4 sentence plain summary of what was said",\n' +
    '  "keyPoints": ["concise point", "..."],\n' +
    '  "nextSteps": [{"text":"clear action item","owner":"name","due":"timeframe or empty string","priority":"high"}]\n' +
    "}\n\n" +
    "Rules:\n" +
    '- priority is one of "high","medium","low".\n' +
    "- ALWAYS surface concrete next steps for Michael. If the note implies any follow-up, decision, " +
    "reply, purchase, or task, capture it as an action item. Only return an empty nextSteps array if " +
    "there is genuinely nothing to act on.\n" +
    '- owner: if an action clearly belongs to a different named person, use that name; otherwise ' +
    'default the owner to "Michael".\n' +
    "- due: include a timeframe only if it is clearly stated; otherwise empty string.\n" +
    "- Keep keyPoints to the 3-6 most important.\n"
  );
}

// Map common browser MIME types to what Gemini expects for audio.
function normMime(m) {
  m = (m || "").toLowerCase().split(";")[0].trim();
  const map = {
    "audio/mpeg": "audio/mp3",
    "audio/mpga": "audio/mp3",
    "audio/mp3": "audio/mp3",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/vnd.wave": "audio/wav",
    "audio/x-aiff": "audio/aiff",
    "audio/x-flac": "audio/flac",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/mp4": "audio/mp4",
    "audio/x-aac": "audio/aac"
  };
  return map[m] || m || "audio/mp3";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad request body" }) };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not set" }) };
  }

  const hasAudio = typeof body.audio === "string" && body.audio.length > 0;

  let parts, maxOut;

  if (hasAudio) {
    if (body.audio.length > MAX_AUDIO_B64) {
      return {
        statusCode: 413,
        body: JSON.stringify({
          error: "Recording is too large. Please upload a clip under ~4 MB (try a compressed format like MP3 or M4A)."
        })
      };
    }
    const prompt =
      instructions() +
      "\nTranscribe the attached audio recording, then build the note from what is actually said. " +
      'INCLUDE the full transcription as an extra string field "transcript" in the SAME JSON object.';
    parts = [
      { text: prompt },
      { inline_data: { mime_type: normMime(body.mimeType), data: body.audio } }
    ];
    maxOut = 8192; // room for the transcript plus the structured output
  } else {
    const transcript = (body.transcript || "").trim();
    if (transcript.length < 3) {
      return { statusCode: 400, body: JSON.stringify({ error: "Transcript too short" }) };
    }
    const prompt = instructions() + '\nTRANSCRIPT:\n"""\n' + transcript + '\n"""';
    parts = [{ text: prompt }];
    maxOut = 1024;
  }

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
          contents: [{ parts: parts }],
          generationConfig: {
            responseMimeType: "application/json", // JSON mode: forces valid JSON output
            maxOutputTokens: maxOut,
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

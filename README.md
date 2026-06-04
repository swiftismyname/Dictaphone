# Dictaphone — Voice Notes → Summary + Next Steps (Gemini / free tier)

Records voice in the browser (Web Speech API), sends the transcript to Google's
Gemini API through a Netlify serverless function, and returns a title, summary,
key points, and checkable next steps.

## Repo structure — THIS MATTERS
Netlify only detects functions inside `netlify/functions/`. Your GitHub repo
must look exactly like this:

```
index.html                      ← repo root
netlify.toml                    ← repo root
README.md                       ← repo root (optional)
netlify/
  └── functions/
        └── summarize.js        ← the function MUST live here, not at root
```

If `summarize.js` sits at the repo root, the app will show:
"Unexpected token '<' ... is not valid JSON" (the function URL 404s).

## Setup
1. **Gemini key (free, no credit card):** go to aistudio.google.com →
   Get API key → Create API key. Copy the `AIza...` key.
   Do NOT enable billing on that Google project — billing removes the free tier.
2. **Netlify env var:** Site configuration → Environment variables →
   Add a variable → Key: `GEMINI_API_KEY`  Value: your key. Save.
3. **Push this folder to GitHub** with the structure above. Netlify auto-builds.
4. **Verify:** open `https://YOURSITE.netlify.app/.netlify/functions/summarize`
   in a browser. Seeing `{"error":"Method not allowed"}` means the function is
   live. Then open the app, type a sentence, hit Analyze.

## Troubleshooting
- HTML-instead-of-JSON error → function not deployed; check the structure above
  and look for a "Functions bundling" section in the Netlify deploy log.
- "GEMINI_API_KEY is not set" → env var name typo, or the deploy ran before the
  variable was saved; trigger a redeploy (Deploys → Trigger deploy).
- "API key not valid" → re-paste the key, watch for trailing spaces.
- 429 / quota error → free-tier per-minute limit; wait a minute and retry.
- Function logs: Netlify → Logs → Functions → summarize.

## Notes
- Mic needs HTTPS (Netlify provides it) or localhost; it won't run from file://.
- iOS in-app browsers may block speech recognition; Safari/Chrome proper work.
  You can always type/paste a transcript and still Analyze.
- Model is set in `summarize.js` (`gemini-2.5-flash`); `gemini-2.5-flash-lite`
  allows more requests/minute if you ever need it.
- Free-tier caveat: Google's terms allow free-tier prompts to be used for model
  training. Fine for errands; think twice before dictating sensitive work notes.
- History is in-memory only and clears on reload.

## Run locally
```
npm install -g netlify-cli
export GEMINI_API_KEY=AIza...        # Windows: set GEMINI_API_KEY=...
netlify dev
```

# TONE3000 API Integration Examples

Reference integrations showing how to connect your app to the TONE3000 API.
TONE3000 is a tone library for guitar and audio software. Visit
[tone3000.com/api](https://www.tone3000.com/api) for full API documentation.

A live example of this demo can be viewed at [t3k-api-demo.vercel.app](https://t3k-api-demo.vercel.app/).

Run any of them locally in minutes using your own TONE3000 API key.

## Demo Apps

### Acme Inc: Select Flow
*Best for: Plugins, DAWs, and apps where TONE3000 drives tone discovery.*

Acme Inc is a guitar amp simulation plugin. When a user clicks "Browse Tones on
TONE3000", they're taken to the TONE3000 catalog to browse and select a tone.
Once selected, Acme Inc receives the tone and its downloadable model files.
Optional `gears`, `format`, and `architecture` query params scope the catalog
to your product's supported types.

**Flow:** `GET /api/v1/oauth/authorize?prompt=select_tone&gears=full-rig&architecture=2` → callback with `tone_id` → `GET /api/v1/tones/{id}` + `GET /api/v1/models?tone_id={id}`

---

### Beacon Inc: Load Tone Flow
*Best for: Apps with saved tone references that need authentication and access checking.*

Beacon Inc is a rig preset manager. It stores TONE3000 tone IDs in its presets and
loads them on demand. TONE3000 handles the auth check. If a tone is private or
deleted, the user can pick a replacement without leaving the flow. Optional `gears`,
`format`, and `architecture` filters scope the replacement browse view to your product's supported types.

**Flow:** `GET /api/v1/oauth/authorize?prompt=load_tone&tone_id=42&gears=amp&architecture=2` → callback with `tone_id` + code → fetch tone

---

### Chord Inc: Full API Integration
*Best for: Apps with a custom tone browsing and discovery experience.*

Chord Inc demonstrates every documented TONE3000 endpoint: search with filters,
tone detail views, user profiles, favorites, model listings, and file downloads.
It's the reference implementation for a full API integration.

**Endpoints used:** `GET /user`, `GET /tones/search`, `GET /tones/created`, `GET /tones/favorited`,
`GET /tones/{id}`, `GET /models/{id}`, `GET /models`, `GET /users`

---

### Echo Inc: Presigned Uploads
*Best for: Apps that create TONE3000 content, capturing rigs or publishing models programmatically.*

Echo Inc is a capture station. It records rigs and publishes the results to
TONE3000 without hosting anything itself, by asking for a presigned URL, sending
the bytes straight to storage, then handing the resulting `upload_id` to the
endpoint that should own the file.

The demo follows the same shape as the capture and upload pages on the site.
The user chooses between capturing gear and publishing a model they already
have, adds the files, names the tone, and then watches either the training run
or the finished models appear. Capture recordings are checked against the
trainer's spec in the browser first, from the WAV header alone, so a file that
would be refused never gets uploaded. When a call fails after spending a handle,
the demo reconciles by reading the resource back rather than retrying blindly,
which is the recovery every real integration needs.

**Endpoints used:** `POST /tones`, `POST /uploads`, `PUT <presigned storage URL>`, `POST /trainings`, `GET /trainings`, `POST /models`

See [Presigned Uploads](#presigned-uploads) below for the full interface, limits,
timing and error reference.

---

### Devo Inc: LAN-relay Flow
*Best for: Headless devices, kiosks, embedded hardware with no system browser.*

Devo Inc ships embedded guitar processors with a touchscreen but no system
browser and no keyboard. To connect a TONE3000 account, the device opens an
HTTP listener on its LAN IP, shows a QR pointing at TONE3000's authorize
endpoint with the LAN URI as `redirect_uri`, and waits. The user scans on
their phone, signs in, and TONE3000 forwards the issued code back to the
device's listener via an internal HTTPS bridge. PKCE keeps the code
unredeemable by anyone but the device.

**Flow:** `GET /api/v1/oauth/authorize?redirect_uri=http://192.168.x.x:port/cb` → user signs in on phone → `/oauth/lan-bridge` 307 → device's LAN listener receives code → `POST /oauth/token` with `redirect_uri` unchanged

**Cross-device requirement:** the phone must be on the same Wi-Fi as the
laptop/device. The demo's "device" is the laptop's Vite dev server itself.
See [`vite-plugin-lan-bridge.ts`](./vite-plugin-lan-bridge.ts) for how the
LAN listener is implemented in dev. In production, your firmware does this
on the embedded hardware.

---

## Quick Start

### 1. Get your API keys

1. Log in to [tone3000.com](https://www.tone3000.com)
2. Go to **Settings → API Keys**
3. Click **Create API Keys**. One click issues both keys.
4. Copy the `t3k_pub_…` **publishable key**. It identifies your app in OAuth
   flows and is safe in client-side code. The demos in this repo use it.
5. Reveal and copy the `t3k_cs_…` **secret key** if you plan to call the API
   directly from a server, which is what the [curl walkthrough](#curl-walkthrough)
   below does. Treat it like a database password and keep it off any user's
   device. You can regenerate or revoke it from the same page without breaking
   OAuth or your publishable key.

### 2. Configure your environment

```bash
cp env.example .env
```

Edit `.env`:

```
VITE_PUBLISHABLE_KEY=t3k_pub_your_key_here
VITE_REDIRECT_URI=http://localhost:3001
```

**Registering your redirect URI:** In TONE3000 Settings → API Keys, add
`http://localhost:3001` to your key's allowed redirect URIs. Localhost origins
are automatically allowed during development, so no registration is needed.

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to see the demo apps. Each
one opens a self-contained integration example.

---

## SDK Client

The `src/tone3000-client.ts` file is a zero-dependency integration helper
that covers the OAuth flows and the full set of API endpoints. Use it as
inspiration for your own integration.

### OAuth Flow Functions

```typescript
import { startSelectFlow, startLoadToneFlow, startStandardFlow, handleOAuthCallback, T3KClient } from './tone3000-client';

// Select Flow. The user browses TONE3000 and picks a tone.
// Optional: gears, format, architecture, menubar (same query params as the authorize URL)
await startSelectFlow(PUBLISHABLE_KEY, REDIRECT_URI, { gears: 'full-rig', architecture: 2 });

// Load Tone Flow. TONE3000 authenticates the user and checks access to a specific tone.
// Optional: pass gears/format/architecture to filter the replacement browse view if the tone is inaccessible
await startLoadToneFlow(PUBLISHABLE_KEY, REDIRECT_URI, toneId, { gears: 'amp', format: 'nam', architecture: 2 });

// Standard Flow. The user connects their TONE3000 account and your app fetches tones programmatically.
await startStandardFlow(PUBLISHABLE_KEY, REDIRECT_URI);
```

### Handling the Callback

```typescript
// In your callback handler (runs when TONE3000 redirects back to your app):
const result = await handleOAuthCallback(PUBLISHABLE_KEY, REDIRECT_URI);

if (result.ok) {
  client.setTokens(result.tokens);
  const { toneId } = result; // present for select/load_tone flows
} else {
  console.error('Auth failed:', result.error);
}
```

### T3KClient: Authenticated API Requests

```typescript
const client = new T3KClient(PUBLISHABLE_KEY, () => {
  // Called when tokens expire beyond refresh. Restart auth.
  startStandardFlow(PUBLISHABLE_KEY, REDIRECT_URI);
});

// Set tokens from the callback result
client.setTokens(result.tokens);

// Fetch a tone
const tone = await client.getTone(42);

// Fetch models for a tone (each has a model_url for downloading)
const { data: models } = await client.listModels(42, { architecture: 2 });

// Search tones with filters
const results = await client.searchTones({ query: 'fender', gears: [Gear.Amp], sort: TonesSort.Trending, architecture: 2 });

// Download a model file. This needs Bearer auth, so use this method rather than fetch().
await client.downloadModel(model.model_url, model.name);
```

### Uploading Files

One call covers mint, PUT and consume. Pass the `File` straight off the input
element; anything that changes its byte length breaks the signed upload.

```typescript
import { T3KApiError, T3K_UPLOAD_LIMITS } from './tone3000-client';
import { UploadKind } from './types';

const model = await client.uploadFile(file, { resource: 'model', toneId: 42 }, (p) => {
  // p.phase is 'minting' | 'uploading' | 'consuming' | 'done'
  setLabel(p.phase);
  setBar(p.fraction);
});

// Or drive the three steps yourself
const ticket = await client.createUpload({ kind: UploadKind.Image, filename: file.name, size_bytes: file.size });
await client.putUpload(ticket, file, (p) => setBar(p.fraction));
const tone = await client.setToneImage(42, ticket.upload_id);

// Errors carry the API's own text and say whether a fresh handle would help
try {
  await client.uploadFile(file, { resource: 'tone-image', toneId: 42 });
} catch (err) {
  if (err instanceof T3KApiError) {
    console.error(err.message, err.serverMessage, err.status, err.stage);
    // err.remint === true  → the handle is finished. Mint a new upload and PUT again.
    // err.remint === false → a new handle will not help, and this is NOT a retry signal.
    //                        401/403 are auth and ownership, 400/413/422 mean the request
    //                        itself has to change, and a 500 needs the recovery described
    //                        under "Losing a response" below. Branch on err.status.
  }
}

// T3K_UPLOAD_LIMITS[kind] gives the cap and allowed extensions for a file picker
T3K_UPLOAD_LIMITS[UploadKind.Model]; // { maxBytes: 268435456, extensions: ['nam', 'wav', …] }
```

`uploadFile` targets a model or a tone image. Training audio is not one of its
targets, because the handle goes to `/trainings` alongside the others in the set
rather than to an endpoint of its own. Drive that path with the three calls
directly:

```typescript
const ticket = await client.createUpload({ kind: UploadKind.Audio, filename: file.name, size_bytes: file.size });
await client.putUpload(ticket, file, (p) => setBar(p.fraction));

// Up to 10 outputs in one call, so the whole set is accepted or rejected together
const { trainings } = await client.startTrainings({
  toneId: 42,
  outputs: [{ uploadId: ticket.upload_id, name: 'Clean' }],
});

// Poll until nothing is still running
const { data } = await client.listTrainings(42);
```

The curl version is under
[Capture audio, start to finish](#capture-audio-start-to-finish).

---

## Presigned Uploads

### What it gives you

Send a capture recording and get a trained model back, publish models you
already have, or add images to a tone. No storage or public URL of your own
required.

1. `POST /api/v1/uploads` mints a presigned `PUT` URL into a private staging
   bucket and returns an `upload_id` handle.
2. Your client `PUT`s the bytes straight to storage. The API never sees them.
3. Your client passes `upload_id` to the endpoint that should own the file
   (`POST /models`, `POST /trainings`, `POST /tones`, `PATCH /tones/{id}`),
   which validates the staged object and copies it into its destination bucket.

Both the mint call and every consuming call accept either auth path: an OAuth
access token from any of the flows above, or a `t3k_cs_…` secret key.

### 1. Mint: `POST /api/v1/uploads`

**Request (single file).** A bare JSON object. All three fields are required.

```json
{ "kind": "model", "filename": "clean.nam", "size_bytes": 302144 }
```

| Field | Rules |
|-------|-------|
| `kind` | `model`, `audio`, or `image` |
| `filename` | Trimmed, 1 to 255 characters, no control characters. Its extension must be in the kind's allowlist |
| `size_bytes` | Positive integer. Not string-coercible, so send a number |

Unknown extra fields are ignored rather than rejected.

**Request (batch).** Up to 25 entries, kinds may be mixed:

```json
{ "uploads": [ { "kind": "audio", "filename": "sweep.wav", "size_bytes": 41943040 } ] }
```

Dispatch is on the presence of the `uploads` key, so `{"uploads": "x"}` is read
as a malformed batch, never as a single upload. The batch is all or nothing:
every entry is validated before any handle is created.

**Response.** `201`, mirroring the request shape. A single request gets one
object; a batch gets `{ "uploads": [ … ] }` in request order.

```json
{
  "upload_id": "up_1f0c…",
  "url": "https://…/storage/v1/s3/api-staging/staging/prod/model/…/….nam?X-Amz-…",
  "method": "PUT",
  "headers": { "Content-Length": "302144" },
  "url_expires_at": "2026-09-12T18:00:00.000Z",
  "expires_at": "2026-09-13T17:00:00.000Z"
}
```

### 2. The PUT

Send the body to `url` with method `PUT` and exactly `size_bytes` bytes. Only
`content-length` and `host` are signed into the URL
(`X-Amz-SignedHeaders=content-length;host`), so the length is part of the
signature. `Content-Type` is deliberately not signed and is ignored; the real
type is stamped from the extension when the file is copied out.

The signed length is the whole size control.

| What you send | What happens |
|---|---|
| A length that is not `size_bytes` | `403 SignatureDoesNotMatch`, before a byte is read |
| The right length, then a longer body | Stored at exactly `size_bytes`. The extra bytes are never read |
| The right length, then a shorter body | No response at all. The request hangs until your client times out. Nothing is stored |

No path leaves a partial object behind, which is why the endpoint that later
consumes the handle can trust the size it sees.

**From a browser** you cannot set `Content-Length`, and you do not have to.
`fetch` and `XMLHttpRequest` both take it from `Blob.size`. Three consequences:

- Pass the `File` straight off the input element. Re-encoding, resizing, or a
  canvas round trip changes the length and turns the PUT into a 403.
- A streamed (`ReadableStream`) request body does not work in Chrome. Use a
  `File` or `Blob`.
- `fetch` reports no upload progress. The demo's `putUpload` uses
  `XMLHttpRequest` for that reason.

**From a server** you can set `Content-Length`, so send the `headers` object
back exactly as it arrived. This is where the large files actually come from, so
it is worth being precise about the two ways of sending them.

A whole-file buffer body needs nothing extra. Node's `fetch` sets
`Content-Length` from the buffer's length, and so does Python's `requests`.

```typescript
import fs from 'node:fs';

const BASE = 'https://www.tone3000.com/api/v1';
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const bytes = await fs.promises.readFile('clean.nam');
const ticket = await (await fetch(`${BASE}/uploads`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ kind: 'model', filename: 'clean.nam', size_bytes: bytes.byteLength })
})).json();

await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: bytes });
```

Streaming is what you want above a few tens of megabytes, and it takes one extra
step. A stream with no `Content-Length` goes out as `Transfer-Encoding: chunked`.
Storage accepts a chunked body only when it turns out to be exactly the declared
length, and answers `403` at any other length, so streaming is safe as long as
the stream is exactly `size_bytes` long. Setting the header yourself removes the
doubt:

```typescript
import fs from 'node:fs';
import { Readable } from 'node:stream';

const { size } = await fs.promises.stat('sweep.wav');
const ticket = await (await fetch(`${BASE}/uploads`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ kind: 'audio', filename: 'sweep.wav', size_bytes: size })
})).json();

const res = await fetch(ticket.url, {
  method: 'PUT',
  headers: ticket.headers,          // { 'Content-Length': String(size) }
  body: Readable.toWeb(fs.createReadStream('sweep.wav')),
  duplex: 'half'
});
if (!res.ok) throw new Error(`PUT ${res.status}: ${await res.text()}`);
```

```python
size = os.path.getsize('sweep.wav')
ticket = requests.post(f'{BASE}/uploads', headers=auth, json={
    'kind': 'audio', 'filename': 'sweep.wav', 'size_bytes': size
}).json()

with open('sweep.wav', 'rb') as f:
    requests.put(ticket['url'], data=f, headers=ticket['headers']).raise_for_status()
```

Measure the size and read the file in the same breath. If the file is still
being written, or a log rotates under you, the mint and the PUT disagree and you
get a 403 that says `SignatureDoesNotMatch` while nothing is wrong with your
credentials. A stream that stops early is worse, because it produces no response
at all and the request hangs until your own client times out.

### 3. Consume

| Endpoint | Field | Exclusivity rule |
|----------|-------|------------------|
| `POST /api/v1/models` | `upload_id` (kind `model`) | Exactly one of `url` or `upload_id` |
| `POST /api/v1/trainings` | `outputs[].upload_id` (kind `audio`) | Exactly one per output, max 10 outputs. URL and upload outputs can mix |
| `POST /api/v1/tones` | `image_upload_id` (kind `image`) | At most one of `image_url` or `image_upload_id`, both optional |
| `PATCH /api/v1/tones/{id}` | `image_upload_id` (kind `image`) | At most one of `image_url` or `image_upload_id` |

```jsonc
// POST /api/v1/models
{ "tone_id": 42, "upload_id": "up_1f0c…", "name": "Clean channel" }

// POST /api/v1/trainings
{ "tone_id": 42, "outputs": [ { "name": "Take 1", "upload_id": "up_9b21…" } ] }

// PATCH /api/v1/tones/42
{ "image_upload_id": "up_44ae…" }
```

The tone exclusivity check tests presence, not truthiness, so
`{"image_url": null, "image_upload_id": "up_…"}` is a 400. A tone is
single-format: a `.nam` only attaches to a tone whose `format` is `nam`, an IR
`.wav` only to `format: "ir"`, otherwise the API answers
`400 File format "x" does not match the tone's format "y"`.

Errors are prefixed differently per endpoint, which matters if you parse them:
`POST /models` returns the upload error bare, trainings prefixes
`Invalid upload_id for output "<name>": `, and both tone endpoints prefix
`Invalid image_upload_id: `.

### Size limits

| Kind | Extensions | Cap at mint | Lands in |
|------|-----------|-------------|----------|
| `model` | `.nam` `.wav` `.aidax` `.aasnapshot` `.json` | 256 MiB (268435456) | models bucket |
| `audio` | `.wav` | 64 MiB (67108864) | audio bucket |
| `image` | `.jpg` `.jpeg` `.png` `.webp` | 5 MiB (5242880) | images bucket |

The cap is flat per kind, so every model extension gets the same 256 MiB.

Going over the cap at mint is a cheap `413` with no bytes moved. The same cap is
re-checked against the stored object when you consume the handle, so a file that
somehow landed oversized is a `413` then too.

**Caveat on the real ceiling.** Storage enforces the smallest of the bucket
limit, the project-level global upload limit, and its own standard limit. The
bucket limit matches the 256 MiB above, but the project global is a Supabase
dashboard setting that lives outside this repo and outside the API. If it is set
lower than the app cap, the mint call still succeeds and the PUT is the thing
that fails, with a `413 EntityTooLarge` that arrives only after the entire body
has been transferred. Verify that setting before relying on the top of the
`model` range.

### Timing: two clocks

They are separate deadlines, enforced by different systems, and they differ by
23 hours.

| | `url_expires_at` | `expires_at` |
|---|---|---|
| Covers | The PUT | The `upload_id` handle |
| Lifetime | Mint + 1 hour (signed as `X-Amz-Expires=3600`) | Mint + 24 hours |
| Enforced by | Storage, against the signature | The API, against its own clock |
| Past it | The PUT fails at storage, `400 ExpiredToken` | The consuming call answers `409 This upload_id has expired` |

In a batch each entry gets its own `url_expires_at` while every entry shares one
`expires_at`.

So the URL hour is the only window in which bytes can be written, and the 24
hours is the only window in which they can be consumed. A lapsed URL does not
invalidate the handle, but there is no way to re-arm a handle with a fresh URL.

Guidance:

- Mint immediately before transferring, not into a queue you drain later. A
  ten-file set is one mint call, so re-minting is cheap.
- Start every PUT inside the hour. There is no multipart upload and no resume, so
  a 256 MiB file has to move in one PUT and needs about 597 kbit/s sustained for
  the whole hour to land. A dropped transfer starts again from zero, on a new
  handle.
- On a failed PUT, discard the `upload_id` and mint a new one. Do not retry the
  dead URL, and do not try to clean up. The abandoned handle expires on its own
  and the staged object is swept.
- Confirm within 24 hours of the mint. The deadline is measured from the mint,
  not from the PUT.

**Concurrency.** Handles are independent, so the PUTs in a batch can run in
parallel and nothing in the API serialises them. Your uplink is the constraint,
not us. Four parallel 27 MiB sweeps share the same pipe, and each of them still
has to finish inside its own signed hour. Three or four at a time is a sane
default, and a single file on a slow link is better off alone. The consuming
calls are ordinary API requests and count against the rate limit; the PUTs do
not, because they never reach the API.

### Error reference

**Mint, `POST /api/v1/uploads`**

| Status | Meaning |
|--------|---------|
| 201 | Handles minted |
| 400 | `Invalid JSON body`, or a field error rendered as `<path>: <message>`, or `Unsupported file extension for <kind> uploads (expected …)` |
| 401 | Missing, malformed, or rejected token |
| 413 | `size_bytes` over the kind's cap. Nothing was minted |
| 500 | `Failed to create upload URL`. On a batch every row is voided, so no live URL was handed out |

In a batch, the API's own extension and size errors are prefixed `uploads[1]: `
while field-level validation uses the dotted path `uploads.1.kind: `. Handle
both if you extract the index.

**The PUT (answered by storage, not by the API)**

| Status | Meaning |
|--------|---------|
| 200 | Stored |
| 403 `SignatureDoesNotMatch` | The length you declared on the wire is not the `size_bytes` you signed for. This reads like a credentials fault but is not |
| 400 `ExpiredToken` | Past `url_expires_at`. Re-mint. This one is a 400, not the 403 an S3-shaped retry policy usually keys on |
| 413 `EntityTooLarge` | Over the storage-side ceiling described above |

A body that runs short of the length it declared gets no status at all, as
described above. Set a client-side timeout so that case surfaces as your own
error rather than a hang.

**Consume**

| Status | Meaning |
|--------|---------|
| 200 / 201 | Placed |
| 400 | Schema error, format or gear mismatch with the tone, an IR WAV over 60 s or with an unreadable header, a non-IR model file that is not valid JSON, or image bytes that do not match the extension (`File contents do not match the .png extension (expected a PNG file)`) |
| 401 | Auth |
| 403 | The tone is not yours |
| 404 | The tone is missing or deleted, or `upload_id not found`. Unknown, malformed, another user's, and wrong-kind handles all answer identically, on purpose. Re-mint |
| 409 | One of the five wordings below. All of them mean re-mint, and "already been used" additionally means do not retry |
| 413 | The stored object exceeds the kind's cap, whatever `size_bytes` claimed |
| 422 | Capacity. A tone holds at most 300 models |
| 500 | Our failure. Only one 500 leaves the handle spendable; see below |

The five 409 bodies, quoted in full so an equality check matches:

```
This upload_id has expired
This upload_id has already been used
No file has been uploaded for this upload_id
The uploaded file changed after it was validated. Request a new upload_id.
The uploaded file is <N> bytes but <M> were declared. Request a new upload_id.
```

The last one should not happen, because storage enforces the signed length, so
the stored object is either exactly the declared size or does not exist. It is a
backstop, and if you ever see it the answer is the same as the others, which is
to mint again. A stable substring is the safest way to tell these apart, since
the fourth carries a dash in the original and the fifth interpolates two numbers.

**The 500 rule, precisely.** Placing the file is the point of no return. A 500
raised *before* the placement rolls the handle back to unspent, so retrying the
identical request with the identical `upload_id` is safe for the rest of the 24
hours. A 500 raised *after* it leaves the handle spent and the staged bytes
already deleted, and every retry then answers `409 already been used` forever.
The body tells you which you got:

| Endpoint | The one 500 body that leaves the handle usable |
|----------|-----------------------------------------------|
| `POST /api/v1/models` | `Failed to store the uploaded file` |
| `POST /api/v1/trainings` | `Failed to store uploaded audio` |
| `POST /api/v1/tones` | `Failed to store the uploaded image` |
| `PATCH /api/v1/tones/{id}` | `Failed to store the uploaded image` |

Treat every other 500 as a spent handle. That is the safe default rather than an
exact reading, because a few 500s are raised before the handle is ever touched
and are indistinguishable from the outside. The recovery below covers that case
without you having to tell them apart.

A spent handle is not the same as a created resource. A 500 raised after the
placement means the file was copied and then something later in the same request
failed, so the model, training or tone may or may not exist. Reconcile it the way
[Losing a response](#losing-a-response) describes.

One ordering quirk worth knowing: `POST /models` resolves the upload handle
before it checks tone ownership, while `PATCH /tones/{id}` checks ownership
first. A request that is wrong in both ways reports a different error on each.

### Handle semantics

`upload_id` is single use. The claim is a conditional database update, so two
racing confirms produce one success and one `409 already been used`. Ownership
follows the token that minted it, so a handle minted with an OAuth token belongs
to that end user and a secret-key handle belongs to the partner. Crossing them
is the same uniform `404`. Placement copies the object server side into the
destination bucket, pinned to the exact bytes that were validated, then deletes
the staged copy. A handle nobody references is swept about a day later.

There are no idempotency keys. A consuming call is not safe to replay blindly,
which is what the next section is about.

### Losing a response

If the consuming call times out or the connection drops, you do not know whether
it worked. Do not blind-retry it. A retry answers `409 This upload_id has already
been used` whenever the first attempt got as far as claiming the handle, and that
409 tells you nothing about whether the model, training or tone was created.

There is no `GET /api/v1/uploads/{upload_id}` and there should not be one. A
request that places the file and then fails later marks the handle placed and
then deletes the bytes again, so a handle-status endpoint would report success
for a file that no longer exists and a resource that was never created. The
handle cannot answer the question. The resource can, and those endpoints already
exist.

In order:

1. **Do not retry yet.**
2. **Ask the resource whether it exists.**

   | You called | Ask | Match on |
   |------------|-----|----------|
   | `POST /api/v1/models` | `GET /api/v1/models?tone_id={tone_id}&page_size=300` | The `name` you sent, trimmed and cut to 64 characters. If you sent none, it is your filename's basename without its extension |
   | `POST /api/v1/trainings` | `GET /api/v1/trainings?tone_id={tone_id}` | The output `name` you sent |
   | `POST /api/v1/tones` | `GET /api/v1/tones/created` | The `title` you sent |
   | `PATCH /api/v1/tones/{id}` | `GET /api/v1/tones/{id}` | The `images` array |

   Two details on the models listing. `tone_id` is required. And the default
   response excludes architecture-2 NAM models, so that integrations written
   before A2 existed do not start receiving models they cannot load; if the file
   you uploaded might be architecture 2, list again with `architecture=2`. A tone
   holds at most 300 models, so `page_size=300` is one call for the whole tone.
   `GET /api/v1/trainings` and `GET /api/v1/tones/created` are sorted newest
   first, so what you just created is at the top of page one.

3. **It exists.** You are done. The handle is spent, and retrying would only
   create a duplicate or a 409.
4. **It does not exist.** Retry the same `upload_id` exactly once. The request
   may have died before the claim, in which case the handle is still pending and
   the retry simply works.
5. **That retry answers 409.** The handle is spent and its bytes are gone. Mint a
   new `upload_id`, PUT the file again, and re-issue the consuming call.

The one failure you can recognise without any of this is the placement 500, whose
bodies are listed in the table above. Those leave the handle unspent, so the
identical request with the identical handle is the correct retry.

### curl walkthrough

The whole flow with nothing but `curl`, `jq` and a secret key from
[Settings → API Keys](#1-get-your-api-keys). It creates its own tone, so you need
no existing content and no local checkout. Never paste a literal token into a
file; export it.

```bash
export T3K_API=https://www.tone3000.com/api/v1
export T3K_SECRET_KEY=t3k_cs_...        # from Settings -> API Keys
```

**1. Create a tone to hold the model**

A tone is single-format, so declare the format the file will be. Use an existing
tone id instead if you have one; `GET /api/v1/tones/created` lists yours.

```bash
curl -sS -X POST "$T3K_API/tones" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Upload walkthrough","gear":"amp","format":"nam"}' > /tmp/tone.json

export TONE_ID=$(jq -r .id /tmp/tone.json)
echo "$TONE_ID"
```

**2. Mint an upload URL**

```bash
# A throwaway .nam. Every model extension except .wav must parse as JSON.
printf '{"version":"0.5.2","architecture":"LSTM","config":{},"weights":[0.1,0.2]}' > /tmp/demo.nam
SIZE=$(wc -c < /tmp/demo.nam | tr -d ' ')

curl -sS -X POST "$T3K_API/uploads" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"kind\":\"model\",\"filename\":\"demo.nam\",\"size_bytes\":$SIZE}" > /tmp/mint.json

cat /tmp/mint.json
# {"upload_id":"up_...","url":"https://.../storage/v1/s3/api-staging/...",
#  "method":"PUT","headers":{"Content-Length":"74"},
#  "url_expires_at":"...","expires_at":"..."}

MODEL_UPLOAD_ID=$(jq -r .upload_id /tmp/mint.json)
MODEL_UPLOAD_URL=$(jq -r .url /tmp/mint.json)
```

**3. PUT the bytes straight to storage**

No `Authorization` header here, because the URL carries its own signature. curl derives
`Content-Length` from the file, which is what the signature requires, so do not
set it by hand.

```bash
curl -sS -o /dev/null -w 'PUT %{http_code}\n' \
  -X PUT "$MODEL_UPLOAD_URL" --data-binary @/tmp/demo.nam
# PUT 200
```

**4. Hand the handle to the endpoint that should own the file**

```bash
curl -sS -X POST "$T3K_API/models" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"tone_id\":$TONE_ID,\"upload_id\":\"$MODEL_UPLOAD_ID\",\"name\":\"Demo model\"}"
# 201 with the created model
```

Running step 4 again returns
`409 {"error":"This upload_id has already been used"}`, which is the single-use
rule doing its job.

**Image variant.** An image needs its own handle. The model handle from step 2
is both spent and the wrong kind, and reusing it answers `404 upload_id not
found` rather than anything that names the real problem.

```bash
IMAGE=/path/to/cover.png
SIZE=$(wc -c < "$IMAGE" | tr -d ' ')

curl -sS -X POST "$T3K_API/uploads" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"kind\":\"image\",\"filename\":\"cover.png\",\"size_bytes\":$SIZE}" > /tmp/mint-image.json

IMAGE_UPLOAD_ID=$(jq -r .upload_id /tmp/mint-image.json)
curl -sS -o /dev/null -w 'PUT %{http_code}\n' \
  -X PUT "$(jq -r .url /tmp/mint-image.json)" --data-binary @"$IMAGE"

curl -sS -X PATCH "$T3K_API/tones/$TONE_ID" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"image_upload_id\":\"$IMAGE_UPLOAD_ID\"}"
```

### Capture audio, start to finish

This is the flow a capture station drives: record a rig, send the audio, get a
trained model on a tone. It is the whole reason to integrate.

Record the canonical sweep
([T3K-sweep-v3.wav](https://www.tone3000.com/T3K-sweep-v3.wav)) through your gear
and save the result as mono, 48 kHz, 24-bit PCM WAV, 3:10 long. The length window
is one-sided. Up to a second over is accepted and short is not, so when you trim,
err long.

```bash
export T3K_API=https://www.tone3000.com/api/v1
export T3K_SECRET_KEY=t3k_cs_...
SWEEP=/path/to/clean-sweep.wav

# 1. A tone to hold the finished model
TONE_ID=$(curl -sS -X POST "$T3K_API/tones" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Capture session","gear":"amp","format":"nam"}' | jq -r .id)

# 2. Mint an audio handle for the exact byte count on disk
SIZE=$(wc -c < "$SWEEP" | tr -d ' ')
curl -sS -X POST "$T3K_API/uploads" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"audio\",\"filename\":\"clean.wav\",\"size_bytes\":$SIZE}" > /tmp/mint-audio.json

AUDIO_UPLOAD_ID=$(jq -r .upload_id /tmp/mint-audio.json)

# 3. Send the bytes. 27 MB on a 50 Mbit/s uplink is a few seconds; the signed
#    URL gives you an hour.
curl -sS -o /dev/null -w 'PUT %{http_code}\n' \
  -X PUT "$(jq -r .url /tmp/mint-audio.json)" --upload-file "$SWEEP"

# 4. Start the training from the handle. Up to 10 outputs per request, and url
#    and upload_id outputs can mix.
TRAINING_ID=$(curl -sS -X POST "$T3K_API/trainings" \
  -H "Authorization: Bearer $T3K_SECRET_KEY" -H 'Content-Type: application/json' \
  -d "{\"tone_id\":$TONE_ID,\"outputs\":[{\"name\":\"Clean\",\"upload_id\":\"$AUDIO_UPLOAD_ID\"}]}" \
  | jq -r '.trainings[0].id')

# 5. Poll until it reaches a terminal status. Trainings take minutes, so poll at
#    a relaxed interval rather than tightly.
while :; do
  sleep 30
  STATUS=$(curl -sS -H "Authorization: Bearer $T3K_SECRET_KEY" \
    "$T3K_API/trainings/$TRAINING_ID" | jq -r '.status + " " + (.status_text // "")')
  echo "$STATUS"
  case "$STATUS" in running*) ;; *) break ;; esac
done

# 6. On success, model.model_url is the finished .nam. It is null until then,
#    and it is an authenticated download, so send the Bearer token to fetch it.
curl -sS -H "Authorization: Bearer $T3K_SECRET_KEY" \
  "$T3K_API/trainings/$TRAINING_ID" | jq '.status, .error, .model.model_url'
```

If the audio is rejected, the `400` names the output and the exact requirement
that failed, for example
`Invalid audio for output "Clean": Audio must be mono (got 2 channels).` It is
raised before the training starts rather than partway through it.

---

## Running this locally against a dev stack

The demos default to production, because `env.example` ships
`VITE_T3K_API_DOMAIN` commented out. To run them against a local TONE3000
checkout, uncomment it in your `.env`:

1. **Start the local Supabase stack** in the TONE3000 repo. It serves the API
   database and the storage endpoint the presigned URLs point at:

   | Service | URL |
   |---------|-----|
   | API / storage | `http://127.0.0.1:54321` |
   | Studio | `http://127.0.0.1:54323` |
   | Mailpit | `http://127.0.0.1:54324` |

   `npx supabase status -o json` prints the anon and service-role keys.

2. **Give the TONE3000 checkout a `.env.local`.** It needs four values before
   any `/api/v1` route will answer, and a fresh clone has none of them:

   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
   NEXT_PUBLIC_POSTHOG_KEY=local-dev
   ```

   `NEXT_PUBLIC_POSTHOG_KEY` is the one that catches people out. The PostHog
   client is constructed at module load and throws
   `You must pass your PostHog project's api key.` when the variable is unset,
   which takes down every `/api/v1` route on import. You get a 500 HTML error
   page with a stack trace pointing at analytics rather than at anything you
   did. Any non-empty string clears it.

   The seeder in step 4 writes the same Supabase values into
   `scripts/dev/api-e2e-env.sh`, but without the `NEXT_PUBLIC_` prefix, so
   copying that file across does not work. The S3 credentials the presigned URLs
   are signed with default to the local Supabase ones, so you do not need to set
   those.

3. **Start the Next.js dev server** for the TONE3000 app, usually on
   `http://localhost:3000`, and point this app at it in `.env`:

   ```
   VITE_T3K_API_DOMAIN=http://localhost:3000
   ```

   That exact variable name is the one the app reads. `VITE_TONE3000_API_DOMAIN`
   looks plausible and is read by nothing, so a typo there silently sends every
   request to production.

4. **Seed a user, an API key and two tones.** In the TONE3000 repo:

   ```bash
   npx tsx scripts/dev/seed-api-e2e.ts
   ```

   It is idempotent and refuses to run against anything but a loopback Supabase
   URL. It prints a `t3k_cs_…` secret key for the curl walkthrough above, a
   `t3k_pub_…` publishable key for `VITE_PUBLISHABLE_KEY`, and two tone IDs: one
   whose format is `nam` (takes `.nam` models) and one whose format is `ir`
   (takes `.wav` IRs). Re-running rotates the secret key, so re-read it after
   every run.

5. **Run this app** with `npm run dev` and open
   [http://localhost:3001](http://localhost:3001).

The upload demo creates its own tone as the first step of either path, so it
needs nothing in the account beyond a signed-in user.

---

## API Reference

Full reference: [tone3000.com/api](https://www.tone3000.com/api)

### OAuth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/oauth/authorize` | Start an OAuth flow |
| POST | `/api/v1/oauth/token` | Exchange code or refresh token |

### Resource Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/user` | Authenticated user profile |
| GET | `/api/v1/tones/{id}` | Tone by ID |
| GET | `/api/v1/tones/search` | Search and filter tones |
| GET | `/api/v1/tones/created` | Tones created by the authenticated user |
| GET | `/api/v1/tones/favorited` | Tones favorited by the authenticated user |
| GET | `/api/v1/models/{id}` | Model by ID |
| GET | `/api/v1/models` | Models for a tone |
| GET | `/api/v1/users` | Public user list |
| POST | `/api/v1/uploads` | Mint presigned upload URLs (single or batch) |
| POST | `/api/v1/models` | Attach a staged `upload_id` to a tone as a model |
| POST | `/api/v1/trainings` | Start a training from staged `outputs[].upload_id` audio |
| GET | `/api/v1/trainings/{id}` | One training: `status`, `status_text`, `error`, `logs`, `model.model_url` |
| GET | `/api/v1/trainings` | Your trainings, newest first. Filter by `tone_id` and `status` |
| POST | `/api/v1/tones` | Create a tone, optionally with `image_upload_id` |
| PATCH | `/api/v1/tones/{id}` | Edit a tone, including replacing its image |

### Rate Limiting

100 requests/minute. For higher limits, contact support@tone3000.com.

Presigned PUTs do not count against it, because they go to storage and never
reach the API. A ten-file capture session therefore costs two API calls rather
than ten. You mint all ten handles in one request, PUT the ten files for free,
then send one `POST /trainings` carrying every handle.

---

## Support

Questions? Email support@tone3000.com or open an issue in this repo.

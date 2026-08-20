# Moon Rabbit Five Tones

An 8th Wall Engine Image Target experience where visitors compose a melody with the Chinese pentatonic scale, save it in their browser, and replay it as animated artwork in AR.

The experience records note events, not microphone audio or video.

## Visitor flow

1. Open the QR-code link.
2. If no saved composition exists, choose **Create Music**.
3. Record one or more takes with the five tone keys.
4. Choose **Save & View in AR**.
5. Allow camera access and point the camera at the Moon Rabbit target artwork.
6. The saved melody plays once per target acquisition. Moving away resets the experience; finding the target again replays it from the beginning.

When a composition contains all five tones, playback triggers the final harmony visual effect without placing text over the AR target.

## Five tones

| Event | Name | Solfege | Sample |
| --- | --- | --- | --- |
| `gong` | 宫 / GŌNG | DO | `gong_C4.mp3` |
| `shang` | 商 / SHĀNG | RE | `shang_D4.mp3` |
| `jue` | 角 / JUÉ | MI | `jue_E4.mp3` |
| `zhi` | 徵 / ZHǏ | SOL | `zhi_G4.mp3` |
| `yu` | 羽 / YǓ | LA | `yu_A4.mp3` |

All samples are stored in `src/assets/moon_rabbit_five_tones_samples/` and are decoded through Web Audio. The first Create or AR button gesture resumes the `AudioContext` for mobile Safari compatibility.

## Composer

- New takes use **FREE** timing and preserve the visitor's natural rhythm.
- A take can last up to 30 seconds.
- Record can be paused and resumed; paused time is excluded.
- Editing is take-based. Individual events cannot be edited.
- Saving a take opens a new empty take.
- Saved takes appear in a horizontally swipeable rail. The selected take is highlighted and can be auditioned independently.
- Listen/Delete actions appear inside the selected take card; the rest of the page never scrolls horizontally.
- The composer uses the iPhone visual viewport and safe areas. Its draggable back button snaps to an edge and remembers its position.
- Full playback inserts a 300 ms gap between segments.

The composer and AR view share the same Three.js shader and particle engine. Each note creates a transient distortion and also adds a limited persistent world-state contribution.

## Local data

One composition is stored under:

```text
moon-rabbit-five-tones:v1
```

Schema:

```ts
type Tone = 'gong' | 'shang' | 'jue' | 'zhi' | 'yu'

interface ToneEvent {
  t: number
  note: Tone
}

interface MusicSegment {
  id: string
  name: string
  mode: 'free' | 'rhythm'
  bpm: 90
  durationMs: number
  events: ToneEvent[]
}

interface LocalMusicWork {
  version: 1
  createdAt: number
  updatedAt: number
  segments: MusicSegment[]
}
```

Storage is limited to the same browser and origin. Private browsing or clearing site data may remove the work. No account, backend, upload, or cross-device sync is used.

The draggable composer back button stores its UI-only position under `moon-rabbit-composer-back-position:v1`. This does not change the music work schema.

## AR architecture

- 8th Wall Engine CameraPipelineModules, not ECS or A-Frame.
- `external/xr/xr.js`, XRExtras, and LandingPage are injected only after **View in AR**.
- The dynamic script keeps `data-preload-chunks="slam"` because Image Target tracking requires `XR8.XrController`.
- Recognition data comes from `image-targets/target.json`.
- The displayed texture is `src/assets/target.jpg`.
- Plane size and offset are calculated from the recognition package's crop, original dimensions, and `isRotated` value.
- `reality.imagefound` starts playback once, `reality.imageupdated` only updates pose, and `reality.imagelost` stops audio and resets visuals.

The deleted GLB is not used. The original standalone shader prototype remains at `src/v1.html` for reference only.

## Project assets

```text
src/assets/poster.jpg                         Entry poster
src/assets/target.jpg                         Upright artwork texture
src/assets/moon_rabbit_five_tones_samples/    Five production MP3 samples
image-targets/target.json                     8th Wall recognition data
src/v1.html                                   Original standalone prototype
```

ZIP and PSD source packages are excluded from the production build.

## Build and preview

```powershell
npm install
npm run build
```

For 8th Wall Desktop App testing, open:

```text
http://localhost:58000/
```

Use an HTTPS forwarding URL to that port for phone testing. Camera access requires a secure origin outside localhost.

## Verification checklist

- Build completes without GLB, GLTFLoader, oscillator, ECS, A-Frame, or static `xr.js` references in production source.
- Saving a take changes the entry screen to show **View in AR** and **Continue Creating** after refresh.
- New recordings preserve natural FREE timing.
- Audio remains audible on iOS after the initial trusted gesture.
- Target updates do not restart playback.
- Target loss stops scheduled audio, hides the shader plane, and resets accumulated state.
- Only compositions containing all five tones trigger the harmony visual ending; the AR interface keeps only the unobtrusive `Edit music` control.

# Pixel Color Picker

Set **any** Material You theme color on a Google Pixel (Android 13+), not just the colors Android
extracts from your wallpaper. Also sets a custom lock screen clock color.

**Use it:** https://ok111.github.io/pixel-color-picker/

Runs entirely in the browser: Chrome/Edge talk to the phone over USB with WebUSB + ADB
([Tango / ya-webadb](https://github.com/yume-chan/ya-webadb)). No root, nothing installed on the phone.

## How it works

The page writes the same secure settings that the Wallpaper & style app uses:

| Setting | What it controls |
| --- | --- |
| `theme_customization_overlay_packages` | Seed color (`system_palette`, `color_source: "preset"`) and palette style |
| `lock_screen_custom_clock_face` | Lock screen clock `seedColor` (signed ARGB int) |

The same thing by hand:

```sh
adb shell settings put secure theme_customization_overlay_packages \
  '{"android.theme.customization.color_source":"preset","android.theme.customization.system_palette":"FFFF2E88","android.theme.customization.accent_color":"FFFF2E88","android.theme.customization.theme_style":"VIBRANT"}'
```

Supported styles (tested on Android 17): `TONAL_SPOT`, `VIBRANT`, `EXPRESSIVE`, `RAINBOW`,
`FRUIT_SALAD`, `SPRITZ`, `MONOCHROMATIC`. `FIDELITY` and `CONTENT` are ignored by SystemUI.

## Development

```sh
bun install
bun run dev     # http://localhost:3000
bun run build   # static site in dist/
```

Not affiliated with Google. Pixel and Android are trademarks of Google LLC.

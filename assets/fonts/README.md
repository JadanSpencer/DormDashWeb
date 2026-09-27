# Fonts

Both fonts are under the SIL Open Font License 1.1 (see the OFL-*.txt files),
which allows commercial use, embedding and modification. They come from
Google Fonts (github.com/google/fonts, `ofl/`) and are subset to keep the app
small:

| File | Font | Subset | Used for |
|---|---|---|---|
| `ShipporiMinchoB1-ExtraBold.latin.ttf` | Shippori Mincho B1 ExtraBold | Latin + punctuation + 寮配走 | Headings (`T.type.display` / `title`, and the dark/mid themes) |
| `YujiSyuku-Seal.ttf` | Yuji Syuku | only 寮 配 走 | The vermilion seal (`components/Seal.tsx`) |

To add characters, re-run fontTools on the original file, e.g.
`python3 -m fontTools.subset ShipporiMinchoB1-ExtraBold.ttf --unicodes="U+0020-007E,U+00A0-00FF,..." --output-file=...`

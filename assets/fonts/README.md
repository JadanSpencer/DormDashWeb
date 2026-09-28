# Fonts

Both fonts are under the SIL Open Font License 1.1 (see the OFL-*.txt files),
which allows commercial use, embedding and modification. They come from
Google Fonts (github.com/google/fonts, `ofl/`), are cut to one static style
from the variable font, and subset to Latin + common punctuation to keep the
app small. They match the UWI Mona launch flyer.

| File | Font | Settings | Used for |
|---|---|---|---|
| `Fraunces-BlackItalic.latin.ttf` | Fraunces Italic | wght 900, opsz 72, SOFT 100, WONK 0 | Headings (`FONT.heading`: `T.type.display` / `title`, and the dark/mid themes) |
| `Caveat-Bold.latin.ttf` | Caveat | wght 700 | The one hand-written line (`FONT.script`), e.g. "sign in & yuh food a come!" |

WONK is 0 on purpose: with the "wonky" alternates on, a double l ("Grill")
reads like "lf".

To regenerate (fontTools):
```
from fontTools.ttLib import TTFont; from fontTools.varLib import instancer
f = instancer.instantiateVariableFont(TTFont('Fraunces-Italic[SOFT,WONK,opsz,wght].ttf'),
      {'wght': 900, 'opsz': 72, 'SOFT': 100, 'WONK': 0})
```
then `pyftsubset` to U+0020-007E plus ’‘“”–—…•·é→$.

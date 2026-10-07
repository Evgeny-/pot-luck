# Third-party notices

Pot Luck includes the third-party material listed below. Its original license terms remain in
effect. Full license texts and copyright notices accompany this repository.

## Game icons and fonts

Vite copies `public/licenses/` into the production build as `licenses/`, including the
[runtime notice](public/licenses/NOTICE.txt).

| Material | Attribution | License text |
| --- | --- | --- |
| Fluent Emoji Flat, used in `src/ui/emoji.generated.ts`; Fluent Flat and 3D examples in the art reviews | Microsoft Corporation | [MIT](public/licenses/Fluent-Emoji-MIT.txt) |
| Baloo 2, imported by `src/main.ts` through `@fontsource-variable/baloo-2` 5.3.0 | Copyright 2019 The Baloo 2 Project Authors | [SIL OFL 1.1](public/licenses/Baloo-2-OFL-1.1.txt) |
| Nunito, the `@fontsource-variable/nunito` 5.3.0 project dependency | Copyright 2014 The Nunito Project Authors | [SIL OFL 1.1](public/licenses/Nunito-OFL-1.1.txt) |

Fluent food icons have adjusted viewBoxes for optical centring. The art review includes rendered
and pixelated Fluent examples. Nunito's notice is included with the dependency; the current game
imports Baloo 2.

Sources: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji),
[Baloo 2](https://github.com/EkType/Baloo2), [Nunito](https://github.com/googlefonts/nunito).

## Emoji comparisons in the art review

`_review/style/index.html` embeds five examples from each collection below, imported through the
corresponding Iconify JSON package. The review adds SVG wrappers and displays the artwork on game
tiles with CSS sizing, labels and arrow badges.

| Material | Attribution | License and notices |
| --- | --- | --- |
| Noto Emoji, from `@iconify-json/noto` 1.2.9 | Copyright 2013 Google, Inc. All Rights Reserved. | [Original SVG notice](docs/licenses/Noto-Emoji-NOTICE.txt), [Apache 2.0](docs/licenses/Apache-2.0.txt) |
| Twemoji, from `@iconify-json/twemoji` 1.2.5 | Twitter and Twemoji contributors | [CC BY 4.0](docs/licenses/Twemoji-CC-BY-4.0.txt) |
| OpenMoji, from `@iconify-json/openmoji` 1.2.29 | OpenMoji contributors | [CC BY-SA 4.0](docs/licenses/OpenMoji-CC-BY-SA-4.0.txt) |

OpenMoji artwork and any adaptations of that artwork remain under CC BY-SA 4.0. These component
licenses apply to their respective artwork.

Sources: [Noto Emoji SVG notice](https://github.com/googlefonts/noto-emoji/blob/43bac1a1272f31cedf0d74c2089fba6c7f952276/svg/LICENSE),
[Twemoji](https://github.com/jdecked/twemoji), [OpenMoji](https://github.com/hfg-gmuend/openmoji).
The Noto notice is preserved from the upstream commit before its SVG directory moved in September
2026; the installed Iconify collection identifies its artwork license as Apache 2.0.

## Generated illustrations

The illustrations in `public/art/` and the generated candidates in `_review/` were made locally
with [Z-Image Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) through
[mflux](https://github.com/mflux-community/mflux), using the
[4-bit mflux checkpoint](https://huggingface.co/mflux-community/z-image-turbo-mflux-q4).
Prompts and processing scripts are in `scripts/art/`; the workflow is described in
`docs/ART-HANDOFF.md`. Generation fetches model weights and mflux as external development
dependencies. This paragraph records asset provenance and assigns no model or tool license to the
generated images.

# Third-party notices

## shadcn/ui

Portions of `src/components/ui/**`, `src/hooks/use-mobile.tsx`, `src/hooks/use-toast.ts`, `src/lib/utils.ts`, and `components.json` are derived from [shadcn/ui](https://github.com/shadcn-ui/ui).

Copyright (c) 2023 shadcn.

These portions remain licensed under the MIT License. The required notice and license text are preserved in [`LICENSES/shadcn-ui-MIT.txt`](LICENSES/shadcn-ui-MIT.txt). Exameny modifications and the combined Exameny work are distributed under `AGPL-3.0-or-later` to the extent applicable.

## Packaged dependencies

This project uses third-party runtime packages under their respective licenses. The lockfile records exact versions, and the release workflow generates a CycloneDX software bill of materials with each package's identifiers and declared license.

In particular, [`@vercel/analytics`](https://github.com/vercel/analytics) is distributed under `MPL-2.0`. Exameny does not modify that package. Analytics is optional and disabled unless a deployer explicitly sets `VITE_ENABLE_ANALYTICS=true`.

No third-party dependency is relicensed by Exameny. Review the generated bill of materials and the license included with each package before redistributing a binary bundle.

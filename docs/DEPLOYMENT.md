# Publishing Pot Luck

The public game lives at **https://evgeny.io/games/pot-luck/**.
Its source is **https://github.com/Evgeny-/pot-luck**.

Every push to `main` runs `.github/workflows/deploy.yml`. The workflow installs
the locked dependencies with Node.js 22, runs the tests, and builds the game.
It checks that the revision is still current before copying `dist/` into
`games/pot-luck/` on the `master` branch of `evgenyio/evgenyio.github.io`.
GitHub Pages publishes that branch using the existing `evgeny.io` custom domain.

The game uses relative asset paths, so it works under this subdirectory. Each
build includes `version.json` with the source commit SHA. The workflow waits
for that exact SHA to be served by the public site before reporting success.
Site pushes retry after rebasing to preserve deployments from the other games.

## Credentials

The game repository has one Actions secret, `SITE_DEPLOY_KEY`. Its value is an
SSH private key whose corresponding public key is registered as the
`pot-luck deploy key` on the site repository with write access. The
credential is used only to check out and push the site repository. It is never
included in source files or the built game.

To rotate it, create a new Ed25519 key, replace the public deploy key on the
site repository, and update `SITE_DEPLOY_KEY` using `gh secret set`. Keep the
private key outside the checkout and remove the temporary file after upload.

## Run or inspect a deployment

```bash
gh workflow run deploy.yml --repo Evgeny-/pot-luck --ref main
gh run list --repo Evgeny-/pot-luck --workflow deploy.yml
gh run view RUN_ID --repo Evgeny-/pot-luck --log-failed
curl -fsS https://evgeny.io/games/pot-luck/version.json
```

If publication fails, inspect the Actions log. A missing key, failing test,
build error, rejected site push, or Pages timeout fails the deployment rather
than reporting an unverified release.

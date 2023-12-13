# Contributing to docs & docs-site itself

## Where do I begin?

- Translation - i18n support for your native language would be a great first choice.
- Documentation - Improve the documentations

## Note for Insiders

Beaware of two configurations, next.config.js (web : root) and docusaurus.config.js (docs-site : /docs).
Deploying docs-site individually will break the web app. This is normal.

The configuration will only work for grida.co/docs and it will break on docs.grida.co/

If the docs site works fine on local build, then you can assume that it works fine also on production (only on grida.co/docs)

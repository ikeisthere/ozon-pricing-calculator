# Public Ozon Pricing Calculator Source Mirror

## Scope and source of truth

- This repository is a public, curated source mirror for the pricing calculator only. It is not a website deployment repository and must never be used to publish or activate production files.
- The production implementation and canonical URL are maintained in the `ikeisthere/kuakuakua-homepage` repository and `https://kuakuakua.com/pricing-calculator/`.
- Make production-bound changes in the homepage source first, verify them there, then use `scripts/sync-from-homepage.ps1` to refresh only the allowlisted files in this mirror. Review the diff before committing.
- Community suggestions and pull requests are proposals. Do not make this mirror an independent implementation or source of production truth.

## Safety

- Never add API keys, credentials, account data, customer data, deployment instructions, private server details, or files copied from the workbench backend.
- The only remote data service used by the UI is the documented public pricing API at `https://ozon.kuakuakua.com/api/public/pricing/`; requests omit credentials. Do not add private credentials to make local previews work.
- The KuaKuaKua name, trademarks, and logo are excluded from the MIT code license; see `NOTICE.md`.

## Validation

- Run `node --test tests/*.test.mjs` and `git diff --check` for source updates.
- A local static preview is not production acceptance. Use the official website for the live calculator.

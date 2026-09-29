# Repository guidance

- This is an independent open-source calculator project. Its UI, pricing engine, local API, and versioned data snapshots must remain runnable without the KuaKuaKua workbench or private APIs.
- Do not add account credentials, private user/store data, unrelated workbench modules, or production deployment configuration.
- When changing data, update `DATA-SOURCES.md` with source URL/title, source version/effective date, retrieval/update date, and any conversion steps. Never label an undated or stale snapshot as live/latest.
- Keep source code licensing distinct from Ozon/KuaKuaKua marks and third-party source documents; see `LICENSE` and `NOTICE.md`.
- Run `node --test tests/*.test.mjs server/tests/*.test.js` and `git diff --check` after changes.
- Contributions belong in this repository. The public project is not merely a suggestion inbox or a private-repository checkout. Any separate synchronization to a commercial website is an optional maintainer operation and must not be required for local use or contribution.

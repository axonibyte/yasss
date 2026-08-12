# Privacy Policy

Placeholder privacy policy for the end-to-end environment.

Served by `GET /v1/texts/privacy` and rendered into the Privacy modal.

## Polls that allow one answer each

When a poll restricts answering to one per person, we record your IP address and
a characteristic derived from your browser and device settings, including a
rendering test. Both are stored one-way hashed, salted per poll -- so the same
browser answering a different poll is not recognizable as the same browser --
and both are deleted when the poll is deleted.

Polls that allow multiple answers collect neither, and that is the default.

(Fixture wording for the end-to-end environment. A real deployment must write
its own; see `docs/fingerprinting.md` for what it has to cover.)

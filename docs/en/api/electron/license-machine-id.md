# Electron / license machine id

Source: `electron/license/machine-id.cts`.

Machine id helpers collect stable platform signals and normalize them into the
machine code used by offline license activation. Tokens issued by
`tools/license-gen` are bound to this code.

See [License System](/en/architecture/license-system).

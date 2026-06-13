# GitHub Releases Research

GitHub Releases are used as the public artifact handoff for v0.1.0. The release packet
is generated locally and remains credential-free until the maintainer explicitly runs
the generated `gh release create --draft --verify-tag` command.

Release assets include Chrome, Edge, Firefox, and Safari browser packages, bookmarklet
assets, Firefox source-review material, and SHA-256 checksums.

# TLS provider hook

Mount a provider-generated `*.conf` file here. It should listen on `8443 ssl`,
reference certificates mounted read-only under `/run/tls`, and proxy to
`http://backend`. Do not store private keys in Git.

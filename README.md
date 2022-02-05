# about-native-modules

**Collecting data on npm packages with Node.js native addons.**

## Data

See [`data.md`](data.md).

## Development

To generate the above data, clone the repository and run:

```
npm i
mkdir cache

# Collect packages from npm (takes between 2 and 24 hours)
mkdir cache/raw
node bin/collect-npm-data > cache/raw/raw-01.ndjson

# Deduplicate and clean
mkdir cache/deduped
node bin/dedupe-npm-data cache/raw > cache/deduped/deduped.ndjson

# Process the data (this also takes time; subsequent runs use caches)
node bin/process-npm-data cache/deduped
```

The result is written to `data.json` and `data.md`.

To update later, make note of the last seq (sequence number) that is written to stderr by `node bin/collect-npm-data`, for example 8257575. Then pull in new and updated packages starting from there:

```
node bin/collect-npm-data 8257575 > cache/raw/raw-02.ndjson
node bin/dedupe-npm-data cache/raw > cache/deduped/deduped.ndjson
node bin/process-npm-data cache/deduped
```

The dedupe step will read `cache/raw/*.ndjson` which means it'll include `raw-01.ndjson` and `raw-02.ndjson`.

## License

[MIT](LICENSE)

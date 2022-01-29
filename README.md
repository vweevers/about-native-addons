# about-native-modules

**Collecting data on npm packages with Node.js native addons.**

## Data

See [`data.md`](data.md).

### Running

To generate the above data, run:

```
npm i
mkdir cache

# Collect packages from npm (takes 90 minutes or so)
node bin/collect-npm-data > cache/candidates.ndjson

# This also takes time, subsequent runs use caches
node bin/process-npm-data
```

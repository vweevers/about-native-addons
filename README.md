# about-native-modules

**Collecting data on npm packages with Node.js native addons.**

Mainly to find addons affected by overlapping global symbols on mac (and some unixes reportedly). When an addon has global symbols it can conflict with other addons (or other versions) loaded into the same process, leading to addons calling into each other and bugs that are hard to debug (and discover).

This issue can be fixed by compiling the addon with `-fvisibility=hidden`. See [nodejs/node-gyp#1891](https://github.com/nodejs/node-gyp/pull/1891). Add the following condition to your `binding.gyp`:

```python
{
  "targets": [{
    "target_name": "my_native_addon",
    "conditions": [
      ["OS == 'mac'", {
         "cflags+": ["-fvisibility=hidden"],
         "xcode_settings": {
           "GCC_SYMBOLS_PRIVATE_EXTERN": "YES" # -fvisibility=hidden
         }
      }]
    ]
  }]
}
```

## Data

This lists from left to right: **name**, **version**, which mechanism it uses to ship prebuilds (those with `node-gyp-build` ship prebuilds inside the npm package, those with `prebuild-install` have a download step), the amount of **prebuilds** (for distinct targets), whether it uses **N-API**, how many global **symbols** the mac prebuild(s) have, whether the addon could be **loaded** with `process.dlopen()` and lastly if any of the global symbol names overlap (potentially **conflict**) with other addons in the list (has false positives).

| Name           | Version      | Type             | Prebuilds | N-API | Syms | Load | Conflict |
| :------------- | :----------- | :--------------- | --------: | :---- | ---: | ---: | :------- |
| `bufferutil`     | 4.0.1        | `node-gyp-build@3` |         8 | Yes   |    3 |   OK | Yes      |
| `farmhash`       | 3.0.0        | `prebuild-install` |        30 | Yes   |    2 |   OK |          |
| `fd-lock`        | 1.0.2        | `node-gyp-build@3` |        12 | Yes   |    3 |   OK | Yes      |
| `keytar`         | 5.0.0-beta.3 | `prebuild-install` |        39 |       |   51 |   OK |          |
| `leveldown`      | 5.4.1        | `node-gyp-build@4` |         8 | Yes   |    0 |   OK |          |
| `leveldown`      | 5.4.0        | `node-gyp-build@4` |         8 | Yes   |   26 |   OK | Yes      |
| `leveldown`      | 5.0.2        | `node-gyp-build@3` |         7 | Yes   |   26 |   OK | Yes      |
| `lzo-decompress` | 0.1.2        | `node-gyp-build@3` |         8 | Yes   |    2 |   OK |          |
| `microtime`      | 3.0.0        | `node-gyp-build@3` |         8 | Yes   |    7 |   OK |          |
| `rocksdb`        | 4.1.0        | `node-gyp-build@4` |         3 | Yes   |   88 |   OK | Yes      |
| `sharp`          | 0.23.1       | `prebuild-install` |        32 |       |   83 |   OK |          |
| `sodium-native`  | 2.4.6        | `node-gyp-build@4` |       100 |       |  250 |   OK |          |
| `tree-sitter`    | 0.15.10      | `prebuild-install` |        15 |       |  264 |   OK |          |
| `utf-8-validate` | 5.0.2        | `node-gyp-build@3` |         8 | Yes   |    2 |   OK | Yes      |
| `utp-native`     | 2.1.4        | `node-gyp-build@3` |        12 | Yes   |  123 |   OK | Yes      |

## Load test

This lists whether a pairing of two native addons could be loaded into the same process on Mac. All succeeded.

|                      | x   | 0   | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  | 12  | 13  | 14  |
| -------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bufferutil@4.0.1`     | 0   | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `farmhash@3.0.0`       | 1   | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `fd-lock@1.0.2`        | 2   | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `keytar@5.0.0-beta.3`  | 3   | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `leveldown@5.4.1`      | 4   | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `leveldown@5.4.0`      | 5   | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `leveldown@5.0.2`      | 6   | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `lzo-decompress@0.1.2` | 7   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `microtime@3.0.0`      | 8   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  |
| `rocksdb@4.1.0`        | 9   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  |
| `sharp@0.23.1`         | 10  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  |
| `sodium-native@2.4.6`  | 11  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  |
| `tree-sitter@0.15.10`  | 12  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  |
| `utf-8-validate@5.0.2` | 13  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  |
| `utp-native@2.1.4`     | 14  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   |

## Package tests

This is the result of running tests (usually `npm t`) of a project, after having injected another addon into the process. Note that for tests to fail, the following conditions must be met:

1. The project has good coverage
2. The mac build has global symbols
3. The names of those symbols overlap with the other addon
4. Those overlapping symbols don't point to similar code.

|                      | x   | 0   | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  | 12  | 13  | 14  |
| -------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bufferutil@4.0.1`     | 0   | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `farmhash@3.0.0`       | 1   | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `fd-lock@1.0.2`        | 2   | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `keytar@5.0.0-beta.3`  | 3   | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `leveldown@5.4.1`      | 4   | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `leveldown@5.4.0`      | 5   | OK  | OK  | OK  | OK  | OK  | -   | ERR | OK  | OK  | ERR | OK  | OK  | OK  | OK  | OK  |
| `leveldown@5.0.2`      | 6   | OK  | OK  | OK  | OK  | OK  | ERR | -   | OK  | OK  | ERR | OK  | OK  | OK  | OK  | OK  |
| `lzo-decompress@0.1.2` | 7   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  | OK  |
| `microtime@3.0.0`      | 8   | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  | OK  |
| `rocksdb@4.1.0`        | 9   | OK  | OK  | OK  | OK  | OK  | ERR | ERR | OK  | OK  | -   | OK  | OK  | OK  | OK  | OK  |
| `sharp@0.23.1`         | 10  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  | OK  |
| `sodium-native@2.4.6`  | 11  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  | OK  |
| `tree-sitter@0.15.10`  | 12  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  | OK  |
| `utf-8-validate@5.0.2` | 13  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   | OK  |
| `utp-native@2.1.4`     | 14  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | OK  | -   |

## Running

To generate the above data, run:

```
npm install
node test.js
```

Requires rust to be installed. Can take 30-45 minutes. Use a mac, node 12.

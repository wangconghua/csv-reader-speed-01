# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/wangconghua/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/wangconghua/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: it answers exactly as the reference on every broken-CSV case, but reads the text in bulk instead of a character at a time.

`solve.js` exports `run(input)`, which returns `{columns, rows, errors}` for `{text, header}`. It keeps the reference's broken-row policy line by line (BOM dropped, empty lines no records, stray CR dropped, quoted fields to the next non-doubled quote with CRLF/lone CR read as LF, junk after a closing quote appended, a never-closing quote literal with the rest re-read as unquoted, fields kept as strings, rows padded or cut to the first record's width, each error `{code, line, row}` in the order met), and it gets its speed from scanning with `indexOf`, `slice` and `split` instead of one character at a time: a record with no quote before its first line break is sliced whole and split at once, an unquoted field runs to the next comma, LF or CR found by a regex, and a quoted field runs quote to quote by `indexOf('"')` with its content taken as slices. `main.ts` is the house driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## Run it

```sh
node main.ts
```

Outside a container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=8max8wdd&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

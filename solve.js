// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader): run(input) returns exactly
// readCsv's answer {columns, rows, errors} for {text, header}, but without the reference's
// character-at-a-time loop. The text is scanned with indexOf/slice/split (native, bulk) instead:
//
//   - a record with no quote before its first line break is sliced whole and split(',') at once;
//   - an unquoted field runs to the next comma, LF or CR found by indexOf;
//   - a quoted field runs quote to quote by indexOf('"'), its content taken as slices, "" collapsed,
//     and CRLF/lone CR inside it turned into LF with the line count kept;
//   - a quote that never closes is a literal character and the rest is re-read as unquoted, exactly
//     as the reference does (line reset to the opening quote's line first).
//
// Everything else follows the reference line by line: U+FEFF dropped, empty lines no records, a CR
// outside quotes not followed by LF dropped (stray_cr), junk after a closing quote appended as it
// stands (quote_junk), a quote inside an unquoted field literal, fields kept as strings, columns the
// first record when header is true (else null), rows padded (short_row) or cut (long_row) to the first
// record's width, each error {code, line, row} in the order met, line the 1-based line its record
// starts on, row its index in rows (null for the header).

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const N = text.length;
  let pos = 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;
  if (N > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // readUnquoted's results, kept in outer lets so no object is built per field.
  let rqValue = '';
  let rqEnded = 0; // 0 comma, 1 line break, 2 end of text
  let rqAdded = 0; // characters kept (a dropped stray CR adds none)

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by
  // LF is dropped (stray_cr). Sets rqValue/rqEnded/rqAdded.
  const TERMINATOR = /[,\r\n]/g;
  const RECSCAN = /["\n]/g;
  function readUnquoted(value) {
    let added = 0;
    while (true) {
      TERMINATOR.lastIndex = pos;
      const mt = TERMINATOR.exec(text);
      let m = -1;
      let kind = 0;
      if (mt) {
        m = mt.index;
        kind = mt[0] === ',' ? 0 : mt[0] === '\n' ? 1 : 2;
      }
      if (m === -1) {
        value += text.slice(pos);
        added += N - pos;
        pos = N;
        rqValue = value; rqEnded = 2; rqAdded = added;
        return;
      }
      if (kind === 0) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        rqValue = value; rqEnded = 0; rqAdded = added;
        return;
      }
      if (kind === 1) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        line += 1;
        rqValue = value; rqEnded = 1; rqAdded = added;
        return;
      }
      if (text.charCodeAt(m + 1) === 10) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 2;
        line += 1;
        rqValue = value; rqEnded = 1; rqAdded = added;
        return;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      value += text.slice(pos, m);
      added += m - pos;
      pos = m + 1;
    }
  }

  // A slice of a quoted field's content (no quote in it): CRLF and lone CR each become LF, and the
  // line count moves by the line breaks it holds. Returned as it stands when it holds none.
  function convertChunk(s) {
    if (s.indexOf('\r') === -1) {
      if (s.indexOf('\n') === -1) return s;
      let cnt = 0;
      let idx = -1;
      while ((idx = s.indexOf('\n', idx + 1)) !== -1) cnt += 1;
      line += cnt;
      return s;
    }
    const converted = s.replace(/\r\n?/g, '\n');
    let cnt = 0;
    let idx = -1;
    while ((idx = converted.indexOf('\n', idx + 1)) !== -1) cnt += 1;
    line += cnt;
    return converted;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < N) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= N) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    RECSCAN.lastIndex = pos;
    const rm = RECSCAN.exec(text);
    let nl;
    let fast;
    if (!rm) {
      nl = -1;
      fast = true;
    } else if (rm[0] === '"') {
      nl = -1;
      fast = false;
    } else {
      nl = rm.index;
      fast = true;
    }

    let fields;
    if (fast) {
      // No quote before this record's first line break: slice the record whole and split it at once.
      let end;
      if (nl === -1) {
        end = N;
      } else {
        end = nl > pos && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
      }
      const rec = text.slice(pos, end);
      pos = nl === -1 ? N : nl + 1;
      if (nl !== -1) line += 1;
      if (rec.indexOf('\r') === -1) {
        fields = rec.split(',');
      } else {
        fields = rec.split(',');
        for (let i = 0; i < fields.length; i += 1) {
          const f = fields[i];
          if (f.indexOf('\r') !== -1) {
            const parts = f.split('\r');
            fields[i] = parts.join('');
            for (let k = 1; k < parts.length; k += 1) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
          }
        }
      }
      // A line that held only stray CRs is left with no characters: no record (its errors stay).
      if (fields.length === 1 && fields[0] === '') continue;
    } else {
      // The record holds a quote: read it field by field.
      fields = [];
      let quoted = false;
      let ended = 0;
      do {
        if (text.charCodeAt(pos) === 34) {
          quoted = true;
          const open = pos;
          const openLine = line;
          pos += 1;
          let value = '';
          let closed = false;
          while (true) {
            const qi = text.indexOf('"', pos);
            if (qi === -1) {
              // The quote never closes: it is a literal character, and the text after it is read
              // again as unquoted.
              pos = open + 1;
              line = openLine;
              errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
              readUnquoted('"');
              value = rqValue;
              ended = rqEnded;
              closed = false;
              break;
            }
            if (text.charCodeAt(qi + 1) === 34) {
              value += convertChunk(text.slice(pos, qi));
              value += '"';
              pos = qi + 2;
              continue;
            }
            value += convertChunk(text.slice(pos, qi));
            pos = qi + 1;
            closed = true;
            break;
          }
          if (closed) {
            if (pos >= N) {
              fields.push(value);
              ended = 2;
            } else {
              const c = text.charCodeAt(pos);
              if (c === 44) {
                pos += 1;
                fields.push(value);
                ended = 0;
              } else if (c === 10) {
                pos += 1;
                line += 1;
                fields.push(value);
                ended = 1;
              } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
                pos += 2;
                line += 1;
                fields.push(value);
                ended = 1;
              } else {
                // What follows the closing quote is appended as it stands, up to the next comma
                // or line break.
                readUnquoted(value);
                if (rqAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
                fields.push(rqValue);
                ended = rqEnded;
              }
            }
          } else {
            fields.push(value);
          }
        } else {
          quoted = false;
          readUnquoted('');
          fields.push(rqValue);
          ended = rqEnded;
        }
      } while (ended === 0);
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

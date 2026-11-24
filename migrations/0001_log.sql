-- The hub's only table. Append-only: history and rollback come from the rows.
-- The server only ever INSERTs. The triggers below make UPDATE and DELETE
-- fail at the database too, so a bug or a hand-typed query can't rewrite history.
-- A revert is a new row with op = 'revert' that names the row it undoes.
CREATE TABLE log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,                      -- ISO 8601 UTC, set by the server
  project TEXT NOT NULL,                      -- caller: finance, duet (seed for seed rows)
  path    TEXT NOT NULL,                      -- e.g. /shared/bills.md
  op      TEXT NOT NULL CHECK (op IN ('append', 'write', 'revert')),
  content TEXT NOT NULL,                      -- one line for append
  reason  TEXT NOT NULL,
  reverts INTEGER REFERENCES log(id)          -- set only when op = 'revert'
);

CREATE INDEX log_path ON log (path, id);
CREATE INDEX log_ts ON log (ts);

CREATE TRIGGER log_no_update BEFORE UPDATE ON log
BEGIN
  SELECT RAISE(ABORT, 'log is append-only');
END;

CREATE TRIGGER log_no_delete BEFORE DELETE ON log
BEGIN
  SELECT RAISE(ABORT, 'log is append-only');
END;

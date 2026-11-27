-- Comptes joueurs. Unicité du pseudo sans tenir compte de la casse (« Bob » = « bob »).
CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      text        NOT NULL CHECK (char_length(username) BETWEEN 3 AND 16),
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));

-- Sessions de connexion. On ne stocke que le HASH du jeton : une fuite de la base
-- ne permet pas d'usurper une session.
CREATE TABLE sessions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash bytea       NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Une course terminée.
CREATE TABLE races (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_code   text        NOT NULL,
  track_id    text        NOT NULL,
  laps        smallint    NOT NULL CHECK (laps > 0),
  started_at  timestamptz NOT NULL,
  finished_at timestamptz NOT NULL CHECK (finished_at >= started_at)
);
CREATE INDEX races_finished_at_idx ON races (finished_at DESC);

-- Classement d'une course. user_id est NULL pour un invité (ou un compte supprimé).
CREATE TABLE race_results (
  race_id      bigint   NOT NULL REFERENCES races (id) ON DELETE CASCADE,
  rank         smallint NOT NULL CHECK (rank > 0),
  user_id      bigint   REFERENCES users (id) ON DELETE SET NULL,
  display_name text     NOT NULL,
  -- NULL = n'a pas fini (DNF).
  time_ms      integer  CHECK (time_ms > 0),
  PRIMARY KEY (race_id, rank)
);
CREATE INDEX race_results_user_id_idx ON race_results (user_id) WHERE user_id IS NOT NULL;
-- Un compte n'apparaît qu'une fois par course.
CREATE UNIQUE INDEX race_results_race_user_key ON race_results (race_id, user_id)
  WHERE user_id IS NOT NULL;

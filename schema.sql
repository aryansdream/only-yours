CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL,pub TEXT NOT NULL,code TEXT UNIQUE NOT NULL,partner TEXT,epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid TEXT NOT NULL,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS queue(id TEXT PRIMARY KEY,sender TEXT NOT NULL,recipient TEXT NOT NULL,epoch INTEGER NOT NULL,payload TEXT NOT NULL,expires BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS queue_recipient ON queue(recipient);
CREATE TABLE IF NOT EXISTS signals(id TEXT PRIMARY KEY,sender TEXT NOT NULL,recipient TEXT NOT NULL,payload TEXT NOT NULL,expires BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS signals_recipient ON signals(recipient);
CREATE OR REPLACE FUNCTION oy_pair(me TEXT, pairing_code TEXT, a_code TEXT,b_code TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE other TEXT; current_partner TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(7152191);
 SELECT partner INTO current_partner FROM users WHERE id=me FOR UPDATE;
 IF current_partner IS NOT NULL THEN RAISE EXCEPTION 'Already paired'; END IF;
 SELECT id INTO other FROM users WHERE code=pairing_code AND partner IS NULL AND id<>me FOR UPDATE;
 IF other IS NULL THEN RAISE EXCEPTION 'Invalid pairing code'; END IF;
 UPDATE users SET partner=other,epoch=epoch+1,code=a_code WHERE id=me;
 UPDATE users SET partner=me,epoch=epoch+1,code=b_code WHERE id=other;
 RETURN other;
END $$;
CREATE OR REPLACE FUNCTION oy_unpair(me TEXT,other TEXT,a_code TEXT,b_code TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(7152191);
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=me AND partner=other) THEN RAISE EXCEPTION 'Pairing changed'; END IF;
 DELETE FROM queue WHERE sender IN(me,other) OR recipient IN(me,other);
 DELETE FROM signals WHERE sender IN(me,other) OR recipient IN(me,other);
 UPDATE users SET partner=NULL,epoch=epoch+1,code=a_code WHERE id=me;
 UPDATE users SET partner=NULL,epoch=epoch+1,code=b_code WHERE id=other;
 RETURN true;
END $$;

CREATE TABLE IF NOT EXISTS push_devices(installation TEXT PRIMARY KEY,uid TEXT NOT NULL,token TEXT NOT NULL,session_token TEXT NOT NULL,updated BIGINT NOT NULL); CREATE INDEX IF NOT EXISTS push_devices_uid ON push_devices(uid); CREATE TABLE IF NOT EXISTS push_events(id TEXT PRIMARY KEY,sender TEXT NOT NULL,expires BIGINT NOT NULL);

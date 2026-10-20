-- Runs once, when the volume is first created.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE DATABASE hostly_test OWNER hostly;
\connect hostly_test
CREATE EXTENSION IF NOT EXISTS btree_gist;

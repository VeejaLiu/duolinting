-- Return to one current course record. Preserve the visibility that the release
-- pointer previously provided even when editing had changed status to draft.
-- Personal subtitle work, review assignments and subtitle audit history stay intact.
update exercises
set status = 'published'
where published_release_id is not null and status in ('draft', 'proofread');

-- Historical release tables are left in place, but runtime code no longer uses them.
-- Keep applied migrations immutable and avoid deleting existing audit data.
update exercises set published_release_id = null where published_release_id is not null;

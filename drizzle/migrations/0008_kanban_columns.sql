-- kan-1: Add backlog and review as valid statuses; migrate existing todo → backlog
-- Run with: navi db migrate  (do NOT run manually during review)
UPDATE tasks SET status = 'backlog' WHERE status = 'todo';

INSERT INTO crew_events(title,description,location,starts_at,capacity,created_by)
SELECT 'Kinetic Crew Jam Session','Weekly choreography practice. Bring your energy, water and best moves.','Dance Studio','2026-11-02 16:00:00+05:30',40,'system'
WHERE NOT EXISTS (SELECT 1 FROM crew_events);
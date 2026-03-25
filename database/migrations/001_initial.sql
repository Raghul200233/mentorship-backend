-- Initial migration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Run the schema.sql file
\i schema.sql

-- Insert sample data for testing
INSERT INTO users (id, email, name, role) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'mentor@example.com', 'Dr. Smith', 'mentor'),
    ('22222222-2222-2222-2222-222222222222', 'student@example.com', 'Alex Johnson', 'student');

-- Insert a sample session
INSERT INTO sessions (id, mentor_id, status) VALUES 
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'waiting');